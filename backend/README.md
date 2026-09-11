# Jasem Web backend

This folder contains the thin Django HTTP layer. It deliberately has no Django
models, ORM usage, migrations, or database. `jasem_web/services.py` adapts the
installed jasem package directly, including its domain objects, Markdown stores,
natural-language parsers, date resolver, and report aggregation.

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

## API

All responses are JSON and all paths end in `/`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health/` | Server health check |
| GET | `/api/dashboard/` | Focus tasks and activity summary |
| GET/POST | `/api/tasks/` | List or capture a task |
| PATCH/DELETE | `/api/tasks/<id>/` | Edit, complete, or delete a task |
| GET | `/api/tasks/lists/` | Discover the default and named lists |
| GET | `/api/tasks/tags/` | Count task tags |
| GET | `/api/tasks/find/?q=...` | Search task titles and tags |
| POST | `/api/tasks/move/` | Move task IDs to another list |
| GET/POST | `/api/time/` | List or capture time |
| PATCH/DELETE | `/api/time/<id>/` | Edit or delete time |
| GET | `/api/time/tags/` | Count time tags |
| GET/POST | `/api/spending/` | List or capture spending |
| PATCH/DELETE | `/api/spending/<id>/` | Edit or delete spending |
| GET | `/api/spending/tags/` | Count spending tags |

Add `report=1&period=week` (or `today`, `month`, `all`) to the time or spending
collection endpoints for the same report calculations used by jasem's CLI.
Add `tag=<name>` to scope a collection or report.

## Integration rules

- Keep storage operations inside jasem's stores. Do not reimplement Markdown table parsing here.
- Keep natural-language parsing inside jasem's parser classes so CLI and web behavior stay aligned.
- Never add a database model for user data.
- Changes are written immediately to the configured Markdown files.

Run the frontend with `JASEM_BACKEND_URL=http://127.0.0.1:8000` (the default)
so Next.js proxies `/api` requests without browser CORS setup.

## Checks

```sh
.venv/bin/python manage.py check
.venv/bin/python -m py_compile jasem_web/*.py
```

Run the frontend with `JASEM_BACKEND_URL=http://127.0.0.1:8000` (the default)
so Next.js proxies `/api` requests to Django without browser CORS setup.
