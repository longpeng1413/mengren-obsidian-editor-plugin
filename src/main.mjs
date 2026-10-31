import { Plugin, PluginSettingTab, Setting, Modal, Notice, MarkdownView, normalizePath } from 'obsidian';
import { formatNote, scanImages, imageDimensions, isImageTarget, isExcalidraw } from './markdown.mjs';
import { captureSelection, commitStyle, HEX } from './text-style.mjs';
import { textStyleExtension } from './text-style-view.mjs';
import { layoutExtension, applyLayout, decorateTabKnowledge, refreshTabKnowledge, decorateExtraBlankLines, refreshExtraBlankLines } from './layout.mjs';
import { ImageResizeManager, cleanTarget } from './image-resize.mjs';
import { blockDragExtension } from './block-drag.mjs';
import { SpeechReader, speechExtension, pruneProgress, RATES, ENGINES, HIGHLIGHTS } from './speech.mjs';

const DEFAULTS = {
  layoutVersion:2, layoutEnabled:true, lineHeight:1.62, blockPadding:0.28,
  headingH1:0.95, headingH2:0.82, headingH3:0.70, headingH4:0.58,
  listIndent:1.8, mediaFollowsBody:true, imagePadding:0.28, tablePadding:0.28, splitProseLines:true, looseLists:true,
  splitIndentedListParagraphs:true,
  tabKnowledgeLines:true,
  preserveExtraBlankLines:true,
  blockDrag:true, touchSelectWhileTyping:false,
  backupEnabled:true, imageResize:true, readingResize:true, freeResize:false, maxImageWidth:4096,
  speechRemember:true, speechRate:1, speechVoice:'', speechEngine:'auto', speechHighlight:'yellow', speechProgress:{},
  colors:[
    {name:'风险红',text:'#d64545',background:'#ffd9dc'},
    {name:'重点橙',text:'#cb6c13',background:'#ffe1bd'},
    {name:'概念蓝',text:'#367bd6',background:'#d8eaff'},
    {name:'确认绿',text:'#278653',background:'#d7f3df'},
    {name:'提示紫',text:'#8e5ad7',background:'#ebddff'},
    {name:'补充灰',text:'#7a7f87',background:'#e4e6e9'},
  ],
};

function loadValidated(saved) {
  const result = JSON.parse(JSON.stringify(DEFAULTS));
  if (!saved || typeof saved !== 'object') return result;
  for (const [key,value] of Object.entries(result)) {
    if (typeof value === 'boolean' && typeof saved[key] === 'boolean') result[key] = saved[key];
  }
  for (const [key,min,max] of [ ['lineHeight',1,2.4],['blockPadding',0,2],['headingH1',0,3],['headingH2',0,3],['headingH3',0,3],['headingH4',0,3],['listIndent',1,4],['imagePadding',0,3],['tablePadding',0,3],['maxImageWidth',100,8192] ]) {
    // Migrate the excessive pixel-gap prototype to the verified em baseline.
    // Keep palette and feature toggles; never silently carry old layout values.
    if (key !== 'maxImageWidth' && saved.layoutVersion !== 2) continue;
    if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) result[key] = Math.max(min,Math.min(max,saved[key]));
  }
  if (Array.isArray(saved.colors)) {
    const colors = saved.colors.slice(0,12).filter(c=>c && HEX.test(c.text) && HEX.test(c.background)).map((c,i)=>({name:String(c.name || `颜色 ${i+1}`).slice(0,40),text:c.text,background:c.background}));
    if (colors.length) result.colors = colors;
  }
  if (RATES.includes(saved.speechRate)) result.speechRate = saved.speechRate;
  if (typeof saved.speechVoice === 'string') result.speechVoice = saved.speechVoice.slice(0,200);
  if (Object.prototype.hasOwnProperty.call(ENGINES,saved.speechEngine)) result.speechEngine = saved.speechEngine;
  if (Object.prototype.hasOwnProperty.call(HIGHLIGHTS,saved.speechHighlight)) result.speechHighlight = saved.speechHighlight;
  result.speechProgress = pruneProgress(saved.speechProgress);
  return result;
}

