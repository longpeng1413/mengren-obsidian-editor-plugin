import { ViewPlugin } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { semanticStyleRanges } from './text-style.mjs';
const classes=['tet-native-strong','tet-native-em','tet-native-del','tet-native-del-underline'];
function textStyleExtension() {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view=view;this.source=null;this.ranges=[];this.alive=true;
      const win=view.dom.ownerDocument.defaultView;
      this.observer=new win.MutationObserver(()=>this.schedule());
      this.observer.observe(view.dom,{childList:true,subtree:true});
      this.schedule();
    }
    update(update){if(update.docChanged||update.viewportChanged||update.transactions.length)this.schedule();}
    schedule() {
      if(!this.alive||this.pending)return;
      this.pending=true;
      this.view.requestMeasure({key:this,read:()=>this.read(),write:result=>{this.pending=false;if(this.alive)for(const {node,flags} of result){for(const cls of classes)node.classList.remove(cls);if(flags?.strong)node.classList.add(classes[0]);if(flags?.em)node.classList.add(classes[1]);if(flags?.del)node.classList.add(node.style.textDecoration.includes('underline')?classes[3]:classes[2]);}}});
    }
    read() {
      const view=this.view,info=view.state.field(editorInfoField,false);
      const sourceMode=info?.getMode?.()==='source'&&info?.getState?.()?.source===true;
      const text=view.state.doc.toString();
      if(text!==this.source){this.source=text;this.ranges=semanticStyleRanges(text);}
      return [...view.dom.querySelectorAll('.cm-html-embed span[data-mengren-style="1"]')].map(node=>{
        let position;try{position=view.posAtDOM(node.closest('.cm-html-embed'));}catch{/* widget left the editor while measuring */}
        const flags=!sourceMode&&Number.isInteger(position)?this.ranges.find(r=>position>=r.from&&position<r.to):null;
        return {node,flags};
      });
    }
    destroy() {this.alive=false;this.observer.disconnect();for(const node of this.view.dom.querySelectorAll('[data-mengren-style]'))for(const cls of classes)node.classList.remove(cls);}
  });
}
export { textStyleExtension };
