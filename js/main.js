/* =========================================================================
   Suction Studio — main.js
   Application controller: state, gestures, playback, history, import/export.
   ========================================================================= */
'use strict';

const AUTOSAVE_KEY = 'suction-studio:autosave:v1';
const PREFS_KEY = 'suction-studio:prefs:v1';

const App = {
  project: null,
  time: 0,
  playing: false,
  loop: true,
  tool: 'select',
  autoKey: true,
  onion: false,
  grid: false,
  snap: true,
  propsOpen: true,
  selection: { type: null, id: null },
  history: [],
  histIndex: -1,
  rev: 0,
  needsRender: true,
  dirty: false,
  tlZoom: 8,
  _last: 0,
  _saveTimer: null,

  /* ----------------------------- selection ----------------------------- */
  select(type, id = null) {
    if (type === 'layer' && !Model.getLayer(this.project, id)) return;
    this.selection = { type, id };
    UI.updateToggles();
    UI.refreshProps();
    this.needsRender = true;
  },

  selLayer() {
    return this.selection.type === 'layer' ? Model.getLayer(this.project, this.selection.id) : null;
  },

  /* ------------------------------- time -------------------------------- */
  setTime(t, opts = {}) {
    const max = this.project.settings.duration - 0.001;
    let v = U.clamp(t, 0, max);
    if (this.snap && !opts.raw) v = Math.round(v);
    this.time = v;
    UI.updatePlayhead();
    UI.updatePropValues();
    this.needsRender = true;
  },

  stepFrame(n) {
    if (this.playing) this.pause();
    this.setTime(Math.round(this.time) + n);
  },

  play() {
    if (this.playing) return;
    if (this.time >= this.project.settings.duration - 0.01) this.time = 0;
    this.playing = true;
    this._last = performance.now();
    UI.updateTransport();
    AudioEngine.play(this.project, this.time, this.project.settings.fps).catch(() => {});
  },

  pause() {
    if (!this.playing) return;
    this.playing = false;
    AudioEngine.stop();
    UI.updateTransport();
  },

  togglePlay() {
    if (this.playing) this.pause(); else this.play();
  },

  toggleOnion() {
    this.onion = !this.onion;
    this.needsRender = true;
    UI.updateToggles();
    this.savePrefs();
  },

  setTool(t) {
    this.tool = t;
    UI.updateToggles();
    this.savePrefs();
  },

  /* ------------------------------ history ------------------------------ */
  resetHistory() {
    this.history = [Model.clone(this.project)];
    this.histIndex = 0;
    this.dirty = false;
    UI.refreshTopbar();
  },

  commit(label) {
    this.history = this.history.slice(0, this.histIndex + 1);
    this.history.push(Model.clone(this.project));
    if (this.history.length > 80) this.history.shift();
    this.histIndex = this.history.length - 1;
    this.dirty = true;
    this.rev++;
    Renderer.clearCaches();
    UI.refreshAll();
    scheduleAutosave();
  },

  restoreState(state) {
    this.project = Model.clone(state);
    this.normalizeSelection();
    this.time = U.clamp(this.time, 0, this.project.settings.duration - 0.001);
    this.rev++;
    Renderer.clearCaches();
    UI.refreshAll();
    this.dirty = true;
    scheduleAutosave();
  },

  undo() {
    if (this.histIndex <= 0) return;
    this.histIndex--;
    this.restoreState(this.history[this.histIndex]);
  },

  redo() {
    if (this.histIndex >= this.history.length - 1) return;
    this.histIndex++;
    this.restoreState(this.history[this.histIndex]);
  },

  normalizeSelection() {
    const s = this.selection;
    if (s.type === 'layer' && !Model.getLayer(this.project, s.id)) this.selection = { type: null, id: null };
    if (s.type === 'clip' && !Model.getClip(this.project, s.id)) this.selection = { type: null, id: null };
    if (s.type === 'track' && !Model.getTrack(this.project, s.id)) this.selection = { type: null, id: null };
  },

  /* ------------------------------ editing ------------------------------ */
  setPivot(layer, x, y, keepPosition = true) {
    const old = { x: layer.pivot.x, y: layer.pivot.y };
    const dx = x - old.x, dy = y - old.y;
    if (keepPosition && (dx || dy)) {
      const d0 = Model.localLinear(layer, this.time).applyVec(dx, dy);
      layer.base.x += d0.x;
      layer.base.y += d0.y;
      for (const k of layer.keys.x) {
        const d = Model.localLinear(layer, k.t).applyVec(dx, dy);
        k.v += d.x;
      }
      for (const k of layer.keys.y) {
        const d = Model.localLinear(layer, k.t).applyVec(dx, dy);
        k.v += d.y;
      }
    }
    layer.pivot.x = x;
    layer.pivot.y = y;
    this.needsRender = true;
  },

  renameLayer(id, name) {
    const l = Model.getLayer(this.project, id);
    if (!l || !name) return;
    l.name = name.slice(0, 120);
    this.commit('Rename layer');
  },

  toggleLayerVisible(id) {
    const l = Model.getLayer(this.project, id);
    if (!l) return;
    l.visible = !l.visible;
    this.commit('Toggle visibility');
  },

  toggleLayerLocked(id) {
    const l = Model.getLayer(this.project, id);
    if (!l) return;
    l.locked = !l.locked;
    this.commit('Toggle lock');
  },

  moveLayer(id, dir) {
    Model.moveLayer(this.project, id, dir);
    this.commit('Reorder layer');
  },

  async duplicateSelection() {
    if (this.selection.type === 'layer') {
      const layer = this.selLayer();
      if (!layer) return;
      const copy = Model.duplicateLayer(this.project, layer);
      this.select('layer', copy.id);
      this.commit('Duplicate layer');
    } else if (this.selection.type === 'camera') {
      UI.toast('The camera is unique to the scene', 'info');
    } else {
      UI.toast('Select a layer to duplicate', 'info');
    }
  },

  async deleteSelection() {
    if (this.selection.type === 'layer') {
      const layer = this.selLayer();
      if (!layer) return;
      const ok = await UI.confirm('Delete layer?', `Delete “${layer.name}”? Parts parented to it will be re-attached to its parent.`, { danger: true, confirmLabel: 'Delete' });
      if (!ok) return;
      Model.deleteLayer(this.project, layer.id);
      this.selection = { type: null, id: null };
      this.commit('Delete layer');
    } else if (this.selection.type === 'clip') {
      const found = Model.getClip(this.project, this.selection.id);
      if (!found) return;
      found.track.clips = found.track.clips.filter(c => c.id !== this.selection.id);
      this.selection = { type: null, id: null };
      this.commit('Delete audio clip');
    } else if (this.selection.type === 'track') {
      this.deleteTrack(this.selection.id);
    }
  },

  deleteTrack(id) {
    const idx = this.project.audioTracks.findIndex(t => t.id === id);
    if (idx < 0) return;
    this.project.audioTracks.splice(idx, 1);
    if (!this.project.audioTracks.length) this.project.audioTracks.push(Model.createTrack());
    if (this.selection.type === 'track' && this.selection.id === id) this.selection = { type: null, id: null };
    this.commit('Delete audio track');
  },

  toggleTrackMuted(id) {
    const t = Model.getTrack(this.project, id);
    if (!t) return;
    t.muted = !t.muted;
    this.commit('Toggle track mute');
  },

  addAudioTrack() {
    const track = Model.createTrack('Audio ' + (this.project.audioTracks.length + 1));
    this.project.audioTracks.push(track);
    this.select('track', track.id);
    this.commit('Add audio track');
  },

  addNullLayer() {
    const c = Renderer.screenToWorld(Renderer.cssW / 2, Renderer.cssH / 2);
    const layer = Model.newLayer(this.project, { name: 'Null ' + (this.project.layers.length + 1), base: { x: c.x, y: c.y } });
    this.select('layer', layer.id);
    this.commit('Add null object');
  },

  addLayerFromAsset(asset, opts = {}) {
    const c = Renderer.screenToWorld(Renderer.cssW / 2, Renderer.cssH / 2);
    const layer = Model.newLayer(this.project, {
      assetId: asset.id,
      name: asset.name,
      base: { x: c.x, y: c.y }
    });
    layer.pivot = { x: asset.w / 2, y: asset.h / 2 };
    if (opts.select !== false) this.select('layer', layer.id);
    if (opts.commit !== false) this.commit('Add layer');
    this.needsRender = true;
    return layer;
  },

  addAudioClipFromAsset(asset) {
    const { clip } = Model.addAudioClip(this.project, asset, this.time, null);
    this.select('clip', clip.id);
    this.commit('Add audio clip');
  },

  async deleteAsset(asset) {
    const used = Model.assetUsage(this.project, asset.id);
    if (used) {
      const ok = await UI.confirm('Delete asset?', `“${asset.name}” is used by ${used} item${used > 1 ? 's' : ''}. Delete those too?`, { danger: true, confirmLabel: 'Delete' });
      if (!ok) return;
    }
    const deadLayers = this.project.layers.filter(l => l.assetId === asset.id).map(l => l.id);
    this.project.layers = this.project.layers.filter(l => l.assetId !== asset.id);
    for (const l of this.project.layers) if (deadLayers.includes(l.parent)) l.parent = null;
    for (const t of this.project.audioTracks) t.clips = t.clips.filter(c => c.assetId !== asset.id);
    delete this.project.assets[asset.id];
    this.normalizeSelection();
    this.commit('Delete asset');
  },

  /* ----------------------------- keyframes ----------------------------- */
  selectedAnim() {
    if (this.selection.type === 'layer') return this.selLayer();
    if (this.selection.type === 'camera') return this.project.camera;
    return null;
  },

  addKeyAtPlayhead() {
    const anim = this.selectedAnim();
    if (!anim) { UI.toast('Select a layer or the camera first', 'info'); return; }
    const props = this.selection.type === 'camera' ? ['x', 'y', 'zoom'] : PROP_LIST;
    const added = Model.ensureKeys(anim, props, Math.round(this.time));
    if (added) this.commit('Add keyframe');
    else UI.toast('Keys already exist at the playhead', 'info');
  },

  removeKeysAtPlayhead() {
    const anim = this.selectedAnim();
    if (!anim) return;
    const props = this.selection.type === 'camera' ? ['x', 'y', 'zoom'] : PROP_LIST;
    let removed = false;
    for (const p of props) if (Model.removeKeyAt(anim, p, Math.round(this.time))) removed = true;
    if (removed) this.commit('Remove keyframes');
    else UI.toast('No keys at the playhead', 'info');
  },

  setEase(ease, kind) {
    const anim = kind === 'camera' ? this.project.camera : this.selLayer();
    if (!anim) return;
    const n = Model.setEaseAtTime(anim, Math.round(this.time), ease);
    if (n) this.commit('Change easing');
    else UI.toast('No keys at the playhead', 'info');
  },

  resetCamera() {
    this.project.camera.base = { x: 0, y: 0, zoom: 1 };
    for (const p of Object.keys(this.project.camera.keys)) this.project.camera.keys[p].length = 0;
    this.commit('Reset camera');
  },

  /* ------------------------------- files -------------------------------- */
  newProjectDialog() {
    const body = U.el('div');
    body.innerHTML = `
      <p class="modal-text">Start a new scene. This replaces the current project.</p>
      <div class="new-choices">
        <button class="choice" id="newBlank">
          <span class="choice-ic">${U.icon('file', 26)}</span>
          <b>Blank Scene</b>
          <span>Empty 1920×1080 composition</span>
        </button>
        <button class="choice" id="newSample">
          <span class="choice-ic">${U.icon('logo', 26)}</span>
          <b>Sample Character</b>
          <span>CupGuy rigged and animated</span>
        </button>
      </div>`;
    const inst = UI.openModal({ title: 'New Project', body, width: '520px' });
    body.querySelector('#newBlank').addEventListener('click', () => {
      inst.close();
      const p = Model.createProject({ name: 'Untitled Scene' });
      p.audioTracks.push(Model.createTrack());
      this.loadProject(p);
      UI.toast('New blank project', 'success');
    });
    body.querySelector('#newSample').addEventListener('click', () => {
      inst.close();
      this.loadProject(DefaultProject.build());
      UI.toast('Sample project loaded', 'success');
    });
  },

  loadProject(project) {
    this.project = Model.normalize(project);
    this.time = 0;
    this.selection = { type: null, id: null };
    this.history = [Model.clone(this.project)];
    this.histIndex = 0;
    this.rev++;
    this.tlZoom = 8;
    Renderer.images.clear();
    Renderer.clearCaches();
    UI.refreshAll();
    Renderer.zoomToFit();
    requestAnimationFrame(() => { UI.fitTimeline(); Renderer.resize(); });
    this.dirty = false;
    scheduleAutosave();
  },

  async openProjectFile(file) {
    try {
      const text = await U.readFile(file);
      const parsed = Model.deserialize(text);
      if (this.dirty) {
        const ok = await UI.confirm('Open project?', 'Your current project has unsaved changes. Replace it?', { danger: true, confirmLabel: 'Replace' });
        if (!ok) return;
      }
      this.loadProject(parsed);
      UI.toast('Project opened', 'success');
    } catch (e) {
      UI.toast('Could not open project: ' + e.message, 'error', 5000);
    }
  },

  saveProject() {
    const blob = Exporter.exportProject();
    U.download(blob, Exporter.safeName() + '.suction.json');
    this.dirty = false;
    clearAutosave();
    UI.toast('Project saved', 'success');
  },

  async importFiles(files) {
    let added = 0;
    for (const file of files) {
      const ext = U.ext(file.name);
      const type = file.type || '';
      if (ext === 'json' || type === 'application/json') {
        await this.openProjectFile(file);
        continue;
      }
      const isImage = type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext);
      const isAudio = type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext);
      if (isImage) {
        try {
          const dataUrl = await U.readFile(file);
          const img = await U.loadImage(dataUrl);
          const w = img.naturalWidth || 512;
          const h = img.naturalHeight || 512;
          const asset = Model.addImageAsset(this.project, { name: U.basename(file.name), src: dataUrl, w, h });
          this.addLayerFromAsset(asset, { commit: false });
          added++;
        } catch (e) {
          UI.toast('Could not import ' + file.name, 'error');
        }
      } else if (isAudio) {
        try {
          const ab = await U.readFile(file, 'arrayBuffer');
          const decoded = await AudioEngine.decode(ab);
          const dataUrl = await U.readFile(file);
          const asset = Model.addAudioAsset(this.project, { name: U.basename(file.name), src: dataUrl, duration: decoded.duration });
          Model.addAudioClip(this.project, asset, this.time, null);
          added++;
        } catch (e) {
          UI.toast('Could not decode ' + file.name, 'error');
        }
      } else {
        UI.toast('Unsupported file: ' + file.name, 'error');
      }
    }
    if (added) {
      this.commit('Import assets');
      UI.toast(added + ' asset' + (added > 1 ? 's' : '') + ' imported', 'success');
      if (UI.assetsOpen) UI.refreshAssets();
    }
  },

  applySettings(vals) {
    const p = this.project;
    p.name = vals.name;
    p.settings.width = vals.width;
    p.settings.height = vals.height;
    p.settings.fps = vals.fps;
    p.settings.duration = vals.duration;
    p.settings.background = vals.background;
    p.settings.transparent = vals.transparent;
    this.time = U.clamp(this.time, 0, vals.duration - 0.001);
    Renderer.clearCaches();
    this.commit('Project settings');
    Renderer.zoomToFit();
    UI.fitTimeline();
  },

  /* ------------------------------- prefs -------------------------------- */
  savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        tool: this.tool, autoKey: this.autoKey, onion: this.onion, grid: this.grid,
        snap: this.snap, tlZoom: this.tlZoom, propsOpen: this.propsOpen
      }));
    } catch (e) { /* storage unavailable */ }
  }
};

