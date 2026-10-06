// jasem-web: four pages (Today, Tasks, Time, Spending) plus help, routed by
// path. Each page module renders into #app and talks to /api/.

import { loadConfig } from "./api.js";
import { setCalendar } from "./format.js";
import help from "./pages/help.js";
import spending from "./pages/spending.js";
import tasks from "./pages/tasks.js";
import time from "./pages/time.js";
import today from "./pages/today.js";
import { closeSheet } from "./sheet.js";
import { onTabKeys } from "./ui.js";

const PAGES = { "/": today, "/tasks": tasks, "/time": time, "/spending": spending, "/help": help };
const root = document.getElementById("app");
let unmount = null;

function withParams(path, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

function navigate(url, { replace = false } = {}) {
  history[replace ? "replaceState" : "pushState"](null, "", url);
  render();
}

const context = {
  get params() { return new URLSearchParams(location.search); },
  /** Go to another page (or this one with new parameters), re-rendering it. */
  go: (path, params) => navigate(withParams(path, params)),
  /** Record this page's view in the URL without re-rendering it. */
  remember(params) {
    const merged = Object.fromEntries(new URLSearchParams(location.search));
    history.replaceState(null, "", withParams(location.pathname, { ...merged, ...params }));
  },
};

function render() {
  closeSheet();
  unmount?.();
  root.onclick = root.onsubmit = root.oninput = root.onchange = null;
  const page = PAGES[location.pathname] ?? today;
  document.title = page === today ? "jasem" : `${page.title} · jasem`;
  unmount = page.mount(root, context);
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !(url.pathname in PAGES)) return;
  event.preventDefault();
  if (url.pathname + url.search !== location.pathname + location.search) navigate(url.pathname + url.search);
});
window.addEventListener("popstate", render);
root.addEventListener("keydown", onTabKeys);

loadConfig()
  .then((config) => setCalendar(config.calendar), () => {})
  .finally(render);
