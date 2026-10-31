import { ViewPlugin } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { foldedRanges, foldEffect } from '@codemirror/language';
import { model, blockAt, dropTargets, moveBlock } from './blocks.mjs';

/* Drag-to-move blocks in the editor: hover a heading, paragraph, list item or
 * image to show a handle at its left; drag the handle to move the block (a
 * heading takes its whole section). One transaction, one undo step. Desktop
 * pointer only; touch keeps native selection. */

const HANDLE_GAP = 24, HEADING_GAP = 40, EDGE = 48;

/** Smallest single change turning `a` into `b`, so undo and decorations only
 * see the moved region. */
function diff(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

function blockDragExtension(plugin) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view; this.hover = null; this.drag = null; this.cache = null;
      const doc = view.dom.ownerDocument;
      this.handle = view.dom.appendChild(doc.createElement('div'));
      this.handle.className = 'tet-drag-handle';
      this.handle.setAttribute('aria-label', '拖动移动这一块');
      // Six dots drawn in CSS: no <svg>/<img> that image tools could mistake for content.
      this.handle.appendChild(doc.createElement('span')).className = 'tet-drag-dots';
      this.handle.hidden = true;
      this.onMove = e => this.move(e);
      this.onLeave = e => { if (!this.drag && !this.handle.contains(e.relatedTarget)) this.hide(); };
      this.onDown = e => this.start(e);
      this.onScroll = () => { if (!this.drag) this.hide(); };
      view.dom.addEventListener('pointermove', this.onMove);
      view.dom.addEventListener('pointerleave', this.onLeave);
      view.scrollDOM.addEventListener('scroll', this.onScroll);
      this.handle.addEventListener('pointerdown', this.onDown);
    }
    update(update) {
      if (update.docChanged) { this.cache = null; if (!this.drag) this.hide(); return; }
      // Layout moved (window resized, an image loaded): keep the handle on its block.
      if ((update.geometryChanged || update.viewportChanged) && this.hover && !this.drag && !this.handle.hidden) {
        const block = this.hover;
        this.view.requestMeasure({ read: () => this.place(block, true), write: style => { if (style && this.hover === block) Object.assign(this.handle.style, style); } });
      }
    }
    destroy() {
      this.cancel();
      this.view.dom.removeEventListener('pointermove', this.onMove);
      this.view.dom.removeEventListener('pointerleave', this.onLeave);
      this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
      this.handle.remove();
    }
    enabled() {
      return plugin.settings.blockDrag && !this.view.state.facet(EditorState.readOnly);
    }
    model() {
      const text = this.view.state.doc.toString();
      if (!this.cache || this.cache.text !== text) this.cache = { text, m: model(text) };
      return this.cache;
    }
    hide() { this.handle.hidden = true; this.hover = null; }

    /** Viewport rectangle of a source line's first visual row and its text start. */
    row(lineIndex) {
      const view = this.view, doc = view.state.doc;
      if (lineIndex >= doc.lines) {
        const last = view.lineBlockAt(doc.length);
        const y = view.documentTop + last.bottom;
        return { top: y, bottom: y, left: view.contentDOM.getBoundingClientRect().left };
      }
      const line = doc.line(lineIndex + 1);
      const lead = line.text.match(/^[ \t]*/)[0].length;
      const block = view.lineBlockAt(line.from);
      const at = view.coordsAtPos(line.from + lead, 1);
      const top = view.documentTop + block.top;
      if (at && at.top >= top - 1 && at.bottom <= view.documentTop + block.bottom + 1) return { top: at.top, bottom: at.bottom, left: at.left, blockTop: top };
      return { top, bottom: Math.min(top + 24, view.documentTop + block.bottom), left: view.contentDOM.getBoundingClientRect().left + 6, blockTop: top };
    }

    move(e) {
      if (this.drag) return this.dragTo(e);
      if (e.pointerType !== 'mouse' || e.buttons || !this.enabled()) return this.hide();
      if (this.handle.contains(e.target)) return;
      const view = this.view;
      // By height only: a folded heading or an image widget is one row, and
      // the pointer may be right of the text or over the handle column.
      const row = view.lineBlockAtHeight(e.clientY - view.documentTop);
      const { text, m } = this.model();
      const line = view.state.doc.lineAt(row.from).number - 1;
      const block = blockAt(text, line, m);
      if (!block) return this.hide();
      // Pointer over a child line of a list item: offer the item it belongs to.
      if (this.hover && this.hover.from === block.from && this.hover.to === block.to && !this.handle.hidden) return;
      this.place(block);
      this.handle.dataset.kind = block.kind;
      this.handle.hidden = false;
      this.hover = block;
    }

    /** Handle position beside the block's first row; `read` only measures. */
    place(block, read = false) {
      const r = this.row(block.from), box = this.view.dom.getBoundingClientRect();
      // Headings and list items have Obsidian's fold arrow at their left: stay clear of it.
      const gap = block.kind === 'heading' || block.kind === 'list' ? HEADING_GAP : HANDLE_GAP;
      const style = { top: `${(r.top + r.bottom) / 2 - 11 - box.top}px`, left: `${r.left - gap - box.left}px` };
      if (!read) Object.assign(this.handle.style, style);
      return style;
    }

    start(e) {
      if (e.button !== 0 || !this.hover || !this.enabled()) return;
      e.preventDefault(); e.stopPropagation();
      const view = this.view, { text, m } = this.model(), block = this.hover;
      // Positions hidden inside a folded section cannot be seen or aimed at.
      const folds = foldedRanges(view.state), hidden = line => {
        if (line >= view.state.doc.lines) return false;
        const at = view.state.doc.line(line + 1).from;
        let inside = false;
        folds.between(at, at, (from, to) => { if (from < at && to >= at) inside = true; });
        return inside;
      };
      const targets = dropTargets(text, block, m).filter(t => !hidden(t.line));
      if (!targets.length) return;
      const doc = view.dom.ownerDocument;
      // Remember a folded heading so the moved section stays folded.
      let folded = false;
      if (block.kind === 'heading') {
        const end = view.state.doc.line(block.from + 1).to;
        foldedRanges(view.state).between(end, end + 1, (from) => { if (from === end) folded = true; });
      }
      const shade = view.dom.appendChild(doc.createElement('div'));
      shade.className = 'tet-drag-source';
      const indicator = view.dom.appendChild(doc.createElement('div'));
      indicator.className = 'tet-drop-indicator'; indicator.hidden = true;
      this.drag = { block, text, targets, folded, shade, indicator, target: null, pointer: e.pointerId, x: e.clientX, y: e.clientY, frame: 0 };
      try { this.handle.setPointerCapture(e.pointerId); } catch { /* the pointer already left */ }
      this.handle.classList.add('is-dragging');
      doc.body.classList.add('tet-block-dragging');
      this.onUp = ev => this.finish(ev);
      this.onKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); this.cancel(); } };
      this.handle.addEventListener('pointerup', this.onUp);
      this.handle.addEventListener('pointercancel', this.onUp);
      doc.addEventListener('keydown', this.onKey, true);
      this.paint();
      this.autoscroll();
    }

    /** Shade the lines being moved. */
    paint() {
      const d = this.drag, view = this.view, box = view.dom.getBoundingClientRect(), content = view.contentDOM.getBoundingClientRect();
      const doc = view.state.doc;
      const top = view.documentTop + view.lineBlockAt(doc.line(d.block.from + 1).from).top;
      const bottom = view.documentTop + view.lineBlockAt(doc.line(d.block.to + 1).from).bottom;
      Object.assign(d.shade.style, { top: `${top - box.top}px`, height: `${Math.max(4, bottom - top)}px`, left: `${content.left - box.left}px`, width: `${content.width}px` });
    }

    dragTo(e) {
      const d = this.drag;
      if (e.pointerId !== d.pointer) return;
      d.x = e.clientX; d.y = e.clientY;
      this.pick();
    }

    /** Nearest drop position to the pointer; at one line, list levels are
     * chosen by horizontal position. */
    pick() {
      const d = this.drag, view = this.view, box = view.dom.getBoundingClientRect(), content = view.contentDOM.getBoundingClientRect();
      let best = null;
      for (const t of d.targets) {
        const r = this.row(t.line);
        const y = t.line >= view.state.doc.lines ? r.top : (r.blockTop ?? r.top);
        const x = t.ref !== undefined && t.ref !== null ? this.row(t.ref).left : content.left + 6;
        const score = Math.abs(d.y - y) * 4 + Math.abs(d.x - (x + 24)) / 8;
        if (!best || score < best.score) best = { t, x, y, score };
      }
      d.target = best?.t || null;
      if (!best) { d.indicator.hidden = true; return; }
      Object.assign(d.indicator.style, { top: `${best.y - box.top - 1}px`, left: `${best.x - box.left}px`, width: `${Math.max(40, content.right - best.x)}px` });
      d.indicator.hidden = false;
      this.paint();
    }

    /** Scroll while the pointer is held near the top or bottom edge. */
    autoscroll() {
      const d = this.drag;
      if (!d) return;
      const win = this.view.dom.ownerDocument.defaultView, scroller = this.view.scrollDOM, r = scroller.getBoundingClientRect();
      const step = d.y < r.top + EDGE ? -Math.ceil((r.top + EDGE - d.y) / 4) : d.y > r.bottom - EDGE ? Math.ceil((d.y - r.bottom + EDGE) / 4) : 0;
      if (step) { scroller.scrollTop += step; this.pick(); }
      d.frame = win.requestAnimationFrame(() => this.autoscroll());
    }

    finish(e) {
      const d = this.drag;
      if (!d || (e && e.pointerId !== d.pointer)) return;
      const target = e?.type === 'pointerup' ? d.target : null;
      this.cancel();
      if (!target) return;
      const view = this.view, current = view.state.doc.toString();
      if (current !== d.text) return;
      const result = moveBlock(current, d.block, target);
      if (!result) return;
      const change = diff(current, result.text);
      view.dispatch({ changes: change, userEvent: 'move.drop', scrollIntoView: false });
      const doc = view.state.doc, first = doc.line(Math.min(doc.lines, result.line + 1));
      const effects = [];
      if (d.folded && result.lines > 1) {
        const last = doc.line(Math.min(doc.lines, result.line + result.lines));
        if (last.to > first.to) effects.push(foldEffect.of({ from: first.to, to: last.to }));
      }
      view.dispatch({ selection: { anchor: first.from }, effects });
      view.focus();
    }

    cancel() {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      const doc = this.view.dom.ownerDocument;
      doc.defaultView?.cancelAnimationFrame(d.frame);
      d.shade.remove(); d.indicator.remove();
      this.handle.classList.remove('is-dragging');
      doc.body.classList.remove('tet-block-dragging');
      this.handle.removeEventListener('pointerup', this.onUp);
      this.handle.removeEventListener('pointercancel', this.onUp);
      doc.removeEventListener('keydown', this.onKey, true);
      try { this.handle.releasePointerCapture(d.pointer); } catch { /* already released */ }
      this.hide();
    }
  });
}

export { blockDragExtension, diff };
