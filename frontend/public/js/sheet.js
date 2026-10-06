// The edit sheet and the lists manager (screens.md, "Recipes"): a white tile,
// radius 28, padding 22, opened over the grid as a centred dialog. It holds
// the add form's fields, pre-filled, saves with PATCH, and shows the API's
// error text under the field it names.

import { attr, html } from "./html.js";

let dialog;

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.className = "jb-root jb-sheet";
  dialog.setAttribute("aria-labelledby", "sheet-heading");
  document.body.append(dialog);
  // A press on the backdrop (outside the tile) closes the sheet.
  dialog.addEventListener("pointerdown", (event) => {
    const box = dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === dialog && outside) dialog.close();
  });
  return dialog;
}

function open(markup) {
  const sheet = ensureDialog();
  sheet.innerHTML = String(markup);
  sheet.onclick = sheet.onsubmit = sheet.onkeydown = null;
  if (!sheet.open) sheet.showModal();
  return sheet;
}

function head(title) {
  return html`<div class="jb-list-head">
    <h2 id="sheet-heading" class="jb-h2">${title}</h2>
    <button type="button" class="jb-more jb-plain" data-sheet="close">Close</button>
  </div>`;
}

/**
 * Open the edit sheet.
 *
 * spec.fields: [{ key, label, value, placeholder, wide, clear }] where `clear`
 *   is the word that empties the field (fields without it are sent as typed).
 * spec.fieldFor(message): the key of the field an API error is about.
 * spec.save(changes): PATCH the changed keys.
 * spec.actions: [{ label, run }] extra buttons (Done, Reopen).
 * spec.move: { lists: [names], run(target) } for tasks.
 * spec.remove(): delete the item.
 * spec.onChange(): refresh the page after any success.
 */
export function openEditor(spec) {
  const sheet = open(html`<form novalidate>
    ${head(spec.heading)}
    <div class="jb-fields">
      ${spec.fields.map((field) => html`<div class="jb-field${field.wide ? " jb-field--wide" : ""}">
        <label class="jb-label jb-label--muted" for="sheet-${field.key}">${field.label}</label>
        <input id="sheet-${field.key}" name="${field.key}" class="jb-input jb-input--l" value="${field.value ?? ""}" placeholder="${field.placeholder ?? ""}" autocomplete="off" aria-describedby="sheet-${field.key}-error">
        <p id="sheet-${field.key}-error" class="jb-field-error" hidden></p>
      </div>`)}
    </div>
    <p id="sheet-error" class="jb-field-error" role="alert" hidden style="margin-bottom:12px"></p>
    <div class="jb-sheet-actions">
      <button type="submit" class="jb-btn jb-btn--ink">Save</button>
      ${(spec.actions ?? []).map((action, index) => html`<button type="button" class="jb-btn jb-btn--outline" data-sheet="action" data-index="${index}">${action.label}</button>`)}
      ${spec.move ? html`<button type="button" class="jb-btn jb-btn--outline" data-sheet="move" aria-expanded="false" aria-controls="sheet-move-row">Move to list…</button>` : ""}
      <button type="button" class="jb-btn jb-btn--danger" data-sheet="delete">Delete</button>
    </div>
    ${spec.move ? html`<div id="sheet-move-row" class="jb-move" hidden>
      <input id="sheet-move" class="jb-input jb-input--l" list="sheet-lists" placeholder="list name" aria-label="Move to list" autocomplete="off">
      <datalist id="sheet-lists">${spec.move.lists.map((name) => html`<option value="${name}">`)}</datalist>
      <button type="button" class="jb-btn jb-btn--ink" data-sheet="move-go">Move</button>
    </div>` : ""}
  </form>`);

  const form = sheet.querySelector("form");
  const initial = Object.fromEntries(spec.fields.map((field) => [field.key, String(field.value ?? "")]));

  const showError = (message) => {
    for (const note of sheet.querySelectorAll(".jb-field-error")) note.hidden = true;
    const key = spec.fieldFor?.(message);
    const note = (key && sheet.querySelector(`#sheet-${key}-error`)) || sheet.querySelector("#sheet-error");
    note.textContent = message;
    note.hidden = false;
    if (key) sheet.querySelector(`#sheet-${key}`)?.focus();
  };

  const run = async (work) => {
    const buttons = [...sheet.querySelectorAll("button")];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      await work();
      sheet.close();
      spec.onChange?.();
    } catch (error) {
      showError(error.message);
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  };

  form.onsubmit = (event) => {
    event.preventDefault();
    const changes = {};
    for (const field of spec.fields) {
      const value = form.elements[field.key].value.trim();
      if (value === initial[field.key].trim()) continue;
      changes[field.key] = value === "" && field.clear ? field.clear : value;
    }
    if (!Object.keys(changes).length) {
      sheet.close();
      return;
    }
    run(() => spec.save(changes));
  };

  sheet.onclick = (event) => {
    const button = event.target.closest("[data-sheet]");
    if (!button) return;
    const what = button.dataset.sheet;
    if (what === "close") sheet.close();
    if (what === "action") run(() => spec.actions[Number(button.dataset.index)].run());
    if (what === "move") {
      const row = sheet.querySelector("#sheet-move-row");
      row.hidden = !row.hidden;
      button.setAttribute("aria-expanded", String(!row.hidden));
      if (!row.hidden) sheet.querySelector("#sheet-move").focus();
    }
    if (what === "move-go") moveTo(sheet.querySelector("#sheet-move").value.trim());
    if (what === "delete") {
      if (button.dataset.armed) run(() => spec.remove());
      else {
        button.dataset.armed = "yes";
        button.textContent = "Delete for good";
      }
    }
  };

  const moveTo = (target) => {
    if (!target) {
      showError("Name the list to move to.");
      return;
    }
    run(() => spec.move.run(target));
  };

  sheet.querySelector("#sheet-move")?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    moveTo(event.target.value.trim());
  });

  sheet.querySelector(`#sheet-${spec.fields[0].key}`).focus();
}

