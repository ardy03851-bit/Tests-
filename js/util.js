/* =========================================================================
   Suction Studio — util.js
   Shared helpers: math, matrices, easing, DOM, icons, files, ZIP, WAV.
   ========================================================================= */
'use strict';

const U = {
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  rad(d) { return d * Math.PI / 180; },
  deg(r) { return r * 180 / Math.PI; },
  round(v, p = 3) { const m = Math.pow(10, p); return Math.round(v * m) / m; },
  uid(prefix = 'id') {
    return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  },
  clampStr(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; },
  basename(name) {
    const base = String(name || 'asset').split(/[\\/]/).pop();
    return base.replace(/\.[^.]+$/, '') || base;
  },
  ext(name) {
    const m = /\.([a-z0-9]+)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  },
  pad(n, w = 3) { return String(n).padStart(w, '0'); },
  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  },

  /* ---------- DOM ---------- */
  qs(sel, root = document) { return root.querySelector(sel); },
  qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },
  el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  },
  on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); return () => target.removeEventListener(ev, fn, opts); },
  clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; },
  setText(node, text) { if (node && node.textContent !== text) node.textContent = text; },

  /* ---------- time ---------- */
  timecode(frames, fps) {
    const f = Math.max(0, Math.round(frames));
    const total = Math.floor(f / fps);
    const ff = f % fps;
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0') + ':' + String(ff).padStart(2, '0');
  },
  seconds(frames, fps) { return (Math.max(0, frames) / fps).toFixed(2); },

  /* ---------- files ---------- */
  readFile(file, as = 'dataURL') {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read file'));
      if (as === 'arrayBuffer') r.readAsArrayBuffer(file); else r.readAsDataURL(file);
    });
  },
  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = src;
    });
  },
  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
  },
  downloadText(text, filename, mime = 'application/json') {
    U.download(new Blob([text], { type: mime }), filename);
  },
  bytesToBase64(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  },

  /* ---------- zip (stored, no external deps) ---------- */
  crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  },
  makeZip(files) {
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() / 2) & 31);
    const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

    for (const file of files) {
      const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      const nameBytes = enc.encode(file.name);
      const crc = U.crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // utf-8
      lv.setUint16(8, 0, true);      // stored
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      parts.push(local, data);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += local.length + data.length;
    }

    let cdSize = 0;
    for (const c of central) cdSize += c.length;
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
  },

  /* ---------- WAV (16-bit PCM) ---------- */
  encodeWav(audioBuffer) {
    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const sr = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const dataSize = len * channels * 2;
    const ab = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(ab);
    const ws = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE');
    ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, channels, true); dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * channels * 2, true); dv.setUint16(32, channels * 2, true);
    dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, dataSize, true);

    const chans = [];
    for (let c = 0; c < channels; c++) chans.push(audioBuffer.getChannelData(c));
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < channels; c++) {
        let s = Math.max(-1, Math.min(1, chans[c][i]));
        dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  },

  /* ---------- misc ---------- */
  formatBytes(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  },
  clampResolution(w, h) {
    w = U.clamp(Math.round(w), 256, 4096);
    h = U.clamp(Math.round(h), 256, 4096);
    while (w * h > 16 * 1024 * 1024) { w = Math.round(w * 0.9); h = Math.round(h * 0.9); }
    return { w, h };
  }
};

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}

/* =========================================================================
   2D affine matrix  [ a c e ]
                     [ b d f ]
                     [ 0 0 1 ]
   ========================================================================= */
class Mat {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
  }
  static identity() { return new Mat(); }
  static translation(x, y) { return new Mat(1, 0, 0, 1, x, y); }
  static scale(x, y = x) { return new Mat(x, 0, 0, y, 0, 0); }
  static rotation(deg) {
    const r = U.rad(deg), c = Math.cos(r), s = Math.sin(r);
    return new Mat(c, s, -s, c, 0, 0);
  }
  static skew(xDeg, yDeg) {
    return new Mat(1, Math.tan(U.rad(yDeg)), Math.tan(U.rad(xDeg)), 1, 0, 0);
  }
  mul(m) {
    return new Mat(
      this.a * m.a + this.c * m.b,
      this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d,
      this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e,
      this.b * m.e + this.d * m.f + this.f
    );
  }
  inverse() {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) < 1e-9) return Mat.identity();
    const id = 1 / det;
    return new Mat(
      this.d * id, -this.b * id,
      -this.c * id, this.a * id,
      (this.c * this.f - this.d * this.e) * id,
      (this.b * this.e - this.a * this.f) * id
    );
  }
  apply(x, y) { return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f }; }
  applyVec(x, y) { return { x: this.a * x + this.c * y, y: this.b * x + this.d * y }; }
}

/* =========================================================================
   Easing
   ========================================================================= */
const EASINGS = {
  linear: t => t,
  smooth: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeIn: t => t * t * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeInOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  backIn: t => { const c = 1.70158; return (c + 1) * t * t * t - c * t * t; },
  backOut: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  backInOut: t => {
    const c = 1.70158 * 1.525;
    return t < .5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
  elasticOut: t => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1;
  },
  bounceOut: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  },
  hold: () => 0
};
U.ease = (name, t) => (EASINGS[name] || EASINGS.easeInOut)(t);

