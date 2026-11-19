/* Lahore Coffee Club waitlist: the score. One continuous, dark piece in D minor (D E F A C), and every
   animation is a swell inside it, not a separate effect. Web Audio only, no files, no libraries.
   Chain: voices -> master gain -> gentle low-pass -> compressor -> out, and every voice also sends into
   one shared reverb (a generated 4.5 s dark stereo tail).
   Score: a breathing drone on low D and A, a sub an octave below, slow air, a quiet heartbeat whose tempo
   follows Sound.intensity (0..1; 60 to 90 bpm, the drone opens and lifts a little). Changes always glide.
   Off by default. The setting lives on window.LCC (S.sound), in memory only. No AudioContext exists until
   the visitor turns sound on; while it's off every call returns at once. With reduced motion the long
   sweeps (the map's riser, the final swell) are dropped; the rest stays. */
{
  const S = window.LCC;
  S.sound = false;
  const VOL = 0.3, REST = 0.1;
  /* D minor, nothing outside it */
  const N = { D1: 36.71, A1: 55, D2: 73.42, A2: 110, D3: 146.83, A3: 220, D4: 293.66, A4: 440, D5: 587.33, E5: 659.26, F5: 698.46,
    A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, F6: 1396.91, A6: 1760, C7: 2093 };
  const WALK = [N.D5, N.E5, N.F5, N.A5, N.C6, N.D6, N.E6, N.F6, N.A6, N.C7];   // the bricks walk up the scale
  const TAPS = [N.D5, N.E5, N.F5, N.A5, N.C6, N.D6];
  let ctx = null, master = null, verb = null, noise = null, score = null, riserV = null, sweepV = null, sleep = 0;
  const gaps = {}, marks = {};
  const I = { want: REST, boost: 0, gather: 0, cur: REST, tc: 1.2, last: 0 };   // intensity: asked, from moments, smoothed
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v) => Math.min(1, Math.max(0, v));

  /* the room: decaying stereo noise that darkens as it fades */
  function impulse(sec) {
    const r = ctx.sampleRate, len = Math.floor(r * sec), b = ctx.createBuffer(2, len, r);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / r;
        lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * (t / sec));
        d[i] = lp * Math.exp((-6.9 * t) / sec) * Math.min(1, t / 0.015);
      }
    }
    return b;
  }
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = VOL;
    const soft = ctx.createBiquadFilter(); soft.type = "lowpass"; soft.frequency.value = 7000;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
    master.connect(soft).connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(4.5);
    const ret = ctx.createGain(); ret.gain.value = 0.55; verb.connect(ret).connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  const live = () => (S.sound && ctx && ctx.state === "running" ? ctx : null);
  const gate = (name, ms) => { const t = performance.now(); if (t - (gaps[name] || -1e9) < ms) return false; gaps[name] = t; return true; };

  /* ---------- building blocks ---------- */
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const osc = (type, f, cents = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents; return o; };
  const hiss = () => { const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; return s; };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const panner = (v) => { if (!ctx.createStereoPanner) return gain(1); const p = ctx.createStereoPanner(); p.pan.value = v; return p; };
  /* a voice's output: dry into the master, wet into the shared reverb */
  const voice = (dry, wet) => {
    const g = gain(1);
    if (dry) g.connect(gain(dry)).connect(master);
    if (wet) g.connect(gain(wet)).connect(verb);
    return g;
  };
  /* attack then release, no steps: linear up, exponential-style glide down (setTargetAtTime) */
  const env = (p, t, peak, attack, decay) => { p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + attack); p.setTargetAtTime(0, t + attack, decay / 4); };
  const hold = (p, t) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); } };
  const halt = (srcs, at) => srcs.forEach((s) => { try { s.stop(at); } catch {} });
  const release = (v, sec) => { if (!v || !ctx) return; const t = ctx.currentTime; hold(v.g.gain, t); v.g.gain.linearRampToValueAtTime(0, t + sec); halt(v.src, t + sec + 0.05); };
  /* moments sit inside the score: the drone steps back a little while they play */
  const duck = (amt, dur) => {
    if (!score) return;
    const p = score.duck.gain, t = ctx.currentTime;
    hold(p, t); p.setTargetAtTime(1 - amt, t, 0.08); p.setTargetAtTime(1, t + dur, 0.7);
  };

  /* ---------- the score ---------- */
  function startScore() {
    clearTimeout(sleep);
    const t = ctx.currentTime;
    if (score) {                                         // turned back on while fading out: rise again
      clearTimeout(score.kill); score.kill = 0;
      hold(score.fade.gain, t); score.fade.gain.linearRampToValueAtTime(1, t + 4);
      return;
    }
    const fade = gain(0), duckG = gain(1), bus = gain(1);
    bus.connect(duckG).connect(fade);
    fade.connect(master); fade.connect(gain(0.2)).connect(verb);
    fade.gain.setValueAtTime(0, t); fade.gain.linearRampToValueAtTime(1, t + 4);
    /* drone: two detuned saws on D, a triangle on A, through a low-pass that breathes */
    const lp = filt("lowpass", 260, 0.9);
    lp.connect(bus);
    const s1 = osc("sawtooth", N.D2, -7), s2 = osc("sawtooth", N.D2, 6), tri = osc("triangle", N.A2, 3);
    s1.connect(gain(0.05)).connect(lp); s2.connect(gain(0.05)).connect(lp); tri.connect(gain(0.045)).connect(lp);
    const lfo = osc("sine", 0.05); lfo.connect(gain(90)).connect(lp.frequency);
    /* sub: felt more than heard */
    const sub = osc("sine", N.D1); sub.connect(gain(0.06)).connect(bus);
    /* air: faint filtered noise drifting left and right */
    const air = hiss(), pan = panner(0), drift = osc("sine", 0.03);
    air.connect(filt("bandpass", 2400, 0.6)).connect(gain(0.007)).connect(pan).connect(bus);
    if (pan.pan) drift.connect(gain(0.8)).connect(pan.pan);
    /* heartbeat */
    const pulse = gain(1); pulse.connect(bus);
    const src = [s1, s2, tri, lfo, sub, air, drift];
    src.forEach((s) => s.start(t));
    I.last = t;
    score = { fade, duck: duckG, bus, lp, pulse, src, next: t + 2, hush: 0, pend: [], kill: 0, timer: setInterval(beat, 50) };
  }
  function stopScore(sec = 2) {
    if (!score || score.kill) return;
    const s = score, t = ctx.currentTime;
    hold(s.fade.gain, t); s.fade.gain.linearRampToValueAtTime(0, t + sec);
    s.kill = setTimeout(() => {
      clearInterval(s.timer); halt(s.src, 0); s.pend.forEach((p) => halt([p.o], 0)); s.fade.disconnect();
      if (score === s) score = null;
    }, sec * 1000 + 150);
  }
  /* every 50 ms: glide intensity, steer the drone, keep the heartbeat scheduled a little ahead */
  function beat() {
    if (!score || !ctx) return;
    const t = ctx.currentTime, dt = Math.min(0.25, Math.max(0, t - I.last)); I.last = t;
    I.boost *= Math.exp(-dt / 10);                       // a moment's lift fades away by itself
    const target = Math.min(1, Math.max(I.want + I.boost, I.gather));
    I.cur += (target - I.cur) * (1 - Math.exp(-dt / I.tc));
    score.lp.frequency.setTargetAtTime(240 + 620 * I.cur, t, 0.4);
    score.bus.gain.setTargetAtTime(1 + 0.3 * I.cur, t, 0.5);
    if (score.hush) { if (t < score.hush) return; score.hush = 0; }
    if (score.next < t) score.next = t + 0.05;
    while (score.next < t + 0.2) {
      const len = 60 / (60 + 30 * I.cur);
      thump(score.next, 1); thump(score.next + len * 0.26, 0.55);   // lub-dub
      score.next += len;
    }
  }
  function thump(at, level) {
    const o = osc("sine", 72), g = gain();
    o.frequency.setValueAtTime(72, at); o.frequency.setTargetAtTime(N.A1, at, 0.03);
    o.connect(g).connect(score.pulse);
    env(g.gain, at, 0.11 * level, 0.008, 0.28);
    o.start(at); o.stop(at + 0.5);
    const p = { o, g, at };
    score.pend.push(p);
    o.onended = () => { if (score) score.pend = score.pend.filter((x) => x !== p); };
  }

  /* ---------- moments ---------- */
  const Sound = {
    /* Sound.intensity(0..1): the score's resting tension. Glides, never steps. */
    intensity(level) { I.want = clamp(level); },

    /* the passport turning or moving: a rising breath, a high shimmer on A5 and D6, a long tail */
    swish() {
      if (!live() || !gate("breath", 550)) return;
      const t = ctx.currentTime, out = voice(0.5, 0.9);
      const s = hiss(), bp = filt("bandpass", 500, 1.4), g = gain();
      bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(2200, t + 1.0);
      s.connect(bp).connect(g).connect(out);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.75); g.gain.setTargetAtTime(0, t + 0.75, 0.15);
      s.start(t, Math.random() * 1.5); s.stop(t + 1.6);
      const src = [s];
      [N.A5, N.D6].forEach((f, i) => {
        const o = osc("sine", f), vib = osc("sine", 4.2 + i * 0.7), sg = gain(), pan = panner(i ? 0.35 : -0.35);
        vib.connect(gain(f * 0.004)).connect(o.frequency);
        o.connect(sg).connect(pan).connect(out);
        sg.gain.setValueAtTime(0, t + 0.15); sg.gain.linearRampToValueAtTime(0.03, t + 0.75); sg.gain.setTargetAtTime(0, t + 0.8, 0.22);
        o.start(t + 0.15); vib.start(t + 0.15); o.stop(t + 2); vib.stop(t + 2); src.push(o, vib);
      });
      duck(0.25, 1.2);
      I.boost = Math.min(0.4, I.boost + 0.08);
    },

    /* the globe turning to Lahore: a slow riser, pitch and filter climbing with the turn (it follows the scroll).
       Call every frame with k (0..1, how far it has turned) and whether it's turning now. */
    riser(k, on) {
      if (!ctx || S.reduced) return;
      const t = ctx.currentTime;
      if (!live() || !on || k >= 0.97) {
        if (riserV) { release(riserV, 0.6); riserV = null; if (score) { hold(score.duck.gain, t); score.duck.gain.setTargetAtTime(1, t, 0.5); } }
        return;
      }
      let w = riserV;
      if (!w) {
        if (k <= 0.01) return;
        const g = gain(), lp = filt("lowpass", 200, 2.2), a = osc("sawtooth", N.D3, -5), b = osc("sawtooth", N.A3, 5), s = hiss(), nb = filt("bandpass", 400, 1.2);
        a.connect(lp); b.connect(gain(0.7)).connect(lp); s.connect(nb).connect(gain(0.6)).connect(lp);
        lp.connect(g).connect(voice(0.7, 0.6));
        a.start(t); b.start(t); s.start(t);
        w = riserV = { k, t, g, lp, nb, osc: [a, b], src: [a, b, s] };
      }
      const speed = Math.abs(k - w.k) / Math.max(0.016, t - w.t);
      w.k = k; w.t = t;
      const level = (0.25 + 0.75 * k) * (0.012 + Math.min(0.03, speed * 0.08));
      w.g.gain.setTargetAtTime(level, t, 0.25);
      w.osc.forEach((o) => o.detune.setTargetAtTime(1200 * k + (o === w.osc[0] ? -5 : 5), t, 0.15));   // up an octave over the turn
      w.lp.frequency.setTargetAtTime(200 + 2000 * k * k, t, 0.2);
      w.nb.frequency.setTargetAtTime(400 + 1600 * k, t, 0.2);
      if (score) score.duck.gain.setTargetAtTime(1 - 0.2 * k, t, 0.4);
    },

    /* the globe lands on the pin: a dark glassy FM bell on D6, a soft low hit under it */
    ping() {
      if (!live() || !gate("bell", 800)) return;
      const t = ctx.currentTime, out = voice(0.7, 0.85);
      const c = osc("sine", N.D6), m = osc("sine", N.D6 * 1.414), mg = gain(), g = gain();
      mg.gain.setValueAtTime(N.D6 * 2.2, t); mg.gain.setTargetAtTime(N.D6 * 0.08, t, 0.45);
      m.connect(mg).connect(c.frequency);
      c.connect(g).connect(out);
      env(g.gain, t, 0.06, 0.003, 2.5);
      const lo = osc("sine", N.D2), lg = gain(), n = hiss(), ng = gain();
      lo.connect(lg).connect(out); n.connect(filt("lowpass", 180)).connect(ng).connect(out);
      env(lg.gain, t, 0.16, 0.006, 0.8); env(ng.gain, t, 0.07, 0.003, 0.25);
      [c, m, lo].forEach((o) => { o.start(t); o.stop(t + 3.2); }); n.start(t); n.stop(t + 0.5);
      duck(0.3, 1.8);
    },

    /* the cups gathering into the ring: the heartbeat quickens with it (k 0..1, while it's on screen) */
    gather(k, on) { I.gather = on ? 0.35 + 0.55 * clamp(k) : 0; },

    /* each brick lighting: a very quiet high pluck, walking up the scale */
    tick(i = 0) {
      if (!live() || !gate("pluck", 40)) return;
      const t = ctx.currentTime, f = WALK[i % WALK.length], out = voice(0.5, 0.7);
      const a = osc("sine", f), b = osc("triangle", f * 2), g = gain(), bg = gain(0.15);
      a.connect(g); b.connect(bg).connect(g); g.connect(out);
      env(g.gain, t, 0.03, 0.002, 0.5);
      [a, b].forEach((o) => { o.start(t); o.stop(t + 0.8); });
    },

    /* a digit typed: a tiny muted glassy tap, a random note of the scale (an octave lower when deleting) */
    key(back = false) {
      if (!live() || !gate("tap", 30)) return;
      const t = ctx.currentTime, f = TAPS[Math.floor(Math.random() * TAPS.length)] / (back ? 2 : 1), out = voice(0.55, 0.4);
      const a = osc("sine", f), b = osc("sine", f * 2), g = gain(), bg = gain(0.25);
      a.connect(g); b.connect(bg).connect(g); g.connect(out);
      env(g.gain, t, 0.018, 0.002, 0.09);
      [a, b].forEach((o) => { o.start(t); o.stop(t + 0.2); });
    },

    /* just before the last brick lands: the heartbeat holds its breath */
    hush() {
      if (!score) return;
      const t = ctx.currentTime;
      score.hush = t + 2;                                 // brick() lifts it; this is only a safety net
      score.pend.forEach((p) => { if (p.at > t) { hold(p.g.gain, t); p.g.gain.setTargetAtTime(0, t, 0.01); halt([p.o], t + 0.06); } });
    },

    /* the last brick set: the climax. A sub drop, a soft impact, a wide D minor bloom with a long tail */
    brick() {
      if (!live() || !gate("hit", 1500)) return;
      const t = ctx.currentTime, beatLen = 60 / (60 + 30 * I.cur);
      if (score) { score.hush = t + beatLen; score.next = t + beatLen; }   // the pulse comes back a beat after
      I.want = 1; I.tc = 0.6;
      duck(0.5, 2.5);
      const low = voice(1, 0.25);
      const sub = osc("sine", N.A1), sg = gain();
      sub.frequency.setValueAtTime(N.A1, t); sub.frequency.setTargetAtTime(N.D1, t, 0.3);
      sub.connect(sg).connect(low); env(sg.gain, t, 0.15, 0.01, 1.8); sub.start(t); sub.stop(t + 2.5);
      const n = hiss(), ng = gain(), n2 = hiss(), ng2 = gain(), mid = voice(0.9, 0.5);
      n.connect(filt("lowpass", 380)).connect(ng).connect(mid); env(ng.gain, t, 0.1, 0.003, 0.4);
      n2.connect(filt("bandpass", 1500, 1.2)).connect(ng2).connect(mid); env(ng2.gain, t, 0.035, 0.002, 0.12);
      n.start(t); n.stop(t + 0.7); n2.start(t, 0.5); n2.stop(t + 0.3);
      const wide = voice(0.55, 0.95);
      [[N.D5, -0.7], [N.F5, -0.25], [N.A5, 0.25], [N.D6, 0.7]].forEach(([f, p]) => {
        const g = gain(), pan = panner(p);
        g.connect(pan).connect(wide);
        g.gain.setValueAtTime(0, t + 0.05); g.gain.linearRampToValueAtTime(0.016, t + 0.6); g.gain.setTargetAtTime(0, t + 1.6, 1.4);
        [-6, 6].forEach((c) => { const o = osc("sine", f, c); o.connect(g); o.start(t + 0.05); o.stop(t + 9); });
      });
      setTimeout(() => { I.tc = 1.2; }, 1500);
    },

    /* the ring turning after joining: the score resolves. An upward swell into a held D and A chord,
       the heartbeat slows back to 60, intensity settles to rest over about 4 s. */
    sweep(dur = 2.6) {
      Sound.stopSweep();
      if (!live()) return;
      const t = ctx.currentTime, out = voice(0.8, 0.75), bus = gain(1), src = [];
      bus.connect(out);
      I.want = REST; I.boost = 0; I.tc = 1.3;
      setTimeout(() => { I.tc = 1.2; }, 6000);
      if (!S.reduced) {
        const lp = filt("lowpass", 180, 1.2), g = gain(), a = osc("sawtooth", N.D3, -6), b = osc("sawtooth", N.A3, 6), s = hiss();
        a.connect(lp); b.connect(gain(0.6)).connect(lp); s.connect(filt("bandpass", 900, 0.8)).connect(gain(0.4)).connect(lp);
        lp.frequency.setValueAtTime(180, t); lp.frequency.linearRampToValueAtTime(1600, t + dur);
        lp.connect(g).connect(bus);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + dur); g.gain.setTargetAtTime(0, t + dur, 0.5);
        a.start(t); b.start(t); s.start(t); halt([a, b, s], t + dur + 3); src.push(a, b, s);
      }
      const c = t + (S.reduced ? 0.1 : dur * 0.85);
      [[N.D3, -0.4], [N.A3, 0.4], [N.D4, -0.2], [N.A4, 0.2]].forEach(([f, p], i) => {
        const o = osc("triangle", f, i % 2 ? 4 : -4), g = gain(), pan = panner(p);
        o.connect(g).connect(pan).connect(bus);
        g.gain.setValueAtTime(0, c); g.gain.linearRampToValueAtTime(i < 2 ? 0.03 : 0.018, c + 1.2); g.gain.setTargetAtTime(0, c + 5, 1.2);
        o.start(c); o.stop(c + 11); src.push(o);
      });
      duck(0.3, dur + 3);
      sweepV = { g: bus, src };
    },
    stopSweep() { release(sweepV, 0.8); sweepV = null; },
    /* stop anything long that's still playing */
    stop() { Sound.stopSweep(); release(riserV, 0.3); riserV = null; },
    /* triggers: true when a condition changes (flip) or turns true (edge). The first reading only records,
       so arriving mid-page or turning sound on never sets off a burst. Tracked even while sound is off. */
    flip(key, on) { const was = marks[key]; marks[key] = on; return was !== undefined && was !== on; },
    edge(key, on) { const was = marks[key]; marks[key] = on; return was === false && on; },
  };
  window.Sound = Sound;

  /* the toggle: its first click is the gesture browsers ask for before any sound */
  const btn = document.getElementById("snd");
  const paint = () => { btn.textContent = S.sound ? "Sound on" : "Sound off"; btn.setAttribute("aria-pressed", String(S.sound)); };
  const wake = () => { clearTimeout(sleep); ctx.resume().then(startScore).catch(() => {}); };
  const rest = (sec) => {                                 // fade the score, then let the context sleep
    Sound.stop(); stopScore(sec);
    clearTimeout(sleep);
    sleep = setTimeout(() => { if (ctx && ctx.state === "running" && !(S.sound && !document.hidden)) ctx.suspend().catch(() => {}); }, sec * 1000 + 300);
  };
  btn?.addEventListener("click", () => {
    S.sound = !S.sound;
    paint();
    if (!S.sound) { rest(2); return; }
    if (!init()) return;
    const u = ctx.createBufferSource(); u.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); u.connect(ctx.destination); u.start();  // unlocks iOS
    wake();
  });
  btn && paint();

  /* leaving the page or the tab: fade out; coming back: fade in (or on the next tap, where browsers insist) */
  addEventListener("pagehide", () => { if (ctx) rest(0.3); });
  document.addEventListener("visibilitychange", () => { if (!ctx) return; if (document.hidden) rest(2); else if (S.sound) wake(); });
  addEventListener("pointerdown", () => { if (S.sound && ctx && ctx.state !== "running") wake(); }, { passive: true });
}
