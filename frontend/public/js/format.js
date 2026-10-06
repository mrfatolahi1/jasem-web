// Formatting rules from the design's data.md: jasem's own duration and amount
// formats, the figure's unit suffix, due labels, and calendar-aware dates.
// Dates arrive as Gregorian ISO; in Jalali mode they are shown as Jalali.

import { html } from "./html.js";

let jalali = false;

export function setCalendar(name) {
  jalali = name === "jalali";
}

// ---------------------------------------------------------------- numbers

/** jasem's format_minutes: "1h 30min", "45min", "2h". */
export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours && rest) return `${hours}h ${rest}min`;
  return hours ? `${hours}h` : `${rest}min`;
}

/** Durations on charts and in Top lists: "3h 30", "4h", "45m". */
export function chartMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours && rest) return `${hours}h ${rest}`;
  return hours ? `${hours}h` : `${rest}m`;
}

/** A short duration for a stat figure: "2h 52m". */
export function shortMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours && rest) return `${hours}h ${rest}m`;
  return hours ? `${hours}h` : `${rest}m`;
}

/** A duration small enough for a column in a month chart: "3.5h", "45m". */
export function compactMinutes(minutes) {
  return minutes < 60 ? `${Math.round(minutes)}m` : `${Math.round(minutes / 6) / 10}h`;
}

/** jasem's format_amount: thousands commas, no trailing ".0". */
export function formatAmount(value) {
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Amounts on charts: "120k", "1.2m". */
export function chartAmount(value) {
  const trim = (number) => String(Math.round(number * 10) / 10);
  if (Math.round(value / 1e3) >= 1000) return `${trim(value / 1e6)}m`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}k`;
  return formatAmount(value);
}

/**
 * A figure with its trailing unit or last thousands group set small:
 * "3h 30min" → 3h 30<small>min</small>, "230,000" → 230<small>,000</small>.
 */
export function figure(display) {
  const text = String(display);
  const match = /^(.*?\d)\s?([a-z%]+)$/i.exec(text) ?? /^(.*\d)(,\d{3}(?:\.\d+)?)$/.exec(text);
  return match ? html`${match[1]}<small>${match[2]}</small>` : html`${text}`;
}

/**
 * Whole-number shares of a total that add up to 100: each share is rounded
 * down, and the points left over go to the largest remainders.
 */
export function shares(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!total) return values.map(() => 0);
  const exact = values.map((value) => (value / total) * 100);
  const result = exact.map(Math.floor);
  const order = exact.map((value, index) => [value - Math.floor(value), index]).sort((a, b) => b[0] - a[0]);
  let left = 100 - result.reduce((sum, value) => sum + value, 0);
  for (const [, index] of order) {
    if (left-- <= 0) break;
    result[index] += 1;
  }
  return result;
}

/** "+15% on last week"; empty when there is nothing to compare with. */
export function change(total, previous, period) {
  if (!previous) return "";
  const value = Math.round(((total - previous) / previous) * 100);
  const against = { today: "yesterday", week: "last week", month: "last month" }[period] ?? "the period before";
  return `${value < 0 ? "−" : "+"}${Math.abs(value)}% on ${against}`;
}

export const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

// ------------------------------------------------------------------ dates

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const JALALI_WEEKDAYS = ["Yek", "Do", "Seh", "Cha", "Panj", "Jom", "Sha"]; // jasem's own abbreviations
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const JALALI_MONTHS = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"];

function parts(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/** Gregorian → Jalali, the standard arithmetic (as jasem's jalali module). */
function toJalali(gy, gm, gd) {
  const before = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) + gd + before[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { year: jy, month: jm, day: jd };
}

/** The date as the configured calendar shows it. */
function local(iso) {
  const date = parts(iso);
  if (!jalali) return { ...date, monthName: MONTHS[date.month - 1], longMonth: LONG_MONTHS[date.month - 1] };
  const j = toJalali(date.year, date.month, date.day);
  return { ...j, weekday: date.weekday, monthName: JALALI_MONTHS[j.month - 1], longMonth: JALALI_MONTHS[j.month - 1] };
}

export const weekday = (iso) => (jalali ? JALALI_WEEKDAYS : WEEKDAYS)[parts(iso).weekday];
export const dayOfMonth = (iso) => local(iso).day;

/** "29 Sep" (Gregorian) or "7 Mehr" (Jalali). */
export function dayMonth(iso) {
  const date = local(iso);
  return `${date.day} ${date.monthName}`;
}

/** "Tue 29 Sep". */
export const weekdayDayMonth = (iso) => `${weekday(iso)} ${dayMonth(iso)}`;

/** The header date: "Monday, 5 October". */
export function longDate(iso, weekdayName) {
  const date = local(iso);
  return `${weekdayName}, ${date.day} ${date.longMonth}`;
}

/** A report window: "29 Sep – 5 Oct", "5 Oct", or with years when they differ. */
export function range(start, end) {
  if (start === end) return dayMonth(end);
  const from = local(start);
  const to = local(end);
  if (from.year !== to.year) return `${dayMonth(start)} ${from.year} – ${dayMonth(end)} ${to.year}`;
  return `${dayMonth(start)} – ${dayMonth(end)}`;
}

export function daysBetween(fromIso, toIso) {
  const from = parts(fromIso);
  const to = parts(toIso);
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86400000);
}

export function addDays(iso, count) {
  const date = parts(iso);
  return new Date(Date.UTC(date.year, date.month - 1, date.day + count)).toISOString().slice(0, 10);
}

/** The ISO date of today in this browser. */
export function todayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

// ------------------------------------------------------------- due labels

/** "3d late" · "today" · "tomorrow" · "Wed" · "Mon 12" · "someday". */
export function dueLabel(deadline, today) {
  if (!deadline) return "someday";
  const days = daysBetween(today, deadline);
  if (days < 0) return `${-days}d late`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 6) return weekday(deadline);
  return `${weekday(deadline)} ${dayOfMonth(deadline)}`;
}

/** The due label in words, for "Next up · 3 days late". */
export function dueWords(deadline, today) {
  if (!deadline) return "no deadline";
  const days = daysBetween(today, deadline);
  if (days < 0) return `${plural(-days, "day")} late`;
  return `due ${dueLabel(deadline, today)}`;
}

/** "since Fri" for an overdue task. */
export function since(deadline, today) {
  const days = daysBetween(deadline, today);
  if (days === 1) return "since yesterday";
  if (days <= 6) return `since ${weekday(deadline)}`;
  return `since ${weekday(deadline)} ${dayOfMonth(deadline)}`;
}

/** The due pill's state class. */
export function dueState(deadline, today) {
  if (!deadline) return "";
  if (deadline < today) return "jb-due--overdue";
  return deadline === today ? "jb-due--today" : "";
}

export const shortPriority = (priority) => ({ high: "high", medium: "med", low: "low" })[priority] ?? priority;
