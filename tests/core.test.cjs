const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classify,blankSpacing,paintedGaps,formatNote,scanImages,imageDimensions,resizedToken,sameDocumentPatch,splitPipes,dragSize,tableCellRange}=require('../src/markdown');
const {stylePatch}=require('../src/text-style');

test('one separator collapses; each additional saved plain blank stays visible',()=>{
  for(let count=1;count<=4;count++) {
    const text='前文'+ '\n'.repeat(count+1)+'后文';
    const gaps=blankSpacing(classify(text));
    assert.equal(gaps.rows.size,count-1);
    assert.equal(gaps.runs.reduce((n,r)=>n+r.extra,0),count-1);
    assert.equal(formatNote(text).text,text);
    assert.equal(blankSpacing(classify(text.replace(/\n/g,'\r\n'))).rows.size,count-1);
  }
  assert.equal(blankSpacing(classify('前文\n')).rows.size,0);
  assert.equal(blankSpacing(classify('前文\n\n')).rows.size,0);
  assert.equal(blankSpacing(classify('前文\n\n\n')).rows.size,1);
  assert.equal(blankSpacing(classify('\n\n正文')).rows.size,2);
});

test('extra-blank calculation does not reinterpret YAML, fences, HTML, quotes or indented code',()=>{
  for(const text of ['---\n\n\na: 1\n---','```\n\n\n```','<div>\n\n</div>','> 引用\n>\n>\n> 续行','    code\n\n\n    more']) {
    assert.equal(blankSpacing(classify(text)).rows.size,0,text);
  }
});

test('painted code, quote and Callout edges restore half the visible prose gap outside their paint',()=>{
  const gaps=text=>{const g=paintedGaps(classify(text));return {blanks:[...g.blanks],above:[...g.above],below:[...g.below]};};
  const table='| 层次 | 职责 |\n| --- | --- |\n| 甲 | 乙 |';
  // One half per painted side on the first separator; prose and lists keep their own padding.
  const mixed='正文\n\n```text\n代码\n```\n\n> 引用\n\n正文';
  assert.deepEqual(gaps(mixed),{blanks:[[1,1],[5,2],[7,1]],above:[],below:[]});
  assert.deepEqual(gaps(mixed.replace(/\n/g,'\r\n')),gaps(mixed));
  assert.deepEqual(gaps('> [!note] 提示\n> 内容\n\n'+table+'\n\n~~~\n代码\n~~~').blanks,[[2,1],[6,1]]);
  // Tables, images, headings, lists, Tab rows and prose alone need no restored half.
  for(const text of ['正文\n\n'+table+'\n\n- 列表','## 标题\n\n![[图.png]]\n\n'+table,'\t知识行\n\n正文']) assert.deepEqual(gaps(text),{blanks:[],above:[],below:[]},text);
  // Extra blanks keep N-1 visible rows; the first separator carries the half.
  const extra='```\n代码\n```\n\n\n正文';
  assert.deepEqual(gaps(extra).blanks,[[3,1]]);
  assert.deepEqual([...blankSpacing(classify(extra)).rows],[4]);
  // Without a blank line, the unpainted line touching the paint gets the space.
  assert.deepEqual(gaps('正文\n```\n代码\n```\n## 标题\n> 引用\n\n正文'),{blanks:[[6,1]],above:[4],below:[0,4]});
  // Lazy quote prose belongs to the quote; tables touching paint keep their own padding.
  assert.deepEqual(gaps('> 引用\n懒续行\n\n正文').blanks,[[2,1]]);
  assert.deepEqual(gaps('```\n代码\n```\n'+table),{blanks:[],above:[],below:[]});
  // Indented quotes and code inside lists keep list spacing, as in Reading/PDF.
  assert.deepEqual(gaps('- 列表\n  ```\n  代码\n  ```\n\n  > 引用\n\n正文'),{blanks:[],above:[],below:[]});
  // A trailing caret position is not a separator; source text is never rewritten.
  assert.deepEqual(gaps('```\n代码\n```\n').blanks,[]);
  assert.equal(formatNote(mixed).text,mixed);
});