/* =========================================================================
   Stage gestures
   ========================================================================= */
const StageInput = {
  pointers: new Map(),
  gesture: null,
  rect: null,

  init() {
    const c = UI.els.stage;
    c.addEventListener('pointerdown', e => this.down(e));
    c.addEventListener('pointermove', e => this.move(e));
    c.addEventListener('pointerup', e => this.up(e));
    c.addEventListener('pointercancel', e => this.up(e));
    c.addEventListener('wheel', e => this.wheel(e), { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('dblclick', e => {
      const p = this.pos(e);
      if (!Renderer.hitLayer(p.x, p.y)) Renderer.zoomToFit();
    });
    c.addEventListener('gesturestart', e => e.preventDefault());
  },

  pos(e) {
    if (!this.rect) this.rect = UI.els.stage.getBoundingClientRect();
    return { x: e.clientX - this.rect.left, y: e.clientY - this.rect.top };
  },

  down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    const c = UI.els.stage;
    try { c.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    this.rect = c.getBoundingClientRect();
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) { this.startPinch(); return; }
    if (this.pointers.size > 2) return;
    if (App.playing) App.pause();

    const x = p.x, y = p.y;
    const startPan = (deselect) => {
      this.gesture = { type: 'pan', startX: x, startY: y, viewX: Renderer.view.x, viewY: Renderer.view.y, moved: false, deselect: !!deselect };
    };

    if (App.tool === 'pan' || (e.pointerType === 'mouse' && e.button === 1)) { startPan(false); return; }

    if (App.tool === 'pivot') {
      const layer = Renderer.hitLayer(x, y) || App.selLayer();
      if (layer && !layer.locked) { App.select('layer', layer.id); this.beginPivot(layer, x, y); return; }
      startPan(true); return;
    }
    if (App.tool === 'rotate') {
      const layer = Renderer.hitLayer(x, y);
      if (layer && !layer.locked) { App.select('layer', layer.id); this.beginRotate(layer, x, y); return; }
      startPan(true); return;
    }

    // select tool
    const handle = Renderer.hitHandle(x, y);
    const layer = App.selLayer();
    if (handle && layer && !layer.locked) {
      if (handle.type === 'rotate') { this.beginRotate(layer, x, y); return; }
      if (handle.type === 'scale') { this.beginScale(layer, x, y); return; }
      if (handle.type === 'pivot') { this.beginPivot(layer, x, y); return; }
    }
    const hit = Renderer.hitLayer(x, y);
    if (hit) { App.select('layer', hit.id); this.beginDrag(hit, x, y); return; }
    startPan(true);
  },

  move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.gesture && this.gesture.type === 'pinch') { this.movePinch(); return; }
    const g = this.gesture;
    if (!g) return;
    const t = App.time;

    if (g.type === 'pan') {
      Renderer.view.x = g.viewX + (p.x - g.startX);
      Renderer.view.y = g.viewY + (p.y - g.startY);
      Renderer.userView = true;
      if (Math.hypot(p.x - g.startX, p.y - g.startY) > 3) g.moved = true;
      App.needsRender = true;
      return;
    }

    if (g.type === 'drag') {
      const w = Renderer.screenToWorld(p.x, p.y);
      const d = g.parentInv.applyVec(w.x - g.startWorld.x, w.y - g.startWorld.y);
      Model.setProp(g.layer, 'x', g.startX + d.x, t, App.autoKey);
      Model.setProp(g.layer, 'y', g.startY + d.y, t, App.autoKey);
      g.moved = true;
      App.needsRender = true;
      UI.updatePropValues();
      return;
    }

    if (g.type === 'rotate') {
      const a = Math.atan2(p.y - g.pivotScreen.y, p.x - g.pivotScreen.x);
      let rot = g.startRot + U.deg(a - g.startAngle);
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      Model.setProp(g.layer, 'rotation', rot, t, App.autoKey);
      g.moved = true;
      App.needsRender = true;
      UI.updatePropValues();
      return;
    }

    if (g.type === 'scale') {
      const d = Math.hypot(p.x - g.pivotScreen.x, p.y - g.pivotScreen.y);
      const f = Math.max(0.001, d / Math.max(0.001, g.startDist));
      Model.setProp(g.layer, 'scaleX', g.startSX * f, t, App.autoKey);
      Model.setProp(g.layer, 'scaleY', g.startSY * f, t, App.autoKey);
      g.moved = true;
      App.needsRender = true;
      UI.updatePropValues();
      return;
    }

    if (g.type === 'pivot') {
      const w = Renderer.screenToWorld(p.x, p.y);
      const a = g.inv.apply(g.worldStart.x, g.worldStart.y);
      const b = g.inv.apply(w.x, w.y);
      const dx = b.x - a.x, dy = b.y - a.y;
      const s = g.snap;
      const px = s.pivot.x + dx, py = s.pivot.y + dy;
      g.layer.pivot.x = px;
      g.layer.pivot.y = py;
      const dImgX = px - s.pivot.x, dImgY = py - s.pivot.y;
      const d0 = s.baseL.applyVec(dImgX, dImgY);
      g.layer.base.x = s.xBase + d0.x;
      g.layer.base.y = s.yBase + d0.y;
      g.layer.keys.x = s.xMats.map(({ k, L }) => {
        const d = L.applyVec(dImgX, dImgY);
        return { t: k.t, v: k.v + d.x, e: k.e };
      });
      g.layer.keys.y = s.yMats.map(({ k, L }) => {
        const d = L.applyVec(dImgX, dImgY);
        return { t: k.t, v: k.v + d.y, e: k.e };
      });
      g.moved = true;
      App.needsRender = true;
      UI.updatePropValues();
    }
  },

  up(e) {
    this.pointers.delete(e.pointerId);
    if (this.gesture && this.gesture.type === 'pinch') {
      if (this.pointers.size < 2) this.gesture = null;
      return;
    }
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    if (g.type === 'pan') {
      if (g.deselect && !g.moved) App.select(null);
      return;
    }
    if (g.type === 'drag' && g.moved) App.commit('Move layer');
    else if (g.type === 'rotate' && g.moved) App.commit('Rotate layer');
    else if (g.type === 'scale' && g.moved) App.commit('Scale layer');
    else if (g.type === 'pivot' && g.moved) App.commit('Move pivot');
  },

  wheel(e) {
    e.preventDefault();
    const p = this.pos(e);
    if (e.ctrlKey || e.metaKey) Renderer.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.002));
    else Renderer.panBy(-e.deltaX, -e.deltaY);
  },

  startPinch() {
    const pts = [...this.pointers.values()];
    const a = pts[0], b = pts[1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const world = Renderer.screenToWorld(mid.x, mid.y);
    this.gesture = {
      type: 'pinch',
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: Renderer.view.zoom,
      world
    };
    if (App.playing) App.pause();
  },

  movePinch() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return;
    const a = pts[0], b = pts[1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const g = this.gesture;
    Renderer.view.zoom = U.clamp(g.zoom * dist / g.dist, 0.02, 10);
    const p = Renderer.worldToScreen(g.world.x, g.world.y);
    Renderer.view.x += mid.x - p.x;
    Renderer.view.y += mid.y - p.y;
    App.needsRender = true;
  },

  /* ------------------------- gesture starters ------------------------- */
  beginDrag(layer, x, y) {
    const p = App.project, t = App.time;
    const parent = layer.parent ? Model.getLayer(p, layer.parent) : null;
    const parentM = parent ? Model.boneMatrix(p, parent, t) : Mat.identity();
    if (App.autoKey) Model.ensureKeys(layer, ['x', 'y'], t);
    this.gesture = {
      type: 'drag', layer,
      startWorld: Renderer.screenToWorld(x, y),
      startX: Model.sample(layer, 'x', t),
      startY: Model.sample(layer, 'y', t),
      parentInv: parentM.inverse(),
      moved: false
    };
  },

  beginRotate(layer, x, y) {
    const m = Model.matrix(App.project, layer, App.time);
    const pw = m.apply(layer.pivot.x, layer.pivot.y);
    const ps = Renderer.worldToScreen(pw.x, pw.y);
    if (App.autoKey) Model.ensureKeys(layer, ['rotation'], App.time);
    this.gesture = {
      type: 'rotate', layer,
      startAngle: Math.atan2(y - ps.y, x - ps.x),
      startRot: Model.sample(layer, 'rotation', App.time),
      pivotScreen: ps,
      moved: false
    };
  },

  beginScale(layer, x, y) {
    const m = Model.matrix(App.project, layer, App.time);
    const pw = m.apply(layer.pivot.x, layer.pivot.y);
    const ps = Renderer.worldToScreen(pw.x, pw.y);
    if (App.autoKey) Model.ensureKeys(layer, ['scaleX', 'scaleY'], App.time);
    this.gesture = {
      type: 'scale', layer,
      startDist: Math.max(1, Math.hypot(x - ps.x, y - ps.y)),
      startSX: Model.sample(layer, 'scaleX', App.time),
      startSY: Model.sample(layer, 'scaleY', App.time),
      pivotScreen: ps,
      moved: false
    };
  },

  beginPivot(layer, x, y) {
    const s = {
      pivot: { x: layer.pivot.x, y: layer.pivot.y },
      xBase: layer.base.x, yBase: layer.base.y,
      baseL: Model.localLinear(layer, App.time),
      xMats: layer.keys.x.map(k => ({ k: { ...k }, L: Model.localLinear(layer, k.t) })),
      yMats: layer.keys.y.map(k => ({ k: { ...k }, L: Model.localLinear(layer, k.t) }))
    };
    this.gesture = {
      type: 'pivot', layer, snap: s,
      worldStart: Renderer.screenToWorld(x, y),
      inv: Model.matrix(App.project, layer, App.time).inverse(),
      moved: false
    };
  }
};

