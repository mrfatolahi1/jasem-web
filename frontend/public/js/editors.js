// What the edit sheet holds for a task, a time entry and a spending record,
// and the calls behind its buttons (data.md, "Actions").

import { api } from "./api.js";
import { openEditor } from "./sheet.js";

const FIELD_RULES = [
  [/priority/i, "p"], [/deadline|\bdate\b/i, "d"], [/duration|how long/i, "time"],
  [/work on/i, "work"], [/amount/i, "amount"], [/title|what was it for/i, "title"],
  [/note|description/i, "n"], [/\btags?\b|categor/i, "t"],
];

function fieldFinder(fields) {
  const keys = new Set(fields.map((field) => field.key));
  return (message) => FIELD_RULES.find(([pattern, key]) => keys.has(key) && pattern.test(message))?.[1];
}

/** `list` is the list the task lives in ("" for the unnamed one). */
export function editTask(task, { list, lists = [], onChange }) {
  const listParam = list || "default";
  const fields = [
    { key: "title", label: "title", value: task.title, wide: true },
    { key: "d", label: "-d deadline", value: task.deadline_display || task.deadline, placeholder: "someday", clear: "none" },
    { key: "p", label: "-p priority", value: task.priority, placeholder: "med" },
    { key: "t", label: "-t tags", value: task.tags_text, placeholder: "tags", clear: "none" },
  ];
  openEditor({
    heading: `Edit task #${task.id}${list ? ` · @${list}` : ""}`,
    fields,
    fieldFor: fieldFinder(fields),
    save: (changes) => api.patch(`tasks/${task.id}/`, changes, { list: listParam }),
    actions: [task.done
      ? { label: "Reopen", run: () => api.post("tasks/done/", { ids: [task.id], done: false, list: listParam }) }
      : { label: "Done", run: () => api.post("tasks/done/", { ids: [task.id], list: listParam }) }],
    move: {
      lists: lists.map((name) => name || "default").filter((name) => name !== listParam),
      run: (target) => api.post("tasks/move/", { ids: [task.id], target, source: listParam }),
    },
    remove: () => api.post("tasks/delete/", { ids: [task.id], list: listParam }),
    onChange,
  });
}

export function editEntry(entry, { onChange }) {
  const fields = [
    { key: "work", label: "work", value: entry.work, wide: true },
    { key: "time", label: "time", value: entry.time_display, placeholder: "1h30m" },
    { key: "d", label: "-d date", value: entry.date_display || entry.date, placeholder: "today" },
    { key: "t", label: "-t tag", value: entry.tag, placeholder: "work", clear: "none" },
  ];
  openEditor({
    heading: `Edit entry #${entry.id}`,
    fields,
    fieldFor: fieldFinder(fields),
    save: (changes) => api.patch(`time/${entry.id}/`, changes),
    remove: () => api.delete(`time/${entry.id}/`),
    onChange,
  });
}

export function editRecord(record, { onChange }) {
  const fields = [
    { key: "title", label: "title", value: record.title, wide: true },
    { key: "amount", label: "amount", value: record.amount_display, placeholder: "50k" },
    { key: "d", label: "-d date", value: record.date_display || record.date, placeholder: "today" },
    { key: "t", label: "-t tag", value: record.tag, placeholder: "general", clear: "none" },
    { key: "n", label: "-n note", value: record.description, placeholder: "note", wide: true, clear: "none" },
  ];
  openEditor({
    heading: `Edit record #${record.id}`,
    fields,
    fieldFor: fieldFinder(fields),
    save: (changes) => api.patch(`spending/${record.id}/`, changes),
    remove: () => api.delete(`spending/${record.id}/`),
    onChange,
  });
}
