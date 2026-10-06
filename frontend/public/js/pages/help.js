// Help and settings, opened from the "?" pill (screens.md, "Recipes"). Like
// every page it opens with four cards in the logo colours: the active list
// (orange), jasem's version (blue), the calendar (gold) and the lists (red).
// Then the about and files tiles, and the command reference from GET /api/help/,
// every tile in a logo colour.

import { api, loadConfig } from "../api.js";
import { attr, html } from "../html.js";
import { DASH, errorTile, header, painter } from "../ui.js";

function aboutTile(meta) {
  return html`<section class="jb-tile jb-fill-plum jb-span-2" aria-labelledby="about">
      <h2 id="about" class="jb-label">Help &amp; settings</h2>
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
  return html`<section class="jb-tile jb-fill-blue jb-span-2" aria-labelledby="files" style="justify-content:flex-start">
      <h2 id="files" class="jb-label" style="margin-bottom:12px">Files</h2>
      <dl class="jb-files">${config ? files.map(([name, path]) => html`<div><dt>${name}</dt><dd>${path}</dd></div>`) : html`<div><dt>${DASH}</dt></div>`}</dl>
    </section>`;
}

const COMMAND_FILLS = ["orange", "red", "gold", "plum", "blue"];

function commandTile(namespace, index) {
  return html`<section class="jb-tile jb-tile--chart jb-fill-${COMMAND_FILLS[index % COMMAND_FILLS.length]} jb-span-2" aria-labelledby="ns-${namespace.name}">
      <h2 id="ns-${namespace.name}" class="jb-h2" style="margin-bottom:14px">${namespace.title}</h2>
      <ul class="jb-commands">${namespace.commands.map((command) => html`<li><code>${command.command}</code><p>${command.summary} · ${command.method} ${command.path}</p></li>`)}</ul>
    </section>`;
}

function view(state) {
  const { config, meta, reference, lists } = state.data ?? {};
  const calendar = config && (config.calendar === "jalali" ? "Jalali" : "Gregorian");
  return html`${header("/help")}
  <main class="jb-bento"${attr("aria-busy", !state.data && "true")}>
    <h1 class="jb-sr-only">Help and settings</h1>
    ${errorTile(state.error, { retry: true })}
    ${statTile({ fill: "orange", label: "Active list", value: config?.list.label, detail: config && "JASEM_LIST picks it" })}
    ${statTile({ fill: "blue", label: "jasem", value: meta?.jasem_version, detail: meta && "installed version" })}
    ${statTile({ fill: "gold", label: "Calendar", value: calendar, detail: config && "JASEM_JALALI switches it" })}
    ${statTile({ fill: "red", label: "Lists", value: lists?.length, detail: lists?.map((list) => list.label).join(" · ") })}
    ${aboutTile(meta)}
    ${filesTile(config)}
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
