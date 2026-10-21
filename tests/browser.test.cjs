const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
let browser,page;
const {cases:styleCases}=require('../scripts/style-fixture.cjs');
const root=path.resolve(__dirname,'..'),work=path.join(root,'.test-artifacts');
before(async()=>{
  fs.mkdirSync(work,{recursive:true});
  const bundle=await build({entryPoints:[path.join(__dirname,'helpers/browser-entry.js')],bundle:true,write:false,platform:'browser',format:'iife',alias:{obsidian:path.join(__dirname,'helpers/obsidian-mock.js'),
    // CodeMirror ships ESM and CJS builds; pin one file so import and require share instances.
    '@codemirror/state':path.join(root,'node_modules/@codemirror/state/dist/index.js'),'@codemirror/view':path.join(root,'node_modules/@codemirror/view/dist/index.js')}});
  browser=await chromium.launch({executablePath:process.env.TET_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',headless:true});
  page=await browser.newPage({viewport:{width:1200,height:900}});
  await page.route('https://fixture.invalid/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#d8eaff"/><text x="20" y="50" font-size="20">Trader Chart</text></svg>'}));
  await page.setContent('<html><head></head><body></body></html>');
  await page.addStyleTag({content:fs.readFileSync(path.join(root,'styles.css'),'utf8')+'body{font:16px sans-serif;padding:40px;background:#fff;color:#202020}.cm-editor{border:1px solid #ddd;width:800px}.cm-content{padding:20px}.markdown-preview-view{width:800px}.modal{position:fixed;inset:60px 180px;background:white;z-index:2000;padding:24px;overflow:auto;border:1px solid #ccc}.setting-item{display:flex;justify-content:space-between;gap:15px;margin:10px 0}'});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
});
after(async()=>{await browser?.close();});
async function setup(text,mode='live') {await page.evaluate(([t,m])=>window.setup(t,m),[text,mode]);await page.waitForTimeout(100);}
async function drag(selector,dx,dy,alt=false) {
  await page.locator(selector).first().click();
  await page.waitForSelector('.tet-resize-overlay');
  const rect=await page.locator('.tet-se').boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();
  if(alt) await page.keyboard.down('Alt');
  await page.mouse.move(rect.x+rect.width/2+dx,rect.y+rect.height/2+dy,{steps:5});
  await page.mouse.up();if(alt)await page.keyboard.up('Alt');await page.waitForTimeout(80);
}
test('real CM6 widget drag persists width, undo and rerender',async()=>{
  await setup('![[附件/交易图.png]]');
  await drag('img',80,0);
  assert.equal(await page.evaluate(()=>fixture.text()),'![[附件/交易图.png|280]]');
  assert.equal(await page.locator('img').getAttribute('width'),'280');
  await page.evaluate(()=>fixture.undo());assert.equal(await page.evaluate(()=>fixture.text()),'![[附件/交易图.png]]');
});
test('native image wrapper receives click when child image disables pointer events',async()=>{
  await setup('![[图.png]]');
  await page.locator('img').evaluate(n=>{n.style.pointerEvents='none';n.parentElement.style.display='inline-block';});
  const image=await page.locator('img').boundingBox();await page.mouse.click(image.x+image.width/2,image.y+image.height/2);
  await page.waitForSelector('.tet-resize-overlay');
  const h=await page.locator('.tet-se').boundingBox();await page.mouse.move(h.x+7,h.y+7);await page.mouse.down();await page.mouse.move(h.x+57,h.y+7);await page.mouse.up();await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>fixture.text()),'![[图.png|250]]');
});
test('CM6 table image drag is stable during movement and persists escaped pipe',async()=>{
  await setup('| 场景 | 图 |\n| --- | --- |\n| 普通 | ![[图.png]] |\n| 绘图 | ![[绘图.excalidraw]] |');
  await page.locator('img').click();await page.waitForSelector('.tet-se');
  const tableBefore=await page.locator('table').boundingBox(),handle=await page.locator('.tet-se').boundingBox();
  await page.mouse.move(handle.x+7,handle.y+7);await page.mouse.down();await page.mouse.move(handle.x+107,handle.y+7,{steps:4});
  assert.equal(await page.evaluate(()=>fixture.text().includes('\\|300')),false);
  const tableDuring=await page.locator('table').boundingBox();assert.equal(tableDuring.width,tableBefore.width);
  await page.screenshot({path:path.join(work,'table-drag-live-preview.png')});
  await page.mouse.up();await page.waitForTimeout(80);
  assert.ok((await page.evaluate(()=>fixture.text())).includes('![[图.png\\|300]]'));
  assert.equal(await page.locator('tbody tr').first().locator('td').count(),2);
});
test('Excalidraw table SVG supports free resize and keeps alignment',async()=>{
  await setup('| 名称 | 图 |\n| --- | --- |\n| A | ![[绘图.excalidraw\\|200\\|left]] |');
  await drag('svg.excalidraw-svg',80,25,true);
  assert.ok((await page.evaluate(()=>fixture.text())).includes('![[绘图.excalidraw\\|280x125\\|left]]'));
  assert.equal(await page.locator('tbody td').count(),2);
});
test('native Excalidraw filesource wrapper locates canonical path after async replacement',async()=>{
  await setup('| 名称 | 图 |\n| --- | --- |\n| A | ![[绘图.excalidraw\\|200]] |');
  await page.locator('span.internal-embed').evaluate(n=>{n.className='excalidraw-svg excalidraw-embedded-img';n.setAttribute('filesource','附件/绘图.excalidraw');n.removeAttribute('src');});
  await drag('svg.excalidraw-svg',80,0);
  assert.ok((await page.evaluate(()=>fixture.text())).includes('绘图.excalidraw\\|280'));
});
test('ordinary Markdown image and filename with spaces keep readable destination',async()=>{
  await setup('![图表](<附件/中文 图片 (1).png> "标题")');
  await drag('img',60,0);
  assert.equal(await page.evaluate(()=>fixture.text()),'![图表|260](<附件/中文 图片 (1).png> "标题")');
});

test('image size command prefills existing Markdown width and height, saves and undoes safely',async()=>{
  const source='![图|280x150](<附件/中文 图片.png> "标题")';await setup(source);
  await page.evaluate(()=>{fixture.cm.dispatch({selection:{anchor:5}});fixture.command('set-image-size');});
  const inputs=page.locator('.modal input[type=text]');
  assert.equal(await inputs.nth(0).inputValue(),'280');assert.equal(await inputs.nth(1).inputValue(),'150');
  await inputs.nth(0).fill('300');await page.getByRole('button',{name:'保存到笔记'}).click();
  assert.equal(await page.evaluate(()=>fixture.text()),'![图|300x150](<附件/中文 图片.png> "标题")');
  await page.evaluate(()=>fixture.undo());assert.equal(await page.evaluate(()=>fixture.text()),source);
});