function notifyError(error) { new Notice(error.message || String(error),7000); }

class PaletteModal extends Modal {
  constructor(plugin,snapshot,kind) { super(plugin.app); this.plugin=plugin; this.snapshot=snapshot; this.kind=kind; }
  onOpen() {
    this.contentEl.classList.add('tet-modal');
    this.titleEl.setText(this.kind === 'color' ? '选择文字颜色' : '选择背景高亮');
    this.contentEl.createEl('p',{text:'点击颜色应用到打开面板前选中的文字。',cls:'tet-muted'});
    const grid=this.contentEl.createDiv({cls:'tet-palette'});
    for (const color of this.plugin.settings.colors) {
      const value=this.kind==='color' ? color.text : color.background;
      const button=grid.createEl('button',{cls:'tet-swatch'});
      const dot=button.createSpan({cls:'tet-dot'}); dot.style.backgroundColor=value;
      button.createSpan({text:color.name}); button.title=value;
      button.addEventListener('click',()=>{ try { commitStyle(this.snapshot,this.kind,value); this.close(); } catch(e) { notifyError(e); } });
    }
  }
  onClose() { this.contentEl.empty(); }
}

class FormatPreviewModal extends Modal {
  constructor(plugin,editor,info) {
    super(plugin.app); this.plugin=plugin; this.editor=editor; this.info=info;
    this.original=editor.getValue(); this.result=formatNote(this.original,plugin.settings);
  }
  onOpen() {
    const el=this.contentEl; el.classList.add('tet-modal');
    this.titleEl.setText('格式化当前笔记 · 预览');
    el.createEl('p',{text:`将插入 ${this.result.inserted} 个空行；保护 ${this.result.protectedLines} 行特殊结构。不会修改文字、图片链接或尺寸。`});
    el.createEl('p',{text:this.plugin.settings.splitProseLines ? '当前模式：把连续普通正文的物理换行分成独立段落。若原笔记用换行手工折行，请关闭设置中的“逐行分段”后再运行。' : '当前模式：保留正文手工换行，只分隔标题、图片、列表和表格。',cls:'tet-muted'});
    const columns=el.createDiv({cls:'tet-format-preview'});
    for (const [label,value] of [['原文',this.original],['格式化后',this.result.text]]) {
      const col=columns.createDiv(); col.createEl('h3',{text:label});
      const area=col.createEl('textarea'); area.value=value; area.readOnly=true; area.setAttribute('aria-label',label);
    }
    new Setting(el).setName('确认执行').setDesc(this.plugin.settings.backupEnabled ? '默认先保存原文备份，再以一次编辑替换全文；可 Ctrl+Z 撤销。' : '原文备份已关闭；可 Ctrl+Z 撤销。')
      .addButton(button=>button.setButtonText('取消').onClick(()=>this.close()))
      .addButton(button=>button.setButtonText('应用格式化').setCta().setDisabled(this.result.inserted===0).onClick(async()=>{
        button.setDisabled(true);
        try {
          if (this.editor.getValue()!==this.original || this.info.file?.path!==this.filePath) throw new Error('预览期间笔记已变化，请重新运行格式化');
          await this.plugin.backup(this.info.file,this.original,'format');
          if (this.editor.getValue()!==this.original || this.info.file?.path!==this.filePath) throw new Error('笔记已变化，未执行格式化');
          const last=this.editor.lastLine();
          this.editor.transaction({changes:[{from:{line:0,ch:0},to:{line:last,ch:this.editor.getLine(last).length},text:this.result.text}]});
          this.close(); new Notice(`已插入 ${this.result.inserted} 个空行，可 Ctrl+Z 撤销`);
        } catch(e) { notifyError(e); button.setDisabled(false); }
      }));
    this.filePath=this.info.file?.path;
  }
  onClose() { this.contentEl.empty(); }
}

