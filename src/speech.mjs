import { MarkdownView, Menu, Notice, requestUrl, setIcon } from 'obsidian';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { speechSegments, segmentAt } from './speech-text.mjs';

// Listening uses the device's own speech engine (Web Speech API): offline and
// free on desktop; on phones it depends on what the Obsidian app exposes.
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const PROGRESS_LIMIT = 200, PROGRESS_DAYS = 180;
const UNAVAILABLE = '这台设备上的 Obsidian 没有提供系统朗读功能。请在听书设置里把“朗读来源”改为“自动”或“百度朗读”。';
const ONLINE_FAIL = '百度朗读暂时用不了：网络不通，或百度改了接口。可以稍后再试，或在听书设置里改用系统声音。';
const ENGINES = {auto: '自动（推荐）', system: '系统声音（离线）', baidu: '百度朗读（联网）'};
const CACHE_LIMIT = 6;
const SILENT = '系统朗读没有发出声音：这台设备的 Obsidian 可能调用不到朗读引擎。安卓手机请确认系统设置里已启用“文字转语音”引擎，或改用系统“随选朗读”。';

// The sentence being read, kept in the editor state so it follows edits.
const setSpeech = StateEffect.define();
const speechField = StateField.define({
  create: () => null,
  update(value, tr) {
    if (value && tr.docChanged) value = {from: tr.changes.mapPos(value.from, 1), to: tr.changes.mapPos(value.to, -1), end: tr.changes.mapPos(value.end, -1)};
    for (const effect of tr.effects) if (effect.is(setSpeech)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field, v => v && v.show && v.to > v.from ? Decoration.set([Decoration.mark({class: 'tet-speaking'}).range(v.from, v.to)]) : Decoration.none),
});
function speechExtension() { return [speechField]; }

/** Validated, bounded progress map: path -> {o: offset, t: sentence start, d: finished, at: time}. */
function pruneProgress(saved, now = Date.now()) {
  if (!saved || typeof saved !== 'object') return {};
  const entries = Object.entries(saved).filter(([path, v]) => typeof path === 'string' && path.length <= 1000 && v && Number.isInteger(v.o) && v.o >= 0 &&
    typeof v.t === 'string' && typeof v.at === 'number' && now - v.at < PROGRESS_DAYS * 864e5);
  entries.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(entries.slice(0, PROGRESS_LIMIT).map(([path, v]) => [path, {o: v.o, t: v.t.slice(0, 20), d: !!v.d, at: v.at}]));
}

function lineOf(text, offset) { let n = 0; for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) n++; return n; }
function lineStart(text, line) { let at = 0; for (let n = 0; n < line; n++) { const i = text.indexOf('\n', at); if (i < 0) return text.length; at = i + 1; } return at; }
const squeeze = s => s.replace(/\s+/g, '');

// Rendered Reading view text -> a DOM Range for a spoken sentence. Spaces are
// ignored; when the render differs (link labels, table pauses) the sentence
// start still locates it.
function findRendered(root, text) {
  const doc = root.ownerDocument, chars = [];
  const walker = doc.createTreeWalker(root, 4, {acceptNode: node => node.parentElement?.closest('.tet-extra-gap,.copy-code-button,.collapse-indicator,.frontmatter-container') ? 2 : 1});
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue;
    for (let i = 0; i < value.length; i++) if (!/\s/.test(value[i])) chars.push([node, i, value[i]]);
  }
  const hay = chars.map(c => c[2]).join(''), exact = squeeze(text);
  let index = hay.indexOf(exact), length = exact.length;
  if (index < 0) {
    // Table rows: speech adds a pause between cells; match without commas.
    const kept = chars.map((c, i) => [c[2], i]).filter(c => c[0] !== '，'), plain = kept.map(c => c[0]).join('');
    const needle = exact.replace(/，/g, ''), at = needle ? plain.indexOf(needle) : -1;
    if (at >= 0) { index = kept[at][1]; length = kept[at + needle.length - 1][1] - index + 1; }
  }
  if (index < 0) {
    const head = exact.slice(0, 8);
    if (head.length >= 2 && (index = hay.indexOf(head)) >= 0) length = Math.min(exact.length, hay.length - index);
  }
  if (index < 0 || length <= 0) return null;
  const first = chars[index], last = chars[index + length - 1];
  const range = doc.createRange();
  range.setStart(first[0], first[1]); range.setEnd(last[0], last[1] + 1);
  return range;
}

