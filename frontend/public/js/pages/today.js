// Today: "what needs me now". Every tile comes from GET /api/dashboard/.
// Reference: the ScreenToday preview; tile map in screens.md (Today).

import { api } from "../api.js";
import { editTask } from "../editors.js";
import { FlagError, PLACEHOLDERS, parseEntry } from "../flags.js";
import * as f from "../format.js";
import { attr, html } from "../html.js";
import { tagStyle } from "../tags.js";
import { DASH, errorTile, header, painter, skeletonRows } from "../ui.js";

const KINDS = ["task", "time", "spend"];
const ADD_PATHS = { task: "tasks/", time: "time/", spend: "spending/" };
const sum = (values) => values.reduce((total, value) => total + value, 0);

function taskRow(task, today, busy) {
  const state = f.dueState(task.deadline, today);
  return html`<li class="jb-row"><button class="jb-check" type="button" aria-label="Complete ${task.title}" data-action="done" data-id="${task.id}" data-key="done-${task.id}"${attr("style", tagStyle(task.tags[0]))}${attr("data-state", busy.has(task.id) && "done")}><span></span></button><button class="jb-row-title jb-plain" type="button" aria-haspopup="dialog" data-action="edit" data-id="${task.id}" data-key="edit-${task.id}">${task.title}</button><span class="jb-due${state ? ` ${state}` : ""}">${f.dueLabel(task.deadline, today)}</span></li>`;
}

function needsYou(data, busy) {
  const rows = !data ? skeletonRows(7)
    : data.tasks.map((task) => taskRow(task, data.date, busy));
  return html`<section class="jb-tile jb-tile--list jb-span-2 jb-rows-3" aria-labelledby="att"${attr("aria-busy", !data && "true")}>
      <div class="jb-list-head"><h1 id="att" class="jb-h1">Needs you</h1><a class="jb-more" href="/tasks">all ${data ? data.open_count : DASH} →</a></div>
      ${data && !data.tasks.length ? html`<p class="jb-empty">Nothing needs you today.</p>` : html`<ul class="jb-rows">${rows}</ul>`}
    </section>`;
}

function nextUp(data) {
  const task = data?.tasks[0];
  if (data && !task) {
    return html`<section class="jb-tile" aria-label="Next up">
      <h2 class="jb-label jb-label--muted">Next up</h2>
      <p class="jb-tile-title">All clear</p>
    </section>`;
  }
  const late = !data || (task.deadline && task.deadline < data.date);
  return html`<section class="jb-tile${late ? " jb-fill-red" : ""}" aria-label="Next up">
      <h2 class="jb-label${late ? "" : " jb-label--muted"}">Next up${task ? ` · ${f.dueWords(task.deadline, data.date)}` : ""}</h2>
      <div>${task
        ? html`<p class="jb-tile-title"><button type="button" class="jb-plain" aria-haspopup="dialog" data-action="edit" data-id="${task.id}" data-key="next-edit">${task.title}</button></p><button class="jb-btn ${late ? "jb-btn--light" : "jb-btn--ink"}" type="button" style="margin-top:14px" aria-label="Done: ${task.title}" data-action="done" data-id="${task.id}" data-key="next-done">Done</button>`
        : html`<p class="jb-tile-title">${DASH}</p>`}</div>
    </section>`;
}

function stat(fill, label, figure, extraClass = "") {
  return html`<section class="jb-tile jb-fill-${fill}" aria-label="${label}">
      <h2 class="jb-label">${label}</h2>
      <p class="jb-figure${extraClass}">${figure}</p>
    </section>`;
}

function thisWeek(data) {
  const days = data?.days ?? Array.from({ length: 7 }, (_, index) => f.addDays(f.todayIso(), index - 6));
  const trend = data?.time_trend ?? days.map(() => 0);
  const max = Math.max(...trend);
  const totals = data ? `${f.formatMinutes(sum(data.time_trend))} · ${f.formatAmount(sum(data.spend_trend))}` : DASH;
  return html`<section class="jb-tile jb-tile--chart jb-span-2" aria-labelledby="wk">
      <h2 id="wk" class="jb-chart-head"><span>This week</span><strong>${totals}</strong></h2>
      <div class="jb-bars" aria-hidden="true">
        ${days.map((day, index) => html`<div class="jb-bar-col"><span class="jb-bar${data && index === days.length - 1 ? " jb-bar--now" : ""}" style="height:${max ? Math.max(8, Math.round((trend[index] / max) * 66)) : 8}px"></span><span class="jb-bar-label">${f.weekday(day)}</span></div>`)}
      </div>
    </section>`;
}