class SizeModal extends Modal {
  constructor(plugin,source) { super(plugin.app); this.plugin=plugin; this.source=source; }
  onOpen() {
    const el=this.contentEl; el.classList.add('tet-modal');
    this.titleEl.setText('设置图片尺寸');
    el.createEl('p',{text:this.source.token.target,cls:'tet-muted'});
    const current=imageDimensions(this.source.token);
    let width=String(current?.width ?? 320), height=current?.height===null || !current ? '' : String(current.height);
    new Setting(el).setName('宽度（px）').addText(t=>t.setValue(width).onChange(v=>width=v));
    new Setting(el).setName('高度（px）').setDesc('留空则保持原比例；输入高度则保存宽×高。').addText(t=>t.setValue(height).onChange(v=>height=v));
    new Setting(el).addButton(b=>b.setButtonText('保存到笔记').setCta().onClick(async()=>{
      try { await this.plugin.images.commit(this.source,Number(width),height.trim() ? Number(height) : null); this.close(); }
      catch(e) { notifyError(e); }
    }));
  }
  onClose() { this.contentEl.empty(); }
}

class SpeechDiagnosticsModal extends Modal {
  constructor(plugin) { super(plugin.app); this.plugin=plugin; }
  onOpen() {
    this.titleEl.setText('听书诊断信息');
    this.contentEl.createEl('p',{text:'请在正在朗读时打开本窗口并截图发给开发者。这里的信息只显示在本机，不会发送到任何地方。',cls:'tet-muted'});
    const table=this.contentEl.createEl('table',{cls:'tet-diagnostics'});
    for(const [name,value] of this.plugin.speech.diagnostics()) { const row=table.createEl('tr'); row.createEl('th',{text:name}); row.createEl('td',{text:value}); }
  }
  onClose() { this.contentEl.empty(); }
}

