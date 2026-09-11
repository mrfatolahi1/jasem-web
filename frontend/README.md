# Jasem Web frontend

This folder contains the Next.js App Router client for Jasem Web. It is a
single-user local interface with four surfaces:

- `/` - dashboard focus queue, activity trend, and task-list overview.
- `/tasks` - named lists, natural-language task capture, filters, search, tags,
  inline editing, completion, deletion, and moving between lists.
- `/time` - natural-language time capture, period/tag filters, reports, inline
  editing, and deletion.
- `/spending` - natural-language spending capture, period/tag filters, reports,
  inline editing, and deletion.

## Setup

Run the Django backend first, then from this folder:

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. The Next.js rewrite in `next.config.mjs` sends
`/api/*` requests to `JASEM_BACKEND_URL`, defaulting to
`http://127.0.0.1:8000`.

For a production build:

```sh
npm run build
npm run start
```

## Frontend structure

```text
app/layout.js       document metadata and global CSS import
app/components.js   shared shell, navigation, capture bar, rows, reports
app/globals.css     visual system and responsive layout
app/page.js         dashboard
app/tasks/page.js   tasks and named lists
app/time/page.js    time tracking and report
app/spending/page.js spending and report
```

The UI intentionally uses a warm paper background, hairline dividers, small
brand color accents, and monospace data labels to echo jasem's terminal output.
Keep the interface light, local, and information-dense. Do not add a second
client-side data store; fetch the Django API and let jasem remain the source of
truth.

## Checks

```sh
npm run build
```

The `lint` script is retained for compatibility with the package scripts, but
Next.js 15 no longer ships the old `next lint` command by default. Use the
production build as the current compile and type validation check.