test('stale format preview and text palette never overwrite a concurrent edit',async()=>{
  await setup('第一行\n第二行');await page.evaluate(()=>fixture.command('format-note'));
  await page.evaluate(()=>fixture.cm.dispatch({changes:{from:fixture.cm.state.doc.length,insert:'新'}}));
  await page.getByRole('button',{name:'应用格式化'}).click();
  assert.equal(await page.evaluate(()=>fixture.text()),'第一行\n第二行新');assert.equal(await page.evaluate(()=>fixture.backups.length),0);
  await setup('风险预算');await page.evaluate(()=>{fixture.cm.dispatch({selection:{anchor:0,head:4}});fixture.command('style-color');});
  await page.evaluate(()=>fixture.cm.dispatch({changes:{from:fixture.cm.state.doc.length,insert:'新'}}));
  await page.getByRole('button',{name:'风险红'}).click();assert.equal(await page.evaluate(()=>fixture.text()),'风险预算新');
});
test('duplicate images resize only clicked occurrence in reading table',async()=>{
  await setup('| 项 | 图 |\n| --- | --- |\n| A | ![[图.png]] |\n| B | ![[图.png]] |','reading');
  await page.locator('img').nth(1).click();await page.waitForSelector('.tet-se');
  const h=await page.locator('.tet-se').boundingBox();await page.mouse.move(h.x+7,h.y+7);await page.mouse.down();await page.mouse.move(h.x+87,h.y+7);await page.mouse.up();await page.waitForTimeout(80);
  const text=await page.evaluate(()=>fixture.text());assert.ok(text.includes('| A | ![[图.png]] |'));assert.ok(text.includes('| B | ![[图.png\\|280]] |'));
  assert.equal(await page.evaluate(()=>fixture.backups.length),1);
});
test('Escape cancels drag and unload removes overlay and document listeners',async()=>{
  await setup('![[图.png]]');await page.locator('img').click();await page.waitForSelector('.tet-se');
  const h=await page.locator('.tet-se').boundingBox();await page.mouse.move(h.x+7,h.y+7);await page.mouse.down();await page.mouse.move(h.x+77,h.y+7);await page.keyboard.press('Escape');await page.mouse.up();
  assert.equal(await page.evaluate(()=>fixture.text()),'![[图.png]]');assert.equal(await page.locator('.tet-resize-overlay').count(),0);
  await page.evaluate(()=>fixture.plugin.onunload());await page.locator('img').click();assert.equal(await page.locator('.tet-resize-overlay').count(),0);
});
test('concurrent edit during drag aborts source mutation',async()=>{
  await setup('![[图.png]]');await page.locator('img').click();await page.waitForSelector('.tet-se');
  const h=await page.locator('.tet-se').boundingBox();await page.mouse.move(h.x+7,h.y+7);await page.mouse.down();await page.mouse.move(h.x+77,h.y+7);
  await page.evaluate(()=>fixture.cm.dispatch({changes:{from:fixture.cm.state.doc.length,insert:'\n新内容'}}));
  await page.mouse.up();await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>fixture.text()),'![[图.png]]\n新内容');
});
test('format preview performs no writes until confirm; one undo restores original',async()=>{
  const text='# 交易计划\n风险预算\n执行纪律\n- 入场\n- 出场';await setup(text);
  await page.evaluate(()=>fixture.command('format-note'));
  assert.equal(await page.evaluate(()=>fixture.text()),text);assert.equal(await page.evaluate(()=>fixture.backups.length),0);
  await page.getByRole('button',{name:'应用格式化'}).click();await page.waitForTimeout(80);
  assert.ok((await page.evaluate(()=>fixture.text())).includes('风险预算\n\n执行纪律'));
  assert.equal(await page.evaluate(()=>fixture.backups.length),1);
  await page.evaluate(()=>fixture.undo());assert.equal(await page.evaluate(()=>fixture.text()),text);
});
test('color palette retains captured selection after modal focus',async()=>{
  await setup('风险预算');
  await page.evaluate(()=>{fixture.cm.dispatch({selection:{anchor:0,head:4}});fixture.command('style-color');fixture.cm.dispatch({selection:{anchor:0}});});
  await page.getByRole('button',{name:'风险红'}).click();
  assert.equal(await page.evaluate(()=>fixture.text()),'<span data-mengren-style="1" style="color: #d64545;">风险预算</span>');
});

test('color followed by highlight and underline retains the visible selected text color',async()=>{
  await setup('风险预算');
  await page.evaluate(()=>{fixture.cm.dispatch({selection:{anchor:0,head:4}});fixture.command('color-slot-1');fixture.command('highlight-slot-2');fixture.command('style-underline');});
  const text=await page.evaluate(()=>fixture.text());await setup(text,'reading');
  const span=page.locator('span[data-mengren-style]');assert.equal(await span.count(),1);
  assert.equal(await span.evaluate(n=>getComputedStyle(n).color),'rgb(214, 69, 69)');
  assert.equal(await span.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 225, 189)');
  assert.ok(await span.evaluate(n=>getComputedStyle(n).textDecorationLine.includes('underline')));
});

test('requested semantic style matrix renders in reading and print with independent clears',async()=>{
  for(const sample of styleCases()) {
    await setup(sample.markdown,'reading');
    const result=await page.locator('span[data-mengren-style],strong,em,del').evaluateAll(ns=>ns.map(n=>({tag:n.tagName,text:n.textContent,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor,underline:getComputedStyle(n).textDecorationLine})));
    if(sample.expected.bold)assert.ok(result.some(n=>n.tag==='STRONG'),sample.name);
    if(sample.expected.italic)assert.ok(result.some(n=>n.tag==='EM'),sample.name);
    if(sample.expected.strike)assert.ok(result.some(n=>n.tag==='DEL'),sample.name);
    if(sample.expected.link)assert.equal(await page.locator('a').getAttribute('href'),'https://example.com');
    const span=page.locator('span[data-mengren-style]');
    if(await span.count()) {
      const css=await span.first().evaluate(n=>({color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor,underline:getComputedStyle(n).textDecorationLine}));
      if(sample.expected.color)assert.equal(css.color,sample.expected.color==='#d64545'?'rgb(214, 69, 69)':'rgb(54, 123, 214)',sample.name);
      if(sample.expected.background)assert.equal(css.background,'rgb(255, 225, 189)',sample.name);
      assert.equal(css.underline.includes('underline'),!!sample.expected.underline,sample.name);
      await page.emulateMedia({media:'print'});
      assert.deepEqual(await span.first().evaluate(n=>({color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor,underline:getComputedStyle(n).textDecorationLine})),css);
      await page.emulateMedia({media:'screen'});
    }
  }
});

test('native-style command flow retains selected bold semantics, independent clearing and undo',async()=>{
  await setup('这里有 **重要内容** 和普通内容');
  await page.evaluate(()=>{const i=fixture.text().indexOf('重要内容');fixture.cm.dispatch({selection:{anchor:i,head:i+4}});fixture.command('color-slot-1');fixture.command('highlight-slot-2');fixture.command('style-underline');});
  const all=await page.evaluate(()=>fixture.text());assert.equal((all.match(/<span/g)||[]).length,1);assert.ok(all.includes('**<span'));
  await page.evaluate(()=>fixture.command('style-clear-color'));let text=await page.evaluate(()=>fixture.text());assert.ok(!text.includes('color: #d64545'));assert.ok(text.includes('background-color'));assert.ok(text.includes('underline'));
  await page.evaluate(()=>fixture.undo());assert.equal(await page.evaluate(()=>fixture.text()),all);
  await page.evaluate(()=>fixture.command('style-clear'));assert.equal(await page.evaluate(()=>fixture.text()),'这里有 **重要内容** 和普通内容');
});

test('real CM HTML widgets inherit derived Markdown semantics, refresh on edit and clean up',async()=>{
  for(const sample of styleCases()) {
    await setup(sample.markdown);
    const span=page.locator('.cm-html-embed span[data-mengren-style]');
    if(!(await span.count()))continue;
    await page.waitForTimeout(80);
    if(sample.expected.bold)assert.equal(await span.first().evaluate(n=>getComputedStyle(n).fontWeight),'600',sample.name);
    if(sample.expected.italic)assert.equal(await span.first().evaluate(n=>getComputedStyle(n).fontStyle),'italic',sample.name);
    if(sample.expected.strike)assert.ok(await span.first().evaluate(n=>getComputedStyle(n).textDecorationLine.includes('line-through')),sample.name);
    assert.equal(await page.evaluate(()=>fixture.text()),sample.markdown);
  }
  const span='<span data-mengren-style="1" style="text-decoration: underline;">重要内容</span>';
  await setup('~~**'+span+'**~~');await page.waitForTimeout(80);
  assert.equal(await page.locator('[data-mengren-style]').evaluate(n=>getComputedStyle(n).textDecorationLine),'underline line-through');
  await page.evaluate(()=>fixture.cm.dispatch({changes:[{from:0,to:4},{from:fixture.cm.state.doc.length-4,to:fixture.cm.state.doc.length}]}));
  await page.waitForFunction(()=>!document.querySelector('[data-mengren-style]').classList.contains('tet-native-strong'));
  assert.equal(await page.locator('[data-mengren-style]').evaluate(n=>getComputedStyle(n).fontWeight),'400');
  assert.equal(await page.locator('[data-mengren-style]').evaluate(n=>getComputedStyle(n).textDecorationLine),'underline');
});
test('settings render without unsupported menu APIs; variables carry into print',async()=>{
  await setup('# 交易计划\n\n第一段自动折行时使用紧凑行距。\n\n第二段。\n\n- 入场\n\n- 出场\n\n| 场景 | 图片 |\n| --- | --- |\n| 风险 | ![[图.png\\|200]] |','reading');
  await page.evaluate(()=>{fixture.plugin.tab.display();document.body.appendChild(fixture.plugin.tab.containerEl);});
  assert.equal(await page.getByRole('slider').count(),10);
  // Every palette slot renders both pickers (Obsidian's ColorComponent exposes colorPickerEl).
  assert.deepEqual(await page.locator('input[type=color]').evaluateAll(ns=>ns.map(n=>n.getAttribute('aria-label'))),Array(6).fill(['文字颜色','背景色']).flat());
  await page.evaluate(()=>fixture.plugin.tab.containerEl.remove());
  const before=await page.locator('p').first().evaluate(el=>({line:getComputedStyle(el).lineHeight,gap:getComputedStyle(el).marginBottom,pad:getComputedStyle(el).paddingTop,bottom:getComputedStyle(el).paddingBottom}));
  await page.emulateMedia({media:'print'});
  const after=await page.locator('p').first().evaluate(el=>({line:getComputedStyle(el).lineHeight,gap:getComputedStyle(el).marginBottom,pad:getComputedStyle(el).paddingTop,bottom:getComputedStyle(el).paddingBottom}));assert.deepEqual(after,before);
  assert.equal(after.gap,'0px');assert.equal(after.pad,'4.48px');assert.equal(after.bottom,'4.48px');assert.equal(after.line,'25.92px');
  await page.screenshot({path:path.join(work,'reading-print-preview.png')});await page.emulateMedia({media:'screen'});
});
test('Excalidraw disabled does not disable normal images or text commands',async()=>{
  await setup('![[图.png]]\n\n![[绘图.excalidraw]]');await page.evaluate(()=>fixture.excalidraw(false));
  await drag('img',40,0);assert.ok((await page.evaluate(()=>fixture.text())).includes('图.png|240'));
  await page.locator('svg').click();await page.waitForTimeout(80);assert.equal(await page.locator('.tet-resize-overlay').count(),0);
});