/* =========================================================================
   Icons — consistent 24px stroke set
   ========================================================================= */
const ICONS = {
  logo: '<path d="M5 10.5a7 7 0 0 1 14 0v1.8a7 7 0 0 1-14 0v-1.8z"/><path d="M12 19.5V22"/><circle cx="12" cy="10.5" r="2.6"/><path d="M8.5 6.2A5 5 0 0 1 12 5"/>',
  select: '<path d="M5 3l6.3 16.6 2.1-6.9 6.9-2.1L5 3z"/>',
  rotate: '<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.2v6h-6"/>',
  pivot: '<circle cx="12" cy="12" r="2.4"/><path d="M12 3v4.2M12 16.8V21M3 12h4.2M16.8 12H21"/><circle cx="12" cy="12" r="7.6" stroke-dasharray="2 3"/>',
  pan: '<path d="M12 3v18M3 12h18"/><path d="M9.2 5.8L12 3l2.8 2.8M9.2 18.2L12 21l2.8-2.8M5.8 9.2L3 12l2.8 2.8M18.2 9.2L21 12l-2.8 2.8"/>',
  play: '<path d="M8 5.2v13.6L19 12 8 5.2z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.8" y="5" width="3.8" height="14" rx="1.1" fill="currentColor" stroke="none"/><rect x="13.4" y="5" width="3.8" height="14" rx="1.1" fill="currentColor" stroke="none"/>',
  skipStart: '<path d="M6 5v14"/><path d="M19 5.4L9 12l10 6.6V5.4z" fill="currentColor" stroke="none"/>',
  skipEnd: '<path d="M18 5v14"/><path d="M5 5.4L15 12 5 18.6V5.4z" fill="currentColor" stroke="none"/>',
  stepBack: '<path d="M7 5v14"/><path d="M18 6.2L10 12l8 5.8V6.2z"/>',
  stepFwd: '<path d="M17 5v14"/><path d="M6 6.2L14 12l-8 5.8V6.2z"/>',
  loop: '<path d="M17 3l4 4-4 4"/><path d="M3 12V9a4 4 0 0 1 4-4h14"/><path d="M7 21l-4-4 4-4"/><path d="M21 12v3a4 4 0 0 1-4 4H3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H12"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H12"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.4h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  save: '<path d="M5 3h11l3 3v15H5V3z"/><path d="M8 3v6h7V3"/><path d="M8 21v-7h8v7"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M4 3h16"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.4" cy="8.4" r="1.6"/><path d="M21 15.2l-5-5L5 21"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  settings: '<path d="M4 7h8.5M17.5 7H20M4 17h2.5M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.2A11 11 0 0 1 12 5c6.4 0 10 7 10 7a17.4 17.4 0 0 1-3.1 4"/><path d="M6.6 6.6C3.7 8.6 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  unlock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7a4 4 0 0 1 7.6-1.8"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 16l9 5 9-5"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  onion: '<circle cx="9" cy="12" r="5.6"/><circle cx="15" cy="12" r="5.6"/>',
  diamond: '<path d="M12 3l9 9-9 9-9-9 9-9z"/>',
  keyPlus: '<path d="M12 3l9 9-9 9-9-9 9-9z"/><path d="M12 8v8M8 12h8"/>',
  camera: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H8l1.6-2.5h4.8L16 6h2.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-9z"/><circle cx="12" cy="13" r="3.8"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/><path d="M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/><path d="M8 11h6"/>',
  fit: '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9"/><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9"/><path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.8.6-1.5 1.1-1.5 2.3"/><circle cx="12" cy="17.2" r=".9" fill="currentColor"/>',
  grip: '<circle cx="9" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.1" fill="currentColor" stroke="none"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
  magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 3h4v8a2 2 0 0 0 4 0V3h4"/><path d="M6 8h4M14 8h4"/>',
  scissors: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8.1 7.5L20 19M8.1 16.5L20 5"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r=".9" fill="currentColor"/>',
  warn: '<path d="M12 3l9.5 17H2.5L12 3z"/><path d="M12 9v5"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>',
  file: '<path d="M6 3h8l4 4v14H6V3z"/><path d="M14 3v4h4"/>',
  wave: '<path d="M3 12h2M7 8v8M11 4v16M15 6.5v11M19 9.5v5M21 12h1"/>',
  plusLayer: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M12 8v8M8 12h8"/>'
};

U.icon = function (name, size = 20, cls = '') {
  const p = ICONS[name] || ICONS.info;
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
};
U.hydrateIcons = function (root = document) {
  U.qsa('[data-icon]', root).forEach(el => {
    if (el.dataset.iconDone) return;
    el.insertAdjacentHTML('afterbegin', U.icon(el.dataset.icon, el.dataset.iconSize ? +el.dataset.iconSize : 20));
    el.dataset.iconDone = '1';
  });
};

/* tiny debounce / throttle */
U.debounce = function (fn, ms) {
  let t = null;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
};
U.throttleFrame = function (fn) {
  let queued = false;
  return function (...args) {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn.apply(this, args); });
  };
};
