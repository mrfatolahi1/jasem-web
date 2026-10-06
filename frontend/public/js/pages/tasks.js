// Tasks: "the whole list, by when", for the list chosen in the header.
// Reference: the ScreenTasks preview; tile map in screens.md (Tasks).
// Data: GET /api/tasks/ views, /api/tasks/lists/ and /api/tasks/tags/.

import { api, loadConfig } from "../api.js";
import { editTask } from "../editors.js";
import { FlagError, parseEntry, tagList } from "../flags.js";
import * as f from "../format.js";
import { attr, html } from "../html.js";
import { flagValue, formError } from "../report.js";
import { openLists } from "../sheet.js";
import { tagColour, tagStyle } from "../tags.js";
import { DASH, errorTile, header, painter, segmented, skeletonRows } from "../ui.js";

const listParam = (name) => name || "default";

/** The square checkbox; on a coloured tile (`onFill`) it takes the tile's text colour. */
function checkbox(task, busy, onFill = false) {
  return html`<button class="jb-check" type="button" aria-label="Complete ${task.title}" data-action="done" data-id="${task.id}" data-key="done-${task.id}"${attr("style", !onFill && tagStyle(task.tags[0]))}${attr("data-state", busy.has(task.id) && "done")}><span></span></button>`;
}

function editButton(task, className, content = task.title) {
  return html`<button class="${className}" type="button" aria-haspopup="dialog" data-action="edit" data-id="${task.id}" data-key="edit-${task.id}">${content}</button>`;
}

function metaRow(task, today, busy) {
  const meta = [`#${task.id}`, task.tags.map((tag) => `#${tag}`).join(" "), f.shortPriority(task.priority)].filter(Boolean).join(" · ");
  const state = f.dueState(task.deadline, today);
  return html`<li class="jb-row jb-row--meta">${checkbox(task, busy)}${editButton(task, "jb-row-body jb-plain", html`<span class="jb-row-title">${task.title}</span><span class="jb-row-meta">${meta}</span>`)}<span class="jb-due${state ? ` ${state}` : ""}">${f.dueLabel(task.deadline, today)}</span></li>`;
}

/** Overdue (red) and Today (gold): the first task large, the rest as rows. */
function whenTile({ id, name, fill, tasks, empty, today, busy, late }) {
  if (!tasks) {
    return html`<section class="jb-tile jb-fill-${fill}" aria-labelledby="${id}" aria-busy="true">
      <h2 id="${id}" class="jb-label">${name}</h2>
      <div><p class="jb-tile-title jb-tile-title--s">${DASH}</p></div>
    </section>`;
  }
  if (!tasks.length) {
    return html`<section class="jb-tile" aria-labelledby="${id}">
      <h2 id="${id}" class="jb-label jb-label--muted">${name}</h2>
      <div><p class="jb-tile-title jb-tile-title--s">${empty}</p></div>
    </section>`;
  }
  const [first, ...rest] = tasks;
  const detail = [
    first.priority !== "medium" && first.priority,
    first.tags.map((tag) => `#${tag}`).join(" "),
    late && f.since(first.deadline, today),
  ].filter(Boolean).join(" · ");
  return html`<section class="jb-tile jb-fill-${fill}" aria-labelledby="${id}">
      <h2 id="${id}" class="jb-label">${name} · ${tasks.length}</h2>
      <div><p class="jb-tile-title jb-tile-title--s">${editButton(first, "jb-plain")}</p>${detail ? html`<p class="jb-detail">${detail}</p>` : ""}${rest.length ? html`
        <ul class="jb-rest">${rest.map((task) => html`<li>${checkbox(task, busy, true)}${editButton(task, "jb-row-title jb-plain")}${late ? html`<span class="jb-rest-due">${f.dueLabel(task.deadline, today)}</span>` : ""}</li>`)}</ul>` : ""}</div>
    </section>`;
}

function listTile({ id, title, tasks, today, busy, empty, span }) {
  return html`<section class="jb-tile jb-tile--list ${span}" aria-labelledby="${id}" style="padding-bottom:12px"${attr("aria-busy", !tasks && "true")}>
      <h2 id="${id}" class="jb-h2">${title} · ${tasks ? tasks.length : DASH}</h2>
      ${tasks && !tasks.length ? html`<p class="jb-empty">${empty}</p>`
        : html`<ul class="jb-rows">${tasks ? tasks.map((task) => metaRow(task, today, busy)) : skeletonRows(4, { meta: true })}</ul>`}
    </section>`;
}

