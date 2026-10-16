// Markdown source -> sentences to read aloud. Every spoken character keeps the
// source offset it came from, so a sentence can be highlighted, resumed and
// remapped after edits. Pure: no Obsidian or DOM access.

const ENDERS = /[。！？!?；;…]/;
const CLOSERS = /[”’」』）)】》〉"'\]]/;
const SOFT_BREAKS = /[，,、：:—]/;
const SPEAKABLE = /[\p{L}\p{N}]/u;
const MAX_SENTENCE = 80;

const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const URL = /^(?:https?:\/\/|www\.)[\x21-\x7e]+/;
const TAG = /^<\/?[A-Za-z][^<>\n]*>/;

/** Offsets [start, end) restrict reading to a selection or "from here"; the
 * whole note is still scanned so code fences and comments are recognised. */
function speechSegments(source, {start=0, end=source.length}={}) {
  const out = [];
  let chars = [];
  const emit = (ch, index) => { if (index >= start && index < end) chars.push([ch, index]); };
  const flush = () => { if (chars.length) out.push(...split(chars)); chars = []; };

  const state = {comment: null};
  const lines = [];
  for (let pos = 0; pos <= source.length;) {
    const nl = source.indexOf('\n', pos), stop = nl < 0 ? source.length : nl;
    lines.push({from: pos, to: stop > pos && source[stop-1] === '\r' ? stop-1 : stop});
    if (nl < 0) break;
    pos = nl + 1;
  }
  let fence = null, math = false, frontmatter = /^\uFEFF?---\s*$/.test(source.slice(lines[0].from, lines[0].to));
  for (let n = 0; n < lines.length; n++) {
    const {from, to} = lines[n], text = source.slice(from, to);
    if (frontmatter) { if (n > 0 && /^(?:---|\.\.\.)\s*$/.test(text)) frontmatter = false; continue; }
    if (state.comment) { inline(source, from, to, state, emit, false); flush(); continue; }
    const body = text.replace(/^(?:\s*>\s?)+/, '');
    if (fence) { if (new RegExp('^\\s*' + fence[0] + '{' + fence.length + ',}\\s*$').test(body)) fence = null; continue; }
    const open = /^\s*(`{3,}|~{3,})/.exec(body);
    if (open) { fence = open[1]; continue; }
    if (math) { if (/\$\$\s*$/.test(body)) math = false; continue; }
    if (/^\s*\$\$/.test(body)) { if (!/^\s*\$\$.*\$\$\s*$/.test(body)) math = true; continue; }
    if (HR.test(body) || TABLE_RULE.test(body)) { flush(); continue; }
    let i = from + (text.length - body.length);
    const prefix = /^(?:\s*(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+(?:\[.\]\s+)?)|\s*)/.exec(body)[0];
    i += prefix.length;
    // Callout header: keep its title, drop the [!type] marker.
    const callout = /^\[![^\]]+\][+-]?\s*/.exec(source.slice(i, to));
    if (callout) i += callout[0].length;
    inline(source, i, to, state, emit, /^\s*\|/.test(body));
    flush(); // every source line ends a sentence
  }
  return out;
}

function inline(source, i, to, state, emit, table) {
  while (i < to) {
    if (state.comment) {
      const close = source.indexOf(state.comment, i);
      if (close < 0 || close >= to) return;
      i = close + state.comment.length; state.comment = null; continue;
    }
    const rest = source.slice(i, to), ch = source[i];
    if (rest.startsWith('%%')) { state.comment = '%%'; i += 2; continue; }
    if (rest.startsWith('<!--')) { state.comment = '-->'; i += 4; continue; }
    if (ch === '\\' && i + 1 < to && /[!-/:-@[-`{-~]/.test(source[i+1])) { emit(source[i+1], i+1); i += 2; continue; }
    if (ch === '`') {
      const run = /^`+/.exec(rest)[0], close = rest.indexOf(run, run.length);
      if (close > 0) { for (let k = run.length; k < close; k++) emit(rest[k], i+k); i += close + run.length; }
      else i += run.length;
      continue;
    }
    if (ch === '$' && !rest.startsWith('$$')) {
      const m = /^\$(?!\s)[^$\n]*?[^\s$]\$/.exec(rest);
      if (m) { i += m[0].length; continue; }
    }
    if (rest.startsWith('![[')) { const close = rest.indexOf(']]'); i += close > 0 ? close + 2 : 3; continue; }
    if (rest.startsWith('![')) { const m = /^!\[[^\]]*\]\([^)]*\)/.exec(rest); i += m ? m[0].length : 2; continue; }
    if (rest.startsWith('[[')) {
      const close = rest.indexOf(']]');
      if (close > 0) { wiki(source, i + 2, i + close, emit); i += close + 2; continue; }
    }
    if (ch === '[') {
      const foot = /^\[\^[^\]]+\]/.exec(rest);
      if (foot) { i += foot[0].length; continue; }
      const link = /^\[([^\]]*)\](?:\([^)]*\)|\[[^\]]*\])/.exec(rest);
      if (link) { inline(source, i + 1, i + 1 + link[1].length, state, emit, false); i += link[0].length; continue; }
      i++; continue;
    }
    if (ch === ']') { i++; continue; }
    const url = URL.exec(rest);
    if (url && (i === 0 || !/[A-Za-z0-9]/.test(source[i-1]))) { i += url[0].length; continue; }
    const tag = TAG.exec(rest);
    if (ch === '<' && tag) { i += tag[0].length; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(source[i-1])) && /^#[^\s#]/.test(rest)) { i += /^#[^\s#]+/.exec(rest)[0].length; continue; }
    if (ch === '^' && /^\^[A-Za-z0-9-]+\s*$/.test(rest) && (i === 0 || /\s/.test(source[i-1]))) return;
    if (ch === '*' || rest.startsWith('~~') || rest.startsWith('==')) { i += ch === '*' ? 1 : 2; continue; }
    if (ch === '_' && (rest.startsWith('__') || !/[\p{L}\p{N}]/u.test(source[i-1] || '') || !/[\p{L}\p{N}]/u.test(source[i+1] || ''))) { i++; continue; }
    if (table && ch === '|') { emit('，', i); i++; continue; }
    emit(ch, i); i++;
  }
}

// [[path/note#heading|alias]] reads as the alias, else as the note name and heading.
function wiki(source, from, to, emit) {
  const inner = source.slice(from, to), bar = inner.indexOf('|');
  if (bar >= 0) { for (let k = bar + 1; k < inner.length; k++) emit(inner[k], from + k); return; }
  const hash = inner.indexOf('#'), target = hash >= 0 ? inner.slice(0, hash) : inner;
  const slash = target.lastIndexOf('/'), base = target.slice(slash + 1).replace(/\.md$/i, '');
  for (let k = 0; k < base.length; k++) emit(base[k], from + slash + 1 + k);
  if (hash >= 0) {
    const heading = inner.slice(hash + 1).replace(/^\^.*/, '');
    if (heading) { emit(' ', from + hash); for (let k = 0; k < heading.length; k++) emit(heading[k], from + hash + 1 + k); }
  }
}

function split(chars) {
  const pieces = [];
  let current = [];
  const close = () => { if (current.length) pieces.push(current); current = []; };
  for (let k = 0; k < chars.length; k++) {
    current.push(chars[k]);
    const ch = chars[k][0];
    const english = ch === '.' && (k + 1 === chars.length || /\s/.test(chars[k+1][0])) && /[A-Za-z]/.test(chars[k-1]?.[0] || '');
    if (ENDERS.test(ch) || english) {
      while (k + 1 < chars.length && (CLOSERS.test(chars[k+1][0]) || ENDERS.test(chars[k+1][0]))) current.push(chars[++k]);
      close();
    }
  }
  close();
  const result = [];
  for (const piece of pieces) for (const part of limit(piece)) {
    let a = 0, b = part.length;
    // Table cell separators become pauses; none is needed at a row's edges.
    while (a < b && /[\s，]/.test(part[a][0])) a++;
    while (b > a && /[\s，]/.test(part[b-1][0])) b--;
    const kept = part.slice(a, b);
    const text = kept.map(c => c[0]).join('').replace(/\s+/g, ' ');
    if (!SPEAKABLE.test(text)) continue;
    result.push({from: kept[0][1], to: kept[kept.length-1][1] + 1, text});
  }
  return result;
}

// Long sentences are cut at the last soft break inside the limit, so a slow
// voice never has to speak an unbroken paragraph.
function limit(piece) {
  const parts = [];
  while (piece.length > MAX_SENTENCE) {
    let cut = -1;
    for (let k = MAX_SENTENCE - 1; k >= MAX_SENTENCE / 3; k--) if (SOFT_BREAKS.test(piece[k][0]) || piece[k][0] === ' ') { cut = k + 1; break; }
    if (cut < 0) cut = MAX_SENTENCE;
    parts.push(piece.slice(0, cut)); piece = piece.slice(cut);
  }
  if (piece.length) parts.push(piece);
  return parts;
}

/** Index of the sentence to start at for a source offset: the one containing
 * it, else the next one. */
function segmentAt(segments, offset) {
  const index = segments.findIndex(s => s.to > offset);
  return index < 0 ? segments.length : index;
}

export { speechSegments, segmentAt };
