const {StateField}=require('@codemirror/state');
const editorInfoField=StateField.define({create:()=>null,update:value=>value});
const notices=[];
class Notice {constructor(message){notices.push(message);}}
class Plugin {
  constructor(app,manifest){this.app=app;this.manifest=manifest;this.commands=new Map();this.ext=[];this.post=[];this.cleanup=[];}
  async loadData(){return null;}
  async saveData(data){this.saved=data;}
  registerEvent(){}
  register(fn){this.cleanup.push(fn);}
  registerEditorExtension(ext){this.ext.push(ext);}
  registerMarkdownPostProcessor(fn){this.post.push(fn);}
  addCommand(command){this.commands.set(command.id,command);}
  addSettingTab(tab){this.tab=tab;}
}
class PluginSettingTab {constructor(app,plugin){this.app=app;this.plugin=plugin;this.containerEl=document.createElement('div');}}
class MarkdownView {}
class Modal {
  constructor(app){this.app=app;this.modalEl=document.createElement('div');this.modalEl.className='modal';this.titleEl=document.createElement('div');this.titleEl.className='modal-title';this.contentEl=document.createElement('div');this.modalEl.append(this.titleEl,this.contentEl);}
  open(){document.body.appendChild(this.modalEl);this.onOpen();}
  close(){this.onClose?.();this.modalEl.remove();}
}
class Setting {
  constructor(el){this.settingEl=el.createDiv({cls:'setting-item'});this.info=this.settingEl.createDiv();this.controlEl=this.settingEl.createDiv();}
  setName(name){this.info.createDiv({text:name});return this;}
  setDesc(desc){this.info.createDiv({text:desc,cls:'tet-muted'});return this;}
  setHeading(){this.settingEl.classList.add('setting-item-heading');return this;}
  setDisabled(disabled){this.settingEl.classList.toggle('is-disabled',disabled);for(const input of this.controlEl.querySelectorAll('input,button,select'))input.disabled=disabled;return this;}
  make(tag,type){const inputEl=document.createElement(tag);if(type)inputEl.type=type;this.controlEl.appendChild(inputEl);const c={inputEl};for(const method of ['setValue','setButtonText','setTooltip','setIcon','setPlaceholder','setLimits','setDynamicTooltip','setCta','setWarning','setDisabled']) c[method]=(...args)=>{
    if(method==='setValue'){inputEl.value=String(args[0]);if(type==='checkbox')inputEl.checked=args[0];}
    if(method==='setButtonText')inputEl.textContent=args[0];
    if(method==='setDisabled')inputEl.disabled=args[0];
    if(method==='setLimits'){inputEl.min=args[0];inputEl.max=args[1];inputEl.step=args[2];}
    return c;
  };
  c.onClick=fn=>{inputEl.addEventListener('click',fn);return c;};
  c.onChange=fn=>{inputEl.addEventListener(type==='checkbox'?'change':'input',()=>fn(type==='checkbox'?inputEl.checked:type==='range'?Number(inputEl.value):inputEl.value));return c;};return c;}
  addButton(fn){fn(this.make('button'));return this;}
  addExtraButton(fn){fn(this.make('button'));return this;}
  addText(fn){fn(this.make('input','text'));return this;}
  addColorPicker(fn){const c=this.make('input','color');c.colorPickerEl=c.inputEl;delete c.inputEl;fn(c);return this;}
  addToggle(fn){fn(this.make('input','checkbox'));return this;}
  addSlider(fn){fn(this.make('input','range'));return this;}
}
const normalizePath=p=>p.replace(/\\/g,'/').replace(/\/{2,}/g,'/');
module.exports={Plugin,PluginSettingTab,Setting,Modal,Notice,MarkdownView,editorInfoField,normalizePath,notices};
