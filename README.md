![jasem](logo.svg)

# Jasem Web

A local web companion for the [`jasem`](https://github.com/mrfatolahi1/Jasem) CLI.
It reads and writes the same Markdown files under `~/.jasem/`, so changes made
here are visible to the CLI immediately, and vice versa.

```text
backend/   Django JSON API; no models, ORM, migrations, or database
frontend/  Static landing page (index.html)
```

Every `jasem` command has an endpoint — see [backend/README.md](backend/README.md).

## Quick start

```sh
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 127.0.0.1:8000
```

Landing page at <http://127.0.0.1:8000/>, API at <http://127.0.0.1:8000/api/>,
docs at <http://127.0.0.1:8000/api/docs/>.

## Data

The backend keeps no data of its own. It uses jasem's files —
`~/.jasem/tasks.md`, `tasks-<list>.md`, `timelog.md`, `spending.md` — and
jasem's environment variables: `JASEM_DIR`, `JASEM_FILE`, `JASEM_TRACK_FILE`,
`JASEM_SPEND_FILE`, `JASEM_PROVIDER`, `JASEM_MODEL`, `JASEM_JALALI`.

Point `JASEM_DIR` at a temporary directory to try the API without touching real data.
