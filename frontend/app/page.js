"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API, BarTrend, EmptyState, PageHeader, Shell, Stat, TaskRow } from "./components";

export default function Dashboard() {
  const [data, setData] = useState(null); const [lists, setLists] = useState([]); const [error, setError] = useState("");
  async function load() { try { const [dashboard, listResponse] = await Promise.all([fetch(`${API}/dashboard/`), fetch(`${API}/tasks/lists/`)]); if (!dashboard.ok || !listResponse.ok) throw new Error("Could not load your day"); setData(await dashboard.json()); setLists((await listResponse.json()).lists); } catch (err) { setError(err.message); } }
  useEffect(() => { load(); }, []);
  if (error) return <Shell><div className="notice">{error}. Check that Django is running on port 8000.</div></Shell>;
  if (!data) return <Shell><div className="eyebrow">loading your day…</div></Shell>;
  async function toggle(task) { await fetch(`${API}/tasks/${task.id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !task.done }) }); load(); }
  async function remove(id) { await fetch(`${API}/tasks/${id}/`, { method: "DELETE" }); load(); }
  return <Shell lists={lists}><PageHeader eyebrow={`${data.date} / local time`} title={new Date(`${data.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })} detail="A calm read of what needs attention, what you spent, and where your time went." action={<Link className="text-link" href="/tasks">capture something new →</Link>} /><div className="stat-strip"><Stat value={data.open_count} label="open tasks" accent="orange" /><Stat value={`${data.tracked_today}m`} label="tracked today" accent="blue" /><Stat value={data.spent_today.toLocaleString()} label="spent today" accent="gold" /></div><div className="dashboard-grid"><section className="focus-block"><div className="section-head"><h2>Focus queue</h2><span>due first, then soonest</span></div>{data.tasks.length ? data.tasks.map(task => <TaskRow key={task.id} task={task} onToggle={toggle} onDelete={remove} />) : <EmptyState title="Inbox zero." detail="The next move is yours." action={<Link className="text-link" href="/tasks">add a task</Link>} />}</section><section className="trend-block"><div className="trend-title"><span>tracked time / last 7 days</span><b>{data.tracked_today}m today</b></div><BarTrend values={data.time_trend} /></section></div><section className="section"><div className="section-head"><h2>Your lists</h2><Link className="text-link" href="/tasks">manage lists →</Link></div><div className="report-grid">{lists.map(list => <Link className="report-card list-card" href={`/tasks?list=${encodeURIComponent(list.name)}`} key={list.name || "default"}><h3><i className="list-dot" />{list.label}</h3><p><strong>{list.open_count}</strong> open · {list.total_count} total</p></Link>)}</div></section><div className="footer-note">jasem dashboard · the same focus logic as <span className="mono">jasem</span> with no network calls</div></Shell>;
}
