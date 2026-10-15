import { Lexer } from 'marked';
import { classify } from './markdown.mjs';
const HEX = /^#[0-9a-f]{6}$/i;
const ACTIONS=new Set(['color','highlight','underline','clear-color','clear-highlight','clear-underline','clear']);

/** Recognize only our ownership marker or EXACT historical plugin forms.
 * Foreign attributes/CSS are never removed by the plugin. */
function readStyleTag(raw) {
  let m=raw.match(/^<span data-mengren-style="1" style="([^"]*)">$/i);
  if(m) {
    const styles={};
    for(const declaration of m[1].split(';').filter(s=>s.trim())) {
      const pair=declaration.trim().match(/^(color|background-color|text-decoration)\s*:\s*(.+)$/i);
      if(!pair)return null;
      const key=pair[1].toLowerCase(),value=pair[2].trim();
      if(key==='text-decoration') {if(value!=='underline')return null;styles.underline=true;}
      else {if(!HEX.test(value))return null;styles[key==='color'?'color':'highlight']=value.toLowerCase();}
    }
    return styles;
  }
  m=raw.match(/^<span style="color:\s*(#[0-9a-f]{6});?">$/i);
  if(m)return {color:m[1].toLowerCase()};
  m=raw.match(/^<mark style="background-color:\s*(#[0-9a-f]{6});(?: color:\s*(#[0-9a-f]{6});)?">$/i);
  if(m)return {highlight:m[1].toLowerCase(),legacyForeground:m[2]?.toLowerCase()};
  if(/^<u>$/i.test(raw))return {underline:true};
  return null;
}

function mergedStyles(parent,own) {
  const result={...parent,...own};delete result.legacyForeground;
  // A legacy mark's automatic contrast foreground was not an independent color.
  if(!result.color&&own.legacyForeground&&own.legacyForeground!=='#202020')result.color=own.legacyForeground;
  return result;
}

function spanOpen(styles) {
  const css=[];
  if(styles.color)css.push('color: '+styles.color+';');
  if(styles.highlight)css.push('background-color: '+styles.highlight+';');
  if(styles.underline)css.push('text-decoration: underline;');
  return css.length?'<span data-mengren-style="1" style="'+css.join(' ')+'">':'';
}

/** Keep original Markdown delimiter/link bytes; never round-trip via HTML. */
function inlineNodes(tokens,base) {
  const nodes=[];let offset=base;
  for(const token of tokens) {
    const from=offset,to=offset+token.raw.length;offset=to;
    if(['strong','em','del','link'].includes(token.type)&&token.tokens) {
      const inner=token.tokens.map(t=>t.raw).join('');let prefixLength;
      if(token.type==='strong'||token.type==='del')prefixLength=2;
      else if(token.type==='em')prefixLength=1;
      else if(token.raw.startsWith('['))prefixLength=1;
      else {nodes.push({type:'protected',raw:token.raw,from,to});continue;}
      if(token.raw.slice(prefixLength,prefixLength+inner.length)!==inner) {nodes.push({type:'protected',raw:token.raw,from,to});continue;}
      nodes.push({type:'semantic',semantic:token.type,raw:token.raw,from,to,prefix:token.raw.slice(0,prefixLength),suffix:token.raw.slice(prefixLength+inner.length),children:inlineNodes(token.tokens,from+prefixLength)});
    } else if(token.type==='text') {
      // Native wiki aliases do not safely support HTML inside their brackets.
      const re=/!?\[\[[^\]]*\]\]/g;let m,last=0;
      while((m=re.exec(token.raw))) {
        if(m.index>last)nodes.push({type:'text',raw:token.raw.slice(last,m.index),from:from+last,to:from+m.index});
        nodes.push({type:'protected',raw:m[0],from:from+m.index,to:from+re.lastIndex});last=re.lastIndex;
      }
      if(last<token.raw.length)nodes.push({type:'text',raw:token.raw.slice(last),from:from+last,to});
    } else nodes.push({type:token.type==='html'?'html':'protected',raw:token.raw,from,to});
  }
  return groupHTML(nodes);
}

