![jasem](logo.svg)

# Jasem Web

A local web companion for the [`jasem`](https://github.com/mrfatolahi1/Jasem) CLI, version 2.
It reads and writes the same Markdown files under `~/.jasem/`, so changes made
here are visible to the CLI immediately, and vice versa.

```text
backend/   Django JSON API; no models, ORM, migrations, or database
frontend/  The web app: plain HTML, CSS and JavaScript in the Jasem Bento design
docs/      Landing page for the jasem CLI (index.html), served by GitHub Pages
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

Landing page at <http://127.0.0.1:8000/>, API at <http://127.0.0.1:8000/api/>, docs at <http://127.0.0.1:8000/api/docs/>.

Then, in another terminal, start the web app (Node 18+, no install step):

```sh
cd frontend
npm start
```

The app is at <http://localhost:3500/>. See [frontend/README.md](frontend/README.md).

## Data

The backend keeps no data of its own. It uses jasem's files —
`~/.jasem/tasks.md`, `tasks-<list>.md`, `timelog.md`, `spending.md` — and
jasem's environment variables: `JASEM_DIR`, `JASEM_FILE`, `JASEM_TRACK_FILE`,
`JASEM_SPEND_FILE`, `JASEM_LIST`, `JASEM_JALALI`. Like jasem 2 it is fully
offline; the old AI settings (`JASEM_PROVIDER`, `JASEM_MODEL`, `JASEM_API_KEY`,
…) are ignored.

Point `JASEM_DIR` at a temporary directory to try the API without touching real data.
