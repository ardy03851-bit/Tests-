/* =========================================================================
   Suction Studio — audio.js
   WebAudio playback, sample-accurate clip scheduling, offline WAV bounce.
   ========================================================================= */
'use strict';

const AudioEngine = {
  ctx: null,
  master: null,
  buffers: new Map(),
  decoding: new Map(),
  active: [],
  previewNode: null,
  volume: 0.9,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  },

  async decode(arrayBuffer) {
    const ctx = this.ensure();
    if (!ctx) throw new Error('Web Audio is not supported');
    return ctx.decodeAudioData(arrayBuffer.slice(0));
  },

  async getBuffer(asset) {
    if (!asset) return null;
    if (this.buffers.has(asset.id)) return this.buffers.get(asset.id);
    if (this.decoding.has(asset.id)) return this.decoding.get(asset.id);
    const p = (async () => {
      try {
        const res = await fetch(asset.src);
        const ab = await res.arrayBuffer();
        const buf = await this.decode(ab);
        this.buffers.set(asset.id, buf);
        return buf;
      } catch (e) {
        console.warn('Audio decode failed', e);
        return null;
      } finally {
        this.decoding.delete(asset.id);
      }
    })();
    this.decoding.set(asset.id, p);
    return p;
  },

  async prepare(project) {
    const list = Object.values(project.assets).filter(a => a.type === 'audio');
    await Promise.all(list.map(a => this.getBuffer(a)));
  },

  stop() {
    for (const node of this.active) {
      try { node.stop(); } catch (e) { /* already stopped */ }
      try { node.disconnect(); } catch (e) { /* noop */ }
    }
    this.active.length = 0;
    if (this.previewNode) {
      try { this.previewNode.stop(); } catch (e) { /* noop */ }
      this.previewNode = null;
    }
  },

  /** Schedule every clip that overlaps [fromSec, end] into `dest`. */
  scheduleAll(ctx, dest, project, fromSec, fps, when) {
    const started = [];
    for (const track of project.audioTracks) {
      if (track.muted) continue;
      for (const clip of track.clips) {
        const asset = project.assets[clip.assetId];
        if (!asset) continue;
        const buffer = this.buffers.get(asset.id);
        if (!buffer) continue;
        const startSec = clip.start / fps;
        const endSec = startSec + clip.duration;
        if (endSec <= fromSec) continue;
        const skip = Math.max(0, fromSec - startSec);
        const remain = clip.duration - skip;
        if (remain <= 0.001) continue;
        const offset = Math.min(buffer.duration, clip.offset + skip);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, clip.gain);
        src.connect(gain);
        gain.connect(dest);
        try {
          src.start(when + Math.max(0, startSec - fromSec), offset, remain);
          started.push(src, gain);
        } catch (e) { /* ignore bad schedule */ }
      }
    }
    return started;
  },

  async play(project, fromFrames, fps) {
    this.stop();
    const ctx = this.ensure();
    if (!ctx) return;
    try { await this.prepare(project); } catch (e) { /* noop */ }
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* noop */ } }
    const started = this.scheduleAll(ctx, this.master, project, fromFrames / fps, fps, ctx.currentTime + 0.025);
    this.active.push(...started);
  },

  async playFrom(project, fromFrames, fps) {
    return this.play(project, fromFrames, fps);
  },

  async preview(asset, offset = 0, duration = 2) {
    this.stop();
    const buffer = await this.getBuffer(asset);
    if (!buffer) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* noop */ } }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain);
    gain.connect(this.master);
    src.start(0, Math.min(offset, buffer.duration), Math.max(0.05, duration));
    this.previewNode = src;
    src.onended = () => { if (this.previewNode === src) this.previewNode = null; };
  },

  setVolume(v) {
    this.volume = U.clamp(v, 0, 1);
    if (this.master) this.master.gain.value = this.volume;
  },

  /** Render the full mix offline. Returns an AudioBuffer. */
  async renderOffline(project, fps) {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) throw new Error('Offline audio is not supported');
    await this.prepare(project);
    const durationSec = Math.max(0.1, project.settings.duration / fps);
    const sr = 44100;
    const ctx = new AC(2, Math.ceil(durationSec * sr), sr);
    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);
    this.scheduleAll(ctx, master, project, 0, fps, 0);
    return ctx.startRendering();
  }
};
