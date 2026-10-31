import { classify, listItem, columns } from './markdown.mjs';

/* Pure block model for drag-to-move: which source lines a block covers, where
 * it may be dropped, and the text after moving it. Line indexes are 0-based
 * over text.split('\n'), so CRLF stays on each line and is never rewritten. */

const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const blank = s => !s.trim();
const indentOf = s => columns(s.match(/^[ \t]*/)[0]);
const headingLevel = s => (s.match(/^ {0,3}(#{1,6})(?:\s|$)/)?.[1] || '').length;

function model(text) {
  const data = classify(text);
  const lines = text.split('\n');
  // YAML front matter is never draggable and never a drop target.
  let body = 0;
  if (/^\uFEFF?---\s*$/.test(lines[0] || '')) {
    const close = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (close > 0) body = close + 1;
  }
  return { ...data, src: lines, body };
}

function isListStart(m, i) { return m.kinds[i] === 'list' && !m.quotes[i] && !!listItem(m.src[i]); }

/** A list item and everything that belongs to it: deeper lines, blank lines
 * followed by deeper lines, and lazy continuation lines. */
function itemEnd(m, k) {
  const base = indentOf(m.src[k]), n = m.src.length;
  let end = k, j = k + 1;
  while (j < n) {
    if (blank(m.src[j])) {
      let next = j; while (next < n && blank(m.src[next])) next++;
      if (next < n && indentOf(m.src[next]) > base) { j = next; continue; }
      break;
    }
    if (indentOf(m.src[j]) > base || (m.continuations[j] && !isListStart(m, j))) { end = j++; continue; }
    break;
  }
  return end;
}

function isParagraphLine(m, i) {
  const s = m.src[i];
  if (i < m.body || blank(s) || m.quotes[i] || m.fenceOf[i] >= 0 || m.indentedCode[i] || m.table[i] || m.continuations[i]) return false;
  if (m.kinds[i] === 'prose') return true;
  return m.kinds[i] === 'protected' && !HR.test(s) && !/^\s*(?:<|\[[^\]]+\]:|\$\$)/.test(s) && indentOf(s) < 4;
}

function headingEnd(m, i) {
  const level = headingLevel(m.src[i]);
  let j = i + 1;
  while (j < m.src.length && !(m.kinds[j] === 'heading' && !m.quotes[j] && headingLevel(m.src[j]) <= level)) j++;
  let end = j - 1;
  while (end > i && blank(m.src[end])) end--;
  return end;
}

/** The block whose handle belongs to source line `line`, or null. Headings
 * carry their whole section; list items their children and continuations. */
function blockAt(text, line, m = model(text)) {
  const s = m.src[line];
  if (s === undefined || line < m.body || blank(s)) return null;
  if (m.kinds[line] === 'heading' && !m.quotes[line]) return { kind: 'heading', from: line, to: headingEnd(m, line), level: headingLevel(s) };
  if (m.kinds[line] === 'image' && !m.quotes[line]) return { kind: 'image', from: line, to: line };
  // Innermost list item containing the line: walk up to its marker line.
  for (let k = line; k >= m.body && line - k < 5000; k--) {
    if (isListStart(m, k)) {
      const end = itemEnd(m, k);
      if (end >= line) return { kind: 'list', from: k, to: end, indent: m.src[k].match(/^[ \t]*/)[0] };
      if (indentOf(m.src[k]) === 0) break;
    } else if (!blank(m.src[k]) && indentOf(m.src[k]) === 0 && !m.continuations[k]) break;
  }
  if (!isParagraphLine(m, line)) return null;
  let from = line, to = line;
  while (from - 1 >= m.body && isParagraphLine(m, from - 1)) from--;
  while (to + 1 < m.src.length && isParagraphLine(m, to + 1)) to++;
  return { kind: 'paragraph', from, to };
}

/** End line of the top-level block starting at i, used to enumerate the gaps
 * between top-level blocks. */
function topEnd(m, i) {
  const n = m.src.length;
  if (m.kinds[i] === 'heading' || m.kinds[i] === 'image') return i;
  if (isListStart(m, i)) return itemEnd(m, i);
  if (m.fenceOf[i] >= 0) { let j = i; while (j + 1 < n && m.fenceOf[j + 1] === m.fenceOf[i]) j++; return j; }
  for (const run of [m.quotes, m.table, m.indentedCode]) if (run[i]) { let j = i; while (j + 1 < n && run[j + 1] && !blank(m.src[j + 1])) j++; return j; }
  if (isParagraphLine(m, i)) { let j = i; while (j + 1 < n && isParagraphLine(m, j + 1)) j++; return j; }
  let j = i; while (j + 1 < n && !blank(m.src[j + 1]) && !m.kinds[j + 1].match(/heading|list|image/)) j++;
  return j;
}

/** Line index just past the last line, before the final empty line a trailing
 * newline leaves. Dropping here appends the block to the note. */
function endTarget(m) { return m.src.length - (m.src.length > 1 && m.src.at(-1) === '' ? 1 : 0); }

/** Candidate drop positions for a block: {line, indent, list, ref}. `line` is
 * the source line the block is inserted before; `indent` is the list prefix
 * for list items (null for other blocks); `ref` is the list item whose level
 * the position takes. Nothing lands inside the block itself. */
function dropTargets(text, block, m = model(text)) {
  const out = [], seen = new Set();
  const add = (line, indent = null, list = false, ref = null) => {
    if (line > block.from && line <= block.to) return;
    const key = line + '|' + indent;
    if (!seen.has(key)) { seen.add(key); out.push({ line, indent, list, ref }); }
  };
  const starts = [];
  for (let i = m.body; i < m.src.length;) {
    if (blank(m.src[i])) { i++; continue; }
    starts.push(i);
    i = topEnd(m, i) + 1;
  }
  const last = endTarget(m);
  if (block.kind === 'heading') {
    for (const i of starts) if (m.kinds[i] === 'heading' && !m.quotes[i]) add(i);
    add(last);
  } else if (block.kind === 'list') {
    // Before any item (as its sibling) and after any item's subtree.
    for (let i = m.body; i < m.src.length; i++) if (isListStart(m, i)) {
      const indent = m.src[i].match(/^[ \t]*/)[0];
      add(i, indent, true, i);
      add(itemEnd(m, i) + 1, indent, true, i);
    }
    for (const i of starts) if (!isListStart(m, i)) add(i, '');
    add(last, '');
  } else {
    for (const i of starts) add(i);
    add(last);
  }
  return out.sort((a, b) => a.line - b.line || columns(a.indent || '') - columns(b.indent || ''));
}

function reindent(lines, from, to) {
  if (from === to) return lines;
  return lines.map(line => {
    if (line.startsWith(from)) return to + line.slice(from.length);
    if (blank(line)) return line;
    // Mixed tabs/spaces: shift by columns instead of by prefix.
    const lead = line.match(/^[ \t]*/)[0], cols = Math.max(0, columns(lead) - columns(from) + columns(to));
    const unit = to.includes('\t') || (!to && from.includes('\t')) ? '\t' : ' ';
    return (unit === '\t' ? '\t'.repeat(Math.floor(cols / 4)) + ' '.repeat(cols % 4) : ' '.repeat(cols)) + line.slice(lead.length);
  });
}

/** Text after moving `block` before line `target.line`; null for a no-op.
 * Keeps one blank line between blocks where Markdown needs it, never merges
 * the block into a neighbouring paragraph or list item. */
function moveBlock(text, block, target) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const src = text.replace(/\r\n/g, '\n').split('\n');
  const { from, to } = block;
  let t = target.line;
  if (t > from && t <= to) return null;
  let seg = src.slice(from, to + 1);
  if (block.kind === 'list' && target.indent !== null && target.indent !== undefined) seg = reindent(seg, block.indent, target.indent);
  if ((t === from || t === to + 1) && seg.every((l, i) => l === src[from + i])) return null;
  const rest = src.slice(0, from).concat(src.slice(to + 1));
  if (t > to) t -= seg.length;
  // Close the gap the block leaves: two separators become one.
  const r = from;
  if (r > 0 && r < rest.length && blank(rest[r - 1]) && blank(rest[r]) && !(r === rest.length - 1 && rest[r] === '')) {
    rest.splice(r, 1); if (t > r) t--;
  } else if (r === 0 && rest.length > 1 && blank(rest[0])) {
    rest.splice(0, 1); if (t > 0) t--;
  } else if (r === rest.length - 1 && rest[r] === '' && r > 0 && blank(rest[r - 1])) {
    rest.splice(r - 1, 1); if (t >= r) t--;
  } else if (r === rest.length && r > 0 && blank(rest[r - 1])) {
    rest.splice(r - 1, 1); if (t >= r) t--;
  }
  const before = t > 0 ? rest[t - 1] : null, after = t < rest.length ? rest[t] : null;
  const nonBlank = s => s !== null && s !== undefined && !blank(s);
  const isFinal = t === rest.length - 1 && after === '';
  let head = [], tail = [];
  if (block.kind === 'list' && target.list) {
    // A blank-separated (loose) list keeps blanks around the moved item;
    // otherwise mirror the spacing found at the drop position.
    const listish = s => nonBlank(s) && (!!listItem(s) || indentOf(s) > 0);
    const loose = (from > 1 && blank(src[from - 1]) && listish(src[from - 2])) || (to + 2 < src.length && blank(src[to + 1]) && listish(src[to + 2]));
    if (loose) {
      if (nonBlank(before)) head = [''];
      if (nonBlank(after)) tail = [''];
    } else {
      if (before !== null && blank(before) && nonBlank(after)) tail = [''];
      if (after !== null && blank(after) && nonBlank(before) && !isFinal) head = [''];
    }
  } else {
    if (nonBlank(before)) head = [''];
    if (nonBlank(after)) tail = [''];
  }
  const out = rest.slice(0, t).concat(head, seg, tail, rest.slice(t));
  return { text: out.join(eol), line: t + head.length, lines: seg.length };
}

export { model, blockAt, dropTargets, moveBlock, endTarget, itemEnd };
