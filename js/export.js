/* =========================================================================
   Suction Studio — export.js
   Video (MediaRecorder + WebAudio), PNG sequence ZIP, stills, WAV, project.
   ========================================================================= */
'use strict';

const Exporter = {
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  pickMime(includeAudio) {
    if (!window.MediaRecorder) return null;
    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4'
    ];
    for (const m of candidates) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* noop */ }
    }
    return '';
  },

  exportSize(scale) {
    const s = App.project.settings;
    let w = Math.round(s.width * scale);
    let h = Math.round(s.height * scale);
    const maxW = 4096, maxH = 4096;
    if (w > maxW || h > maxH) {
      const k = Math.min(maxW / w, maxH / h);
      w = Math.round(w * k); h = Math.round(h * k);
    }
    return { w: Math.max(2, w), h: Math.max(2, h) };
  },

  safeName() {
    return (App.project.name || 'animation').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'animation';
  },

  hasAudio() {
    return App.project.audioTracks.some(t => t.clips.length > 0);
  },

  /* ------------------------------ video ------------------------------ */
  async exportVideo(opts = {}) {
    if (!window.MediaRecorder) throw new Error('This browser does not support video recording. Use PNG Sequence instead.');
    try {
      return await this.recordVideo(opts, false);
    } catch (err) {
      // Some encoders drop every frame on a requestFrame() capture stream.
      // Retry once with a timed capture stream before giving up.
      if (!/no data/i.test(String(err && err.message))) throw err;
      return await this.recordVideo(opts, true);
    }
  },

  async recordVideo(opts = {}, timedStream = false) {
    const project = App.project;
    const s = project.settings;
    const fps = opts.fps || s.fps;
    const scale = opts.scale || 1;
    const { w, h } = this.exportSize(scale);
    const mime = this.pickMime(!!opts.audio);
    if (!mime) throw new Error('No supported video codec was found. Use PNG Sequence instead.');
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    Renderer.renderToCanvas(canvas, 0, { transparent: false });

    let stream = timedStream ? canvas.captureStream(fps) : canvas.captureStream(0);
    let track = stream.getVideoTracks()[0];
    let canRequest = !timedStream && track && typeof track.requestFrame === 'function';
    if (!canRequest) {
      stream = canvas.captureStream(fps);
      track = stream.getVideoTracks()[0];
    }

    let audioCtx = null;
    if (opts.audio && this.hasAudio()) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        await audioCtx.resume();
        const audioDest = audioCtx.createMediaStreamDestination();
        const master = audioCtx.createGain();
        master.gain.value = AudioEngine.volume;
        master.connect(audioDest);
        await AudioEngine.prepare(project);
        AudioEngine.scheduleAll(audioCtx, master, project, 0, s.fps, audioCtx.currentTime + 0.05);
        for (const t of audioDest.stream.getAudioTracks()) stream.addTrack(t);
      } catch (e) {
        console.warn('Audio capture unavailable', e);
        try { await audioCtx.close(); } catch (err) { /* noop */ }
        audioCtx = null;
      }
    }

    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: opts.bitrate || 12_000_000,
      audioBitsPerSecond: 192_000
    });
    const chunks = [];
    let gotData = false;
    rec.ondataavailable = e => { if (e.data && e.data.size) { gotData = true; chunks.push(e.data); } };
    const stopped = new Promise(resolve => { rec.onstop = resolve; });
    rec.start(250);

    const durationSec = s.duration / s.fps;
    const total = Math.max(1, Math.round(durationSec * fps));
    const start = performance.now();
    try {
      for (let i = 0; i < total; i++) {
        if (opts.shouldCancel && opts.shouldCancel()) throw new Error('cancelled');
        const time = (i / fps) * s.fps;
        Renderer.renderToCanvas(canvas, time, { transparent: false });
        if (canRequest && track) { try { track.requestFrame(); } catch (e) { /* noop */ } }
        if (opts.onProgress) opts.onProgress((i + 1) / total, i + 1, total);
        const target = start + ((i + 1) / fps) * 1000;
        const wait = target - performance.now();
        if (wait > 0) await this.sleep(wait);
      }
      // Software encoders (and short clips) can need a beat before the first
      // packet lands. Only wait when nothing has been emitted yet, so normal
      // length exports keep their exact duration.
      const flushStart = performance.now();
      while (!gotData && performance.now() - flushStart < 2000) await this.sleep(40);
      if (typeof rec.requestData === 'function') { try { rec.requestData(); } catch (e) { /* noop */ } }
      await this.sleep(80);
    } finally {
      try { rec.stop(); } catch (e) { /* noop */ }
      if (audioCtx) { try { await audioCtx.close(); } catch (e) { /* noop */ } }
    }
    await stopped;
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size) throw new Error('Recording produced no data.');
    return { blob, ext, mime };
  },

  /* --------------------------- png sequence -------------------------- */
  async exportPNGSequence(opts = {}) {
    const project = App.project;
    const s = project.settings;
    const scale = opts.scale || 1;
    const step = Math.max(1, opts.step || 1);
    const { w, h } = this.exportSize(scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const files = [];
    const frames = [];
    for (let i = 0; i < s.duration; i += step) frames.push(i);
    const total = frames.length;

    for (let n = 0; n < frames.length; n++) {
      if (opts.shouldCancel && opts.shouldCancel()) throw new Error('cancelled');
      const frame = frames[n];
      Renderer.renderToCanvas(canvas, frame, { transparent: !!opts.transparent });
      const blob = await this.canvasToBlob(canvas, 'image/png');
      const buf = new Uint8Array(await blob.arrayBuffer());
      files.push({ name: 'frame_' + String(frame + 1).padStart(4, '0') + '.png', data: buf });
      if (opts.onProgress) opts.onProgress((n + 1) / total, n + 1, total);
      // let the browser breathe
      await new Promise(r => setTimeout(r, 0));
    }
    const zip = U.makeZip(files);
    return { blob: zip, count: total };
  },

  canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode frame')), type, quality);
      } else {
        try {
          const dataURL = canvas.toDataURL(type, quality);
          const bin = atob(dataURL.split(',')[1]);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          resolve(new Blob([bytes], { type }));
        } catch (e) { reject(e); }
      }
    });
  },

  /* ------------------------------ still ------------------------------ */
  async exportStill(opts = {}) {
    const scale = opts.scale || 1;
    const { w, h } = this.exportSize(scale);
    const canvas = Renderer.makeFrameCanvas(w, h, App.time, !!opts.transparent);
    return this.canvasToBlob(canvas, 'image/png');
  },

  /* ------------------------------- wav ------------------------------- */
  async exportWav() {
    const buffer = await AudioEngine.renderOffline(App.project, App.project.settings.fps);
    return U.encodeWav(buffer);
  },

  /* ----------------------------- project ----------------------------- */
  exportProject() {
    return new Blob([Model.serialize(App.project)], { type: 'application/json' });
  }
};
