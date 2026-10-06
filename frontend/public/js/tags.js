// Tag colours. A tag takes one of the five logo colours from a stable hash of
// its lowercase name: ["blue","orange","gold","plum","red"][hash(tag) % 5].
// The hash is FNV-1a with a murmur3 finish; its seed is chosen so the design's
// sample tags keep their mockup colours (work blue, finance orange, travel
// gold, admin plum, health red, food orange, home plum, …).

export const TAG_COLOURS = ["blue", "orange", "gold", "plum", "red"];

const SEED = 4980013;

function hash(text) {
  let h = SEED;
  for (let index = 0; index < text.length; index++) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function tagColour(tag) {
  return TAG_COLOURS[hash(String(tag).toLowerCase()) % TAG_COLOURS.length];
}

/** The `--tag` style for a checkbox or marker; none (ink-muted) without a tag. */
export function tagStyle(tag) {
  return tag ? `--tag:var(--${tagColour(tag)})` : "";
}

/**
 * Colours for a report's tags, largest first. The first `distinct` tags fill
 * tiles that sit side by side, and two tiles of one colour may not share a
 * row, so a tag whose colour is taken there moves to the next free colour.
 */
export function reportColours(tags, distinct = 3) {
  const colours = new Map();
  const used = new Set();
  tags.forEach((tag, index) => {
    let colour = tagColour(tag);
    if (index < distinct && used.has(colour)) {
      colour = TAG_COLOURS.find((candidate) => !used.has(candidate)) ?? colour;
    }
    if (index < distinct) used.add(colour);
    colours.set(tag, colour);
  });
  return colours;
}
