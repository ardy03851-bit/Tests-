/* =========================================================================
   Suction Studio — ui.js
   All chrome: top bar, tool rail, timeline, inspector, menus, modals,
   asset library, toasts and export dialogs.
   ========================================================================= */
'use strict';

let NAME_W = 224;
const ROW_H = 30;

const UI = {
  els: {},
  propEls: { inputs: [], dots: [], pivot: [], easing: null },
  menuEl: null,
  modals: [],
  assetsOpen: false,
  _scrubbing: false,

  /* ================================================================ */
  init() {
    this.cache();
    this.syncNameWidth();
    U.hydrateIcons(document);
    this.buildRail();
    this.buildTopbar();
    this.buildTimeline();
    this.buildAssetDrawer();
    this.buildFileInputs();
    this.refreshAll();
  },

  /* Keep the timeline geometry in sync with the CSS --name-w breakpoint. */
  syncNameWidth() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--name-w');
    const v = parseInt(raw, 10);
    if (v > 80 && v !== NAME_W) { NAME_W = v; return true; }
    return false;
  },

  /* Close button for the inspector when it runs as an overlay drawer. */
  inspClose() {
    const b = U.el('button', 'btn icon sm insp-close');
    b.type = 'button';
    b.title = 'Close inspector';
    b.setAttribute('aria-label', 'Close inspector');
    b.innerHTML = U.icon('close', 18);
    b.addEventListener('click', () => this.toggleProps());
    return b;
  },

  cache() {
    const ids = ['topbar', 'btnFile', 'btnUndo', 'btnRedo', 'btnProjectName', 'tcTop', 'btnAssets',
      'btnSettings', 'btnExport', 'rail', 'stage', 'stageWrap', 'stageBadge', 'hudZoom', 'hudZoomIn',
      'hudZoomOut', 'hudFit', 'hudGrid', 'hudOnion', 'hudProps', 'props', 'timeline', 'tlToolbar',
      'tlScroll', 'tlContent', 'tlRuler', 'tlRows', 'tlPlayhead', 'btnPlay', 'btnLoop', 'btnAutoKey',
      'btnOnion', 'btnSnap', 'btnAddLayer', 'btnDuplicate', 'btnDelete', 'tlZoomIn', 'tlZoomOut', 'tlFit',
      'btnToStart', 'btnPrev', 'btnNext', 'btnToEnd',
      'tcFrames', 'tcTotal', 'tcSeconds', 'toasts', 'modalRoot', 'menuRoot', 'stageTip'];
    for (const id of ids) this.els[id] = document.getElementById(id);
    this.els.tlResize = document.getElementById('tlResize');
  },

  /* ================================================================ */
  buildRail() {
    const tools = [
      { id: 'select', icon: 'select', label: 'Select' },
      { id: 'rotate', icon: 'rotate', label: 'Rotate' },
      { id: 'pivot', icon: 'pivot', label: 'Pivot' },
      { id: 'pan', icon: 'pan', label: 'Pan' }
    ];
    const rail = U.clear(this.els.rail);
    for (const t of tools) {
      const b = U.el('button', 'rail-btn');
      b.dataset.tool = t.id;
      b.innerHTML = U.icon(t.icon, 19) + `<span>${t.label}</span>`;
      b.title = t.label;
      b.addEventListener('click', () => App.setTool(t.id));
      rail.appendChild(b);
    }
    rail.appendChild(U.el('div', 'rail-sep'));
    const key = U.el('button', 'rail-btn');
    key.id = 'railAddKey';
    key.innerHTML = U.icon('keyPlus', 19) + '<span>Key</span>';
    key.title = 'Add keyframe (K)';
    key.addEventListener('click', () => App.addKeyAtPlayhead());
    rail.appendChild(key);
    const cam = U.el('button', 'rail-btn');
    cam.id = 'railCamera';
    cam.innerHTML = U.icon('camera', 19) + '<span>Camera</span>';
    cam.title = 'Select camera';
    cam.addEventListener('click', () => App.select('camera'));
    rail.appendChild(cam);
    rail.appendChild(U.el('div', 'rail-sep'));
    const help = U.el('button', 'rail-btn');
    help.innerHTML = U.icon('help', 19) + '<span>Help</span>';
    help.title = 'Help & shortcuts';
    help.addEventListener('click', () => this.openHelp());
    rail.appendChild(help);
  },

  buildTopbar() {
    const e = this.els;
    e.btnFile.addEventListener('click', ev => this.fileMenu(ev.currentTarget));
    e.btnUndo.addEventListener('click', () => App.undo());
    e.btnRedo.addEventListener('click', () => App.redo());
    e.btnProjectName.addEventListener('click', () => this.renameProject());
    e.btnAssets.addEventListener('click', () => this.toggleAssets());
    e.btnSettings.addEventListener('click', () => this.openSettings());
    e.btnExport.addEventListener('click', () => this.openExport());

    e.hudZoomIn.addEventListener('click', () => Renderer.setZoom(Renderer.view.zoom * 1.25));
    e.hudZoomOut.addEventListener('click', () => Renderer.setZoom(Renderer.view.zoom / 1.25));
    e.hudFit.addEventListener('click', () => Renderer.zoomToFit());
    e.hudGrid.addEventListener('click', () => { App.grid = !App.grid; App.needsRender = true; App.savePrefs(); this.refreshTopbar(); });
    e.hudOnion.addEventListener('click', () => App.toggleOnion());
    e.hudProps.addEventListener('click', () => this.toggleProps());
  },

  buildTimeline() {
    const e = this.els;
    e.btnPlay.addEventListener('click', () => App.togglePlay());
    e.btnToStart.addEventListener('click', () => App.setTime(0));
    e.btnPrev.addEventListener('click', () => App.stepFrame(-1));
    e.btnNext.addEventListener('click', () => App.stepFrame(1));
    e.btnToEnd.addEventListener('click', () => App.setTime(App.project.settings.duration - 1));
    e.btnLoop.addEventListener('click', () => { App.loop = !App.loop; this.updateTransport(); });
    e.btnAutoKey.addEventListener('click', () => { App.autoKey = !App.autoKey; App.savePrefs(); this.refreshTopbar(); });
    e.btnOnion.addEventListener('click', () => App.toggleOnion());
    e.btnSnap.addEventListener('click', () => { App.snap = !App.snap; App.savePrefs(); this.refreshTopbar(); });
    e.btnAddLayer.addEventListener('click', ev => this.addLayerMenu(ev.currentTarget));
    e.btnDuplicate.addEventListener('click', () => App.duplicateSelection());
    e.btnDelete.addEventListener('click', () => App.deleteSelection());
    e.tlZoomIn.addEventListener('click', () => this.setTimelineZoom(App.tlZoom * 1.35));
    e.tlZoomOut.addEventListener('click', () => this.setTimelineZoom(App.tlZoom / 1.35));
    e.tlFit.addEventListener('click', () => this.fitTimeline());

    e.tlRuler.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.tl-key')) return;
      this.beginScrub(ev);
    });

    // resize timeline
    if (e.tlResize) {
      let startY = 0, startH = 0;
      const move = ev => {
        const h = U.clamp(startH + (startY - ev.clientY), 150, 460);
        document.documentElement.style.setProperty('--timeline-h', h + 'px');
        requestAnimationFrame(() => Renderer.resize());
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      e.tlResize.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        startY = ev.clientY;
        startH = this.els.timeline.getBoundingClientRect().height;
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
    }
  },

  buildAssetDrawer() {
    const scrim = U.el('div', 'drawer-scrim');
    scrim.id = 'drawerScrim';
    const drawer = U.el('aside', 'drawer');
    drawer.id = 'assetDrawer';
    drawer.innerHTML = `
      <div class="drawer-head">
        <div><div class="drawer-kicker">LIBRARY</div><div class="drawer-title">Assets</div></div>
        <div class="drawer-actions">
          <button class="btn sm" id="assetImport">${U.icon('upload', 16)}<span>Import</span></button>
          <button class="btn icon sm" id="assetClose" title="Close">${U.icon('x', 18)}</button>
        </div>
      </div>
      <div class="asset-grid" id="assetGrid"></div>
      <div class="drawer-foot">Tap an image to place it · tap audio to add a clip at the playhead</div>
    `;
    document.getElementById('app').appendChild(scrim);
    document.getElementById('app').appendChild(drawer);
    scrim.addEventListener('click', () => this.toggleAssets(false));
    drawer.querySelector('#assetClose').addEventListener('click', () => this.toggleAssets(false));
    drawer.querySelector('#assetImport').addEventListener('click', () => this.pickAssets());
    this.els.drawer = drawer;
    this.els.drawerScrim = scrim;
    this.els.assetGrid = drawer.querySelector('#assetGrid');
  },

  buildFileInputs() {
    const proj = document.createElement('input');
    proj.type = 'file';
    proj.accept = '.json,application/json';
    proj.style.display = 'none';
    proj.addEventListener('change', async () => {
      const f = proj.files && proj.files[0];
      proj.value = '';
      if (f) await App.openProjectFile(f);
    });
    document.body.appendChild(proj);
    this.els.fileProject = proj;

    const assets = document.createElement('input');
    assets.type = 'file';
    assets.multiple = true;
    assets.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.ogg,.m4a,.aac';
    assets.style.display = 'none';
    assets.addEventListener('change', async () => {
      const files = Array.from(assets.files || []);
      assets.value = '';
      if (files.length) await App.importFiles(files);
    });
    document.body.appendChild(assets);
    this.els.fileAssets = assets;
  },

  pickAssets() { this.els.fileAssets.click(); },
  pickProject() { this.els.fileProject.click(); },

  /* ================================================================ */
  /* refresh                                                          */
  /* ================================================================ */
  refreshAll() {
    this.refreshTopbar();
    this.refreshTimeline();
    this.refreshProps();
    this.refreshAssets();
    App.needsRender = true;
  },

  refreshTopbar() {
    const e = this.els, p = App.project;
    if (!p) return;
    U.setText(e.btnProjectName, p.name);
    U.setText(e.stageBadge, `${p.settings.width} × ${p.settings.height} · ${p.settings.fps} fps`);
    U.setText(e.tcTop, `F ${String(Math.round(App.time)).padStart(3, '0')} · ${U.seconds(App.time, p.settings.fps)}s`);
    U.setText(e.tcFrames, 'F ' + String(Math.round(App.time)).padStart(3, '0'));
    U.setText(e.tcTotal, String(p.settings.duration).padStart(3, '0'));
    U.setText(e.tcSeconds, U.seconds(App.time, p.settings.fps) + 's');
    U.setText(e.hudZoom, Math.round(Renderer.view.zoom * 100) + '%');
    e.btnUndo.disabled = App.histIndex <= 0;
    e.btnRedo.disabled = App.histIndex >= App.history.length - 1;
    this.updateTransport();
    this.updateToggles();
  },

  updateToggles() {
    const e = this.els;
    e.btnAutoKey.classList.toggle('active', App.autoKey);
    e.btnOnion.classList.toggle('active', App.onion);
    e.btnSnap.classList.toggle('active', App.snap);
    e.hudOnion.classList.toggle('active', App.onion);
    e.hudGrid.classList.toggle('active', App.grid);
    e.hudProps.classList.toggle('active', App.propsOpen);
    for (const b of U.qsa('.rail-btn[data-tool]', this.els.rail)) {
      b.classList.toggle('active', b.dataset.tool === App.tool);
    }
    const camBtn = document.getElementById('railCamera');
    if (camBtn) camBtn.classList.toggle('active', App.selection.type === 'camera');
    const keyBtn = document.getElementById('railAddKey');
    if (keyBtn) keyBtn.classList.toggle('active', App.selection.type === 'layer' || App.selection.type === 'camera');
  },

  updateTransport() {
    const e = this.els;
    if (!e.btnPlay) return;
    e.btnPlay.innerHTML = U.icon(App.playing ? 'pause' : 'play', 20);
    e.btnLoop.classList.toggle('active', App.loop);
  },

  updatePlayhead() {
    const e = this.els;
    if (!e.tlPlayhead) return;
    const x = NAME_W + App.time * App.tlZoom;
    e.tlPlayhead.style.transform = `translate3d(${x}px,0,0)`;
    const p = App.project;
    U.setText(e.tcFrames, 'F ' + String(Math.round(App.time)).padStart(3, '0'));
    U.setText(e.tcSeconds, U.seconds(App.time, p.settings.fps) + 's');
    U.setText(e.tcTop, `F ${String(Math.round(App.time)).padStart(3, '0')} · ${U.seconds(App.time, p.settings.fps)}s`);
    // highlight keys at playhead
    for (const k of U.qsa('.tl-key', e.tlRows)) {
      k.classList.toggle('current', Math.abs(+k.dataset.time - Math.round(App.time)) < 0.01);
    }
    if (App.playing) this.scrollToPlayhead();
  },

  scrollToPlayhead() {
    const sc = this.els.tlScroll;
    if (!sc) return;
    const x = NAME_W + App.time * App.tlZoom;
    const left = sc.scrollLeft;
    const right = left + sc.clientWidth;
    if (x > right - 60 || x < left + NAME_W + 20) {
      sc.scrollLeft = Math.max(0, x - NAME_W - 80);
    }
  },

  setTimelineZoom(z) {
    App.tlZoom = U.clamp(z, 1, 60);
    App.savePrefs();
    this.refreshTimeline();
  },

  fitTimeline() {
    const sc = this.els.tlScroll;
    const avail = (sc.clientWidth || 600) - NAME_W - 60;
    const z = U.clamp(avail / Math.max(1, App.project.settings.duration), 1, 24);
    App.tlZoom = z;
    App.savePrefs();
    this.refreshTimeline();
    sc.scrollLeft = 0;
  },

  /* ================================================================ */
  /* timeline                                                         */
  /* ================================================================ */
  refreshTimeline() {
    const p = App.project;
    if (!p) return;
    const e = this.els;
    const dur = p.settings.duration;
    const ppf = App.tlZoom;
    const width = NAME_W + dur * ppf + 140;
    e.tlContent.style.width = width + 'px';
    this.buildRuler(dur, ppf);
    this.buildRows(dur, ppf);
    this.updatePlayhead();
  },

  frameLabel(f) {
    const fps = App.project.settings.fps;
    if (f % fps === 0) return (f / fps) + 's';
    return String(f);
  },

  buildRuler(dur, ppf) {
    const ruler = this.els.tlRuler;
    U.clear(ruler);
    ruler.style.width = (NAME_W + dur * ppf + 140) + 'px';
    const steps = [1, 2, 5, 10, 12, 24, 30, 48, 60, 120, 240, 480, 960, 1440];
    let step = steps.find(s => s * ppf >= 62) || 1440;
    for (let f = 0; f <= dur; f += step) {
      const tick = U.el('div', 'tl-tick');
      tick.style.left = (NAME_W + f * ppf) + 'px';
      tick.innerHTML = `<i></i><span>${this.frameLabel(f)}</span>`;
      ruler.appendChild(tick);
    }
    ruler.style.backgroundImage =
      `repeating-linear-gradient(to right, rgba(255,255,255,.13) 0 1px, transparent 1px ${step * ppf}px),` +
      `repeating-linear-gradient(to right, rgba(255,255,255,.05) 0 1px, transparent 1px ${ppf}px)`;
    ruler.style.backgroundPosition = `${NAME_W}px 100%, ${NAME_W}px 100%`;
  },

  buildRows(dur, ppf) {
    const rows = U.clear(this.els.tlRows);
    const p = App.project;
    const self = this;

    const makeName = (cls) => {
      const n = U.el('div', 'tl-name ' + cls);
      n.style.width = NAME_W + 'px';
      return n;
    };

    const cameraRow = U.el('div', 'tl-row camera-row' + (App.selection.type === 'camera' ? ' selected' : ''));
    const camName = makeName('camera');
    camName.innerHTML = `<span class="tl-type">${U.icon('camera', 14)}</span><span class="tl-label">Camera</span>
      <span class="mini-spacer"></span>
      <button class="mini-btn" data-cam="1" title="Camera options">${U.icon('more', 14)}</button>`;
    const camTrack = U.el('div', 'tl-track');
    camTrack.style.width = (dur * ppf + 140) + 'px';
    for (const t of Model.keyTimes(p.camera)) {
      camTrack.appendChild(this.keyDiamond(t, 'camera', null, ppf));
    }
    camName.addEventListener('click', ev => {
      if (ev.target.closest('.mini-btn')) return;
      App.select('camera');
    });
    camName.querySelector('[data-cam]').addEventListener('click', ev => {
      ev.stopPropagation();
      this.cameraMenu(ev.currentTarget);
    });
    camTrack.addEventListener('pointerdown', ev => {
      App.select('camera');
      this.beginScrub(ev);
    });
    cameraRow.appendChild(camName); cameraRow.appendChild(camTrack);
    rows.appendChild(cameraRow);

    for (let i = p.layers.length - 1; i >= 0; i--) {
      const layer = p.layers[i];
      const depth = Model.layerDepth(p, layer);
      const row = U.el('div', 'tl-row layer-row' + (App.selection.type === 'layer' && App.selection.id === layer.id ? ' selected' : ''));
      const name = makeName('');
      name.innerHTML = `
        <span class="tl-indent" style="width:${Math.min(48, depth * 12)}px"></span>
        <span class="tl-type">${layer.assetId ? U.icon('image', 14) : U.icon('pivot', 14)}</span>
        <span class="tl-label" title="${U.esc(layer.name)}">${U.esc(layer.name)}</span>
        <span class="mini-spacer"></span>
        <button class="mini-btn eye ${layer.visible ? '' : 'off'}" title="Show / hide">${U.icon(layer.visible ? 'eye' : 'eyeOff', 14)}</button>
        <button class="mini-btn lock ${layer.locked ? 'on' : ''}" title="Lock / unlock">${U.icon(layer.locked ? 'lock' : 'unlock', 14)}</button>
        <button class="mini-btn more" title="Layer options">${U.icon('more', 14)}</button>`;
      const track = U.el('div', 'tl-track');
      track.style.width = (dur * ppf + 140) + 'px';
      for (const t of Model.keyTimes(layer)) track.appendChild(this.keyDiamond(t, 'layer', layer.id, ppf));

      name.addEventListener('click', ev => {
        if (ev.target.closest('.mini-btn')) return;
        App.select('layer', layer.id);
      });
      name.addEventListener('dblclick', ev => {
        if (ev.target.closest('.mini-btn')) return;
        this.renameLayer(layer);
      });
      name.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        App.select('layer', layer.id);
        this.layerMenu(ev.clientX, ev.clientY, layer);
      });
      name.querySelector('.eye').addEventListener('click', ev => {
        ev.stopPropagation();
        App.toggleLayerVisible(layer.id);
      });
      name.querySelector('.lock').addEventListener('click', ev => {
        ev.stopPropagation();
        App.toggleLayerLocked(layer.id);
      });
      name.querySelector('.more').addEventListener('click', ev => {
        ev.stopPropagation();
        this.layerMenu(ev.clientX, ev.clientY, layer);
      });
      track.addEventListener('pointerdown', ev => {
        if (ev.target.closest('.tl-key')) return;
        App.select('layer', layer.id);
        this.beginScrub(ev);
      });
      row.appendChild(name); row.appendChild(track);
      rows.appendChild(row);
    }

    for (const track of p.audioTracks) {
      const row = U.el('div', 'tl-row audio-row' + (App.selection.type === 'clip' && track.clips.some(c => c.id === App.selection.id) ? ' selected' : ''));
      const name = makeName('audio');
      name.innerHTML = `
        <span class="tl-type">${U.icon('music', 14)}</span>
        <span class="tl-label" title="${U.esc(track.name)}">${U.esc(track.name)}</span>
        <span class="mini-spacer"></span>
        <button class="mini-btn mute ${track.muted ? 'on' : ''}" title="Mute / unmute">${U.icon(track.muted ? 'eyeOff' : 'music', 14)}</button>
        <button class="mini-btn more" title="Track options">${U.icon('more', 14)}</button>`;
      const lane = U.el('div', 'tl-track audio-lane');
      lane.style.width = (dur * ppf + 140) + 'px';
      for (const clip of track.clips) {
        lane.appendChild(this.clipBlock(clip, track, ppf));
      }
      name.addEventListener('click', ev => {
        if (ev.target.closest('.mini-btn')) return;
        App.select('track', track.id);
      });
      name.querySelector('.mute').addEventListener('click', ev => {
        ev.stopPropagation();
        App.toggleTrackMuted(track.id);
      });
      name.querySelector('.more').addEventListener('click', ev => {
        ev.stopPropagation();
        this.trackMenu(ev.clientX, ev.clientY, track);
      });
      lane.addEventListener('pointerdown', ev => {
        if (ev.target.closest('.tl-clip')) return;
        this.beginScrub(ev);
      });
      row.appendChild(name); row.appendChild(lane);
      rows.appendChild(row);
    }

    // spacer row so the last row is reachable
    const spacer = U.el('div', 'tl-row spacer');
    spacer.appendChild(makeName(''));
    spacer.appendChild(U.el('div', 'tl-track'));
    rows.appendChild(spacer);
  },

  keyDiamond(t, anim, layerId, ppf) {
    const k = U.el('button', 'tl-key');
    k.type = 'button';
    k.style.left = (t * ppf) + 'px';
    k.dataset.time = t;
    k.title = 'Frame ' + Math.round(t);
    k.addEventListener('pointerdown', ev => {
      ev.stopPropagation();
      ev.preventDefault();
      if (anim === 'camera') App.select('camera');
      else App.select('layer', layerId);
      App.setTime(t);

      // Drag the diamond to slide every key on that frame.
      const startX = ev.clientX;
      const startT = t;
      const zoomAtStart = App.tlZoom;
      const maxT = App.project.settings.duration;
      let current = startT;
      let moved = false;
      const onMove = e => {
        const dx = e.clientX - startX;
        if (!moved) {
          if (Math.abs(dx) < 4) return;
          moved = true;
          try { k.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        }
        const nt = U.clamp(Math.round(startT + dx / zoomAtStart), 0, maxT);
        if (nt === current) return;
        current = nt;
        k.style.left = (nt * zoomAtStart) + 'px';
        k.dataset.time = nt;
        k.title = 'Frame ' + nt;
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (moved && current !== startT) {
          const target = anim === 'camera' ? App.project.camera : Model.getLayer(App.project, layerId);
          if (Model.moveKeysAt(target, startT, current)) {
            App.setTime(current);
            App.commit('Move keyframe');
          } else {
            this.refreshTimeline();
          }
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    });
    return k;
  },

  clipBlock(clip, track, ppf) {
    const fps = App.project.settings.fps;
    const w = Math.max(18, clip.duration * fps * ppf);
    const el = U.el('div', 'tl-clip' + (App.selection.type === 'clip' && App.selection.id === clip.id ? ' selected' : ''));
    el.style.left = (clip.start * ppf) + 'px';
    el.style.width = w + 'px';
    const asset = Model.getAsset(App.project, clip.assetId);
    el.innerHTML = `<span class="clip-handle l"></span><span class="clip-label">${U.esc(asset ? asset.name : 'Audio')}</span><span class="clip-handle r"></span>`;
    el.addEventListener('pointerdown', ev => {
      ev.stopPropagation();
      ev.preventDefault();
      const handle = ev.target.classList.contains('clip-handle') ? (ev.target.classList.contains('l') ? 'l' : 'r') : null;
      this.beginClipDrag(ev, clip, track, handle);
    });
    return el;
  },

  beginClipDrag(ev, clip, track, handle) {
    App.select('clip', clip.id);
    if (App.playing) App.pause();
    const el = ev.currentTarget;
    const startX = ev.clientX;
    const start = { start: clip.start, offset: clip.offset, duration: clip.duration };
    const fps = App.project.settings.fps;
    const ppf = App.tlZoom;
    let moved = false;
    const move = e => {
      const dx = (e.clientX - startX) / ppf;
      if (Math.abs(dx) > 0.01) moved = true;
      if (handle === 'l') {
        let ns = U.clamp(Math.round(start.start + dx), 0, App.project.settings.duration - 1);
        const delta = (ns - start.start) / fps;
        if (start.duration - delta <= 0.02) ns = start.start;
        clip.start = ns;
        clip.offset = Math.max(0, start.offset + (ns - start.start) / fps);
        clip.duration = Math.max(0.02, start.duration - (ns - start.start) / fps);
      } else if (handle === 'r') {
        let end = U.clamp(Math.round(start.start + start.duration * fps + dx), start.start + 1, App.project.settings.duration);
        clip.duration = (end - start.start) / fps;
      } else {
        clip.start = U.clamp(Math.round(start.start + dx), 0, App.project.settings.duration - 1);
      }
      if (el && el.isConnected) {
        el.style.left = (clip.start * ppf) + 'px';
        el.style.width = Math.max(18, clip.duration * fps * ppf) + 'px';
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (moved) App.commit('Move audio clip');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  },

  beginScrub(ev) {
    if (ev) ev.preventDefault();
    if (App.playing) App.pause();
    this._scrubbing = true;
    const move = e => this.scrubTo(e.clientX);
    const up = () => {
      this._scrubbing = false;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    if (ev && ev.clientX != null) this.scrubTo(ev.clientX);
  },

  scrubTo(clientX) {
    const content = this.els.tlContent.getBoundingClientRect();
    const x = clientX - content.left - NAME_W;
    let f = x / App.tlZoom;
    f = App.snap ? Math.round(f) : f;
    App.setTime(U.clamp(f, 0, App.project.settings.duration - 1));
  },

  /* ================================================================ */
  /* inspector                                                        */
  /* ================================================================ */
  selLayer() {
    return App.selection.type === 'layer' ? Model.getLayer(App.project, App.selection.id) : null;
  },

  refreshProps() {
    const panel = this.els.props;
    if (!panel) return;
    U.clear(panel);
    this.propEls = { inputs: [], dots: [], pivot: [], easing: null };
    const sel = App.selection;
    if (sel.type === 'layer') {
      const layer = this.selLayer();
      if (layer) { panel.appendChild(this.buildLayerProps(layer)); this.updatePropValues(); return; }
      App.selection = { type: null, id: null };
    }
    if (sel.type === 'camera') {
      panel.appendChild(this.buildCameraProps());
      this.updatePropValues();
      return;
    }
    if (sel.type === 'clip') {
      const found = Model.getClip(App.project, sel.id);
      if (found) { panel.appendChild(this.buildClipProps(found.clip, found.track)); return; }
      App.selection = { type: null, id: null };
    }
    panel.appendChild(this.buildProjectProps());
  },

  section(title, right) {
    const s = U.el('section', 'sec');
    const h = U.el('div', 'sec-head');
    h.innerHTML = `<span>${title}</span>${right || ''}`;
    s.appendChild(h);
    return s;
  },

  numRow(prop, label, unit, step, anim = 'layer', scale = 1) {
    const row = U.el('div', 'prow');
    row.innerHTML = `
      <button class="keydot" data-prop="${prop}" data-anim="${anim}" title="Toggle keyframe at playhead"></button>
      <label class="plabel" data-prop="${prop}" data-anim="${anim}" data-step="${step}" data-scale="${scale}">${label}</label>
      <div class="pval"><input type="text" inputmode="decimal" data-prop="${prop}" data-anim="${anim}" data-scale="${scale}" autocomplete="off" spellcheck="false"><span class="unit">${unit}</span></div>`;
    const input = row.querySelector('input');
    input.addEventListener('change', () => this.commitInput(input));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    input.addEventListener('pointerdown', e => e.stopPropagation());
    this.bindScrub(row.querySelector('.plabel'));
    this.propEls.inputs.push(input);
    this.propEls.dots.push(row.querySelector('.keydot'));
    return row;
  },

  bindScrub(label) {
    label.addEventListener('pointerdown', ev => {
      ev.preventDefault();
      const animKind = label.dataset.anim;
      const prop = label.dataset.prop;
      const scale = +(label.dataset.scale || 1);
      const step = +(label.dataset.step || 1);
      const anim = animKind === 'camera' ? App.project.camera : this.selLayer();
      if (!anim) return;
      const rawStart = Model.sample(anim, prop, App.time);
      const startDisplay = rawStart * scale;
      const startX = ev.clientX;
      let moved = false;
      const move = e => {
        const dx = (e.clientX - startX) * step * (e.shiftKey ? 0.1 : 1);
        if (Math.abs(dx) > 0.01) moved = true;
        const display = startDisplay + dx;
        const raw = display / scale;
        Model.setProp(anim, prop, raw, App.time, App.autoKey);
        App.needsRender = true;
        this.updatePropValues();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (moved) App.commit('Edit ' + prop);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  },

  commitInput(input) {
    const anim = input.dataset.anim === 'camera' ? App.project.camera : this.selLayer();
    if (!anim) return;
    const raw = parseFloat(input.value);
    if (!Number.isFinite(raw)) { this.updatePropValues(); return; }
    const v = raw / +(input.dataset.scale || 1);
    Model.setProp(anim, input.dataset.prop, v, App.time, App.autoKey);
    App.commit('Edit ' + input.dataset.prop);
  },

  fmtValue(v) {
    if (!Number.isFinite(v)) return '0';
    const r = Math.round(v * 100) / 100;
    return String(r);
  },

  updatePropValues() {
    for (const input of this.propEls.inputs) {
      if (!input.isConnected) continue;
      const anim = input.dataset.anim === 'camera' ? App.project.camera : this.selLayer();
      if (!anim) continue;
      const raw = Model.sample(anim, input.dataset.prop, App.time) * +(input.dataset.scale || 1);
      if (document.activeElement !== input) input.value = this.fmtValue(raw);
    }
    for (const dot of this.propEls.dots) {
      if (!dot.isConnected) continue;
      const anim = dot.dataset.anim === 'camera' ? App.project.camera : this.selLayer();
      dot.classList.toggle('on', !!anim && Model.hasKeyAt(anim, dot.dataset.prop, Math.round(App.time)));
    }
    if (this.propEls.easing && this.propEls.easing.isConnected) {
      const anim = this.propEls.easing.dataset.anim === 'camera' ? App.project.camera : this.selLayer();
      const keysAt = anim ? Model.keysAtTime(anim, Math.round(App.time)) : {};
      const first = Object.values(keysAt)[0];
      this.propEls.easing.value = first ? first.e : '';
      this.propEls.easing.disabled = !first;
    }
  },

  buildLayerProps(layer) {
    const p = App.project;
    const asset = Model.getAsset(p, layer.assetId);
    const wrap = U.el('div', 'props-inner');

    const head = U.el('div', 'prop-head');
    head.innerHTML = `
      <div class="prop-icon">${asset ? U.icon('image', 18) : U.icon('pivot', 18)}</div>
      <input class="name-input" id="propLayerName" value="${U.esc(layer.name)}" maxlength="120" spellcheck="false" autocomplete="off">
      <button class="btn icon sm" id="propLayerMore" title="Layer options">${U.icon('more', 18)}</button>`;
    head.appendChild(this.inspClose());
    wrap.appendChild(head);
    const nameInput = head.querySelector('#propLayerName');
    nameInput.addEventListener('change', () => App.renameLayer(layer.id, nameInput.value));
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });
    head.querySelector('#propLayerMore').addEventListener('click', ev => {
      const r = ev.currentTarget.getBoundingClientRect();
      this.layerMenu(r.left, r.bottom + 4, layer);
    });

    const tr = this.section('Transform');
    tr.appendChild(this.numRow('x', 'X', 'px', 1));
    tr.appendChild(this.numRow('y', 'Y', 'px', 1));
    tr.appendChild(this.numRow('rotation', 'Rotation', '°', 1));
    tr.appendChild(this.numRow('scaleX', 'Scale X', '%', 1, 'layer', 100));
    tr.appendChild(this.numRow('scaleY', 'Scale Y', '%', 1, 'layer', 100));
    tr.appendChild(this.numRow('skewX', 'Skew X', '°', 1));
    tr.appendChild(this.numRow('skewY', 'Skew Y', '°', 1));
    tr.appendChild(this.numRow('opacity', 'Opacity', '%', 1, 'layer', 100));
    wrap.appendChild(tr);

    if (asset) {
      const pv = this.section('Pivot', `<button class="mini-btn text" id="pivotCenter">Center</button>`);
      const rowX = U.el('div', 'prow');
      rowX.innerHTML = `<label class="plabel">Pivot X</label><div class="pval"><input type="text" inputmode="decimal" data-pivot="x" autocomplete="off"><span class="unit">px</span></div>`;
      const rowY = U.el('div', 'prow');
      rowY.innerHTML = `<label class="plabel">Pivot Y</label><div class="pval"><input type="text" inputmode="decimal" data-pivot="y" autocomplete="off"><span class="unit">px</span></div>`;
      pv.appendChild(rowX); pv.appendChild(rowY);
      const ix = rowX.querySelector('input'), iy = rowY.querySelector('input');
      ix.value = this.fmtValue(layer.pivot.x);
      iy.value = this.fmtValue(layer.pivot.y);
      const applyPivot = () => {
        const x = parseFloat(ix.value), y = parseFloat(iy.value);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        App.setPivot(layer, U.clamp(x, -asset.w, asset.w * 2), U.clamp(y, -asset.h, asset.h * 2), true);
        App.commit('Edit pivot');
      };
      ix.addEventListener('change', applyPivot);
      iy.addEventListener('change', applyPivot);
      ix.addEventListener('keydown', e => { if (e.key === 'Enter') ix.blur(); });
      iy.addEventListener('keydown', e => { if (e.key === 'Enter') iy.blur(); });
      pv.querySelector('#pivotCenter').addEventListener('click', () => {
        App.setPivot(layer, asset.w / 2, asset.h / 2, true);
        App.commit('Center pivot');
      });
      wrap.appendChild(pv);
    }

    const rig = this.section('Rig');
    const parentRow = U.el('div', 'prow select-row');
    parentRow.innerHTML = `<label class="plabel">Parent</label><select id="propParent"></select>`;
    const parentSel = parentRow.querySelector('select');
    parentSel.innerHTML = `<option value="">None</option>` + p.layers
      .filter(l => l.id !== layer.id && !Model.isAncestor(p, layer.id, l.id))
      .map(l => `<option value="${l.id}" ${l.id === layer.parent ? 'selected' : ''}>${U.esc(l.name)}</option>`).join('');
    parentSel.addEventListener('change', () => {
      if (!Model.setParent(p, layer, parentSel.value || null)) {
        UI.toast('Cannot parent to a descendant', 'error');
        parentSel.value = layer.parent || '';
        return;
      }
      App.commit('Re-parent layer');
    });
    rig.appendChild(parentRow);

    const blendRow = U.el('div', 'prow select-row');
    blendRow.innerHTML = `<label class="plabel">Blend</label><select id="propBlend">${BLEND_MODES.map(m => `<option ${m === layer.blend ? 'selected' : ''}>${m}</option>`).join('')}</select>`;
    blendRow.querySelector('select').addEventListener('change', e => {
      layer.blend = e.target.value;
      App.commit('Change blend mode');
    });
    rig.appendChild(blendRow);

    const tog = U.el('div', 'prow');
    tog.innerHTML = `
      <button class="btn sm toggle ${layer.visible ? 'active' : ''}" id="propVisible">${U.icon(layer.visible ? 'eye' : 'eyeOff', 16)}<span>${layer.visible ? 'Visible' : 'Hidden'}</span></button>
      <button class="btn sm toggle ${layer.locked ? 'active' : ''}" id="propLocked">${U.icon(layer.locked ? 'lock' : 'unlock', 16)}<span>${layer.locked ? 'Locked' : 'Unlocked'}</span></button>`;
    tog.querySelector('#propVisible').addEventListener('click', () => App.toggleLayerVisible(layer.id));
    tog.querySelector('#propLocked').addEventListener('click', () => App.toggleLayerLocked(layer.id));
    rig.appendChild(tog);

    // Mark a full-frame plate (backdrop, vignette) so onion skinning skips it.
    const bgRow = U.el('div', 'prow');
    bgRow.innerHTML = `<label class="plabel">Onion skin</label>
      <button class="btn sm toggle ${layer.bg ? '' : 'active'}" id="propBg">${U.icon(layer.bg ? 'eyeOff' : 'eye', 16)}<span>${layer.bg ? 'Excluded' : 'Included'}</span></button>`;
    bgRow.querySelector('#propBg').addEventListener('click', () => {
      layer.bg = !layer.bg;
      App.commit('Toggle onion skin');
    });
    rig.appendChild(bgRow);
    wrap.appendChild(rig);

    const ks = this.section('Keyframes', `<span class="sec-note" id="keyCount"></span>`);
    const easeRow = U.el('div', 'prow select-row');
    easeRow.innerHTML = `<label class="plabel">Easing</label><select id="propEase" data-anim="layer">
      <option value="">— no key —</option>
      ${EASE_NAMES.map(e => `<option value="${e}">${e}</option>`).join('')}
    </select>`;
    const easeSel = easeRow.querySelector('select');
    easeSel.addEventListener('change', () => {
      if (!easeSel.value) return;
      App.setEase(easeSel.value, 'layer');
    });
    ks.appendChild(easeRow);
    this.propEls.easing = easeSel;

    const kbtns = U.el('div', 'prow btn-row');
    kbtns.innerHTML = `
      <button class="btn sm" id="keyAdd">${U.icon('keyPlus', 16)}<span>Add</span></button>
      <button class="btn sm" id="keyRemove">${U.icon('minus', 16)}<span>Remove</span></button>
      <button class="btn sm danger" id="keyClear">${U.icon('trash', 16)}<span>Clear</span></button>`;
    kbtns.querySelector('#keyAdd').addEventListener('click', () => App.addKeyAtPlayhead());
    kbtns.querySelector('#keyRemove').addEventListener('click', () => App.removeKeysAtPlayhead());
    kbtns.querySelector('#keyClear').addEventListener('click', async () => {
      if (await this.confirm('Clear keyframes?', 'Remove every keyframe from this layer?', { danger: true, confirmLabel: 'Clear' })) {
        Model.clearKeys(layer);
        App.commit('Clear keyframes');
      }
    });
    ks.appendChild(kbtns);
    const count = Model.keyTimes(layer).length;
    ks.querySelector('#keyCount').textContent = count + (count === 1 ? ' key' : ' keys');
    wrap.appendChild(ks);

    const actions = this.section('Layer');
    const ab = U.el('div', 'prow btn-row');
    ab.innerHTML = `
      <button class="btn sm" id="lyrDup">${U.icon('copy', 16)}<span>Duplicate</span></button>
      <button class="btn sm danger" id="lyrDel">${U.icon('trash', 16)}<span>Delete</span></button>`;
    ab.querySelector('#lyrDup').addEventListener('click', () => App.duplicateSelection());
    ab.querySelector('#lyrDel').addEventListener('click', () => App.deleteSelection());
    actions.appendChild(ab);
    wrap.appendChild(actions);

    return wrap;
  },

  buildCameraProps() {
    const wrap = U.el('div', 'props-inner');
    const head = U.el('div', 'prop-head');
    head.innerHTML = `<div class="prop-icon">${U.icon('camera', 18)}</div><div class="prop-title">Camera</div>
      <button class="btn icon sm" id="camHelp" title="Camera help">${U.icon('help', 18)}</button>`;
    head.appendChild(this.inspClose());
    wrap.appendChild(head);
    head.querySelector('#camHelp').addEventListener('click', () => this.toast('Keyframe X, Y and Zoom to move the camera over the composition.', 'info'));

    const tr = this.section('Transform');
    tr.appendChild(this.numRow('x', 'X', 'px', 1, 'camera'));
    tr.appendChild(this.numRow('y', 'Y', 'px', 1, 'camera'));
    tr.appendChild(this.numRow('zoom', 'Zoom', '%', 1, 'camera', 100));
    wrap.appendChild(tr);

    const ks = this.section('Keyframes');
    const easeRow = U.el('div', 'prow select-row');
    easeRow.innerHTML = `<label class="plabel">Easing</label><select id="camEase" data-anim="camera">
      <option value="">— no key —</option>${EASE_NAMES.map(e => `<option value="${e}">${e}</option>`).join('')}</select>`;
    const easeSel = easeRow.querySelector('select');
    easeSel.addEventListener('change', () => { if (easeSel.value) App.setEase(easeSel.value, 'camera'); });
    ks.appendChild(easeRow);
    this.propEls.easing = easeSel;
    const kb = U.el('div', 'prow btn-row');
    kb.innerHTML = `<button class="btn sm" id="camKeyAdd">${U.icon('keyPlus', 16)}<span>Add</span></button>
      <button class="btn sm" id="camKeyRemove">${U.icon('minus', 16)}<span>Remove</span></button>`;
    kb.querySelector('#camKeyAdd').addEventListener('click', () => App.addKeyAtPlayhead());
    kb.querySelector('#camKeyRemove').addEventListener('click', () => App.removeKeysAtPlayhead());
    ks.appendChild(kb);
    wrap.appendChild(ks);

    const hint = U.el('div', 'hint-box');
    hint.innerHTML = `${U.icon('info', 15)}<span>Camera X/Y pans the shot. Zoom is centred on the composition. Both are keyframable.</span>`;
    wrap.appendChild(hint);
    return wrap;
  },

  buildClipProps(clip, track) {
    const p = App.project;
    const asset = Model.getAsset(p, clip.assetId);
    const wrap = U.el('div', 'props-inner');
    const head = U.el('div', 'prop-head');
    head.innerHTML = `<div class="prop-icon">${U.icon('music', 18)}</div>
      <div class="prop-title">${U.esc(asset ? asset.name : 'Audio clip')}</div>
      <span class="tag">AUDIO</span>`;
    head.appendChild(this.inspClose());
    wrap.appendChild(head);

    const sec = this.section('Clip');
    const mk = (label, unit, value, key) => {
      const row = U.el('div', 'prow');
      row.innerHTML = `<label class="plabel">${label}</label><div class="pval"><input type="text" inputmode="decimal" data-clip="${key}" value="${value}" autocomplete="off"><span class="unit">${unit}</span></div>`;
      return row;
    };
    sec.appendChild(mk('Start', 'fr', this.fmtValue(clip.start), 'start'));
    sec.appendChild(mk('Offset', 's', this.fmtValue(clip.offset), 'offset'));
    sec.appendChild(mk('Length', 's', this.fmtValue(clip.duration), 'duration'));
    for (const input of U.qsa('input[data-clip]', sec)) {
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        if (!Number.isFinite(v)) { this.refreshProps(); return; }
        const k = input.dataset.clip;
        if (k === 'start') clip.start = U.clamp(Math.round(v), 0, p.settings.duration - 1);
        else if (k === 'offset') clip.offset = U.clamp(v, 0, 60);
        else clip.duration = U.clamp(v, 0.02, 600);
        App.commit('Edit audio clip');
      });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    }

    const gainRow = U.el('div', 'prow slider-row');
    gainRow.innerHTML = `<label class="plabel">Gain</label><input type="range" min="0" max="1.5" step="0.01" value="${clip.gain}" id="clipGain"><span class="unit" id="clipGainVal">${Math.round(clip.gain * 100)}%</span>`;
    const gr = gainRow.querySelector('#clipGain');
    gr.addEventListener('input', () => {
      clip.gain = parseFloat(gr.value);
      gainRow.querySelector('#clipGainVal').textContent = Math.round(clip.gain * 100) + '%';
      App.needsRender = true;
    });
    gr.addEventListener('change', () => App.commit('Edit clip gain'));
    sec.appendChild(gainRow);
    wrap.appendChild(sec);

    const act = U.el('div', 'prow btn-row');
    act.innerHTML = `<button class="btn sm" id="clipPreview">${U.icon('play', 15)}<span>Preview</span></button>
      <button class="btn sm danger" id="clipDelete">${U.icon('trash', 16)}<span>Delete</span></button>`;
    act.querySelector('#clipPreview').addEventListener('click', () => {
      if (asset) AudioEngine.preview(asset, clip.offset, Math.min(clip.duration, 3));
    });
    act.querySelector('#clipDelete').addEventListener('click', () => App.deleteSelection());
    wrap.appendChild(act);

    const hint = U.el('div', 'hint-box');
    hint.innerHTML = `${U.icon('info', 15)}<span>Drag the clip to move it. Drag its edges to trim.</span>`;
    wrap.appendChild(hint);
    return wrap;
  },

  buildProjectProps() {
    const p = App.project;
    const s = p.settings;
    const wrap = U.el('div', 'props-inner');
    const head = U.el('div', 'prop-head');
    head.innerHTML = `<div class="prop-icon">${U.icon('film', 18)}</div><div class="prop-title">Scene</div><span class="tag">${s.width}×${s.height}</span>`;
    head.appendChild(this.inspClose());
    wrap.appendChild(head);

    const stats = U.el('div', 'stat-grid');
    const statsData = [
      ['Frame rate', s.fps + ' fps'],
      ['Duration', s.duration + ' fr'],
      ['Length', U.seconds(s.duration, s.fps) + ' s'],
      ['Layers', String(p.layers.length)],
      ['Assets', String(Object.keys(p.assets).length)],
      ['Clips', String(p.audioTracks.reduce((n, t) => n + t.clips.length, 0))]
    ];
    for (const [k, v] of statsData) {
      const d = U.el('div', 'stat');
      d.innerHTML = `<span>${k}</span><b>${v}</b>`;
      stats.appendChild(d);
    }
    wrap.appendChild(stats);

    const empty = U.el('div', 'empty-state');
    empty.innerHTML = `<div class="empty-ic">${U.icon('select', 26)}</div>
      <p>Select a part on the stage to edit its transform, pivot and keys.</p>`;
    wrap.appendChild(empty);

    const act = this.section('Scene');
    const ab = U.el('div', 'prow btn-row');
    ab.innerHTML = `<button class="btn sm" id="projSettings">${U.icon('settings', 16)}<span>Settings</span></button>
      <button class="btn sm" id="projImport">${U.icon('upload', 16)}<span>Import</span></button>
      <button class="btn sm" id="projNull">${U.icon('plus', 16)}<span>Null</span></button>`;
    ab.querySelector('#projSettings').addEventListener('click', () => this.openSettings());
    ab.querySelector('#projImport').addEventListener('click', () => this.pickAssets());
    ab.querySelector('#projNull').addEventListener('click', () => App.addNullLayer());
    act.appendChild(ab);
    wrap.appendChild(act);

    const tip = U.el('div', 'hint-box');
    tip.innerHTML = `${U.icon('info', 15)}<span>Auto-key writes keyframes whenever you pose a part. Turn it off to adjust a layer's resting pose.</span>`;
    wrap.appendChild(tip);
    return wrap;
  },

  /* ================================================================ */
  /* assets                                                           */
  /* ================================================================ */
  toggleAssets(force) {
    const open = force == null ? !this.assetsOpen : force;
    this.assetsOpen = open;
    this.els.drawer.classList.toggle('open', open);
    this.els.drawerScrim.classList.toggle('open', open);
    if (open) this.refreshAssets();
  },

  refreshAssets() {
    const grid = this.els.assetGrid;
    if (!grid) return;
    U.clear(grid);
    const assets = Object.values(App.project.assets).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'image' ? -1 : 1));
    if (!assets.length) {
      grid.appendChild(U.el('div', 'asset-empty')).textContent = 'No assets yet. Import PNG, JPG, WebP, SVG or audio.';
      return;
    }
    for (const asset of assets) {
      const card = U.el('div', 'asset-card');
      card.dataset.id = asset.id;
      const used = Model.assetUsage(App.project, asset.id);
      card.innerHTML = `
        <div class="asset-thumb">${asset.type === 'image' ? `<img src="${asset.src}" alt="" draggable="false">` : `<span class="asset-audio">${U.icon('music', 26)}</span>`}</div>
        <div class="asset-meta"><span class="asset-name">${U.esc(asset.name)}</span><span class="asset-sub">${asset.type === 'image' ? asset.w + '×' + asset.h : U.seconds(asset.duration * 1000, 1000) + 's'}${used ? ' · ' + used + ' use' + (used > 1 ? 's' : '') : ''}</span></div>
        <button class="asset-del" title="Delete asset">${U.icon('x', 13)}</button>`;
      card.addEventListener('click', ev => {
        if (ev.target.closest('.asset-del')) {
          ev.stopPropagation();
          App.deleteAsset(asset);
          return;
        }
        if (asset.type === 'image') App.addLayerFromAsset(asset);
        else App.addAudioClipFromAsset(asset);
      });
      grid.appendChild(card);
    }
  },

  /* ================================================================ */
  /* menus                                                            */
  /* ================================================================ */
  closeMenu() {
    if (this.menuEl) { this.menuEl.remove(); this.menuEl = null; }
    if (this._menuClose) {
      document.removeEventListener('pointerdown', this._menuClose, true);
      this._menuClose = null;
    }
  },

  openMenu(items, anchor, x, y) {
    this.closeMenu();
    const menu = U.el('div', 'menu');
    for (const item of items) {
      if (item === '-') { menu.appendChild(U.el('div', 'menu-sep')); continue; }
      const b = U.el('button', 'menu-item' + (item.danger ? ' danger' : ''));
      b.innerHTML = `<span class="mi-ic">${item.icon ? U.icon(item.icon, 17) : ''}</span><span class="mi-label">${U.esc(item.label)}</span>${item.hint ? `<span class="mi-hint">${U.esc(item.hint)}</span>` : ''}`;
      if (item.disabled) b.disabled = true;
      b.addEventListener('click', () => { this.closeMenu(); if (item.action) item.action(); });
      menu.appendChild(b);
    }
    this.els.menuRoot.appendChild(menu);
    let left, top;
    if (x != null && y != null) { left = x; top = y; }
    else if (anchor) {
      const r = anchor.getBoundingClientRect();
      left = r.left; top = r.bottom + 6;
    } else { left = 80; top = 80; }
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    left = U.clamp(left, 8, window.innerWidth - mw - 8);
    top = U.clamp(top, 8, window.innerHeight - mh - 8);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    this.menuEl = menu;
    this._menuClose = e => { if (!menu.contains(e.target)) this.closeMenu(); };
    setTimeout(() => document.addEventListener('pointerdown', this._menuClose, true), 0);
  },

  fileMenu(anchor) {
    this.openMenu([
      { label: 'New Project…', icon: 'file', action: () => App.newProjectDialog() },
      { label: 'Open Project…', icon: 'folder', action: () => this.pickProject() },
      { label: 'Save Project', icon: 'save', action: () => App.saveProject() },
      '-',
      { label: 'Import Assets…', icon: 'upload', action: () => this.pickAssets() },
      '-',
      { label: 'Project Settings…', icon: 'settings', action: () => this.openSettings() },
      { label: 'Export…', icon: 'download', action: () => this.openExport() },
      '-',
      { label: 'Help & Shortcuts', icon: 'help', action: () => this.openHelp() },
      { label: 'About Suction Studio', icon: 'info', action: () => this.openAbout() }
    ], anchor);
  },

  addLayerMenu(anchor) {
    this.openMenu([
      { label: 'From Asset…', icon: 'image', action: () => this.toggleAssets(true) },
      { label: 'Null Object', icon: 'pivot', action: () => App.addNullLayer() },
      { label: 'Audio Track', icon: 'music', action: () => App.addAudioTrack() }
    ], anchor);
  },

  layerMenu(x, y, layer) {
    const p = App.project;
    const idx = p.layers.findIndex(l => l.id === layer.id);
    this.openMenu([
      { label: 'Rename…', icon: 'file', action: () => this.renameLayer(layer) },
      { label: 'Duplicate', icon: 'copy', action: () => App.duplicateSelection() },
      '-',
      { label: 'Bring Forward', icon: 'chevronDown', disabled: idx >= p.layers.length - 1, action: () => App.moveLayer(layer.id, 1) },
      { label: 'Send Backward', icon: 'chevronRight', disabled: idx <= 0, action: () => App.moveLayer(layer.id, -1) },
      '-',
      { label: 'Delete Layer', icon: 'trash', danger: true, action: () => App.deleteSelection() }
    ], null, x, y);
  },

  cameraMenu(anchor) {
    this.openMenu([
      { label: 'Add Keyframe', icon: 'keyPlus', action: () => App.addKeyAtPlayhead() },
      { label: 'Remove Keys at Playhead', icon: 'minus', action: () => App.removeKeysAtPlayhead() },
      '-',
      { label: 'Reset Camera', icon: 'refresh', action: () => App.resetCamera() }
    ], anchor);
  },

  trackMenu(x, y, track) {
    this.openMenu([
      { label: track.muted ? 'Unmute Track' : 'Mute Track', icon: track.muted ? 'music' : 'eyeOff', action: () => App.toggleTrackMuted(track.id) },
      { label: 'Add Audio Clip…', icon: 'upload', action: () => this.pickAssets() },
      '-',
      { label: 'Delete Track', icon: 'trash', danger: true, action: () => App.deleteTrack(track.id) }
    ], null, x, y);
  },

  /* ================================================================ */
  /* modals                                                           */
  /* ================================================================ */
  openModal({ title, body, footer, width, className, dismissible = true }) {
    const overlay = U.el('div', 'modal-overlay');
    const modal = U.el('div', 'modal' + (className ? ' ' + className : ''));
    if (width) modal.style.width = width;
    const head = U.el('div', 'modal-head');
    head.innerHTML = `<div><h2>${U.esc(title)}</h2></div>`;
    if (dismissible) {
      const x = U.el('button', 'btn icon sm modal-x');
      x.innerHTML = U.icon('x', 18);
      x.addEventListener('click', () => this.closeModal(inst));
      head.appendChild(x);
    }
    const bodyEl = U.el('div', 'modal-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    modal.appendChild(head);
    modal.appendChild(bodyEl);
    let footEl = null;
    if (footer) {
      footEl = U.el('div', 'modal-foot');
      if (typeof footer === 'string') footEl.innerHTML = footer; else footEl.appendChild(footer);
      modal.appendChild(footEl);
    }
    overlay.appendChild(modal);
    this.els.modalRoot.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    if (dismissible) overlay.addEventListener('pointerdown', ev => { if (ev.target === overlay) this.closeModal(inst); });
    const inst = { overlay, modal, body: bodyEl, footer: footEl, close: () => this.closeModal(inst) };
    this.modals.push(inst);
    return inst;
  },

  closeModal(inst) {
    const i = this.modals.indexOf(inst);
    if (i >= 0) this.modals.splice(i, 1);
    if (inst && inst.overlay) {
      inst.overlay.classList.remove('show');
      const ov = inst.overlay;
      setTimeout(() => ov.remove(), 180);
    }
  },

  closeTopModal() {
    if (this.modals.length) { this.closeModal(this.modals[this.modals.length - 1]); return true; }
    return false;
  },

  toast(message, type = 'info', ms = 2600) {
    const t = U.el('div', 'toast ' + type);
    t.innerHTML = `${U.icon(type === 'error' ? 'warn' : type === 'success' ? 'check' : 'info', 16)}<span>${U.esc(message)}</span>`;
    this.els.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 220); }, ms);
  },

  confirm(title, message, opts = {}) {
    return new Promise(resolve => {
      const body = U.el('div');
      body.innerHTML = `<p class="modal-text">${U.esc(message)}</p>`;
      const foot = U.el('div', 'modal-actions');
      const cancel = U.el('button', 'btn');
      cancel.textContent = 'Cancel';
      const ok = U.el('button', 'btn ' + (opts.danger ? 'danger' : 'primary'));
      ok.textContent = opts.confirmLabel || 'Confirm';
      foot.appendChild(cancel); foot.appendChild(ok);
      const inst = this.openModal({ title, body, footer: foot, width: '420px', dismissible: false });
      cancel.addEventListener('click', () => { inst.close(); resolve(false); });
      ok.addEventListener('click', () => { inst.close(); resolve(true); });
    });
  },

  prompt(title, label, value = '') {
    return new Promise(resolve => {
      const body = U.el('div');
      body.innerHTML = `<label class="field-label">${U.esc(label)}</label><input class="text-input" id="promptInput" value="${U.esc(value)}" maxlength="120" spellcheck="false" autocomplete="off">`;
      const foot = U.el('div', 'modal-actions');
      const cancel = U.el('button', 'btn'); cancel.textContent = 'Cancel';
      const ok = U.el('button', 'btn primary'); ok.textContent = 'Save';
      foot.appendChild(cancel); foot.appendChild(ok);
      const inst = this.openModal({ title, body, footer: foot, width: '420px', dismissible: false });
      const input = body.querySelector('#promptInput');
      setTimeout(() => { input.focus(); input.select(); }, 60);
      const done = v => { inst.close(); resolve(v); };
      cancel.addEventListener('click', () => done(null));
      ok.addEventListener('click', () => done(input.value.trim() || null));
      input.addEventListener('keydown', e => { if (e.key === 'Enter') done(input.value.trim() || null); });
    });
  },

  renameProject() {
    this.prompt('Rename Project', 'Project name', App.project.name).then(name => {
      if (name) { App.project.name = name.slice(0, 80); App.commit('Rename project'); }
    });
  },

  renameLayer(layer) {
    this.prompt('Rename Layer', 'Layer name', layer.name).then(name => {
      if (name) App.renameLayer(layer.id, name);
    });
  },

  openProgress(title) {
    const body = U.el('div');
    body.innerHTML = `
      <div class="prog-title">${U.esc(title)}</div>
      <div class="prog-bar"><i id="progFill"></i></div>
      <div class="prog-meta"><span id="progText">Preparing…</span><span id="progPct">0%</span></div>`;
    const foot = U.el('div', 'modal-actions');
    const cancel = U.el('button', 'btn'); cancel.textContent = 'Cancel';
    foot.appendChild(cancel);
    const inst = this.openModal({ title: 'Export', body, footer: foot, width: '440px', dismissible: false });
    inst.overlay.classList.add('solid');
    const state = { cancelled: false, closed: false };
    cancel.addEventListener('click', () => { state.cancelled = true; cancel.disabled = true; cancel.textContent = 'Cancelling…'; });
    state.set = (p, i, n) => {
      const pct = Math.round(U.clamp(p, 0, 1) * 100);
      const fill = body.querySelector('#progFill');
      const text = body.querySelector('#progText');
      const pctEl = body.querySelector('#progPct');
      if (fill) fill.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      if (text) text.textContent = (i && n) ? `Frame ${i} / ${n}` : 'Rendering…';
    };
    state.close = () => { state.closed = true; this.closeModal(inst); };
    return state;
  },

  async runExport(label, fn, filename) {
    const prog = this.openProgress(label);
    try {
      const result = await fn((p, i, n) => prog.set(p, i, n), () => prog.cancelled);
      if (prog.cancelled) { prog.close(); this.toast('Export cancelled'); return; }
      const blob = result && result.blob ? result.blob : result;
      const name = result && result.filename ? result.filename : filename;
      prog.close();
      U.download(blob, name);
      this.toast('Export complete', 'success');
    } catch (e) {
      prog.close();
      if (e && e.message === 'cancelled') { this.toast('Export cancelled'); return; }
      console.error(e);
      this.toast('Export failed: ' + (e.message || 'unknown error'), 'error', 5000);
    }
  },

  /* ---------------------------- settings ---------------------------- */
  openSettings() {
    const p = App.project, s = p.settings;
    const body = U.el('div');
    body.innerHTML = `
      <div class="form-grid">
        <label class="field"><span>Project name</span><input class="text-input" id="setName" value="${U.esc(p.name)}" maxlength="80"></label>
        <div class="field-row">
          <label class="field"><span>Width</span><input class="text-input" id="setW" type="number" min="256" max="4096" value="${s.width}"></label>
          <label class="field"><span>Height</span><input class="text-input" id="setH" type="number" min="256" max="4096" value="${s.height}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Frame rate</span><input class="text-input" id="setFps" type="number" min="1" max="120" value="${s.fps}"></label>
          <label class="field"><span>Duration (frames)</span><input class="text-input" id="setDur" type="number" min="1" max="20000" value="${s.duration}"></label>
        </div>
        <div class="preset-row">
          <button class="chip" data-preset="1080">1080p</button>
          <button class="chip" data-preset="720">720p</button>
          <button class="chip" data-preset="4k">4K</button>
          <button class="chip" data-preset="square">Square</button>
          <button class="chip" data-preset="vertical">Vertical</button>
        </div>
        <div class="field-row">
          <label class="field"><span>Background</span><div class="color-field"><input type="color" id="setBg" value="${s.background}"><span>${s.background}</span></div></label>
          <label class="check field-check"><input type="checkbox" id="setTrans" ${s.transparent ? 'checked' : ''}><span>Transparent canvas</span></label>
        </div>
        <p class="form-hint" id="durHint"></p>
      </div>`;
    const foot = U.el('div', 'modal-actions');
    const cancel = U.el('button', 'btn'); cancel.textContent = 'Cancel';
    const apply = U.el('button', 'btn primary'); apply.textContent = 'Apply';
    foot.appendChild(cancel); foot.appendChild(apply);
    const inst = this.openModal({ title: 'Project Settings', body, footer: foot, width: '500px' });
    cancel.addEventListener('click', () => inst.close());

    const wEl = body.querySelector('#setW'), hEl = body.querySelector('#setH');
    const fEl = body.querySelector('#setFps'), dEl = body.querySelector('#setDur');
    const hint = body.querySelector('#durHint');
    const bgEl = body.querySelector('#setBg');
    const updateHint = () => {
      const fps = Math.max(1, +fEl.value || 24), d = Math.max(1, +dEl.value || 1);
      hint.textContent = `Duration: ${d} frames · ${(d / fps).toFixed(2)} seconds · ${wEl.value}×${hEl.value}`;
      body.querySelector('.color-field span').textContent = bgEl.value;
    };
    [fEl, dEl, wEl, hEl, bgEl].forEach(el => el.addEventListener('input', updateHint));
    updateHint();

    body.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const presets = { '1080': [1920, 1080], '720': [1280, 720], '4k': [3840, 2160], square: [1080, 1080], vertical: [1080, 1920] };
        const [w, h] = presets[btn.dataset.preset];
        wEl.value = w; hEl.value = h; updateHint();
      });
    });

    apply.addEventListener('click', () => {
      const name = body.querySelector('#setName').value.trim() || 'Untitled Scene';
      const w = U.clamp(Math.round(+wEl.value || 1920), 256, 4096);
      const h = U.clamp(Math.round(+hEl.value || 1080), 256, 4096);
      const fps = U.clamp(Math.round(+fEl.value || 24), 1, 120);
      const dur = U.clamp(Math.round(+dEl.value || 120), 1, 20000);
      const bg = bgEl.value;
      const trans = body.querySelector('#setTrans').checked;
      App.applySettings({ name, width: w, height: h, fps, duration: dur, background: bg, transparent: trans });
      inst.close();
      this.toast('Settings applied', 'success');
    });
  },

  /* ----------------------------- export ----------------------------- */
  openExport() {
    const p = App.project, s = p.settings;
    const body = U.el('div');
    const scaleOpts = [0.5, 0.75, 1, 1.5, 2].map(k => {
      const w = Math.round(s.width * k), h = Math.round(s.height * k);
      return `<option value="${k}" ${k === 1 ? 'selected' : ''}>${Math.round(k * 100)}% · ${w}×${h}</option>`;
    }).join('');
    const fpsOpts = Array.from(new Set([s.fps, 24, 30, 60])).filter(f => f > 0).sort((a, b) => a - b)
      .map(f => `<option value="${f}" ${f === s.fps ? 'selected' : ''}>${f} fps</option>`).join('');
    const dur = s.duration;
    body.innerHTML = `
      <div class="export-note">${U.icon('info', 15)}<span>Video records in real time at the chosen frame rate. For lossless frames, use PNG Sequence.</span></div>
      <div class="export-grid">
        <section class="ex-card">
          <div class="ex-head">${U.icon('film', 18)}<h3>Video</h3><span class="tag">WEBM / MP4</span></div>
          <p class="ex-desc">Full composition with camera moves and mixed audio.</p>
          <div class="ex-row"><label>Size</label><select id="exScale">${scaleOpts}</select></div>
          <div class="ex-row"><label>Frame rate</label><select id="exFps">${fpsOpts}</select></div>
          <div class="ex-row"><label>Quality</label><select id="exRate">
            <option value="8000000">Standard · 8 Mbps</option>
            <option value="12000000" selected>High · 12 Mbps</option>
            <option value="20000000">Very high · 20 Mbps</option>
            <option value="32000000">Maximum · 32 Mbps</option>
          </select></div>
          <label class="check"><input type="checkbox" id="exAudio" ${this.hasAudioClips() ? 'checked' : ''}> Include audio</label>
          <button class="btn primary wide" id="exVideo">${U.icon('film', 17)}<span>Export video</span></button>
        </section>

        <section class="ex-card">
          <div class="ex-head">${U.icon('layers', 18)}<h3>PNG Sequence</h3><span class="tag">LOSSLESS</span></div>
          <p class="ex-desc">Every frame as a transparent-capable PNG, zipped.</p>
          <div class="ex-row"><label>Size</label><select id="exSeqScale">${scaleOpts}</select></div>
          <div class="ex-row"><label>Every</label><select id="exStep">
            <option value="1" selected>1 frame</option><option value="2">2 frames</option><option value="3">3 frames</option><option value="4">4 frames</option>
          </select></div>
          <label class="check"><input type="checkbox" id="exSeqAlpha" checked> Transparent background</label>
          <p class="ex-desc" id="exSeqInfo"></p>
          <button class="btn wide" id="exSeq">${U.icon('download', 17)}<span>Export ZIP</span></button>
        </section>

        <section class="ex-card">
          <div class="ex-head">${U.icon('image', 18)}<h3>Still Frame</h3><span class="tag">PNG</span></div>
          <p class="ex-desc">The current playhead frame at high resolution.</p>
          <div class="ex-row"><label>Size</label><select id="exStillScale">${scaleOpts}</select></div>
          <label class="check"><input type="checkbox" id="exStillAlpha" checked> Transparent background</label>
          <button class="btn wide" id="exStill">${U.icon('download', 17)}<span>Export still</span></button>
        </section>

        <section class="ex-card">
          <div class="ex-head">${U.icon('music', 18)}<h3>Audio</h3><span class="tag">WAV</span></div>
          <p class="ex-desc">The complete mixed soundtrack, rendered offline.</p>
          <button class="btn wide" id="exWav">${U.icon('download', 17)}<span>Export WAV</span></button>
        </section>

        <section class="ex-card">
          <div class="ex-head">${U.icon('save', 18)}<h3>Project</h3><span class="tag">JSON</span></div>
          <p class="ex-desc">Everything: rig, keys, camera, audio clips and embedded assets.</p>
          <button class="btn wide" id="exProject">${U.icon('save', 17)}<span>Save project file</span></button>
        </section>

        <section class="ex-card">
          <div class="ex-head">${U.icon('info', 18)}<h3>Tips</h3></div>
          <ul class="ex-tips">
            <li>Use PNG Sequence for lossless quality or transparent frames.</li>
            <li>Video export runs in real time — keep the tab visible.</li>
            <li>1920×1080 at 24–30 fps is the sweet spot on iPad.</li>
          </ul>
        </section>
      </div>`;
    const inst = this.openModal({ title: 'Export', body, width: '680px', className: 'export-modal' });

    const seqInfo = () => {
      const step = +body.querySelector('#exStep').value;
      const scale = +body.querySelector('#exSeqScale').value;
      const count = Math.ceil(dur / step);
      const w = Math.round(s.width * scale), h = Math.round(s.height * scale);
      body.querySelector('#exSeqInfo').textContent = `${count} frames · ${w}×${h} PNG`;
    };
    body.querySelector('#exStep').addEventListener('change', seqInfo);
    body.querySelector('#exSeqScale').addEventListener('change', seqInfo);
    seqInfo();

    const closeAndRun = (label, fn, filename) => { inst.close(); this.runExport(label, fn, filename); };

    body.querySelector('#exVideo').addEventListener('click', () => {
      const scale = +body.querySelector('#exScale').value;
      const fps = +body.querySelector('#exFps').value;
      const bitrate = +body.querySelector('#exRate').value;
      const audio = body.querySelector('#exAudio').checked;
      const { w, h } = Exporter.exportSize(scale);
      closeAndRun('Recording video…', async (onProgress, shouldCancel) => {
        const res = await Exporter.exportVideo({ scale, fps, bitrate, audio, onProgress, shouldCancel });
        return { blob: res.blob, filename: `${Exporter.safeName()}-${w}x${h}-${fps}fps.${res.ext}` };
      });
    });

    body.querySelector('#exSeq').addEventListener('click', () => {
      const scale = +body.querySelector('#exSeqScale').value;
      const step = +body.querySelector('#exStep').value;
      const transparent = body.querySelector('#exSeqAlpha').checked;
      const { w, h } = Exporter.exportSize(scale);
      closeAndRun('Rendering PNG sequence…', async (onProgress, shouldCancel) => {
        const res = await Exporter.exportPNGSequence({ scale, step, transparent, onProgress, shouldCancel });
        return { blob: res.blob, filename: `${Exporter.safeName()}-png-sequence-${w}x${h}.zip` };
      });
    });

    body.querySelector('#exStill').addEventListener('click', () => {
      const scale = +body.querySelector('#exStillScale').value;
      const transparent = body.querySelector('#exStillAlpha').checked;
      const { w, h } = Exporter.exportSize(scale);
      closeAndRun('Rendering still…', async (onProgress) => {
        onProgress(0.4);
        const blob = await Exporter.exportStill({ scale, transparent });
        onProgress(1);
        return { blob, filename: `${Exporter.safeName()}-frame-${String(Math.round(App.time) + 1).padStart(4, '0')}-${w}x${h}.png` };
      });
    });

    body.querySelector('#exWav').addEventListener('click', () => {
      closeAndRun('Mixing audio…', async (onProgress) => {
        onProgress(0.3);
        const blob = await Exporter.exportWav();
        onProgress(1);
        return { blob, filename: `${Exporter.safeName()}-audio.wav` };
      });
    });

    body.querySelector('#exProject').addEventListener('click', () => {
      inst.close();
      const blob = Exporter.exportProject();
      U.download(blob, Exporter.safeName() + '.suction.json');
      this.toast('Project saved', 'success');
    });
  },

  hasAudioClips() {
    return App.project.audioTracks.some(t => t.clips.length > 0);
  },

  /* ------------------------------ help ------------------------------ */
  openHelp() {
    const body = U.el('div');
    body.innerHTML = `
      <div class="help">
        <h3>Getting started</h3>
        <p>Suction Studio is a cut-out puppet animator. Every layer is a PNG part with a pivot point. Parent parts together to build a rig, then keyframe transforms over time.</p>
        <h3>Rigging</h3>
        <ul>
          <li><b>Pivot</b> is the point a part rotates around — set it at a shoulder, elbow or hip.</li>
          <li><b>Parent</b> makes a part follow another. Select a part, then choose its parent in the inspector.</li>
          <li>Use <b>Null Object</b> layers as invisible controllers for groups.</li>
          <li>Use the <b>Pivot tool</b> to drag a pivot without moving the artwork.</li>
        </ul>
        <h3>Animating</h3>
        <ul>
          <li><b>Auto-key</b> (diamond in the timeline bar) writes keys whenever you pose a part.</li>
          <li>Scrub the ruler, press <kbd>Space</kbd> to play, <kbd>←</kbd>/<kbd>→</kbd> to step.</li>
          <li>Per-property diamonds in the inspector add or remove keys at the playhead.</li>
          <li>Change <b>Easing</b> per key for overshoot, bounce or holds.</li>
          <li><b>Onion skin</b> shows the previous and next poses.</li>
        </ul>
        <h3>iPad gestures</h3>
        <ul>
          <li><b>One finger</b> — pose the selected part, or drag empty space to pan.</li>
          <li><b>Two fingers</b> — pinch to zoom and pan around the stage.</li>
          <li><b>Corner handles</b> scale, the handle above the box rotates, the teal dot moves the pivot.</li>
          <li>Drag the divider above the timeline to make it taller.</li>
        </ul>
        <h3>Shortcuts</h3>
        <div class="keys">
          <span><kbd>V</kbd> Select</span><span><kbd>R</kbd> Rotate</span><span><kbd>P</kbd> Pivot</span><span><kbd>H</kbd> Pan</span>
          <span><kbd>K</kbd> Add key</span><span><kbd>Space</kbd> Play</span><span><kbd>←</kbd><kbd>→</kbd> Step</span>
          <span><kbd>⌘Z</kbd> Undo</span><span><kbd>⇧⌘Z</kbd> Redo</span><span><kbd>⌘S</kbd> Save</span><span><kbd>⌘E</kbd> Export</span>
        </div>
        <h3>Export</h3>
        <p>Video records the composition in real time (WebM or MP4 depending on browser) with mixed audio. PNG Sequence gives lossless frames with optional transparency. The project file embeds every asset, so it is fully portable.</p>
      </div>`;
    const foot = U.el('div', 'modal-actions');
    const ok = U.el('button', 'btn primary'); ok.textContent = 'Got it';
    foot.appendChild(ok);
    const inst = this.openModal({ title: 'Help & Shortcuts', body, footer: foot, width: '620px' });
    ok.addEventListener('click', () => inst.close());
  },

  openAbout() {
    const body = U.el('div');
    body.innerHTML = `
      <div class="about">
        <div class="about-mark">${U.icon('logo', 40)}</div>
        <h3>Suction Studio</h3>
        <p class="about-version">Version 1.0 · Puppet animation for iPad</p>
        <p>A self-contained cut-out animation studio: hierarchical rigs, pivots, keyframes with easing, onion skinning, camera moves, audio and high-quality export.</p>
        <p class="about-muted">Inspired by the segmented, bendy-limb animation style of <i>Suction Cup Man</i> and the rigging workflows of Spine, DragonBones and Moho.</p>
      </div>`;
    const foot = U.el('div', 'modal-actions');
    const ok = U.el('button', 'btn primary'); ok.textContent = 'Close';
    foot.appendChild(ok);
    const inst = this.openModal({ title: 'About', body, footer: foot, width: '460px' });
    ok.addEventListener('click', () => inst.close());
  },

  toggleProps() {
    App.propsOpen = !App.propsOpen;
    const main = document.getElementById('main');
    main.classList.toggle('props-collapsed', !App.propsOpen);
    main.classList.toggle('props-open', App.propsOpen);
    this.updateToggles();
    App.savePrefs();
    requestAnimationFrame(() => Renderer.resize());
  }
};