/* =========================================================================
   Playback loop
   ========================================================================= */
function loop(now) {
  requestAnimationFrame(loop);
  if (App.playing) {
    const dt = Math.min(0.1, (now - App._last) / 1000);
    App._last = now;
    const dur = App.project.settings.duration;
    const fps = App.project.settings.fps;
    let t = App.time + dt * fps;
    if (t >= dur) {
      if (App.loop) {
        t = 0;
        AudioEngine.play(App.project, 0, fps).catch(() => {});
      } else {
        t = dur - 0.001;
        App.pause();
      }
    }
    App.time = t;
    UI.updatePlayhead();
    App.needsRender = true;
  } else {
    App._last = now;
  }
  if (App.needsRender) {
    App.needsRender = false;
    Renderer.render();
  }
}

/* =========================================================================
   Global handlers
   ========================================================================= */
function onKeyDown(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key;

  if (mod) {
    const k = key.toLowerCase();
    if (k === 'z') { e.preventDefault(); e.shiftKey ? App.redo() : App.undo(); return; }
    if (k === 'y') { e.preventDefault(); App.redo(); return; }
    if (k === 's') { e.preventDefault(); App.saveProject(); return; }
    if (k === 'e') { e.preventDefault(); UI.openExport(); return; }
    if (k === 'o') { e.preventDefault(); UI.pickProject(); return; }
    return;
  }
  if (key === ' ') { e.preventDefault(); App.togglePlay(); return; }
  if (key === 'Escape') {
    if (UI.closeTopModal()) return;
    if (UI.menuEl) { UI.closeMenu(); return; }
    App.select(null);
    return;
  }
  if (key === 'ArrowLeft') { e.preventDefault(); App.stepFrame(e.shiftKey ? -10 : -1); return; }
  if (key === 'ArrowRight') { e.preventDefault(); App.stepFrame(e.shiftKey ? 10 : 1); return; }
  if (key === 'Home') { App.setTime(0); return; }
  if (key === 'End') { App.setTime(App.project.settings.duration - 1); return; }
  if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); App.deleteSelection(); return; }

  const k = key.toLowerCase();
  if (k === 'v') App.setTool('select');
  else if (k === 'r') App.setTool('rotate');
  else if (k === 'p') App.setTool('pivot');
  else if (k === 'h') App.setTool('pan');
  else if (k === 'k') App.addKeyAtPlayhead();
  else if (k === 'o') App.toggleOnion();
  else if (k === 'g') { App.grid = !App.grid; App.needsRender = true; UI.updateToggles(); }
  else if (k === '+' || k === '=') Renderer.setZoom(Renderer.view.zoom * 1.25);
  else if (k === '-') Renderer.setZoom(Renderer.view.zoom / 1.25);
  else if (k === '0') Renderer.zoomToFit();
}

