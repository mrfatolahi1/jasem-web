"""Adapter exposing every jasem CLI capability over HTTP.

One :class:`WebService` is built per request. It owns no state of its own: it
constructs jasem's config, calendar, stores, parsers, and report builders and
delegates to them, so the web app and the CLI always read and write the same
Markdown files with the same rules.
"""

import datetime as dt
import io
import re
from dataclasses import asdict

from jasem.application.app import (
    CLEAR_WORDS,
    FIELD_ALIASES,
    PERIODS,
    SPEND_FIELD_ALIASES,
    TIME_FIELD_ALIASES,
    previous_window,
    resolve_field,
    resolve_spend_field,
    resolve_time_field,
    resolve_window,
)
from jasem.application.parsing import SpendingParser, TaskParser, TimeEntryParser
from jasem.application.reports import build_report, build_spending_report
from jasem.domain.spending import Spending
from jasem.domain.task import PRIORITY_RANK, Task
from jasem.domain.time_entry import TimeEntry
from jasem.infrastructure.providers import get_provider
from jasem.infrastructure.storage import SpendingStore, TaskStore, TimeLogStore, task_lists
from jasem.interface.help import render_help
from jasem.interface.logo import DESCRIPTION, REPO_URL, WIKI_URL, render_version, render_welcome
from jasem.shared.amounts import format_amount, parse_amount
from jasem.shared.calendar_view import CalendarView
from jasem.shared.charts import sparkline
from jasem.shared.config import DEFAULT_MODELS, Config
from jasem.shared.console import Console
from jasem.shared.dates import DateResolver
from jasem.shared.durations import format_minutes, parse_minutes

FOCUS_LIMIT = 7
"""Most tasks the dashboard focus list returns, matching jasem's home screen."""

PROVIDERS = ("ollama", "openai", "anthropic")
"""AI backends ``JASEM_PROVIDER`` accepts."""

ENVIRONMENT_VARIABLES = (
    "JASEM_DIR", "JASEM_FILE", "JASEM_LIST", "JASEM_TRACK_FILE", "JASEM_SPEND_FILE",
    "JASEM_PROVIDER", "JASEM_MODEL", "JASEM_API_KEY", "JASEM_API_BASE",
    "JASEM_OPENAI_API_BASE", "OPENAI_BASE_URL", "OLLAMA_HOST",
    "JASEM_JALALI", "JASEM_ACCENT", "NO_COLOR", "FORCE_COLOR",
)
"""Every variable jasem reads, as listed on its help screen."""

VIEWS = {
    "open": "list", "list": "list", "ls": "list",
    "today": "today", "week": "week", "overdue": "overdue", "all": "all",
}
"""Task views the API accepts, mapped to jasem's own view names."""

TASK_EXTRA_FIELDS = {"done": "done", "title": "title"}
"""Task fields the API edits that ``jasem todo set`` has no syntax for."""

TIME_EXTRA_FIELDS = {"time_text": "time", "minutes": "time"}
"""Canonical time-entry keys accepted alongside jasem's own field aliases."""

SPEND_EXTRA_FIELDS = {"amount_text": "amount"}
"""Canonical spending keys accepted alongside jasem's own field aliases."""

