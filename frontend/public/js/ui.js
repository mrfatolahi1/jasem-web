// Parts every page shares: the header, the error tile, loading placeholders,
// segmented controls, and a painter that re-renders a page without losing
// what the user was typing or where focus was.

import { attr, html } from "./html.js";

const NAV = [["/", "Today"], ["/tasks", "Tasks"], ["/time", "Time"], ["/spending", "Spending"]];

/** The header: mark, wordmark, nav capsule, the page's right slot, and "?". */
export function header(active, slot = "") {
  return html`<header class="jb-header">
    <a class="jb-brand" href="/"><span class="jb-mark" aria-hidden="true"><span></span><span></span><span></span><span></span></span>jasem</a>
    <nav class="jb-capsule jb-nav" aria-label="Main">${NAV.map(([href, label]) => html`<a href="${href}"${attr("aria-current", active === href && "page")}>${label}</a>`)}</nav>
    ${slot}
    <a class="jb-help-link${slot ? "" : " jb-push"}" href="/help" aria-label="Help and settings"${attr("aria-current", active === "/help" && "page")}>?</a>
  </header>`;
}

/**
 * A segmented control (`role="tablist"`). `options` are [value, label]
 * pairs; `name` goes on each button as data-seg so a page can react.
 */
export function segmented({ name, label, options, selected, accent = false, extra = "" }) {
  return html`<div class="jb-capsule jb-seg${accent ? " jb-seg--accent" : ""}" role="tablist" aria-label="${label}" style="margin-left:auto">
    ${options.map(([value, text]) => html`<button type="button" role="tab" data-seg="${name}" data-value="${value}" data-key="seg-${name}-${value}" aria-selected="${value === selected}" tabindex="${value === selected ? 0 : -1}">${text}</button>`)}${extra}
  </div>`;
}

/** Left/Right/Home/End move between the segments of a tablist. */
export function onTabKeys(event) {
  const tab = event.target.closest?.('[role="tab"]');
  if (!tab) return;
  const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]')];
  const index = tabs.indexOf(tab);
  const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  tabs[(next + tabs.length) % tabs.length].focus();
}

/**
 * The red tile at the top of the grid that carries the API's own message.
 * With `retry` its button loads the page again instead of dismissing it.
 */
export function errorTile(error, { heading = "Something went wrong", retry = false } = {}) {
  if (!error) return "";
  return html`<section class="jb-tile jb-fill-red jb-span-all" role="alert" aria-labelledby="error-heading">
    <h2 id="error-heading" class="jb-label">${heading}</h2>
    <div><p class="jb-error-text">${error}</p><button class="jb-btn jb-btn--light" type="button" data-action="dismiss-error" data-key="dismiss-error">${retry ? "Try again" : "Dismiss"}</button></div>
  </section>`;
}

/** Placeholder rows that keep a list tile's shape while it loads. */
export function skeletonRows(count, { meta = false, widths = [62, 48, 70, 40, 55, 66, 44] } = {}) {
  return Array.from({ length: count }, (_, index) => html`<li class="jb-row${meta ? " jb-row--meta" : ""}" aria-hidden="true">
    <span class="jb-check"><span></span></span><span class="jb-skel" style="max-width:${widths[index % widths.length]}%"></span><span class="jb-skel jb-skel--pill"></span>
  </li>`);
}

export const DASH = "—";

/**
 * Re-render `root` from `render()`, keeping the values of inputs (by id),
 * the focused control (by id or data-key) and the caret.
 */
export function painter(root, render) {
  return function paint() {
    const active = document.activeElement;
    const inside = active && root.contains(active);
    const focus = inside && (active.id ? `#${CSS.escape(active.id)}` : active.dataset.key ? `[data-key="${CSS.escape(active.dataset.key)}"]` : null);
    const caret = inside && active instanceof HTMLInputElement ? [active.selectionStart, active.selectionEnd] : null;
    const values = new Map([...root.querySelectorAll("input[id]")].map((input) => [input.id, input.value]));

    root.innerHTML = String(render());

    for (const [id, value] of values) {
      const input = root.querySelector(`#${CSS.escape(id)}`);
      if (input) input.value = value;
    }
    if (focus) {
      const target = root.querySelector(focus);
      target?.focus({ preventScroll: true });
      if (caret && target instanceof HTMLInputElement) target.setSelectionRange(...caret);
    }
  };
}
