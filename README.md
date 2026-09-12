# Jasem Web

Jasem Web is a local web companion for the [`jasem`](https://github.com/mrfatolahi1/Jasem) CLI. It reads and writes the same human-readable Markdown files under `~/.jasem/`, so changes made in the web app are immediately visible to the CLI and vice versa.

The project has two independent applications:

```text
backend/   Django JSON API; no models, ORM, migrations, or database
frontend/  Static landing page (index.html)
```

## What it supports

- Dashboard focus view with today's tracked time and spending.
- Tasks with natural-language capture, deadlines, priorities, tags, completion, editing, deletion, search, filters, and named lists.
- Moving tasks between lists such as `@work-backlog` and `@work-ongoing`.
- Time tracking with natural-language capture, period/tag filters, editing, deletion, and jasem reports.
- Spending records with natural-language capture, period/tag filters, editing, deletion, and jasem reports.
- Jalali/Gregorian behavior and AI provider configuration through jasem's existing package and environment variables.

## Quick start

From the project root:

```sh
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 127.0.0.1:8000
```

The API is then served at <http://127.0.0.1:8000/api/>. `frontend/index.html` is a
static landing page; open it directly in a browser.

## Data and configuration

The backend does not create application data of its own. It constructs jasem's `Config`, stores, parsers, date resolver, and report builders on each request. By default it uses:

```text
~/.jasem/tasks.md
~/.jasem/tasks-<list>.md
~/.jasem/timelog.md
~/.jasem/spending.md
```

Use jasem's documented variables to point the app at another directory or configure parsing. Common examples are `JASEM_DIR`, `JASEM_FILE`, `JASEM_TRACK_FILE`, `JASEM_SPEND_FILE`, `JASEM_PROVIDER`, `JASEM_MODEL`, and `JASEM_JALALI`.

## Verification

```sh
cd backend
.venv/bin/python manage.py check
```

The backend can also be checked without changing real data by setting `JASEM_DIR` to a temporary directory.

See [backend/README.md](backend/README.md) for application-specific details.