class TraderSettings extends PluginSettingTab {
  constructor(app,plugin) { super(app,plugin); this.plugin=plugin; }
  display() {
    const p=this.plugin, s=p.settings, el=this.containerEl; el.empty();
    el.createEl('p',{text:'格式化只在主动运行命令并确认预览后修改笔记。图片尺寸只在完成拖动或点击保存后写回。',cls:'tet-muted'});
    const toggle=(name,description,key)=>new Setting(el).setName(name).setDesc(description).addToggle(t=>t.setValue(s[key]).onChange(async value=>{s[key]=value;await p.saveSettings();}));
    const number=(name,key,min,max,step=1)=>new Setting(el).setName(name).addSlider(t=>t.setLimits(min,max,step).setValue(s[key]).setDynamicTooltip().onChange(async value=>{s[key]=value;await p.saveSettings();}));
    new Setting(el).setName('段落与排版').setHeading();
    toggle('启用统一排版','影响 Live Preview、阅读模式和 PDF；不改写笔记源码。','layoutEnabled');
    number('正文内部行距（倍）','lineHeight',1,2.4,0.01);
    number('正文 / 顶层列表每侧留白（em）','blockPadding',0,2,0.01);
    number('H1 上下每侧留白（em）','headingH1',0,3,0.01);
    number('H2 上下每侧留白（em）','headingH2',0,3,0.01);
    number('H3 上下每侧留白（em）','headingH3',0,3,0.01);
    number('H4–H6 上下每侧留白（em）','headingH4',0,3,0.01);
    number('列表缩进（em）','listIndent',1,4,0.1);
    new Setting(el).setName('表格、图片间距跟随正文').setDesc('代码块、引用、提示框、表格、图片的外侧各留半份正文空白：它们的背景框 / 竖线 / 框线到上下文字的空白，与两段正文文字之间看到的空白相同。编辑、阅读、PDF 一致。关闭后可用下面两项单独设置图片、表格外侧留白。')
      .addToggle(t=>t.setValue(s.mediaFollowsBody).onChange(async value=>{s.mediaFollowsBody=value;await p.saveSettings();this.display();}));
    number('图片上下每侧留白（em）','imagePadding',0,3,0.01).setDisabled(s.mediaFollowsBody);
    number('表格上下每侧留白（em）','tablePadding',0,3,0.01).setDisabled(s.mediaFollowsBody);
    new Setting(el).setName('恢复已验证 wolai 基准').setDesc('正文行距 1.62；正文和顶层列表每侧 0.28em；标题上下对称。不会修改笔记。')
      .addButton(b=>b.setButtonText('恢复基准').onClick(async()=>{
        for(const key of ['layoutVersion','lineHeight','blockPadding','headingH1','headingH2','headingH3','headingH4','listIndent','mediaFollowsBody','imagePadding','tablePadding']) s[key]=DEFAULTS[key];
        await p.saveSettings();this.display();
      }));
    toggle('格式化：逐行分段','普通正文每个物理换行独立成段；顶层列表后未缩进正文也独立成段。原笔记用软换行延续列表或手工折行时请关闭。自动折行、硬换行和嵌套列表保留。','splitProseLines');
    toggle('格式化：分隔顶层列表项','为顶层兄弟列表项增加空行；嵌套列表内容保持原样。','looseLists');
    toggle('格式化：分隔列表内缩进正文','为列表项后的普通缩进正文补空行，保留原缩进和嵌套层级。代码、引用、多行 HTML / 强调与硬换行不拆。先检查预览。','splitIndentedListParagraphs');
    toggle('保留连续空行的额外留白','段落间第一个空行用于分段，仍紧凑显示；每多一个普通空行额外保留一行高度。阅读/PDF 同步增强；不改源码。代码与引用内部空行不套用此规则。','preserveExtraBlankLines');
    new Setting(el).setName('原生编辑逻辑').setDesc('本插件不接管 Enter、Shift+Enter、Tab 或 Backspace；缩进、引用和列表延续由 Obsidian 原生处理。光标所在的空白输入行保持可见。');
    toggle('Tab 缩进按知识行显示','独立 Tab 缩进块中，每个物理行都使用与列表项相同的块间距；自动折行仍紧凑。阅读/PDF 同步显示。代码围栏和空格缩进代码不受影响；若 Tab 本来表示程序代码，请关闭。只改变显示，不写正文。','tabKnowledgeLines');
    toggle('保存原文备份','格式化、阅读模式图片写回前，在本插件 backups 目录保存原文。备份不会自动删除。','backupEnabled');
    new Setting(el).setName('备份位置').setDesc(`${p.app.vault.configDir}/plugins/${p.manifest.id}/backups/`);
    new Setting(el).setName('拖动移动块').setHeading();
    toggle('启用拖动移动块','编辑模式里移动标题、正文、列表项、图片、代码块、引用、提示框、表格、Tab 知识行。电脑：鼠标移到块左边出现六个点的把手，按住拖到别处再松手。手机：长按一块，它浮起来跟着手指走，紫色的线是放下的位置（要选字请双击一个词再拖选择柄）。标题连同下面整节一起移动（折叠着也一样）；列表项带着子条目，放到哪里就跟那里的列表同级；会自动补好前后的空行。一次拖动一次撤销（Ctrl+Z），电脑上拖动中按 Esc 取消。阅读模式不能拖。','blockDrag');
    toggle('手机上正在打字时长按选字','打开后，光标在正文里（正在打字）时长按仍是系统选字，只有没在打字时长按才拖动。默认关闭：长按一律拖动。','touchSelectWhileTyping');
    new Setting(el).setName('图片拖拽缩放').setHeading();
    toggle('启用图片拖拽','点击图片出现四角控制点；拖动默认保持比例，Alt 自由调整，Esc 取消。','imageResize');
    toggle('允许阅读模式调整','阅读模式调整也会写回 Markdown；没有编辑窗格时先保存原文备份。','readingResize');
    toggle('默认自由宽高','开启后直接拖动保存宽×高；关闭时按 Alt 临时自由调整。','freeResize');
    number('拖拽最大宽度（px）','maxImageWidth',100,8192,10);
    new Setting(el).setName('Excalidraw 检测').setDesc(p.excalidrawAvailable() ? '已检测到启用的 Excalidraw；使用原生嵌入尺寸语法。' : '未检测到启用的 Excalidraw。普通图片和其他功能照常可用；绘图需启用 Excalidraw 后测试。');
    this.speechSettings(el);
    new Setting(el).setName('常用颜色').setHeading();
    el.createEl('p',{text:'每行依次为名称、文字色、背景色。前 9 行对应固定快捷键槽位；颜色、高亮、下划线独立叠加，高亮不改文字颜色。深色主题请按需同时设置文字色以确保对比度。',cls:'tet-muted'});
    s.colors.forEach((color,index)=>{
      new Setting(el).setName(`槽位 ${index+1}`)
        .addText(t=>t.setValue(color.name).onChange(async v=>{color.name=v.trim().slice(0,40)||`颜色 ${index+1}`;await p.saveSettings();}))
        .addColorPicker(t=>{t.colorPickerEl.setAttribute('aria-label','文字颜色');t.colorPickerEl.title='文字颜色';t.setValue(color.text).onChange(async v=>{color.text=v;await p.saveSettings();});})
        .addColorPicker(t=>{t.colorPickerEl.setAttribute('aria-label','背景色');t.colorPickerEl.title='背景色';t.setValue(color.background).onChange(async v=>{color.background=v;await p.saveSettings();});})
        .addExtraButton(b=>b.setIcon('trash-2').setTooltip('删除颜色；后续槽位前移').onClick(async()=>{
          if(s.colors.length===1) return new Notice('请至少保留一个颜色');
          s.colors.splice(index,1);await p.saveSettings();this.display();
        }));
    });
    new Setting(el).setName('添加颜色').addButton(b=>b.setButtonText('添加').setDisabled(s.colors.length>=12).onClick(async()=>{s.colors.push({name:`颜色 ${s.colors.length+1}`,text:'#367bd6',background:'#d8eaff'});await p.saveSettings();this.display();}));
    new Setting(el).setName('恢复默认配色').addButton(b=>b.setButtonText('恢复').onClick(async()=>{s.colors=JSON.parse(JSON.stringify(DEFAULTS.colors));await p.saveSettings();this.display();}));
  }
  speechSettings(el) {
    const p=this.plugin, s=p.settings, speech=p.speech;
    new Setting(el).setName('听书').setHeading();
    el.createEl('p',{text:'点笔记右上角的耳机按钮开始朗读：有选中文字只读选中部分，否则接着上次的位置读，没有记录时从光标处（阅读模式从当前屏幕）开始。',cls:'tet-muted'});
    const system=speech.available();
    new Setting(el).setName('朗读来源').setDesc(`系统声音：设备自带，离线、免费，文字不出本机${system ? '' : '（这台设备的 Obsidian 不提供）'}。百度朗读：免费、不用注册，需要联网，正在朗读的句子会发送给百度翻译；它不是百度正式开放的服务，百度改接口时可能失效。自动：有系统声音就用系统声音，没有（例如安卓手机）或读不出声时用百度朗读。`)
      .addDropdown(d=>{
        for(const [key,label] of Object.entries(ENGINES)) d.addOption(key,label);
        d.setValue(s.speechEngine).onChange(async value=>{await speech.setEngine(value);this.display();});
      });
    if(system && speech.engine()==='system') {
      const voices=speech.synth.getVoices();
      if(!voices.length && !this.waitedForVoices) { this.waitedForVoices=true; void speech.voices().then(list=>{ if(list.length) this.display(); }); }
      const chinese=voices.filter(v=>/^zh/i.test(v.lang)), shown=chinese.length ? chinese : voices;
      new Setting(el).setName('系统声音').setDesc(voices.length ? `本机共有 ${voices.length} 个系统声音，这里列出${chinese.length ? '中文' : '全部'}声音。Windows 可在“设置 > 时间和语言 > 语音”添加更多声音。` : '还没有读到系统声音；朗读时会使用系统默认声音。')
        .addDropdown(d=>{
          d.addOption('','自动（优先中文）');
          for(const voice of shown) d.addOption(voice.name,voice.name);
          if(s.speechVoice && !shown.some(v=>v.name===s.speechVoice)) d.addOption(s.speechVoice,`${s.speechVoice}（当前设备没有）`);
          d.setValue(s.speechVoice).onChange(value=>void speech.setVoice(value));
        });
    }
    new Setting(el).setName('语速').addDropdown(d=>{
      for(const rate of RATES) d.addOption(String(rate),`${rate}×`);
      d.setValue(String(s.speechRate)).onChange(value=>void speech.setRate(Number(value)));
    }).addButton(b=>b.setButtonText('试听').onClick(()=>void speech.preview()));
    new Setting(el).setName('朗读高亮颜色').setDesc('正在读的句子铺的底色，编辑模式和阅读模式一致。双击这句话可以暂停 / 继续。')
      .addDropdown(d=>{
        for(const [key,[label]] of Object.entries(HIGHLIGHTS)) d.addOption(key,label);
        d.setValue(s.speechHighlight).onChange(async value=>{s.speechHighlight=value;await p.saveSettings();});
      });
    new Setting(el).setName('记住每篇笔记读到的位置').setDesc('下次点耳机按钮时接着读；读完一篇后从头开始。')
      .addToggle(t=>t.setValue(s.speechRemember).onChange(async value=>{s.speechRemember=value;await p.saveData(s);}));
    const count=Object.keys(s.speechProgress).length;
    new Setting(el).setName('朗读位置记录').setDesc(`已记住 ${count} 篇笔记的位置。最多保留 200 篇、180 天，更旧的自动删除；笔记改名或删除时同步更新。`)
      .addButton(b=>b.setButtonText('清除记录').setDisabled(!count).onClick(async()=>{await speech.clearProgress();this.display();}));
  }
}

