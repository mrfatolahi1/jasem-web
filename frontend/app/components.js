"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const API = "/api";

const icons = {
  grid: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  coin: <><circle cx="12" cy="12" r="8" /><path d="M12 7v10M15 9.5c-.7-.8-1.6-1.2-2.8-1.2-1.4 0-2.4.7-2.4 1.7 0 2.8 5.7 1.1 5.7 4 0 1.1-1 1.8-2.5 1.8-1.2 0-2.3-.4-3-1.2" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 5 5" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  chevron: <path d="m8 10 4 4 4-4" />,
};

export function Icon({ name, size = 17 }) { return <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>; }

export function Brand() { return <Link className="brand" href="/"><span className="mosaic">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</span><span>jasem</span></Link>; }

const navItems = [["/", "grid", "Today"], ["/tasks", "check", "Tasks"], ["/time", "clock", "Time"], ["/spending", "coin", "Spending"]];

export function Shell({ children, lists = [] }) {
  const pathname = usePathname();
  return <div className="app-shell"><aside className="sidebar"><Brand /><div className="side-label">your day</div><nav className="side-nav">{navItems.map(([href, icon, label]) => <Link className={pathname === href ? "active" : ""} href={href} key={href}><Icon name={icon} />{label}{pathname === href && <span className="nav-mark" />}</Link>)}</nav>{lists.length > 0 && <><div className="side-label lists-label">task lists</div><div className="side-lists">{lists.map(list => <Link href={`/tasks?list=${encodeURIComponent(list.name)}`} key={list.name || "default"}><span className="list-dot" />{list.label}<b>{list.open_count}</b></Link>)}</div></>}<div className="side-foot"><span className="pulse" />local only<br /><small>markdown-backed</small></div></aside><div className="mobile-head"><Brand /><Link href="/tasks" aria-label="Add task" className="mobile-add"><Icon name="plus" /></Link></div><main className="content">{children}</main></div>;
}

export function PageHeader({ eyebrow, title, detail, action }) { return <header className="page-header"><div><div className="eyebrow"><span className="eyebrow-block" />{eyebrow}</div><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</header>; }

export function CommandBar({ placeholder, onSubmit, parsed, error, button = "Capture" }) {
  const [text, setText] = useState("");
  async function submit(event) { event.preventDefault(); if (!text.trim()) return; const ok = await onSubmit(text.trim()); if (ok) setText(""); }
  return <div className="command-wrap"><form className="command-bar" onSubmit={submit}><span className="command-symbol">›</span><input value={text} onChange={event => setText(event.target.value)} placeholder={placeholder} /><button type="submit">{button}<Icon name="arrow" size={15} /></button></form>{error && <div className="notice">{error}</div>}{parsed && <div className="parsed"><span className="parsed-label">parsed</span><strong>{parsed.title || parsed.work || parsed.description || "entry"}</strong>{parsed.deadline && <span>due {parsed.deadline}</span>}{parsed.priority && <span>{parsed.priority}</span>}{parsed.tags?.length > 0 && <span>#{parsed.tags.join(" #")}</span>}{parsed.time_text && <span>{parsed.time_text}</span>}{parsed.amount_text && <span>{parsed.amount_text}</span>}</div>}</div>;
}

export function Segmented({ items, value, onChange }) { return <div className="segmented">{items.map(([key, label]) => <button className={value === key ? "active" : ""} key={key} onClick={() => onChange(key)}>{label}</button>)}</div>; }

export function TaskRow({ task, onToggle, onDelete, onEdit, onMove }) { return <div className={`task-row ${task.done ? "is-done" : ""}`}><button aria-label={task.done ? "Mark open" : "Mark done"} className={`task-check ${task.done ? "done" : ""}`} onClick={() => onToggle(task)}>{task.done && <Icon name="check" size={12} />}</button><div className="task-copy"><div className="task-name"><span className={`priority-pip ${task.priority}`} />{task.title}</div><div className="task-meta"><span>{task.deadline || "no deadline"}</span>{task.tags.map(tag => <span className="tag" key={tag}>#{tag}</span>)}</div></div><div className="task-actions">{onEdit && <button onClick={() => onEdit(task)}>edit</button>}{onMove && <button onClick={() => onMove(task)}>move</button>}<button onClick={() => onDelete(task.id)}>remove</button></div></div>; }

export function ListRail({ lists, selected, onSelect, onCreate }) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState("");
  async function create(event) { event.preventDefault(); if (!name.trim()) return; await onCreate(name.trim()); setName(""); setCreating(false); }
  return <aside className="list-rail"><div className="rail-head"><span>Lists</span><button aria-label="Create list" onClick={() => setCreating(!creating)}><Icon name="plus" size={15} /></button></div>{creating && <form className="list-create" onSubmit={create}><input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="list name" /><button type="submit">create</button></form>}<div className="rail-items">{lists.map(list => <button className={selected === list.name ? "active" : ""} onClick={() => onSelect(list.name)} key={list.name || "default"}><span><i className="list-dot" />{list.label}</span><b>{list.open_count}</b></button>)}</div><p className="rail-note">A list is created by its first task.</p></aside>;
}

export function BarTrend({ values, color = "blue", labels = true }) { const max = Math.max(...values, 1); return <div className="trend"><div className="bars">{values.map((value, i) => <span className={`bar ${color}`} key={i} style={{ height: `${Math.max(4, value / max * 100)}%` }} title={`${value}`} />)}</div>{labels && <div className="bar-labels"><span>6 days ago</span><span>today</span></div>}</div>; }
export function Stat({ value, label, accent = "" }) { return <div className={`stat-line ${accent}`}><span>{label}</span><strong>{value}</strong></div>; }
export function EmptyState({ title, detail, action }) { return <div className="empty-state"><span className="empty-glyph">＋</span><div><strong>{title}</strong><p>{detail}</p></div>{action}</div>; }
export function InlineEdit({ fields, onSave, onCancel }) { const [values, setValues] = useState(Object.fromEntries(fields.map(field => [field.key, field.value ?? ""]))); return <div className="inline-edit">{fields.map(field => <label key={field.key}>{field.label}<input value={values[field.key]} onChange={event => setValues({ ...values, [field.key]: event.target.value })} /></label>)}<div><button className="save" onClick={() => onSave(values)}>save</button><button className="cancel" onClick={onCancel}>cancel</button></div></div>; }