COMMAND_REFERENCE = (
    ("todo", "Tasks", (
        ('jasem todo "<text>"', "add a task; deadline, priority & tags auto-detected",
         "POST", "/api/tasks/"),
        ('jasem todo add "<text>"', "force-add text that starts with a command word",
         "POST", "/api/tasks/"),
        ("jasem todo  ·  jasem todo list [category...]", "open tasks, soonest deadline first",
         "GET", "/api/tasks/?view=open&tag=<category>"),
        ("jasem todo today", "due today", "GET", "/api/tasks/?view=today"),
        ("jasem todo week", "due within the next 7 days", "GET", "/api/tasks/?view=week"),
        ("jasem todo overdue", "past deadline, not done", "GET", "/api/tasks/?view=overdue"),
        ("jasem todo all", "everything, including completed", "GET", "/api/tasks/?view=all"),
        ("jasem todo tags", "categories in use, with counts", "GET", "/api/tasks/tags/"),
        ('jasem todo find "..."', "search task titles & tags", "GET", "/api/tasks/find/?q=<text>"),
        ("jasem todo done <id>...", "mark task(s) complete", "POST", "/api/tasks/done/"),
        ("jasem todo rm <id>", "delete one task", "DELETE", "/api/tasks/<id>/"),
        ("jasem todo rm <id>...", "delete task(s) permanently", "POST", "/api/tasks/delete/"),
        ("jasem todo set <id> <field> <value>", "edit priority, deadline, or category",
         "PATCH", "/api/tasks/<id>/"),
    )),
    ("lists", "Task lists", (
        ("jasem todo @<list> ...", "run any task call against a named list",
         "*", "/api/tasks/...?list=<name>"),
        ("jasem todo lists", "every list, with open counts", "GET", "/api/tasks/lists/"),
        ("jasem todo move <id>... <list>", "move task(s) to another list",
         "POST", "/api/tasks/move/"),
    )),
    ("track", "Time", (
        ('jasem track "<text>"', "log time; duration, date & tag auto-detected",
         "POST", "/api/time/"),
        ("jasem track list [period] [tag]", "logged entries",
         "GET", "/api/time/?period=all&tag=<tag>"),
        ("jasem track tags", "categories in use, with counts", "GET", "/api/time/tags/"),
        ("jasem track report [period] [tag]", "totals, by-tag, timeline & top activities",
         "GET", "/api/time/report/?period=week&tag=<tag>"),
        ("jasem track rm <id>", "delete one entry", "DELETE", "/api/time/<id>/"),
        ("jasem track rm <id>...", "delete tracked entries", "POST", "/api/time/delete/"),
        ("jasem track set <id> <field> <value>", "edit time, work, date, or tag",
         "PATCH", "/api/time/<id>/"),
    )),
    ("acc", "Spending", (
        ('jasem acc "<text>"', "record spending; amount, date & tag auto-detected",
         "POST", "/api/spending/"),
        ("jasem acc list [period] [tag]", "recorded spending",
         "GET", "/api/spending/?period=all&tag=<tag>"),
        ("jasem acc tags", "categories in use, with counts", "GET", "/api/spending/tags/"),
        ("jasem acc report [period] [tag]", "totals, by-tag, timeline & top spends",
         "GET", "/api/spending/report/?period=week&tag=<tag>"),
        ("jasem acc rm <id>", "delete one record", "DELETE", "/api/spending/<id>/"),
        ("jasem acc rm <id>...", "delete spending record(s)", "POST", "/api/spending/delete/"),
        ("jasem acc set <id> <field> <value>", "edit amount, title, description, date, or tag",
         "PATCH", "/api/spending/<id>/"),
    )),
    ("more", "More", (
        ("jasem  (no args)", "focus tasks and today's activity", "GET", "/api/dashboard/"),
        ("jasem --help", "the command reference", "GET", "/api/help/"),
        ("jasem --version", "version and project links", "GET", "/api/meta/"),
        ("jasem help  (files & config)", "provider, model, files, calendar, accent",
         "GET", "/api/config/"),
    )),
)
"""Every CLI command, paired with the API call that performs it."""


class ApiError(Exception):
    """A request the CLI would have rejected, carrying its HTTP status."""

    def __init__(self, message, status=400):
        """Store the user-facing message and the status to answer with."""
        super().__init__(message)
        self.message = message
        self.status = status


class CaptureConsole(Console):
    """Console that collects jasem's output instead of writing to a terminal."""

    def __init__(self):
        """Write to an in-memory stream with color disabled."""
        super().__init__(stream=io.StringIO(), env={"NO_COLOR": "1"})
        self.warnings = []

    def warn(self, text):
        """Record a warning that the CLI would have printed to stderr."""
        self.warnings.append(text.strip())