export default class TraderEditorTools extends Plugin {
  async onload() {
    this.settings=loadValidated(await this.loadData());
    this.cmViews=new Set(); this.documents=new Set();
    this.images=new ImageResizeManager(this);
    this.speech=new SpeechReader(this);
    this.bindDocument(this.app.workspace.containerEl.ownerDocument);
    this.app.workspace.iterateAllLeaves(leaf=>this.bindDocument(leaf.view.containerEl.ownerDocument));
    this.registerEvent(this.app.workspace.on('window-open',(_,window)=>this.bindDocument(window.document)));
    this.registerEvent(this.app.workspace.on('window-close',(_,window)=>{this.documents.delete(window.document);this.images.unbind(window.document);}));
    this.registerEvent(this.app.workspace.on('active-leaf-change',()=>this.images.close()));
    this.registerEvent(this.app.workspace.on('file-open',()=>{this.images.resolveId++;this.images.close();}));
    this.registerEditorExtension(layoutExtension(this));
    this.registerEditorExtension(textStyleExtension());
    this.registerEditorExtension(speechExtension());
    this.registerEditorExtension(blockDragExtension(this));
    this.app.workspace.onLayoutReady(()=>this.speech.attachAll());
    this.registerEvent(this.app.workspace.on('layout-change',()=>{this.speech.attachAll();this.speech.check();}));
    this.registerEvent(this.app.workspace.on('file-open',()=>this.speech.check()));
    this.registerEvent(this.app.vault.on('rename',(file,oldPath)=>this.speech.renameProgress(file,oldPath)));
    this.registerEvent(this.app.vault.on('delete',file=>this.speech.deleteProgress(file)));
    const listen=how=>checking=>{
      const view=this.app.workspace.getActiveViewOfType(MarkdownView);
      if(!view) return false;
      if(!checking) { if(how==='toggle') this.speech.toggleFor(view); else void this.speech.start(view,how); }
      return true;
    };
    this.addCommand({id:'read-aloud',name:'听书：朗读 / 暂停当前笔记',checkCallback:listen('toggle')});
    this.addCommand({id:'read-aloud-from-start',name:'听书：从头朗读当前笔记',checkCallback:listen('start')});
    this.addCommand({id:'read-aloud-diagnostics',name:'听书：显示诊断信息',callback:()=>new SpeechDiagnosticsModal(this).open()});
    this.addCommand({id:'read-aloud-stop',name:'听书：停止朗读',checkCallback:checking=>{ if(!this.speech.session) return false; if(!checking) this.speech.stop(); return true; }});
    this.registerMarkdownPostProcessor((el,ctx)=>this.images.annotate(el,ctx));
    this.registerMarkdownPostProcessor((el,ctx)=>decorateTabKnowledge(el,ctx,this.settings));
    this.registerMarkdownPostProcessor((el,ctx)=>decorateExtraBlankLines(el,ctx,this.settings));
    this.addSettingTab(new TraderSettings(this.app,this));
    this.addCommand({id:'format-note',name:'格式化当前笔记（预览 / 备份）',editorCallback:(editor,info)=>{
      if(!info.file) return new Notice('请先保存笔记');
      if(/\.excalidraw(?:\.md)?$/i.test(info.file.path) || /^excalidraw-plugin:/m.test(editor.getValue().slice(0,1000))) return new Notice('不格式化 Excalidraw 绘图文件，请在普通 Markdown 笔记中使用');
      new FormatPreviewModal(this,editor,info).open();
    }});
    this.addCommand({id:'set-image-size',name:'设置光标处图片尺寸',editorCallback:(editor,info)=>{
      try {
        const text=editor.getValue(),pos=editor.posToOffset(editor.getCursor());
        const tokens=this.imageTokens(text,info.file?.path || '').filter(t=>pos>=t.start && pos<=t.end);
        if(tokens.length!==1) throw new Error('请把光标放到图片的 Markdown 语法内部（可切换源码模式定位）');
        const token=tokens[0],resolved=this.app.metadataCache.getFirstLinkpathDest(cleanTarget(token.target),info.file.path);
        new SizeModal(this,{file:info.file,editor,info,text,token,resolvedPath:resolved?.path,notePath:info.file.path}).open();
      } catch(e) { notifyError(e); }
    }});
    const style=(kind,editor,info,value)=>{
      try {
        const snapshot=captureSelection(editor,info.file);
        snapshot.info=info;
        if(kind==='color'||kind==='highlight') {
          if(value) commitStyle(snapshot,kind,value); else new PaletteModal(this,snapshot,kind).open();
        } else commitStyle(snapshot,kind);
      } catch(e) { notifyError(e); }
    };
    for(const [kind,name] of [['color','设置文字颜色…'],['highlight','设置背景高亮…'],['underline','切换下划线'],['clear-color','清除文字颜色'],['clear-highlight','清除背景高亮'],['clear-underline','清除下划线'],['clear','清除全部插件文字样式（保留 Markdown）']]) {
      this.addCommand({id:'style-'+kind,name,editorCallback:(editor,info)=>style(kind,editor,info)});
    }
    for(let i=0;i<9;i++) for(const [kind,label] of [['color','文字颜色'],['highlight','背景高亮']]) {
      this.addCommand({id:`${kind}-slot-${i+1}`,name:`${label}：槽位 ${i+1}`,editorCallback:(editor,info)=>{
        const color=this.settings.colors[i];
        if(!color) return new Notice('此颜色槽位尚未设置');
        style(kind,editor,info,kind==='color'?color.text:color.background);
      }});
    }
    this.registerEvent(this.app.workspace.on('editor-menu',(menu,editor,info)=>{
      if(!editor.getSelection()) return;
      let snapshot; try { snapshot=captureSelection(editor,info.file);snapshot.info=info; } catch { return; }
      menu.addSeparator();
      for(const [kind,label,icon] of [['color','猛人编辑：文字颜色…','palette'],['highlight','猛人编辑：背景高亮…','highlighter'],['underline','猛人编辑：切换下划线','underline'],['clear-color','猛人编辑：清除文字颜色','eraser'],['clear-highlight','猛人编辑：清除背景高亮','eraser'],['clear-underline','猛人编辑：清除下划线','eraser'],['clear','猛人编辑：清除全部插件样式（保留 Markdown）','eraser']]) {
        menu.addItem(item=>item.setTitle(label).setIcon(icon).onClick(()=>{
          try { if(kind==='color'||kind==='highlight') new PaletteModal(this,snapshot,kind).open(); else commitStyle(snapshot,kind); } catch(e) { notifyError(e); }
        }));
      }
    }));
  }