test('verified WoLai baseline has identical four transitions and no visual blank lines',async()=>{
  const note='正文一\n\n正文二\n\n- 项目一\n\n- 项目二\n\n正文三';
  for(const mode of ['live','reading']) {
    await setup(note,mode);
    const values=await page.locator(mode==='live'?'.tet-block-start':'.markdown-preview-view > p,.markdown-preview-view li').evaluateAll(nodes=>nodes.map(n=>{
      const c=getComputedStyle(n),r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,padTop:parseFloat(c.paddingTop),padBottom:parseFloat(c.paddingBottom),line:c.lineHeight,margin:c.marginBlock};
    }));
    assert.equal(values.length,5);
    for(const v of values) {assert.equal(v.padTop,4.48);assert.equal(v.padBottom,4.48);assert.equal(v.line,'25.92px');assert.equal(v.margin,'0px');}
    const gaps=values.slice(1).map((v,i)=>v.top+v.padTop-values[i].bottom+values[i].padBottom);
    for(const gap of gaps) assert.ok(Math.abs(gap-8.96)<0.1,`${mode}: ${gap}`);
    if(mode==='live') assert.deepEqual(await page.locator('.tet-gap').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height)),[0,0,0,0]);
  }
});

test('automatic wrapped lines get only one pair of block padding',async()=>{
  await setup('自动折行测试内容。'.repeat(90));
  const value=await page.locator('.tet-prose').evaluate(n=>({height:n.getBoundingClientRect().height,line:parseFloat(getComputedStyle(n).lineHeight),padding:parseFloat(getComputedStyle(n).paddingTop)+parseFloat(getComputedStyle(n).paddingBottom)}));
  assert.ok(value.height>value.line*3);assert.equal(value.padding,8.96);
  assert.ok(Math.abs((value.height-value.padding)/value.line-Math.round((value.height-value.padding)/value.line))<0.03);
});
test('quote, prose, list and standalone indented code have equal external block gaps',async()=>{
  const input='第一段\n\n第二段\n\n- A\n\n- B\n\n> 引用\n> 引用内软换行\n\n第三段\n\n    缩进代码\n    代码内换行\n\n第四段';
  for(const mode of ['live','reading']) {
    await setup(input,mode);
    const selector=mode==='live'?'.tet-block-start':'.markdown-preview-view > p,.markdown-preview-view > blockquote,.markdown-preview-view > pre,.markdown-preview-view > ul > li';
    const boxes=await page.locator(selector).evaluateAll(ns=>ns.map(n=>{let r=n.getBoundingClientRect(),c=getComputedStyle(n);return {top:r.top,bottom:r.bottom,padTop:parseFloat(c.paddingTop),padBottom:parseFloat(c.paddingBottom),margin:c.marginBlock};}));
    assert.equal(boxes.length,8);
    // Multi-line quote/code LP blocks consist of multiple CM lines.
    if(mode==='live') {
      const endings=await page.locator('.tet-block-end').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().bottom));
      // Entering/leaving the quote bar adds its restored outside half (9.44px).
      for(let i=1;i<boxes.length;i++) assert.ok(Math.abs(boxes[i].top+boxes[i].padTop-endings[i-1]+4.48-8.96-(i===4||i===5?9.44:0))<0.1,JSON.stringify(boxes));
    } else {
      for(let i=1;i<boxes.length;i++) assert.ok(Math.abs(boxes[i].top+boxes[i].padTop-boxes[i-1].bottom+boxes[i-1].padBottom-8.96)<0.1,JSON.stringify(boxes));
    }
    for(const b of boxes) {assert.equal(b.padTop,4.48);assert.equal(b.margin,'0px');}
    if(mode==='reading') {
      const before=await page.locator(selector).evaluateAll(ns=>ns.map(n=>{const c=getComputedStyle(n);return [c.paddingTop,c.paddingBottom,c.marginBlock,c.lineHeight];}));
      await page.emulateMedia({media:'print'});
      const after=await page.locator(selector).evaluateAll(ns=>ns.map(n=>{const c=getComputedStyle(n);return [c.paddingTop,c.paddingBottom,c.marginBlock,c.lineHeight];}));
      assert.deepEqual(after,before);await page.emulateMedia({media:'screen'});
    }
    assert.equal(await page.evaluate(()=>fixture.text()),input);
  }
});
// Visible gap between two prose paragraphs at 16px, line-height 1.62: two block
// paddings (4.48px) plus two half-leadings (4.96px) around ~1em CJK glyphs.
const VISIBLE_GAP=18.88;
test('Live Preview keeps one visible prose gap between text and code, quote, Callout, Tab row, table, rule and drawing paint',async()=>{
  const table='| 层次 | 职责 |\n| --- | --- |\n| 甲 | 职责说明 |';
  const input=['正文一','正文二\n```text\n贴着的代码\n```\n正文三','> 引用',table,'```text\n代码\n```','- 列表','> [!note] 提示\n> 内容','\t知识行',table,table,'---','![[绘图块.md]]','结尾'].join('\n\n');
  await setup(input);
  const measure=()=>page.evaluate(()=>{
    // Painted: code background rows, quote rows (bar covers their padding),
    // Tab knowledge rows (one background per run), table borders, the rule
    // line and a block drawing. Text: glyph box = content box minus half the
    // leading on each side.
    const boxes=[];
    for(const el of document.querySelector('.cm-content').children) {
      const r=el.getBoundingClientRect(),c=getComputedStyle(el);
      if(r.height<0.5||el.classList.contains('tet-gap'))continue;
      const inner=el.querySelector('table')||el.querySelector(':scope.hr > hr')||(el.matches('.internal-embed')&&el.querySelector('svg'));
      const kind=inner?inner.tagName.toLowerCase():el.matches('.HyperMD-codeblock')?'code':el.matches('.HyperMD-quote')?'quote':el.matches('.tet-tab-knowledge-line')?'tab':'text';
      let top=r.top,bottom=r.bottom;
      if(inner){const t=inner.getBoundingClientRect();top=t.top;bottom=t.bottom;}
      else if(kind!=='text'){top+=parseFloat(c.borderTopWidth);bottom-=parseFloat(c.borderBottomWidth);}
      else {
        const half=(parseFloat(c.lineHeight)-parseFloat(c.fontSize))/2;
        top+=parseFloat(c.borderTopWidth)+parseFloat(c.paddingTop)+half;
        bottom-=parseFloat(c.borderBottomWidth)+parseFloat(c.paddingBottom)+half;
      }
      const last=boxes.at(-1);
      // Consecutive rows of one code block or quote form one painted box.
      if(last && kind===last.kind && ['code','quote','tab'].includes(kind) && Math.abs(top-last.bottom)<0.5) {last.bottom=bottom;continue;}
      boxes.push({kind,top,bottom,text:el.textContent.slice(0,6)});
    }
    return boxes.slice(1).map((b,i)=>({pair:boxes[i].kind+'→'+b.kind,from:boxes[i].text,gap:b.top-boxes[i].bottom}));
  });
  const gaps=await measure();
  assert.equal(gaps.length,14,JSON.stringify(gaps));
  assert.deepEqual(gaps.slice(-6).map(g=>g.pair),['quote→tab','tab→table','table→table','table→hr','hr→svg','svg→text']);
  for(const g of gaps) assert.ok(Math.abs(g.gap-VISIBLE_GAP)<0.15,JSON.stringify(gaps));
  assert.deepEqual(await page.locator('.tet-paint-below,.tet-paint-above').count(),2);
  // The restored half is display only; a caret on that separator still gets a full input row.
  await page.locator('.tet-paint-gap').first().evaluate(n=>{const v=fixture.cm;v.focus();v.dispatch({selection:{anchor:v.posAtDOM(n)}});});
  await page.waitForTimeout(50);
  assert.ok(await page.locator('.cm-line.tet-input-gap').first().evaluate(n=>n.getBoundingClientRect().height)>20);
  assert.equal(await page.evaluate(()=>fixture.text()),input);
});