class WebService:
    """Thin adapter around jasem's domain, parsers, stores, and reports."""

    def __init__(self):
        self.config = Config()
        self.calendar = CalendarView.from_config(self.config)
        self.dates = DateResolver(self.calendar)
        self.console = CaptureConsole()
        self.list_name = task_lists.normalize(self.config.list_name) or ""
        self.tasks = self._task_store(self.list_name)
        self.timelog = TimeLogStore(self.config.track_file)
        self.spending_store = SpendingStore(self.config.spend_file)

    @property
    def warnings(self):
        """Return the warnings jasem raised while handling this request."""
        return list(self.console.warnings)

    # ------------------------------------------------------------------ setup

    def _task_store(self, name):
        return TaskStore(task_lists.path_for(self.config.task_file, name), name)

    @staticmethod
    def _normal_list(name):
        normalized = task_lists.normalize(name)
        if normalized is None:
            raise ApiError(f"invalid list name: {name!r}; use letters, digits, - and _")
        return normalized

    def _store_for(self, list_name, must_exist=False):
        """Return the task store for ``list_name``, defaulting to the active list.

        Mirrors jasem's refusal to operate on a named list whose file does not
        exist yet, so a typo is reported rather than answered with an empty view.
        """
        if list_name is None:
            name, store = self.list_name, self.tasks
        else:
            name = self._normal_list(list_name)
            store = self._task_store(name)
        if must_exist and name and not store.exists():
            raise ApiError(f"no list named {name!r}; a list is created by its first task", 404)
        return store

    def _task_parser(self):
        return TaskParser(get_provider, self.config, self.dates, self.console)

    def _time_parser(self):
        return TimeEntryParser(get_provider, self.config, self.dates, self.console)

    def _spending_parser(self):
        return SpendingParser(get_provider, self.config, self.dates, self.console)

    # ------------------------------------------------------------ serializing

    def _task_json(self, task):
        value = asdict(task)
        value["tags"] = task.tag_list()
        value["tags_text"] = task.tags
        value["deadline_display"] = self.calendar.format_iso(task.deadline)
        value["created_display"] = self.calendar.format_iso(task.created)
        return value

    def _time_json(self, entry):
        value = asdict(entry)
        minutes = entry.minutes()
        value["minutes"] = minutes
        value["time_display"] = format_minutes(minutes) if minutes > 0 else entry.time_text
        value["date_display"] = self.calendar.format_iso(entry.date)
        return value

    def _spending_json(self, record):
        value = asdict(record)
        amount = record.amount()
        value["amount"] = amount
        value["amount_display"] = format_amount(amount) if amount > 0 else record.amount_text
        value["date_display"] = self.calendar.format_iso(record.date)
        return value

    # ------------------------------------------------------------- validating

    @staticmethod
    def _view(name):
        """Return jasem's view name for ``name``, rejecting anything else."""
        key = str(name or "open").strip().lower()
        if key not in VIEWS:
            raise ApiError(f"unknown view: {name!r}; use " + " · ".join(sorted(VIEWS)))
        return VIEWS[key]

    @staticmethod
    def _period(value, default):
        """Return a validated period word, defaulting when none was given."""
        period = str(value or default).strip().lower()
        if period not in PERIODS:
            raise ApiError(f"unknown period: {value!r}; use " + " · ".join(PERIODS))
        return period

    @staticmethod
    def _ids(values):
        """Return the numeric ids in ``values``, as jasem's commands parse them."""
        identifiers = set()
        for value in values or []:
            try:
                identifiers.add(int(value))
            except (TypeError, ValueError):
                continue
        if not identifiers:
            raise ApiError("at least one numeric id is required")
        return identifiers

    @staticmethod
    def _words(value):
        """Split a tag/category value written as a list or a free-text string."""
        if isinstance(value, (list, tuple)):
            parts = [str(item).strip() for item in value]
        else:
            parts = re.split(r"[,\s]+", str(value or "").strip())
        return [part for part in parts if part]

    # ------------------------------------------------------------------ tasks

    def task_list(self, view="open", tags=None, list_name=None):
        store = self._store_for(list_name, must_exist=True)
        name = self._view(view)
        today = dt.date.today().isoformat()
        week = (dt.date.today() + dt.timedelta(days=7)).isoformat()
        predicates = {
            "list": lambda task: not task.done,
            "today": lambda task: not task.done and task.deadline == today,
            "week": lambda task: not task.done and task.deadline and today <= task.deadline <= week,
            "overdue": lambda task: not task.done and task.deadline and task.deadline < today,
            "all": lambda task: True,
        }
        selected = [task for task in store.load() if predicates[name](task)]
        filters = [str(tag).strip().lower() for tag in (tags or []) if str(tag).strip()]
        if filters:
            selected = [task for task in selected
                        if all(tag in task.tag_list() for tag in filters)]
        selected.sort(key=lambda task: task.sort_key())
        return selected

    def add_task(self, text, list_name=None):
        store = self._store_for(list_name)
        fresh = bool(store.name) and not store.exists()
        tasks = store.load()
        task = Task(**self._task_parser().parse(text, dt.date.today()))
        task.id = store.next_id(tasks)
        tasks.append(task)
        store.save(tasks)
        return task, fresh

    def update_task(self, task_id, payload, list_name=None):
        store = self._store_for(list_name, must_exist=True)
        tasks = store.load()
        task = next((item for item in tasks if item.id == task_id), None)
        if task is None:
            raise ApiError(f"no task with id #{task_id}", 404)
        if not payload:
            raise ApiError("at least one field is required")
        for key, value in payload.items():
            field = resolve_field(key) or TASK_EXTRA_FIELDS.get(str(key).lower())
            if not field:
                raise ApiError(f"unknown field: {key}; "
                               "fields: priority · deadline · category · title · done")
            self._apply_task_field(task, field, value)
        store.save(tasks)
        return task

    def _apply_task_field(self, task, field, value):
        """Apply one edit to ``task``, using jasem's own rules for each field."""
        if field == "done":
            task.done = bool(value)
            return
        if field == "title":
            title = str(value or "").strip()
            if not title:
                raise ApiError("title cannot be empty")
            task.title = title
            return
        if field == "priority":
            priority = str(value or "").strip().lower()
            if priority not in PRIORITY_RANK:
                raise ApiError("priority must be one of: " + ", ".join(PRIORITY_RANK))
            task.priority = priority
            return
        if field == "deadline":
            text = str(value or "").strip()
            if text.lower() in CLEAR_WORDS:
                task.deadline = ""
                return
            resolved = self.dates.resolve(text, dt.date.today())
            if not resolved:
                raise ApiError(f"could not understand deadline: {text!r}; "
                               "try: tomorrow · next friday · in 3 days · 2026-07-01 · none")
            task.deadline = resolved
            return
        if not isinstance(value, (list, tuple)) and str(value or "").strip().lower() in CLEAR_WORDS:
            task.tags = ""
            return
        task.tags = ", ".join(self._words(value))

    def complete_tasks(self, ids, done=True, list_name=None):
        """Mark tasks complete (or reopen them), as ``jasem todo done`` does."""
        store = self._store_for(list_name, must_exist=True)
        tasks = store.load()
        identifiers = self._ids(ids)
        changed = [task for task in tasks if task.id in identifiers]
        if not changed:
            raise ApiError("no matching id(s)", 404)
        for task in changed:
            task.done = bool(done)
        store.save(tasks)
        return changed

    def delete_tasks(self, ids, list_name=None):
        """Delete every task whose id is listed, as ``jasem todo rm`` does."""
        store = self._store_for(list_name, must_exist=True)
        tasks = store.load()
        identifiers = self._ids(ids)
        kept = [task for task in tasks if task.id not in identifiers]
        removed = len(tasks) - len(kept)
        if not removed:
            raise ApiError("no matching id(s)", 404)
        store.save(kept)
        return removed

    def delete_task(self, task_id, list_name=None):
        self.delete_tasks([task_id], list_name)

    def task_lists(self):
        result = []
        for name in [""] + task_lists.discover(self.config.task_file):
            store = self._task_store(name)
            tasks = store.load()
            result.append({
                "name": name,
                "label": task_lists.label(name),
                "active": name == self.list_name,
                "exists": store.exists(),
                "open_count": sum(1 for task in tasks if not task.done),
                "total_count": len(tasks),
            })
        return result

    def task_tags(self, list_name=None, view="open"):
        """Count categories in use, over open tasks by default as the CLI does."""
        counts = {}
        for task in self.task_list(view, list_name=list_name):
            for tag in task.tag_list():
                counts[tag] = counts.get(tag, 0) + 1
        return self._tag_counts(counts)

    @staticmethod
    def _tag_counts(counts):
        return [{"tag": tag, "count": count} for tag, count
                in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]

    def find_tasks(self, query, list_name=None):
        needle = str(query or "").strip().lower()
        if not needle:
            raise ApiError("q is required")
        return [task for task in self.task_list("all", list_name=list_name)
                if needle in task.title.lower() or needle in task.tags.lower()]

    def move_tasks(self, ids, target, source=None):
        target_name = self._normal_list(target)
        source_store = self._store_for(source, must_exist=True)
        if source_store.name == target_name:
            raise ApiError(f"already in {task_lists.label(target_name)}")
        target_store = self._task_store(target_name)
        identifiers = self._ids(ids)
        source_tasks = source_store.load()
        moving = [task for task in source_tasks if task.id in identifiers]
        if not moving:
            raise ApiError("no matching id(s)", 404)
        kept = [task for task in source_tasks if task.id not in identifiers]
        destination = target_store.load()
        for task in moving:
            task.id = target_store.next_id(destination)
            destination.append(task)
        source_store.save(kept)
        target_store.save(destination)
        return moving

    # ------------------------------------------------------------------- time

    def time_list(self, period="all", tag=None):
        entries = self.timelog.load()
        start, end, label, _ = resolve_window(
            [entry.date for entry in entries], [self._period(period, "all")],
            dt.date.today(), "all",
        )
        return self._in_window(entries, start, end, tag), label

    @staticmethod
    def _in_window(items, start, end, tag):
        """Return the items inside the window, optionally narrowed to one tag."""
        needle = str(tag).strip().lower() if tag else None
        return [item for item in items if start <= item.date <= end
                and (not needle or item.tag.lower() == needle)]

    def time_tags(self):
        counts = {}
        for entry in self.timelog.load():
            tag = entry.tag or "work"
            counts[tag] = counts.get(tag, 0) + 1
        return self._tag_counts(counts)

    def add_time(self, text):
        fields = self._time_parser().parse(text, dt.date.today())
        minutes = fields.pop("minutes", 0)
        entries = self.timelog.load()
        entry = TimeEntry(**fields)
        entry.id = self.timelog.next_id(entries)
        entries.append(entry)
        self.timelog.save(entries)
        if minutes == 0:
            self.console.warn(f"couldn't read a duration from {text!r}; "
                              "stored as-is, won't count toward totals")
        return entry

    def update_time(self, entry_id, payload):
        entries = self.timelog.load()
        entry = next((item for item in entries if item.id == entry_id), None)
        if entry is None:
            raise ApiError(f"no time entry with id #{entry_id}", 404)
        if not payload:
            raise ApiError("at least one field is required")
        for key, value in payload.items():
            field = resolve_time_field(key) or TIME_EXTRA_FIELDS.get(str(key).lower())
            if not field:
                raise ApiError(f"unknown field: {key}; fields: time · work · date · tag")
            self._apply_time_field(entry, field, value)
        self.timelog.save(entries)
        return entry

    def _apply_time_field(self, entry, field, value):
        """Apply one edit to ``entry``, using jasem's own rules for each field."""
        if field == "time":
            text = str(value or "").strip()
            minutes = parse_minutes(text)
            entry.time_text = format_minutes(minutes) if minutes > 0 else text
            if minutes <= 0:
                self.console.warn(f"couldn't read a duration from {text!r}; "
                                  "stored as-is, won't count toward totals")
            return
        if field == "work":
            entry.work = str(value or "").strip()
            return
        if field == "date":
            entry.date = self._resolve_date(value)
            return
        tag = str(value or "").strip()
        entry.tag = "work" if tag.lower() in CLEAR_WORDS else tag

    def _resolve_date(self, value):
        """Resolve a date phrase the way ``jasem set ... date`` does."""
        text = str(value or "").strip()
        resolved = self.dates.resolve(text, dt.date.today())
        if not resolved:
            raise ApiError(f"could not understand date: {text!r}; "
                           "try: today · yesterday · last friday · june 20 · 2026-07-01")
        return resolved

    def delete_time_entries(self, ids):
        entries = self.timelog.load()
        identifiers = self._ids(ids)
        kept = [entry for entry in entries if entry.id not in identifiers]
        removed = len(entries) - len(kept)
        if not removed:
            raise ApiError("no matching id(s)", 404)
        self.timelog.save(kept)
        return removed

    def delete_time(self, entry_id):
        self.delete_time_entries([entry_id])

    # --------------------------------------------------------------- spending

    def spending_list(self, period="all", tag=None):
        records = self.spending_store.load()
        start, end, label, _ = resolve_window(
            [record.date for record in records], [self._period(period, "all")],
            dt.date.today(), "all",
        )
        return self._in_window(records, start, end, tag), label

    def spending_tags(self):
        counts = {}
        for record in self.spending_store.load():
            tag = record.tag or "general"
            counts[tag] = counts.get(tag, 0) + 1
        return self._tag_counts(counts)

    def add_spending(self, text):
        fields = self._spending_parser().parse(text, dt.date.today())
        amount = fields.pop("amount", 0)
        records = self.spending_store.load()
        record = Spending(**fields)
        record.id = self.spending_store.next_id(records)
        records.append(record)
        self.spending_store.save(records)
        if amount == 0:
            self.console.warn(f"couldn't read an amount from {text!r}; "
                              "stored as-is, won't count toward totals")
        return record

    def update_spending(self, record_id, payload):
        records = self.spending_store.load()
        record = next((item for item in records if item.id == record_id), None)
        if record is None:
            raise ApiError(f"no spending record with id #{record_id}", 404)
        if not payload:
            raise ApiError("at least one field is required")
        for key, value in payload.items():
            field = resolve_spend_field(key) or SPEND_EXTRA_FIELDS.get(str(key).lower())
            if not field:
                raise ApiError(f"unknown field: {key}; "
                               "fields: amount · title · description · date · tag")
            self._apply_spending_field(record, field, value)
        self.spending_store.save(records)
        return record

    def _apply_spending_field(self, record, field, value):
        """Apply one edit to ``record``, using jasem's own rules for each field."""
        if field == "amount":
            text = str(value or "").strip()
            amount = parse_amount(text)
            record.amount_text = format_amount(amount) if amount > 0 else text
            if amount <= 0:
                self.console.warn(f"couldn't read an amount from {text!r}; "
                                  "stored as-is, won't count toward totals")
            return
        if field == "title":
            title = str(value or "").strip()
            if not title:
                raise ApiError("title cannot be empty")
            record.title = title
            return
        if field == "description":
            text = str(value or "").strip()
            record.description = "" if text.lower() in CLEAR_WORDS else text
            return
        if field == "date":
            record.date = self._resolve_date(value)
            return
        tag = str(value or "").strip()
        record.tag = "general" if tag.lower() in CLEAR_WORDS else tag

    def delete_spending_records(self, ids):
        records = self.spending_store.load()
        identifiers = self._ids(ids)
        kept = [record for record in records if record.id not in identifiers]
        removed = len(records) - len(kept)
        if not removed:
            raise ApiError("no matching id(s)", 404)
        self.spending_store.save(kept)
        return removed

    def delete_spending(self, record_id):
        self.delete_spending_records([record_id])

    # -------------------------------------------------------- home & reports

    def dashboard(self):
        today = dt.date.today()
        today_iso = today.isoformat()
        open_tasks = self.task_list("open")
        entries = self.timelog.load()
        records = self.spending_store.load()
        focus = self._focus(open_tasks, today_iso)
        days = [(today - dt.timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]
        time_trend = [sum(entry.minutes() for entry in entries if entry.date == day)
                      for day in days]
        spend_trend = [sum(record.amount() for record in records if record.date == day)
                       for day in days]
        tracked_today = sum(entry.minutes() for entry in entries if entry.date == today_iso)
        spent_today = sum(record.amount() for record in records if record.date == today_iso)
        return {
            "date": today_iso,
            "date_display": self.calendar.format_iso(today_iso),
            "weekday": today.strftime("%A"),
            "list": {"name": self.list_name, "label": task_lists.label(self.list_name)},
            "tasks": [self._task_json(task) for task in focus],
            "open_count": len(open_tasks),
            "hidden_count": max(len(open_tasks) - len(focus), 0),
            "tracked_today": tracked_today,
            "tracked_today_display": format_minutes(tracked_today),
            "spent_today": spent_today,
            "spent_today_display": format_amount(spent_today),
            "days": days,
            "time_trend": time_trend,
            "spend_trend": spend_trend,
            "time_sparkline": sparkline(time_trend),
            "spend_sparkline": sparkline(spend_trend),
        }

    @staticmethod
    def _focus(open_tasks, today):
        """Return the tasks needing attention now: overdue, due today, then soonest."""
        ordered = sorted(open_tasks, key=lambda task: task.sort_key())
        chosen = [task for task in ordered if task.deadline and task.deadline < today]
        chosen += [task for task in ordered if task.deadline == today and task not in chosen]
        for task in ordered:
            if len(chosen) >= FOCUS_LIMIT:
                break
            if task not in chosen:
                chosen.append(task)
        return chosen[:FOCUS_LIMIT]

    def reports(self, kind, period="week", tag=None):
        today = dt.date.today()
        window = [self._period(period, "week")]
        if kind == "time":
            entries = self.timelog.load()
            start, end, label, _ = resolve_window(
                [entry.date for entry in entries], window, today, "week")
            selected = self._in_window(entries, start, end, tag)
            prev_start, prev_end = previous_window(start, end)
            previous = self._in_window(entries, prev_start, prev_end, tag)
            report = build_report(selected, start, end, end, label, tag, self.calendar,
                                  sum(entry.minutes() for entry in previous))
            data = asdict(report)
            data["total_display"] = format_minutes(report.total_minutes)
            data["entries"] = [self._time_json(entry) for entry in selected]
            return data
        records = self.spending_store.load()
        start, end, label, _ = resolve_window(
            [record.date for record in records], window, today, "week")
        selected = self._in_window(records, start, end, tag)
        prev_start, prev_end = previous_window(start, end)
        previous = self._in_window(records, prev_start, prev_end, tag)
        report = build_spending_report(selected, start, end, end, label, tag, self.calendar,
                                       sum(record.amount() for record in previous))
        data = asdict(report)
        data["total_display"] = format_amount(report.total_amount)
        data["records"] = [self._spending_json(record) for record in selected]
        return data

    # ---------------------------------------------------- meta, help & config

    @staticmethod
    def version():
        """Return the installed jasem version, as ``jasem --version`` reports it."""
        try:
            from importlib.metadata import version as package_version
            return package_version("jasem")
        except Exception:
            from jasem import __version__ as fallback
            return fallback

    def meta(self):
        """Answer ``jasem --version`` and the no-args welcome screen."""
        version = self.version()
        return {
            "service": "jasem-web",
            "jasem_version": version,
            "description": DESCRIPTION,
            "repository": REPO_URL,
            "wiki": WIKI_URL,
            "version_text": render_version(self.console, version),
            "welcome_text": render_welcome(self.console, version),
        }

    def command_reference(self):
        """Answer ``jasem help``: the full command list, each mapped to its endpoint."""
        return {
            "text": render_help(self.console, self.config),
            "namespaces": [
                {
                    "name": name,
                    "title": title,
                    "commands": [
                        {"command": command, "summary": summary, "method": method, "path": path}
                        for command, summary, method, path in commands
                    ],
                }
                for name, title, commands in COMMAND_REFERENCE
            ],
            "views": sorted(VIEWS),
            "periods": list(PERIODS),
            "priorities": list(PRIORITY_RANK),
            "clear_words": sorted(word for word in CLEAR_WORDS if word),
            "fields": {
                "task": {field: sorted(aliases) for field, aliases in FIELD_ALIASES.items()},
                "time": {field: sorted(aliases) for field, aliases in TIME_FIELD_ALIASES.items()},
                "spending": {field: sorted(aliases)
                             for field, aliases in SPEND_FIELD_ALIASES.items()},
            },
        }

    def configuration(self):
        """Answer the ``FILES & CONFIG`` section of ``jasem help``.

        The API key itself is never returned — only whether one is configured.
        """
        return {
            "provider": self.config.provider,
            "providers": list(PROVIDERS),
            "model": self.config.model,
            "default_models": dict(DEFAULT_MODELS),
            "api_key_set": bool(self.config.api_key),
            "api_base": self.config.api_base,
            "openai_api_base": self.config.openai_api_base,
            "ollama_host": self.config.ollama_host,
            "directory": self.config.directory,
            "task_file": task_lists.path_for(self.config.task_file, self.list_name),
            "default_task_file": self.config.task_file,
            "track_file": self.config.track_file,
            "spend_file": self.config.spend_file,
            "list": {"name": self.list_name, "label": task_lists.label(self.list_name)},
            "calendar": "jalali" if self.config.jalali else "gregorian",
            "accent": self.config.accent,
            "environment": list(ENVIRONMENT_VARIABLES),
        }
