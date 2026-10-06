// Spending: "where the money went". GET /api/spending/report/?period=…
// Reference: the ScreenSpending preview (derived from the Time report).

import { editRecord } from "../editors.js";
import * as f from "../format.js";
import { attr, html } from "../html.js";
import { closingSpan, flagValue, formError } from "../report.js";
import { DASH, skeletonRows } from "../ui.js";
import { mountReport } from "./report-page.js";

function restTile(report, fill) {
  const rest = report?.by_tag.slice(3) ?? [];
  const rows = rest.length > 4
    ? [...rest.slice(0, 3), [`${rest.length - 3} more tags`, rest.slice(3).reduce((total, [, amount]) => total + amount, 0), true]]
    : rest;
  return html`<section class="jb-tile jb-tile--chart jb-fill-${fill}${closingSpan(report)}" aria-labelledby="rest" style="justify-content:flex-start">
      <h2 id="rest" class="jb-label" style="margin-bottom:6px">The rest</h2>
      ${report && !rows.length ? html`<p class="jb-empty" style="padding:0">${report.by_tag.length ? "No other tags." : "Nothing spent yet."}</p>`
        : html`<ol class="jb-top">${report
          ? rows.map(([tag, amount, summary]) => html`<li><span>${summary ? tag : `#${tag}`}</span><b>${f.formatAmount(amount)}</b></li>`)
          : [0, 1].map(() => html`<li><span>${DASH}</span></li>`)}</ol>`}
    </section>`;
}

function recordsTile(report, colours, fill) {
  const records = report?.records ?? [];
  const row = (record) => {
    const meta = [`#${record.id}`, f.weekdayDayMonth(record.date), `#${record.tag}`, record.description].filter(Boolean).join(" · ");
    return html`<li class="jb-row jb-row--meta"><span class="jb-check" aria-hidden="true" style="--tag:var(--${colours.get(record.tag) ?? "ink-muted"})"><span></span></span><button class="jb-row-body jb-plain" type="button" aria-haspopup="dialog" data-action="edit" data-id="${record.id}" data-key="edit-${record.id}"><span class="jb-row-title">${record.title}</span><span class="jb-row-meta">${meta}</span></button><span class="jb-due">${record.amount_display}</span></li>`;
  };
  return html`<section class="jb-tile jb-tile--list jb-fill-${fill} jb-span-4" aria-labelledby="rc"${attr("aria-busy", !report && "true")}>
      <div class="jb-list-head"><h2 id="rc" class="jb-h1">Records</h2><span class="jb-more">oldest first · ${report ? records.length : DASH}</span></div>
      ${report && !records.length ? html`<p class="jb-empty">Nothing spent in this period.</p>`
        : html`<ul class="jb-rows">${report ? records.map(row) : skeletonRows(3, { meta: true })}</ul>`}
    </section>`;
}

function recordBar(state) {
  return html`<form class="jb-tile jb-fill-gold jb-span-4 jb-form jb-form--bar" data-form="add" novalidate>
      <label for="am" class="jb-form-label">Record spending</label>
      <input id="am" class="jb-input jb-input--l jb-input--flag" placeholder="50k" autocomplete="off">
      <input id="am-title" aria-label="Title" class="jb-input jb-input--l jb-input--title" placeholder="what for?" autocomplete="off">
      <input id="am-n" aria-label="Note" class="jb-input jb-input--l jb-input--flag" placeholder="-n note" autocomplete="off">
      <input id="am-d" aria-label="Date" class="jb-input jb-input--l jb-input--flag" placeholder="-d today" autocomplete="off">
      <input id="am-t" aria-label="Tag" class="jb-input jb-input--l jb-input--flag" placeholder="-t general" autocomplete="off">
      <button type="submit" class="jb-submit"${attr("disabled", state.adding)}>Add</button>
      ${formError(state.formError)}
    </form>`;
}

function body(form) {
  const amount = form.querySelector("#am").value.trim();
  const title = form.querySelector("#am-title").value.trim();
  if (!amount) throw new Error("Type an amount first, like 50k.");
  if (!title) throw new Error("Say what it was for.");
  const result = { amount, title };
  for (const flag of ["n", "d", "t"]) {
    const value = flagValue(form.querySelector(`#am-${flag}`), `-${flag}`);
    if (value) result[flag] = value;
  }
  return result;
}

export default {
  title: "Spending",
  mount: (root, ctx) => mountReport(root, ctx, {
    kind: "spending",
    path: "/spending",
    api: "spending/",
    items: (report) => report.records,
    closingTile: restTile,
    listTile: recordsTile,
    addBar: recordBar,
    body,
    edit: (record, onChange) => editRecord(record, { onChange }),
  }),
};