function groupHTML(nodes) {
  const result=[];
  for(let i=0;i<nodes.length;i++) {
    const node=nodes[i],open=node.type==='html'&&node.raw.match(/^<(span|mark|u)(?:\s[^>]*)?>$/i);
    if(!open){result.push(node);continue;}
    let depth=1,end=i+1;
    for(;end<nodes.length;end++) if(nodes[end].type==='html') {
      if(new RegExp('^<'+open[1]+'(?:\\s[^>]*)?>$','i').test(nodes[end].raw))depth++;
      if(new RegExp('^</'+open[1]+'\\s*>$','i').test(nodes[end].raw)&&--depth===0)break;
    }
    if(end>=nodes.length){result.push({...node,type:'invalid'});continue;}
    const close=nodes[end],styles=readStyleTag(node.raw);
    result.push({type:styles?'style':'foreign',from:node.from,to:close.to,prefix:node.raw,suffix:close.raw,raw:nodes.slice(i,end+1).map(n=>n.raw).join(''),styles,children:groupHTML(nodes.slice(i+1,end))});i=end;
  }
  return result;
}

function overlaps(node,start,end){return node.from<end&&node.to>start;}
function textPrefix(line) {
  let prefix=line.match(/^\s*/)?.[0]||'';
  while(line.slice(prefix.length).startsWith('>'))prefix+=line.slice(prefix.length).match(/^>\s?/)[0];
  const structure=line.slice(prefix.length).match(/^(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/);
  return prefix+(structure?.[0]||'');
}

function stylePatch(text,start,end,kind,value) {
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>text.length||start>=end)throw new Error('请先选中文字');
  if(!ACTIONS.has(kind))throw new Error('未知样式');
  if(['color','highlight'].includes(kind)&&!HEX.test(value))throw new Error('颜色必须是 #RRGGBB');
  if(/[\r\n]/.test(text.slice(start,end)))throw new Error('文字样式不跨段落或表格行应用，请在一个物理行内选择');
  const from=text.lastIndexOf('\n',start-1)+1,next=text.indexOf('\n',end),to=next<0?text.length:next;
  const data=classify(text),lineIndex=data.lines.findIndex(l=>l.start===from);
  if(data.indentedCode[lineIndex]||(data.kinds[lineIndex]==='protected'&&!data.quotes[lineIndex]&&!data.continuations[lineIndex]&&!/^\s*<(?:span|mark|u)\b/.test(text.slice(from,to))))throw new Error('代码块、元数据及其他受保护结构不应用文字样式');
  if(data.table[lineIndex]&&/(?:^|[^\\])\|/.test(text.slice(start,end)))throw new Error('请在同一个表格单元格内选择文字');
  const line=text.slice(from,to),prefix=textPrefix(line),lexer=new Lexer({gfm:true});
  lexer.lex(text);
  const tokens=lexer.inlineTokens(line.slice(prefix.length));
  if(tokens.map(t=>t.raw).join('')!==line.slice(prefix.length))throw new Error('无法可靠解析选区，请缩小选区后重试');
  const nodes=inlineNodes(tokens,from+prefix.length),selected=[];
  function malformed(ns){return ns.some(n=>n.type==='invalid'||(n.children&&malformed(n.children)));}
  if(malformed(nodes))throw new Error('HTML 标签未闭合或跨行，未修改；请先检查源码');
  function collect(ns,styles={}) {for(const n of ns) {
    if(n.type==='style')collect(n.children,mergedStyles(styles,n.styles));
    else if(n.children)collect(n.children,styles);
    else if(n.type==='text'&&overlaps(n,start,end)&&n.raw.slice(Math.max(0,start-n.from),Math.min(n.raw.length,end-n.from)).trim())selected.push(styles);
  }}
  collect(nodes);
  if(!selected.length)throw new Error('选区只有代码、链接语法或受保护内容；请选正文或链接显示文字');
  const underline=kind==='underline'&&!selected.every(s=>s.underline),chunks=[];
  const add=(raw,styles=null,sel=false)=>{if(raw)chunks.push({raw,styles,sel});};
  function changed(styles) {
    const s={...styles};
    if(kind==='color'||kind==='highlight')s[kind]=value.toLowerCase();
    else if(kind==='underline'){if(underline)s.underline=true;else delete s.underline;}
    else if(kind==='clear')return {};
    else delete s[kind.slice(6)];
    return s;
  }
  function render(ns,styles={},normalizing=false) {for(const n of ns) {
    if(!normalizing&&!overlaps(n,start,end)&&!(n.type==='style'&&n.prefix.startsWith('<span data-mengren-style="1"'))){add(n.raw);continue;}
    if(n.type==='style')render(n.children,mergedStyles(styles,n.styles),true);
    else if(n.children){add(n.prefix);render(n.children,styles,normalizing);add(n.suffix);}
    else if(n.type==='text') {
      const a=Math.max(n.from,start),b=Math.min(n.to,end);
      if(a>=b){add(n.raw,styles);continue;}
      add(n.raw.slice(0,a-n.from),styles);add(n.raw.slice(a-n.from,b-n.from),changed(styles),true);add(n.raw.slice(b-n.from),styles);
    } else add(n.raw);
  }}
  add(prefix);render(nodes);
  const runs=[];
  for(const chunk of chunks) {
    const key=chunk.styles!==null?spanOpen(chunk.styles):null,last=runs.at(-1);
    if(key!==null&&last?.key===key)last.parts.push(chunk);else runs.push({key,parts:[chunk]});
  }
  let output='',selectFrom=null,selectTo=null;
  for(const run of runs) {
    const open=run.key||'';output+=open;
    for(const chunk of run.parts){if(chunk.sel){if(selectFrom===null)selectFrom=from+output.length;selectTo=from+output.length+chunk.raw.length;}output+=chunk.raw;}
    if(open)output+='</span>';
  }
  return {from,to,text:output,selectFrom:selectFrom??start,selectTo:selectTo??end};
}

