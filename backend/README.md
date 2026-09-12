# Jasem Web backend

This folder contains the thin Django HTTP layer. It deliberately has no Django
models, ORM usage, migrations, or database. `jasem_web/services.py` adapts the
installed jasem package directly, including its domain objects, Markdown stores,
natural-language parsers, date resolver, and report aggregation.

Every `jasem` CLI command has an endpoint here, and both surfaces read and write
the same files, so a change made through the API is visible to the next CLI
command and vice versa.

## Setup

Install dependencies and run the local Django server:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 127.0.0.1:8000
```

The API uses jasem's configured files (`JASEM_DIR`, `JASEM_FILE`, and related
environment variables). The default paths are `~/.jasem/tasks.md`,
`~/.jasem/timelog.md`, and `~/.jasem/spending.md`.

## API documentation

[`openapi.yaml`](openapi.yaml) is the full OpenAPI 3.0 specification. Each
operation carries an `x-jasem-command` field naming the CLI command it performs,
so the two surfaces can be diffed against each other.

With the server running, Swagger UI is at <http://127.0.0.1:8000/api/docs/> and
the raw specification at <http://127.0.0.1:8000/api/openapi.yaml>.
`GET /api/help/` returns the same command-to-endpoint map as JSON.

## Endpoints

All responses are JSON and all paths end in `/` (`APPEND_SLASH` is off).

### Meta

| CLI | Method | Path |
| --- | --- | --- |
| — | GET | `/api/health/` |
| `jasem` (no args) | GET | `/api/dashboard/` |
| `jasem --version` | GET | `/api/meta/` |
| `jasem help` | GET | `/api/help/` |
| `jasem help` (files & config) | GET | `/api/config/` |
| — | GET | `/api/docs/` · `/api/openapi.yaml` |

### Tasks — `jasem todo`

| CLI | Method | Path |
| --- | --- | --- |
| `todo "<text>"` · `todo add "<text>"` | POST | `/api/tasks/` |
| `todo` · `list` · `today` · `week` · `overdue` · `all` | GET | `/api/tasks/?view=…&tag=…` |
| `todo tags` | GET | `/api/tasks/tags/` |
| `todo find "…"` | GET | `/api/tasks/find/?q=…` |
| `todo done <id>…` | POST | `/api/tasks/done/` |
| `todo rm <id>…` | POST | `/api/tasks/delete/` |
| `todo rm <id>` | DELETE | `/api/tasks/<id>/` |
| `todo set <id> <field> <value>` | PATCH | `/api/tasks/<id>/` |
| `todo @<list> …` | — | add `?list=<name>` to any of the above |
| `todo lists` | GET | `/api/tasks/lists/` |
| `todo move <id>… <list>` | POST | `/api/tasks/move/` |

### Time — `jasem track`

| CLI | Method | Path |
| --- | --- | --- |
| `track "<text>"` | POST | `/api/time/` |
| `track list [period] [tag]` | GET | `/api/time/?period=…&tag=…` |
| `track report [period] [tag]` | GET | `/api/time/report/?period=…&tag=…` |
| `track tags` | GET | `/api/time/tags/` |
| `track rm <id>…` | POST | `/api/time/delete/` |
| `track rm <id>` | DELETE | `/api/time/<id>/` |
| `track set <id> <field> <value>` | PATCH | `/api/time/<id>/` |

### Spending — `jasem acc`

| CLI | Method | Path |
| --- | --- | --- |
| `acc "<text>"` | POST | `/api/spending/` |
| `acc list [period] [tag]` | GET | `/api/spending/?period=…&tag=…` |
| `acc report [period] [tag]` | GET | `/api/spending/report/?period=…&tag=…` |
| `acc tags` | GET | `/api/spending/tags/` |
| `acc rm <id>…` | POST | `/api/spending/delete/` |
| `acc rm <id>` | DELETE | `/api/spending/<id>/` |
| `acc set <id> <field> <value>` | PATCH | `/api/spending/<id>/` |

`period` is `today` · `week` · `month` · `all` (reports default to `week`, lists
to `all`). `/api/time/` and `/api/spending/` also accept `report=1` for the
report payload, which is what the report paths return.

## CLI behavior the API keeps

- **Field aliases.** `PATCH` bodies accept jasem's own aliases as keys — `p`,
  `due`, `c` for tasks; `t`, `w`, `d` for time; `a`, `notes` for spending.
- **Clearing words.** `none`, `clear`, `-`, `""` and friends empty a deadline,
  category, or description, and reset a tag to `work` / `general`.
- **Rejections, not guesses.** An unknown view, period, or field, an invalid
  priority, an unreadable date, or a named list that does not exist is answered
  with the error the CLI would print, not silently ignored.
- **Warnings.** An unreachable AI backend, or a duration or amount jasem could
  not read, comes back in a `warnings` array — what the CLI writes to stderr.
  The entry is still saved, exactly as the CLI saves it.
- **Calendar.** Dates stay Gregorian ISO on the wire and on disk; every date
  also has a `_display` twin rendered for `JASEM_JALALI`.
- **Open-task tags.** `/api/tasks/tags/` counts open tasks by default, as
  `jasem todo tags` does; pass `view=all` to include completed ones.

## Integration rules

- Keep storage operations inside jasem's stores. Do not reimplement Markdown table parsing here.
- Keep natural-language parsing inside jasem's parser classes so CLI and web behavior stay aligned.
- Reuse jasem's own constants (`PERIODS`, `CLEAR_WORDS`, the field alias tables)
  rather than restating them, so the two surfaces cannot drift.
- Never add a database model for user data.
- Never return the configured API key; `/api/config/` reports only whether one is set.
- Changes are written immediately to the configured Markdown files.

## Checks

```sh
.venv/bin/python manage.py check
.venv/bin/python -m py_compile jasem_web/*.py config/*.py
```

Point `JASEM_DIR` at a temporary directory to exercise the API without touching
real data.
