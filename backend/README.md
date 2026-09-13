# Jasem Web backend

A thin Django HTTP layer over the installed jasem package — its domain objects,
Markdown stores, natural-language parsers, date resolver, and report builders.
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

[`openapi.yaml`](openapi.yaml) documents all 29 operations; each carries an
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

`?list=` picks a task list, `?view=` a task filter, `?period=` and `?tag=` a window.

`/` serves `docs/index.html`; set `JASEM_WEB_FRONTEND` if it lives elsewhere.

## CLI behavior the API keeps

Field aliases (`p`, `due`, `c`, `t`, `a`, `notes`) and clearing words (`none`,
`clear`, `-`) on every PATCH. An unknown view, period, or field, an invalid
priority or date, or a missing named list is rejected with the error the CLI
prints. jasem's stderr warnings come back in a `warnings` array. Dates stay
Gregorian ISO with a `_display` twin for `JASEM_JALALI`. `/api/tasks/tags/`
counts open tasks, as `jasem todo tags` does.

## Rules

- Storage stays in jasem's stores; natural-language parsing stays in its parsers.
- Reuse jasem's constants (`PERIODS`, `CLEAR_WORDS`, the alias tables) so the two surfaces cannot drift.
- No database model for user data, and never return the configured API key.

## Checks

```sh
.venv/bin/python manage.py check
.venv/bin/python -m py_compile jasem_web/*.py config/*.py
```

Point `JASEM_DIR` at a temporary directory to exercise the API without touching real data.