function somedayTile(tasks) {
  return html`<section class="jb-tile jb-tile--chart jb-fill-plum jb-span-2" aria-labelledby="sd">
      <h2 id="sd" class="jb-label" style="margin-bottom:10px">Someday · ${tasks ? tasks.length : DASH}</h2>
      ${tasks && !tasks.length ? html`<p class="jb-detail" style="margin:0">Every open task has a deadline.</p>` : html`<ul class="jb-chips" style="list-style:none;margin:0;padding:0">
        ${(tasks ?? []).map((task) => html`<li>${editButton(task, "jb-btn jb-btn--ghost")}</li>`)}
      </ul>`}
    </section>`;
}

function tagsTile(tags, active) {
  const shown = tags && active && !tags.some((item) => item.tag === active) ? [...tags, { tag: active, count: 0 }] : tags;
  return html`<section class="jb-tile jb-tile--chart jb-span-2" aria-labelledby="tg">
      <h2 id="tg" class="jb-label jb-label--muted" style="margin-bottom:10px">Tags</h2>
      ${shown && !shown.length ? html`<p class="jb-empty" style="padding:0">No tags yet; add one with -t.</p>` : html`<div class="jb-chips">
        ${(shown ?? []).map(({ tag, count }) => html`<button type="button" class="jb-chip jb-fill-${tagColour(tag)}" aria-pressed="${tag === active}" data-action="tag" data-tag="${tag}" data-key="tag-${tag}">${tag} <span class="jb-chip-count">${count}</span></button>`)}
      </div>`}
    </section>`;
}

function newTaskBar(state) {
  return html`<form class="jb-tile jb-fill-blue jb-span-4 jb-form jb-form--bar" data-form="new" novalidate>
      <label for="t" class="jb-form-label">New task</label>
      <input id="t" class="jb-input jb-input--l jb-input--title" placeholder="title" autocomplete="off">
      <input id="t-d" aria-label="Deadline" class="jb-input jb-input--l jb-input--flag" placeholder="-d fri" autocomplete="off">
      <input id="t-p" aria-label="Priority" class="jb-input jb-input--l jb-input--flag" placeholder="-p med" autocomplete="off">
      <input id="t-t" aria-label="Tags" class="jb-input jb-input--l jb-input--flag" placeholder="-t tags" autocomplete="off">
      <button type="submit" class="jb-submit"${attr("disabled", state.adding)}>Add</button>
      ${formError(state.formError)}
    </form>`;
}

function listSelector(state) {
  const lists = state.lists ?? [];
  const options = lists.map((list) => [listParam(list.name), `${list.label} ${list.open_count}`]);
  if (state.list !== null && !lists.some((list) => list.name === state.list)) {
    options.push([listParam(state.list), `@${state.list} 0`]);
  }
  return segmented({
    name: "list",
    label: "List",
    accent: true,
    options,
    selected: state.list === null ? null : listParam(state.list),
    extra: html`<button type="button" role="tab" aria-selected="false" tabindex="-1" aria-label="Lists" aria-haspopup="dialog" data-action="lists" data-key="lists">+</button>`,
  });
}

function view(state) {
  const v = state.views;
  const today = f.todayIso();
  return html`${header("/tasks", listSelector(state))}
  <main class="jb-bento jb-bento--tasks">
    ${errorTile(state.error, { retry: state.loadFailed })}
    ${whenTile({ id: "ov", name: "Overdue", fill: "red", tasks: v?.overdue, empty: "Nothing late", today, busy: state.busy, late: true })}
    ${whenTile({ id: "td", name: "Today", fill: "gold", tasks: v?.today, empty: "Nothing today", today, busy: state.busy })}
    ${listTile({ id: "wk", title: "This week", tasks: v?.week, today, busy: state.busy, empty: "Nothing else this week.", span: "jb-span-2 jb-rows-3" })}
    ${somedayTile(v?.someday)}
    ${tagsTile(v?.tags, state.tag)}
    ${v?.later.length ? listTile({ id: "lt", title: "Later", tasks: v.later, today, busy: state.busy, span: "jb-span-4" }) : ""}
    ${newTaskBar(state)}
  </main>`;
}