function quickAdd(state) {
  return html`<form class="jb-tile jb-tile--form jb-fill-orange jb-span-4 jb-form" data-form="quick" novalidate>
      <label for="qa" class="jb-form-label">Quick add</label>
      <div class="jb-input-row">
        <input id="qa" class="jb-input jb-input--grow" placeholder="${PLACEHOLDERS[state.kind]}" autocomplete="off"${attr("aria-describedby", state.formError && "qa-error")}>
        <button type="submit" class="jb-submit"${attr("disabled", state.adding)}>Add</button>
      </div>
      ${state.formError ? html`<p id="qa-error" class="jb-form-error" role="alert">${state.formError}</p>` : ""}
      <div class="jb-kinds" role="group" aria-label="Kind">
        ${KINDS.map((kind) => html`<button type="button" class="jb-toggle" aria-pressed="${state.kind === kind}" data-action="kind" data-kind="${kind}" data-key="kind-${kind}">${kind}</button>`)}
      </div>
    </form>`;
}

function view(state) {
  const data = state.data;
  const late = data ? data.tasks.filter((task) => task.deadline && task.deadline < data.date).length : 0;
  return html`${header("/", html`<span class="jb-header-end">${data ? f.longDate(data.date, data.weekday) : ""}</span>`)}
  <main class="jb-bento">
    ${errorTile(state.error, { retry: state.loadFailed })}
    ${needsYou(data, state.busy)}
    ${nextUp(data)}
    ${stat("blue", "Tracked today", data ? f.figure(data.tracked_today_display) : DASH)}
    ${stat("gold", "Spent today", data ? f.figure(data.spent_today_display) : DASH)}
    ${stat("plum", "Open tasks", html`${data ? data.open_count : DASH}${late ? html` <small>· ${late} late</small>` : ""}`, " jb-figure--l")}
    ${thisWeek(data)}
    ${quickAdd(state)}
  </main>`;
}

export default {
  title: "Today",
  mount(root) {
    const state = { data: null, lists: [], error: null, loadFailed: false, kind: "task", formError: "", adding: false, busy: new Set() };
    const paint = painter(root, () => view(state));
    let alive = true;
    let ticket = 0;

    async function load() {
      const mine = ++ticket;
      try {
        const [data, lists] = await Promise.all([api.get("dashboard/"), api.get("tasks/lists/")]);
        if (!alive || mine !== ticket) return;
        state.data = data;
        state.lists = lists.lists.map((list) => list.name);
        if (state.loadFailed) state.error = null;
        state.loadFailed = false;
      } catch (error) {
        if (!alive || mine !== ticket) return;
        state.error = error.message;
        state.loadFailed = true;
      }
      paint();
    }

    const listParam = () => state.data?.list.name || "default";

    async function complete(id) {
      if (state.busy.has(id)) return;
      state.busy.add(id);
      paint();
      try {
        await api.post("tasks/done/", { ids: [id], list: listParam() });
        state.error = null;
      } catch (error) {
        state.error = error.message;
      }
      state.busy.delete(id);
      await load();
    }

    async function add(form) {
      let body;
      try {
        body = parseEntry(state.kind, form.querySelector("#qa").value);
      } catch (error) {
        if (!(error instanceof FlagError)) throw error;
        state.formError = error.message;
        paint();
        return;
      }
      state.adding = true;
      paint();
      try {
        await api.post(ADD_PATHS[state.kind], body);
        root.querySelector("#qa").value = "";
        state.formError = "";
      } catch (error) {
        state.formError = error.message;
      }
      state.adding = false;
      await load();
    }

    root.onclick = (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const id = Number(target.dataset.id);
      const action = target.dataset.action;
      if (action === "done") complete(id);
      if (action === "edit") {
        const task = state.data.tasks.find((item) => item.id === id);
        editTask(task, { list: state.data.list.name, lists: state.lists, onChange: load });
      }
      if (action === "kind") {
        state.kind = target.dataset.kind;
        state.formError = "";
        paint();
      }
      if (action === "dismiss-error") {
        state.error = null;
        if (state.loadFailed) load();
        paint();
      }
    };
    root.onsubmit = (event) => {
      event.preventDefault();
      if (event.target.dataset.form === "quick" && !state.adding) add(event.target);
    };

    paint();
    load();
    return () => { alive = false; };
  },
};
