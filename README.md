# Jasem Web

Jasem Web is a local web companion for the [`jasem`](https://github.com/mrfatolahi1/Jasem) CLI. It reads and writes the same human-readable Markdown files under `~/.jasem/`, so changes made in the web app are immediately visible to the CLI and vice versa.

The project has two independent applications:

```text
backend/   Django JSON API; no models, ORM, migrations, or database
frontend/  Next.js App Router UI
```

## What it supports

- Dashboard focus view with today's tracked time and spending.
- Tasks with natural-language capture, deadlines, priorities, tags, completion, editing, deletion, search, filters, and named lists.
- Moving tasks between lists such as `@work-backlog` and `@work-ongoing`.
- Time tracking with natural-language capture, period/tag filters, editing, deletion, and jasem reports.
- Spending records with natural-language capture, period/tag filters, editing, deletion, and jasem reports.
- Jalali/Gregorian behavior and AI provider configuration through jasem's existing package and environment variables.

## Quick start

Use two terminals from the project root.

Terminal 1:

```sh
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 127.0.0.1:8000
```

Terminal 2:

```sh
cd frontend
npm install
npm run dev
```

Open <http://localhost:3000>. Next.js proxies `/api` requests to Django at `127.0.0.1:8000`.

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

```sh
cd frontend
npm run build
```

The backend can also be checked without changing real data by setting `JASEM_DIR` to a temporary directory.

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for application-specific details.

