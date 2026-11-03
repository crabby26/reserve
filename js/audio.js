// All sound is synthesised at runtime with Web Audio. No sample files.
window.ReserveAudio = (function () {
  'use strict';

  let ctx = null, master = null, engine = null, wind = null, noiseBuf = null;
  let enabled = true;
  try { enabled = localStorage.getItem('reserve.sound') !== 'off'; } catch (e) { /* private mode */ }

  // iOS only starts audio from inside a user gesture.
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    master.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // Engine: two detuned saws through a low-pass.
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(master);
    o1.frequency.value = 50; o2.frequency.value = 25;
    o1.start(); o2.start();
    engine = { o1, o2, f, g };

    // Wind for sandstorms: filtered looping noise.
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.7;
    const wg = ctx.createGain(); wg.gain.value = 0;
    n.connect(wf); wf.connect(wg); wg.connect(master); n.start();
    wind = { g: wg, f: wf };
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem('reserve.sound', on ? 'on' : 'off'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.02);
  }

  // frac: speed 0..1, throttle 0..1, running: engine alive
  function setEngine(frac, throttle, running) {
    if (!engine) return;
    const t = ctx.currentTime;
    const hz = 42 + frac * 120 + throttle * 12;
    engine.o1.frequency.setTargetAtTime(hz, t, 0.06);
    engine.o2.frequency.setTargetAtTime(hz / 2 + 1.5, t, 0.06);
    engine.f.frequency.setTargetAtTime(240 + frac * 700 + throttle * 300, t, 0.08);
    engine.g.gain.setTargetAtTime(running ? 0.09 + throttle * 0.07 : 0, t, 0.08);
  }

  function setWind(level) {
    if (!wind) return;
    wind.g.gain.setTargetAtTime(level * 0.28, ctx.currentTime, 0.4);
  }

  function tone(type, f0, f1, dur, vol, delay) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq, delay) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  const sfx = {
    horn(v) {
      const k = v === 1 ? 1.32 : 1;
      tone('square', 330 * k, 318 * k, 0.32, 0.14);
      tone('square', 415 * k, 402 * k, 0.32, 0.12);
    },
    click() { tone('square', 700, 500, 0.05, 0.08); },
    pickup() { tone('triangle', 520, 880, 0.12, 0.2); tone('triangle', 880, 1100, 0.12, 0.16, 0.1); },
    pump() { noise(0.4, 0.14, 900); tone('sine', 150, 90, 0.3, 0.12); },
    bad() { tone('sawtooth', 220, 90, 0.4, 0.2); },
    crash() { noise(0.35, 0.5, 1600); tone('square', 120, 40, 0.25, 0.2); },
    boost() { noise(0.5, 0.25, 2200); tone('sawtooth', 160, 480, 0.45, 0.14); },
    go() { tone('square', 660, 660, 0.35, 0.16); },
    count() { tone('square', 440, 440, 0.15, 0.14); },
    win() { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.18, 0.14, i * 0.14)); },
    lose() { [392, 349, 311, 233].forEach((f, i) => tone('triangle', f, f * 0.98, 0.26, 0.2, i * 0.22)); },
    moo() { tone('sawtooth', 180, 120, 0.8, 0.22); tone('sawtooth', 122, 96, 0.9, 0.14); },
    gurgle() { for (let i = 0; i < 4; i++) tone('sine', 130 + i * 30, 300 + i * 50, 0.09, 0.22, i * 0.11); },
    alarm() { tone('square', 880, 880, 0.1, 0.13); tone('square', 660, 660, 0.1, 0.13, 0.12); },
    snap() { tone('square', 900, 120, 0.12, 0.2); noise(0.08, 0.3, 3000); },
    flash() { noise(0.05, 0.5, 6000); tone('square', 1800, 1800, 0.04, 0.12); },
    squeak() { tone('sine', 900, 1500, 0.1, 0.2); tone('sine', 1400, 800, 0.14, 0.2, 0.1); },
    wrench() { for (let i = 0; i < 3; i++) tone('square', 1100, 700, 0.03, 0.08, i * 0.07); },
    loot() { noise(0.2, 0.25, 2500); tone('triangle', 400, 800, 0.14, 0.2, 0.1); },
    mirage() { [880, 1046, 1318].forEach((f, i) => tone('sine', f, f, 0.3, 0.1, i * 0.1)); },
  };

  return { unlock, setEnabled, isEnabled: () => enabled, setEngine, setWind, sfx };
})();
