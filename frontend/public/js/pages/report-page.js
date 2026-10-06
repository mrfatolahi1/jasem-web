// The page behind Time and Spending: load the report for the chosen period,
// draw the shared tiles, and run the page's add bar and edit sheet.

import { api } from "../api.js";
import { html } from "../html.js";
import { dayChart, freeColour, hero, LOADING_TAGS, peakDay, perActiveDay, periodControl, PERIODS, tagTiles, todayCard } from "../report.js";
import { reportColours } from "../tags.js";
import { errorTile, header, painter } from "../ui.js";

/**
 * spec: {
 *   kind: "time" | "spending", path: "/time", api: "time/",
 *   items(report), closingTile(report, fill), listTile(report, colours, fill),
 *   addBar(state), body(form) → request body (throws Error with a note),
 *   edit(item, onChange)
 * }
 */
export function mountReport(root, ctx, spec) {
  const asked = ctx.params.get("period");
  const state = {
    period: PERIODS.includes(asked) ? asked : "week",
    report: null, error: null, loadFailed: false, formError: "", adding: false,
  };
  const paint = painter(root, () => {
    const report = state.report;
    const colours = reportColours((report?.by_tag ?? []).map(([tag]) => tag));
    // The chart and the closing tile take a colour none of their tags use;
    // lists are plum on every page.
    const tagRow = report ? report.by_tag.slice(0, 3).map(([tag]) => colours.get(tag)) : LOADING_TAGS;
    const chartFill = spec.kind === "time" ? freeColour([...colours.values()]) : freeColour(["gold", "red"]);
    const closingFill = freeColour(tagRow);
    const listFill = "plum";
    return html`${header(spec.path, periodControl(state.period))}
    <main class="jb-bento">
      ${errorTile(state.error, { retry: state.loadFailed })}
      ${hero(spec.kind, report, state.period)}
      ${perActiveDay(spec.kind, report)}
      ${todayCard(spec.kind, report, report ? spec.items(report) : [])}
      ${peakDay(spec.kind, report)}
      ${dayChart(spec.kind, report, report ? spec.items(report) : [], colours, chartFill)}
      ${tagTiles(spec.kind, report, colours)}
      ${spec.closingTile(report, closingFill)}
      ${spec.listTile(report, colours, listFill)}
      ${spec.addBar(state)}
    </main>`;
  });
  let alive = true;
  let ticket = 0;

  async function load() {
    const mine = ++ticket;
    try {
      const report = await api.get(`${spec.api}report/`, { period: state.period });
      if (!alive || mine !== ticket) return;
      state.report = report;
      if (state.loadFailed) state.error = null;
      state.loadFailed = false;
    } catch (error) {
      if (!alive || mine !== ticket) return;
      state.error = error.message;
      state.loadFailed = true;
    }
    paint();
  }

  async function add(form) {
    let body;
    try {
      body = spec.body(form);
    } catch (error) {
      state.formError = error.message;
      paint();
      return;
    }
    state.adding = true;
    paint();
    try {
      await api.post(spec.api, body);
      root.querySelector('[data-form="add"]').reset();
      state.formError = "";
    } catch (error) {
      state.formError = error.message;
    }
    state.adding = false;
    await load();
  }

  root.onclick = (event) => {
    const target = event.target.closest("[data-seg], [data-action]");
    if (!target) return;
    if (target.dataset.seg === "period" && target.dataset.value !== state.period) {
      state.period = target.dataset.value;
      ctx.remember({ period: state.period === "week" ? null : state.period });
      paint();
      load();
    }
    if (target.dataset.action === "edit") {
      const item = spec.items(state.report).find((entry) => entry.id === Number(target.dataset.id));
      if (item) spec.edit(item, load);
    }
    if (target.dataset.action === "dismiss-error") {
      state.error = null;
      if (state.loadFailed) load();
      paint();
    }
  };
  root.onsubmit = (event) => {
    event.preventDefault();
    if (event.target.dataset.form === "add" && !state.adding) add(event.target);
  };

  paint();
  load();
  return () => { alive = false; };
}
