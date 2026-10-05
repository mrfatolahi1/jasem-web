"""Adapter exposing every jasem CLI capability over HTTP.

One :class:`WebService` is built per request. It owns no state of its own: it
constructs jasem's config, calendar, stores, date resolver, and report builders
and delegates to them, so the web app and the CLI always read and write the same
Markdown files with the same rules.

jasem 2 never reads fields out of free text: the text is stored as typed and
every other field is set with an option (``-d``, ``-p``, ``-t``, ``-n``, …). The
API mirrors that — a JSON key is one of the command's option names without its
dashes, and a value jasem cannot read is refused with nothing saved.
"""

import datetime as dt
import io
import re
from dataclasses import asdict

from jasem.application.app import (
    ACC_ADD_USAGE,
    ACC_EDIT_USAGE,
    CLEAR_WORDS,
    PERIODS,
    PRIORITY_ALIASES,
    SPEND_EDIT_FLAGS,
    SPEND_FLAGS,
    TASK_EDIT_FLAGS,
    TASK_FLAGS,
    TIME_EDIT_FLAGS,
    TIME_FLAGS,
    TODO_ADD_USAGE,
    TODO_EDIT_USAGE,
    TRACK_ADD_USAGE,
    TRACK_EDIT_USAGE,
    VIEW_NAMES,
    previous_window,
    resolve_window,
)
from jasem.application.reports import build_report, build_spending_report
from jasem.domain.spending import Spending
from jasem.domain.task import PRIORITY_RANK, Task
from jasem.domain.time_entry import TimeEntry
from jasem.infrastructure.storage import SpendingStore, TaskStore, TimeLogStore, task_lists
from jasem.interface.help import render_help
from jasem.interface.logo import DESCRIPTION, REPO_URL, WIKI_URL, render_version, render_welcome
from jasem.shared.amounts import format_amount, parse_exact_amount
from jasem.shared.calendar_view import CalendarView
from jasem.shared.charts import sparkline
from jasem.shared.config import Config
from jasem.shared.console import Console
from jasem.shared.dates import NO_DATE, DateResolver
from jasem.shared.durations import format_minutes, parse_exact_minutes

FOCUS_LIMIT = 7
"""Most tasks the dashboard focus list returns, matching jasem's home screen."""

ENVIRONMENT_VARIABLES = (
    "JASEM_DIR", "JASEM_FILE", "JASEM_TRACK_FILE", "JASEM_SPEND_FILE",
    "JASEM_LIST", "JASEM_JALALI", "JASEM_ACCENT", "NO_COLOR", "FORCE_COLOR",
)
"""Every variable jasem reads, as listed on its help screen."""

VIEWS = {**{name: name for name in VIEW_NAMES}, "ls": "list", "open": "list"}
"""Task views the API accepts — jasem's own, plus ``open`` — mapped to the view shown."""

DURATION_HINT = "45m · 1h · 1h30m · 2h 15min · 90"
"""The durations jasem suggests when it cannot read one."""

AMOUNT_HINT = "50000 · 50k · 1.5m · 1,200"
"""The amounts jasem suggests when it cannot read one."""


def _option_keys(flags):
    """Map each option of a jasem flag table, without its dashes, to its field.

    ``-d``/``--due`` become the keys ``d``/``due``. The field names themselves
    (``deadline``, ``category``, ``description``) are accepted too.
    """
    keys = {flag.lstrip("-"): field for flag, field in flags.items()}
    keys.update({field: field for field in flags.values()})
    return keys


TASK_FIELDS = _option_keys(TASK_EDIT_FLAGS)
"""Keys of a task body: ``jasem todo edit``'s options, which add's options plus ``--title``."""

TIME_FIELDS = {**_option_keys(TIME_EDIT_FLAGS), "time_text": "time", "minutes": "time"}
"""Keys of a time-entry body: ``jasem track edit``'s options, plus the stored field names."""

SPEND_FIELDS = {**_option_keys(SPEND_EDIT_FLAGS), "amount_text": "amount"}
"""Keys of a spending body: ``jasem acc edit``'s options, plus the stored field name."""

TASK_EDIT_FIELDS = {**TASK_FIELDS, "done": "done"}
"""Keys of a task edit: the add keys, plus completion, which ``jasem todo done`` sets."""

