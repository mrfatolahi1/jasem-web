// The design's data.md rules: formats, due labels, shares, the quick-add
// grammar and tag colours.   npm test

import assert from "node:assert/strict";
import { test } from "node:test";

import { FlagError, parseEntry, tagList, tokenize } from "../public/js/flags.js";
import * as f from "../public/js/format.js";
import { reportColours, tagColour } from "../public/js/tags.js";

test("durations and amounts use jasem's formats", () => {
  assert.equal(f.formatMinutes(210), "3h 30min");
  assert.equal(f.formatMinutes(45), "45min");
  assert.equal(f.formatMinutes(240), "4h");
  assert.equal(f.formatMinutes(0), "0min");
  assert.equal(f.chartMinutes(150), "2h 30");
  assert.equal(f.chartMinutes(45), "45m");
  assert.equal(f.shortMinutes(172), "2h 52m");
  assert.equal(f.formatAmount(2395000), "2,395,000");
  assert.equal(f.formatAmount(1234.5), "1,234.5");
  assert.equal(f.chartAmount(1200000), "1.2m");
  assert.equal(f.chartAmount(95000), "95k");
  assert.equal(f.chartAmount(999600), "1m");
});

test("a figure sets its last unit or digit group small", () => {
  const figure = (text) => String(f.figure(text));
  assert.equal(figure("3h 30min"), "3h 30<small>min</small>");
  assert.equal(figure("17h 15min"), "17h 15<small>min</small>");
  assert.equal(figure("2h 52m"), "2h 52<small>m</small>");
  assert.equal(figure("230,000"), "230<small>,000</small>");
  assert.equal(figure("2,395,000"), "2,395<small>,000</small>");
  assert.equal(figure("0"), "0");
});

test("due labels", () => {
  const today = "2026-10-05"; // a Monday
  assert.equal(f.dueLabel("2026-10-02", today), "3d late");
  assert.equal(f.dueLabel(today, today), "today");
  assert.equal(f.dueLabel("2026-10-06", today), "tomorrow");
  assert.equal(f.dueLabel("2026-10-07", today), "Wed");
  assert.equal(f.dueLabel("2026-10-12", today), "Mon 12");
  assert.equal(f.dueLabel("", today), "someday");
  assert.equal(f.dueWords("2026-10-02", today), "3 days late");
  assert.equal(f.dueWords(today, today), "due today");
  assert.equal(f.since("2026-10-02", today), "since Fri");
  assert.equal(f.dueState("2026-10-02", today), "jb-due--overdue");
  assert.equal(f.dueState(today, today), "jb-due--today");
});

test("dates and windows", () => {
  assert.equal(f.longDate("2026-10-05", "Monday"), "Monday, 5 October");
  assert.equal(f.range("2026-09-29", "2026-10-05"), "29 Sep – 5 Oct");
  assert.equal(f.range("2025-12-30", "2026-01-02"), "30 Dec 2025 – 2 Jan 2026");
  assert.equal(f.weekdayDayMonth("2026-09-29"), "Tue 29 Sep");
  assert.equal(f.change(1035, 900, "week"), "+15% on last week");
  assert.equal(f.change(800, 1000, "month"), "−20% on last month");
  assert.equal(f.change(100, 0, "all"), "");
});

test("tag shares add up to 100, as on the report previews", () => {
  assert.deepEqual(f.shares([690, 225, 120]), [67, 22, 11]);
  assert.deepEqual(f.shares([1200000, 640000, 270000, 145000, 140000]).slice(0, 3), [50, 27, 11]);
  assert.deepEqual(f.shares([0, 0]), [0, 0]);
});

test("quick add splits on flags like a shell", () => {
  assert.deepEqual(tokenize('pay "the rent" -d fri'), ["pay", "the rent", "-d", "fri"]);
  assert.deepEqual(parseEntry("task", "pay rent -d fri -t finance -t home -p h"),
    { title: "pay rent", d: "fri", t: ["finance", "home"], p: "h" });
  assert.deepEqual(parseEntry("task", 'renew passport -d "next fri"'), { title: "renew passport", d: "next fri" });
  assert.deepEqual(parseEntry("time", "1h30m code review -t work -d yesterday"),
    { time: "1h30m", work: "code review", t: "work", d: "yesterday" });
  assert.deepEqual(parseEntry("spend", "50k lunch with the team -t food -n quarterly"),
    { amount: "50k", title: "lunch with the team", t: "food", n: "quarterly" });
  assert.throws(() => parseEntry("task", "-d fri"), FlagError);
  assert.throws(() => parseEntry("time", "45m"), FlagError);
  assert.throws(() => parseEntry("spend", "lunch -d"), FlagError);
  assert.deepEqual(tagList("work, jasem  home"), ["work", "jasem", "home"]);
});

test("tag colours keep the mockup's mapping and stay distinct on a report row", () => {
  const mockup = { work: "blue", finance: "orange", travel: "gold", admin: "plum", health: "red",
    learning: "gold", personal: "plum", gear: "blue", food: "orange", home: "plum", transport: "red" };
  for (const [tag, colour] of Object.entries(mockup)) assert.equal(tagColour(tag), colour, tag);
  assert.equal(tagColour("Work"), "blue");
  const colours = reportColours(["work", "gear", "food"]);
  assert.equal(new Set(colours.values()).size, 3);
});
