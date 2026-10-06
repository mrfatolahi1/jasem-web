// Compile design/tokens.json (the Jasem Bento design system's tokens) into
// public/styles/tokens.css, the way the design system compiles it:
// colours per theme, then every other family and the font stacks on :root,
// then one class per type style.
//
//   node scripts/tokens.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "design/tokens.json"), "utf8"));

const alias = (value) => value.replace(/^\{(.+)\}$/, "var(--$1)");
const colour = (value) => (value.startsWith("#") ? value.toLowerCase() : alias(value));
const length = (value) => (typeof value === "number" ? `${value}px` : value);

const themes = tokens.color.themes.map((theme) => theme.id);
const valueFor = (token, theme) =>
  typeof token.value === "string" ? (theme === themes[0] ? token.value : undefined)
    : token.value[theme] ?? (theme === themes[0] ? Object.values(token.value)[0] : undefined);

const lines = [`/* Generated from design/tokens.json by scripts/tokens.mjs. Do not edit. */`, ""];

themes.forEach((theme, index) => {
  const selector = index === 0 ? `:root, [data-theme="${theme}"]` : `[data-theme="${theme}"]`;
  const declarations = tokens.color.tokens
    .map((token) => [token.name, valueFor(token, theme)])
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `  --${name}: ${colour(value)};`);
  lines.push(`${selector} {`, ...declarations, "}", "");
});

const families = Object.entries(tokens)
  .filter(([key, family]) => !["name", "version", "color", "type"].includes(key) && family?.tokens);
lines.push(":root {");
for (const [, family] of families) {
  for (const token of family.tokens) lines.push(`  --${token.name}: ${length(token.value)};`);
}
for (const [key, stack] of Object.entries(tokens.type.families)) lines.push(`  --font-${key}: ${stack};`);
lines.push("}", "");

for (const group of tokens.type.groups) {
  for (const style of group.styles) {
    const rules = [
      `font-family: var(--font-${style.family ?? group.family});`,
      `font-size: ${length(style.fontSize)};`,
      style.lineHeight !== undefined && `line-height: ${style.lineHeight};`,
      style.fontWeight !== undefined && `font-weight: ${style.fontWeight};`,
      style.letterSpacing !== undefined && `letter-spacing: ${length(style.letterSpacing)};`,
    ].filter(Boolean);
    lines.push(`.${style.name} { ${rules.join(" ")} }`);
  }
}

writeFileSync(join(root, "public/styles/tokens.css"), lines.join("\n") + "\n");
console.log("wrote public/styles/tokens.css");