/**
 * The lists manager: one row per list (label, open / total) and a "New list"
 * pill input. A list exists once a task is added to it, so a new list is just
 * a switch to its name.
 */
export function openLists({ lists, current, pick }) {
  const sheet = open(html`<div>
    ${head("Lists")}
    <ul class="jb-rows">
      ${lists.map((list) => html`<li class="jb-row"${attr("aria-current", list.name === current && "true")}>
        <button type="button" class="jb-plain" data-list="${list.name || "default"}">${list.label}</button>
        <span class="jb-due">${list.open_count} / ${list.total_count}</span>
      </li>`)}
    </ul>
    <form class="jb-form" novalidate>
      <label for="new-list" class="jb-form-label">New list</label>
      <div class="jb-input-row">
        <input id="new-list" class="jb-input jb-input--l" placeholder="name, like errands" autocomplete="off" aria-describedby="new-list-error">
        <button type="submit" class="jb-submit">Open</button>
      </div>
      <p id="new-list-error" class="jb-field-error" hidden></p>
    </form>
  </div>`);

  sheet.onclick = (event) => {
    if (event.target.closest('[data-sheet="close"]')) sheet.close();
    const row = event.target.closest("[data-list]");
    if (!row) return;
    sheet.close();
    pick(row.dataset.list);
  };
  sheet.onsubmit = (event) => {
    event.preventDefault();
    const name = sheet.querySelector("#new-list").value.trim().replace(/^@/, "");
    const note = sheet.querySelector("#new-list-error");
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      note.textContent = name ? "Use letters, digits, - and _." : "Type a name first.";
      note.hidden = false;
      return;
    }
    sheet.close();
    pick(name);
  };
  sheet.querySelector("#new-list").focus();
}

export function closeSheet() {
  if (dialog?.open) dialog.close();
}