export default {
  title: "Tasks",
  mount(root, ctx) {
    const asked = ctx.params.get("list");
    const state = {
      list: asked === null ? null : asked === "default" ? "" : asked,
      tag: ctx.params.get("tag") ?? "",
      lists: null, views: null, error: null, loadFailed: false,
      formError: "", adding: false, busy: new Set(),
    };
    const paint = painter(root, () => view(state));
    let alive = true;
    let ticket = 0;

    async function fetchViews(listName) {
      const params = { list: listParam(listName), tag: state.tag || undefined };
      const [overdue, today, week, open, tags] = await Promise.all([
        api.get("tasks/", { view: "overdue", ...params }),
        api.get("tasks/", { view: "today", ...params }),
        api.get("tasks/", { view: "week", ...params }),
        api.get("tasks/", { view: "open", ...params }),
        api.get("tasks/tags/", { list: listParam(listName) }),
      ]);
      const shown = new Set([...overdue.tasks, ...today.tasks].map((task) => task.id));
      const thisWeek = week.tasks.filter((task) => !shown.has(task.id));
      for (const task of thisWeek) shown.add(task.id);
      return {
        overdue: overdue.tasks,
        today: today.tasks,
        week: thisWeek,
        someday: open.tasks.filter((task) => !task.deadline),
        later: open.tasks.filter((task) => task.deadline && !shown.has(task.id)),
        tags: tags.tags,
        all: open.tasks,
      };
    }

    async function load() {
      const mine = ++ticket;
      try {
        const [config, lists] = await Promise.all([loadConfig(), api.get("tasks/lists/")]);
        const listName = state.list ?? config.list.name;
        const known = lists.lists.find((list) => list.name === listName);
        // A list exists once a task is added to it; until then it is empty.
        const views = !listName || known?.exists
          ? await fetchViews(listName)
          : { overdue: [], today: [], week: [], someday: [], later: [], tags: [], all: [] };
        if (!alive || mine !== ticket) return;
        state.list = listName;
        state.lists = lists.lists;
        state.views = views;
        if (state.loadFailed) state.error = null;
        state.loadFailed = false;
      } catch (error) {
        if (!alive || mine !== ticket) return;
        state.error = error.message;
        state.loadFailed = true;
      }
      paint();
    }

    function selectList(name) {
      const list = name === "default" ? "" : name;
      if (list === state.list) return;
      state.list = list;
      state.tag = "";
      state.views = null;
      ctx.remember({ list: listParam(list), tag: null });
      paint();
      load();
    }

    async function complete(id) {
      if (state.busy.has(id)) return;
      state.busy.add(id);
      paint();
      try {
        await api.post("tasks/done/", { ids: [id], list: listParam(state.list) });
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
        body = parseEntry("task", form.querySelector("#t").value);
      } catch (error) {
        if (!(error instanceof FlagError)) throw error;
        state.formError = error.message;
        paint();
        return;
      }
      const d = flagValue(form.querySelector("#t-d"), "-d");
      const p = flagValue(form.querySelector("#t-p"), "-p");
      const t = tagList(flagValue(form.querySelector("#t-t"), "-t"));
      if (d) body.d = d;
      if (p) body.p = p;
      if (t.length) body.t = [...(body.t ?? []), ...t];
      body.list = listParam(state.list);

      state.adding = true;
      paint();
      try {
        await api.post("tasks/", body);
        root.querySelector('[data-form="new"]').reset();
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
      if (target.dataset.seg === "list") selectList(target.dataset.value);
      const action = target.dataset.action;
      const id = Number(target.dataset.id);
      if (action === "done") complete(id);
      if (action === "edit") {
        const task = state.views.all.find((item) => item.id === id);
        if (task) editTask(task, { list: state.list, lists: state.lists.map((list) => list.name), onChange: load });
      }
      if (action === "tag") {
        state.tag = state.tag === target.dataset.tag ? "" : target.dataset.tag;
        ctx.remember({ tag: state.tag || null });
        load();
      }
      if (action === "lists" && state.lists) {
        openLists({ lists: state.lists, current: state.list, pick: selectList });
      }
      if (action === "dismiss-error") {
        state.error = null;
        if (state.loadFailed) load();
        paint();
      }
    };
    root.onsubmit = (event) => {
      event.preventDefault();
      if (event.target.dataset.form === "new" && !state.adding) add(event.target);
    };

    paint();
    load();
    return () => { alive = false; };
  },
};
