/* =========================================================================
   Suction Studio — model.js
   Project schema, rig hierarchy, keyframes, interpolation, serialization.
   ========================================================================= */
'use strict';

const PROP_LIST = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY', 'opacity'];
const DEFAULT_BASE = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, opacity: 1 };
const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const EASE_NAMES = ['linear', 'smooth', 'easeIn', 'easeOut', 'easeInOut', 'backIn', 'backOut', 'backInOut', 'elasticOut', 'bounceOut', 'hold'];

const Model = {
  /* ------------------------------------------------------------------ */
  createProject(opts = {}) {
    return {
      kind: 'suction-studio-project',
      version: 1,
      name: opts.name || 'Untitled Scene',
      settings: {
        width: 1920,
        height: 1080,
        fps: 24,
        duration: 120,
        background: '#e9e3d7',
        transparent: false
      },
      assets: {},
      layers: [],
      camera: { base: { x: 0, y: 0, zoom: 1 }, keys: { x: [], y: [], zoom: [] } },
      audioTracks: []
    };
  },

  /* ------------------------------------------------------------------ */
  normalize(raw) {
    const p = raw && typeof raw === 'object' ? raw : {};
    const s = p.settings || {};
    const width = U.clamp(Math.round(+s.width || 1920), 256, 4096);
    const height = U.clamp(Math.round(+s.height || 1080), 256, 4096);
    const project = {
      kind: 'suction-studio-project',
      version: 1,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 80) : 'Untitled Scene',
      settings: {
        width, height,
        fps: U.clamp(Math.round(+s.fps || 24), 1, 120),
        duration: U.clamp(Math.round(+s.duration || 120), 1, 20000),
        background: /^#[0-9a-f]{6}$/i.test(String(s.background || '')) ? s.background : '#e9e3d7',
        transparent: !!s.transparent
      },
      assets: {},
      layers: [],
      camera: this.normalizeAnim(p.camera, { x: 0, y: 0, zoom: 1 }),
      audioTracks: []
    };
    if (p.assets && typeof p.assets === 'object') {
      for (const id of Object.keys(p.assets)) {
        const a = p.assets[id];
        if (!a || typeof a !== 'object' || !a.src) continue;
        project.assets[id] = {
          id,
          name: String(a.name || 'Asset').slice(0, 120),
          type: a.type === 'audio' ? 'audio' : 'image',
          src: String(a.src),
          w: Math.max(1, Math.round(+a.w || 1)),
          h: Math.max(1, Math.round(+a.h || 1)),
          duration: Math.max(0, +a.duration || 0)
        };
      }
    }
    const seen = new Set();
    if (Array.isArray(p.layers)) {
      for (const rawLayer of p.layers) {
        const layer = this.normalizeLayer(rawLayer);
        if (!layer) continue;
        if (seen.has(layer.id)) layer.id = U.uid('lyr');
        seen.add(layer.id);
        project.layers.push(layer);
      }
    }
    // drop dangling parents
    for (const l of project.layers) {
      if (l.parent && !project.layers.some(x => x.id === l.parent)) l.parent = null;
    }
    if (Array.isArray(p.audioTracks)) {
      for (const rawTrack of p.audioTracks) {
        const track = this.normalizeTrack(rawTrack);
        if (track) project.audioTracks.push(track);
      }
    }
    if (!project.audioTracks.length) project.audioTracks.push(this.createTrack());
    return project;
  },

  normalizeAnim(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const base = Object.assign({}, defaults);
    if (src.base) for (const k of Object.keys(defaults)) {
      const v = +src.base[k];
      if (Number.isFinite(v)) base[k] = v;
    }
    const keys = {};
    for (const k of Object.keys(defaults)) {
      const arr = Array.isArray(src.keys && src.keys[k]) ? src.keys[k] : [];
      keys[k] = arr.map(kf => ({
        t: Math.max(0, +kf.t || 0),
        v: +kf.v || 0,
        e: EASE_NAMES.includes(kf.e) ? kf.e : 'easeInOut'
      })).filter(kf => Number.isFinite(kf.t)).sort((a, b) => a.t - b.t);
    }
    return { base, keys };
  },

  normalizeLayer(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const base = Object.assign({}, DEFAULT_BASE);
    if (raw.base) for (const k of PROP_LIST) {
      const v = +raw.base[k];
      if (Number.isFinite(v)) base[k] = v;
    }
    const keys = {};
    for (const k of PROP_LIST) {
      const arr = Array.isArray(raw.keys && raw.keys[k]) ? raw.keys[k] : [];
      keys[k] = arr.map(kf => ({
        t: Math.max(0, +kf.t || 0),
        v: +kf.v || 0,
        e: EASE_NAMES.includes(kf.e) ? kf.e : 'easeInOut'
      })).filter(kf => Number.isFinite(kf.t)).sort((a, b) => a.t - b.t);
    }
    const pivot = {
      x: Number.isFinite(+raw.pivot?.x) ? +raw.pivot.x : 0,
      y: Number.isFinite(+raw.pivot?.y) ? +raw.pivot.y : 0
    };
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : U.uid('lyr'),
      name: String(raw.name || 'Layer').slice(0, 120),
      assetId: typeof raw.assetId === 'string' && raw.assetId ? raw.assetId : null,
      parent: typeof raw.parent === 'string' ? raw.parent : null,
      visible: raw.visible !== false,
      locked: !!raw.locked,
      blend: BLEND_MODES.includes(raw.blend) ? raw.blend : 'normal',
      bg: !!raw.bg,
      pivot,
      base,
      keys
    };
  },

  normalizeTrack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const track = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : U.uid('trk'),
      name: String(raw.name || 'Audio').slice(0, 80),
      muted: !!raw.muted,
      clips: []
    };
    if (Array.isArray(raw.clips)) {
      for (const c of raw.clips) {
        if (!c || typeof c !== 'object') continue;
        track.clips.push({
          id: typeof c.id === 'string' && c.id ? c.id : U.uid('clip'),
          assetId: typeof c.assetId === 'string' ? c.assetId : null,
          start: Math.max(0, +c.start || 0),
          offset: Math.max(0, +c.offset || 0),
          duration: Math.max(0.01, +c.duration || 0.01),
          gain: U.clamp(Number.isFinite(+c.gain) ? +c.gain : 1, 0, 2)
        });
      }
    }
    return track;
  },

  createTrack(name = 'Audio') {
    return { id: U.uid('trk'), name, muted: false, clips: [] };
  },

  /* ------------------------------------------------------------------ */
  clone(project, includeAssets = false) {
    const p = JSON.parse(JSON.stringify(project, (k, v) => (k === 'assets' ? undefined : v)));
    p.assets = includeAssets ? JSON.parse(JSON.stringify(project.assets)) : project.assets;
    return p;
  },

  serialize(project, pretty = false) {
    return JSON.stringify(project, null, pretty ? 2 : 0);
  },

  deserialize(text) {
    const data = JSON.parse(text);
    if (!data || data.kind !== 'suction-studio-project') throw new Error('Not a Suction Studio project file');
    return this.normalize(data);
  },

  /* ------------------------------------------------------------------ */
  getLayer(project, id) {
    return id ? project.layers.find(l => l.id === id) || null : null;
  },
  getAsset(project, id) {
    return id ? project.assets[id] || null : null;
  },
  getTrack(project, id) {
    return id ? project.audioTracks.find(t => t.id === id) || null : null;
  },
  getClip(project, id) {
    for (const t of project.audioTracks) {
      const c = t.clips.find(c => c.id === id);
      if (c) return { clip: c, track: t };
    }
    return null;
  },

  newLayer(project, opts = {}) {
    const asset = opts.assetId ? this.getAsset(project, opts.assetId) : null;
    const layer = {
      id: U.uid('lyr'),
      name: opts.name || (asset ? asset.name : 'Layer'),
      assetId: asset ? asset.id : null,
      parent: opts.parent || null,
      visible: true,
      locked: false,
      blend: 'normal',
      bg: false,
      pivot: { x: asset ? asset.w / 2 : 0, y: asset ? asset.h / 2 : 0 },
      base: Object.assign({}, DEFAULT_BASE, opts.base || {}),
      keys: { x: [], y: [], rotation: [], scaleX: [], scaleY: [], skewX: [], skewY: [], opacity: [] }
    };
    project.layers.push(layer);
    return layer;
  },

  duplicateLayer(project, layer) {
    const copy = JSON.parse(JSON.stringify(layer));
    copy.id = U.uid('lyr');
    copy.name = (layer.name + ' copy').slice(0, 120);
    copy.base.x += 24;
    copy.base.y += 24;
    project.layers.push(copy);
    return copy;
  },

  deleteLayer(project, id) {
    const idx = project.layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const layer = project.layers[idx];
    for (const l of project.layers) if (l.parent === id) l.parent = layer.parent;
    project.layers.splice(idx, 1);
  },

  moveLayer(project, id, direction) {
    const idx = project.layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= project.layers.length) return;
    const [layer] = project.layers.splice(idx, 1);
    project.layers.splice(target, 0, layer);
  },

  layerDepth(project, layer) {
    let depth = 0;
    let cur = layer;
    const guard = new Set();
    while (cur && cur.parent && !guard.has(cur.id)) {
      guard.add(cur.id);
      cur = this.getLayer(project, cur.parent);
      if (cur) depth++;
    }
    return depth;
  },

  isAncestor(project, ancestorId, layerId) {
    let cur = this.getLayer(project, layerId);
    const guard = new Set();
    while (cur && cur.parent && !guard.has(cur.id)) {
      guard.add(cur.id);
      if (cur.parent === ancestorId) return true;
      cur = this.getLayer(project, cur.parent);
    }
    return false;
  },

  setParent(project, layer, parentId) {
    if (!parentId) { layer.parent = null; return true; }
    if (parentId === layer.id) return false;
    if (this.isAncestor(project, parentId, layer.id)) return false;
    layer.parent = parentId;
    return true;
  },

  assetUsage(project, assetId) {
    const layers = project.layers.filter(l => l.assetId === assetId).length;
    const clips = project.audioTracks.reduce((n, t) => n + t.clips.filter(c => c.assetId === assetId).length, 0);
    return layers + clips;
  },

  /* ------------------------------------------------------------------ */
  /* Keyframes                                                           */
  /* ------------------------------------------------------------------ */
  sampleKeys(keys, time) {
    if (!keys || !keys.length) return null;
    if (time <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (time >= last.t) return last.v;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t <= time) i++;
    const k0 = keys[i];
    const k1 = keys[i + 1];
    if (k1.t <= k0.t) return k1.v;
    if (k1.e === 'hold') return k0.v;
    let p = (time - k0.t) / (k1.t - k0.t);
    p = U.ease(k1.e || 'easeInOut', p);
    return k0.v + (k1.v - k0.v) * p;
  },

  sample(anim, prop, time) {
    if (!anim) return 0;
    const keys = anim.keys && anim.keys[prop];
    if (keys && keys.length) return this.sampleKeys(keys, time);
    const v = anim.base ? anim.base[prop] : 0;
    return Number.isFinite(v) ? v : 0;
  },

  sampleLayer(layer, prop, time) { return this.sample(layer, prop, time); },
  sampleCamera(project, prop, time) { return this.sample(project.camera, prop, time); },

  findKeyIndex(keys, t) {
    if (!keys) return -1;
    for (let i = 0; i < keys.length; i++) if (Math.abs(keys[i].t - t) < 0.01) return i;
    return -1;
  },

  hasKeyAt(anim, prop, t) {
    return this.findKeyIndex(anim.keys && anim.keys[prop], t) >= 0;
  },

  keyAt(anim, prop, t) {
    const i = this.findKeyIndex(anim.keys && anim.keys[prop], t);
    return i >= 0 ? anim.keys[prop][i] : null;
  },

  setKey(anim, prop, t, value, ease) {
    if (!anim.keys) anim.keys = {};
    if (!anim.keys[prop]) anim.keys[prop] = [];
    const keys = anim.keys[prop];
    const frame = Math.round(t);
    const i = this.findKeyIndex(keys, frame);
    if (i >= 0) {
      keys[i].v = value;
      if (ease) keys[i].e = ease;
    } else {
      keys.push({ t: frame, v: value, e: ease || 'easeInOut' });
      keys.sort((a, b) => a.t - b.t);
    }
  },

  removeKeyAt(anim, prop, t) {
    const keys = anim.keys && anim.keys[prop];
    if (!keys) return false;
    const i = this.findKeyIndex(keys, t);
    if (i < 0) return false;
    keys.splice(i, 1);
    return true;
  },

  toggleKeyAt(anim, prop, t, value, ease) {
    if (this.hasKeyAt(anim, prop, t)) {
      this.removeKeyAt(anim, prop, t);
      return false;
    }
    this.setKey(anim, prop, t, value, ease || 'easeInOut');
    return true;
  },

  /** Ensure keys exist at `time` for the props, using sampled values. Returns true if any added. */
  ensureKeys(anim, props, time, ease = 'easeInOut') {
    let added = false;
    for (const p of props) {
      if (!this.hasKeyAt(anim, p, time)) {
        this.setKey(anim, p, time, this.sample(anim, p, time), ease);
        added = true;
      }
    }
    return added;
  },

  setProp(anim, prop, value, time, autoKey, ease) {
    if (this.hasKeyAt(anim, prop, time)) this.setKey(anim, prop, time, value, ease);
    else if (autoKey) this.setKey(anim, prop, time, value, ease || 'easeInOut');
    else if (anim.base) anim.base[prop] = value;
  },

  keyTimes(anim) {
    if (!anim || !anim.keys) return [];
    const set = new Set();
    for (const p of Object.keys(anim.keys)) {
      for (const k of anim.keys[p]) set.add(k.t);
    }
    return Array.from(set).sort((a, b) => a - b);
  },

  /* Move every key that sits on `fromT` to `toT` (used when a diamond is
     dragged in the timeline). Keys already on `toT` are overwritten. */
  moveKeysAt(anim, fromT, toT) {
    if (!anim || !anim.keys) return false;
    const a = Math.round(fromT), b = Math.round(toT);
    if (a === b) return false;
    let moved = false;
    for (const prop of Object.keys(anim.keys)) {
      const keys = anim.keys[prop];
      const i = this.findKeyIndex(keys, a);
      if (i < 0) continue;
      const k = keys[i];
      keys.splice(i, 1);
      const j = this.findKeyIndex(keys, b);
      if (j >= 0) { keys[j].v = k.v; keys[j].e = k.e; }
      else { k.t = b; keys.push(k); keys.sort((x, y) => x.t - y.t); }
      moved = true;
    }
    return moved;
  },

  /* Sorted list of every keyframed frame in the project (layers + camera). */
  allKeyTimes(project) {
    const set = new Set();
    const add = anim => {
      if (!anim || !anim.keys) return;
      for (const p of Object.keys(anim.keys)) {
        for (const k of anim.keys[p]) set.add(k.t);
      }
    };
    for (const l of project.layers) add(l);
    add(project.camera);
    return [...set].sort((a, b) => a - b);
  },

  keysAtTime(anim, time) {
    const out = {};
    if (!anim || !anim.keys) return out;
    for (const p of Object.keys(anim.keys)) {
      const k = this.keyAt(anim, p, time);
      if (k) out[p] = k;
    }
    return out;
  },

  setEaseAtTime(anim, time, ease) {
    let n = 0;
    if (!anim || !anim.keys) return 0;
    for (const p of Object.keys(anim.keys)) {
      const k = this.keyAt(anim, p, time);
      if (k) { k.e = ease; n++; }
    }
    return n;
  },

  clearKeys(anim) {
    if (!anim.keys) return;
    for (const p of Object.keys(anim.keys)) anim.keys[p].length = 0;
  },

  /* ------------------------------------------------------------------ */
  /* Transforms                                                          */
  /* ------------------------------------------------------------------ */
  localMatrix(layer, time) {
    const x = this.sample(layer, 'x', time);
    const y = this.sample(layer, 'y', time);
    const rot = this.sample(layer, 'rotation', time);
    const sx = this.sample(layer, 'scaleX', time);
    const sy = this.sample(layer, 'scaleY', time);
    const kx = this.sample(layer, 'skewX', time);
    const ky = this.sample(layer, 'skewY', time);
    return Mat.translation(x, y)
      .mul(Mat.rotation(rot))
      .mul(Mat.scale(sx, sy))
      .mul(Mat.skew(kx, ky))
      .mul(Mat.translation(-layer.pivot.x, -layer.pivot.y));
  },

  /** Pivot-frame matrix: where children live. Does not include the image offset. */
  boneMatrix(project, layer, time, cache) {
    const key = 'b:' + layer.id;
    if (cache && cache.has(key)) return cache.get(key);
    if (cache) cache.set(key, Mat.identity());
    const local = Mat.translation(this.sample(layer, 'x', time), this.sample(layer, 'y', time))
      .mul(Mat.rotation(this.sample(layer, 'rotation', time)))
      .mul(Mat.scale(this.sample(layer, 'scaleX', time), this.sample(layer, 'scaleY', time)))
      .mul(Mat.skew(this.sample(layer, 'skewX', time), this.sample(layer, 'skewY', time)));
    let result = local;
    if (layer.parent) {
      const parent = this.getLayer(project, layer.parent);
      if (parent) result = this.boneMatrix(project, parent, time, cache).mul(local);
    }
    if (cache) cache.set(key, result);
    return result;
  },

  /** Rotation · scale · skew at a given time (image space → parent space). */
  localLinear(layer, time) {
    return Mat.rotation(this.sample(layer, 'rotation', time))
      .mul(Mat.scale(this.sample(layer, 'scaleX', time), this.sample(layer, 'scaleY', time)))
      .mul(Mat.skew(this.sample(layer, 'skewX', time), this.sample(layer, 'skewY', time)));
  },

  /** Full image matrix (bone frame + image offset). Used for drawing and hit tests. */
  matrix(project, layer, time, cache) {
    if (cache && cache.has(layer.id)) return cache.get(layer.id);
    const bone = this.boneMatrix(project, layer, time, cache);
    const result = bone.mul(Mat.translation(-layer.pivot.x, -layer.pivot.y));
    if (cache) cache.set(layer.id, result);
    return result;
  },

  cameraMatrix(project, time) {
    const cam = project.camera;
    const cx = project.settings.width / 2;
    const cy = project.settings.height / 2;
    const x = this.sample(cam, 'x', time);
    const y = this.sample(cam, 'y', time);
    const z = Math.max(0.02, this.sample(cam, 'zoom', time));
    return Mat.translation(cx + x, cy + y).mul(Mat.scale(z)).mul(Mat.translation(-cx, -cy));
  },

  /** Bounding box of a layer's image in composition space. */
  layerCorners(project, layer, time, cache) {
    const asset = this.getAsset(project, layer.assetId);
    if (!asset) {
      const m = this.matrix(project, layer, time, cache);
      const p = m.apply(0, 0);
      return [p, p, p, p];
    }
    const m = this.matrix(project, layer, time, cache);
    return [m.apply(0, 0), m.apply(asset.w, 0), m.apply(asset.w, asset.h), m.apply(0, asset.h)];
  },

  /* ------------------------------------------------------------------ */
  /* Audio                                                               */
  /* ------------------------------------------------------------------ */
  addAudioClip(project, asset, startFrame, trackId) {
    let track = trackId ? this.getTrack(project, trackId) : project.audioTracks[0];
    if (!track) { track = this.createTrack(); project.audioTracks.push(track); }
    const duration = asset.duration || 1;
    const clip = {
      id: U.uid('clip'),
      assetId: asset.id,
      start: Math.max(0, Math.round(startFrame)),
      offset: 0,
      duration,
      gain: 1
    };
    track.clips.push(clip);
    return { clip, track };
  },

  clipSeconds(clip, fps) {
    return {
      start: clip.start / fps,
      end: (clip.start / fps) + clip.duration
    };
  },

  /* ------------------------------------------------------------------ */
  /* Scene helpers                                                       */
  /* ------------------------------------------------------------------ */
  addImageAsset(project, { name, src, w, h }) {
    const id = U.uid('ast');
    const asset = { id, name, type: 'image', src, w, h, duration: 0 };
    project.assets[id] = asset;
    return asset;
  },
  addAudioAsset(project, { name, src, duration }) {
    const id = U.uid('ast');
    const asset = { id, name, type: 'audio', src, w: 0, h: 0, duration };
    project.assets[id] = asset;
    return asset;
  },

  totalDurationFrames(project) {
    let d = project.settings.duration;
    for (const t of project.audioTracks) {
      for (const c of t.clips) {
        d = Math.max(d, Math.ceil(c.start + c.duration * project.settings.fps));
      }
    }
    return d;
  }
};
