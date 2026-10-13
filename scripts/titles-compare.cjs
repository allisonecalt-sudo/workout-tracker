// scripts/titles-compare.cjs - the pure comparison behind scripts/check-titles.mjs
// (v62.1, Oct 14 2026). CommonJS so both the .mjs script and a Node test can load it.
//
// WHAT: compareTitles(current, baseline, renames) -> { missing, added, applied }.
//   - missing: baseline titles the suite no longer has (a failure),
//   - added:   suite titles the baseline does not have yet (a failure until accepted),
//   - applied: the renames that were honoured.
// A title may never just disappear. The ONE way around that is a reviewed rename,
// one line in tests/titles-renamed.txt:   old title => new title
// It counts only if the old title is GONE from the suite AND the new title is a real
// addition (present now, not in the baseline). Anything else - an old title that is
// still there, a new title that does not exist, a rename onto a title the baseline
// already has - is ignored, so the old title still shows as missing.

function count(arr) {
  const m = new Map();
  for (const t of arr) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Parse tests/titles-renamed.txt text: one `old => new` per line, blank lines ignored. */
function parseRenames(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const i = line.indexOf(' => ');
    if (i === -1) continue;
    const from = line.slice(0, i).trim();
    const to = line.slice(i + 4).trim();
    if (from && to && from !== to) out.push({ from, to });
  }
  return out;
}

function compareTitles(current, baseline, renames = []) {
  const have = count(current);
  const want = count(baseline);
  const missing = [];
  const added = [];
  for (const [t, n] of want) for (let k = have.get(t) ?? 0; k < n; k++) missing.push(t);
  for (const [t, n] of have) for (let k = want.get(t) ?? 0; k < n; k++) added.push(t);
  const applied = [];
  for (const r of renames) {
    const mi = missing.indexOf(r.from);
    const ai = added.indexOf(r.to);
    if (mi === -1 || ai === -1) continue;
    missing.splice(mi, 1);
    added.splice(ai, 1);
    applied.push(r);
  }
  return { missing, added, applied };
}

module.exports = { compareTitles, parseRenames };
