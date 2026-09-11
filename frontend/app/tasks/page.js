"use client";
import { useEffect, useState } from "react";
import { API, Filters, QuickAdd, Shell, TaskRow } from "../components";

export default function Tasks() {
  const [view, setView] = useState("open"); const [tasks, setTasks] = useState([]); const [parsed, setParsed] = useState(null); const [error, setError] = useState("");
  async function load() { try { const response = await fetch(`${API}/tasks/?view=${view}`); if (!response.ok) throw new Error("Could not load tasks"); setTasks((await response.json()).tasks); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, [view]);
  async function add(text) { setError(""); const response = await fetch(`${API}/tasks/`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({text})}); if (!response.ok) { setError((await response.json()).error || "Could not add task"); return false; } setParsed((await response.json()).task); await load(); return true; }
  async function toggle(task) { await fetch(`${API}/tasks/${task.id}/`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({done: !task.done})}); load(); }
  async function remove(id) { await fetch(`${API}/tasks/${id}/`, {method: "DELETE"}); load(); }
  return <Shell><section className="intro"><div><p className="eyebrow">todo · {view}</p><h1>Tasks</h1><p>Write it like you would tell a person. Jasem extracts deadlines, priority, and tags.</p></div></section><QuickAdd placeholder='e.g. review the release next Friday, high priority, work' onSubmit={add} parsed={parsed} error={error} /><section className="section"><div className="section-head"><h2>{view === "open" ? "Open tasks" : view[0].toUpperCase() + view.slice(1)}</h2><span>{tasks.length} items</span></div><Filters value={view} onChange={setView} items={[["open", "open"], ["today", "today"], ["week", "week"], ["overdue", "overdue"], ["all", "all"]]} />{tasks.length ? tasks.map(task => <TaskRow key={task.id} task={task} onToggle={toggle} onDelete={remove} />) : <div className="empty"><strong>Nothing here yet.</strong>Try adding a task above.</div>}</section></Shell>;
}

