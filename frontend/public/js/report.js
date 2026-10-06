// The tiles Time and Spending share (screens.md, "Time" and "Spending"):
// the four cards on top (total, per active day, today, peak day: orange,
// blue, gold, red), the day chart, the tag share tiles, and the add bar's
// helpers. `kind` is "time" or "spending"; the two differ only in units.

import * as f from "./format.js";
import { attr, html } from "./html.js";
import { DASH, segmented } from "./ui.js";

export const PERIODS = ["today", "week", "month", "all"];

/**
 * Every tile is a logo colour. For a tile that sits beside tag colours (the
 * chart, the closing tile, the list), take the first colour none of them use,
 * so it never melts into its neighbours; plum if all five are taken.
 */
const PREFERRED = ["plum", "blue", "orange", "gold", "red"];
export const freeColour = (taken) => PREFERRED.find((colour) => !taken.includes(colour)) ?? PREFERRED[0];

export function periodControl(period) {
  return segmented({ name: "period", label: "Period", options: PERIODS.map((name) => [name, name]), selected: period });
}

const UNITS = {
  time: {
    total: (report) => report.total_minutes,
    count: (report) => f.plural(report.entry_count, "entry", "entries"),
    value: (item) => item.minutes,
    full: f.formatMinutes,
    chart: f.chartMinutes,
    compact: f.compactMinutes,
  },
  spending: {
    total: (report) => report.total_amount,
    count: (report) => f.plural(report.record_count, "record"),
    value: (item) => item.amount,
    full: f.formatAmount,
    chart: f.chartAmount,
    compact: f.chartAmount,
  },
};

/** The orange total: "Tracked · 29 Sep – 5 Oct", the total, and the change. */
export function hero(kind, report, period) {
  const unit = UNITS[kind];
  const verb = kind === "time" ? "Tracked" : "Spent";
  const detail = report
    ? [f.change(unit.total(report), report.previous_total, period), unit.count(report)].filter(Boolean).join(" · ")
    : DASH;
  return html`<section class="jb-tile jb-fill-orange" aria-label="Total">
      <h1 class="jb-label">${verb}${report ? ` · ${f.range(report.start, report.end)}` : ""}</h1>
      <div><p class="jb-figure">${report ? f.figure(report.total_display) : DASH}</p><p class="jb-detail">${detail}</p></div>
    </section>`;
}

/** Busiest (time) or biggest (spending) day, in red. */
export function peakDay(kind, report) {
  const peak = report && (kind === "time" ? report.busiest_day : report.biggest_day);
  const name = kind === "time" ? "Busiest day" : "Biggest day";
  const day = peak && (report.span_days <= 7 ? f.weekday(peak[0]) : f.dayMonth(peak[0]));
  return html`<section class="jb-tile jb-fill-red" aria-label="${name}">
      <h2 class="jb-label">${name}</h2>
      <p class="jb-figure jb-figure--s">${peak ? html`${day}<br><small style="font-size:22px">${UNITS[kind].full(peak[1])}</small>` : DASH}</p>
    </section>`;
}

export function perActiveDay(kind, report) {
  const average = report?.active_days
    ? f.figure(kind === "time" ? f.shortMinutes(report.avg_per_active_day) : f.formatAmount(report.avg_per_active_day))
    : DASH;
  return html`<section class="jb-tile jb-fill-blue" aria-label="Per active day">
      <h2 class="jb-label">Per active day</h2>
      <div><p class="jb-figure jb-figure--s">${average}</p><p class="jb-detail">${report ? `${report.active_days} of ${f.plural(report.span_days, "day")}` : DASH}</p></div>
    </section>`;
}

/** Today's total inside the report, in gold (every period includes today). */
export function todayCard(kind, report, items) {
  const unit = UNITS[kind];
  const today = f.todayIso();
  const inRange = report && report.start <= today && today <= report.end;
  const todays = inRange ? items.filter((item) => item.date === today) : [];
  const total = todays.reduce((sum, item) => sum + unit.value(item), 0);
  const nothing = kind === "time" ? "nothing tracked yet" : "nothing spent yet";
  const detail = !report ? DASH
    : !inRange ? "not in this period"
    : todays.length ? (kind === "time" ? f.plural(todays.length, "entry", "entries") : f.plural(todays.length, "record")) : nothing;
  return html`<section class="jb-tile jb-fill-gold" aria-label="Today">
      <h2 class="jb-label">Today</h2>
      <div><p class="jb-figure jb-figure--s">${total ? f.figure(unit.full(total)) : DASH}</p><p class="jb-detail">${detail}</p></div>
    </section>`;
}

// ------------------------------------------------------------- day chart

function monday(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return f.addDays(iso, -weekday);
}

/**
 * The report's timeline as columns: [{ start, total, byTag }], with each
 * column's split by tag summed from the entries or records.
 */
function columns(kind, report, items) {
  const weekly = report.timeline_unit === "week";
  const first = weekly ? monday(report.start) : report.start;
  const cols = report.timeline.map(([, total], index) => ({
    start: f.addDays(first, index * (weekly ? 7 : 1)), total, byTag: new Map(),
  }));
  for (const item of items) {
    const index = f.daysBetween(first, weekly ? monday(item.date) : item.date) / (weekly ? 7 : 1);
    const col = cols[index];
    if (col) col.byTag.set(item.tag, (col.byTag.get(item.tag) ?? 0) + UNITS[kind].value(item));
  }
  return { cols, weekly };
}