function bindGlobal() {
  window.addEventListener('keydown', onKeyDown);
  let rt = 0;
  const onResize = () => {
    StageInput.rect = null;
    Renderer.resize();
    if (!Renderer.userView) Renderer.zoomToFit();
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (UI.syncNameWidth()) UI.refreshTimeline();
      else UI.scrollToPlayhead();
    }, 120);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
  if (window.ResizeObserver) {
    new ResizeObserver(() => { StageInput.rect = null; Renderer.resize(); }).observe(UI.els.stageWrap);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && App.playing) App.pause();
  });
  window.addEventListener('beforeunload', e => {
    if (App.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('paste', e => {
    if (e.target && e.target.closest && e.target.closest('input,textarea')) return;
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []).filter(i => i.type.startsWith('image/'));
    if (items.length) {
      e.preventDefault();
      App.importFiles(items.map(i => i.getAsFile()).filter(Boolean));
    }
  });
  const wrap = UI.els.stageWrap;
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());
  wrap.addEventListener('dragenter', e => { e.preventDefault(); wrap.classList.add('dragover'); });
  wrap.addEventListener('dragover', e => { e.preventDefault(); wrap.classList.add('dragover'); });
  wrap.addEventListener('dragleave', e => { if (e.target === wrap) wrap.classList.remove('dragover'); });
  wrap.addEventListener('drop', e => {
    e.preventDefault();
    wrap.classList.remove('dragover');
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length) App.importFiles(files);
  });
}