test('Reading and PDF print wrappers keep the same visible gap around code, quote, Callout, Tab row, table, image and rule paint',async()=>{
  await setup('','reading');
  const table='<table><thead><tr><th>层次</th><th>职责</th></tr></thead><tbody><tr><td>甲</td><td>职责说明</td></tr></tbody></table>';
  const image='<p><span class="internal-embed image-embed" src="图.png"><img src="https://fixture.invalid/图.png" width="200"></span></p>';
  const blocks=[['p','<p>正文一</p>'],['p','<p>正文二</p>'],['pre','<pre><code>代码</code></pre>'],['blockquote','<blockquote><p>引用</p></blockquote>'],['table',table],
    ['ul','<ul><li>列表</li></ul>'],['p',image],['div','<div class="callout" style="margin:16px 0;padding:12px">提示</div>'],['table',table],
    ['pre','<pre class="tet-tab-knowledge"><code class="tet-tab-code"><span class="tet-tab-row">知识行</span></code></pre>'],['p',image],['hr','<hr>'],['pre','<pre><code>代码</code></pre>'],['hr','<hr>'],['p','<p>结尾</p>']];
  const measure=()=>page.evaluate(()=>{
    const out={};
    for(const root of document.querySelectorAll('.markdown-preview-sizer,.print > .markdown-preview-view')) {
      const boxes=[...root.children].map(section=>{
        const paint=section.querySelector('table,img,pre,blockquote,.callout,hr');
        if(paint){const r=paint.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}
        const text=[...section.querySelectorAll('p,li,.tet-tab-row')],first=text[0],lastEl=text.at(-1);
        const edge=(el,side)=>{const r=el.getBoundingClientRect(),c=getComputedStyle(el),half=(parseFloat(c.lineHeight)-parseFloat(c.fontSize))/2;
          return side==='top'?r.top+parseFloat(c.paddingTop)+half:r.bottom-parseFloat(c.paddingBottom)-half;};
        return {top:edge(first,'top'),bottom:edge(lastEl,'bottom')};
      });
      out[root.matches('.markdown-preview-sizer')?'reading':'pdf']=boxes.slice(1).map((b,i)=>Math.round((b.top-boxes[i].bottom)*100)/100);
    }
    const img=document.querySelector('.markdown-preview-sizer img'),p=img.closest('p');
    out.imageExtra=p.getBoundingClientRect().height-img.getBoundingClientRect().height;
    return out;
  });
  await page.evaluate(([blocks])=>{
    // Reading: one .el-* section per block. PDF export: plain divs under .print > .markdown-preview-view.
    const sections=cls=>blocks.map(([tag,html])=>`<div${cls?` class="el-${tag}"`:''}>${html}</div>`).join('');
    fixture.root.innerHTML=`<div class="markdown-preview-sizer markdown-preview-section">${sections(true)}</div>`;
    const print=document.body.appendChild(document.createElement('div'));print.className='print';
    print.innerHTML=`<div class="markdown-preview-view markdown-rendered">${sections(false)}</div>`;
  },[blocks]);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
  const screen=await measure();
  assert.equal(screen.reading.length,blocks.length-1);
  for(const gap of screen.reading) assert.ok(Math.abs(gap-VISIBLE_GAP)<0.15,JSON.stringify(screen));
  assert.deepEqual(screen.pdf,screen.reading);
  // No descender gap under a standalone image: only its two outside halves (9.44px each).
  assert.ok(Math.abs(screen.imageExtra-VISIBLE_GAP)<0.15,String(screen.imageExtra));
  await page.emulateMedia({media:'print'});
  assert.deepEqual(await measure(),screen);
  await page.emulateMedia({media:'screen'});
  // Separately tuned tables/images: 0.5em (8px) outside padding replaces the 9.44px half.
  await page.evaluate(async()=>{Object.assign(fixture.plugin.settings,{mediaFollowsBody:false,tablePadding:0.5,imagePadding:0.5});await fixture.plugin.saveSettings();});
  const custom=await measure();
  assert.ok(Math.abs(custom.reading[3]-(VISIBLE_GAP/2+8))<0.15,JSON.stringify(custom));
  assert.ok(Math.abs(custom.reading[7]-(VISIBLE_GAP/2+8))<0.15,JSON.stringify(custom));
  assert.ok(Math.abs(custom.imageExtra-16)<0.15,JSON.stringify(custom));
  await page.evaluate(async()=>{Object.assign(fixture.plugin.settings,{mediaFollowsBody:true});await fixture.plugin.saveSettings();document.querySelector('.print').remove();});
});

test('a closed popout window does not break plugin unload or later reloads',async()=>{
  await setup('正文');
  const result=await page.evaluate(()=>{
    // An iframe stands in for a popout: after removal its document has no window.
    const frame=document.body.appendChild(document.createElement('iframe'));
    const popout=frame.contentDocument;fixture.plugin.bindDocument(popout);
    const bound=fixture.plugin.images.bindings.has(popout);
    frame.remove();
    let error=null;try{fixture.plugin.onunload();}catch(e){error=String(e);}
    return {bound,closedWindow:popout.defaultView,error};
  });
  assert.deepEqual(result,{bound:true,closedWindow:null,error:null});
  // The host's window-close event also releases that document's listeners.
  await setup('正文');
  assert.ok(await page.evaluate(()=>{
    const frame=document.body.appendChild(document.createElement('iframe'));
    const popout=frame.contentDocument;fixture.plugin.bindDocument(popout);
    fixture.callbacks.get('window-close')(null,{document:popout});frame.remove();
    return !fixture.plugin.images.bindings.has(popout)&&!fixture.plugin.documents.has(popout);
  }));
});

test('list indented paragraphs use same block gaps without altering nesting',async()=>{
  const input='- A\n\n  child one\n\n  child two\n\n- B\n\n正文';
  await setup(input);
  const starts=await page.locator('.tet-block-start').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top+parseFloat(getComputedStyle(n).paddingTop)));
  const ends=await page.locator('.tet-block-end').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().bottom-parseFloat(getComputedStyle(n).paddingBottom)));
  assert.equal(starts.length,5);assert.equal(ends.length,5);
  for(let i=1;i<starts.length;i++)assert.ok(Math.abs(starts[i]-ends[i-1]-8.96)<.1);
  await setup(input,'reading');
  assert.equal(await page.locator('li').count(),2);
  assert.equal(await page.locator('li').first().locator('p').count(),3);
  const paragraphs=await page.locator('li').first().locator('p').evaluateAll(ns=>ns.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,pad:parseFloat(getComputedStyle(n).paddingTop)})));
  for(let i=1;i<paragraphs.length;i++)assert.ok(Math.abs(paragraphs[i].top+paragraphs[i].pad-paragraphs[i-1].bottom-8.96)<.1);
});
test('Enter is not intercepted, including legacy paragraphEnter settings; native host owns editing',async()=>{
  // Fixture has CM's plain fallback, not Obsidian's Markdown continuation
  // keymap. Assert that the plugin does not add any Enter behavior of its own.
  for(const text of ['正文','- list','> quote','>**quote**','\tcode','```js','line  ']) {
    await setup(text);await page.evaluate(()=>{fixture.plugin.settings.paragraphEnter=true;fixture.cm.dispatch({selection:{anchor:fixture.text().length}});});
    await page.locator('.cm-content').focus();await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>fixture.text()),text+'\n');
    const height=await page.locator('.cm-line').last().evaluate(n=>n.getBoundingClientRect().height);assert.ok(height>0,text);
    await page.evaluate(()=>fixture.undo());assert.equal(await page.evaluate(()=>fixture.text()),text);
  }
  await setup('正文');await page.evaluate(()=>fixture.cm.dispatch({selection:{anchor:1}}));await page.locator('.cm-content').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>fixture.text()),'正\n文');
});
test('caret blank, Tab-only and quote-prefix rows stay visible and editable without altering separators',async()=>{
  for(const prefix of ['','\t','\t\t','> ','> > ']) {
    const text='前文\n\n'+prefix+'\n\n后文';await setup(text);
    await page.evaluate(p=>fixture.cm.dispatch({selection:{anchor:fixture.cm.state.doc.line(3).from+p.length}}),prefix);await page.locator('.cm-content').focus();
    await page.waitForSelector('.tet-input-gap');
    const active=page.locator('.tet-input-gap');assert.equal(await active.count(),1);
    assert.ok(await active.evaluate(n=>n.getBoundingClientRect().height)>=25.9);
    assert.equal(await active.evaluate(n=>getComputedStyle(n).lineHeight),'25.92px');
    assert.equal(await page.evaluate(()=>fixture.text()),text);
    await page.keyboard.type('new');assert.equal(await page.evaluate(()=>fixture.text()),'前文\n\n'+prefix+'new\n\n后文');
    await page.evaluate(()=>fixture.undo());assert.equal(await page.evaluate(()=>fixture.text()),text);
    await page.evaluate(()=>fixture.cm.dispatch({selection:{anchor:fixture.cm.state.doc.length}}));
    assert.equal(await active.count(),0);
    const persistent=await page.locator('.cm-line').nth(2).evaluate(n=>n.getBoundingClientRect().height);
    if(!prefix.trim())assert.ok(persistent>25.9);else assert.equal(persistent,0);
  }
});
test('blank selections reveal input lines, blur collapses them and an empty document stays clickable',async()=>{
  await setup('前文\n\n\t\n\n后文');await page.locator('.cm-content').focus();
  await page.evaluate(()=>fixture.cm.dispatch({selection:{anchor:fixture.cm.state.doc.line(2).from,head:fixture.cm.state.doc.line(4).to}}));
  assert.equal(await page.locator('.tet-input-gap').count(),3);
  await page.evaluate(()=>fixture.cm.contentDOM.blur());
  await page.waitForFunction(()=>document.querySelectorAll('.tet-input-gap').length===0);
  assert.equal(await page.evaluate(()=>fixture.text()),'前文\n\n\t\n\n后文');
  await setup('');
  const empty=await page.locator('.cm-line').first().evaluate(n=>({height:n.getBoundingClientRect().height,html:n.outerHTML,line:getComputedStyle(n).lineHeight,font:getComputedStyle(n).fontSize,focus:fixture.cm.hasFocus}));
  // An empty CM document may have no visible ranges/decorations yet; its
  // native placeholder must remain clickable, not have a forced exact height.
  assert.ok(empty.height>0,JSON.stringify(empty));
  await page.locator('.cm-content').focus();await page.keyboard.type('new');assert.equal(await page.evaluate(()=>fixture.text()),'new');
  await setup('正文\n');await page.evaluate(()=>{fixture.info.getState=()=>({source:true});fixture.cm.dispatch({selection:{anchor:3}});});await page.locator('.cm-content').focus();
  assert.equal(await page.locator('.tet-input-gap').count(),0);assert.ok(await page.locator('.cm-line').last().evaluate(n=>n.getBoundingClientRect().height)>0);
});

