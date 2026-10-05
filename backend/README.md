# Jasem Web backend

A thin Django HTTP layer over the installed jasem 2 package — its domain
objects, Markdown stores, date resolver, value readers, and report builders.
No models, ORM, migrations, or database; the adapting happens in
`jasem_web/services.py`. Every CLI command has an endpoint, and both surfaces
read and write the same files.

## Setup

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 127.0.0.1:8000
```

## API

[`openapi.yaml`](openapi.yaml) documents all 30 operations; each carries an
`x-jasem-command` naming the CLI command it performs. With the server running:
Swagger UI at `/api/docs/`, the spec at `/api/openapi.yaml`, and the same
command-to-endpoint map as JSON at `/api/help/`.

Responses are JSON and every path ends in `/` (`APPEND_SLASH` is off).

| Group | Paths |
| --- | --- |
| meta | `health/` `meta/` `help/` `config/` `dashboard/` |
| tasks | `tasks/` `tasks/<id>/` `done/` `delete/` `tags/` `find/` `lists/` `move/` |
| time | `time/` `time/<id>/` `delete/` `tags/` `report/` |
| spending | `spending/` `spending/<id>/` `delete/` `tags/` `report/` |

`?list=` picks a task list (`default` for the unnamed one), `?view=` a task
filter, `?period=` a window, and `?tag=` (or `?tags=`) a category — repeatable
or comma-separated for task views, as `-t` is.

`/` serves `docs/index.html`; set `JASEM_WEB_FRONTEND` if it lives elsewhere.

## Request bodies

jasem 2 reads nothing out of free text, so neither does the API. A body's keys
are the command's options without their dashes, or the field names responses
use; the CLI's positional arguments become required keys.

| Endpoint | Required | Optional |
| --- | --- | --- |
| `POST tasks/` | `title` | `d`·`due`·`date`·`deadline`, `p`·`priority`, `t`·`tag`·`tags`·`category`, `list` |
| `POST time/` | `time` (a duration), `work` | `d`·`date`, `t`·`tag` |
| `POST spending/` | `amount`, `title` | `n`·`note`·`description`, `d`·`date`, `t`·`tag` |

`PATCH` takes the same keys, any subset, like `edit <id> [options]`; a task
PATCH also takes `done`. `GET /api/help/` lists every key per field.

```sh
curl -X POST localhost:8000/api/tasks/ -d '{"title": "pay rent", "d": "fri", "p": "h", "t": "finance"}'
curl -X POST localhost:8000/api/time/ -d '{"time": "1h30m", "work": "code review", "d": "yesterday"}'
curl -X PATCH localhost:8000/api/spending/3/ -d '{"amount": "60k", "n": "team celebration"}'
```

## CLI behavior the API keeps

- An unknown key, view, or period, an unreadable date, duration, or amount, an
  invalid priority, or a missing named list is rejected with the message the
  CLI prints — and nothing is saved, not even the request's other fields.
- `time` and `amount` must be a duration or amount and nothing else
  (`1h30m`, `50k`); they are stored in jasem's canonical form.
- Priorities take `h`·`m`·`med`·`l`. Clearing words (`none`, `clear`, `-`, …)
  empty a deadline, task tags, or a note, and reset a time tag to `work` and a
  spending tag to `general`; `someday` also clears a deadline. A time or
  spending date cannot be cleared.
- Task ids for `done` and `delete` must all be numbers. Ids with no task in the
  list come back in `missing`, tasks already done in `unchanged`; the call fails
  only when nothing matched, since ids are numbered per list.
- Dates stay Gregorian ISO with a `_display` twin for `JASEM_JALALI`, and dates
  typed in Jalali mode are read as Jalali. `/api/tasks/tags/` counts open tasks,
  as `jasem todo tags` does.

## Rules

- Storage stays in jasem's stores; reading dates, durations, and amounts stays in
  its `DateResolver`, `parse_exact_minutes`, and `parse_exact_amount`.
- Reuse jasem's constants (`PERIODS`, `VIEW_NAMES`, `CLEAR_WORDS`, `NO_DATE`,
  `PRIORITY_ALIASES`, the option tables, the usage lines) so the two surfaces
  cannot drift.
- No database model for user data.

## Checks

```sh
.venv/bin/python manage.py check
.venv/bin/python -m py_compile jasem_web/*.py config/*.py
```

Point `JASEM_DIR` at a temporary directory to exercise the API without touching real data.
