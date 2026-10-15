const {stylePatch}=require('../src/text-style.mjs');
const red='#d64545',blue='#367bd6',yellow='#ffe1bd';
function styled(source,operations) {
  let text=source,start=text.indexOf('重要内容'),end=start+4;
  for(const [kind,value] of operations) {
    const p=stylePatch(text,start,end,kind,value);text=text.slice(0,p.from)+p.text+text.slice(p.to);start=p.selectFrom;end=p.selectTo;
  }
  return text;
}
function cases() {
  const c=['color',red],h=['highlight',yellow],u=['underline'];
  return [
    ['粗体加颜色','**重要内容**',[c],{bold:true,color:red}],
    ['粗体加高亮','**重要内容**',[h],{bold:true,background:yellow}],
    ['粗体加下划线','**重要内容**',[u],{bold:true,underline:true}],
    ['粗体加颜色高亮','**重要内容**',[c,h],{bold:true,color:red,background:yellow}],
    ['粗体三样式','**重要内容**',[c,h,u],{bold:true,color:red,background:yellow,underline:true}],
    ['斜体加颜色','*重要内容*',[c],{italic:true,color:red}],
    ['删除线加颜色','~~重要内容~~',[c],{strike:true,color:red}],
    ['粗斜体加颜色','***重要内容***',[c],{bold:true,italic:true,color:red}],
    ['先高亮再改颜色','**重要内容**',[h,c,['color',blue]],{bold:true,color:blue,background:yellow}],
    ['仅清除颜色','**重要内容**',[c,h,['clear-color']],{bold:true,background:yellow}],
    ['仅清除下划线','**重要内容**',[c,u,['clear-underline']],{bold:true,color:red}],
    ['清除全部保留粗体','**重要内容**',[c,h,u,['clear']],{bold:true}],
    ['局部选区','这里有 **重要内容** 和普通内容',[c,h],{bold:true,color:red,background:yellow}],
    ['链接保留','[**重要内容**](https://example.com "标题")',[c,h],{bold:true,color:red,background:yellow,link:true}],
  ].map(([name,source,ops,expected])=>({name,source,operations:ops,expected,markdown:styled(source,ops)}));
}
module.exports={cases};
if(require.main===module)process.stdout.write(JSON.stringify(cases()));
