# Jasem Web frontend

The browser side of jasem-web: four pages (**Today**, **Tasks**, **Time** and
**Spending**) plus help and settings behind the `?` pill. They read and write
jasem's files through the backend's JSON API ([`backend/openapi.yaml`](../backend/openapi.yaml)).

It is plain HTML, CSS and JavaScript modules. There is no build step and there
are no dependencies; Node 18 or later runs the small server and the tests.

## Run

Start the backend first (see the [root README](../README.md)), then:

```sh
cd frontend
npm start            # http://localhost:3500
```

`server.mjs` serves `public/` and forwards `/api/` to the backend, so the
browser talks to one origin. It listens on the loopback interface only. It
refuses requests whose `Host` is not local, and writes whose `Origin` is not
this page, because the API writes the user's own files.

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `3500` | where the frontend listens |
| `HOST` | `127.0.0.1` | the interface it listens on |
| `JASEM_API` | `http://127.0.0.1:8000` | the backend it forwards `/api/` to |

## Design

The structure is the **Jasem Bento** design system (design #13): a bento grid
of tiles that drops to one column at 760px and below. Its README, `screens.md`
and `data.md` are the spec, and its Screens previews are the reference markup.
The pages reuse that markup and its `jb-` classes.

It is dressed in the **Sicily** pack (round 2, Mediterranean minimal). Sicily
keeps the five logo colours and what they mean (orange quick add, blue time,
gold today, red late, plum counts) and changes what surrounds them:

- **Neutrals.** A ricotta canvas (`#F7F1E8`) and espresso ink (`#2A1E1A`).
- **Type.** Young Serif for figures, tile titles, headings and the brand;
  Onest for everything else. Young Serif has a single weight, so those rules
  ask for 400.
- **Shape.** Leaf-shaped tiles: two round corners (32px) and two tight ones
  (6px). Checkboxes, bars and report stacks repeat the shape. Pills stay round.
- **Four colours on top.** Every page opens with a row of four cards in the
  logo mark's colours, each holding real data:

  | Page | Orange | Blue | Gold | Red |
  | --- | --- | --- | --- | --- |
  | Today | Open tasks | Tracked today | Spent today | Next up |
  | Tasks | Open | This week | Today | Overdue |
  | Time, Spending | Total | Per active day | Today | Busiest / biggest day |
  | Help | Active list | jasem version | Calendar | Lists |

  These cards keep their colour when empty ("Nothing late", "All clear").
- **Every tile is coloured.** Lists are plum. A chart or the tile closing a
  tag row takes the first logo colour its tags don't use (`freeColour` in
  `report.js`). White is kept for small things on the tiles: due and priority
  pills (a dot marks today or late), checkboxes, tag chips, inputs, buttons,
  chart bars, and the header capsules on the canvas.
- **Tasks** lists every open task in one table: due, deadline, priority,
  tags, and when it was added. The table's row grows so the page always
  reaches the bottom of the window; on phones each task becomes two lines.

```text
design/tokens.json       the tokens: Jasem Bento's, with Sicily's values
scripts/tokens.mjs       compiles them to public/styles/tokens.css (npm run tokens)
public/styles/
  tokens.css             generated; do not edit
  bundle.css             the design system's component stylesheet, with the
                         fix below and the Sicily type and Today grid
  app.css                what the design leaves to the app: loading, errors,
                         the edit sheet, the lists manager, help, month charts
  fonts.css              Onest and Young Serif, self-hosted (OFL), so it works offline
```

`bundle.css` started as the published file with one fix. Its base reset
`.jb-root button, .jb-root input, .jb-root select { font: inherit; color: inherit }`
has specificity (0,1,1). That outranks the single-class component rules that
follow it, so the white **Done** button got white text, **Add** got ink on
ink, and text typed into the blue New task bar was white on white. The copy
here wraps the selector in `:where()`, which keeps the reset at (0,1,0). Make
the same change if you copy a newer `bundle.css` from the design system, and
keep the Sicily rules (`--font-display`, `--pill`, `.jb-span-all`, `.jb-rows-2`).

Rules the design set and the code follows:

- **Tag colours.** A tag's colour comes from a stable hash of its lowercase
  name (`public/js/tags.js`). The hash is seeded so that the sample tags keep
  their mockup colours. On a report, tiles that share a row never repeat a
  colour.
- **Shares.** Percentages are whole numbers that add up to 100, using the
  largest remainder. That matches the previews (67 / 22 / 11).
- **Quick add.** Text typed into one field is split on jasem's flags, as a
  shell would split it (`public/js/flags.js`). The API reads nothing out of
  free text.
- **Dates.** Dates are shown in Jalali when `config.calendar` is `jalali`, and
  the conversion matches jasem's.
- **Errors.** The API's message is shown unchanged, under the field it names
  or in a red tile at the top of the grid.

The design did not draw some screens: the edit sheet, the lists manager, the
entries and records lists, the Log time bar, and help. These follow the
recipes in its `screens.md`. Tasks also gets a **Later** tile, so that tasks
due more than a week out stay visible.

## Code

```text
public/index.html        the one page; /, /tasks, /time, /spending and /help all serve it
public/js/main.js        routing
public/js/pages/         one module per page (Time and Spending share report-page.js)
public/js/api.js         the API client
public/js/format.js      durations, amounts, figures, due labels, dates
public/js/report.js      the report tiles Time and Spending share
public/js/sheet.js       the edit sheet and lists manager dialogs
public/js/editors.js     what the sheet holds for a task, an entry and a record
public/js/html.js        an escaping html`` template; every value from jasem's files goes through it
```

## Check

```sh
npm test             # formats, due labels, shares, the flag grammar, tag colours
```

Point the backend's `JASEM_DIR` at a temporary directory to try the
frontend without touching real data.
