// Which axe results a surface may set aside and which of them still fail the gate, shared by the
// browser gate (scripts/check-contrast.mjs, which reads the running app) and its test
// (tests/axe-review.test.ts, which pins the rule's narrowness). axe answers with two lists: the
// violations, and the items it could not judge. A surface may *name* the items it cannot be judged
// by — the rule's id, axe's own key for why it gave up, and the shape of the target — and only those
// are set aside; everything else goes to `review`, which fails the gate.
//
// Naming them per surface is the point: a rule written about one surface's own markup must not
// become a silence any other surface inherits, and the gate prints the reason and the count so a
// rule that has stopped firing shows up as a zero rather than as nothing to report.

/**
 * The mind map's node text is the one item this app's surfaces cannot be judged by. The vendored map
 * paints each node's text inside a wrapper it positions itself, and its own `pointer-events: none` on
 * that text leaves the wrapper ranked above the text it holds, which axe reads as one element
 * overlapping another and reports as `bgOverlap` rather than as a contrast ratio. Measured on the
 * running app, the item is the same with the panel's own layer open or closed, so it belongs to the
 * map's markup and not to what the gate draws over it; the pair behind it is the library's theme (the
 * node fill is the library's own `me-tpc` background), so there is no token of this app to re-measure.
 *
 * The rule is a triple — the rule's id, axe's `messageKey`, and the target's shape — so a node text
 * that stops matching, an item axe could not judge for another reason, and any new review item still
 * fail the gate. A `target` regexp must not carry the `g` flag: a stateful `lastIndex` would make the
 * match depend on how many items were read before it.
 */
export const MINDMAP_NODE_TEXT_RULE = {
  id: 'color-contrast',
  key: 'bgOverlap',
  target: /^me-tpc\[data-nodeid="[^"]+"\] > \.text$/,
  reason: 'the vendored map ranks its positioned node wrapper above its own text',
}

/**
 * The share center's table is the second item, and this one is not about a colour: at phone width the
 * table is 940px wide inside a 390px viewport (measured on the running instance), and axe's own
 * `color-contrast` throws on the header cell it lays down in it — "Element midpoint exceeds the grid
 * bounds" — because the cell it is asking about sits outside the grid axe built for the scrollable
 * area. axe files a thrown rule under its `error-occurred` check, so the surface is left unjudged
 * rather than judged, and the gate used to read that as an unreviewed item. Measured on the way to
 * this: the error is not about scroll position (the container and the window are both at 0/0 when it
 * happens) and not about the sticky header (making the header static changes nothing); forcing the
 * table to fit the width — `width: 100%` with a fixed layout — makes it disappear, which is what ties
 * it to the horizontal overflow and to nothing this app paints. It is declared on the phone pass's
 * share surface only, because desktop width fits and the same table is judged there normally.
 *
 * The triple keeps it narrow in both directions: the id, axe's `error-occurred` key (the harness
 * reports that check's id where axe gave no `messageKey`), and a header cell's shape. A judged item on
 * the same cell still fails the gate, an item filed under no key at all is not this rule, and a rule
 * error anywhere else in that surface is still reviewed.
 *
 * A `target` regexp must not carry the `g` flag here either: the match has to be the same answer every
 * time it is asked.
 */
export const SHARE_TABLE_HEADER_RULE = {
  id: 'color-contrast',
  key: 'error-occurred',
  target: /^th(:nth-child\(\d+\))?$/,
  reason: 'axe throws on the share table header at phone width instead of judging it (the table is wider than the viewport)',
}

/**
 * Splits one surface's `incomplete` list into what the surface named (`named`), what the gate's own
 * global categories cover, and what still fails (`review`). `allowed` counts the first two, so a
 * surface can be reported as measured-with-exceptions rather than as clean.
 */
export function classifyIncomplete({ incomplete, declared = [], isReviewedIncomplete }) {
  const ruleFor = (item) => declared.find((rule) => rule.id === item.id && rule.key === item.key && rule.target.test(item.target))
  const named = []
  const review = []
  let allowed = 0
  for (const item of incomplete) {
    const rule = ruleFor(item)
    if (rule) {
      named.push({ item, rule })
      allowed += 1
      continue
    }
    if (isReviewedIncomplete(item)) {
      allowed += 1
      continue
    }
    review.push(item)
  }
  return { named, review, allowed }
}
