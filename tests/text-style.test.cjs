const {test}=require('node:test');
const assert=require('node:assert/strict');
const {marked}=require('marked');
const {stylePatch,semanticStyleRanges}=require('../src/text-style.mjs');
const RED='#d64545',BLUE='#367bd6',YELLOW='#ffe1bd',GREEN='#d7f3df';
function apply(state,kind,value) {
  const p=stylePatch(state.text,state.start,state.end,kind,value);
  return {text:state.text.slice(0,p.from)+p.text+state.text.slice(p.to),start:p.selectFrom,end:p.selectTo};
}
function selection(text,content='重要内容') {const start=text.indexOf(content);return {text,start,end:start+content.length};}

for(const [name,text,semantic] of [['粗体','**重要内容**','strong'],['斜体','*重要内容*','em'],['删除线','~~重要内容~~','del'],['粗斜体','***重要内容***','strong'],['下划线式粗体','__重要内容__','strong']]) {
  for(const style of ['color','highlight','underline'])test(name+' + '+style+' keeps Markdown inside and full-source selections',()=>{
    for(const initial of [selection(text),{text,start:0,end:text.length}]) {
      const styled=apply(initial,style,style==='color'?RED:YELLOW);
      assert.ok(styled.text.startsWith(text.slice(0,text.indexOf('重要内容'))));
      assert.ok(styled.text.endsWith(text.slice(text.indexOf('重要内容')+4)));
      const html=marked.parse(styled.text);assert.ok(html.includes('<'+semantic+'>'));
      if(name==='粗斜体'){assert.ok(html.includes('<em>'));assert.ok(html.includes('<strong>'));}
      assert.equal((styled.text.match(/<span/g)||[]).length,1);
      assert.equal(apply(styled,'clear').text,text);
    }
  });
}

test('all requested style sequences merge into one canonical span and clear independently',()=>{
  let s=selection('**重要内容**');
  s=apply(s,'color',RED);s=apply(s,'highlight',YELLOW);s=apply(s,'underline');
  assert.equal(s.text,'**<span data-mengren-style="1" style="color: #d64545; background-color: #ffe1bd; text-decoration: underline;">重要内容</span>**');
  const noColor=apply(s,'clear-color');assert.ok(!noColor.text.includes('color: #d64545'));assert.ok(noColor.text.includes('background-color'));assert.ok(noColor.text.includes('underline'));
  const noBg=apply(s,'clear-highlight');assert.ok(!noBg.text.includes('background-color'));assert.ok(noBg.text.includes('color: #d64545'));assert.ok(noBg.text.includes('underline'));
  const noUnder=apply(s,'clear-underline');assert.ok(!noUnder.text.includes('text-decoration'));assert.ok(noUnder.text.includes('background-color'));assert.ok(noUnder.text.includes('color: #d64545'));
  s=apply(s,'color',BLUE);s=apply(s,'highlight',GREEN);s=apply(s,'clear-highlight');
  assert.ok(s.text.includes(BLUE));assert.ok(!s.text.includes(RED));assert.ok(!s.text.includes('background-color'));assert.ok(s.text.includes('underline'));
  assert.equal((s.text.match(/<span/g)||[]).length,1);
  assert.equal(apply(s,'clear').text,'**重要内容**');
});

test('100 repeated changes stay flat and final style removal restores exact Markdown',()=>{
  let s=selection('**重要内容**');
  for(let n=0;n<100;n++) {
    s=apply(s,'color',n%2?RED:BLUE);s=apply(s,'highlight',n%2?YELLOW:GREEN);s=apply(s,'underline');s=apply(s,'clear-highlight');
    assert.equal((s.text.match(/<span/g)||[]).length,1);
  }
  s=apply(s,'clear-underline');s=apply(s,'clear-color');assert.equal(s.text,'**重要内容**');
});

test('partial text selection leaves surrounding native Markdown intact',()=>{
  const source='这里有 **重要内容** 和普通内容';let s=selection(source);
  s=apply(s,'color',RED);s=apply(s,'highlight',YELLOW);s=apply(s,'underline');
  assert.ok(s.text.startsWith('这里有 **<span'));assert.ok(s.text.endsWith('</span>** 和普通内容'));
  assert.equal(apply(s,'clear').text,source);
});

