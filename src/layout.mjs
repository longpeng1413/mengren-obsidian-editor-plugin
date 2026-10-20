import { ViewPlugin, Decoration } from '@codemirror/view';
import { RangeSetBuilder, EditorState } from '@codemirror/state';
import { editorInfoField } from 'obsidian';
import { classify, blankSpacing, paintedGaps } from './markdown.mjs';
import { HIGHLIGHTS } from './speech.mjs';

function layoutExtension(plugin) {
  const decorations = ViewPlugin.fromClass(class {
    constructor(view) { this.view = view; plugin.cmViews.add(view); plugin.bindDocument(view.dom.ownerDocument); this.decorations = this.build(); }
    update(update) {
      if (update.docChanged || update.viewportChanged || update.focusChanged || update.transactions.length) this.decorations = this.build();
    }
    destroy() { plugin.cmViews.delete(this.view); }
    build() {
      const builder = new RangeSetBuilder();
      if (!plugin.settings.layoutEnabled) return builder.finish();
      const view = this.view;
      // Do not style source mode, fenced text, quotes, metadata, or HTML.
      const info = view.state.field(editorInfoField,false);
      if (info?.getMode?.() === 'source' && info?.getState?.()?.source === true) return builder.finish();
      const doc = view.state.doc;
      const editable = !view.state.facet(EditorState.readOnly);
      const emptyDocument = !doc.toString().trim();
      // Structural separators may collapse, but never an editable caret/selection
      // line. Focus changes update decorations without changing document text.
      const inputRanges = editable && (view.hasFocus || emptyDocument) ?
        view.state.selection.ranges.map(r=>[doc.lineAt(r.from).number,doc.lineAt(r.to).number]) : [];
      const { kinds, lines, continuations, quotes, quoteBlanks, indentedCode, fenceOf } = classify(doc.toString());
      const extraRows=plugin.settings.preserveExtraBlankLines ? blankSpacing({kinds,lines}).rows : new Set();
      const tabRows=new Set();
      if(plugin.settings.tabKnowledgeLines) {
        const keys=tabKnowledgeKeys(doc.toString());
        for(let i=0;i<lines.length;i++) if(indentedCode[i]&&(i===0||!indentedCode[i-1])) {
          let j=i;while(indentedCode[j])j++;
          const key=lines.slice(i,j).map(l=>l.text.replace(/^(?: {0,3}\t| {4})/,'')).join('\n');
          if(keys.has(key))for(let k=i;k<j;k++)tabRows.add(k);
          i=j-1;
        }
      }
      // Tab knowledge rows are painted like Reading's code box: one background
      // over the whole run, rounded at its ends, with the half gap outside.
      const paint=paintedGaps({kinds,lines,quotes,fenceOf,tabRows});
      let previous=-1;
      for (const range of view.visibleRanges) {
        const first = doc.lineAt(range.from).number, last = doc.lineAt(range.to).number;
        for (let n = first; n <= last; n++) {
          const line = doc.line(n), kind = kinds[n-1];
          if(line.from<=previous) continue;
          previous=line.from;
          if (kind === 'table' || (kind === 'protected' && !continuations[n-1] && !quotes[n-1] && !indentedCode[n-1])) continue;
          const cls = kind === 'blank' ? 'tet-gap' : kind === 'heading' ? 'tet-heading' : kind === 'list' ? 'tet-list-line' : kind === 'image' ? 'tet-image-line' : 'tet-prose';
          const attrs = { class: cls };
          if(kind==='prose') {
            if(kinds[n-2]!=='prose') attrs.class+=' tet-block-start';
            if(kinds[n]!=='prose') attrs.class+=' tet-block-end';
          }
          if(kind==='list') {
            attrs.class+=' tet-block-start';
            if(!continuations[n]) attrs.class+=' tet-block-end';
          }
          if(continuations[n-1]) {
            attrs.class+=' tet-list-continuation';
            if(kinds[n-2]==='blank') attrs.class+=' tet-block-start';
            if(!continuations[n]) attrs.class+=' tet-block-end';
          }
          if(quotes[n-1]) {
            attrs.class=quoteBlanks[n-1] ? 'tet-quote-line tet-quote-gap' : 'tet-quote-line';
            if(!quoteBlanks[n-1]) {
              if(!quotes[n-2] || quoteBlanks[n-2]) attrs.class+=' tet-block-start';
              if(!quotes[n] || quoteBlanks[n]) attrs.class+=' tet-block-end';
            }
          }
          if(indentedCode[n-1]) {
            attrs.class='tet-code-line';
            const tabKnowledge=tabRows.has(n-1);
            if(tabKnowledge) {
              attrs.class=lines[n-1].text.trim()?'tet-code-line tet-tab-knowledge-line tet-block-start tet-block-end':'tet-gap tet-tab-gap';
              if(!tabRows.has(n-2)) attrs.class+=' tet-tab-first';
              if(!tabRows.has(n)) attrs.class+=' tet-tab-last';
            }
            else {
              if(!indentedCode[n-2]) attrs.class+=' tet-block-start';
              if(!indentedCode[n]) attrs.class+=' tet-block-end';
            }
          }
          if(kind==='heading') attrs.class+=` tet-h${Math.min(6,(lines[n-1].text.match(/^\s*(#+)/)?.[1] || '#').length)}`;
          if((attrs.class.includes('tet-gap') || attrs.class.includes('tet-quote-gap')) && inputRanges.some(([from,to])=>n>=from&&n<=to)) attrs.class+=' tet-input-gap';
          if(extraRows.has(n-1)) attrs.class+=' tet-extra-blank';
          if(kind==='blank' && paint.blanks.has(n-1)) attrs.class+=paint.blanks.get(n-1)===2 ? ' tet-paint-gap tet-paint-gap-2' : ' tet-paint-gap';
          if(paint.above.has(n-1)) attrs.class+=' tet-paint-above';
          if(paint.below.has(n-1)) attrs.class+=' tet-paint-below';
          builder.add(line.from,line.from,Decoration.line({attributes:attrs}));
        }
      }
      return builder.finish();
    }
  }, { decorations: value => value.decorations });
  // Do not register a keyboard handler. Enter/Shift+Enter/Tab/Backspace and
  // native Markdown continuation/exit rules belong entirely to Obsidian.
  return [decorations];
}