test('multiple plain blanks retain exactly N-1 rows in live, reading and print',async()=>{
  for(let count=1;count<=4;count++) for(const mode of ['live','reading']) {
    const text='第一段'+ '\n'.repeat(count+1)+'第二段';await setup(text,mode);
    if(mode==='live') {
      assert.equal(await page.locator('.tet-extra-blank').count(),count-1);
      const heights=await page.locator('.tet-gap').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));
      assert.ok(heights[0]===0);for(const h of heights.slice(1))assert.ok(Math.abs(h-25.92)<.05);
    } else {
      assert.equal(await page.locator('.tet-extra-gap').count(),count>1?1:0);
      if(count>1)assert.ok(Math.abs((await page.locator('.tet-extra-gap').evaluate(n=>n.getBoundingClientRect().height))-(count-1)*25.92)<.05);
      await page.emulateMedia({media:'print'});
      if(count>1)assert.ok(Math.abs((await page.locator('.tet-extra-gap').evaluate(n=>n.getBoundingClientRect().height))-(count-1)*25.92)<.05);
      await page.emulateMedia({media:'screen'});
    }
    assert.equal(await page.evaluate(()=>fixture.text()),text);
    assert.equal(await page.evaluate(()=>fixture.backups.length),0);
  }
});

test('extra spaces survive native Enter/undo, focus changes, toggle and unload',async()=>{
  await setup('正文');await page.evaluate(()=>fixture.cm.dispatch({selection:{anchor:fixture.text().length}}));
  await page.locator('.cm-content').focus();for(let n=0;n<4;n++)await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>fixture.text()),'正文\n\n\n\n');
  assert.equal(await page.locator('.tet-extra-blank').count(),2);
  await page.keyboard.type('后文');await page.evaluate(()=>fixture.cm.contentDOM.blur());
  assert.equal(await page.locator('.tet-extra-blank').count(),2);
  await page.evaluate(async()=>{fixture.plugin.settings.preserveExtraBlankLines=false;await fixture.plugin.saveSettings();});
  assert.equal(await page.locator('.tet-extra-blank').count(),0);
  await setup('正文\n\n\n后文','reading');
  for(let i=0;i<3;i++)await page.evaluate(()=>fixture.plugin.saveSettings());
  assert.equal(await page.locator('.tet-extra-gap').count(),1);
  await page.evaluate(async()=>{fixture.plugin.settings.preserveExtraBlankLines=false;await fixture.plugin.saveSettings();});
  assert.equal(await page.locator('.tet-extra-gap').count(),0);
  await page.evaluate(async()=>{fixture.plugin.settings.preserveExtraBlankLines=true;await fixture.plugin.saveSettings();});
  assert.equal(await page.locator('.tet-extra-gap').count(),1);
  await page.evaluate(()=>fixture.plugin.onunload());assert.equal(await page.locator('.tet-extra-gap').count(),0);
  assert.equal(await page.evaluate(()=>fixture.text()),'正文\n\n\n后文');
});

test('reading gaps use source positions for repeated paragraphs, lists and protected code',async()=>{
  const text='相同\n\n\n相同\n\n- A\n\n- B\n\n\n相同\n\n```\n\n\n代码\n```';
  await setup(text,'reading');assert.equal(await page.locator('.tet-extra-gap').count(),2);
  assert.equal(await page.locator('pre .tet-extra-gap,li .tet-extra-gap').count(),0);
  assert.equal(await page.locator('li').count(),2);
  assert.equal(await page.evaluate(()=>fixture.text()),text);
});