test('image dimension input reads wiki, Markdown, references and escaped table alt safely',()=>{
  for(const source of ['![[图.png|280x150]]','![图|280x150](<附件/图.png>)','| 图 |\n| --- |\n| ![图\\|280x150](图.png) |','![图|280x150][id]\n\n[id]: 图.png']) {
    assert.deepEqual(imageDimensions(scanImages(source)[0]),{width:280,height:150});
  }
  assert.deepEqual(imageDimensions(scanImages('![280](图.png)')[0]),{width:280,height:null});
  assert.equal(imageDimensions(scanImages('![[图.png|别名280]]')[0]),null);
  assert.equal(imageDimensions(scanImages('![图](图片280x150.png)')[0]),null);
});

test('prose paragraphs, heading, image and top-level list acquire standard blank lines',()=>{
  const input='# 计划\n风险预算\n执行规则\n![[图.png]]\n- 入场\n- 出场\n';
  assert.equal(formatNote(input).text,'# 计划\n\n风险预算\n\n执行规则\n\n![[图.png]]\n\n- 入场\n\n- 出场\n');
});
test('formatter is idempotent and preserves CRLF and final newline',()=>{
  const once=formatNote('正文一\r\n正文二\r\n').text;
  assert.equal(once,'正文一\r\n\r\n正文二\r\n');assert.equal(formatNote(once).text,once);
});
test('indented list paragraphs are metadata, not opaque code; independent code is preserved',()=>{
  const d=classify('- A\n  child\n\n  second\n\n- B\n\noutside\n\n\tcode\n\n\tmore');
  assert.equal(d.continuations[1],true);assert.equal(d.continuations[3],true);
  assert.equal(d.indentedCode[9],true);assert.equal(d.indentedCode[10],true);assert.equal(d.indentedCode[11],true);
  assert.deepEqual(classify('  prose\n   prose').kinds,['prose','prose']);
  assert.deepEqual(classify('prose\n\tsoft line').kinds,['prose','prose']);
});
test('explicit indented paragraph formatting inserts only blanks and is idempotent',()=>{
  const text='- A\n  paragraph one\n  paragraph two\n  - nested\n    child\n\n    [link]: x\n        "title"';
  const opts={splitIndentedListParagraphs:true};
  const out=formatNote(text,opts).text;
  assert.equal(out,'- A\n\n  paragraph one\n\n  paragraph two\n  - nested\n\n    child\n\n    [link]: x\n        "title"');
  assert.equal(formatNote(out,opts).text,out);
  assert.equal(formatNote('- A\n  child\noutside',opts).text,'- A\n\n  child\n\noutside');
  for(const input of ['- A\n      code\n      more','- A\n  **multi\n  line**','- A\n  line  \n  break','> quote\n> continuation','\tcode\n\tmore']) assert.equal(formatNote(input,opts).text,input);
});

test('quote followed immediately by a heading and list releases the protected region',()=>{
  const input='## 第一节\n> 第一段引用\n## 第二节\n> 第二段引用\n- 列表一\n- 列表二\n\n正文';
  const data=classify(input);
  assert.deepEqual(data.kinds,['heading','protected','heading','protected','list','list','blank','prose']);
  assert.deepEqual(data.quotes,[false,true,false,true,false,false,false,false]);
  const formatted=formatNote(input).text;
  assert.equal(formatted,'## 第一节\n\n> 第一段引用\n\n## 第二节\n\n> 第二段引用\n\n- 列表一\n\n- 列表二\n\n正文');
  assert.equal(formatNote(formatted).text,formatted);
});

test('valid quote lazy prose, Callouts, quoted headings and nested quote children remain intact',()=>{
  for(const text of ['> 引用正文\n合法的惰性续行\n仍是引用正文','> [!note] 标题\n> 引用正文\n合法续行','- 父级\n  > 子级引用\n  > 第二行','> # 引用内标题\n> 引用内正文']) assert.equal(formatNote(text).text,text);
  assert.deepEqual(classify('> # 引用标题\n外部正文').kinds,['protected','prose']);
  assert.deepEqual(classify('>\n外部正文').kinds,['protected','prose']);
});