/* =========================================================================
   Persistence
   ========================================================================= */
function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    App.tool = p.tool || 'select';
    App.autoKey = p.autoKey !== false;
    App.onion = !!p.onion;
    App.grid = !!p.grid;
    App.snap = p.snap !== false;
    App.tlZoom = p.tlZoom || 8;
    App.propsOpen = p.propsOpen !== false;
  } catch (e) { /* ignore */ }
}

/* ------------------------- autosave storage ------------------------- */
/* Projects embed their PNG/audio assets, so they routinely exceed the ~5 MB
   localStorage budget. Autosave therefore prefers IndexedDB and only falls
   back to localStorage when IndexedDB is unavailable. */
const IDB_NAME = 'suction-studio';
const IDB_STORE = 'kv';

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('no indexeddb'));
    let req;
    try { req = indexedDB.open(IDB_NAME, 1); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function scheduleAutosave() {
  clearTimeout(App._saveTimer);
  App._saveTimer = setTimeout(async () => {
    const json = Model.serialize(App.project);
    try {
      await idbSet(AUTOSAVE_KEY, json);
      // Keep a small localStorage copy so other tabs / older sessions can see it.
      try { if (json.length < 4.5 * 1024 * 1024) localStorage.setItem(AUTOSAVE_KEY, json); } catch (e) { /* quota */ }
      return;
    } catch (e) { /* fall through to localStorage */ }
    try {
      if (json.length < 4.5 * 1024 * 1024) localStorage.setItem(AUTOSAVE_KEY, json);
    } catch (e) { /* storage full or unavailable */ }
  }, 1200);
}

async function clearAutosave() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* noop */ }
  try {
    const db = await idbOpen();
    await new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(AUTOSAVE_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); resolve(); };
    });
  } catch (e) { /* noop */ }
}

