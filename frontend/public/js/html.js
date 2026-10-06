// A tagged template that escapes every interpolated value, so titles, tags and
// notes from jasem's files can never become markup. Nested html`` results and
// arrays of them are inserted as they are.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

class Markup {
  constructor(text) { this.text = text; }
  toString() { return this.text; }
}

function encode(value) {
  if (value == null || value === false) return "";
  if (value instanceof Markup) return value.text;
  if (Array.isArray(value)) return value.map(encode).join("");
  return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

export function html(strings, ...values) {
  let text = strings[0];
  values.forEach((value, index) => { text += encode(value) + strings[index + 1]; });
  return new Markup(text);
}

/** An optional attribute: ` name="value"`, ` name` for true, nothing for false or null. */
export function attr(name, value) {
  if (value == null || value === false) return new Markup("");
  return new Markup(value === true ? ` ${name}` : ` ${name}="${encode(value)}"`);
}
