/* =========================================================================
   Suction Studio — default-project.js
   Builds the bundled demo: a procedurally drawn suction-cup character,
   rigged with pivots, parented limbs, keyframes, camera move and a pop SFX.
   ========================================================================= */
'use strict';

const DefaultProject = (() => {

  const INK = '#132028';
  const BODY = '#3ec9b6';
  const BODY_DARK = '#2aa99a';
  const BODY_LIGHT = '#5fe0cd';
  const CUP = '#ff6b6b';
  const CUP_DARK = '#e04f5f';
  const CUP_LIGHT = '#ff9d8a';

  function make(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.lineJoin = 'round';
    x.lineCap = 'round';
    draw(x, w, h);
    return { src: c.toDataURL('image/png'), w, h };
  }

  function capsule(x, x1, y1, x2, y2, r, fill, outline = INK) {
    x.lineCap = 'round';
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2);
    x.strokeStyle = outline; x.lineWidth = r * 2 + 12; x.stroke();
    x.strokeStyle = fill; x.lineWidth = r * 2; x.stroke();
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    x.save();
    x.globalAlpha = 0.22;
    x.strokeStyle = '#ffffff';
    x.lineWidth = Math.max(4, r * 0.44);
    x.beginPath();
    x.moveTo(x1 + nx * r * 0.46, y1 + ny * r * 0.46);
    x.lineTo(x2 + nx * r * 0.46, y2 + ny * r * 0.46);
    x.stroke();
    x.restore();
  }

  function joint(x, cx, cy, r, fill = BODY_DARK) {
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fillStyle = fill; x.fill();
    x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
  }

  function suctionCup(x, cx, cy, r, squash = 1) {
    const g = x.createRadialGradient(cx - r * .35, cy - r * .4, r * .08, cx, cy, r);
    g.addColorStop(0, CUP_LIGHT);
    g.addColorStop(.55, CUP);
    g.addColorStop(1, CUP_DARK);
    x.beginPath(); x.ellipse(cx, cy, r, r * squash, 0, 0, Math.PI * 2);
    x.fillStyle = g; x.fill();
    x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.ellipse(cx, cy, r * .62, r * .62 * squash, 0, 0, Math.PI * 2);
    x.fillStyle = CUP_DARK; x.fill();
    x.beginPath(); x.ellipse(cx, cy, r * .28, r * .28 * squash, 0, 0, Math.PI * 2);
    x.fillStyle = CUP_LIGHT; x.fill();
    x.beginPath();
    x.arc(cx - r * .1, cy - r * .1, r * .82, Math.PI * 1.08, Math.PI * 1.46);
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = Math.max(3, r * .11); x.stroke();
  }

  /* ---------------------------- parts ---------------------------- */
  const head = make(240, 240, (x) => {
    // suction-cup ears behind the head
    for (const ex of [16, 224]) {
      x.beginPath(); x.arc(ex, 128, 27, 0, Math.PI * 2);
      x.fillStyle = CUP; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
      x.beginPath(); x.arc(ex, 128, 13, 0, Math.PI * 2); x.fillStyle = CUP_DARK; x.fill();
      x.beginPath(); x.arc(ex, 128, 6, 0, Math.PI * 2); x.fillStyle = CUP_LIGHT; x.fill();
    }
    const g = x.createLinearGradient(0, 20, 0, 232);
    g.addColorStop(0, BODY_LIGHT); g.addColorStop(1, BODY);
    x.beginPath(); x.ellipse(120, 124, 98, 102, 0, 0, Math.PI * 2);
    x.fillStyle = g; x.fill(); x.lineWidth = 7; x.strokeStyle = INK; x.stroke();

    x.save();
    x.beginPath(); x.ellipse(120, 124, 98, 102, 0, 0, Math.PI * 2); x.clip();
    x.beginPath(); x.ellipse(86, 52, 56, 26, -0.45, 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,.17)'; x.fill();
    x.restore();

    // eyes
    for (const ex of [84, 156]) {
      x.beginPath(); x.ellipse(ex, 112, 24, 28, 0, 0, Math.PI * 2);
      x.fillStyle = '#fffdf6'; x.fill(); x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
      x.beginPath(); x.arc(ex + 3, 115, 10.5, 0, Math.PI * 2); x.fillStyle = '#16232b'; x.fill();
      x.beginPath(); x.arc(ex, 111, 3.6, 0, Math.PI * 2); x.fillStyle = '#ffffff'; x.fill();
    }
    // brows
    x.strokeStyle = '#16232b'; x.lineWidth = 6.5;
    x.beginPath(); x.moveTo(64, 75); x.quadraticCurveTo(84, 62, 104, 73); x.stroke();
    x.beginPath(); x.moveTo(136, 73); x.quadraticCurveTo(156, 62, 176, 75); x.stroke();
    // cheeks
    for (const cx of [60, 180]) {
      x.beginPath(); x.arc(cx, 148, 13, 0, Math.PI * 2);
      x.fillStyle = 'rgba(255,130,140,.3)'; x.fill();
    }
    // mouth
    x.beginPath();
    x.moveTo(82, 154);
    x.quadraticCurveTo(120, 198, 158, 154);
    x.quadraticCurveTo(120, 176, 82, 154);
    x.closePath();
    x.fillStyle = '#16232b'; x.fill();
    x.lineWidth = 4; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.ellipse(120, 171, 17, 8.5, 0, 0, Math.PI * 2);
    x.fillStyle = '#ff8f96'; x.fill();
  });

  const torso = make(190, 240, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 240);
    g.addColorStop(0, BODY_LIGHT); g.addColorStop(.55, BODY); g.addColorStop(1, BODY_DARK);
    x.beginPath();
    x.moveTo(50, 12);
    x.quadraticCurveTo(95, 0, 140, 12);
    x.quadraticCurveTo(174, 24, 178, 92);
    x.quadraticCurveTo(182, 190, 166, 224);
    x.quadraticCurveTo(95, 242, 24, 224);
    x.quadraticCurveTo(8, 190, 12, 92);
    x.quadraticCurveTo(16, 24, 50, 12);
    x.closePath();
    x.fillStyle = g; x.fill();
    x.lineWidth = 7; x.strokeStyle = INK; x.stroke();
    // belly
    x.beginPath(); x.ellipse(95, 160, 52, 56, 0, 0, Math.PI * 2);
    x.fillStyle = 'rgba(255,255,255,.2)'; x.fill();
    // chest cup emblem
    x.beginPath(); x.arc(95, 156, 25, 0, Math.PI * 2);
    x.fillStyle = CUP; x.fill(); x.lineWidth = 5; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.arc(95, 156, 13, 0, Math.PI * 2); x.fillStyle = CUP_DARK; x.fill();
    x.beginPath(); x.arc(95, 156, 6, 0, Math.PI * 2); x.fillStyle = CUP_LIGHT; x.fill();
  });

  const upperArm = make(150, 64, (x) => {
    capsule(x, 14, 32, 136, 32, 23, BODY_DARK);
    joint(x, 16, 32, 18);
    joint(x, 134, 32, 15);
  });

  const lowerArm = make(130, 56, (x) => {
    capsule(x, 12, 28, 118, 28, 20, BODY_DARK);
    joint(x, 14, 28, 14);
    joint(x, 116, 28, 12);
  });

  const hand = make(110, 110, (x) => {
    x.lineCap = 'round';
    x.beginPath(); x.moveTo(14, 55); x.lineTo(42, 55);
    x.strokeStyle = INK; x.lineWidth = 36; x.stroke();
    x.strokeStyle = BODY_DARK; x.lineWidth = 26; x.stroke();
    suctionCup(x, 66, 55, 37);
  });

  const upperLeg = make(90, 160, (x) => {
    capsule(x, 45, 16, 45, 144, 27, BODY_DARK);
    joint(x, 45, 18, 20);
    joint(x, 45, 142, 18);
  });

  const lowerLeg = make(80, 150, (x) => {
    capsule(x, 40, 14, 40, 136, 23, BODY_DARK);
    joint(x, 40, 16, 15);
    joint(x, 40, 134, 14);
  });

  const foot = make(150, 80, (x) => {
    x.beginPath(); x.arc(34, 34, 20, 0, Math.PI * 2);
    x.fillStyle = BODY_DARK; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    const g = x.createRadialGradient(70, 34, 6, 88, 46, 62);
    g.addColorStop(0, CUP_LIGHT); g.addColorStop(.5, CUP); g.addColorStop(1, CUP_DARK);
    x.beginPath(); x.ellipse(88, 46, 55, 26, 0, 0, Math.PI * 2);
    x.fillStyle = g; x.fill(); x.lineWidth = 6; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.ellipse(88, 46, 34, 14, 0, 0, Math.PI * 2);
    x.fillStyle = CUP_DARK; x.fill();
    x.beginPath(); x.ellipse(88, 46, 13, 6, 0, 0, Math.PI * 2);
    x.fillStyle = CUP_LIGHT; x.fill();
    x.beginPath(); x.arc(74, 36, 40, Math.PI * 1.12, Math.PI * 1.42);
    x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 5; x.stroke();
  });

  const shadow = make(420, 90, (x) => {
    x.save();
    x.translate(210, 45); x.scale(1, 0.21);
    const g = x.createRadialGradient(0, 0, 8, 0, 0, 205);
    g.addColorStop(0, 'rgba(10,14,18,.42)');
    g.addColorStop(.55, 'rgba(10,14,18,.2)');
    g.addColorStop(1, 'rgba(10,14,18,0)');
    x.beginPath(); x.arc(0, 0, 205, 0, Math.PI * 2); x.fillStyle = g; x.fill();
    x.restore();
  });

  const backdrop = make(1920, 1080, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 1080);
    g.addColorStop(0, '#f7f2e7');
    g.addColorStop(.55, '#efe8da');
    g.addColorStop(1, '#ded5c4');
    x.fillStyle = g; x.fillRect(0, 0, 1920, 1080);

    const glow = x.createRadialGradient(960, 470, 80, 960, 470, 820);
    glow.addColorStop(0, 'rgba(255,255,255,.62)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = glow; x.fillRect(0, 0, 1920, 1080);

    // floor
    x.fillStyle = 'rgba(120,104,82,.10)';
    x.fillRect(0, 1008, 1920, 72);
    x.strokeStyle = 'rgba(95,82,64,.18)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, 1008); x.lineTo(1920, 1008); x.stroke();

    // soft vignette
    const v = x.createRadialGradient(960, 540, 420, 960, 540, 1180);
    v.addColorStop(0, 'rgba(60,50,40,0)');
    v.addColorStop(1, 'rgba(60,50,40,.2)');
    x.fillStyle = v; x.fillRect(0, 0, 1920, 1080);
  });

  /* ---------------------------- sound ---------------------------- */
  function makePop() {
    const sr = 44100, dur = 0.45, n = Math.floor(sr * dur);
    const data = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 14);
      const f = 120 + 560 * Math.exp(-t * 26);
      phase += 2 * Math.PI * f / sr;
      let s = Math.sin(phase) * env * 0.5;
      s += Math.sin(2 * Math.PI * 68 * t) * Math.exp(-t * 10) * 0.32;
      if (t < 0.018) s += (Math.random() * 2 - 1) * (1 - t / 0.018) * 0.2;
      data[i] = Math.tanh(s * 1.7) * 0.85;
    }
    const buf = new ArrayBuffer(44 + n * 2);
    const dv = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE');
    ws(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ws(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return 'data:audio/wav;base64,' + U.bytesToBase64(new Uint8Array(buf));
  }

  /* ---------------------------- build ---------------------------- */
  function build() {
    const project = Model.createProject({ name: 'CupGuy — Idle Wave' });
    project.settings = { width: 1920, height: 1080, fps: 24, duration: 96, background: '#e9e3d7', transparent: false };

    const assets = {
      backdrop: { name: 'Studio Backdrop', ...backdrop },
      shadow: { name: 'Contact Shadow', ...shadow },
      head: { name: 'Head', ...head },
      torso: { name: 'Torso', ...torso },
      upperArm: { name: 'Upper Arm', ...upperArm },
      lowerArm: { name: 'Lower Arm', ...lowerArm },
      hand: { name: 'Suction Hand', ...hand },
      upperLeg: { name: 'Upper Leg', ...upperLeg },
      lowerLeg: { name: 'Lower Leg', ...lowerLeg },
      foot: { name: 'Suction Foot', ...foot }
    };
    for (const id of Object.keys(assets)) {
      const a = assets[id];
      project.assets[id] = { id, name: a.name, type: 'image', src: a.src, w: a.w, h: a.h, duration: 0 };
    }
    const popSrc = makePop();
    project.assets.pop = { id: 'pop', name: 'Suction Pop', type: 'audio', src: popSrc, w: 0, h: 0, duration: 0.45 };

    const addLayer = (id, assetId, name, parent, base, pivot, locked = false) => {
      const l = Model.newLayer(project, { assetId, name, parent, base });
      l.id = id;
      l.pivot = pivot;
      l.locked = locked;
      return l;
    };

    const backdropLayer = addLayer('backdrop', 'backdrop', 'Studio Backdrop', null, { x: 0, y: 0 }, { x: 0, y: 0 }, true);
    backdropLayer.bg = true; // full-frame plate: never included in onion ghosts
    addLayer('shadow', 'shadow', 'Contact Shadow', null, { x: 960, y: 970 }, { x: 210, y: 45 }, true);

    // Everything below the torso is positioned in the parent's pivot space.
    addLayer('torso', 'torso', 'Torso', null, { x: 960, y: 560 }, { x: 95, y: 120 });
    addLayer('head', 'head', 'Head', 'torso', { x: 0, y: -108 }, { x: 120, y: 236 });

    addLayer('legL', 'upperLeg', 'Leg L · Upper', 'torso', { x: -35, y: 108, rotation: 4 }, { x: 45, y: 16 });
    addLayer('shinL', 'lowerLeg', 'Leg L · Lower', 'legL', { x: 0, y: 126, rotation: -7 }, { x: 40, y: 14 });
    addLayer('footL', 'foot', 'Foot L', 'shinL', { x: 0, y: 120, rotation: 3, scaleX: -1 }, { x: 34, y: 34 });
    addLayer('legR', 'upperLeg', 'Leg R · Upper', 'torso', { x: 35, y: 108, rotation: -4 }, { x: 45, y: 16 });
    addLayer('shinR', 'lowerLeg', 'Leg R · Lower', 'legR', { x: 0, y: 126, rotation: 7 }, { x: 40, y: 14 });
    addLayer('footR', 'foot', 'Foot R', 'shinR', { x: 0, y: 120, rotation: -3 }, { x: 34, y: 34 });

    addLayer('armL', 'upperArm', 'Arm L · Upper', 'torso', { x: -80, y: -68, rotation: 155 }, { x: 14, y: 32 });
    addLayer('forearmL', 'lowerArm', 'Arm L · Lower', 'armL', { x: 120, y: 0, rotation: 20 }, { x: 12, y: 28 });
    addLayer('handL', 'hand', 'Hand L', 'forearmL', { x: 104, y: 0, rotation: 5 }, { x: 14, y: 55 });

    addLayer('armR', 'upperArm', 'Arm R · Upper', 'torso', { x: 80, y: -68, rotation: 25 }, { x: 14, y: 32 });
    addLayer('forearmR', 'lowerArm', 'Arm R · Lower', 'armR', { x: 120, y: 0, rotation: -20 }, { x: 12, y: 28 });
    addLayer('handR', 'hand', 'Hand R', 'forearmR', { x: 104, y: 0, rotation: -5 }, { x: 14, y: 55 });

    // make sure the torso is drawn above the legs but below arms/head
    const order = ['backdrop', 'shadow', 'legL', 'shinL', 'footL', 'legR', 'shinR', 'footR',
      'torso', 'armL', 'forearmL', 'handL', 'armR', 'forearmR', 'handR', 'head'];
    project.layers.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    const L = id => Model.getLayer(project, id);
    const key = (id, prop, frames) => {
      const l = L(id);
      for (const [t, v, e] of frames) Model.setKey(l, prop, t, v, e || 'smooth');
    };

    key('torso', 'y', [[0, 560], [12, 552], [24, 560], [48, 556], [72, 560], [96, 560]]);
    key('torso', 'rotation', [[0, 0], [24, -1.4], [48, 1], [72, 0], [96, 0]]);
    key('head', 'y', [[0, -108], [14, -113], [30, -108], [60, -111], [96, -108]]);
    key('head', 'rotation', [[0, 0], [14, 2.4], [30, -2.2], [48, 0], [72, 1.8], [96, 0]]);
    key('head', 'scaleY', [[0, 1], [12, 1.025], [24, 1], [48, 1.01], [72, 1], [96, 1]]);

    key('armR', 'rotation', [[0, 25], [10, 25], [22, -55, 'backOut'], [32, -44], [42, -62], [52, -44], [62, -60], [74, -40], [86, -18], [96, 25]]);
    key('forearmR', 'rotation', [[0, -20], [10, -20], [22, -15], [32, 25, 'backOut'], [42, -35], [52, 20], [62, -30], [74, 10], [86, -12], [96, -20]]);
    key('handR', 'rotation', [[0, -5], [22, -10], [32, 15], [42, -15], [52, 10], [62, -8], [74, 4], [96, -5]]);

    key('armL', 'rotation', [[0, 155], [24, 151], [48, 158], [72, 153], [96, 155]]);
    key('forearmL', 'rotation', [[0, 20], [24, 16], [48, 24], [72, 18], [96, 20]]);
    key('handL', 'rotation', [[0, 5], [24, 8], [48, 2], [72, 6], [96, 5]]);
    key('legL', 'rotation', [[0, 4], [24, 2.5], [48, 5], [72, 2.5], [96, 4]]);
    key('shinL', 'rotation', [[0, -7], [24, -5], [48, -9], [72, -5], [96, -7]]);
    key('footL', 'rotation', [[0, 3], [24, 2], [48, 4], [72, 2], [96, 3]]);
    key('legR', 'rotation', [[0, -4], [24, -2.5], [48, -5], [72, -2.5], [96, -4]]);
    key('shinR', 'rotation', [[0, 7], [24, 5], [48, 9], [72, 5], [96, 7]]);
    key('footR', 'rotation', [[0, -3], [24, -2], [48, -4], [72, -2], [96, -3]]);

    key('shadow', 'scaleX', [[0, 1], [12, 0.95], [24, 1], [48, 0.97], [72, 1], [96, 1]]);
    key('shadow', 'opacity', [[0, 0.85], [12, 0.7], [24, 0.85], [48, 0.78], [72, 0.85], [96, 0.85]]);

    Model.setKey(project.camera, 'zoom', 0, 1, 'smooth');
    Model.setKey(project.camera, 'zoom', 48, 1.035, 'smooth');
    Model.setKey(project.camera, 'zoom', 96, 1, 'smooth');
    Model.setKey(project.camera, 'x', 0, 0, 'smooth');
    Model.setKey(project.camera, 'x', 48, -6, 'smooth');
    Model.setKey(project.camera, 'x', 96, 0, 'smooth');

    Model.addAudioClip(project, project.assets.pop, 30, null);
    const second = Model.addAudioClip(project, project.assets.pop, 62, null);
    second.clip.gain = 0.7;

    return project;
  }

  return { build };
})();
