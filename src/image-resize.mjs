import { Notice, MarkdownView, editorInfoField } from 'obsidian';
import { resizedToken, sameDocumentPatch, dragSize, isExcalidraw, isImageTarget, tableCellRange } from './markdown.mjs';

function cleanTarget(value) {
  try { value = decodeURIComponent(value); } catch { /* not URI-encoded: keep the raw target */ }
  return value.replace(/\\([ ()])/g,'$1').replace(/\\?\|.*$/,'').replace(/^<|>$/g,'').split('#')[0].replace(/^\.\//,'');
}

function imageElement(target) {
  if (!target?.closest || target.closest('.tet-resize-overlay, .tet-modal')) return null;
  const embed = target.closest('.excalidraw-embedded-img[filesource]') || target.closest('.internal-embed') || target.closest('.excalidraw-embedded-img') || target.closest('.excalidraw-svg');
  if (embed && /\.excalidraw(?:\.md)?(?:#|$)/i.test(embed.getAttribute('src') || embed.getAttribute('data-src') || embed.getAttribute('filesource') || '')) {
    return { element: embed.querySelector('img,svg') || embed, embed };
  }
  // Obsidian 1.13 gives the wrapper the mouse hit (images can have
  // pointer-events:none). Resolve its child instead of requiring target=IMG.
  if(embed && (embed.classList.contains('image-embed') || isImageTarget(embed.getAttribute('src') || ''))) {
    const child=embed.querySelector('img');
    if(child) return {element:child,embed};
  }
  const image = target.closest('img');
  if (image && image.closest('.markdown-source-view, .markdown-preview-view, .markdown-rendered')) return { element:image, embed:embed || image };
  // Excalidraw may put the filename only on the outer internal-embed.
  const svg = target.closest('.excalidraw-svg svg, svg.excalidraw-svg');
  return svg ? { element:svg, embed:embed || svg } : null;
}

class ImageResizeManager {
  constructor(plugin) {
    this.plugin = plugin;
    this.contexts = new WeakMap();
    this.bindings = new Map();
    this.session = null;
    this.resolveId = 0;
  }

  bind(doc) {
    if (this.bindings.has(doc)) return;
    const pointer = e => this.onSelect(e);
    const click = e => {
      if (this.blockClick && imageElement(e.target)) { e.preventDefault(); e.stopPropagation(); this.blockClick = false; }
    };
    const key = e => { if (e.key === 'Escape') { this.resolveId++; this.close(); } };
    const scroll = () => { if (this.session && !this.session.dragging) this.position(); };
    doc.addEventListener('pointerdown',pointer,true);
    doc.addEventListener('click',click,true);
    doc.addEventListener('keydown',key,true);
    doc.addEventListener('scroll',scroll,true);
    // Keep the window itself: once a popout closes, doc.defaultView is null.
    const win = doc.defaultView;
    win?.addEventListener('resize',scroll);
    this.bindings.set(doc,()=>{
      doc.removeEventListener('pointerdown',pointer,true); doc.removeEventListener('click',click,true);
      doc.removeEventListener('keydown',key,true); doc.removeEventListener('scroll',scroll,true);
      win?.removeEventListener('resize',scroll);
    });
  }

  unbind(doc) { this.bindings.get(doc)?.(); this.bindings.delete(doc); }

  annotate(el,ctx) { this.contexts.set(el,ctx); }

  contextFor(element) {
    for (let node = element; node; node = node.parentElement) {
      if (this.contexts.has(node)) return { ctx:this.contexts.get(node), root:node };
    }
    return null;
  }

  findEditorView(element) {
    for (const view of this.plugin.cmViews) if (view.dom.contains(element)) return view;
    return null;
  }

  async locate(hit) {
    const cm = this.findEditorView(hit.element);
    const ctxInfo = this.contextFor(hit.element);
    let info = cm?.state.field(editorInfoField,false);
    if (!info?.file && !ctxInfo) {
      this.plugin.app.workspace.iterateAllLeaves(leaf=>{
        if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(hit.element)) info = leaf.view;
      });
    }
    const sourcePath = ctxInfo?.ctx.sourcePath || info?.file?.path;
    const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath || '');
    if (!file || file.extension !== 'md') throw new Error('没有找到图片所在的 Markdown 笔记');
    const editor = cm ? info?.editor : null;
    const text = editor ? editor.getValue() : await this.plugin.app.vault.read(file);
    const tokens = this.plugin.imageTokens(text,file.path);
    let candidates = tokens;
    const tableNode=hit.element.closest('table');
    const tableCell=hit.element.closest('td,th');
    if (cm) {
      let pos;
      try { pos = cm.posAtDOM(hit.embed); } catch { try { pos = cm.posAtDOM(hit.element); } catch { /* neither node belongs to this editor */ } }
      if (Number.isInteger(pos)) {
        const line = cm.state.doc.lineAt(pos);
        const local = tokens.filter(t=>t.start >= line.from && t.start <= line.to);
        const covering = local.filter(t=>pos >= t.start && pos <= t.end);
        candidates = covering.length ? covering : local.length ? local : tokens;
      }
      if(tableNode && tableCell) {
        let tableAnchor;
        try{tableAnchor=cm.posAtDOM(tableNode);}catch{/* table widget is outside this editor */}
        const cellRange=Number.isInteger(tableAnchor) ? tableCellRange(text,tableAnchor,tableCell.parentElement.rowIndex,tableCell.cellIndex) : null;
        if(cellRange && cellRange.count===tableCell.parentElement.cells.length) {
          candidates=tokens.filter(t=>t.start>=cellRange.from && t.end<=cellRange.to);
        } else throw new Error('表格行列与源码尚未同步，未写回；请重新点击图片');
      }
    } else if (ctxInfo) {
      const section = ctxInfo.ctx.getSectionInfo(ctxInfo.root);
      if (section) candidates = tokens.filter(t=>t.line >= section.lineStart && t.line <= section.lineEnd);
    }
    const targetAttr = hit.embed.getAttribute('src') || hit.embed.getAttribute('data-src') || hit.embed.getAttribute('data-href') || hit.embed.getAttribute('filesource');
    const source = hit.element.getAttribute('src') || hit.element.getAttribute('href') || '';
    const alt = hit.element.getAttribute('alt') || '';
    const matches = candidates.filter(t=>{
      const cleaned = cleanTarget(t.target);
      const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(cleaned,file.path);
      if (targetAttr && cleanTarget(targetAttr) === cleaned) return true;
      if (resolved && cleanTarget(targetAttr || '') === resolved.path) return true;
      if (source && (cleanTarget(source) === cleaned || (resolved && cleanTarget(source).includes(resolved.path)))) return true;
      if (alt && [cleaned, cleaned.split('/').at(-1), t.alt.replace(/\\?\|\d+(?:x\d+)?$/,'')].includes(alt)) return true;
      return false;
    });
    if (!matches.length) throw new Error('图片与源码链接不匹配，未写回；请使用“设置光标处图片尺寸”命令');
    candidates = matches;
    if (candidates.length > 1) {
      // Same image repeated in one table/line: use rendered DOM order only if
      // the entire source section and DOM have exactly matching cardinality.
      const root = (cm && tableCell) ? tableCell : ctxInfo?.root || hit.element.closest('.cm-line, .cm-embed-block, .markdown-preview-section');
      if (root) {
        const nodes = [...root.querySelectorAll('img, .excalidraw-svg svg, svg.excalidraw-svg')].filter(n=>!n.closest('.tet-resize-overlay'));
        const matchingNodes = nodes.filter(n=>{
          const parent = n.closest('.excalidraw-embedded-img[filesource],.internal-embed');
          const parentTarget=parent?.getAttribute('src') || parent?.getAttribute('filesource');
          return (targetAttr && parentTarget === targetAttr) || (!!source && n.getAttribute('src') === source);
        });
        const index = matchingNodes.indexOf(hit.element);
        if (index >= 0 && matchingNodes.length === candidates.length) candidates = [candidates[index]];
      }
    }
    if (candidates.length !== 1) throw new Error('无法唯一定位这张图片；请将光标放到对应图片语法内，使用“设置图片尺寸”命令');
    const token = candidates[0];
    const resolved = this.plugin.app.metadataCache.getFirstLinkpathDest(cleanTarget(token.target),file.path);
    return { file, editor, info, text, token, resolvedPath:resolved?.path, notePath:file.path };
  }

  async onSelect(event) {
    if (!this.plugin.settings.imageResize || event.button !== 0) return;
    if (event.target.closest?.('.tet-resize-overlay')) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return; // native open/edit gestures
    const hit = imageElement(event.target);
    const id = ++this.resolveId;
    if (!hit) { this.close(); return; }
    if (!this.findEditorView(hit.element) && !this.plugin.settings.readingResize) return;
    event.preventDefault(); event.stopPropagation(); this.blockClick = true;
    this.close();
    try {
      const source = await this.locate(hit);
      if (id !== this.resolveId || !hit.element.isConnected) return;
      if (isExcalidraw(source.token) && !this.plugin.excalidrawAvailable()) throw new Error('请启用 Excalidraw 插件后缩放绘图嵌入');
      this.show(hit,source);
    } catch (error) { if (id === this.resolveId) new Notice(error.message); }
  }

  show(hit,source) {
    const doc = hit.element.ownerDocument;
    const box = doc.createElement('div'); box.className = 'tet-resize-overlay';
    box.setAttribute('role','group'); box.setAttribute('aria-label','图片缩放：拖动四角，Alt 自由宽高，Esc 取消');
    const label = doc.createElement('div'); label.className = 'tet-resize-label'; box.appendChild(label);
    this.session = { ...hit, source, box, label, dragging:false, cleanup:null };
    for (const corner of ['nw','ne','sw','se']) {
      const handle = doc.createElement('button'); handle.className = `tet-resize-handle tet-${corner}`;
      handle.setAttribute('aria-label',`拖动 ${corner} 缩放图片`); handle.title = '拖动保持比例；按 Alt 自由调整宽高';
      handle.addEventListener('pointerdown',event=>this.startDrag(event,corner)); box.appendChild(handle);
    }
    doc.body.appendChild(box);
    this.position();
  }

  position(rect = null) {
    const s = this.session;
    if (!s) return;
    if (!s.element.isConnected) { this.close(); return; }
    const r = rect || s.element.getBoundingClientRect();
    Object.assign(s.box.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
    s.label.textContent = `${Math.round(r.width)} × ${Math.round(r.height)} · Alt 自由缩放`;
  }

  startDrag(event,corner) {
    const s = this.session;
    if (!s) return;
    event.preventDefault(); event.stopPropagation();
    const initial = s.element.getBoundingClientRect(), doc = s.element.ownerDocument;
    const x = event.clientX, y = event.clientY;
    s.dragging = true; s.box.classList.add('tet-dragging');
    let dimensions = {width:initial.width,height:initial.height}, moved = false, free = false;
    const move = e => {
      if (e.pointerId !== event.pointerId) return;
      moved = moved || Math.abs(e.clientX-x)+Math.abs(e.clientY-y) > 3;
      free = e.altKey || this.plugin.settings.freeResize;
      dimensions = dragSize(initial,e.clientX-x,e.clientY-y,corner,free,this.plugin.settings.maxImageWidth);
      this.position({left:corner.includes('w') ? initial.right-dimensions.width : initial.left,
        top:corner.includes('n') ? initial.bottom-dimensions.height : initial.top, ...dimensions});
    };
    const win = doc.defaultView;
    const cleanup = () => {
      doc.removeEventListener('pointermove',move,true); doc.removeEventListener('pointerup',end,true);
      doc.removeEventListener('pointercancel',cancel,true); win?.removeEventListener('blur',cancel);
      s.cleanup = null; s.dragging = false;
    };
    const cancel = () => { cleanup(); this.close(); };
    const end = async e => {
      if (e.pointerId !== event.pointerId) return;
      cleanup(); this.close();
      if (!moved) return;
      try { await this.commit(s.source,dimensions.width,free ? dimensions.height : null); }
      catch (error) { new Notice(error.message,6000); }
    };
    s.cleanup = cleanup;
    doc.addEventListener('pointermove',move,true); doc.addEventListener('pointerup',end,true);
    doc.addEventListener('pointercancel',cancel,true); win?.addEventListener('blur',cancel);
  }

  async commit(source,width,height) {
    const {file,editor,text,token} = source;
    const replacement = resizedToken(token,width,height,source);
    sameDocumentPatch(text,token,replacement); // validate table separators before mutation
    if (editor) {
      if (editor.getValue() !== text || (source.info && source.info.file?.path !== file.path)) throw new Error('拖动期间笔记已变化，已取消写回；请重新点击图片');
      editor.transaction({changes:[{from:editor.offsetToPos(token.start),to:editor.offsetToPos(token.end),text:replacement}]});
    } else {
      // Avoid writing behind a dirty editor in another pane.
      let openEditor;
      this.plugin.app.workspace.iterateAllLeaves(leaf=>{
        if (leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path && leaf.view.getMode() === 'source') openEditor = leaf.view.editor;
      });
      if (openEditor) {
        if (openEditor.getValue() !== text) throw new Error('另一编辑窗格有未同步更改，已取消写回');
        openEditor.transaction({changes:[{from:openEditor.offsetToPos(token.start),to:openEditor.offsetToPos(token.end),text:replacement}]});
      } else {
        await this.plugin.backup(file,text,'image');
        await this.plugin.app.vault.process(file,current=>{
          if (current !== text) throw new Error('笔记已变化，已取消写回；请重新点击图片');
          return sameDocumentPatch(current,token,replacement);
        });
      }
    }
    new Notice(`图片尺寸已保存：${Math.round(width)}${height === null ? ' px（保持比例）' : ' × '+Math.round(height)+' px'}`);
  }

  close() {
    const s = this.session; this.session = null;
    if (s) { s.cleanup?.(); s.box.remove(); }
  }
  destroy() { this.resolveId++; this.close(); for (const cleanup of this.bindings.values()) cleanup(); this.bindings.clear(); }
}
export { ImageResizeManager, imageElement, cleanTarget };
