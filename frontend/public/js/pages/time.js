// Time: "where the hours went". GET /api/time/report/?period=…
// Reference: the ScreenTimeReport preview, plus the Entries tile and Log time
// bar that screens.md adds beneath it.

import { editEntry } from "../editors.js";
import * as f from "../format.js";
import { attr, html } from "../html.js";
import { closingSpan, flagValue, formError } from "../report.js";
import { DASH, skeletonRows } from "../ui.js";
import { mountReport } from "./report-page.js";

function topTile(report, fill) {
  const rows = report?.top_activities.slice(0, 4) ?? [];
  return html`<section class="jb-tile jb-tile--chart jb-fill-${fill}${closingSpan(report)}" aria-labelledby="ta" style="justify-content:flex-start">
      <h2 id="ta" class="jb-label" style="margin-bottom:6px">Top</h2>
      ${report && !rows.length ? html`<p class="jb-empty" style="padding:0">Nothing tracked yet.</p>`
        : html`<ol class="jb-top">${report
          ? rows.map(([work, minutes]) => html`<li><span>${work}</span><b>${f.chartMinutes(minutes)}</b></li>`)
          : [0, 1, 2, 3].map(() => html`<li><span>${DASH}</span></li>`)}</ol>`}
    </section>`;
}

function entriesTile(report, colours, fill) {
  const entries = report?.entries ?? [];
  const row = (entry) => html`<li class="jb-row jb-row--meta"><span class="jb-check" aria-hidden="true" style="--tag:var(--${colours.get(entry.tag) ?? "ink-muted"})"><span></span></span><button class="jb-row-body jb-plain" type="button" aria-haspopup="dialog" data-action="edit" data-id="${entry.id}" data-key="edit-${entry.id}"><span class="jb-row-title">${entry.work}</span><span class="jb-row-meta">#${entry.id} · ${f.weekdayDayMonth(entry.date)} · #${entry.tag}</span></button><span class="jb-due">${entry.time_display}</span></li>`;
  return html`<section class="jb-tile jb-tile--list jb-fill-${fill} jb-span-4" aria-labelledby="en"${attr("aria-busy", !report && "true")}>
      <div class="jb-list-head"><h2 id="en" class="jb-h1">Entries</h2><span class="jb-more">oldest first · ${report ? entries.length : DASH}</span></div>
      ${report && !entries.length ? html`<p class="jb-empty">Nothing tracked in this period.</p>`
        : html`<ul class="jb-rows">${report ? entries.map(row) : skeletonRows(3, { meta: true })}</ul>`}
    </section>`;
}

function logBar(state) {
  return html`<form class="jb-tile jb-fill-blue jb-span-4 jb-form jb-form--bar" data-form="add" novalidate>
      <label for="lt" class="jb-form-label">Log time</label>
      <input id="lt" class="jb-input jb-input--l jb-input--flag" placeholder="1h30m" autocomplete="off">
      <input id="lt-work" aria-label="Work" class="jb-input jb-input--l jb-input--title" placeholder="what did you work on?" autocomplete="off">
      <input id="lt-d" aria-label="Date" class="jb-input jb-input--l jb-input--flag" placeholder="-d today" autocomplete="off">
      <input id="lt-t" aria-label="Tag" class="jb-input jb-input--l jb-input--flag" placeholder="-t work" autocomplete="off">
      <button type="submit" class="jb-submit"${attr("disabled", state.adding)}>Add</button>
      ${formError(state.formError)}
    </form>`;
}

function body(form) {
  const time = form.querySelector("#lt").value.trim();
  const work = form.querySelector("#lt-work").value.trim();
  if (!time) throw new Error("Type a duration first, like 1h30m.");
  if (!work) throw new Error("Say what you worked on.");
  const result = { time, work };
  const d = flagValue(form.querySelector("#lt-d"), "-d");
  const t = flagValue(form.querySelector("#lt-t"), "-t");
  if (d) result.d = d;
  if (t) result.t = t;
  return result;
}

export default {
  title: "Time",
  mount: (root, ctx) => mountReport(root, ctx, {
    kind: "time",
    path: "/time",
    api: "time/",
    items: (report) => report.entries,
    closingTile: topTile,
    listTile: entriesTile,
    addBar: logBar,
    body,
    edit: (entry, onChange) => editEntry(entry, { onChange }),
  }),
};
