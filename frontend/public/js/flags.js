// The quick-add flag grammar from the design's data.md. The API reads nothing
// out of free text, so a one-line entry is split into body keys here. This is
// a split on flags, as a shell would split the line, not language parsing.

const GRAMMARS = {
  task: { flags: { "-d": "d", "--due": "d", "--date": "d", "--deadline": "d", "-p": "p", "--priority": "p", "-t": "t", "--tag": "t", "--tags": "t" } },
  time: { lead: "time", rest: "work", flags: { "-d": "d", "--date": "d", "-t": "t", "--tag": "t" } },
  spend: { lead: "amount", rest: "title", flags: { "-n": "n", "--note": "n", "-d": "d", "--date": "d", "-t": "t", "--tag": "t" } },
};

export const PLACEHOLDERS = {
  task: "pay rent -d fri -t finance",
  time: "1h30m code review -t work",
  spend: "50k lunch with the team -t food",
};

const MISSING = {
  title: "Type a title first.",
  time: "Start with a duration, like 1h30m.",
  work: "Say what you worked on after the duration.",
  amount: "Start with an amount, like 50k.",
  spendTitle: "Say what it was for after the amount.",
};

export class FlagError extends Error {}

/** Split like a shell: spaces separate, and "…" or '…' is one token. */
export function tokenize(text) {
  const tokens = [];
  for (const match of String(text).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}

/**
 * Turn a line such as `pay rent -d fri -t finance` into a request body for
 * `kind` (task, time or spend). Throws FlagError with a short note when a
 * required part is missing.
 */
export function parseEntry(kind, text) {
  const grammar = GRAMMARS[kind];
  const words = [];
  const body = {};
  const tokens = tokenize(text);
  for (let index = 0; index < tokens.length; index++) {
    const key = grammar.flags[tokens[index]];
    if (!key) {
      words.push(tokens[index]);
      continue;
    }
    const value = tokens[++index];
    if (value === undefined) throw new FlagError(`${tokens[index - 1]} needs a value.`);
    if (key === "t" && kind === "task") (body.t ??= []).push(value);
    else body[key] = value;
  }

  if (kind === "task") {
    body.title = words.join(" ");
    if (!body.title) throw new FlagError(MISSING.title);
    return body;
  }
  const [lead, ...rest] = words;
  if (!lead) throw new FlagError(kind === "time" ? MISSING.time : MISSING.amount);
  if (!rest.length) throw new FlagError(kind === "time" ? MISSING.work : MISSING.spendTitle);
  body[grammar.lead] = lead;
  body[grammar.rest] = rest.join(" ");
  return body;
}

/** Split a tags field ("work, jasem" or "work jasem") into a list. */
export function tagList(text) {
  return String(text).split(/[\s,]+/).filter(Boolean);
}
