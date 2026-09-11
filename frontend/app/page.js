"use client";
import { useEffect, useState } from "react";
import { API, BarTrend, Shell, Stat, TaskRow } from "./components";
import Link from "next/link";

export default function Dashboard() {
  const [data, setData] = useState(null); const [error, setError] = useState("");
  async function load() { try { const response = await fetch(`${API}/dashboard/`); if (!response.ok) throw new Error("Could not load dashboard"); setData(await response.json()); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  if (error) return <Shell><div className="notice">{error}. Start Django on port 8000.</div></Shell>;
  if (!data) return <Shell><p className="meta">loading dashboard…</p></Shell>;
  return <Shell><section className="intro"><div><p className="eyebrow">{data.date} · local view</p><h1>Make room<br />for the work.</h1><p>One quiet place for tasks, time, and spending. Everything here stays in jasem’s Markdown files.</p></div><Link className="button" href="/tasks">Add a task</Link></section><section className="section"><div className="section-head"><h2>Focus</h2><span>{data.open_count} open</span></div>{data.tasks.length ? <div>{data.tasks.map(task => <TaskRow key={task.id} task={task} onToggle={async t => { await fetch(`${API}/tasks/${t.id}/`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({done: !t.done})}); load(); }} onDelete={async id => { await fetch(`${API}/tasks/${id}/`, {method: "DELETE"}); load(); }} />)}</div> : <div className="empty"><strong>Inbox zero.</strong>Add the next thing you want to move.</div>}</section><section className="section"><div className="section-head"><h2>Today</h2><span>last 7 days</span></div><div className="grid-3"><Stat value={`${data.tracked_today}m`} label="tracked time" /><Stat value={data.spent_today.toLocaleString()} label="spent" /><div><BarTrend values={data.time_trend} /></div></div></section></Shell>;
}

