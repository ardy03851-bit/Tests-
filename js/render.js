/* =========================================================================
   Suction Studio — render.js
   Stage renderer: camera + editor view, onion skinning, selection handles,
   hit testing and deterministic export rendering.
   ========================================================================= */
'use strict';

const Renderer = {
  canvas: null,
  ctx: null,
  dpr: 1,
  cssW: 0,
  cssH: 0,
  view: { x: 0, y: 0, zoom: 1 },
  images: new Map(),
  onionCache: new Map(),
  checker: null,
  stageGrad: null,
  stageGradKey: '',
  handles: { rotate: null, pivot: null, corners: [] },
  bufferA: null,
  bufferB: null,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.resize();
  },

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    this.cssW = w;
    this.cssH = h;
    this.stageGrad = null;
    App.needsRender = true;
  },

  /* ----------------------------- view ----------------------------- */
  viewMatrix() {
    const cx = this.cssW / 2, cy = this.cssH / 2;
    return Mat.translation(cx + this.view.x, cy + this.view.y)
      .mul(Mat.scale(this.view.zoom))
      .mul(Mat.translation(-cx, -cy));
  },

  finalMatrix() {
    return this.viewMatrix().mul(Model.cameraMatrix(App.project, App.time));
  },

  screenToWorld(x, y) { return this.finalMatrix().inverse().apply(x, y); },
  worldToScreen(x, y) { return this.finalMatrix().apply(x, y); },

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.view.zoom = U.clamp(this.view.zoom * factor, 0.02, 10);
    this.userView = true;
    const after = this.worldToScreen(before.x, before.y);
    this.view.x += sx - after.x;
    this.view.y += sy - after.y;
    App.needsRender = true;
  },

  setZoom(z, sx, sy) {
    const center = sx == null ? this.cssW / 2 : sx;
    const centerY = sy == null ? this.cssH / 2 : sy;
    const target = U.clamp(z, 0.02, 10);
    if (Math.abs(target - this.view.zoom) < 1e-6) return;
    this.zoomAt(center, centerY, target / this.view.zoom);
  },

  panBy(dx, dy) {
    this.view.x += dx;
    this.view.y += dy;
    this.userView = true;
    App.needsRender = true;
  },

  zoomToFit(pad = 48) {
    const s = App.project.settings;
    const z = Math.min((this.cssW - pad * 2) / s.width, (this.cssH - pad * 2) / s.height);
    this.view.zoom = U.clamp(z, 0.02, 4);
    this.view.x = 0;
    this.view.y = 0;
    this.userView = false;
    App.needsRender = true;
  },

  /* ----------------------------- assets --------------------------- */
  getImage(asset) {
    if (!asset) return null;
    if (this.images.has(asset.id)) return this.images.get(asset.id);
    if (asset._loading) return null;
    asset._loading = true;
    const img = new Image();
    img.onload = () => {
      asset._loading = false;
      this.images.set(asset.id, img);
      App.needsRender = true;
    };
    img.onerror = () => { asset._loading = false; };
    img.src = asset.src;
    return null;
  },

  /* ----------------------------- render --------------------------- */
  render() {
    const ctx = this.ctx;
    if (!ctx || !this.cssW) return;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    this.drawStageBackground(ctx);

    const cam = Model.cameraMatrix(App.project, App.time);
    const final = this.viewMatrix().mul(cam);
    ctx.save();
    ctx.transform(final.a, final.b, final.c, final.d, final.e, final.f);
    this.drawComposition(ctx, App.time, { forExport: false, onion: App.onion && !App.playing, selection: false });
    ctx.restore();

    this.drawOverlays(ctx);
  },

  drawStageBackground(ctx) {
    if (!this.stageGrad || this.stageGradKey !== this.cssW + 'x' + this.cssH) {
      const g = ctx.createRadialGradient(this.cssW * .5, this.cssH * .42, 40, this.cssW * .5, this.cssH * .5, Math.max(this.cssW, this.cssH) * .8);
      g.addColorStop(0, '#12161c');
      g.addColorStop(1, '#07090c');
      this.stageGrad = g;
      this.stageGradKey = this.cssW + 'x' + this.cssH;
    }
    ctx.fillStyle = this.stageGrad;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // composition drop shadow
    const s = App.project.settings;
    const p0 = this.worldToScreen(0, 0);
    const p1 = this.worldToScreen(s.width, s.height);
    const x = Math.min(p0.x, p1.x), y = Math.min(p0.y, p1.y);
    const w = Math.abs(p1.x - p0.x), h = Math.abs(p1.y - p0.y);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.65)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#0a0d11';
    this.roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 3);
    ctx.fill();
    ctx.restore();
  },

  getChecker() {
    if (this.checker) return this.checker;
    const c = document.createElement('canvas');
    c.width = 48; c.height = 48;
    const x = c.getContext('2d');
    x.fillStyle = '#cfd3d9'; x.fillRect(0, 0, 48, 48);
    x.fillStyle = '#eef0f3'; x.fillRect(0, 0, 24, 24); x.fillRect(24, 24, 24, 24);
    this.checker = c;
    return c;
  },

  drawComposition(ctx, time, opts = {}) {
    const s = App.project.settings;
    const project = App.project;

    if (opts.forExport) {
      if (!opts.transparent) {
        ctx.fillStyle = s.background;
        ctx.fillRect(0, 0, s.width, s.height);
      }
    } else {
      if (s.transparent) {
        const pat = ctx.createPattern(this.getChecker(), 'repeat');
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, s.width, s.height);
      } else {
        ctx.fillStyle = s.background;
        ctx.fillRect(0, 0, s.width, s.height);
      }
    }

    if (opts.onion) {
      // Ghost the neighbouring *keyframes*, not the neighbouring frames — one
      // frame away is visually identical at 24 fps and tells you nothing.
      const times = Model.allKeyTimes(project);
      let prevT = null, nextT = null;
      for (const t of times) {
        if (t < time - 1e-4) prevT = t;
        else if (t > time + 1e-4) { nextT = t; break; }
      }
      if (prevT == null) prevT = time - 1;
      if (nextT == null) nextT = time + 1;
      const prev = this.getOnion(prevT, '#2fbfae');
      const next = this.getOnion(nextT, '#ff7a2f');
      if (prev) { ctx.save(); ctx.globalAlpha = .46; ctx.drawImage(prev, 0, 0); ctx.restore(); }
      if (next) { ctx.save(); ctx.globalAlpha = .46; ctx.drawImage(next, 0, 0); ctx.restore(); }
    }

    this.drawLayers(ctx, time, opts);

    if (!opts.forExport && App.grid) this.drawGrid(ctx);
  },

  drawLayers(ctx, time, opts = {}) {
    const project = App.project;
    const cache = new Map();
    for (const layer of project.layers) {
      if (!layer.visible) continue;
      const asset = Model.getAsset(project, layer.assetId);
      if (!asset) continue;
      const img = this.getImage(asset);
      if (!img) continue;
      const m = Model.matrix(project, layer, time, cache);
      const alpha = U.clamp(Model.sample(layer, 'opacity', time), 0, 1);
      if (alpha <= 0.001) continue;
      ctx.save();
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.globalAlpha = alpha;
      if (layer.blend && layer.blend !== 'normal') ctx.globalCompositeOperation = layer.blend;
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
  },

  drawGrid(ctx) {
    const s = App.project.settings;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.lineWidth = 1 / Math.max(0.2, this.view.zoom);
    const step = 100;
    ctx.beginPath();
    for (let x = step; x < s.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, s.height); }
    for (let y = step; y < s.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(s.width, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.beginPath();
    ctx.moveTo(s.width / 2, 0); ctx.lineTo(s.width / 2, s.height);
    ctx.moveTo(0, s.height / 2); ctx.lineTo(s.width, s.height / 2);
    ctx.stroke();
    ctx.restore();
  },

  /* --------------------------- onion skin ------------------------- */
  ensureBuffer() {
    const s = App.project.settings;
    if (!this.bufferA) {
      this.bufferA = document.createElement('canvas');
      this.bufferB = document.createElement('canvas');
    }
    for (const b of [this.bufferA, this.bufferB]) {
      if (b.width !== s.width || b.height !== s.height) { b.width = s.width; b.height = s.height; }
    }
  },

  getOnion(time, color) {
    if (time < 0 || time > App.project.settings.duration - 1) return null;
    const key = color + '|' + time.toFixed(2) + '|' + App.rev + '|' + App.project.settings.width + 'x' + App.project.settings.height;
    if (this.onionCache.has(key)) return this.onionCache.get(key);
    this.ensureBuffer();
    const buf = color === '#2fbfae' ? this.bufferA : this.bufferB;
    const x = buf.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, buf.width, buf.height);
    const project = App.project;
    const cache = new Map();
    for (const layer of project.layers) {
      if (!layer.visible || layer.bg) continue;
      const asset = Model.getAsset(project, layer.assetId);
      if (!asset) continue;
      const img = this.getImage(asset);
      if (!img) continue;
      const m = Model.matrix(project, layer, time, cache);
      x.save();
      x.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      x.globalAlpha = U.clamp(Model.sample(layer, 'opacity', time), 0, 1);
      x.drawImage(img, 0, 0);
      x.restore();
    }
    x.save();
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = color;
    x.globalAlpha = 0.85;
    x.fillRect(0, 0, buf.width, buf.height);
    x.restore();

    if (this.onionCache.size > 5) {
      const first = this.onionCache.keys().next().value;
      this.onionCache.delete(first);
    }
    this.onionCache.set(key, buf);
    return buf;
  },

  /* ---------------------------- overlays -------------------------- */
  computeHandles() {
    const sel = App.selection;
    this.handles = { rotate: null, pivot: null, corners: [] };
    if (!sel || sel.type !== 'layer' || !sel.id) return;
    const project = App.project;
    const layer = Model.getLayer(project, sel.id);
    if (!layer || !layer.visible) return;
    const asset = Model.getAsset(project, layer.assetId);
    const m = Model.matrix(project, layer, App.time);
    const pivotWorld = Model.boneMatrix(project, layer, App.time).apply(0, 0);
    const pivot = this.worldToScreen(pivotWorld.x, pivotWorld.y);
    this.handles.pivot = pivot;

    if (asset) {
      const corners = [
        m.apply(0, 0), m.apply(asset.w, 0), m.apply(asset.w, asset.h), m.apply(0, asset.h)
      ].map(p => this.worldToScreen(p.x, p.y));
      this.handles.corners = corners;
      const topMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
      let nx = -(corners[1].y - corners[0].y), ny = corners[1].x - corners[0].x;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      const cx = (corners[0].x + corners[2].x) / 2, cy = (corners[0].y + corners[2].y) / 2;
      if (nx * (topMid.x - cx) + ny * (topMid.y - cy) < 0) { nx = -nx; ny = -ny; }
      this.handles.topMid = topMid;
      this.handles.rotate = { x: topMid.x + nx * 34, y: topMid.y + ny * 34 };
    }
  },

  drawOverlays(ctx) {
    this.computeHandles();
    const sel = App.selection;
    const project = App.project;

    // null object markers
    if (!App.playing) {
      for (const layer of project.layers) {
        if (layer.assetId || !layer.visible) continue;
        const m = Model.matrix(project, layer, App.time);
        const p = this.worldToScreen(m.apply(0, 0).x, m.apply(0, 0).y);
        const selected = sel.type === 'layer' && sel.id === layer.id;
        ctx.save();
        ctx.strokeStyle = selected ? '#ff8a3d' : 'rgba(255,255,255,.35)';
        ctx.fillStyle = selected ? 'rgba(255,138,61,.18)' : 'rgba(255,255,255,.08)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash(selected ? [] : [4, 4]);
        ctx.beginPath();
        ctx.rect(p.x - 14, p.y - 14, 28, 28);
        ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p.x - 22, p.y); ctx.lineTo(p.x + 22, p.y);
        ctx.moveTo(p.x, p.y - 22); ctx.lineTo(p.x, p.y + 22);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (sel.type === 'camera') {
      const s = project.settings;
      const p0 = this.worldToScreen(0, 0);
      const p1 = this.worldToScreen(s.width, s.height);
      ctx.save();
      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 7]);
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,138,61,.92)';
      this.roundRect(ctx, p0.x, p0.y - 24, 84, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#1a1208';
      ctx.font = '600 11px -apple-system, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('CAMERA', p0.x + 10, p0.y - 14);
      ctx.restore();
      return;
    }

    if (sel.type !== 'layer' || !sel.id) return;
    const layer = Model.getLayer(project, sel.id);
    if (!layer) return;
    const asset = Model.getAsset(project, layer.assetId);
    const h = this.handles;

    if (asset && h.corners.length === 4) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(h.corners[0].x, h.corners[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(h.corners[i].x, h.corners[i].y);
      ctx.closePath(); ctx.stroke();

      ctx.strokeStyle = '#ff8a3d';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      ctx.moveTo(h.corners[0].x, h.corners[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(h.corners[i].x, h.corners[i].y);
      ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);

      // rotate stem
      ctx.strokeStyle = 'rgba(255,138,61,.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(h.topMid.x, h.topMid.y);
      ctx.lineTo(h.rotate.x, h.rotate.y);
      ctx.stroke();
      ctx.restore();

      for (let i = 0; i < 4; i++) this.drawHandle(ctx, h.corners[i].x, h.corners[i].y, '#ffffff', '#11151a', 6.5);
      this.drawHandle(ctx, h.rotate.x, h.rotate.y, '#ff8a3d', '#1a1208', 8);
      // rotation glyph
      ctx.save();
      ctx.strokeStyle = '#1a1208';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(h.rotate.x, h.rotate.y, 3.4, -Math.PI * .15, Math.PI * 1.15);
      ctx.stroke();
      ctx.restore();
    }

    // pivot
    if (h.pivot) {
      const p = h.pivot;
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#3fd0bf';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#3fd0bf';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(63,208,191,.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - 13, p.y); ctx.lineTo(p.x - 8, p.y);
      ctx.moveTo(p.x + 8, p.y); ctx.lineTo(p.x + 13, p.y);
      ctx.moveTo(p.x, p.y - 13); ctx.lineTo(p.x, p.y - 8);
      ctx.moveTo(p.x, p.y + 8); ctx.lineTo(p.x, p.y + 13);
      ctx.stroke();
      ctx.restore();
    }
  },

  drawHandle(ctx, x, y, fill, stroke, r) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.6; ctx.strokeStyle = stroke; ctx.stroke();
    ctx.restore();
  },

  roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },

  /* ---------------------------- hit test -------------------------- */
  hitHandle(x, y) {
    const h = this.handles;
    const near = (p, r) => p && Math.hypot(p.x - x, p.y - y) <= r;
    if (near(h.rotate, 24)) return { type: 'rotate' };
    if (near(h.pivot, 22)) return { type: 'pivot' };
    for (let i = 0; i < h.corners.length; i++) {
      if (near(h.corners[i], 22)) return { type: 'scale', index: i };
    }
    return null;
  },

  hitLayer(x, y) {
    const project = App.project;
    const world = this.screenToWorld(x, y);
    const cache = new Map();
    for (let i = project.layers.length - 1; i >= 0; i--) {
      const layer = project.layers[i];
      if (!layer.visible || layer.locked || !layer.assetId) continue;
      const asset = Model.getAsset(project, layer.assetId);
      if (!asset) continue;
      const inv = Model.matrix(project, layer, App.time, cache).inverse();
      const p = inv.apply(world.x, world.y);
      if (p.x >= -6 && p.y >= -6 && p.x <= asset.w + 6 && p.y <= asset.h + 6) return layer;
    }
    return null;
  },

  /* ---------------------------- export ---------------------------- */
  renderToCanvas(canvas, time, opts = {}) {
    const project = App.project;
    const s = project.settings;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!opts.transparent) {
      ctx.fillStyle = s.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const sx = canvas.width / s.width;
    const sy = canvas.height / s.height;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    this.drawComposition(ctx, time, { forExport: true, onion: false, transparent: !!opts.transparent });
    return canvas;
  },

  /** Render a frame at a given pixel size (aspect preserved). */
  makeFrameCanvas(width, height, time, transparent) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    this.renderToCanvas(c, time, { transparent });
    return c;
  },

  clearCaches() {
    this.onionCache.clear();
  }
};