function isTabKnowledgeLine(text) { return /^ {0,3}\t\S|^ {0,3}\t\s+\S/.test(text); }
const tabContexts=new WeakMap();
function normalizedCode(text) { return text.replace(/\r\n/g,'\n').replace(/\n$/,''); }
function tabKnowledgeKeys(source) {
  const data=classify(source),keys=new Set(),excluded=new Set();
  for(let i=0;i<data.lines.length;i++) if(data.indentedCode[i] && (i===0||!data.indentedCode[i-1])) {
    let j=i;while(data.indentedCode[j])j++;
    const rows=data.lines.slice(i,j).map(l=>l.text);
    const key=rows.map(s=>s.replace(/^(?: {0,3}\t| {4})/,'')).join('\n');
    if(rows.filter(s=>s.trim()).every(isTabKnowledgeLine))keys.add(key);else excluded.add(key);
    i=j-1;
  }
  // A repeated fenced/space-indented block with identical text is ambiguous:
  // refuse visual conversion rather than turn real code into knowledge rows.
  let fence=null,body=[];
  for(const line of data.lines) {
    const m=/^ {0,3}(`{3,}|~{3,})/.exec(line.text);
    if(!fence&&m){fence=m[1];body=[];continue;}
    if(fence) {
      if(new RegExp('^ {0,3}'+fence[0]+'{'+fence.length+',}\\s*$').test(line.text)){excluded.add(body.join('\n'));fence=null;}
      else body.push(line.text);
    }
  }
  for(const key of excluded)keys.delete(key);
  return keys;
}

function decorateTabKnowledge(el,ctx,settings) {
  const blocks=[...(el.matches?.('pre')?[el]:[]),...el.querySelectorAll('pre')];
  for(const pre of blocks) {
    tabContexts.set(pre,ctx);
    if(!settings.layoutEnabled || !settings.tabKnowledgeLines)continue;
    if(pre.classList.contains('tet-tab-knowledge'))continue;
    const code=pre.querySelector('code');
    if(!code || [...code.classList].some(c=>c.startsWith('language-')))continue;
    let info;try{info=ctx.getSectionInfo(pre);}catch{continue;}
    if(!info?.text || !tabKnowledgeKeys(info.text).has(normalizedCode(code.textContent)))continue;
    const text=code.textContent,rows=normalizedCode(text).split('\n');
    code.replaceChildren();
    rows.forEach((row,i)=>{
      const span=code.ownerDocument.createElement('span');
      span.className=row.trim()?'tet-tab-row':'tet-tab-empty';span.textContent=row;
      code.appendChild(span);
      if(i<rows.length-1 || text.endsWith('\n'))code.appendChild(code.ownerDocument.createTextNode('\n'));
    });
    pre.classList.add('tet-tab-knowledge');code.classList.add('tet-tab-code');
  }
}

function refreshTabKnowledge(doc,settings) {
  for(const pre of doc.querySelectorAll('pre')) {
    if(pre.classList.contains('tet-tab-knowledge')) {
      const code=pre.querySelector('code');
      if(code){code.replaceChildren(code.textContent);code.classList.remove('tet-tab-code');} // drop row spans, keep the native text
      pre.classList.remove('tet-tab-knowledge');
    }
    const ctx=tabContexts.get(pre);if(ctx&&settings)decorateTabKnowledge(pre,ctx,settings);
  }
}

const blankContexts=new WeakMap();
// Native reading renders one section at a time, all with the same full source.
// Retain only the latest source analysis to avoid reparsing a long note N times.
let blankCache=null;
function cachedBlankRuns(text) {
  if(blankCache?.text!==text)blankCache={text,runs:blankSpacing(classify(text)).runs};
  return blankCache.runs;
}
function decorateExtraBlankLines(el,ctx,settings) {
  // LP owns its own source lines; embedded widgets must not duplicate gaps.
  if(el.closest('.markdown-source-view'))return;
  blankContexts.set(el,ctx);el.classList.add('tet-spacing-root');
  for(const spacer of el.querySelectorAll('.tet-extra-gap'))spacer.remove();
  if(!settings?.layoutEnabled || !settings.preserveExtraBlankLines)return;
  // Section bounds, not rendered text matching, identify repeated paragraphs.
  const children=[...el.children].filter(n=>!n.classList.contains('tet-extra-gap'));
  const nodes=children.length ? children : [el];
  const used=new Set();
  for(const node of nodes) {
    let section;try{section=ctx.getSectionInfo(node);}catch{continue;}
    if(!section?.text || !Number.isInteger(section.lineStart) || !Number.isInteger(section.lineEnd))continue;
    const runs=cachedBlankRuns(section.text);
    for(const run of runs) {
      const before=run.after===section.lineStart;
      const after=run.after===null && run.before===section.lineEnd;
      const key=run.from+':'+run.to;
      if((!before&&!after)||used.has(key))continue;
      used.add(key);
      const spacer=el.ownerDocument.createElement('div');spacer.className='tet-extra-gap';
      spacer.setAttribute('aria-hidden','true');spacer.style.setProperty('--tet-extra-lines',String(run.extra));
      // Keep native section ownership and avoid modifying note source.
      if(node===el) {if(before)el.prepend(spacer);else el.append(spacer);}
      else if(before)node.before(spacer);else node.after(spacer);
    }
  }
}

function refreshExtraBlankLines(doc,settings) {
  for(const el of doc.querySelectorAll('.tet-spacing-root')) {
    const ctx=blankContexts.get(el);
    if(settings&&ctx)decorateExtraBlankLines(el,ctx,settings);
    else {for(const spacer of el.querySelectorAll('.tet-extra-gap'))spacer.remove();el.classList.remove('tet-spacing-root');}
  }
  if(!settings)blankCache=null;
}

function applyLayout(doc, settings) {
  doc.body.classList.toggle('tet-enabled',settings.layoutEnabled);
  const vars = {
    '--tet-line-height': settings.lineHeight,
    '--tet-block-padding': settings.blockPadding + 'em',
    '--tet-h1': settings.headingH1 + 'em',
    '--tet-h2': settings.headingH2 + 'em',
    '--tet-h3': settings.headingH3 + 'em',
    '--tet-h4': settings.headingH4 + 'em',
    '--tet-list-indent': settings.listIndent + 'em',
  };
  // Following the body, tables/images fall back to --tet-paint-gap (half the
  // visible prose gap); only explicit values are written as variables.
  if(!settings.mediaFollowsBody) {
    vars['--tet-image-padding']=settings.imagePadding+'em';
    vars['--tet-table-padding']=settings.tablePadding+'em';
  }
  // Read-aloud highlight preset; the theme-accent preset leaves it to CSS.
  const speechColor=HIGHLIGHTS[settings.speechHighlight]?.[1];
  if(speechColor) vars['--tet-speech-highlight']=speechColor;
  let style = doc.getElementById('tet-layout-vars');
  if (!style) { style = doc.createElement('style'); style.id = 'tet-layout-vars'; doc.head.appendChild(style); }
  // Also reaches Obsidian's temporary print tree; settings travel in a style
  // sheet, not transient inline CSS on a particular renderer element.
  style.textContent = `:root { ${Object.entries(vars).map(([k,v])=>`${k}: ${v};`).join(' ')} }`;
}

export { layoutExtension, applyLayout, decorateTabKnowledge, refreshTabKnowledge, tabKnowledgeKeys, decorateExtraBlankLines, refreshExtraBlankLines };