function captureSelection(editor,file) {
  const text=editor.getValue(),start=editor.posToOffset(editor.getCursor('from')),end=editor.posToOffset(editor.getCursor('to'));
  if(start===end)throw new Error('请先选中文字');
  return {editor,file,text,start,end};
}
function commitStyle(snapshot,kind,value) {
  const {editor,text,start,end}=snapshot;
  if(editor.getValue()!==text||(snapshot.info&&snapshot.info.file?.path!==snapshot.file?.path))throw new Error('笔记已变化，请重新选择文字');
  const p=stylePatch(text,start,end,kind,value),next=text.slice(0,p.from)+p.text+text.slice(p.to);
  const pos=offset=>{const parts=next.slice(0,offset).split('\n');return {line:parts.length-1,ch:parts.at(-1).length};};
  if(next!==text)editor.transaction({changes:[{from:editor.offsetToPos(p.from),to:editor.offsetToPos(p.to),text:p.text}],selection:{from:pos(p.selectFrom),to:pos(p.selectTo)}});
  else editor.setSelection(pos(p.selectFrom),pos(p.selectTo));
  editor.focus();
}
/** Read native semantics for styled HTML widgets. Derived display state only;
 * never add font-weight/emphasis to persistent plugin CSS. */
function semanticStyleRanges(text) {
  const lexer=new Lexer({gfm:true});lexer.lex(text);
  const data=classify(text),ranges=[];
  for(let i=0;i<data.lines.length;i++) {
    if(data.indentedCode[i]||(data.kinds[i]==='protected'&&!data.quotes[i]&&!data.continuations[i]))continue;
    const line=data.lines[i],prefix=textPrefix(line.text),tokens=lexer.inlineTokens(line.text.slice(prefix.length));
    if(tokens.map(t=>t.raw).join('')!==line.text.slice(prefix.length))continue;
    function visit(nodes,flags={}) {for(const n of nodes) {
      const own=n.type==='semantic'?{...flags,[n.semantic]:true}:flags;
      if(n.type==='style')ranges.push({from:n.from,to:n.to,...flags});
      if(n.children)visit(n.children,own);
    }}
    visit(inlineNodes(tokens,line.start+prefix.length));
  }
  return ranges;
}
export { stylePatch, captureSelection, commitStyle, readStyleTag, semanticStyleRanges, HEX };