/**
 * The "Each day" chart, on a coloured tile (`fill`). Time stacks each column
 * by tag in the tag colours, the largest share at the bottom, with white
 * between the parts; spending draws one bar per column in translucent white,
 * with today in gold and the biggest in red (ringed in white).
 */
export function dayChart(kind, report, items, colours, fill) {
  const unit = UNITS[kind];
  const id = kind === "time" ? "tl" : "dy";
  const { cols, weekly } = report ? columns(kind, report, items) : { cols: [], weekly: false };
  const title = weekly ? "Each week" : "Each day";
  const head = kind === "time"
    ? html`<h2 id="${id}" class="jb-chart-head">${title}</h2>`
    : html`<h2 id="${id}" class="jb-chart-head"><span>${title}</span><strong>today in gold · biggest in red</strong></h2>`;

  const dense = cols.length > 14;
  const every = Math.ceil(cols.length / 16);
  const max = Math.max(0, ...cols.map((col) => col.total));
  const today = f.todayIso();
  const thisColumn = cols.findIndex((col) => (weekly ? col.start === monday(today) : col.start === today));
  const biggest = cols.findIndex((col) => col.total === max && max > 0);
  const rank = new Map((report?.by_tag ?? []).map(([tag], index) => [tag, index]));
  const height = (value) => Math.max(2, Math.round((value / max) * 104));

  const column = (col, index) => {
    const label = weekly ? f.dayMonth(col.start) : dense ? f.dayOfMonth(col.start) : f.weekday(col.start);
    const value = col.total ? (dense ? unit.compact(col.total) : unit.chart(col.total)) : dense ? "" : DASH;
    let stack;
    if (!col.total) stack = html`<div class="jb-stack jb-stack--empty"></div>`;
    else if (kind === "time") {
      const parts = [...col.byTag].filter(([, minutes]) => minutes > 0)
        .sort(([tagA, a], [tagB, b]) => a - b || (rank.get(tagB) ?? 0) - (rank.get(tagA) ?? 0));
      stack = html`<div class="jb-stack">${parts.map(([tag, minutes]) => html`<span style="height:${height(minutes)}px;background:var(--${colours.get(tag) ?? "bar-idle"})"></span>`)}</div>`;
    } else {
      const bar = index === biggest ? "red" : index === thisColumn ? "gold" : "bar-idle";
      const ring = index === biggest ? ";box-shadow:inset 0 0 0 2px var(--surface)" : "";
      stack = html`<div class="jb-stack"><span style="height:${height(col.total)}px;background:var(--${bar})${ring}"></span></div>`;
    }
    const shown = !dense || index % every === 0;
    return html`<div class="jb-stack-col"><span class="jb-stack-value">${cols.length > 31 ? "" : value}</span>${stack}<span class="jb-stack-label"${attr("style", !shown && "visibility:hidden")}>${label}</span></div>`;
  };

  return html`<section class="jb-tile jb-tile--chart jb-fill-${fill} jb-span-4" aria-labelledby="${id}" style="padding:20px 24px">
      ${head}
      <div class="jb-stacks${dense ? " jb-stacks--dense" : ""}" aria-hidden="true">
        ${report ? cols.map(column) : Array.from({ length: 7 }, () => html`<div class="jb-stack-col"><span class="jb-stack-value">${DASH}</span><div class="jb-stack jb-stack--empty"></div><span class="jb-stack-label">&nbsp;</span></div>`)}
      </div>
    </section>`;
}

// ------------------------------------------------------------- tag tiles

/** The colours of the tag share row while the report loads. */
export const LOADING_TAGS = ["blue", "gold", "red"];

/** The top three tags as share tiles, in their (distinct) tag colours. */
export function tagTiles(kind, report, colours) {
  if (!report) {
    return LOADING_TAGS.map((colour) => html`<section class="jb-tile jb-fill-${colour}" aria-hidden="true">
      <h2 class="jb-label">${DASH}</h2><p class="jb-figure jb-figure--m">${DASH}</p><p class="jb-label">&nbsp;</p>
    </section>`);
  }
  const percents = f.shares(report.by_tag.map(([, value]) => value));
  const top = report.by_tag.slice(0, 3);
  return top.map(([tag, value], index) => html`<section class="jb-tile jb-fill-${colours.get(tag)}${top.length === 1 ? " jb-span-2" : ""}" aria-label="${tag}">
      <h2 class="jb-label">#${tag}</h2>
      <p class="jb-figure jb-figure--m">${percents[index]}<small>%</small></p>
      <p class="jb-label">${UNITS[kind].full(value)}</p>
    </section>`);
}

/** The span of the tile that closes the tag row, so the row is full. */
export function closingSpan(report) {
  const tags = report ? Math.min(report.by_tag.length, 3) : 3;
  return tags === 3 ? "" : tags === 0 ? " jb-span-4" : " jb-span-2";
}

/** A flag field accepts its flag typed in too: "-d fri" or "fri". */
export const flagValue = (input, flag) => input.value.trim().replace(new RegExp(`^${flag}\\s+`), "");

export function formError(message) {
  return message ? html`<p class="jb-form-error" role="alert">${message}</p>` : "";
}

export function busyAttr(busy) {
  return attr("disabled", busy);
}
