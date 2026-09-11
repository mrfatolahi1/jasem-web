import datetime as dt
import os
from dataclasses import asdict

from jasem.application.app import previous_window, resolve_window
from jasem.application.parsing import SpendingParser, TaskParser, TimeEntryParser
from jasem.application.reports import build_report, build_spending_report
from jasem.domain.spending import Spending
from jasem.domain.task import PRIORITY_RANK, Task
from jasem.domain.time_entry import TimeEntry
from jasem.infrastructure.providers import get_provider
from jasem.infrastructure.storage import SpendingStore, TaskStore, TimeLogStore, task_lists
from jasem.shared.calendar_view import CalendarView
from jasem.shared.config import Config
from jasem.shared.console import Console
from jasem.shared.dates import DateResolver
from jasem.shared.amounts import format_amount, parse_amount
from jasem.shared.durations import format_minutes, parse_minutes


class WebService:
    """Thin adapter around jasem's domain, parsers, stores, and reports."""

    def __init__(self):
        self.config = Config()
        self.calendar = CalendarView.from_config(self.config)
        self.dates = DateResolver(self.calendar)
        self.console = Console()
        self.list_name = task_lists.normalize(self.config.list_name) or ""
        self.tasks = self._task_store(self.list_name)
        self.timelog = TimeLogStore(self.config.track_file)
        self.spending_store = SpendingStore(self.config.spend_file)

    def _task_store(self, name):
        return TaskStore(task_lists.path_for(self.config.task_file, name), name)

    def _task_parser(self):
        return TaskParser(get_provider, self.config, self.dates, self.console)

    def _time_parser(self):
        return TimeEntryParser(get_provider, self.config, self.dates, self.console)

    def _spending_parser(self):
        return SpendingParser(get_provider, self.config, self.dates, self.console)

    @staticmethod
    def _task_json(task):
        value = asdict(task)
        value["tags"] = task.tag_list()
        return value

    @staticmethod
    def _time_json(entry):
        value = asdict(entry)
        value["minutes"] = entry.minutes()
        return value

    @staticmethod
    def _spending_json(record):
        value = asdict(record)
        value["amount"] = record.amount()
        return value

    def task_list(self, view="open", tags=None, list_name=None):
        store = self._task_store(task_lists.normalize(list_name) or "") if list_name is not None else self.tasks
        tasks = store.load()
        today = dt.date.today().isoformat()
        week = (dt.date.today() + dt.timedelta(days=7)).isoformat()
        predicates = {
            "open": lambda t: not t.done,
            "today": lambda t: not t.done and t.deadline == today,
            "week": lambda t: not t.done and t.deadline and today <= t.deadline <= week,
            "overdue": lambda t: not t.done and t.deadline and t.deadline < today,
            "all": lambda t: True,
        }
        selected = [task for task in tasks if predicates.get(view, predicates["open"])(task)]
        filters = [str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()]
        if filters:
            selected = [task for task in selected if all(tag in task.tag_list() for tag in filters)]
        selected.sort(key=lambda task: task.sort_key())
        return selected

    def add_task(self, text, list_name=None):
        store = self._task_store(task_lists.normalize(list_name) or "") if list_name is not None else self.tasks
        tasks = store.load()
        task = Task(**self._task_parser().parse(text, dt.date.today()))
        task.id = store.next_id(tasks)
        tasks.append(task)
        store.save(tasks)
        return task

    def update_task(self, task_id, payload):
        tasks = self.tasks.load()
        task = next((item for item in tasks if item.id == task_id), None)
        if task is None:
            raise KeyError("task not found")
        if "done" in payload:
            task.done = bool(payload["done"])
        if "title" in payload:
            task.title = str(payload["title"]).strip()
        if "priority" in payload and payload["priority"] in PRIORITY_RANK:
            task.priority = payload["priority"]
        if "tags" in payload:
            tags = payload["tags"] if isinstance(payload["tags"], list) else str(payload["tags"]).replace(",", " ").split()
            task.tags = ", ".join(str(tag).strip() for tag in tags if str(tag).strip())
        if "deadline" in payload:
            deadline = str(payload["deadline"] or "").strip()
            task.deadline = self.dates.resolve(deadline, dt.date.today()) if deadline else ""
        self.tasks.save(tasks)
        return task

    def delete_task(self, task_id):
        tasks = self.tasks.load()
        kept = [task for task in tasks if task.id != task_id]
        if len(kept) == len(tasks):
            raise KeyError("task not found")
        self.tasks.save(kept)

    def time_list(self, period="all", tag=None):
        entries = self.timelog.load()
        start, end, _, tag_filter = resolve_window([e.date for e in entries], [period] if period else [], dt.date.today(), "all")
        tag_filter = tag or tag_filter
        selected = [e for e in entries if start <= e.date <= end and (not tag_filter or e.tag.lower() == tag_filter.lower())]
        return selected

    def add_time(self, text):
        fields = self._time_parser().parse(text, dt.date.today())
        fields.pop("minutes", None)
        entries = self.timelog.load()
        entry = TimeEntry(**fields)
        entry.id = self.timelog.next_id(entries)
        entries.append(entry)
        self.timelog.save(entries)
        return entry

    def spending_list(self, period="all", tag=None):
        records = self.spending_store.load()
        start, end, _, tag_filter = resolve_window([r.date for r in records], [period] if period else [], dt.date.today(), "all")
        tag_filter = tag or tag_filter
        return [r for r in records if start <= r.date <= end and (not tag_filter or r.tag.lower() == tag_filter.lower())]

    def add_spending(self, text):
        fields = self._spending_parser().parse(text, dt.date.today())
        fields.pop("amount", None)
        records = self.spending_store.load()
        record = Spending(**fields)
        record.id = self.spending_store.next_id(records)
        records.append(record)
        self.spending_store.save(records)
        return record

    def dashboard(self):
        today = dt.date.today()
        tasks = self.task_list("open")
        entries = self.timelog.load()
        records = self.spending_store.load()
        focus = [task for task in tasks if task.deadline and task.deadline <= today.isoformat()][:7]
        if len(focus) < 7:
            focus += [task for task in tasks if task not in focus][:7-len(focus)]
        days = [(today - dt.timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]
        return {
            "date": today.isoformat(),
            "tasks": [self._task_json(task) for task in focus],
            "open_count": len(tasks),
            "tracked_today": sum(entry.minutes() for entry in entries if entry.date == today.isoformat()),
            "spent_today": sum(record.amount() for record in records if record.date == today.isoformat()),
            "time_trend": [sum(e.minutes() for e in entries if e.date == day) for day in days],
            "spend_trend": [sum(r.amount() for r in records if r.date == day) for day in days],
        }

    def reports(self, kind, period="week", tag=None):
        today = dt.date.today()
        if kind == "time":
            entries = self.timelog.load()
            start, end, label, tag_filter = resolve_window([e.date for e in entries], [period], today, "week")
            tag_filter = tag or tag_filter
            selected = [e for e in entries if start <= e.date <= end and (not tag_filter or e.tag.lower() == tag_filter.lower())]
            prev_start, prev_end = previous_window(start, end)
            previous = [e for e in entries if prev_start <= e.date <= prev_end and (not tag_filter or e.tag.lower() == tag_filter.lower())]
            report = build_report(selected, start, end, end, label, tag_filter, self.calendar, sum(e.minutes() for e in previous))
            data = asdict(report)
            data["entries"] = [self._time_json(e) for e in selected]
            return data
        records = self.spending_store.load()
        start, end, label, tag_filter = resolve_window([r.date for r in records], [period], today, "week")
        tag_filter = tag or tag_filter
        selected = [r for r in records if start <= r.date <= end and (not tag_filter or r.tag.lower() == tag_filter.lower())]
        prev_start, prev_end = previous_window(start, end)
        previous = [r for r in records if prev_start <= r.date <= prev_end and (not tag_filter or r.tag.lower() == tag_filter.lower())]
        report = build_spending_report(selected, start, end, end, label, tag_filter, self.calendar, sum(r.amount() for r in previous))
        data = asdict(report)
        data["records"] = [self._spending_json(r) for r in selected]
        return data