test('leading/trailing extra whitespace matches reading, and formatting never removes it',async()=>{
  const text='\n\n前文\n\n\n后文\n\n\n';
  for(const mode of ['live','reading']) {
    await setup(text,mode);
    const heights=await page.locator(mode==='live'?'.tet-extra-blank':'.tet-extra-gap').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));
    assert.ok(Math.abs(heights.reduce((a,b)=>a+b,0)-4*25.92)<.1);
    assert.equal(await page.evaluate(()=>formatNote(fixture.text()).text),text);
  }
});
test('quoted paragraph separators collapse and nested lists retain equal knowledge-block gaps',async()=>{
  for(const mode of ['live','reading']) {
    await setup('> 引用一\n>\n> 引用二\n\n正文\n\n- 父级\n  - 子级一\n  - 子级二\n- 另一个父级',mode);
    if(mode==='live') {
      assert.equal(await page.locator('.tet-quote-gap').evaluate(n=>n.getBoundingClientRect().height),0);
      const starts=await page.locator('.tet-block-start').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top+parseFloat(getComputedStyle(n).paddingTop)));
      const ends=await page.locator('.tet-block-end').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().bottom-parseFloat(getComputedStyle(n).paddingBottom)));
      // Quote paragraphs stay compact inside the bar; leaving the bar adds its outside half.
      assert.equal(starts.length,7);for(let i=1;i<starts.length;i++)assert.ok(Math.abs(starts[i]-ends[i-1]-8.96-(i===2?9.44:0))<.1);
    } else {
      const ps=await page.locator('blockquote > p').evaluateAll(ns=>ns.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,pad:parseFloat(getComputedStyle(n).paddingTop)})));
      assert.ok(Math.abs(ps[1].top+ps[1].pad-ps[0].bottom-8.96)<.1);
      const lis=await page.locator('li').evaluateAll(ns=>ns.map(n=>({top:n.getBoundingClientRect().top,pad:parseFloat(getComputedStyle(n).paddingTop),bottom:n.getBoundingClientRect().bottom,child:!!n.querySelector('ul')})));
      assert.equal(lis.length,4);for(let i=0;i<lis.length;i++)assert.equal(lis[i].pad,4.48);
      assert.ok(Math.abs(lis[2].top+lis[2].pad-lis[1].bottom+4.48-8.96)<.1);
    }
  }
});
test('physical Tab knowledge rows match list spacing in live, reading and print; disable restores native code',async()=>{
  const input='正文\n\n\tTab 第一行。\n\tTab 第二行。\n\n正文二\n\n- A\n- B';
  for(const mode of ['live','reading']) {
    await setup(input,mode);
    const selector=mode==='live'?'.tet-tab-knowledge-line':'.tet-tab-row';
    assert.equal(await page.locator(selector).count(),2);
    const boxes=await page.locator(selector).evaluateAll(ns=>ns.map(n=>{const c=getComputedStyle(n),r=n.getBoundingClientRect();return {top:r.top+parseFloat(c.paddingTop),bottom:r.bottom-parseFloat(c.paddingBottom),padding:[c.paddingTop,c.paddingBottom],line:c.lineHeight};}));
    for(const box of boxes){assert.deepEqual(box.padding,['4.48px','4.48px']);assert.equal(box.line,'25.92px');}
    assert.ok(Math.abs(boxes[1].top-boxes[0].bottom-8.96)<.1);
    const allBoxes=await page.locator(mode==='live'?'.tet-block-start':'.markdown-preview-view > p,.tet-tab-row,li').evaluateAll(ns=>ns.map(n=>{const c=getComputedStyle(n),r=n.getBoundingClientRect();return {top:r.top+parseFloat(c.paddingTop),bottom:r.bottom-parseFloat(c.paddingBottom)};}));
    // In LP the Tab run is paint with a half gap outside it; this fixture's
    // Reading has no section wrappers, whose matching padding the painted-gap
    // test checks.
    for(let i=1;i<allBoxes.length;i++)assert.ok(Math.abs(allBoxes[i].top-allBoxes[i-1].bottom-8.96-(mode==='live'&&(i===1||i===3)?9.44:0))<.1,mode+' Tab/prose/list boundary '+i);
    if(mode==='reading') {
      const original=await page.locator('pre code').textContent();assert.equal(original,'Tab 第一行。\nTab 第二行。\n');
      await page.emulateMedia({media:'print'});assert.equal(await page.locator('.tet-tab-row').first().evaluate(n=>getComputedStyle(n).paddingTop),'4.48px');await page.emulateMedia({media:'screen'});
      await page.evaluate(async()=>{fixture.plugin.settings.tabKnowledgeLines=false;await fixture.plugin.saveSettings();});
      assert.equal(await page.locator('.tet-tab-row').count(),0);assert.equal(await page.locator('pre code').textContent(),original);
      await page.evaluate(async()=>{fixture.plugin.settings.tabKnowledgeLines=true;await fixture.plugin.saveSettings();});assert.equal(await page.locator('.tet-tab-row').count(),2);
    }
    assert.equal(await page.evaluate(()=>fixture.text()),input);
  }
});
test('Tab knowledge wrapping gets padding once per physical line; fenced and space code are untouched',async()=>{
  const input='\t'+('很长的一条缩进知识行。'.repeat(70))+'\n\t短行。\n\n```\n真正围栏代码一\n真正围栏代码二\n```\n\n    空格缩进代码一\n    空格缩进代码二';
  for(const mode of ['live','reading']) {
    await setup(input,mode);
    const selector=mode==='live'?'.tet-tab-knowledge-line':'.tet-tab-row';
    assert.equal(await page.locator(selector).count(),2);
    const h=await page.locator(selector).first().evaluate(n=>{const c=getComputedStyle(n);return {height:n.getBoundingClientRect().height,padding:parseFloat(c.paddingTop)+parseFloat(c.paddingBottom),line:parseFloat(c.lineHeight)};});
    assert.equal(h.padding,8.96);assert.ok(h.height>h.line*3);
    if(mode==='reading'){assert.equal(await page.locator('pre:not(.tet-tab-knowledge)').count(),2);assert.equal(await page.locator('.tet-tab-row').count(),2);}
  }
  // Duplicate real code text is ambiguous: preserve native code everywhere.
  for(const mode of ['live','reading']) {
    await setup('\t相同内容\n\n```\n相同内容\n```\n\n    相同内容',mode);
    assert.equal(await page.locator(mode==='live'?'.tet-tab-knowledge-line':'.tet-tab-row').count(),0);
  }
});

test('headings keep symmetric specified em padding',async()=>{
  await setup('# 一\n\n## 二\n\n### 三\n\n#### 四\n\n##### 五\n\n###### 六','reading');
  const values=await page.locator('h1,h2,h3,h4,h5,h6').evaluateAll(ns=>ns.map(n=>{const c=getComputedStyle(n);return [parseFloat(c.paddingTop)/parseFloat(c.fontSize),parseFloat(c.paddingBottom)/parseFloat(c.fontSize),c.marginBlock];}));
  for(let i=0;i<6;i++) {assert.ok(Math.abs(values[i][0]-[.95,.82,.70,.58,.58,.58][i])<.001);assert.equal(values[i][0],values[i][1]);assert.equal(values[i][2],'0px');}
});

test('quote adjacent to heading and list does not swallow Live Preview layout',async()=>{
  const input='## 第一节\n> 第一段引用\n## 第二节\n> 第二段引用\n- 项目一\n- 项目二\n惰性续行';
  await setup(input);
  assert.equal(await page.locator('.tet-h2').count(),2);
  assert.equal(await page.locator('.tet-list-line').count(),2);
  assert.equal(await page.locator('.tet-list-continuation').count(),1);
  assert.equal(await page.locator('.tet-list-line').nth(1).evaluate(n=>getComputedStyle(n).paddingBottom),'0px');
  assert.equal(await page.locator('.tet-list-continuation').evaluate(n=>getComputedStyle(n).lineHeight),'25.92px');
  assert.equal(await page.locator('.tet-list-continuation').evaluate(n=>getComputedStyle(n).paddingBottom),'4.48px');
  assert.equal(await page.evaluate(()=>fixture.text()),input);
  assert.equal(await page.evaluate(()=>fixture.backups.length),0);
});

test('formatting repaired quote boundaries agrees with standard reading Markdown structure',async()=>{
  const text=await page.evaluate(()=>formatNote('## 第一节\n> 引用\n## 第二节\n> 另一引用\n- 项目一\n- 项目二\n后续正文').text);
  await setup(text,'reading');
  assert.equal(await page.locator('h2').count(),2);assert.equal(await page.locator('blockquote').count(),2);assert.equal(await page.locator('li').count(),2);
  assert.equal(await page.locator('blockquote h2,blockquote ul').count(),0);
  assert.equal(await page.locator('.markdown-preview-view > p').last().textContent(),'后续正文');
});