test('subset of a styled run splits only that subset, retaining other properties outside it',()=>{
  let s=apply(selection('甲重要内容乙'),'color',RED);
  s=selection(s.text,'重要');s=apply(s,'highlight',YELLOW);
  assert.equal((s.text.match(/<span/g)||[]).length,2);
  assert.ok(s.text.includes('background-color: #ffe1bd;">重要</span>'));
  const clear=apply(s,'clear-highlight');assert.equal((clear.text.match(/<span/g)||[]).length,1);
  assert.ok(!clear.text.includes('background-color'));
});

test('legacy nested color/highlight/underline is migrated when touched, not on opening',()=>{
  const source='<span style="color: #d64545;"><mark style="background-color: #ffe1bd; color: #d64545;"><u>**重要内容**</u></mark></span>';
  let s=apply(selection(source),'color',BLUE);
  assert.ok(s.text.startsWith('**<span'));assert.ok(s.text.includes(BLUE));assert.ok(s.text.includes(YELLOW));assert.ok(s.text.includes('underline'));
  assert.equal((s.text.match(/<span/g)||[]).length,1);assert.equal(apply(s,'clear').text,'**重要内容**');
});

test('standard inline/reference links keep destination, title and label semantics',()=>{
  for(const text of ['[**重要内容**](https://example.com/a(b) "标题")','[重要内容][ref]\n\n[ref]: https://example.com "标题"']) {
    let s=apply(selection(text),'color',RED);const html=marked.parse(s.text);
    assert.ok(html.includes('href="https://example.com'));assert.ok(html.includes('title="标题"'));
    assert.equal(apply(s,'clear').text,text);
  }
});

test('mixed native semantics are styled on text runs, never wrapped as one raw HTML block',()=>{
  const text='普通 **重要内容** 和 *斜体* ~~删除~~ [链接](https://example.com) `code`';
  const s=apply({text,start:0,end:text.length},'color',RED),html=marked.parse(s.text);
  for(const tag of ['strong','em','del','a','code'])assert.ok(html.includes('<'+tag),tag);
  assert.ok(s.text.includes('`code`'));assert.equal(apply(s,'clear').text,text);
});

test('code, wiki links, destinations, YAML and foreign HTML cannot be destructively rewritten',()=>{
  for(const text of ['`重要内容`','[[笔记|重要内容]]','```\n重要内容\n```','---\ntitle: 重要内容\n---']) {
    assert.throws(()=>apply(selection(text),'color',RED),/受保护|代码|元数据/);
  }
  const custom='<span class="custom" style="font-weight: bold;">重要内容</span>';
  assert.equal(apply(selection(custom),'clear').text,custom);
  const link='[标签](https://example.com)';const start=link.indexOf('https');assert.throws(()=>stylePatch(link,start,link.length-1,'color',RED),/链接/);
});

test('heading/list/quote prefixes, CRLF, table separators and unselected siblings are preserved',()=>{
  for(const text of ['## **重要内容**','- [ ] **重要内容**','>**重要内容**','前文\r\n\r\n**重要内容**\r\n尾部','| A | B |\n| --- | --- |\n| **重要内容** | 保留 |']) {
    let s=apply(selection(text),'color',RED);assert.equal(apply(s,'clear').text,text);
  }
  const text='| A | B |\n| --- | --- |\n| 甲 | 乙 |';assert.throws(()=>stylePatch(text,text.indexOf('甲'),text.indexOf('乙')+1,'color',RED),/单元格/);
});

test('derived LP semantics follow live Markdown, not persistent span attributes',()=>{
  const span='<span data-mengren-style="1" style="color: #d64545;">重要内容</span>';
  assert.equal(semanticStyleRanges('**'+span+'**')[0].strong,true);
  assert.equal(semanticStyleRanges('*'+span+'*')[0].em,true);
  assert.equal(semanticStyleRanges('~~'+span+'~~')[0].del,true);
  assert.equal(semanticStyleRanges(span)[0]?.strong,undefined);
  assert.equal(semanticStyleRanges('```\n**'+span+'**\n```').length,0);
});
