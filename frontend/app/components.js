"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const API = "/api";

export function Brand() { return <Link className="brand" href="/"><span className="mosaic">{Array.from({length: 9}, (_, i) => <i key={i} />)}</span>jasem</Link>; }

export function Shell({ children }) {
  const pathname = usePathname();
  const links = [["/", "Dashboard"], ["/tasks", "Tasks"], ["/time", "Time"], ["/spending", "Spending"]];
  return <div className="shell"><header className="topbar"><Brand /><nav className="nav">{links.map(([href, label]) => <Link className={pathname === href ? "active" : ""} href={href} key={href}>{label}</Link>)}</nav></header><main className="main">{children}</main><footer className="footer">local companion · reads ~/.jasem · plain markdown in, plain markdown out</footer></div>;
}

export function QuickAdd({ placeholder, onSubmit, parsed, error }) {
  const [text, setText] = React.useState("");
  async function submit(event) { event.preventDefault(); if (!text.trim()) return; const ok = await onSubmit(text.trim()); if (ok) setText(""); }
  return <><form className="quick-add" onSubmit={submit}><input value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} /><button className="button" type="submit">Add</button></form>{error && <div className="notice">{error}</div>}{parsed && <div className="parsed"><b>Understood</b><span>{parsed.title || parsed.work || parsed.description || "entry"}</span>{parsed.deadline && <span>due {parsed.deadline}</span>}{parsed.priority && <span>{parsed.priority} priority</span>}{parsed.tags?.length > 0 && <span>#{parsed.tags.join(" #")}</span>}{parsed.time_text && <span>{parsed.time_text}</span>}{parsed.amount_text && <span>{parsed.amount_text}</span>}</div>}</>;
}

export function Filters({ items, value, onChange }) { return <div className="filters">{items.map(item => <button className={`filter ${value === item[0] ? "active" : ""}`} key={item[0]} onClick={() => onChange(item[0])}>{item[1]}</button>)}</div>; }

export function TaskRow({ task, onToggle, onDelete }) { return <div className="task-row"><button aria-label={task.done ? "Mark open" : "Mark done"} className={`task-check ${task.done ? "done" : ""}`} onClick={() => onToggle(task)} /><div className={`task-title ${task.done ? "done" : ""}`}><span className={`pip ${task.priority}`} />{task.title}<div className="tags">{task.tags.map(tag => <span className="tag" key={tag}>#{tag}</span>)}</div></div><span className="meta deadline">{task.deadline || "no deadline"}</span><button className="button danger" onClick={() => onDelete(task.id)}>delete</button></div>; }

export function BarTrend({ values, color = "blue" }) { const max = Math.max(...values, 1); return <><div className="bars">{values.map((value, i) => <span className={`bar ${color === "gold" ? "gold" : ""}`} key={i} style={{height: `${Math.max(3, value / max * 100)}%`}} />)}</div><div className="bar-labels"><span>6 days ago</span><span>today</span></div></>; }

export function Stat({ value, label }) { return <div className="stat"><time>{value}</time><label>{label}</label></div>; }

import React from "react";