class SpeechReader {
  constructor(plugin) {
    this.plugin = plugin;
    this.session = null;
    this.token = 0;
    this.actions = new Map();
    this.saveTimer = null;
    this.verified = false;
    this.systemBroken = false;
    this.cache = new Map();
    this.audio = null;
  }
  get settings() { return this.plugin.settings; }
  get synth() { return window.speechSynthesis; }
  available() { return !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function'; }
  /** 'system' or 'baidu'. Automatic: the device's own voice when it works, else Baidu online. */
  engine() {
    const chosen = this.settings.speechEngine;
    if (chosen === 'system' || chosen === 'baidu') return chosen;
    return this.available() && !this.systemBroken ? 'system' : 'baidu';
  }
  /** Voices load asynchronously in Chromium; wait briefly for the first list. */
  async voices() {
    if (!this.available()) return [];
    if (this.synth.getVoices().length) return this.synth.getVoices();
    await new Promise(resolve => {
      const timer = window.setTimeout(resolve, 1500);
      this.synth.addEventListener?.('voiceschanged', () => { window.clearTimeout(timer); resolve(); }, {once: true});
    });
    return this.synth.getVoices();
  }
  pickVoice(voices) {
    const name = this.settings.speechVoice;
    return voices.find(v => v.name === name) || voices.find(v => /^zh/i.test(v.lang) && v.localService) || voices.find(v => /^zh/i.test(v.lang)) || null;
  }

  // ---- header buttons
  attachAll() {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || this.actions.get(view)?.isConnected) continue;
      const el = view.addAction('headphones', '听书', () => this.toggleFor(view));
      el.addClass('tet-speech-action');
      this.actions.set(view, el);
    }
    for (const [view, el] of this.actions) if (!el.isConnected) this.actions.delete(view);
    this.renderActions();
  }
  renderActions() {
    for (const [view, el] of this.actions) el.toggleClass('is-active', this.session?.view === view && this.session.state === 'playing');
  }
  toggleFor(view) {
    if (this.session?.view === view) this.toggle(); else void this.start(view, 'auto');
  }

  // ---- starting point
  selectionRange(view, text, preview) {
    if (!preview && view.editor) {
      const editor = view.editor;
      if (!editor.getSelection().trim()) return null;
      return [editor.posToOffset(editor.getCursor('from')), editor.posToOffset(editor.getCursor('to'))];
    }
    const selection = view.containerEl.win?.getSelection?.() || window.getSelection();
    if (!selection || selection.isCollapsed || !view.contentEl.contains(selection.anchorNode)) return null;
    const picked = squeeze(selection.toString()).replace(/，/g, '');
    if (!picked) return null;
    // Reading view: find the selected words among the spoken sentences.
    const all = speechSegments(text), flat = all.map(s => squeeze(s.text).replace(/，/g, ''));
    const head = picked.slice(0, 8), tail = picked.slice(-8);
    const first = flat.findIndex(s => s.includes(head));
    if (first < 0) return null;
    let last = first;
    for (let i = first; i < flat.length; i++) if (flat[i].includes(tail)) { last = i; break; }
    return [all[first].from, all[last].to];
  }
  herePosition(view, text, preview) {
    if (!preview && view.editor) return view.editor.posToOffset(view.editor.getCursor());
    const line = Math.max(0, Math.floor(view.previewMode?.getScroll?.() || 0));
    return lineStart(text, line);
  }
  resumeIndex(path, segments) {
    const saved = this.settings.speechRemember && this.settings.speechProgress[path];
    if (!saved || saved.d) return -1;
    const exact = segments.findIndex(s => s.from === saved.o && s.text.startsWith(saved.t));
    if (exact >= 0) return exact;
    // The note was edited: the nearest sentence with the same opening wins.
    let best = -1;
    segments.forEach((s, i) => { if (s.text.startsWith(saved.t) && (best < 0 || Math.abs(s.from - saved.o) < Math.abs(segments[best].from - saved.o))) best = i; });
    return best;
  }

  /** how: 'auto' (selection, else saved position, else cursor / top of screen), 'here', 'start'. */
  async start(view, how = 'auto') {
    if (this.engine() === 'system' && !this.available()) { new Notice(UNAVAILABLE, 10000); return; }
    const file = view.file;
    if (!file) return;
    const text = view.editor ? view.editor.getValue() : await this.plugin.app.vault.cachedRead(file);
    const preview = view.getMode?.() === 'preview';
    let segments, index = 0, selection = null;
    if (how !== 'start') selection = this.selectionRange(view, text, preview);
    if (selection) segments = speechSegments(text, {start: selection[0], end: selection[1]});
    else {
      segments = speechSegments(text);
      const resumed = how === 'auto' ? this.resumeIndex(file.path, segments) : -1;
      index = how === 'start' ? 0 : resumed >= 0 ? resumed : segmentAt(segments, this.herePosition(view, text, preview));
      if (index >= segments.length) index = 0;
    }
    if (!segments.length) { new Notice('没有可以朗读的文字'); return; }
    this.stop();
    this.voice = this.pickVoice(await this.voices());
    const session = this.session = {view, path: file.path, text, segments, index, state: 'playing', selection: !!selection,
      end: selection ? selection[1] : text.length, follow: true, programmatic: 0, cleanup: []};
    this.mount(session);
    const away = () => { if (Date.now() - session.programmatic > 500 && session.follow) { session.follow = false; this.render(); } };
    for (const type of ['wheel', 'touchmove']) {
      view.contentEl.addEventListener(type, away, {passive: true});
      session.cleanup.push(() => view.contentEl.removeEventListener(type, away));
    }
    this.speak();
  }

  // ---- playback
  speak() {
    const s = this.session;
    if (!s) return;
    this.sync(s);
    const segment = s.segments[s.index];
    if (!segment) { this.finish(); return; }
    const token = ++this.token;
    s.state = 'playing';
    this.stopAudio();
    if (this.engine() === 'baidu') { void this.speakOnline(s, segment, token); this.prefetch(s); }
    else this.speakSystem(s, segment, token);
    this.highlight(); this.render(); this.queueProgress();
  }
  next(s, token) { if (token !== this.token || this.session !== s) return; s.index++; window.setTimeout(() => { if (token === this.token) this.speak(); }, 0); }
  speakSystem(s, segment, token) {
    const synth = this.synth;
    if (!this.available()) { this.fail(UNAVAILABLE); return; }
    const go = () => {
      if (token !== this.token) return;
      const utterance = new window.SpeechSynthesisUtterance(segment.text);
      if (this.voice) { utterance.voice = this.voice; utterance.lang = this.voice.lang; } else utterance.lang = 'zh-CN';
      utterance.rate = this.settings.speechRate;
      let started = false;
      utterance.onstart = () => { started = true; this.verified = true; };
      utterance.onend = () => this.next(s, token);
      utterance.onerror = event => {
        if (token !== this.token || ['interrupted', 'canceled'].includes(event.error)) return;
        this.fail('朗读出错：' + (event.error || '未知原因'));
      };
      // Keep a reference: Chromium can collect a pending utterance and never fire onend.
      this.utterance = utterance;
      synth.speak(utterance);
      if (!this.verified) window.setTimeout(() => {
        if (token !== this.token || started || synth.speaking) return;
        // An engine that exists but stays silent: in automatic mode, read online instead.
        if (this.settings.speechEngine === 'auto') { this.systemBroken = true; new Notice('系统朗读没有发出声音，已改用百度朗读。', 8000); this.speak(); }
        else this.fail(SILENT);
      }, 5000);
    };
    // Cancelling and speaking in the same task drops the new utterance on some engines.
    if (synth.speaking || synth.pending) { synth.cancel(); window.setTimeout(go, 60); } else go();
  }
  /** Baidu Translate's read-aloud audio, fetched through Obsidian's requestUrl
   * (no browser CORS limits on desktop or mobile). Speed is the player's
   * playbackRate, so changing it needs no new download. */
  fetchOnline(text) {
    if (this.cache.has(text)) return this.cache.get(text);
    const lan = /[㐀-鿿]/.test(text) ? 'zh' : 'en';
    const url = `https://fanyi.baidu.com/gettts?lan=${lan}&text=${encodeURIComponent(text)}&spd=5&source=web`;
    const job = requestUrl({url, method: 'GET', throw: false}).then(response => {
      const type = Object.entries(response.headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
      if (response.status !== 200 || !/audio|mpeg/i.test(type) || !response.arrayBuffer?.byteLength) throw new Error(`HTTP ${response.status} ${type}`);
      return response.arrayBuffer;
    });
    this.cache.set(text, job);
    job.catch(() => this.cache.delete(text));
    // Memory only and bounded: a few sentences around the current one.
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
    return job;
  }
  prefetch(s) {
    for (const segment of s.segments.slice(s.index + 1, s.index + 3)) this.fetchOnline(segment.text).catch(() => {});
  }
  async speakOnline(s, segment, token) {
    let data;
    try { data = await this.fetchOnline(segment.text); }
    catch { if (token === this.token) this.fail(ONLINE_FAIL); return; }
    if (token !== this.token) return;
    const url = URL.createObjectURL(new Blob([data], {type: 'audio/mpeg'}));
    const audio = new window.Audio(url);
    audio.preservesPitch = true;
    audio.playbackRate = this.settings.speechRate;
    this.audio = {el: audio, url, index: s.index};
    audio.onended = () => { if (token !== this.token) return; this.stopAudio(); this.next(s, token); };
    audio.onerror = () => { if (token === this.token) this.fail(ONLINE_FAIL); };
    try { await audio.play(); }
    catch (error) { if (token === this.token && this.audio?.el === audio) this.fail('无法播放声音：' + (error?.message || error)); }
  }
  stopAudio() {
    const audio = this.audio;
    if (!audio) return;
    this.audio = null;
    audio.el.onended = audio.el.onerror = null;
    audio.el.pause();
    URL.revokeObjectURL(audio.url);
  }
  /** Edits while listening: re-read the note and continue after the mapped sentence. */
  sync(s) {
    const editor = s.view.editor;
    if (!editor || s.view.file?.path !== s.path) return;
    const text = editor.getValue();
    if (text === s.text) return;
    // The highlighted sentence was remapped through the edits: continue at it,
    // or after it once it has been spoken.
    const mapped = editor.cm?.state.field(speechField, false);
    const done = s.index !== s.shown;
    const position = mapped ? (done ? mapped.to : mapped.from) : Math.min(s.segments[s.index]?.from ?? 0, text.length);
    const end = s.selection ? (mapped ? mapped.end : Math.min(s.end, text.length)) : text.length;
    s.text = text; s.end = end;
    s.segments = s.selection ? speechSegments(text, {start: position, end}) : speechSegments(text);
    s.index = s.selection ? 0 : segmentAt(s.segments, position);
    s.shown = -1;
    this.stopAudio();
  }
  toggle() {
    const s = this.session;
    if (!s) return;
    if (s.state === 'playing') { this.pause(); return; }
    if (s.state === 'ended') s.index = 0;
    // Online audio resumes mid-sentence; the system engine repeats the sentence.
    const audio = this.audio;
    if (audio && audio.index === s.index && (!s.view.editor || s.view.editor.getValue() === s.text)) {
      s.state = 'playing';
      audio.el.playbackRate = this.settings.speechRate;
      audio.el.play().catch(() => this.speak());
      this.render();
    } else this.speak();
  }
  pause() {
    const s = this.session;
    if (!s) return;
    if (this.audio) this.audio.el.pause();
    else { this.token++; if (this.available()) this.synth.cancel(); }
    s.state = 'paused';
    this.render(); this.flushProgress();
  }
  step(delta) {
    const s = this.session;
    if (!s) return;
    this.sync(s);
    this.stopAudio();
    s.index = Math.max(0, Math.min(s.segments.length - 1, s.index + delta));
    if (s.state === 'playing') this.speak();
    else { this.token++; if (s.state === 'ended') s.state = 'paused'; this.highlight(); this.render(); this.queueProgress(); }
  }
  finish() {
    const s = this.session;
    if (!s) return;
    this.token++; this.stopAudio(); s.state = 'ended'; s.index = Math.max(0, s.segments.length - 1);
    if (!s.selection && this.settings.speechRemember) { this.settings.speechProgress[s.path] = {o: 0, t: '', d: true, at: Date.now()}; this.flushProgress(true); }
    this.clearHighlight(s); this.render();
  }
  fail(message) { new Notice(message, 10000); this.stop(); }
  stop() {
    const s = this.session;
    this.token++;
    this.stopAudio();
    this.cache.clear();
    if (this.available() && (this.synth.speaking || this.synth.pending)) this.synth.cancel();
    if (!s) return;
    this.flushProgress();
    this.session = null;
    for (const fn of s.cleanup) fn();
    this.clearHighlight(s);
    s.bar?.remove();
    s.view.contentEl.removeClass('tet-speech-host');
    this.renderActions();
  }
  async setRate(rate) {
    this.settings.speechRate = rate;
    await this.plugin.saveData(this.settings);
    if (this.audio) this.audio.el.playbackRate = rate;
    else if (this.session?.state === 'playing') this.speak();
    this.render();
  }
  async setVoice(name) {
    this.settings.speechVoice = name;
    await this.plugin.saveData(this.settings);
    this.voice = this.pickVoice(await this.voices());
    if (this.session?.state === 'playing' && this.engine() === 'system') this.speak();
  }
  async setEngine(engine) {
    this.settings.speechEngine = engine;
    this.systemBroken = false;
    await this.plugin.saveData(this.settings);
    this.voice = this.pickVoice(await this.voices());
    if (this.session?.state === 'playing') this.speak(); else this.render();
  }
  async preview() {
    if (this.session?.state === 'playing') this.pause();
    const sample = '这是听书的试听效果，语速和声音可以随时调整。';
    this.token++; this.stopAudio();
    if (this.available()) this.synth.cancel();
    if (this.engine() === 'baidu') {
      const token = this.token;
      try {
        const data = await this.fetchOnline(sample);
        if (token !== this.token) return;
        const url = URL.createObjectURL(new Blob([data], {type: 'audio/mpeg'})), audio = new window.Audio(url);
        audio.preservesPitch = true; audio.playbackRate = this.settings.speechRate;
        this.audio = {el: audio, url, index: -1};
        audio.onended = () => { if (this.audio?.el === audio) this.stopAudio(); };
        await audio.play();
      } catch { new Notice(ONLINE_FAIL, 10000); this.stopAudio(); }
      return;
    }
    if (!this.available()) { new Notice(UNAVAILABLE, 10000); return; }
    const voice = this.pickVoice(await this.voices());
    const utterance = new window.SpeechSynthesisUtterance(sample);
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = 'zh-CN';
    utterance.rate = this.settings.speechRate;
    this.utterance = utterance;
    this.synth.speak(utterance);
  }

  // ---- highlight and following
  highlight() {
    const s = this.session, segment = s?.segments[s.index];
    if (!segment) return;
    const cm = s.view.editor?.cm;
    s.shown = s.index; s.mode = s.view.getMode?.();
    // The editor keeps the range even in Reading view, so edits remap it.
    cm?.dispatch({effects: setSpeech.of({from: segment.from, to: segment.to, end: s.end, show: true})});
    if (s.view.getMode?.() === 'preview') this.highlightPreview(s, segment, 0);
    else { this.paint(s, null); if (cm && s.follow) this.revealEditor(s, cm, segment); }
  }
  revealEditor(s, cm, segment) {
    const rect = cm.coordsAtPos(segment.from), box = cm.scrollDOM.getBoundingClientRect();
    if (rect && rect.top >= box.top + 40 && rect.bottom <= box.bottom - 90) return;
    s.programmatic = Date.now();
    cm.dispatch({effects: EditorView.scrollIntoView(segment.from, {y: 'center'})});
  }
  highlightPreview(s, segment, attempt) {
    const preview = s.view.previewMode, line = lineOf(s.text, segment.from);
    const sections = preview?.renderer?.sections;
    // Only sections Obsidian has rendered exist in the DOM; search the ones
    // holding this sentence's source so repeats elsewhere are not matched.
    // Sections carry {start, end} source positions (internal renderer data).
    const holds = x => x.start && x.end ? x.start.offset < segment.to && x.end.offset >= segment.from : x.lineStart <= line && x.lineEnd >= line;
    const roots = Array.isArray(sections) ? sections.filter(x => x.el?.isConnected && holds(x)).map(x => x.el) : [preview?.containerEl].filter(Boolean);
    let range = null;
    for (const root of roots) if ((range = findRendered(root, segment.text))) break;
    this.paint(s, range);
    if (range) { if (s.follow) this.revealRange(s, range); return; }
    if (attempt < 2 && s.follow && preview) {
      s.programmatic = Date.now();
      preview.applyScroll(Math.max(0, line - 1));
      window.setTimeout(() => { if (this.session === s && s.segments[s.index] === segment) this.highlightPreview(s, segment, attempt + 1); }, 200);
    }
  }
  revealRange(s, range) {
    const scroller = s.view.previewMode?.containerEl;
    if (!scroller) return;
    const rect = range.getBoundingClientRect(), box = scroller.getBoundingClientRect();
    if (rect.top >= box.top + 40 && rect.bottom <= box.bottom - 90) return;
    s.programmatic = Date.now();
    scroller.scrollBy({top: rect.top - box.top - box.height * 0.35});
  }
  paint(s, range) {
    const win = s.view.containerEl.win || window, registry = win.CSS?.highlights;
    if (!registry || !win.Highlight) return;
    if (range) registry.set('tet-speaking', new win.Highlight(range)); else registry.delete('tet-speaking');
  }
  clearHighlight(s) {
    this.paint(s, null);
    s.view.editor?.cm?.dispatch({effects: setSpeech.of(null)});
  }

  // ---- progress (bounded; see pruneProgress)
  queueProgress() {
    const s = this.session, segment = s?.segments[s.index];
    if (!segment || s.selection || !this.settings.speechRemember) return;
    this.settings.speechProgress[s.path] = {o: segment.from, t: segment.text.slice(0, 20), d: false, at: Date.now()};
    if (!this.saveTimer) this.saveTimer = window.setTimeout(() => this.flushProgress(true), 2000);
  }
  flushProgress(force = false) {
    if (!this.saveTimer && !force) return;
    window.clearTimeout(this.saveTimer); this.saveTimer = null;
    this.settings.speechProgress = pruneProgress(this.settings.speechProgress);
    void this.plugin.saveData(this.settings);
  }
  async clearProgress() {
    this.settings.speechProgress = {};
    await this.plugin.saveData(this.settings);
  }
  renameProgress(file, oldPath) {
    const store = this.settings.speechProgress;
    if (store[oldPath]) { store[file.path] = store[oldPath]; delete store[oldPath]; this.flushProgress(true); }
    if (this.session?.path === oldPath) this.session.path = file.path;
  }
  deleteProgress(file) {
    if (this.settings.speechProgress[file.path]) { delete this.settings.speechProgress[file.path]; this.flushProgress(true); }
    if (this.session?.path === file.path) this.stop();
  }
  /** Workspace changed: a closed leaf or another file ends the session; a mode switch re-highlights. */
  check() {
    const s = this.session;
    if (!s) return;
    const open = this.plugin.app.workspace.getLeavesOfType('markdown').some(leaf => leaf.view === s.view);
    if (!open || s.view.file?.path !== s.path) { this.stop(); return; }
    if (s.state !== 'ended' && s.view.getMode?.() !== s.mode) this.highlight();
  }

  // ---- player bar
  mount(s) {
    const host = s.view.contentEl;
    host.addClass('tet-speech-host');
    const bar = s.bar = host.createDiv({cls: 'tet-speech-bar', attr: {role: 'toolbar', 'aria-label': '听书'}});
    const button = (icon, label, run, cls = '') => {
      const el = bar.createEl('button', {cls: 'tet-speech-btn ' + cls, attr: {type: 'button', 'aria-label': label}});
      if (icon) setIcon(el, icon);
      el.addEventListener('click', event => { event.preventDefault(); run(el); });
      return el;
    };
    s.els = {
      prev: button('skip-back', '上一句', () => this.step(-1)),
      play: button('pause', '暂停', () => this.toggle(), 'tet-speech-main'),
      next: button('skip-forward', '下一句', () => this.step(1)),
      rate: button('', '语速', el => this.rateMenu(el), 'tet-speech-rate'),
      voice: button('volume-2', '声音', el => void this.voiceMenu(el)),
      locate: button('locate-fixed', '回到朗读位置', () => { s.follow = true; this.highlight(); this.render(); }, 'tet-speech-locate'),
      more: button('more-horizontal', '更多', el => this.moreMenu(el)),
      close: button('x', '关闭听书', () => this.stop()),
      progress: bar.createDiv({cls: 'tet-speech-progress'}),
    };
  }
  render() {
    const s = this.session;
    this.renderActions();
    if (!s?.bar) return;
    const {play, rate, progress} = s.els;
    const icon = s.state === 'playing' ? 'pause' : s.state === 'ended' ? 'rotate-ccw' : 'play';
    if (play.dataset.icon !== icon) { play.empty(); setIcon(play, icon); play.dataset.icon = icon; }
    play.setAttribute('aria-label', s.state === 'playing' ? '暂停' : s.state === 'ended' ? '重新朗读' : '继续');
    rate.setText(`${this.settings.speechRate}×`);
    s.bar.dataset.state = s.state;
    s.bar.dataset.follow = String(s.follow);
    const total = s.segments.reduce((sum, x) => sum + x.text.length, 0) || 1;
    const read = s.state === 'ended' ? total : s.segments.slice(0, s.index).reduce((sum, x) => sum + x.text.length, 0);
    progress.style.width = `${Math.round(read / total * 1000) / 10}%`;
  }
  show(menu, anchor) { const rect = anchor.getBoundingClientRect(); menu.showAtPosition({x: rect.left, y: rect.top}); }
  rateMenu(anchor) {
    const menu = new Menu();
    for (const rate of RATES) menu.addItem(item => item.setTitle(`${rate}×`).setChecked(rate === this.settings.speechRate).onClick(() => void this.setRate(rate)));
    this.show(menu, anchor);
  }
  async voiceMenu(anchor) {
    const voices = await this.voices(), chinese = voices.filter(v => /^zh/i.test(v.lang));
    const menu = new Menu();
    // Reading source first; system voices only matter when the system engine reads.
    for (const [key, label] of Object.entries(ENGINES)) {
      if (key === 'system' && !this.available()) continue;
      menu.addItem(item => item.setTitle(label).setChecked((this.settings.speechEngine || 'auto') === key).onClick(() => void this.setEngine(key)));
    }
    if (this.engine() === 'system' && voices.length) {
      menu.addSeparator();
      menu.addItem(item => item.setTitle('自动选中文声音').setChecked(!this.settings.speechVoice).onClick(() => void this.setVoice('')));
      for (const voice of chinese.length ? chinese : voices) menu.addItem(item => item.setTitle(voice.name).setChecked(voice.name === this.settings.speechVoice).onClick(() => void this.setVoice(voice.name)));
    }
    this.show(menu, anchor);
  }
  moreMenu(anchor) {
    const s = this.session, menu = new Menu();
    if (!s) return;
    menu.addItem(item => item.setTitle('从头朗读').setIcon('rotate-ccw').onClick(() => void this.start(s.view, 'start')));
    menu.addItem(item => item.setTitle(s.view.getMode?.() === 'preview' ? '从当前屏幕开始朗读' : '从光标处开始朗读').setIcon('text-cursor-input').onClick(() => void this.start(s.view, 'here')));
    menu.addItem(item => item.setTitle('听书设置').setIcon('settings').onClick(() => this.plugin.openSettings()));
    this.show(menu, anchor);
  }
  destroy() {
    this.stop();
    this.flushProgress();
    for (const el of this.actions.values()) el.remove();
    this.actions.clear();
  }
}

export { SpeechReader, speechExtension, pruneProgress, findRendered, RATES, ENGINES };