COMMAND_REFERENCE = (
    ("todo", "Tasks", (
        (TODO_ADD_USAGE, "add a task", "POST", "/api/tasks/"),
        ('jasem todo add "<title>" [options]', "add a title that starts with a command word",
         "POST", "/api/tasks/"),
        ("jasem todo  ·  jasem todo list [-t TAG]...", "open tasks, soonest deadline first",
         "GET", "/api/tasks/?view=open&tag=<tag>"),
        ("jasem todo today", "due today", "GET", "/api/tasks/?view=today"),
        ("jasem todo week", "due within the next 7 days", "GET", "/api/tasks/?view=week"),
        ("jasem todo overdue", "past deadline, not done", "GET", "/api/tasks/?view=overdue"),
        ("jasem todo all", "everything, including completed", "GET", "/api/tasks/?view=all"),
        ("jasem todo tags", "categories in use, with counts", "GET", "/api/tasks/tags/"),
        ('jasem todo find "…"', "search task titles & tags", "GET", "/api/tasks/find/?q=<text>"),
        ("jasem todo done <id>…", "mark task(s) complete", "POST", "/api/tasks/done/"),
        ("jasem todo rm <id>", "delete one task", "DELETE", "/api/tasks/<id>/"),
        ("jasem todo rm <id>…", "delete task(s) permanently", "POST", "/api/tasks/delete/"),
        (TODO_EDIT_USAGE, "change fields", "PATCH", "/api/tasks/<id>/"),
    )),
    ("lists", "Task lists", (
        ("jasem todo @<list> …", "run any todo command against a named list",
         "*", "/api/tasks/…?list=<name>"),
        ("jasem todo @default", "the unnamed list", "*", "/api/tasks/…?list=default"),
        ("jasem todo lists", "every list, with open counts", "GET", "/api/tasks/lists/"),
        ("jasem todo move <id>… <list>", "move task(s) to another list",
         "POST", "/api/tasks/move/"),
    )),
    ("track", "Time", (
        (TRACK_ADD_USAGE, "log time", "POST", "/api/time/"),
        ("jasem track list [period] [-t TAG]", "logged entries",
         "GET", "/api/time/?period=all&tag=<tag>"),
        ("jasem track tags", "categories in use, with counts", "GET", "/api/time/tags/"),
        ("jasem track report [period] [-t TAG]", "totals, by-tag, timeline & top activities",
         "GET", "/api/time/report/?period=week&tag=<tag>"),
        ("jasem track rm <id>", "delete one entry", "DELETE", "/api/time/<id>/"),
        ("jasem track rm <id>…", "delete tracked entries", "POST", "/api/time/delete/"),
        (TRACK_EDIT_USAGE, "change fields", "PATCH", "/api/time/<id>/"),
    )),
    ("acc", "Spending", (
        (ACC_ADD_USAGE, "record spending", "POST", "/api/spending/"),
        ("jasem acc list [period] [-t TAG]", "recorded spending",
         "GET", "/api/spending/?period=all&tag=<tag>"),
        ("jasem acc tags", "categories in use, with counts", "GET", "/api/spending/tags/"),
        ("jasem acc report [period] [-t TAG]", "totals, by-tag, timeline & top spends",
         "GET", "/api/spending/report/?period=week&tag=<tag>"),
        ("jasem acc rm <id>", "delete one record", "DELETE", "/api/spending/<id>/"),
        ("jasem acc rm <id>…", "delete spending record(s)", "POST", "/api/spending/delete/"),
        (ACC_EDIT_USAGE, "change fields", "PATCH", "/api/spending/<id>/"),
    )),
    ("more", "More", (
        ("jasem  (no args)", "focus tasks and today's activity", "GET", "/api/dashboard/"),
        ("jasem --help", "the command reference", "GET", "/api/help/"),
        ("jasem --version", "logo, version & project link", "GET", "/api/meta/"),
        ("jasem help  (files & config)", "files, list, calendar, accent", "GET", "/api/config/"),
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
    """Console that renders jasem's screens to a string instead of a terminal."""

    def __init__(self):
        """Write to an in-memory stream with color disabled."""
        super().__init__(stream=io.StringIO(), env={"NO_COLOR": "1"})


def _text(value):
    """Return a JSON value as the CLI would receive it: a string."""
    return "" if value is None else str(value)


def _words(values):
    """Return the tags in ``values``, each of which may hold several (``work,home``)."""
    return [word for value in values for word in re.split(r"[,\s]+", value) if word]


def _fields(payload, keys):
    """Return ``payload`` as ``{field: value}`` in the order the fields first appear.

    Several keys may name one field (``d``, ``due``); like a repeated option, the
    last value wins. A key jasem has no option for is refused.
    """
    fields = {}
    for key, value in payload.items():
        field = keys.get(str(key).strip().lower())
        if field is None:
            raise ApiError(f"unknown field: {key}; use " + " · ".join(sorted(keys)))
        fields[field] = value
    return fields


def _aliases(keys):
    """Return ``{field: [keys…]}`` — every key accepted for each field."""
    aliases = {}
    for key, field in keys.items():
        aliases.setdefault(field, []).append(key)
    return {field: sorted(names) for field, names in aliases.items()}


class WebService:
    """Thin adapter around jasem's domain, stores, date resolver, and reports."""

    def __init__(self):
        self.config = Config()
        self.calendar = CalendarView.from_config(self.config)
        self.dates = DateResolver(self.calendar)
        self.console = CaptureConsole()
        self.list_name = task_lists.normalize(self.config.list_name) or ""
        self.tasks = self._task_store(self.list_name)
        self.timelog = TimeLogStore(self.config.track_file)
        self.spending_store = SpendingStore(self.config.spend_file)

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

    @staticmethod
    def _list_ref(name):
        return {"name": name, "label": task_lists.label(name)}

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
    def _ids(values, noun=None):
        """Return the numeric ids in ``values``, read the way jasem reads them.

        ``jasem todo done``/``rm`` refuse an argument that is not an id, so a typo
        cannot act on fewer tasks than intended — pass ``noun`` for that.
        ``move``, ``track rm`` and ``acc rm`` skip such arguments instead.
        """
        identifiers = set()
        for value in values if isinstance(values, (list, tuple)) else [values]:
            try:
                identifiers.add(int(_text(value).strip()))
            except ValueError:
                if noun:
                    raise ApiError(f"not a {noun} id: {value}") from None
        if not identifiers:
            raise ApiError("at least one numeric id is required")
        return identifiers

    def _read_date(self, value, what="date"):
        """Return ``value`` as an ISO date, refusing it as ``-d`` does."""
        resolved = self.dates.resolve(value, dt.date.today())
        if not resolved:
            example = self.calendar.format_iso("2026-07-01")
            raise ApiError(f"could not understand {what}: {value!r}; try: today · tomorrow · "
                           f"fri · next fri · last mon · +3d · -2d · june 20 · {example}")
        return resolved

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
        filters = [tag.lower() for tag in _words(tags or [])]
        if filters:
            selected = [task for task in selected
                        if all(tag in task.tag_list() for tag in filters)]
        selected.sort(key=lambda task: task.sort_key())
        return selected

    def add_task(self, payload, list_name=None):
        """Add a task from its title and options, as ``jasem todo "<title>"`` does."""
        store = self._store_for(list_name)
        fields = _fields(payload, TASK_FIELDS)
        if not _text(fields.get("title")).strip():
            raise ApiError("a task needs a title")
        task = Task(created=dt.date.today().isoformat())
        for field, value in fields.items():
            self._apply_task_field(task, field, value)
        fresh = bool(store.name) and not store.exists()
        tasks = store.load()
        task.id = store.next_id(tasks)
        tasks.append(task)
        store.save(tasks)
        return task, fresh

    def update_task(self, task_id, payload, list_name=None):
        """Change any fields of a task, as ``jasem todo edit <id>`` does.

        Every value is checked before anything is saved, so one bad value leaves
        the task untouched on disk.
        """
        store = self._store_for(list_name, must_exist=True)
        fields = _fields(payload, TASK_EDIT_FIELDS)
        if not fields:
            raise ApiError("nothing to change")
        tasks = store.load()
        task = next((item for item in tasks if item.id == task_id), None)
        if task is None:
            raise ApiError(f"no task with id #{task_id}", 404)
        for field, value in fields.items():
            self._apply_task_field(task, field, value)
        store.save(tasks)
        return task

    def _apply_task_field(self, task, field, value):
        """Apply one value to ``task``, using jasem's own rules for each field."""
        if field == "done":
            task.done = bool(value)
            return
        if field == "category":
            values = [_text(item) for item in (value if isinstance(value, (list, tuple))
                                               else [value])]
            if len(values) == 1 and values[0].strip().lower() in CLEAR_WORDS:
                task.tags = ""
            else:
                task.tags = ", ".join(_words(values))
            return
        text = _text(value)
        if field == "title":
            if not text.strip():
                raise ApiError("a task needs a title")
            task.title = text.strip()
        elif field == "priority":
            lowered = text.strip().lower()
            priority = PRIORITY_ALIASES.get(lowered, lowered)
            if priority not in PRIORITY_RANK:
                raise ApiError(f"unknown priority: {text!r}; "
                               "use high · medium · low  (or h · m · l)")
            task.priority = priority
        elif text.strip().lower() in CLEAR_WORDS | NO_DATE:
            task.deadline = ""
        else:
            task.deadline = self._read_date(text, "deadline")

    def complete_tasks(self, ids, done=True, list_name=None):
        """Mark tasks complete (or reopen them), as ``jasem todo done`` does.

        Like the CLI, tasks already in that state are reported rather than
        changed, and ids matching nothing in the list are reported rather than
        failing the call; it fails only when no id matched at all, since ids are
        numbered per list and the request was probably aimed at another one.
        """
        store = self._store_for(list_name, must_exist=True)
        identifiers = self._ids(ids, noun="task")
        tasks = store.load()
        matched = [task for task in tasks if task.id in identifiers]
        if not matched:
            raise self._no_tasks(identifiers, store.name)
        changed = [task for task in matched if task.done != bool(done)]
        for task in changed:
            task.done = bool(done)
        if changed:
            store.save(tasks)
        changed_ids = {task.id for task in changed}
        return {
            "list": self._list_ref(store.name),
            "tasks": changed,
            "unchanged": [task for task in matched if task.id not in changed_ids],
            "missing": sorted(identifiers - {task.id for task in matched}),
        }

    def delete_tasks(self, ids, list_name=None):
        """Delete every task whose id is listed, as ``jasem todo rm`` does."""
        store = self._store_for(list_name, must_exist=True)
        identifiers = self._ids(ids, noun="task")
        tasks = store.load()
        removed = [task for task in tasks if task.id in identifiers]
        if not removed:
            raise self._no_tasks(identifiers, store.name)
        store.save([task for task in tasks if task.id not in identifiers])
        return {
            "list": self._list_ref(store.name),
            "tasks": removed,
            "missing": sorted(identifiers - {task.id for task in removed}),
        }

    def _no_tasks(self, identifiers, list_name):
        """Return the error for ids that match no task, worded as the CLI words it."""
        message = ("no task " + ", ".join(f"#{i}" for i in sorted(identifiers))
                   + " · " + task_lists.label(list_name))
        if any(name != list_name for name in [""] + task_lists.discover(self.config.task_file)):
            message += "; ids are numbered per list"
        return ApiError(message, 404)

    def task_lists(self):
        result = []
        for name in [""] + task_lists.discover(self.config.task_file):
            store = self._task_store(name)
            tasks = store.load()
            result.append({
                **self._list_ref(name),
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
        start, end, label = resolve_window(
            [entry.date for entry in entries], self._period(period, "all"), dt.date.today())
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

    def add_time(self, payload):
        """Log time from a duration, the work, and options, as ``jasem track`` does."""
        fields = _fields(payload, TIME_FIELDS)
        if not _text(fields.get("time")).strip():
            raise ApiError("how long? give a duration first")
        if not _text(fields.get("work")).strip():
            raise ApiError("what did you work on?")
        entry = TimeEntry(date=dt.date.today().isoformat(), tag="work")
        for field, value in fields.items():
            self._apply_time_field(entry, field, value)
        entries = self.timelog.load()
        entry.id = self.timelog.next_id(entries)
        entries.append(entry)
        self.timelog.save(entries)
        return entry

    def update_time(self, entry_id, payload):
        """Change any fields of a time entry, as ``jasem track edit <id>`` does."""
        fields = _fields(payload, TIME_FIELDS)
        if not fields:
            raise ApiError("nothing to change")
        entries = self.timelog.load()
        entry = next((item for item in entries if item.id == entry_id), None)
        if entry is None:
            raise ApiError(f"no time entry with id #{entry_id}", 404)
        for field, value in fields.items():
            self._apply_time_field(entry, field, value)
        self.timelog.save(entries)
        return entry

    def _apply_time_field(self, entry, field, value):
        """Apply one value to ``entry``, using jasem's own rules for each field."""
        text = _text(value)
        if field == "time":
            minutes = parse_exact_minutes(text)
            if minutes is None:
                raise ApiError(f"couldn't read a duration from {text!r}; "
                               f"durations: {DURATION_HINT}")
            entry.time_text = format_minutes(minutes)
        elif field == "date":
            entry.date = self._read_date(text)
        elif field == "tag":
            tag = text.strip()
            entry.tag = "work" if tag.lower() in CLEAR_WORDS else tag
        else:
            if not text.strip():
                raise ApiError("an entry needs a work description")
            entry.work = text.strip()

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
        start, end, label = resolve_window(
            [record.date for record in records], self._period(period, "all"), dt.date.today())
        return self._in_window(records, start, end, tag), label

    def spending_tags(self):
        counts = {}
        for record in self.spending_store.load():
            tag = record.tag or "general"
            counts[tag] = counts.get(tag, 0) + 1
        return self._tag_counts(counts)

    def add_spending(self, payload):
        """Record spending from an amount, a title, and options, as ``jasem acc`` does."""
        fields = _fields(payload, SPEND_FIELDS)
        if not _text(fields.get("amount")).strip():
            raise ApiError("how much? give an amount first")
        if not _text(fields.get("title")).strip():
            raise ApiError("what was it for?")
        record = Spending(date=dt.date.today().isoformat(), tag="general")
        for field, value in fields.items():
            self._apply_spending_field(record, field, value)
        records = self.spending_store.load()
        record.id = self.spending_store.next_id(records)
        records.append(record)
        self.spending_store.save(records)
        return record

    def update_spending(self, record_id, payload):
        """Change any fields of a spending record, as ``jasem acc edit <id>`` does."""
        fields = _fields(payload, SPEND_FIELDS)
        if not fields:
            raise ApiError("nothing to change")
        records = self.spending_store.load()
        record = next((item for item in records if item.id == record_id), None)
        if record is None:
            raise ApiError(f"no spending record with id #{record_id}", 404)
        for field, value in fields.items():
            self._apply_spending_field(record, field, value)
        self.spending_store.save(records)
        return record

    def _apply_spending_field(self, record, field, value):
        """Apply one value to ``record``, using jasem's own rules for each field."""
        text = _text(value)
        if field == "amount":
            amount = parse_exact_amount(text)
            if amount is None:
                raise ApiError(f"couldn't read an amount from {text!r}; amounts: {AMOUNT_HINT}")
            record.amount_text = format_amount(amount)
        elif field == "date":
            record.date = self._read_date(text)
        elif field == "tag":
            tag = text.strip()
            record.tag = "general" if tag.lower() in CLEAR_WORDS else tag
        elif field == "description":
            note = text.strip()
            record.description = "" if note.lower() in CLEAR_WORDS else note
        else:
            if not text.strip():
                raise ApiError("a record needs a title")
            record.title = text.strip()

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
            "list": self._list_ref(self.list_name),
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
        window = self._period(period, "week")
        if kind == "time":
            entries = self.timelog.load()
            start, end, label = resolve_window([entry.date for entry in entries], window, today)
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
        start, end, label = resolve_window([record.date for record in records], window, today)
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
            "priority_aliases": dict(PRIORITY_ALIASES),
            "clear_words": sorted(word for word in CLEAR_WORDS if word),
            "deadline_clear_words": sorted(word for word in CLEAR_WORDS | NO_DATE if word),
            "fields": {
                "task": _aliases(TASK_EDIT_FIELDS),
                "time": _aliases(TIME_FIELDS),
                "spending": _aliases(SPEND_FIELDS),
            },
            "options": {
                "todo": {"add": dict(TASK_FLAGS), "edit": dict(TASK_EDIT_FLAGS)},
                "track": {"add": dict(TIME_FLAGS), "edit": dict(TIME_EDIT_FLAGS)},
                "acc": {"add": dict(SPEND_FLAGS), "edit": dict(SPEND_EDIT_FLAGS)},
            },
        }

    def configuration(self):
        """Answer the ``FILES & CONFIG`` section of ``jasem help``."""
        return {
            "directory": self.config.directory,
            "task_file": task_lists.path_for(self.config.task_file, self.list_name),
            "default_task_file": self.config.task_file,
            "track_file": self.config.track_file,
            "spend_file": self.config.spend_file,
            "list": self._list_ref(self.list_name),
            "calendar": "jalali" if self.config.jalali else "gregorian",
            "accent": self.config.accent,
            "environment": list(ENVIRONMENT_VARIABLES),
        }