async function readAutosave() {
  let raw = null;
  try { raw = await idbGet(AUTOSAVE_KEY); } catch (e) { raw = null; }
  if (!raw) {
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { raw = null; }
  }
  if (!raw) return null;
  try {
    return Model.deserialize(raw);
  } catch (e) {
    return null;
  }
}

function promptRestore(saved) {
  const body = U.el('div');
  body.innerHTML = `<p class="modal-text">A previous session was found: <b>${U.esc(saved.name)}</b>.<br>Restore it, or start fresh?</p>`;
  const foot = U.el('div', 'modal-actions');
  const fresh = U.el('button', 'btn'); fresh.textContent = 'Start fresh';
  const restore = U.el('button', 'btn primary'); restore.textContent = 'Restore session';
  foot.appendChild(fresh); foot.appendChild(restore);
  const inst = UI.openModal({ title: 'Welcome back', body, footer: foot, width: '440px', dismissible: false });
  fresh.addEventListener('click', () => {
    inst.close();
    clearAutosave();
  });
  restore.addEventListener('click', () => {
    inst.close();
    App.loadProject(saved);
    UI.toast('Session restored', 'success');
  });
}

/* =========================================================================
   Boot
   ========================================================================= */
function boot() {
  loadPrefs();
  // On narrow screens the inspector is an overlay drawer — start closed so the stage is visible.
  if (window.matchMedia && window.matchMedia('(max-width: 1020px)').matches) App.propsOpen = false;
  App.project = DefaultProject.build();
  UI.init();
  Renderer.init(UI.els.stage);
  StageInput.init();
  bindGlobal();

  const main = document.getElementById('main');
  main.classList.toggle('props-collapsed', !App.propsOpen);
  main.classList.toggle('props-open', App.propsOpen);

  App.resetHistory();

  requestAnimationFrame(() => {
    Renderer.resize();
    Renderer.zoomToFit();
    UI.fitTimeline();
    UI.refreshTopbar();
  });
  requestAnimationFrame(loop);

  readAutosave().then(saved => {
    if (saved) setTimeout(() => promptRestore(saved), 350);
  }).catch(() => { /* ignore */ });
}

boot();
