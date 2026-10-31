/** Source-oriented Markdown utilities. No DOM, vault writes, or dependencies. */
function linesOf(text) {
  const lines = [];
  const re = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let m;
  while ((m = re.exec(text)) && m[0]) {
    lines.push({ text: m[1], eol: m[2], start: m.index, end: re.lastIndex });
  }
  if (!lines.length || /[\r\n]$/.test(text)) lines.push({ text: '', eol: '', start: text.length, end: text.length });
  return lines;
}

function escaped(text, index) {
  let count = 0;
  while (index > 0 && text[--index] === '\\') count++;
  return count % 2 === 1;
}

function splitPipes(line) {
  const cells = [];
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|' && !escaped(line, i)) {
      cells.push(line.slice(start, i)); start = i + 1;
    }
  }
  cells.push(line.slice(start));
  if (!cells[0].trim()) cells.shift();
  if (cells.length && !cells[cells.length - 1].trim()) cells.pop();
  return cells;
}

function tableCellRange(text, anchor, row, column) {
  const data=classify(text);
  let line=data.lines.findIndex(l=>anchor>=l.start && (anchor<l.end || (l.start===l.end&&anchor===l.start)));
  if(line<0 || !data.table[line]) return null;
  while(line>0 && data.table[line-1]) line--;
  const sourceLine=line+(row===0 ? 0 : row+1); // Markdown delimiter row is not rendered.
  if(!data.table[sourceLine]) return null;
  const raw=data.lines[sourceLine],cells=[];
  let start=0;
  for(let i=0;i<raw.text.length;i++) if(raw.text[i]==='|'&&!escaped(raw.text,i)) {cells.push({from:start,to:i,text:raw.text.slice(start,i)});start=i+1;}
  cells.push({from:start,to:raw.text.length,text:raw.text.slice(start)});
  if(!cells[0].text.trim()) cells.shift();
  if(cells.length&&!cells.at(-1).text.trim()) cells.pop();
  const cell=cells[column];
  return cell ? {from:raw.start+cell.from,to:raw.start+cell.to,line:sourceLine,count:cells.length} : null;
}

function isTableRule(line) {
  const cells = splitPipes(line);
  return cells.length > 0 && /\|/.test(line) && cells.every(c => /^\s*:?-{3,}:?\s*$/.test(c));
}

/** Width of leading whitespace in columns; a Tab advances to the next stop of 4. */
function columns(space) {
  let n = 0;
  for (const c of space) n = c === '\t' ? n + 4 - n % 4 : n + 1;
  return n;
}

/** Obsidian indents nested items with Tabs by default, so Tab-indented
 * markers are list items too. `tab` lets callers stay conservative. */
function listItem(line) {
  const m = /^([ \t]*)([-+*]|\d+[.)])(\s+)(.*)$/.exec(line);
  if (!m) return null;
  const indent = columns(m[1]);
  return { indent, content: m[4], tab: m[1].includes('\t'), contentIndent: columns(m[1] + m[2] + m[3].replace(/\t[\s\S]*/, '\t')) };
}

/** Block starts which interrupt a CommonMark paragraph/lazy continuation.
 * Ordered lists interrupt only with 1; indented code does not interrupt.
 * Obsidian's display-math boundary is included as a supported extension.
 */