  bindDocument(doc) { this.documents.add(doc);applyLayout(doc,this.settings);this.images.bind(doc); }
  async saveSettings() {
    await this.saveData(this.settings);
    for(const doc of this.documents) {applyLayout(doc,this.settings);refreshTabKnowledge(doc,this.settings);refreshExtraBlankLines(doc,this.settings);}
    for(const view of this.cmViews) view.dispatch({});
  }
  openSettings() {
    // The settings modal has no public API to open a tab; guarded internal call.
    try { this.app.setting.open(); this.app.setting.openTabById(this.manifest.id); } catch { new Notice('请在设置的第三方插件列表里打开本插件的设置，调整听书选项'); }
  }
  excalidrawAvailable() {
    // Excalidraw is an optional third-party plugin. This guarded registry probe
    // is the only dependency on Obsidian's non-public plugin registry.
    try { return !!this.app.plugins?.getPlugin?.('obsidian-excalidraw-plugin'); } catch { return false; }
  }
  imageTokens(text,notePath) {
    return scanImages(text).map(token=>{
      const file=this.app.metadataCache.getFirstLinkpathDest(cleanTarget(token.target),notePath);
      const fm=file ? this.app.metadataCache.getFileCache(file)?.frontmatter : null;
      if(fm && Object.prototype.hasOwnProperty.call(fm,'excalidraw-plugin')) token.isDrawing=true;
      return token;
    }).filter(token=>isImageTarget(token.target)||isExcalidraw(token));
  }
  async backup(file,text,reason) {
    if(!this.settings.backupEnabled || !file) return;
    const folder=normalizePath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/backups`);
    const adapter=this.app.vault.adapter;
    if(!(await adapter.exists(folder))) { try {await adapter.mkdir(folder);} catch(e) {if(!(await adapter.exists(folder))) throw e;} }
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const base=file.basename.replace(/[\\/:*?"<>|]/g,'_');
    const path=normalizePath(`${folder}/${base}-${stamp}-${reason}-${Math.random().toString(36).slice(2,7)}.md`);
    await adapter.write(path,text);
  }
  onunload() {
    this.images?.destroy();
    this.speech?.destroy();
    for(const doc of this.documents || []) {refreshTabKnowledge(doc,null);refreshExtraBlankLines(doc,null);doc.body.classList.remove('tet-enabled');doc.getElementById('tet-layout-vars')?.remove();}
    this.cmViews?.clear();
  }
}
