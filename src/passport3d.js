/* =====================================================================
   Lahore Coffee Club — passport3d.js
   The Club tab's passport as the real object: the same three.js passport
   as the waitlist (waitlist/js/passport.js), its pages drawn from the
   member's club data. build.sh carries three.js and the passport module
   as inert text (<script type="text/plain" id="mod-…">); they become
   modules (blob URLs) only the first time the Club tab shows.
   The DOM book stays underneath: it's the accessible text, and what
   shows when WebGL or the modules aren't there.

   LCC.passport3d.place(slot, content, book, onReady): put the canvas in
   the slot and match the book's state (open, page); builds on first use.
   open(), close(), turn(to): animate, resolve when done. ready(): built.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const reduced = () => LCC.ui.reducedMotion();
  const PI = Math.PI;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const mix = (a, b, t) => a + (b - a) * t;
  /* canvas overhang around the book box (fractions of its size): room for the tilt, the open cover and the shadow */
  const OVER = { top: 0.06, bottom: 0.26, side: 0.14 };   // keep in step with .pbook__glslot in club.css

  let mods = null, failed = false, G = null, want = null, building = null;

  const glOK = () => {
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (_) { return false; }
  };
  function load() {
    if (mods) return mods;
    const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent : ""; };
    const three = txt("mod-three"), room = txt("mod-room"), pass = txt("mod-passport");
    if (!three || !room || !pass) return (mods = Promise.reject(new Error("passport modules missing")));
    const url = (s) => URL.createObjectURL(new Blob([s], { type: "text/javascript" }));
    const tu = url(three);
    mods = Promise.all([import(tu), import(url(room.replace(/from\s*['"][^'"]*three[^'"]*['"]/, `from "${tu}"`))), import(url(pass))])
      .then(([THREE, R, P]) => ({ THREE, RoomEnvironment: R.RoomEnvironment, createPassport: P.createPassport, createContactShadow: P.createContactShadow }));
    return mods;
  }
  const svgOf = (name) => { const t = document.getElementById(`logo-${name}`); return t ? t.innerHTML.trim() : ""; };

  /* ---------- the one renderer ---------- */
  async function ensure() {
    const M = await load();
    const { THREE } = M;
    if (!G) {
      const canvas = document.createElement("canvas");
      canvas.className = "pbook__gl";
      canvas.setAttribute("aria-hidden", "true");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new M.RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.55;
      const key = new THREE.DirectionalLight(0xfff3e2, 2.4); key.position.set(-4, 6, 7); scene.add(key);
      const rim = new THREE.DirectionalLight(0xffeedd, 1.1); rim.position.set(3.5, 2.5, -6); scene.add(rim);
      const GROUND = -1.25 - 0.16;
      const shadow = M.createContactShadow(THREE, GROUND); scene.add(shadow.group);
      const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
      G = { M, canvas, renderer, scene, camera, shadow, pass: null, key: "", open: 0, angles: [], tilt: -0.22, tiltT: -0.22,
        tweens: new Set(), raf: 0, w: 0, h: 0, pts: [], lost: 0 };
      new ResizeObserver(() => kick()).observe(canvas);
      canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); destroy(); });
    }
    return G;
  }
  async function buildFor(content) {
    const g = await ensure();
    const key = JSON.stringify(content);
    if (g.key === key && g.pass) return g;
    const p = await g.M.createPassport(g.M.THREE, { renderer: g.renderer, ringSvg: svgOf("ring"), wordmarkSvg: svgOf("wordmark"), size: 1024, pageScale: 0.75, content });
    if (G !== g) { p.dispose(); return null; }                 // torn down while building
    if (g.pass) { g.scene.remove(g.pass.group); g.pass.dispose(); }
    g.pass = p; g.key = key; g.scene.add(p.group);
    p.group.rotation.order = "YXZ";
    try { await g.renderer.compileAsync(g.scene, g.camera); } catch (_) { g.renderer.compile(g.scene, g.camera); }
    p.textures.forEach((t) => g.renderer.initTexture(t));      // upload now, so the first frame (and the first open) doesn't stall
    return g;
  }
  function destroy() {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    if (G.pass) G.pass.dispose();
    try { G.renderer.dispose(); G.renderer.forceContextLoss(); } catch (_) {}
    G.canvas.remove();
    G = null;
  }
  /* off screen for a while (another tab): give the GPU back. The leather stays cached, so coming back is quick. */
  setInterval(() => {
    if (!G) return;
    if (G.canvas.isConnected) { G.lost = 0; return; }
    if ((G.lost += 2) >= 20) destroy();
  }, 2000);

  /* ---------- drawing ---------- */
  function frame() {
    if (!G) return;
    G.raf = 0;
    const g = G, c = g.canvas;
    if (!c.isConnected || !g.pass) return;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (w !== g.w || h !== g.h) { g.w = w; g.h = h; g.renderer.setSize(w, h, false); g.camera.aspect = w / h; }
    const now = performance.now();
    for (const t of g.tweens) t.step(now);
    g.tilt += (g.tiltT - g.tilt) * 0.12;
    const P = g.pass, open = g.open;
    P.pose(open, 0, P.leaves.map((_, i) => g.angles[i] || 0));
    /* the camera sits a little above, so the shadow shows; the book's box fills the canvas minus the overhang */
    const tanH = Math.tan((g.camera.fov / 2) * PI / 180);
    const boxH = 2.5 * 1.03, viewH = boxH * (1 + OVER.top + OVER.bottom);
    const d = viewH / 2 / tanH, camY = 0.55;
    g.camera.position.set(0, camY, d);
    g.camera.lookAt(0, 0, 0);
    g.camera.setViewOffset(w, h, 0, ((OVER.bottom - OVER.top) / 2 / (1 + OVER.top + OVER.bottom)) * h, w, h);
    g.camera.updateProjectionMatrix();
    P.group.rotation.set(-Math.atan(camY / d), mix(g.tilt, 0, open), 0);   // upright to the eye (the camera sits a little above); open, the page faces you
    g.shadow.update(P.corners(g.pts), 1);
    g.renderer.render(g.scene, g.camera);
    if (g.tweens.size || Math.abs(g.tiltT - g.tilt) > 0.001) kick();
  }
  function kick() { if (G && !G.raf) G.raf = requestAnimationFrame(frame); }
  function tween(ms, fn) {
    return new Promise((done) => {
      if (!G || reduced() || ms <= 0) { fn(1); kick(); done(); return; }
      const g = G, t0 = performance.now();
      const finish = () => { if (!g.tweens.has(t)) return; g.tweens.delete(t); fn(1); done(); };
      const t = { step(now) { const k = Math.min(1, (now - t0) / ms); fn(ease(k)); if (k >= 1) finish(); } };
      g.tweens.add(t); kick();
      setTimeout(() => { finish(); kick(); }, ms + 250);         // frames can stall (a busy GPU, a throttled tab): never leave the book stuck
    });
  }
  const snap = (bk) => {
    if (!G || !G.pass || G.tweens.size) return;
    G.open = bk.open ? 1 : 0;
    G.angles = G.pass.leaves.map((_, i) => (bk.open && i < bk.page ? PI : 0));
  };

  /* desktop: the passport leans a little toward the pointer, so the foil catches the light */
  function follow(slot) {
    const host = slot.closest(".pbook");
    if (!host || host.dataset.follow) return;
    host.dataset.follow = "1";
    host.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || !G || reduced()) return;
      const r = host.getBoundingClientRect();
      G.tiltT = -0.22 + ((e.clientX - r.left) / r.width - 0.5) * 0.5; kick();
    });
    host.addEventListener("pointerleave", () => { if (G) { G.tiltT = -0.22; kick(); } });
  }

  LCC.passport3d = {
    available: () => !failed && glOK() && !!document.getElementById("mod-three"),
    ready: () => !!(G && G.pass && !failed),
    place(slot, content, bk, onReady) {
      if (!slot || !LCC.passport3d.available()) return;
      want = { slot, content, bk, onReady };
      if (building) return;                                     // the build in flight picks up the newest request
      building = (async () => {
        try {
          while (want) {
            const w = want; want = null;
            const g = await buildFor(w.content);
            if (!g || !w.slot.isConnected) continue;
            if (g.canvas.parentNode !== w.slot) w.slot.appendChild(g.canvas);
            snap(w.bk); follow(w.slot); kick();
            if (w.onReady) w.onReady();
          }
        } catch (e) {
          failed = true; destroy();                             // the DOM book carries on
          if (window.console) console.warn("passport3d:", e);
        } finally { building = null; }
      })();
    },
    open(page = 0) {
      if (G && G.pass) G.angles = G.pass.leaves.map((_, i) => (i < page ? PI : 0));   // under the cover, ready at the right page
      return tween(900, (k) => { G && (G.open = k); });
    },
    close: () => {
      if (!G) return Promise.resolve();
      const from = G.angles.slice();
      return tween(800, (k) => { G.open = 1 - k; G.angles = from.map((a) => a * (1 - Math.min(1, k * 1.6))); });
    },
    turn(from, to) {
      if (!G) return Promise.resolve();
      const i = Math.min(from, to), fwd = to > from;
      return tween(700, (k) => { G.angles[i] = fwd ? PI * k : PI * (1 - k); });
    },
  };
})();