// A scripted speech engine: records utterances; tests end them on demand.
async function fakeSpeech() {
  await page.evaluate(()=>{
    window.spoken=[];
    const synth={speaking:false,pending:false,current:null,
      getVoices:()=>[{name:'中文甲',lang:'zh-CN',localService:true},{name:'中文乙',lang:'zh-TW',localService:true},{name:'English',lang:'en-US',localService:true}],
      speak(u){this.current=u;this.speaking=true;spoken.push({text:u.text,rate:u.rate,voice:u.voice?.name});setTimeout(()=>u.onstart?.(),0);},
      cancel(){const u=this.current;this.current=null;this.speaking=false;if(u)setTimeout(()=>u.onerror?.({error:'interrupted'}),0);},
      end(){const u=this.current;this.current=null;this.speaking=false;u?.onend?.();},
      addEventListener(){}};
    Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  });
}
const said=()=>page.evaluate(()=>spoken.map(s=>s.text));
const endSentence=async()=>{await page.evaluate(()=>speechSynthesis.end());await page.waitForTimeout(120);};
test('listening reads sentences in order, highlights them, follows edits and remembers the position',async()=>{
  const input='# 标题\n\n第一句。第二句！\n\n```js\n代码\n```\n\n第三句[[笔记|别名]]。';
  await setup(input);await fakeSpeech();
  const action=page.locator('.view-action[data-icon=headphones]');
  assert.equal(await action.count(),1);
  await action.click();await page.waitForTimeout(120);
  assert.deepEqual(await said(),['标题']);
  assert.equal(await page.locator('.tet-speaking').textContent(),'标题');
  assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'playing');
  await endSentence();
  assert.equal(await page.locator('.tet-speaking').textContent(),'第一句。');
  await page.locator('.tet-speech-btn[aria-label="下一句"]').click();await page.waitForTimeout(150);
  assert.equal((await said()).at(-1),'第二句！');
  // Pause and resume repeat the current sentence; nothing else is spoken meanwhile.
  await page.locator('.tet-speech-main').click();await page.waitForTimeout(80);
  assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'paused');
  const count=(await said()).length;
  await page.locator('.tet-speech-main').click();await page.waitForTimeout(150);
  assert.equal((await said()).length,count+1);assert.equal((await said()).at(-1),'第二句！');
  // Text inserted above while listening: reading continues after the mapped sentence, skipping code.
  await page.evaluate(()=>fixture.cm.dispatch({changes:{from:0,insert:'新增一段。\n\n'}}));
  await endSentence();
  assert.equal((await said()).at(-1),'第三句别名。');
  assert.equal(await page.locator('.tet-speaking').textContent(),'第三句[[笔记|别名]]。');
  // Speed applies at once and is saved.
  await page.locator('.tet-speech-rate').click();
  await page.evaluate(()=>lastMenu.items.find(i=>i.title==='1.5×').run());await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>spoken.at(-1).rate),1.5);
  assert.equal(await page.evaluate(()=>fixture.plugin.settings.speechRate),1.5);
  const progress=await page.evaluate(()=>fixture.plugin.settings.speechProgress['笔记/验收.md']);
  assert.equal(progress.t,'第三句别名。');assert.equal(progress.d,false);
  // Closing removes the bar and highlight; the button resumes at the saved sentence.
  await page.locator('.tet-speech-btn[aria-label="关闭听书"]').click();
  assert.equal(await page.locator('.tet-speech-bar').count(),0);assert.equal(await page.locator('.tet-speaking').count(),0);
  await action.click();await page.waitForTimeout(150);
  assert.equal((await said()).at(-1),'第三句别名。');
  await endSentence();
  assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'ended');
  assert.equal(await page.evaluate(()=>fixture.plugin.settings.speechProgress['笔记/验收.md'].d),true);
  assert.equal(await page.evaluate(()=>fixture.text()),'新增一段。\n\n'+input);
  // A selection is read on its own and does not move the saved position.
  await page.locator('.tet-speech-btn[aria-label="关闭听书"]').click();
  await page.evaluate(()=>{const from=fixture.cm.state.doc.toString().indexOf('第一句');fixture.cm.dispatch({selection:{anchor:from,head:from+3}});});
  await action.click();await page.waitForTimeout(150);
  assert.equal((await said()).at(-1),'第一句');
  await endSentence();
  assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'ended');
  assert.equal(await page.evaluate(()=>fixture.plugin.settings.speechProgress['笔记/验收.md'].d),true);
  // Unloading stops speech and removes the header button.
  await page.evaluate(()=>fixture.plugin.onunload());
  assert.equal(await action.count(),0);assert.equal(await page.locator('.tet-speech-bar').count(),0);
});
test('listening in Reading view highlights the rendered sentence and settings list Chinese voices',async()=>{
  await setup('第一段。\n\n| 层次 | 职责 |\n| --- | --- |\n| 甲 | 乙 |\n\n结尾。','reading');await fakeSpeech();
  await page.locator('.view-action[data-icon=headphones]').click();await page.waitForTimeout(120);
  const painted=()=>page.evaluate(()=>{const h=CSS.highlights.get('tet-speaking');return h?[...h][0].toString():null;});
  assert.equal(await painted(),'第一段。');
  await endSentence();
  assert.equal((await said()).at(-1),'层次 ， 职责');
  assert.equal((await painted()).replace(/\s/g,''),'层次职责');
  await endSentence();await endSentence();await endSentence();
  assert.equal(await painted(),null);
  await page.evaluate(()=>{fixture.plugin.tab.display();document.body.appendChild(fixture.plugin.tab.containerEl);});
  const options=await page.locator('select').nth(1).evaluate(s=>[...s.options].map(o=>o.textContent));
  assert.deepEqual(options,['自动（优先中文）','中文甲','中文乙']);
  assert.match(await page.getByText(/已记住 \d+ 篇笔记的位置/).textContent(),/已记住 1 篇/);
  await page.evaluate(()=>fixture.plugin.tab.containerEl.remove());
});
// No system engine (as in Obsidian for Android): automatic mode reads Baidu audio.
async function fakeOnline() {
  await page.evaluate(()=>{
    Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});
    window.requests=[];window.audios=[];window.onlineStatus=200;
    window.requestUrlMock=async options=>{requests.push(decodeURIComponent(new URL(options.url).searchParams.get('text')));
      return onlineStatus===200 ? {status:200,headers:{'Content-Type':'audio/mpeg'},arrayBuffer:new Uint8Array([255,251,0,0]).buffer} : {status:onlineStatus,headers:{'content-type':'text/html'},arrayBuffer:new ArrayBuffer(0)};};
    window.Audio=class{constructor(src){this.src=src;this.paused=true;this.playbackRate=1;}play(){this.paused=false;audios.push(this);return Promise.resolve();}pause(){this.paused=true;}end(){this.onended?.();}};
  });
}
test('without a system voice, listening reads Baidu audio with prefetch, mid-sentence pause and instant speed',async()=>{
  await setup('第一句。第二句。第三句。第四句。');await fakeOnline();
  await page.locator('.view-action[data-icon=headphones]').click();await page.waitForTimeout(120);
  // The current sentence plus the next two are requested once each.
  assert.deepEqual(await page.evaluate(()=>requests),['第一句。','第二句。','第三句。']);
  assert.equal(await page.evaluate(()=>audios.length),1);
  assert.equal(await page.locator('.tet-speaking').textContent(),'第一句。');
  // Speed changes the playing audio; nothing is downloaded again.
  await page.locator('.tet-speech-rate').click();
  await page.evaluate(()=>lastMenu.items.find(i=>i.title==='1.25×').run());await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>audios.at(-1).playbackRate),1.25);
  // Pause keeps the position inside the sentence: resume plays the same audio.
  await page.locator('.tet-speech-main').click();await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>audios.at(-1).paused),true);
  await page.locator('.tet-speech-main').click();await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>audios.length===2 && audios[0]===audios[1] && !audios[1].paused),true);
  assert.equal(await page.evaluate(()=>requests.length),3);
  await page.evaluate(()=>audios.at(-1).end());await page.waitForTimeout(120);
  assert.equal(await page.locator('.tet-speaking').textContent(),'第二句。');
  assert.equal(await page.evaluate(()=>requests.at(-1)),'第四句。');
  // A failing service is retried twice, then reading pauses on that sentence;
  // the play button tries it again once the network is back.
  await page.evaluate(()=>{onlineStatus=500;fixture.plugin.speech.cache.clear();requests.length=0;audios.at(-1).end();});
  await page.waitForTimeout(2600);
  assert.equal(await page.evaluate(()=>requests.filter(t=>t==='第三句。').length),3);
  assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'paused');
  assert.equal(await page.locator('.tet-speaking').textContent(),'第三句。');
  assert.ok((await page.evaluate(()=>fixture.notices.at(-1))).includes('已自动重试 2 次'));
  await page.evaluate(()=>{onlineStatus=200;});
  await page.locator('.tet-speech-main').click();await page.waitForTimeout(150);
  assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'playing');
  assert.equal(await page.evaluate(()=>!audios.at(-1).paused),true);
  await page.locator('.tet-speech-btn[aria-label="关闭听书"]').click();
  assert.equal(await page.evaluate(()=>fixture.plugin.speech.cache.size),0);
  // Settings offer the reading source; system voices are hidden without a system engine.
  await page.evaluate(()=>{fixture.plugin.tab.display();document.body.appendChild(fixture.plugin.tab.containerEl);});
  assert.deepEqual(await page.locator('select').first().evaluate(s=>[...s.options].map(o=>o.textContent)),['自动（推荐）','系统声音（离线）','百度朗读（联网）']);
  assert.equal(await page.getByText('系统声音',{exact:true}).count(),0);
  await page.evaluate(()=>fixture.plugin.tab.containerEl.remove());
  // Choosing the system engine explicitly on such a device explains why it cannot read.
  await page.evaluate(()=>{fixture.plugin.settings.speechEngine='system';});
  await page.locator('.view-action[data-icon=headphones]').click();
  assert.ok((await page.evaluate(()=>fixture.notices.at(-1))).includes('没有提供系统朗读'));
  await page.evaluate(()=>{fixture.plugin.settings.speechEngine='auto';delete window.requestUrlMock;});
});