function interruptsParagraph(line) {
  return /^ {0,3}#{1,6}(?:\s|$)/.test(line) ||
    /^ {0,3}(?:`{3,}|~{3,}|\$\$)/.test(line) ||
    /^ {0,3}(?:([-*_])(?:\s*\1){2,})\s*$/.test(line) ||
    /^ {0,3}(?:[-+*]|1[.)])\s+\S/.test(line) ||
    /^ {0,3}<(?:!--|\?|!\[CDATA\[|![A-Z]|\/?(?:div|table|pre|script|style|details|section|figure|iframe)\b)/.test(line);
}

/** Protect uncertain constructs rather than reflowing them. Offsets remain original. */
function classify(text, { splitLazyListLines = false } = {}) {
  const lines = linesOf(text);
  const kinds = Array(lines.length).fill('prose');
  const table = Array(lines.length).fill(false);
  const opaque = Array(lines.length).fill(false);
  const quotes = Array(lines.length).fill(false);
  const quoteBlanks = Array(lines.length).fill(false);
  const continuations = Array(lines.length).fill(false);
  const indentedCode = Array(lines.length).fill(false);
  // Opening-line index of the fenced code block each line belongs to, or -1.
  const fenceOf = Array(lines.length).fill(-1);
  let fence = null, yaml = false, comment = false, html = false, math = false;
  let quote = false, quoteCanLazy = false, list = false, lastListIndent = 0, listContentIndent = 2, reference = false;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].text;
    // A quote does not own everything until a blank line: headings, lists,
    // fences, thematic breaks and HTML can terminate it without one.
    if (quote && !/^\s*>/.test(s) && interruptsParagraph(s)) quote=false;
    if (i === 0 && /^\uFEFF?---\s*$/.test(s)) yaml = true;
    if (yaml) {
      kinds[i] = 'protected'; opaque[i]=true;
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(s)) yaml = false;
      continue;
    }
    if (fence) {
      kinds[i] = 'protected'; opaque[i]=true; fenceOf[i]=fence.start;
      if (new RegExp('^\\s*' + fence.char + '{' + fence.length + ',}\\s*$').test(s)) fence = null;
      continue;
    }
    const fm = /^\s*(`{3,}|~{3,})/.exec(s);
    if (fm) { fence = { char: fm[1][0], length: fm[1].length, start: i }; kinds[i] = 'protected'; opaque[i]=true; fenceOf[i]=i; continue; }
    if (comment || /<!--|%%/.test(s)) {
      kinds[i] = 'protected'; opaque[i]=true;
      if (/<!--/.test(s) && !/-->/.test(s)) comment = '-->';
      else if (/%%/.test(s) && s.split('%%').length === 2) comment = comment ? false : '%%';
      else if (comment && s.includes(comment)) comment = false;
      continue;
    }
    if (/^\s*\$\$/.test(s) || math) {
      kinds[i] = 'protected'; opaque[i]=true;
      if (/^\s*\$\$/.test(s)) math = math ? false : s.trim() === '$$';
      continue;
    }
    if (html || /^\s*<(?:div|table|pre|script|style|details|section|figure|iframe)\b/i.test(s)) {
      kinds[i] = 'protected'; opaque[i]=true;
      if (!s.trim()) html = false;
      else html = !/<\/(?:div|table|pre|script|style|details|section|figure|iframe)>/i.test(s);
      continue;
    }
    if (!s.trim()) { kinds[i] = 'blank'; quote = false; reference = false; continue; }
    if (/^\s*>/.test(s)) {
      kinds[i] = 'protected'; quotes[i]=true; quote=true; list=false;
      const content=s.replace(/^(?:\s*>\s?)+/,'');
      quoteBlanks[i]=!content.trim();
      quoteCanLazy=!!content.trim() && !interruptsParagraph(content);
      // A quoted list item's prose can itself have a lazy continuation.
      if(listItem(content)?.content.trim()) quoteCanLazy=true;
      continue;
    }
    if(quote && quoteCanLazy) { kinds[i]='protected';quotes[i]=true;continue; }
    quote=false;
    // Reference/footnote definitions and their continuation lines are opaque.
    if (/^\s*\[[^\]]+\]:/.test(s)) { kinds[i] = 'protected'; opaque[i]=true; reference=true; continue; }
    if(reference && /^( {2,}|\t)/.test(s)) { kinds[i]='protected';opaque[i]=true;continue; }
    reference=false;
    if (/^ {0,3}(?:([-*_])(?:\s*\1){2,})\s*$/.test(s)) { kinds[i]='protected';list=false;continue; }
    // A Tab-indented marker only continues an open list; elsewhere it stays
    // an indented block (Tab knowledge rows, indented code) as before.
    const li = listItem(s);
    if (li && (!li.tab || list)) { kinds[i] = 'list'; list = true; lastListIndent=li.indent; listContentIndent=li.contentIndent; continue; }
    if (/^( {2,}|\t)/.test(s)) {
      const indent=s.match(/^\s*/)[0].replace(/\t/g,'    ').length;
      if(list && indent>=listContentIndent) {
        kinds[i]='protected';opaque[i]=false;
        // A plain indented list paragraph is not an opaque code block. Keep
        // its source unchanged, but give it paragraph start/end metadata.
        continuations[i]=indent<listContentIndent+4 && !interruptsParagraph(s.trimStart()) && !/^\s*[<>![]/.test(s);
        continue;
      }
      if(indent>=4 && !(i>0 && kinds[i-1]==='prose' && lines[i-1].text.trim())) { kinds[i]='protected';opaque[i]=true;indentedCode[i]=true;list=false;continue; }
      // Up to three spaces outside a list are legal paragraph indentation.
      list=false;
    }
    // In preserve-soft-lines mode this is a legal lazy continuation. The
    // explicit per-physical-line formatter mode treats unindented text after
    // a TOP-LEVEL item as a new paragraph; nested content remains protected.
    if (list && i > 0 && lines[i - 1].text.trim() &&
        !interruptsParagraph(s) &&
        (!splitLazyListLines || lastListIndent > 0 || /(?: {2,}|\\)$/.test(lines[i-1].text))) { kinds[i] = 'protected';continuations[i]=true;continue; }
    list = false;
    if (/^ {0,3}#{1,6}(?:\s|$)/.test(s)) { kinds[i] = 'heading'; continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(s)) { kinds[i] = 'protected'; continue; }
    if (/^\s*(?:=+|-+)\s*$/.test(s) && i > 0) { kinds[i] = kinds[i - 1] = 'protected'; continue; }
    if (/^\s*!\[/.test(s)) { kinds[i] = 'image'; continue; }
    // Multiline link/HTML constructs must not be split mid-expression.
    if (/\[[^\]]*$/.test(s) || /^\s*[<>]/.test(s)) kinds[i] = 'protected';
  }
  // Never insert a paragraph break inside multiline inline code/emphasis/HTML.
  // Inline markup cannot span a block boundary (blank line, list item, heading,
  // rule, quote, fence): an unpaired ** there is literal text, so pairing it with
  // a delimiter further down would wrongly protect every line in between.
  const startsBlock=s=>!s.trim() || !!listItem(s) || interruptsParagraph(s.trimStart()) || /^\s*>/.test(s);
  for(const regex of [/(`+)([\s\S]*?)\1/g, /(\*\*|__|~~)([\s\S]*?)\1/g, /<(span|mark|u)\b[^>]*>[\s\S]*?<\/\1>/gi, /\[[^\]]*\n[^\]]*\](?:\([^)]*\)|\[[^\]]*\])/g]) {
    let match;
    while((match=regex.exec(text))) if(/[\r\n]/.test(match[0])) {
      const spanned=lines.filter(l=>l.start < regex.lastIndex && l.end > match.index);
      if(spanned.slice(1).some(l=>startsBlock(l.text))) { regex.lastIndex=match.index+1; continue; }
      for(const l of spanned) { const i=lines.indexOf(l); kinds[i]='protected';continuations[i]=false;opaque[i]=true; }
    }
  }
  const tableContent=s=>s.replace(/^\s*(?:>\s*)+/, '');
  for (let i = 1; i < lines.length; i++) {
    if (!opaque[i] && !opaque[i-1] && isTableRule(tableContent(lines[i].text)) && splitPipes(tableContent(lines[i - 1].text)).length > 0) {
      let j = i - 1;
      while (j < lines.length && !opaque[j] && tableContent(lines[j].text).trim() && /\|/.test(lines[j].text)) {
        table[j] = true; kinds[j] = 'table'; j++;
      }
      i = j - 1;
    }
  }
  // Blank lines between indented code lines belong to the code block, not
  // paragraph separators. Never visually collapse intentional code blanks.
  for(let i=1;i<lines.length-1;i++) if(kinds[i]==='blank' && indentedCode[i-1]) {
    let j=i;while(j<lines.length && kinds[j]==='blank')j++;
    if(indentedCode[j]) for(let k=i;k<j;k++) {indentedCode[k]=true;kinds[k]='protected';}
  }
  return { lines, kinds, table, quotes, quoteBlanks, continuations, indentedCode, fenceOf };
}

/** Only plain, non-code source blanks participate. The final empty source
 * position is a caret placeholder, not a saved blank line. */
function blankSpacing(data) {
  const rows = new Set(), runs = [];
  const {lines,kinds}=data;
  const limit=lines.length-(lines.at(-1)?.text==='' && lines.at(-1)?.eol==='' ? 1 : 0);
  for(let i=0;i<limit;i++) if(kinds[i]==='blank') {
    let end=i+1;while(end<limit && kinds[end]==='blank')end++;
    const hasBefore=i>0,hasAfter=end<limit;
    const extra=end-i-(hasBefore&&hasAfter ? 1 : hasBefore ? 1 : 0);
    const first=end-extra;
    for(let n=first;n<end;n++)rows.add(n);
    if(extra>0)runs.push({from:i,to:end-1,before:hasBefore?i-1:null,after:hasAfter?end:null,extra});
    i=end-1;
  }
  return {rows,runs};
}

/** Painted blocks (fenced code background, quote bar, Callout box, Tab
 * knowledge rows given as data.tabRows) draw over their own half of the
 * visible prose gap, so Live Preview restores that half outside the paint: on
 * the first plain blank between two blocks (counting one per painted side), or
 * as edge space on an unpainted line that touches the paint directly. Tables,
 * images and horizontal rules carry their own outside padding. Only unindented
 * blocks count: indented quotes/code inside lists keep list spacing, as in
 * Reading/PDF where only top-level blocks are wrapped.
 * Returns {blanks: Map(row -> 1|2), above: Set(row), below: Set(row)}. */
function paintedGaps(data) {
  const {lines,kinds,quotes,fenceOf,tabRows}=data;
  const blanks=new Map(),above=new Set(),below=new Set();
  const quoteTop=Array(lines.length).fill(false);
  for(let i=0;i<lines.length;i++) if(quotes[i]) {
    let end=i;while(quotes[end+1])end++;
    const top=/^>/.test(lines[i].text);
    for(let k=i;k<=end;k++)quoteTop[k]=top;
    i=end;
  }
  const painted=i=>i>=0 && i<lines.length && (quoteTop[i] || tabRows?.has(i) || (fenceOf[i]>=0 && /^[`~]/.test(lines[fenceOf[i]].text)));
  const rule=i=>kinds[i]==='protected' && !quotes[i] && !(fenceOf[i]>=0) && /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(lines[i].text);
  const own=i=>kinds[i]==='table' || kinds[i]==='image' || rule(i);
  for(let i=0;i<lines.length;i++) {
    if(kinds[i]==='blank') {
      let end=i;while(kinds[end+1]==='blank')end++;
      // The trailing empty caret position is not a separator between blocks.
      if(i>0 && end+1<lines.length) {
        const count=(painted(i-1)?1:0)+(painted(end+1)?1:0);
        if(count) blanks.set(i,count);
      }
      i=end;continue;
    }
    const next=i+1;
    if(next>=lines.length || kinds[next]==='blank') continue;
    const a=painted(i),b=painted(next);
    if(a===b) continue;
    if(a && !own(next)) above.add(next);
    if(b && !own(i)) below.add(i);
  }
  return {blanks,above,below};
}

function formatNote(text, { splitProseLines = true, looseLists = true, splitIndentedListParagraphs = false } = {}) {
  const { lines, kinds, quotes, continuations } = classify(text,{splitLazyListLines:splitProseLines});
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const insertBefore = new Set();
  for (let i = 1; i < lines.length; i++) {
    const a = kinds[i - 1], b = kinds[i];
    if (a === 'blank' || b === 'blank') continue;
    if(continuations[i-1] && ['prose','heading','image','table'].includes(b) && /^\S/.test(lines[i].text)) insertBefore.add(i);
    if(splitIndentedListParagraphs && continuations[i] && /^( {2,}|\t)\S/.test(lines[i].text) &&
       (a==='list' || continuations[i-1]) && !/(?: {2,}|\\)$/.test(lines[i-1].text) && !/(?: {2,}|\\)$/.test(lines[i].text)) insertBefore.add(i);
    // Only separate known TOP-LEVEL quote boundaries; do not split quoted
    // Callout content, valid lazy prose, or nested list quote children.
    if(quotes[i] && !quotes[i-1] && /^>/.test(lines[i].text) && ['prose','heading','image','table'].includes(a)) insertBefore.add(i);
    if(quotes[i-1] && !quotes[i] && /^>/.test(lines[i-1].text) && ['prose','heading','image','table','list'].includes(b) && /^\S/.test(lines[i].text)) insertBefore.add(i);
    const topA = listItem(lines[i - 1].text), topB = listItem(lines[i].text);
    if (looseLists && b === 'list' && topB.indent === 0) {
      // Locate previous sibling, allowing indented child/continuation blocks.
      let j = i - 1;
      while (j >= 0 && lines[j].text.trim() && !listItem(lines[j].text) && /^( {2,}|\t)/.test(lines[j].text)) j--;
      if ((topA && topA.indent === 0) || (j >= 0 && kinds[j] === 'list')) insertBefore.add(i);
    }
    if (['prose','heading','image','table'].includes(a) && b === 'list' && topB.indent === 0) insertBefore.add(i);
    if (a === 'list' && topA?.indent === 0 && ['prose','heading','image','table'].includes(b)) insertBefore.add(i);
    if (a === 'table' && b !== 'table' && ['prose','heading','image'].includes(b)) insertBefore.add(i);
    if (b === 'table' && a !== 'table' && ['prose','heading','image'].includes(a)) insertBefore.add(i);
    if (['prose','heading','image'].includes(a) && ['prose','heading','image'].includes(b)) {
      if (a !== 'prose' || b !== 'prose' || (splitProseLines && !/(?: {2,}|\\)$/.test(lines[i - 1].text))) insertBefore.add(i);
    }
  }
  const output = lines.map((line, i) => (insertBefore.has(i) ? eol : '') + line.text + line.eol).join('');
  return { text: output, inserted: insertBefore.size, protectedLines: kinds.filter(k => k === 'protected' || k === 'table').length };
}

function excludedRanges(text, data) {
  const ranges = [];
  let yaml=false, fence=null, comment=false, list=false;
  data.lines.forEach((line,i)=>{
    const s=line.text, stripped=s.replace(/^\s*>\s?/, '');
    if(i===0 && /^\uFEFF?---\s*$/.test(s)) yaml=true;
    if(yaml) {ranges.push([line.start,line.end]);if(i>0 && /^(---|\.\.\.)\s*$/.test(s)) yaml=false;return;}
    if(fence) {
      ranges.push([line.start,line.end]);
      if(new RegExp('^\\s*'+fence.char+'{'+fence.length+',}\\s*$').test(stripped)) fence=null;
      return;
    }
    const m=/^\s*(`{3,}|~{3,})/.exec(stripped);
    if(m) {fence={char:m[1][0],length:m[1].length};ranges.push([line.start,line.end]);return;}
    if(comment || /<!--|%%/.test(s)) {
      ranges.push([line.start,line.end]);
      if(comment && s.includes(comment)) comment=false;
      else if(s.includes('<!--') && !s.includes('-->')) comment='-->';
      else if(s.split('%%').length===2) comment='%%';
      return;
    }
    const li=listItem(s);
    if(li && (!li.tab || list)) list=true;
    if(!list && /^( {4}|\t)/.test(s)) ranges.push([line.start,line.end]);
    if(s.trim() && !/^\s/.test(s) && !listItem(s) && !/^>/.test(s)) list=false;
  });
  const inline = /(`+)([^]*?)\1/g;
  let m;
  while ((m = inline.exec(text))) ranges.push([m.index, inline.lastIndex]);
  return ranges.sort((a,b) => a[0] - b[0]);
}

function closeBracket(text, start, close) {
  const open = close === ']' ? '[' : '(';
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    if (escaped(text, i)) continue;
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return i;
    if (text[i] === '\n' && close === ']') return -1;
  }
  return -1;
}

function wikiParts(content) {
  return content.split(/\\?\|/);
}

function scanImages(text) {
  const data = classify(text);
  const ranges = excludedRanges(text, data);
  const references = new Map();
  for (const line of data.lines) {
    const m = /^\s*\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/.exec(line.text);
    if (m) references.set(m[1].toLowerCase(), m[2] || m[3]);
  }
  const tokens = [];
  let rangeIndex = 0, lineIndex = 0;
  for (let i = 0; i < text.length; i++) {
    while (rangeIndex < ranges.length && ranges[rangeIndex][1] <= i) rangeIndex++;
    if (rangeIndex < ranges.length && ranges[rangeIndex][0] <= i) { i = ranges[rangeIndex][1] - 1; continue; }
    if (text[i] !== '!' || text[i + 1] !== '[' || escaped(text, i)) continue;
    while (lineIndex + 1 < data.lines.length && data.lines[lineIndex + 1].start <= i) lineIndex++;
    const base = { start: i, line: lineIndex, inTable: data.table[lineIndex] };
    if (text[i + 2] === '[') {
      let end = text.indexOf(']]', i + 3);
      if (end < 0 || text.slice(i, end).includes('\n')) continue;
      end += 2;
      const content = text.slice(i + 3, end - 2);
      const parts = wikiParts(content);
      tokens.push({ ...base, end, raw: text.slice(i, end), type: 'wiki', parts, target: parts[0], alt: parts.slice(1).join('|') });
      i = end - 1; continue;
    }
    const altEnd = closeBracket(text, i + 2, ']');
    if (altEnd < 0) continue;
    const alt = text.slice(i + 2, altEnd);
    let end, target, type;
    if (text[altEnd + 1] === '(') {
      let cursor = altEnd + 2;
      while (/\s/.test(text[cursor] || '') && cursor < text.length) cursor++;
      if (text[cursor] === '<') {
        const angleEnd = text.indexOf('>', cursor + 1);
        if (angleEnd < 0) continue;
        target = text.slice(cursor + 1, angleEnd);
        end = closeBracket(text, altEnd + 2, ')');
      } else {
        end = closeBracket(text, altEnd + 2, ')');
        const inside = end >= 0 ? text.slice(cursor, end) : '';
        // Keep title and parentheses verbatim; only the alt is edited.
        target = inside.replace(/\s+["'][^]*$/, '');
      }
      if (end < 0) continue;
      end++; type = 'markdown';
    } else if (text[altEnd + 1] === '[') {
      const refEnd = closeBracket(text, altEnd + 2, ']');
      if (refEnd < 0) continue;
      const ref = text.slice(altEnd + 2, refEnd) || alt;
      target = references.get(ref.toLowerCase());
      if (!target) continue;
      end = refEnd + 1; type = 'reference';
    } else continue;
    tokens.push({ ...base, end, raw: text.slice(i,end), type, target, alt, altEnd: altEnd - i });
    i = end - 1;
  }
  return tokens;
}

function isExcalidraw(token) {
  return !!token.isDrawing || /\.excalidraw(?:\.md)?(?:#|$)/i.test(token.target);
}
function isImageTarget(target) {
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|avif|heic|tiff?)(?:[?#]|$)/i.test(target) || /^(?:https?:|data:image\/)/i.test(target);
}
function relativeTarget(filePath, notePath) {
  const base = notePath.split('/').slice(0,-1), dest = filePath.split('/');
  while (base.length && dest.length && base[0] === dest[0]) { base.shift(); dest.shift(); }
  return [...base.map(()=>'..'), ...dest].map(p=>encodeURIComponent(p)).join('/');
}

function imageDimensions(token) {
  const size=token.type==='wiki' ? token.parts.slice(1).find(p=>/^\d+(?:x\d+)?$/.test(p.trim())) : token.alt?.match(/(?:^|\\?\|)(\d+(?:x\d+)?)$/)?.[1];
  if(!size)return null;
  const [width,height]=size.trim().split('x').map(Number);
  return {width,height:height??null};
}

function resizedToken(token, width, height = null, options = {}) {
  width = Math.round(width);
  if (!Number.isFinite(width) || width < 24 || width > 8192) throw new Error('图片宽度必须在 24–8192 px 之间');
  if (height !== null) {
    height = Math.round(height);
    if (!Number.isFinite(height) || height < 24 || height > 8192) throw new Error('图片高度必须在 24–8192 px 之间');
  }
  const size = height === null ? String(width) : `${width}x${height}`;
  const pipe = token.inTable ? '\\|' : '|';
  if (token.type === 'wiki') {
    const parts = [...token.parts];
    const sizeIndex = parts.findIndex((p,i)=>i > 0 && /^\d+(?:x\d+)?$/.test(p.trim()));
    if (sizeIndex >= 0) parts[sizeIndex] = size;
    else if (parts.length === 1) parts.push(size);
    else if (isExcalidraw(token)) parts.splice(1,0,size); // Excalidraw's third field is alignment.
    else {
      // Obsidian supports only a single wiki display field. Preserve a custom
      // alt by converting ordinary images to documented Markdown alt|size.
      if (!options.resolvedPath || !options.notePath) throw new Error('无法解析带别名的图片路径；请使用图片尺寸命令检查');
      const alt = parts.slice(1).join('|').replace(/\\?\|/g, token.inTable ? '\\|' : '|').replace(/\\?\]/g, m => m === ']' ? '\\]' : m); // no lookbehind: unsupported on older iOS
      const fragment = token.target.includes('#') ? '#'+token.target.split('#').slice(1).join('#') : '';
      return `![${alt}${pipe}${size}](<${relativeTarget(options.resolvedPath, options.notePath)}${fragment}>)`;
    }
    return `![[${parts.join(pipe)}]]`;
  }
  let alt = token.alt.replace(/\\?\|\d+(?:x\d+)?$/, '');
  if (/^\d+(?:x\d+)?$/.test(alt)) alt='';
  if (token.inTable) alt = alt.replace(/\\?\|/g, m => m === '|' ? '\\|' : m);
  const suffix = token.raw.slice(token.altEnd + 1);
  // For collapsed references make the implicit id explicit before editing alt.
  const fixedSuffix = token.type === 'reference' && suffix === '[]' ? `[${token.alt}]` : suffix;
  return `![${alt}${pipe}${size}]${fixedSuffix}`;
}

function sameDocumentPatch(text, token, replacement) {
  if (text.slice(token.start,token.end) !== token.raw) throw new Error('笔记已变化，请重新点击图片后调整');
  const before = text.slice(0,token.start), after = text.slice(token.end);
  if (token.inTable) {
    const lineStart = before.lastIndexOf('\n') + 1;
    const next = text.indexOf('\n', token.end);
    const oldLine = text.slice(lineStart,next < 0 ? text.length : next);
    const newLine = before.slice(lineStart) + replacement + after.split('\n')[0];
    if (splitPipes(oldLine).length !== splitPipes(newLine).length) throw new Error('尺寸写回会改变表格列数，已取消');
  }
  return before + replacement + after;
}

function dragSize(initial, dx, dy, corner, free, maxWidth = 4096) {
  const sx = corner.includes('w') ? -1 : 1, sy = corner.includes('n') ? -1 : 1;
  const rawW = initial.width + dx * sx, rawH = initial.height + dy * sy;
  const max = Math.min(8192, Math.max(24,maxWidth));
  const clamp = n => Math.max(24,Math.min(max,n));
  if (free) return { width: Math.round(clamp(rawW)), height: Math.round(Math.max(24,Math.min(8192,rawH))) };
  const ratio = initial.width / initial.height;
  let w = Math.abs(dx / initial.width) >= Math.abs(dy / initial.height) ? rawW : rawH * ratio;
  w = Math.max(24,24*ratio,Math.min(max,8192*ratio,w));
  return { width: Math.round(w), height: Math.round(w/ratio) };
}

export { linesOf, splitPipes, classify, blankSpacing, paintedGaps, formatNote, scanImages, imageDimensions, resizedToken, sameDocumentPatch, dragSize, isExcalidraw, isImageTarget, relativeTarget, tableCellRange };
