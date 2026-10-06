// Help and settings, opened from the "?" pill (screens.md, "Recipes"): white
// tiles for the files, the calendar and the active list, and the command
// reference from GET /api/help/.

import { api, loadConfig } from "../api.js";
import { attr, html } from "../html.js";
import { DASH, errorTile, header, painter } from "../ui.js";

function aboutTile(meta) {
  return html`<section class="jb-tile jb-span-2" aria-labelledby="about">
      <h1 id="about" class="jb-label jb-label--muted">Help &amp; settings</h1>
      <img class="jb-wordmark" src="/assets/jasem-wordmark.svg" alt="jasem" width="444" height="156">
      <p class="jb-detail">${meta ? html`${meta.description} <a href="${meta.repository}">Repository</a> · <a href="${meta.wiki}">Wiki</a>` : DASH}</p>
    </section>`;
}

function statTile({ fill, label, value, detail }) {
  return html`<section class="jb-tile${fill ? ` jb-fill-${fill}` : ""}" aria-label="${label}">
      <h2 class="jb-label${fill ? "" : " jb-label--muted"}">${label}</h2>
      <div><p class="jb-figure jb-figure--s">${value ?? DASH}</p>${detail ? html`<p class="jb-detail">${detail}</p>` : ""}</div>
    </section>`;
}

function filesTile(config) {
  const files = config ? [
    ["directory", config.directory],
    ["tasks", config.task_file],
    ["time", config.track_file],
    ["spending", config.spend_file],
  ] : [];
  return html`<section class="jb-tile jb-span-2" aria-labelledby="files" style="justify-content:flex-start">
      <h2 id="files" class="jb-label jb-label--muted" style="margin-bottom:12px">Files</h2>
      <dl class="jb-files">${config ? files.map(([name, path]) => html`<div><dt>${name}</dt><dd>${path}</dd></div>`) : html`<div><dt>${DASH}</dt></div>`}</dl>
    </section>`;
}

function commandTile(namespace) {
  return html`<section class="jb-tile jb-tile--chart jb-span-2" aria-labelledby="ns-${namespace.name}">
      <h2 id="ns-${namespace.name}" class="jb-h2" style="margin-bottom:14px">${namespace.title}</h2>
      <ul class="jb-commands">${namespace.commands.map((command) => html`<li><code>${command.command}</code><p>${command.summary} · ${command.method} ${command.path}</p></li>`)}</ul>
    </section>`;
}

function view(state) {
  const { config, meta, reference, lists } = state.data ?? {};
  const calendar = config && (config.calendar === "jalali" ? "Jalali" : "Gregorian");
  return html`${header("/help")}
  <main class="jb-bento"${attr("aria-busy", !state.data && "true")}>
    ${errorTile(state.error, { retry: true })}
    ${aboutTile(meta)}
    ${statTile({ fill: "blue", label: "jasem", value: meta?.jasem_version, detail: meta && "installed version" })}
    ${statTile({ fill: "plum", label: "Calendar", value: calendar, detail: config && "JASEM_JALALI switches it" })}
    ${filesTile(config)}
    ${statTile({ fill: "orange", label: "Active list", value: config?.list.label, detail: config && "JASEM_LIST picks it" })}
    ${statTile({ label: "Lists", value: lists?.length, detail: lists?.map((list) => list.label).join(" · ") })}
    ${(reference?.namespaces ?? []).map(commandTile)}
  </main>`;
}

export default {
  title: "Help",
  mount(root) {
    const state = { data: null, error: null };
    const paint = painter(root, () => view(state));
    let alive = true;

    async function load() {
      try {
        const [config, meta, reference, lists] = await Promise.all([
          loadConfig(), api.get("meta/"), api.get("help/"), api.get("tasks/lists/"),
        ]);
        if (!alive) return;
        state.data = { config, meta, reference, lists: lists.lists };
        state.error = null;
      } catch (error) {
        if (!alive) return;
        state.error = error.message;
      }
      paint();
    }

    root.onclick = (event) => {
      if (!event.target.closest('[data-action="dismiss-error"]')) return;
      state.error = null;
      paint();
      load();
    };

    paint();
    load();
    return () => { alive = false; };
  },
};