test('quote state ends at fences, thematic breaks, HTML and ordered-list interruptions',()=>{
  for(const middle of ['```\n代码\n```','---','<div>\nHTML\n</div>','1. 外部列表']) {
    const text='> 引用\n'+middle+'\n\n外部正文';
    const data=classify(text);assert.equal(data.quotes[1],false,middle);assert.equal(data.kinds.at(-1),'prose');
  }
  assert.equal(classify('> 引用\n2. 合法的惰性续行').quotes[1],true);
  assert.equal(classify('> 引用\n    合法的缩进续行').quotes[1],true);
});

test('heading ends a list continuation; genuine lazy list prose is marked without a new paragraph',()=>{
  const data=classify('- 列表\n惰性续行\n## 新标题\n新正文');
  assert.deepEqual(data.kinds,['list','protected','heading','prose']);
  assert.deepEqual(data.continuations,[false,true,false,false]);
  assert.equal(formatNote('- 列表\n续行',{splitProseLines:false}).text,'- 列表\n续行');
});

test('explicit per-line mode separates top-level list from prose but protects nested/lazy-preserve modes',()=>{
  const input='- A\n- B\n后续正文';
  assert.equal(formatNote(input).text,'- A\n\n- B\n\n后续正文');
  assert.equal(formatNote(input,{splitProseLines:false}).text,'- A\n\n- B\n后续正文');
  assert.equal(formatNote('- A\n  - B\n嵌套的惰性续行').text,'- A\n  - B\n嵌套的惰性续行');
  const formatted=formatNote(input).text;assert.equal(formatNote(formatted).text,formatted);
});
test('YAML, fences, callouts, nested lists, reference definitions and HTML are preserved',()=>{
  const cases=[
    '---\ntags: [交易]\naliases:\n  - 测试\n---\n',
    '```js\nlet x=1;\n![[fake.png]]\n```',
    '~~~~\n```\n![[fake.png]]\n~~~~',
    '> [!warning] 风险\n> 第一段\n> - 注意\n>   - 第二项',
    '> 引用\n合法的惰性续行\n不能插入空行',
    '- 主项目\n  - 子项目 A\n  - 子项目 B\n    续行内容',
    '[链接]: <Attachments/附件.pdf>\n    "标题"',
    '<div>\n正文\n正文\n</div>',
    '<!--\n正文\n正文\n-->',
    '$$\na+b\nc+d\n$$',
    '标题\n====',
  ];
  for(const input of cases) assert.equal(formatNote(input).text,input,input);
});
test('hard breaks and optional soft-line preservation',()=>{
  assert.equal(formatNote('第一行  \n第二行').text,'第一行  \n第二行');
  assert.equal(formatNote('第一行\\\n第二行').text,'第一行\\\n第二行');
  assert.equal(formatNote('第一行\n第二行',{splitProseLines:false}).text,'第一行\n第二行');
});
test('multiline inline code, emphasis, inline HTML and links are not split',()=>{
  for(const input of ['`第一行\n第二行`','**第一行\n第二行**','<span style="color: #d64545;">第一行\n第二行</span>','[第一行\n第二行](链接.md)']) assert.equal(formatNote(input).text,input);
});
test('tables nested in lists and quotes escape inserted image size pipes',()=>{
  for(const prefix of ['  ','> ']) {
    const text=(prefix==='  '?'- 项目\n':'')+[prefix+'| A | B |',prefix+'| --- | --- |',prefix+'| A | ![[图.png]] |'].join('\n');
    const token=scanImages(text)[0];assert.ok(token.inTable);
    assert.ok(sameDocumentPatch(text,token,resizedToken(token,320)).includes('图.png\\|320'));
  }
});
test('table source is untouched and table boundaries separated',()=>{
  const table='| 内容 | 图片 |\n| --- | --- |\n| 测试 | ![[中文 路径.png\\|320]] |';
  assert.equal(formatNote('正文\n'+table+'\n后续').text,'正文\n\n'+table+'\n\n后续');
});
test('formatter adds blank before sibling after nested items without reindenting',()=>{
  const input='- A\n  - a\n  - b\n- B';
  assert.equal(formatNote(input).text,'- A\n  - a\n  - b\n\n- B');
});
test('fences, YAML, inline code and comments produce no image matches',()=>{
  const input='---\nexample: ![[fake.png]]\n---\n```\n![[fake.png]]\n```\n`![[fake.png]]`\n<!-- ![[fake.png]] -->\n![[real.png]]';
  assert.deepEqual(scanImages(input).map(x=>x.target),['real.png']);
});
test('indented list and quote images remain editable',()=>{
  assert.deepEqual(scanImages('- A\n  ![[附件/图.png]]\n\n> ![[引用图.png]]').map(x=>x.target),['附件/图.png','引用图.png']);
});
test('all internal image width changes preserve Chinese paths and fragments',()=>{
  const token=scanImages('前文 ![[附件/中文 图片.png#outline|200]] 后文')[0];
  assert.equal(resizedToken(token,320),'![[附件/中文 图片.png#outline|320]]');
});
test('Excalidraw native alignment survives width and free-size changes',()=>{
  for(const input of ['![[绘图.excalidraw|120|left]]','![[绘图.excalidraw.md|120x80|left]]']) {
    const token=scanImages(input)[0];
    assert.equal(resizedToken(token,320,220),input.replace(/120(?:x80)?/,'320x220'));
  }
  assert.equal(resizedToken(scanImages('![[绘图.excalidraw|right-wrap]]')[0],320),'![[绘图.excalidraw|320|right-wrap]]');
});
test('Markdown images preserve nested destination parentheses and titles',()=>{
  const input='![交易图](<附件/图 (1).png> "说明")';
  assert.equal(resizedToken(scanImages(input)[0],320),'![交易图|320](<附件/图 (1).png> "说明")');
  const nested='![图](https://example.com/a(b).png "标题")';
  assert.equal(resizedToken(scanImages(nested)[0],320),'![图|320](https://example.com/a(b).png "标题")');
});
test('old numeric-only alt dimension is replaced, not retained as fake alias',()=>{
  assert.equal(resizedToken(scanImages('![250](https://example.com/a.png)')[0],320),'![|320](https://example.com/a.png)');
});
test('reference images resize alt and preserve definitions',()=>{
  for(const input of ['![描述][chart]\n\n[chart]: 图.png','![chart][]\n\n[chart]: 图.png']) {
    const token=scanImages(input)[0];assert.ok(token);
    const replaced=resizedToken(token,300);
    assert.equal(replaced,input.startsWith('![描述]') ? '![描述|300][chart]' : '![chart|300][chart]');
  }
});
test('wiki alias converts to readable native Markdown and correct relative path',()=>{
  const token=scanImages('![[图.png|别名]]')[0];
  const output=resizedToken(token,320,null,{resolvedPath:'附件/图.png',notePath:'笔记/今日.md'});
  assert.equal(output,'![别名|320](<../%E9%99%84%E4%BB%B6/%E5%9B%BE.png>)');
  assert.throws(()=>resizedToken(token,320),/解析/);
});
test('table internal, Markdown, reference and Excalidraw images retain exact column count',()=>{
  for(const image of ['![[图.png]]','![图](附件/图.png)','![[绘图.excalidraw\\|120\\|left]]','![说明\\|200](图.png)']) {
    const input='| 标签 | 图片 |\n| --- | --- |\n| 风险 | '+image+' |';
    const token=scanImages(input)[0];assert.ok(token.inTable);
    const replacement=resizedToken(token,320,220);
    assert.ok(replacement.includes('\\|320x220'));
    const output=sameDocumentPatch(input,token,replacement);
    assert.equal(splitPipes(output.split('\n')[2]).length,2);
  }
});
test('table alias conversion escapes all pipe characters',()=>{
  const input='| 标签 | 图片 |\n| --- | --- |\n| A | ![[图.png\\|说明]] |';
  const token=scanImages(input)[0];
  const output=sameDocumentPatch(input,token,resizedToken(token,320,null,{resolvedPath:'图.png',notePath:'A.md'}));
  assert.ok(output.includes('![说明\\|320]'));assert.equal(splitPipes(output.split('\n')[2]).length,2);
});
test('table separator guard and stale token guard reject unsafe patches',()=>{
  const input='| A | B |\n| --- | --- |\n| A | ![[图.png]] |';
  const token=scanImages(input)[0];
  assert.throws(()=>sameDocumentPatch(input,token,'![[图.png|320]]'),/列数/);
  assert.throws(()=>sameDocumentPatch('新增'+input,token,'x'),/已变化/);
});
test('repeated image patch edits only selected occurrence',()=>{
  const text='![[图.png]]\n\n![[图.png]]';const token=scanImages(text)[1];
  assert.equal(sameDocumentPatch(text,token,resizedToken(token,320)),'![[图.png]]\n\n![[图.png|320]]');
});
test('native table widget anchor maps each rendered row and column to exact source',()=>{
  const text='![[图.png]]\n\n| A | B |\n| --- | --- |\n| a | ![[图.png\\|180]] |\n| b | ![[图.png\\|180]] |';
  const anchor=text.indexOf('| A'),tokens=scanImages(text);
  const cell=tableCellRange(text,anchor,2,1);
  assert.equal(tokens.filter(t=>t.start>=cell.from&&t.end<=cell.to)[0].start,tokens[2].start);
  assert.equal(cell.count,2);assert.equal(tableCellRange(text,0,1,1),null);
});
test('all four corners maintain aspect ratio; Alt permits free dimensions',()=>{
  for(const [corner,dx,dy] of [['se',100,10],['sw',-100,10],['ne',100,-10],['nw',-100,-10]]) assert.deepEqual(dragSize({width:200,height:100},dx,dy,corner,false),{width:300,height:150});
  assert.deepEqual(dragSize({width:200,height:100},100,10,'se',true),{width:300,height:110});
});
test('invalid dimensions and injected color values are rejected',()=>{
  const token=scanImages('![[图.png]]')[0];
  assert.throws(()=>resizedToken(token,NaN));assert.throws(()=>resizedToken(token,10));assert.throws(()=>resizedToken(token,300,-1));
  assert.throws(()=>stylePatch('风险',0,2,'color','#fff;position:fixed'));
});
test('text color replace and nested three-style clear',()=>{
  let text='风险';let start=0,end=2;
  for(const [kind,value] of [['color','#d64545'],['color','#367bd6'],['highlight','#ffe1bd'],['underline',null]]) {
    const patch=stylePatch(text,start,end,kind,value);
    text=text.slice(0,patch.from)+patch.text+text.slice(patch.to);start=patch.selectFrom;end=patch.selectTo;
  }
  assert.equal((text.match(/<span/g)||[]).length,1);
  const patch=stylePatch(text,start,end,'clear');
  assert.equal(text.slice(0,patch.from)+patch.text+text.slice(patch.to),'风险');
});
test('underline toggles; multi-block text is not wrapped in invalid HTML',()=>{
  assert.equal(stylePatch('<u>风险</u>',3,5,'underline').text,'风险');
  assert.throws(()=>stylePatch('第一段\n\n第二段',0,8,'color','#d64545'),/跨段落/);
});

test('highlight preserves explicitly colored text and clear accepts that foreground',()=>{
  const text='<span style="color: #d64545;"><u>风险</u></span>',start=text.indexOf('风险');
  const patch=stylePatch(text,start,start+2,'highlight','#ffe1bd');
  assert.ok(patch.text.includes('color: #d64545;'));
  const next=text.slice(0,patch.from)+patch.text+text.slice(patch.to);
  const clear=stylePatch(next,patch.selectFrom,patch.selectTo,'clear');
  assert.equal(next.slice(0,clear.from)+clear.text+next.slice(clear.to),'风险');
});
test('clear covers selected legacy siblings but never changes unselected siblings or third-party HTML',()=>{
  const text='<u>A</u> + <u>B</u>';
  assert.equal(stylePatch(text,0,text.length,'clear').text,'A + B');
  assert.equal(stylePatch(text,3,4,'clear').text,'A + <u>B</u>');
  const custom='<span class="custom">风险</span>';
  assert.equal(stylePatch(custom,0,custom.length,'clear').text,custom);
});