test('listening highlight colour, hand-scroll following and double-tap pause / resume',async()=>{
  await setup('第一句是一句比较长的话。第二句。第三句。');await fakeSpeech();
  await page.locator('.view-action[data-icon=headphones]').click();await page.waitForTimeout(120);
  // Preset colours reach the editor highlight through the layout variables.
  const bg=()=>page.locator('.tet-speaking').evaluate(n=>getComputedStyle(n).backgroundColor);
  assert.equal(await bg(),'rgba(255, 208, 0, 0.45)');
  await page.evaluate(async()=>{fixture.plugin.settings.speechHighlight='blue';await fixture.plugin.saveSettings();});
  assert.equal(await bg(),'rgba(64, 156, 255, 0.42)');
  // Touches: a tap that jitters a few pixels is not a scroll; a real drag is.
  const touch=(selector,dx,dy)=>page.evaluate(([sel,dx,dy])=>{
    const el=document.querySelector(sel),r=el.getBoundingClientRect(),x=r.left+5,y=r.top+5;
    const fire=(type,px,py)=>{const e=new Event(type,{bubbles:true});e.touches=[{clientX:px,clientY:py}];el.dispatchEvent(e);};
    fire('touchstart',x,y);fire('touchmove',x+dx,y+dy);
  },[selector,dx,dy]);
  const follow=()=>page.locator('.tet-speech-bar').getAttribute('data-follow');
  await touch('.tet-speech-main',3,4);assert.equal(await follow(),'true');
  await touch('.cm-content',2,3);assert.equal(await follow(),'true');
  await touch('.cm-content',0,40);assert.equal(await follow(),'false');
  // After a quiet pause the next sentence follows again by itself.
  await page.evaluate(()=>{fixture.plugin.speech.session.handScroll=Date.now()-7000;});
  await endSentence();
  assert.equal(await follow(),'true');
  assert.equal(await page.locator('.tet-speaking').textContent(),'第二句。');
  // Double-clicking the highlighted sentence pauses and resumes; no word stays selected.
  const box=await page.locator('.tet-speaking').boundingBox();
  const state=()=>page.locator('.tet-speech-bar').getAttribute('data-state');
  await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(80);
  assert.equal(await state(),'paused');
  assert.equal(await page.evaluate(()=>fixture.cm.state.selection.main.empty),true);
  const count=(await said()).length;
  await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(150);
  assert.equal(await state(),'playing');
  assert.equal((await said()).length,count+1);assert.equal((await said()).at(-1),'第二句。');
  // Double-clicking other text does nothing to playback.
  const other=await page.evaluate(()=>{const c=fixture.cm.coordsAtPos(fixture.cm.state.doc.toString().indexOf('第三句')+1);return {x:c.left+2,y:(c.top+c.bottom)/2};});
  await page.mouse.dblclick(other.x,other.y);await page.waitForTimeout(80);
  assert.equal(await state(),'playing');
  await page.evaluate(async()=>{fixture.plugin.settings.speechHighlight='yellow';await fixture.plugin.saveSettings();fixture.plugin.speech.stop();});
});
test('double-clicking the highlighted sentence in Reading view pauses listening',async()=>{
  await setup('第一句。第二句。','reading');await fakeSpeech();
  await page.locator('.view-action[data-icon=headphones]').click();await page.waitForTimeout(120);
  const rect=await page.evaluate(()=>{const r=[...CSS.highlights.get('tet-speaking')][0].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
  await page.mouse.dblclick(rect.x,rect.y);await page.waitForTimeout(80);
  assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'paused');
  assert.equal(await page.evaluate(()=>getSelection().isCollapsed),true);
  await page.evaluate(()=>fixture.plugin.speech.stop());
});

test('in the editor, sentences inside a drawn table widget are highlighted on the drawn text',async()=>{
  await setup('前文。\n\n| 层次 | 职责 |\n| --- | --- |\n| 甲 | 乙 |\n\n后文。');await fakeSpeech();
  await page.locator('.view-action[data-icon=headphones]').click();await page.waitForTimeout(120);
  const painted=()=>page.evaluate(()=>{const h=CSS.highlights.get('tet-speaking');return h?[...h][0].toString().replace(/\s/g,''):null;});
  assert.equal(await page.locator('.tet-speaking').textContent(),'前文。');
  assert.equal(await painted(),null);
  await endSentence();
  assert.equal((await said()).at(-1),'层次 ， 职责');
  assert.equal(await painted(),'层次职责');
  assert.ok(await page.evaluate(()=>!![...CSS.highlights.get('tet-speaking')][0].startContainer.parentElement.closest('.cm-table-widget')));
  // Double-tapping the drawn sentence pauses as well.
  const rect=await page.evaluate(()=>{const r=[...CSS.highlights.get('tet-speaking')][0].getClientRects()[0];return {x:r.left+r.width/2,y:r.top+r.height/2};});
  await page.mouse.dblclick(rect.x,rect.y);await page.waitForTimeout(80);
  assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'paused');
  await page.locator('.tet-speech-main').click();await page.waitForTimeout(150);
  await endSentence();await endSentence();
  assert.equal(await page.locator('.tet-speaking').textContent(),'后文。');
  assert.equal(await painted(),null);
  await page.evaluate(()=>fixture.plugin.speech.stop());
});

// Older WebViews (seen on a Huawei phone) have no CSS Custom Highlight API.
// Reading: the Huawei case, API objects present but ::highlight() not painted.
// Editor table: no Highlight constructor at all.
test('without a working CSS Highlight API, the sentence is covered by translucent boxes that follow it',async()=>{
  for(const [text,mode,second] of [['第一段。\n\n第二段。','reading','第二段。'],['前文。\n\n| 层次 | 职责 |\n| --- | --- |\n| 甲 | 乙 |','live','层次 ， 职责']]) {
    await setup(text,mode);await fakeSpeech();
    await page.evaluate(mode=>{
      window.savedHighlight=window.Highlight;window.savedSupports=CSS.supports;
      if(mode==='reading') CSS.supports=(...a)=>/::highlight/.test(a[0])?false:window.savedSupports.apply(CSS,a);
      else window.Highlight=undefined;
    },mode);
    await page.locator('.view-action[data-icon=headphones]').click();await page.waitForTimeout(120);
    if(mode==='reading') {
      // The boxes sit exactly on the rendered sentence.
      const check=await page.evaluate(()=>{const r=fixture.plugin.speech.session.range.getClientRects()[0],b=document.querySelector('.tet-speech-box').getBoundingClientRect();return [Math.abs(r.left-b.left),Math.abs(r.top-b.top),Math.abs(r.width-b.width)];});
      for(const d of check) assert.ok(d<0.6,JSON.stringify(check));
    }
    await endSentence();
    assert.equal((await said()).at(-1),second);
    const boxes=await page.locator('.tet-speech-overlay .tet-speech-box').count();
    assert.ok(boxes>=1,String(boxes));
    // The diagnostics command reports the fallback and the found sentence.
    await page.evaluate(()=>fixture.plugin.commands.get('read-aloud-diagnostics').callback());
    const facts=await page.locator('.tet-diagnostics tr').evaluateAll(rows=>Object.fromEntries(rows.map(r=>[r.cells[0].textContent,r.cells[1].textContent])));
    assert.equal(facts['能画新式高亮'],'不能');assert.equal(facts['使用的高亮方式'],'覆盖色块');assert.equal(facts['在页面上找到这句'],'找到了');
    assert.ok(Number(facts['覆盖色块数量'])>=1);
    await page.evaluate(()=>document.querySelector('.modal')?.remove());
    // Boxes never catch taps: double-tapping the sentence still pauses.
    assert.equal(await page.locator('.tet-speech-overlay').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
    const rect=await page.evaluate(()=>{const r=fixture.plugin.speech.session.range.getClientRects()[0];return {x:r.left+r.width/2,y:r.top+r.height/2};});
    await page.mouse.dblclick(rect.x,rect.y);await page.waitForTimeout(80);
    assert.equal(await page.locator('.tet-speech-bar').getAttribute('data-state'),'paused');
    // Stopping removes the layer and its listeners.
    await page.locator('.tet-speech-btn[aria-label="关闭听书"]').click();
    assert.equal(await page.locator('.tet-speech-overlay').count(),0);
    await page.evaluate(()=>{window.Highlight=window.savedHighlight;CSS.supports=window.savedSupports;});
  }
});

// Chromium 114 (an Android WebView) paints ::highlight() transparent when its
// colour comes from var(); the rule must carry a literal colour.
test('the read-aloud ::highlight rule uses a literal colour that follows the chosen preset',async()=>{
  await setup('第一句。第二句。','reading');await fakeSpeech();
  const rule=()=>page.evaluate(()=>document.getElementById('tet-layout-vars').textContent.split('\n').find(l=>l.includes('::highlight')));
  assert.equal(await rule(),'::highlight(tet-speaking) { background-color: rgba(255, 208, 0, .45); }');
  for(const sheet of await page.evaluate(()=>[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules].map(r=>r.cssText);}catch{return [];}}).filter(t=>t.includes('::highlight'))))
    assert.ok(!sheet.includes('var('),sheet);
  await page.locator('.view-action[data-icon=headphones]').click();await page.waitForTimeout(120);
  const painted=()=>page.evaluate(()=>{const el=fixture.plugin.speech.session.range.startContainer.parentElement;return getComputedStyle(el,'::highlight(tet-speaking)').backgroundColor;});
  assert.equal(await painted(),'rgba(255, 208, 0, 0.45)');
  await page.evaluate(async()=>{fixture.plugin.settings.speechHighlight='green';await fixture.plugin.saveSettings();});
  assert.equal(await painted(),'rgba(46, 204, 113, 0.42)');
  // The diagnostics report the real colour of the painted sentence.
  await page.evaluate(()=>fixture.plugin.commands.get('read-aloud-diagnostics').callback());
  const facts=await page.locator('.tet-diagnostics tr').evaluateAll(rows=>Object.fromEntries(rows.map(r=>[r.cells[0].textContent,r.cells[1].textContent])));
  assert.equal(facts['高亮实际颜色'],'rgba(46, 204, 113, 0.42)');
  await page.evaluate(async()=>{document.querySelector('.modal')?.remove();fixture.plugin.settings.speechHighlight='yellow';await fixture.plugin.saveSettings();fixture.plugin.speech.stop();});
});
