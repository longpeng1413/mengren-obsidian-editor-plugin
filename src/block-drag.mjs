import { ViewPlugin } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { foldedRanges, foldEffect } from '@codemirror/language';
import { model, blockAt, dropTargets, moveBlock } from './blocks.mjs';

/* Drag-to-move blocks in the editor. With a mouse, hovering a block shows a
 * handle at its left; drag the handle. On a touch screen, long-press a block
 * while not typing: it lifts, follows the finger and drops where the line
 * shows. A heading takes its whole section. One transaction, one undo step. */

const HANDLE_GAP = 24, WIDE_GAP = 40, EDGE = 48;
// Under Android's own long-press time, so the block lifts before text selection starts.
const LONG_PRESS = 300, SLOP = 10;

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
      this.view = view; this.hover = null; this.drag = null; this.press = null; this.cache = null;
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
      this.onTouchStart = e => this.touchStart(e);
      this.onTouchMove = e => this.touchMove(e);
      this.onTouchEnd = e => this.touchEnd(e);
      // While a block is lifted the long press must not select text or open a menu.
      this.onBlock = e => { if (this.touching()) e.preventDefault(); };
      view.dom.addEventListener('pointermove', this.onMove);
      view.dom.addEventListener('pointerleave', this.onLeave);
      view.scrollDOM.addEventListener('scroll', this.onScroll);
      this.handle.addEventListener('pointerdown', this.onDown);
      view.dom.addEventListener('touchstart', this.onTouchStart, { passive: true });
      view.dom.addEventListener('touchmove', this.onTouchMove, { passive: false });
      view.dom.addEventListener('touchend', this.onTouchEnd, { passive: false });
      view.dom.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
      doc.addEventListener('contextmenu', this.onBlock, true);
      doc.addEventListener('selectstart', this.onBlock, true);
    }
    update(update) {
      if (update.docChanged) { this.cache = null; this.clearPress(); if (!this.drag) this.hide(); return; }
      // Layout moved (window resized, an image loaded): keep the handle on its block.
      if ((update.geometryChanged || update.viewportChanged) && this.hover && !this.drag && !this.handle.hidden) {
        const block = this.hover;
        this.view.requestMeasure({ read: () => this.place(block, true), write: style => { if (style && this.hover === block) Object.assign(this.handle.style, style); } });
      }
    }
    destroy() {
      this.cancel(); this.clearPress();
      const view = this.view, doc = view.dom.ownerDocument;
      view.dom.removeEventListener('pointermove', this.onMove);
      view.dom.removeEventListener('pointerleave', this.onLeave);
      view.scrollDOM.removeEventListener('scroll', this.onScroll);
      view.dom.removeEventListener('touchstart', this.onTouchStart);
      view.dom.removeEventListener('touchmove', this.onTouchMove);
      view.dom.removeEventListener('touchend', this.onTouchEnd);
      view.dom.removeEventListener('touchcancel', this.onTouchEnd);
      doc.removeEventListener('contextmenu', this.onBlock, true);
      doc.removeEventListener('selectstart', this.onBlock, true);
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
    /** A block lifted by a finger (touch identifiers start at 0). */
    touching() { return !!this.drag && this.drag.touch !== undefined; }

    /** Block under a viewport y. By height only: a folded heading or an image,
     * table or Callout widget is one row, and x may be outside the text. */
    blockAtY(y) {
      const view = this.view, row = view.lineBlockAtHeight(y - view.documentTop);
      const { text, m } = this.model();
      return blockAt(text, view.state.doc.lineAt(row.from).number - 1, m);
    }

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
      if (this.drag) return this.touching() ? undefined : this.dragTo(e.clientX, e.clientY, e.pointerId);
      if (e.pointerType !== 'mouse' || e.buttons || !this.enabled()) return this.hide();
      if (this.handle.contains(e.target)) return;
      const block = this.blockAtY(e.clientY);
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
      // Headings and list items have Obsidian's fold arrow at their left, tables
      // their row handles: stay clear of them.
      const gap = /^(heading|list|table)$/.test(block.kind) ? WIDE_GAP : HANDLE_GAP;
      // Tab rows are drawn as a box from the line start: put the handle outside it.
      if (block.kind === 'tab') {
        const start = this.view.coordsAtPos(this.view.state.doc.line(block.from + 1).from, 1);
        if (start) r.left = Math.min(r.left, start.left);
      }
      const style = { top: `${(r.top + r.bottom) / 2 - 11 - box.top}px`, left: `${r.left - gap - box.left}px` };
      if (!read) Object.assign(this.handle.style, style);
      return style;
    }

    start(e) {
      if (e.button !== 0 || !this.hover || !this.enabled()) return;
      e.preventDefault(); e.stopPropagation();
      if (!this.begin(this.hover, e.clientX, e.clientY, { pointer: e.pointerId })) return;
      try { this.handle.setPointerCapture(e.pointerId); } catch { /* the pointer already left */ }
      this.handle.classList.add('is-dragging');
      this.onUp = ev => { if (ev.pointerId === this.drag?.pointer) this.finish(ev.type === 'pointerup'); };
      this.handle.addEventListener('pointerup', this.onUp);
      this.handle.addEventListener('pointercancel', this.onUp);
    }

    /** Start moving `block` from viewport point (x, y). */
    begin(block, x, y, extra) {
      const view = this.view, { text, m } = this.model();
      // Positions hidden inside a folded section cannot be seen or aimed at.
      const folds = foldedRanges(view.state), hidden = line => {
        if (line >= view.state.doc.lines) return false;
        const at = view.state.doc.line(line + 1).from;
        let inside = false;
        folds.between(at, at, (from, to) => { if (from < at && to >= at) inside = true; });
        return inside;
      };
      const targets = dropTargets(text, block, m).filter(t => !hidden(t.line));
      if (!targets.length) return false;
      const doc = view.dom.ownerDocument;
      // Remember a folded heading so the moved section stays folded.
      let folded = false;
      if (block.kind === 'heading') {
        const end = view.state.doc.line(block.from + 1).to;
        folds.between(end, end + 1, from => { if (from === end) folded = true; });
      }
      const shade = view.dom.appendChild(doc.createElement('div'));
      shade.className = 'tet-drag-source';
      const indicator = view.dom.appendChild(doc.createElement('div'));
      indicator.className = 'tet-drop-indicator'; indicator.hidden = true;
      this.drag = { block, text, targets, folded, shade, indicator, target: null, x, y, frame: 0, ...extra };
      doc.body.classList.add('tet-block-dragging');
      this.onKey = ev => { if (ev.key === 'Escape') { ev.preventDefault(); this.cancel(); } };
      doc.addEventListener('keydown', this.onKey, true);
      this.paint();
      this.autoscroll();
      return true;
    }

    /** Touch: a long press on a block lifts it (while typing too, unless the
     * setting keeps long press for text selection). */
    touchStart(e) {
      this.clearPress();
      if (this.drag || e.touches.length !== 1 || !this.enabled()) return;
      // Optional: while typing, a long press keeps selecting text.
      if (this.view.hasFocus && plugin.settings.touchSelectWhileTyping) return;
      const t = e.touches[0], block = this.blockAtY(t.clientY);
      if (!block) return;
      const win = this.view.dom.ownerDocument.defaultView;
      this.press = { block, id: t.identifier, x: t.clientX, y: t.clientY };
      this.press.timer = win.setTimeout(() => this.lift(), LONG_PRESS);
    }
    clearPress() {
      if (!this.press) return;
      this.view.dom.ownerDocument.defaultView?.clearTimeout(this.press.timer);
      this.press = null;
    }
    lift() {
      const p = this.press;
      if (!p || this.view.state.doc.toString() !== this.model().text) return this.clearPress();
      const doc = this.view.dom.ownerDocument;
      if (!this.begin(p.block, p.x, p.y, { touch: p.id })) return this.clearPress();
      this.press = null;
      // Nothing editable or selectable while a block is lifted: the system's own
      // long press (selection handles, copy/paste menu) finds no text to act on.
      const content = this.view.contentDOM;
      this.drag.editable = content.getAttribute('contenteditable');
      content.setAttribute('contenteditable', 'false');
      doc.getSelection()?.removeAllRanges();
      this.ghost(p.x, p.y);
      try { doc.defaultView.navigator.vibrate?.(15); } catch { /* no haptics */ }
    }
    touchOf(e) {
      for (const t of e.changedTouches) if (t.identifier === (this.drag?.touch ?? this.press?.id)) return t;
      return null;
    }
    touchMove(e) {
      if (this.press && !this.drag) {
        const t = this.touchOf(e);
        // Moving before the press completes is a scroll: let it be.
        if (t && Math.hypot(t.clientX - this.press.x, t.clientY - this.press.y) > SLOP) this.clearPress();
        return;
      }
      if (!this.touching()) return;
      const t = this.touchOf(e);
      if (!t) return;
      e.preventDefault();
      this.dragTo(t.clientX, t.clientY);
    }
    touchEnd(e) {
      if (this.press && !this.drag) { this.clearPress(); return; }
      if (!this.touching() || !this.touchOf(e)) return;
      // No click, caret or keyboard after a drop.
      e.preventDefault();
      this.finish(e.type === 'touchend', true);
    }

    /** A floating copy of the block under the finger, as in wolai and Notion. */
    ghost(x, y) {
      const d = this.drag, view = this.view, doc = view.dom.ownerDocument;
      const content = view.contentDOM.getBoundingClientRect(), top = parseFloat(d.shade.style.top) + view.dom.getBoundingClientRect().top;
      const bottom = top + parseFloat(d.shade.style.height);
      const ghost = doc.body.appendChild(doc.createElement('div'));
      ghost.className = 'tet-drag-ghost markdown-source-view mod-cm6 is-live-preview';
      const inner = ghost.appendChild(doc.createElement('div'));
      inner.className = 'cm-content';
      for (const el of view.contentDOM.children) {
        const r = el.getBoundingClientRect();
        if (r.bottom > top + 1 && r.top < bottom - 1) inner.appendChild(el.cloneNode(true));
      }
      ghost.style.width = `${content.width}px`;
      d.ghost = ghost; d.grab = { dx: x - content.left };
      this.moveGhost();
    }
    /** The copy floats just above the fingertip (below it near the top edge),
     * so neither the finger nor the copy hides the drop line. */
    moveGhost() {
      const d = this.drag;
      if (!d?.ghost) return;
      // Anchor the copy's bottom edge: images inside it may still be loading.
      const above = d.y - d.ghost.offsetHeight - 28 >= 0;
      d.ghost.style.transform = `translate(${d.x - d.grab.dx}px, ${above ? d.y - 28 : d.y + 28}px)${above ? ' translateY(-100%)' : ''}`;
    }

    /** Shade the lines being moved. */
    paint() {
      const d = this.drag, view = this.view, box = view.dom.getBoundingClientRect(), content = view.contentDOM.getBoundingClientRect();
      const doc = view.state.doc;
      const top = view.documentTop + view.lineBlockAt(doc.line(d.block.from + 1).from).top;
      const bottom = view.documentTop + view.lineBlockAt(doc.line(d.block.to + 1).from).bottom;
      Object.assign(d.shade.style, { top: `${top - box.top}px`, height: `${Math.max(4, bottom - top)}px`, left: `${content.left - box.left}px`, width: `${content.width}px` });
    }

    dragTo(x, y, pointer) {
      const d = this.drag;
      if (pointer !== undefined && pointer !== d.pointer) return;
      d.x = x; d.y = y;
      this.moveGhost();
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

    /** End the drag; `drop` writes the move, otherwise it is cancelled. */
    finish(drop, touch = false) {
      const d = this.drag;
      if (!d) return;
      const target = drop ? d.target : null;
      this.cancel();
      if (!target) return;
      const view = this.view, current = view.state.doc.toString();
      if (current !== d.text) return;
      const result = moveBlock(current, d.block, target);
      if (!result) return;
      view.dispatch({ changes: diff(current, result.text), userEvent: 'move.drop', scrollIntoView: false });
      const doc = view.state.doc, first = doc.line(Math.min(doc.lines, result.line + 1));
      const effects = [];
      if (d.folded && result.lines > 1) {
        const last = doc.line(Math.min(doc.lines, result.line + result.lines));
        if (last.to > first.to) effects.push(foldEffect.of({ from: first.to, to: last.to }));
      }
      // On a phone, focusing would raise the keyboard: only fold, keep reading.
      if (touch) { if (effects.length) view.dispatch({ effects }); return; }
      view.dispatch({ selection: { anchor: first.from }, effects });
      view.focus();
    }

    cancel() {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      const doc = this.view.dom.ownerDocument;
      doc.defaultView?.cancelAnimationFrame(d.frame);
      d.shade.remove(); d.indicator.remove(); d.ghost?.remove();
      if (d.editable !== undefined && d.editable !== null) this.view.contentDOM.setAttribute('contenteditable', d.editable);
      this.handle.classList.remove('is-dragging');
      doc.body.classList.remove('tet-block-dragging');
      if (this.onUp) {
        this.handle.removeEventListener('pointerup', this.onUp);
        this.handle.removeEventListener('pointercancel', this.onUp);
        this.onUp = null;
      }
      doc.removeEventListener('keydown', this.onKey, true);
      if (d.pointer !== undefined) try { this.handle.releasePointerCapture(d.pointer); } catch { /* already released */ }
      this.hide();
    }
  });
}

export { blockDragExtension, diff };
