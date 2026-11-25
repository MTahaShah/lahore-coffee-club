/* The Round prototype: the passport as a real object (three.js r170).
   A rebranded copy of waitlist/js/passport.js (the live waitlist site keeps
   its own, unchanged); the two are now separate files. Changes here: the
   name, the Gold / Paper palette, Montserrat and Versailles, and the new
   wordmark's and ring's proportions.
   Same size, pages, stamps and moving parts as the passport in scene.js, so it can replace it without
   changing the story or the timing; only the making is new:
   - covers are rounded, bevelled boxes in black leather (MeshPhysicalMaterial, roughness ~0.7, clearcoat 0.15)
   - leather grain, blind deboss and foil areas are generated once into canvas maps (colour, normal,
     roughness/metalness), from the master logo SVGs; no image files
   - foil is gold metal (metalness 1, roughness ~0.25), so it reflects the room environment as the
     passport turns: the sheen comes from the light, not from a loop
   - the page block is real geometry: a stack of slightly uneven rounded sheets
   - pages are Paper with a faint guilloche, stamps are inked in Gold deep, a little uneven
   createContactShadow() is the one soft ground shadow (baked, two layers), driven by the passport's corners. */

const TAU = Math.PI * 2, D2R = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
/* Montserrat for everything (no Bold: 600 is the heaviest); Versailles, capitals only, for the cover's display line */
const FONT = (w, s) => `${Math.min(600, w)} ${s}px "Montserrat",system-ui,sans-serif`;
const DISPLAY = (s) => `400 ${s}px "Versailles",Georgia,serif`;
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d", { willReadFrequently: true })]; };
/* a small seeded PRNG, so the leather and the paper are the same on every load */
const prng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function tracked(x, text, px, y, track, align = "left") {
  const ch = [...text], w = ch.map((c) => x.measureText(c).width);
  const total = w.reduce((a, b) => a + b, 0) + track * (ch.length - 1);
  let cx = align === "center" ? px - total / 2 : align === "right" ? px - total : px;
  x.textAlign = "left";
  ch.forEach((c, i) => { x.fillText(c, cx, y); cx += w[i] + track; });
  return total;
}
function fitTracked(x, text, px, y, width) {
  const ch = [...text], w = ch.map((c) => x.measureText(c).width);
  tracked(x, text, px, y, (width - w.reduce((a, b) => a + b, 0)) / (ch.length - 1));
}
const svgImg = (s, w, h) => new Promise((res) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null);
  i.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.replace(/<svg /, `<svg width="${w}" height="${h}" `));
});
/* recolour a master SVG: every logo variable (and currentColor) becomes the given colours */
const tint = (svg, face, side = face, top = face, ink = face) => svg
  .replace(/var\(--logo-face[^)]*\)/g, face).replace(/var\(--logo-side[^)]*\)/g, side).replace(/var\(--logo-top[^)]*\)/g, top)
  .replace(/var\(--logo-ink[^)]*\)/g, ink).replace(/currentColor/g, ink);

/* ---------- procedural fields ---------- */
/* tileable cellular noise: pebbles with creases between them (leather grain) */
function pebbles(n, cell, rnd) {
  const g = Math.max(2, Math.round(n / cell)), cs = n / g, pts = new Float32Array(g * g * 2), out = new Float32Array(n * n);
  for (let i = 0; i < g * g; i++) { pts[i * 2] = ((i % g) + 0.15 + rnd() * 0.7) * cs; pts[i * 2 + 1] = (Math.floor(i / g) + 0.15 + rnd() * 0.7) * cs; }
  for (let y = 0; y < n; y++) {
    const gy = Math.floor(y / cs);
    for (let x = 0; x < n; x++) {
      const gx = Math.floor(x / cs);
      let f1 = 1e9, f2 = 1e9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = gx + dx, cy = gy + dy, wx = ((cx % g) + g) % g, wy = ((cy % g) + g) % g, k = (wy * g + wx) * 2;
        const px = pts[k] + (cx - wx) * cs - x, py = pts[k + 1] + (cy - wy) * cs - y, d = px * px + py * py;
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const e = Math.min(1, (Math.sqrt(f2) - Math.sqrt(f1)) / (0.42 * cs));
      out[y * n + x] = e * (2 - e);
    }
  }
  return out;
}
/* smooth value noise over the whole face (slow undulation, so the leather is never flat) */
function valueNoise(w, h, cells, rnd) {
  const gw = cells + 2, gh = Math.ceil((cells * h) / w) + 2, grid = new Float32Array(gw * gh).map(() => rnd()), out = new Float32Array(w * h);
  const sx = cells / w;
  for (let y = 0; y < h; y++) {
    const fy = y * sx, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x * sx, ix = Math.floor(fx), tx = fx - ix, s = tx * tx * (3 - 2 * tx);
      const a = grid[iy * gw + ix], b = grid[iy * gw + ix + 1], c = grid[(iy + 1) * gw + ix], d = grid[(iy + 1) * gw + ix + 1];
      out[y * w + x] = mix(mix(a, b, s), mix(c, d, s), sy);
    }
  }
  return out;
}
/* box blur, run twice by callers for a soft (near gaussian) edge */
function blur(a, w, h, r) {
  if (r < 1) return a;
  const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0; const row = y * w;
    for (let x = -r; x <= r; x++) s += a[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { t[row + x] = s / n; s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { o[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
  }
  return o;
}
/* extruded shapes come out flat-shaded: share normals between faces that meet at less than maxDeg,
   so bevels and rounded corners read as soft while the board stays crisp where it should */
function smoothNormals(g, maxDeg = 50) {
  const pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count, lim = Math.cos(maxDeg * D2R), f = Float32Array.from(nrm.array), map = new Map();
  for (let i = 0; i < n; i++) {
    const key = Math.round(pos.getX(i) * 1e4) + "," + Math.round(pos.getY(i) * 1e4) + "," + Math.round(pos.getZ(i) * 1e4);
    let a = map.get(key); if (!a) map.set(key, (a = [])); a.push(i);
  }
  for (const a of map.values()) for (const i of a) {
    let x = 0, y = 0, z = 0;
    for (const j of a) if (f[i * 3] * f[j * 3] + f[i * 3 + 1] * f[j * 3 + 1] + f[i * 3 + 2] * f[j * 3 + 2] >= lim) { x += f[j * 3]; y += f[j * 3 + 1]; z += f[j * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1; nrm.setXYZ(i, x / l, y / l, z / l);
  }
  nrm.needsUpdate = true;
}
const alphaOf = (c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, a = new Float32Array(c.width * c.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255; return a; };

/* ---------- the guilloche: fine looping lines, drawn once, laid on every page ---------- */
function guilloche(w, h) {
  const [c, x] = mk(w, h), k = w / 1024;
  x.strokeStyle = "rgba(128,123,116,.09)"; x.lineWidth = 1.1 * k;
  const rose = (cx, cy, R, r, d, turns, steps) => {
    x.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * TAU * turns;
      const px = cx + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t), py = cy + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.stroke();
  };
  rose(w / 2, h * 0.52, 300 * k, 37 * k, 120 * k, 37, 5200);
  rose(w / 2, h * 0.52, 210 * k, 23 * k, 70 * k, 23, 3600);
  /* wave bands along the top and bottom */
  for (const y0 of [h * 0.11, h * 0.93]) for (let j = 0; j < 7; j++) {
    x.beginPath();
    for (let px = 0; px <= w; px += 3 * k) { const py = y0 + Math.sin(px / (26 * k) + j * 0.9) * 9 * k + j * 4.5 * k; px ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
  }
  return c;
}

/* the leather is the slow part (about a second): made once per texture size, reused by every passport after */
const LEATHER = new Map();
/* colours: coffee by default; the member app passes MATCHA in Matcha mode (the member card's tokens) */
export const COFFEE = { ring: ["#C2A878", "#9E865B", "#DCC8A0"], word: "#C8AF80", deboss: [214, 206, 190], ink: "#775C38", leather: [1, 0.99, 0.975] };
export const MATCHA = { ring: ["#A6C46A", "#7E9A48", "#C4DB92"], word: "#B2CB7A", deboss: [207, 214, 192], ink: "#3F5A22", leather: [0.94, 1, 0.95] };

/* ---------- the passport ----------
   content (optional; the waitlist's passport when left out):
     { inside: page, leaves: [{ front: page, back: page }, …], top: page, ink: { slot, stamp } }
   a page is one of
     { kind: "id", n, gutter, fields: [[label, value], …], number: "0042" | null, initials, mrz: [line, line], full }
     { kind: "stamps", n, gutter, label, items: [null | { name, top, bottom, shape, tilt } | { empty: true, name, note }] × 4 }
     { kind: "card", n, gutter }   { kind: "blank", n, gutter, label }   { kind: "endpaper" }
   ink: the stamp that inks itself into leaf 0's front (pose's ink argument), at items[slot]. */
export async function createPassport(THREE, { renderer, ringSvg, wordmarkSvg, size = 1024, pageScale = 0.75, content = null, palette = null }) {
  const PAL = { ...COFFEE, ...(palette || {}) };
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures = [];
  const tex = (c, srgb = true) => {
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, maxAniso); textures.push(t); return t;
  };
  await Promise.race([Promise.all([document.fonts.load(FONT(400, 40)), document.fonts.load(FONT(600, 40)), document.fonts.load(DISPLAY(40))]), new Promise((r) => setTimeout(r, 1500))]);

  const TW = size, TH = Math.round((size * 125) / 88), k = TW / 1024;
  const ringH = (w) => w, wordH = (w) => (w * 1200) / 3247;   // ring.svg is square; wordmark.svg is 3247 × 1200
  const [ringFoil, ringWhite, wordFoil, wordWhite, ringFaint] = await Promise.all([
    svgImg(tint(ringSvg, ...PAL.ring), 760, 760),
    svgImg(tint(ringSvg, "#fff"), 760, 760),
    svgImg(tint(wordmarkSvg, PAL.word, ...PAL.ring.slice(1)), 1300, 480),
    svgImg(tint(wordmarkSvg, "#fff"), 1300, 480),
    svgImg(tint(ringSvg, "#E2DDD3", "#D6D1C7", "#E9E5DD"), 760, 760),
  ]);

  /* leather, once per face: colour, normal and roughness/metalness from one height field */
  let grainA, grainB;
  function leather(drawFoil, drawDeboss, seed) {
    if (!grainA) { const rnd = prng(42); grainA = pebbles(256, 8.5 * k < 3 ? 3 : 8.5 * k, rnd); grainB = pebbles(192, Math.max(2.5, 5 * k), rnd); }
    const r2 = prng(seed);
    const [fc, fx] = mk(TW, TH), [wc, wx] = mk(TW, TH), [dc, dx] = mk(TW, TH), [tc, tx] = mk(TW, TH);
    drawFoil(fx, wx); drawDeboss(dx, tx);                     // tx: the parts of the deboss that are inked beige (the words, the brick)
    const tintA = alphaOf(tc);
    const foilA = alphaOf(wc), deb = blur(blur(alphaOf(dc), TW, TH, Math.max(1, Math.round(1.6 * k))), TW, TH, Math.max(1, Math.round(1.6 * k)));
    const foilB = blur(foilA, TW, TH, Math.max(1, Math.round(1.2 * k)));
    const slow = valueNoise(TW, TH, 9, r2), fine = valueNoise(TW, TH, 60, r2);
    const fcol = fx.getImageData(0, 0, TW, TH).data;
    const N = TW * TH, hgt = new Float32Array(N), grain = new Float32Array(N);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const i = y * TW + x;
      const g = 0.62 * grainA[(y & 255) * 256 + (x & 255)] + 0.38 * grainB[(y % 192) * 192 + (x % 192)];
      grain[i] = g;
      const flat = Math.max(deb[i], foilB[i]);
      hgt[i] = (g + 0.5 * (fine[i] - 0.5)) * (1 - 0.8 * flat) - 2.4 * deb[i] - 1.1 * foilB[i];
    }
    const [cc, cx] = mk(TW, TH), [nc, nx] = mk(TW, TH), [oc, ox] = mk(TW, TH);
    const cd = cx.createImageData(TW, TH), nd = nx.createImageData(TW, TH), od = ox.createImageData(TW, TH);
    const S = 0.55, rim = 0.022 * TW, topW = 0.012 * TH;
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const i = y * TW + x, p = i * 4;
      const hl = hgt[y * TW + Math.max(0, x - 1)], hr = hgt[y * TW + Math.min(TW - 1, x + 1)];
      const hu = hgt[Math.max(0, y - 1) * TW + x], hd = hgt[Math.min(TH - 1, y + 1) * TW + x];
      let ax = -(hr - hl) * S, ay = (hd - hu) * S; const l = 1 / Math.hypot(ax, ay, 1);
      nd.data[p] = (ax * l * 0.5 + 0.5) * 255; nd.data[p + 1] = (ay * l * 0.5 + 0.5) * 255; nd.data[p + 2] = (l * 0.5 + 0.5) * 255; nd.data[p + 3] = 255;
      /* colour: black, never flat. Valleys a touch darker, a slow mottle, the rim darker, the top edge worn lighter */
      const d = Math.min(x, TW - 1 - x, y, TH - 1 - y), edge = 1 - smooth(0, rim, d), top = 1 - smooth(0, topW, y);
      const f = foilA[i], g = grain[i];
      let v = 11 + (g - 0.55) * 5 + (slow[i] - 0.5) * 5 - deb[i] * 2.5;
      v = v * (1 - 0.35 * edge) + top * 9;
      const ta = tintA[i] * 0.94, vr = mix(v * LT[0], BEIGE[0], ta), vg = mix(v * LT[1], BEIGE[1], ta), vb = mix(v * LT[2], BEIGE[2], ta);
      cd.data[p] = mix(vr, fcol[p], f); cd.data[p + 1] = mix(vg, fcol[p + 1], f); cd.data[p + 2] = mix(vb, fcol[p + 2], f); cd.data[p + 3] = 255;
      /* roughness (green) and metalness (blue): leather 0.72, pebble tops a little glossier, pressed areas smoother, foil 0.25 */
      const rough = mix(mix(mix(0.74 - (g - 0.5) * 0.12, 0.56, deb[i]) - top * 0.12, 0.62, tintA[i]), 0.24 + (fine[i] - 0.5) * 0.08, f);
      od.data[p] = 255; od.data[p + 1] = clamp(rough) * 255; od.data[p + 2] = f * 255; od.data[p + 3] = 255;
    }
    cx.putImageData(cd, 0, 0); nx.putImageData(nd, 0, 0); ox.putImageData(od, 0, 0);
    return { cc, nc, oc };
  }
  const BEIGE = PAL.deboss, LT = PAL.leather;                 // the pressed words: a light beige (coffee) or foam (matcha) that reads on the leather
  const both = (a, b, fn) => { fn(a); fn(b); };
  const border = (x, r1, r2) => { x.strokeStyle = "#fff"; x.lineWidth = 3.2 * k; x.beginPath(); x.roundRect(56 * k, 56 * k, TW - 112 * k, TH - 112 * k, [r1 * k, r2 * k, r2 * k, r1 * k]); x.stroke(); };
  const LKEY = [TW, PAL.ring, PAL.word, PAL.deboss, PAL.leather].join("|");
  const cached = LEATHER.get(LKEY) || {};
  const frontC = cached.front || leather((fx, wx) => {
    const ww = 500 * k, wh = wordH(ww), rw = 430 * k, rh = ringH(rw);
    [[fx, wordFoil, ringFoil], [wx, wordWhite, ringWhite]].forEach(([x, wi, ri]) => {
      if (wi) x.drawImage(wi, TW / 2 - ww / 2, TH * 0.2 - wh / 2, ww, wh);
      if (ri) x.drawImage(ri, TW / 2 - rw / 2, TH * 0.505 - rh / 2, rw, rh);
    });
  }, (dx, tx) => {
    border(dx, 12, 30);
    both(dx, tx, (x) => {
      x.fillStyle = "#fff";
      x.font = DISPLAY(42 * k); tracked(x, "MEMBERSHIP PASSPORT", TW / 2, TH * 0.765, 12 * k, "center");
      x.font = FONT(400, 30 * k); tracked(x, "LAHORE", TW / 2, TH * 0.815, 9 * k, "center");
      /* the brick, where a passport has its chip symbol */
      x.strokeStyle = "#fff"; x.lineWidth = 4 * k; x.beginPath(); x.roundRect(TW / 2 - 21 * k, TH * 0.885, 42 * k, 66 * k, 5 * k); x.stroke();
    });
  }, 7);
  const backC = cached.back || leather((fx, wx) => {
    const rw = 190 * k, rh = ringH(rw);
    if (ringFoil) fx.drawImage(ringFoil, TW / 2 - rw / 2, TH * 0.72 - rh / 2, rw, rh);
    if (ringWhite) wx.drawImage(ringWhite, TW / 2 - rw / 2, TH * 0.72 - rh / 2, rw, rh);
  }, (dx, tx) => {
    border(dx, 30, 12);
    both(dx, tx, (x) => { x.fillStyle = "#fff"; x.font = FONT(600, 26 * k); tracked(x, "ONE CITY. ONE PASS.", TW / 2, TH * 0.86, 9 * k, "center"); });
  }, 11);
  LEATHER.set(LKEY, { front: frontC, back: backC });
  const asMaps = (L) => ({ map: tex(L.cc), normalMap: tex(L.nc, false), orm: tex(L.oc, false) });
  const front = asMaps(frontC), backF = asMaps(backC);

  /* ---------- paper ---------- */
  const PK = pageScale, PWp = Math.round(TW * PK), PHp = Math.round(TH * PK);
  const GUI = guilloche(TW, TH), rp = prng(5);
  function paper(x, gutter) {
    x.save(); x.beginPath(); x.roundRect(0, 0, TW, TH, gutter === "left" ? [0, 34, 34, 0] : gutter === "right" ? [34, 0, 0, 34] : 34); x.clip();
    x.fillStyle = "#FAF8F4"; x.fillRect(0, 0, TW, TH);
    x.drawImage(GUI, 0, 0);
    x.fillStyle = "rgba(120,100,70,.035)";                     // paper fibres
    for (let i = 0; i < 1400; i++) x.fillRect(rp() * TW, rp() * TH, 1 + rp() * 7, 1);
    if (gutter) {
      const g = gutter === "left" ? x.createLinearGradient(0, 0, 110, 0) : x.createLinearGradient(TW, 0, TW - 110, 0);
      g.addColorStop(0, "rgba(60,40,20,.14)"); g.addColorStop(1, "rgba(60,40,20,0)");
      x.fillStyle = g; x.fillRect(0, 0, TW, TH);
    }
    x.restore();
  }
  const page = (gutter, s = PK) => { const [c, x] = mk(Math.round(TW * s), Math.round(TH * s)); x.scale(s, s); paper(x, gutter); return [c, x]; };
  const LBL = "#5F5E5C", INK = "#0B0B0B", PAD = 64 * k, CINNAMON = PAL.ink;   // stamp ink
  function head(x, label, n, gutter) {
    x.fillStyle = LBL; x.font = FONT(400, 32 * k);
    if (gutter === "left") { tracked(x, label, PAD + 20 * k, 112 * k, 10 * k); tracked(x, String(n), TW - PAD, 112 * k, 0, "right"); }
    else { tracked(x, String(n), PAD, 112 * k, 0); tracked(x, label, TW - PAD - 20 * k, 112 * k, 10 * k, "right"); }
  }
  /* keep a value inside its column: shrink the type until it fits */
  const fitFont = (x, text, w, size, min, weight = 400) => { let f = size; x.font = FONT(weight, f * k); while (x.measureText(text).width > w && f > min) { f -= 2; x.font = FONT(weight, f * k); } };
  function drawId(sp) {
    const [c, x] = page(sp.gutter || null, sp.full ? 1 : PK);
    head(x, "COFFEE PASSPORT", sp.n || 1, "left");
    x.fillStyle = "#F2EFE9"; x.strokeStyle = "#D6D1C7"; x.lineWidth = 3 * k;
    x.beginPath(); x.roundRect(PAD, 196 * k, 262 * k, 328 * k, 14 * k); x.fill(); x.stroke();
    if (sp.initials) { x.fillStyle = "#9E9B95"; x.font = FONT(400, 96 * k); x.textAlign = "center"; x.fillText(sp.initials, PAD + 131 * k, 395 * k); x.textAlign = "left"; }
    else if (ringFaint) { const w = 170 * k; x.drawImage(ringFaint, PAD + 131 * k - w / 2, 360 * k - ringH(w) / 2, w, ringH(w)); }
    const fx = PAD + 318 * k, colW = TW - PAD - fx;
    (sp.fields || []).forEach(([kk, v], i) => {
      const y = (236 + i * 148) * k;
      x.fillStyle = LBL; x.font = FONT(400, 30 * k); tracked(x, kk.toUpperCase(), fx, y, 9 * k);
      x.fillStyle = INK; fitFont(x, v, colW, 52, 30); x.fillText(v, fx, y + 64 * k);
    });
    x.fillStyle = LBL; x.font = FONT(400, 30 * k); tracked(x, "MEMBER NO.", PAD, 770 * k, 9 * k);
    x.fillStyle = INK; x.font = FONT(400, 100 * k); const lw = tracked(x, "NO.", PAD, 900 * k, 26 * k);
    if (sp.number) tracked(x, sp.number, PAD + lw + 56 * k, 900 * k, 26 * k);
    else for (let i = 0; i < 4; i++) x.fillRect(PAD + (300 + i * 120) * k, 896 * k, 88 * k, 5 * k);
    x.fillStyle = "#D6D1C7"; x.fillRect(PAD, 1076 * k, (TW - PAD * 2) * 0.7, 3 * k);
    x.fillStyle = LBL; x.font = FONT(400, 28 * k); tracked(x, "HOLDER'S SIGNATURE", PAD, 1130 * k, 8 * k);
    x.fillStyle = "#4A4947"; x.font = FONT(400, 44 * k);
    (sp.mrz || []).forEach((l, i) => fitTracked(x, l, PAD, (1300 + i * 72) * k, TW - PAD * 2));
    return c;
  }
  /* stamps: Gold deep ink (green in Matcha), a little uneven: pressure varies across the stamp, the edges break up */
  const SLOTS = [[286, 560], [738, 560], [286, 1110], [738, 1110]].map(([u, v]) => [u * k, v * k]);
  const rs = prng(9);
  function inkStamp(name, shape, tilt, top = "LAHORE", bottom = "THE ROUND") {
    const S = Math.round(440 * k), h = S / 2, q = k;
    const [c, x] = mk(S, S);
    x.translate(h, h); x.rotate(tilt * D2R);
    x.strokeStyle = x.fillStyle = CINNAMON;
    if (shape === "round") {
      x.lineWidth = 10 * q; x.beginPath(); x.arc(0, 0, 196 * q, 0, TAU); x.stroke();
      x.lineWidth = 3.5 * q; x.beginPath(); x.arc(0, 0, 176 * q, 0, TAU); x.stroke();
    } else {
      x.lineWidth = 10 * q; x.beginPath(); x.roundRect(-200 * q, -138 * q, 400 * q, 276 * q, 18 * q); x.stroke();
      x.lineWidth = 3.5 * q; x.beginPath(); x.roundRect(-182 * q, -120 * q, 364 * q, 240 * q, 10 * q); x.stroke();
    }
    x.font = FONT(600, 26 * q); tracked(x, top, 0, -70 * q, 9 * q, "center");
    let fs = 56; x.font = FONT(600, fs * q);
    while (x.measureText(name).width + name.length * 3 * q > 300 * q && fs > 30) { fs -= 2; x.font = FONT(600, fs * q); }
    tracked(x, name, 0, 18 * q, 3 * q, "center");
    x.fillRect(-90 * q, 44 * q, 180 * q, 3.5 * q);
    x.font = FONT(400, 24 * q); tracked(x, bottom, 0, 92 * q, 7 * q, "center");
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "destination-out";
    const px = rs() * S, py = rs() * S, g = x.createRadialGradient(px, py, 0, px, py, S * 0.75);
    g.addColorStop(0, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, S, S);                   // lighter where the stamp was pressed less
    x.fillStyle = "#000";
    for (let i = 0; i < 1600; i++) { x.globalAlpha = rs() * 0.75; x.fillRect(rs() * S, rs() * S, (1 + rs() * 3) * q, (1 + rs() * 3) * q); }
    return c;
  }
  function emptyStamp(x, u, v, name, note = "Not yet") {
    x.save(); x.strokeStyle = "#D6D1C7"; x.lineWidth = 5 * k; x.lineCap = "round"; x.setLineDash([2 * k, 13 * k]);
    x.beginPath(); x.arc(u, v, 182 * k, 0, TAU); x.stroke(); x.restore();
    x.fillStyle = "#9E9B95"; fitFont(x, name, 300 * k, 32, 20, 600); tracked(x, name, u, v - 4 * k, 5 * k, "center");
    x.font = FONT(400, 30 * k); tracked(x, note, u, v + 46 * k, 1 * k, "center");
  }
  function stampPage({ n, gutter = "left", label = "STAMPS", items = [] }) {
    const [c, x] = page(gutter);
    head(x, label, n, gutter);
    items.forEach((it, i) => {
      if (!it) return;
      const [u, v] = SLOTS[i];
      if (it.empty) emptyStamp(x, u, v, it.name, it.note);
      else { x.globalAlpha = 0.8 + rs() * 0.12; const st = inkStamp(it.name, it.shape || "round", it.tilt || 0, it.top, it.bottom); x.drawImage(st, u - st.width / 2, v - st.height / 2); x.globalAlpha = 1; }
    });
    return c;
  }
  const AREAS = ["DHA", "JOHAR TOWN", "LIBERTY", "CANTT", "GARDEN TOWN", "SHADMAN", "FAISAL TOWN", "ANARKALI", "FORTRESS", "TOWNSHIP",
    "IQBAL TOWN", "MALL ROAD", "WAPDA TOWN", "VALENCIA", "BAHRIA TOWN", "LAKE CITY", "PHASE 6", "RAVI ROAD", "SAMANABAD", "GULBERG III",
    "MODEL TOWN", "WALLED CITY", "UPPER MALL", "ALLAMA IQBAL", "THOKAR", "SABZAZAR", "EDEN", "PCSIR", "AIRPORT RD", "BURKI"];
  const TILTS = [-7, 5, -3, 8, -5, 3, -8, 6];
  let ai = 0;
  const fill4 = (n, empties = []) => [0, 1, 2, 3].map((i) => {
    const name = AREAS[ai++ % AREAS.length];
    return empties.includes(i) ? { empty: true, name } : { name, shape: (n + i) % 3 === 1 ? "rect" : "round", tilt: TILTS[(n + i) % 8] };
  });

  /* ---------- sizes (the same as scene.js) ---------- */
  const W = 1.76, H = 2.5, CT = 0.026, PT = 0.13, PW = 1.71, PH = 2.44;
  const PZ = PT / 2 - 0.03, HX = 0.018 - PW / 2, SEGS = 32;
  const CARD_W = 1.42, CARD_Y = 0.12, CARD_PX = (CARD_W / PW) * TW, CARD_U = TW / 2, CARD_V = TH * (0.5 - CARD_Y / PH);
  function cardPage({ n = 12, gutter = "left" } = {}) {
    const [c, x] = page(gutter);
    head(x, "MEMBER CARD", n, gutter);
    x.save(); x.strokeStyle = "#C9C4BA"; x.lineWidth = 4 * k; x.setLineDash([3 * k, 12 * k]); x.lineCap = "round";
    x.beginPath(); x.roundRect(CARD_U - CARD_PX / 2, CARD_V - (CARD_PX * 2) / 7, CARD_PX, (CARD_PX * 4) / 7, 40 * k); x.stroke(); x.restore();
    x.fillStyle = "#9E9B95"; x.font = FONT(400, 30 * k);
    tracked(x, "Issued in person", TW / 2, CARD_V + (CARD_PX * 2) / 7 + 80 * k, 2 * k, "center");
    x.fillStyle = "#4A4947"; x.font = FONT(400, 44 * k);
    fitTracked(x, "THE<ROUND<<FOUNDING<<MEMBER<<<<<<", PAD, 1372 * k, TW - PAD * 2);
    return c;
  }
  function blankPage({ n, gutter = "left", label = "" }) {
    const [c, x] = page(gutter);
    if (n != null) head(x, label, n, gutter);
    return c;
  }
  function endpaper() {
    const [c, x] = page(null, 1);
    if (ringFaint) { const w = 360 * k; x.globalAlpha = 0.5; x.drawImage(ringFaint, TW / 2 - w / 2, TH / 2 - ringH(w) / 2, w, ringH(w)); x.globalAlpha = 1; }
    return c;
  }
  const drawPage = (sp) => sp.kind === "id" ? drawId(sp) : sp.kind === "stamps" ? stampPage(sp) : sp.kind === "card" ? cardPage(sp) : sp.kind === "endpaper" ? endpaper() : blankPage(sp);
  /* the same page twice (blank backs) is drawn and uploaded once */
  const pageTex = new Map();
  const texOf = (sp) => { const key = JSON.stringify(sp); if (!pageTex.has(key)) pageTex.set(key, tex(drawPage(sp))); return pageTex.get(key); };

  /* the waitlist's passport: page 1 inside the cover, ten stamp pages, the member card page on top */
  const C = content || (() => {
    const leaves = [];
    for (let i = 0; i < 5; i++) {
      const fr = i === 0
        ? { kind: "stamps", n: 2, gutter: "left", items: [null, { empty: true, name: "GULBERG" }, { empty: true, name: "MODEL TOWN" }, { empty: true, name: "WALLED CITY" }] }
        : { kind: "stamps", n: 2 + 2 * i, gutter: "left", items: fill4(2 + 2 * i, i === 1 ? [2] : i === 3 ? [1] : []) };
      leaves.push({ front: fr, back: { kind: "stamps", n: 3 + 2 * i, gutter: "right", items: fill4(3 + 2 * i, i === 2 ? [3] : []) } });
    }
    return {
      inside: { kind: "id", n: 1, full: true, fields: [["Name", "To be issued"], ["Member since", "Day one"], ["Plan", "By invitation"]], number: null,
        mrz: ["P<LHR<THE<<ROUND<<<<<<<<<<<<<<<<", "THE<ROUND<<0000<<MEMBERS<<FIRST<<"] },
      leaves, top: { kind: "card", n: 12 },
      ink: { slot: 0, stamp: { name: "MEMBERS FIRST", shape: "round", tilt: -7 } },
    };
  })();

  /* ---------- materials ---------- */
  const leatherMat = (m) => new THREE.MeshPhysicalMaterial({
    map: m.map, normalMap: m.normalMap, normalScale: new THREE.Vector2(1, 1), roughnessMap: m.orm, metalnessMap: m.orm, roughness: 1, metalness: 1,
    clearcoat: 0.15, clearcoatRoughness: 0.45, clearcoatNormalMap: m.normalMap, clearcoatNormalScale: new THREE.Vector2(0.4, 0.4),
  });
  const coverOut = leatherMat(front), backOut = leatherMat(backF);
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x080707, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 });
  const paperMat = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, alphaTest: 0.5 });
  const NL = C.leaves.length;
  const idMat = new THREE.MeshStandardMaterial({ map: texOf({ ...(C.inside || { kind: "endpaper" }), full: true }), roughness: 0.92 });
  const endMat = new THREE.MeshStandardMaterial({ color: 0xf3ead9, roughness: 0.95 });
  const cardPageMat = paperMat(texOf(C.top || { kind: "blank" }));
  const stackMat = new THREE.MeshStandardMaterial({ color: 0xf4ead6, vertexColors: true, roughness: 0.95 });
  function leafMat(front, back) {
    const m = new THREE.MeshStandardMaterial({ map: front, side: THREE.DoubleSide, roughness: 0.92, alphaTest: 0.5 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.mapB = { value: back };
      sh.fragmentShader = "uniform sampler2D mapB;\n" + sh.fragmentShader.replace("#include <map_fragment>",
        "vec4 sampledDiffuseColor = gl_FrontFacing ? texture2D( map, vMapUv ) : texture2D( mapB, vec2( 1.0 - vMapUv.x, vMapUv.y ) );\n diffuseColor *= sampledDiffuseColor;");
    };
    m.customProgramCacheKey = () => "leaf2";
    return m;
  }

  /* ---------- geometry ---------- */
  const roundRect = (w, h, r) => {
    const s = new THREE.Shape(), x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
  };
  /* a cover: rounded, bevelled board. Groups: 0 outside (+z), 1 inside (-z), 2 edges; UVs span the full board */
  function board(w, h, t) {
    const bs = 0.007, bt = 0.006;
    const g = new THREE.ExtrudeGeometry(roundRect(w - 2 * bs, h - 2 * bs, 0.075), { depth: t - 2 * bt, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 3, curveSegments: 10 });
    g.translate(0, 0, -(t - 2 * bt) / 2);
    smoothNormals(g);
    const pos = g.attributes.position, uv = g.attributes.uv, caps = g.groups[0];
    const outT = [], inT = [], sideT = [];
    for (let v = 0; v < pos.count; v += 3) {
      const isCap = v >= caps.start && v < caps.start + caps.count;
      if (!isCap) { sideT.push(v, v + 1, v + 2); continue; }
      const outside = pos.getZ(v) > 0;
      (outside ? outT : inT).push(v, v + 1, v + 2);
      for (let j = v; j < v + 3; j++) { const u = (pos.getX(j) + w / 2) / w; uv.setXY(j, outside ? u : 1 - u, (pos.getY(j) + h / 2) / h); }
    }
    g.setIndex([...outT, ...inT, ...sideT]);
    g.clearGroups();
    g.addGroup(0, outT.length, 0); g.addGroup(outT.length, inT.length, 1); g.addGroup(outT.length + inT.length, sideT.length, 2);
    return g;
  }
  /* the page block: rounded sheets, each a touch out of line, slightly different in tone */
  function stack() {
    const n = 16, bottom = -PT / 2 + 0.002, top = PZ, t = (top - bottom) / n, rr = prng(3);
    const P = [], Nn = [], C = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.ExtrudeGeometry(roundRect(PW - rr() * 0.01, PH - rr() * 0.008, 0.06), { depth: t * 0.84, bevelEnabled: false, curveSegments: 8 });
      g.translate(0.018 + (rr() - 0.5) * 0.008, (rr() - 0.5) * 0.005, bottom + i * t);
      smoothNormals(g);
      const tone = (i % 2 ? 0.62 : 0.76) + rr() * 0.1, p = g.attributes.position.array, nn = g.attributes.normal.array;
      for (let j = 0; j < p.length; j++) { P.push(p[j]); Nn.push(nn[j]); }
      for (let j = 0; j < p.length / 3; j++) C.push(tone, tone * 0.975, tone * 0.93);
      g.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
    return g;
  }

  const passport = new THREE.Group(), book = new THREE.Group(); passport.add(book);
  const back = new THREE.Mesh(board(W, H, CT), [endMat, backOut, edgeMat]);
  back.position.z = -(PT / 2 + CT / 2); book.add(back);
  const pages = new THREE.Mesh(stack(), stackMat); book.add(pages);
  const topSheet = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), cardPageMat);
  topSheet.position.set(0.018, 0, PZ + 0.0008); book.add(topSheet);
  /* the spine: leather rolled round the page block */
  const spR = PT / 2 + CT;
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(spR, spR, H - 0.004, 20, 1, true, Math.PI, Math.PI), edgeMat);
  spine.position.x = -W / 2 + 0.012; spine.scale.x = 0.55; book.add(spine);
  const hinge = new THREE.Group(); hinge.position.set(-W / 2, 0, PT / 2 + CT / 2); book.add(hinge);
  const cover = new THREE.Mesh(board(W, H, CT), [coverOut, idMat, edgeMat]);
  cover.position.x = W / 2; hinge.add(cover);

  const INKSPEC = C.ink && C.leaves[0] && C.leaves[0].front.kind === "stamps" ? C.ink : null;
  const plain2 = NL ? texOf(C.leaves[0].front) : null;
  const inked2 = INKSPEC ? texOf({ ...C.leaves[0].front, items: C.leaves[0].front.items.map((it, i) => (i === INKSPEC.slot ? INKSPEC.stamp : it)) }) : plain2;
  const leaves = [];
  for (let i = 0; i < NL; i++) {
    const fr = texOf(C.leaves[i].front), bk = texOf(C.leaves[i].back || { kind: "blank", gutter: "right" });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH, SEGS, 1), leafMat(fr, bk));
    m.frustumCulled = false;
    m.userData = { zR: PZ + 0.003 + (NL - 1 - i) * 0.0035, zL: PT / 2 + CT + 0.003 + i * 0.0035, a: -1 };
    book.add(m); leaves.push(m);
  }
  function bend(m, a) {
    if (Math.abs(m.userData.a - a) < 1e-5) return;
    m.userData.a = a;
    const pos = m.geometry.attributes.position, du = PW / SEGS, c = 0.9 * Math.sin(a);
    const zh = mix(m.userData.zR, m.userData.zL, a / Math.PI) + Math.sin(a) * 0.03;
    let x = 0, z = 0;
    for (let ix = 0; ix <= SEGS; ix++) {
      if (ix > 0) { const th = a - c * ((ix - 0.5) / SEGS); x += Math.cos(th) * du; z += Math.sin(th) * du; }
      for (let iy = 0; iy < 2; iy++) pos.setXYZ(iy * (SEGS + 1) + ix, HX + x, iy === 0 ? PH / 2 : -PH / 2, zh + z);
    }
    pos.needsUpdate = true; m.geometry.computeVertexNormals();
  }
  leaves.forEach((m) => bend(m, 0));
  const inkS = INKSPEC ? inkStamp(INKSPEC.stamp.name, INKSPEC.stamp.shape || "round", INKSPEC.stamp.tilt || 0, INKSPEC.stamp.top, INKSPEC.stamp.bottom) : mk(4, 4)[0];
  const inkMat = new THREE.MeshStandardMaterial({ map: tex(inkS), transparent: true, roughness: 1, depthWrite: false, opacity: 0 });
  const ink = new THREE.Mesh(new THREE.PlaneGeometry((440 / 1024) * PW, (440 / 1024) * PW), inkMat);
  const slot = SLOTS[INKSPEC ? INKSPEC.slot : 0];
  ink.position.set(HX + (slot[0] / TW) * PW, (0.5 - slot[1] / TH) * PH, (NL ? leaves[0].userData.zR : PZ) + 0.003);
  ink.visible = !!INKSPEC; book.add(ink);

  /* corners of both covers, for the shadow */
  const CORN = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) CORN.push([sx * W / 2, sy * H / 2, sz * CT / 2]);

  return {
    group: passport, book, hinge, cover, back, pages, topSheet, leaves, ink, inkMat, textures,
    dims: { W, H, CT, PT, PW, PH, PZ, HX, N: NL, CARD_W, CARD_Y },
    bend,
    /* the moving parts, as scene.js drives them: open 0..1, ink 0..1, one angle per leaf (0..PI) */
    pose(open, inkK, angles) {
      hinge.rotation.y = -open * Math.PI * 0.985;
      for (let i = 0; i < NL; i++) bend(leaves[i], (angles[i] || 0) * 0.985);      // turned pages lie on the cover, at its angle
      if (!INKSPEC) return;
      const a0 = leaves[0].userData.a;
      inkMat.opacity = a0 < 0.002 ? inkK * 0.9 : 0;
      ink.scale.setScalar(mix(1.6, 1, inkK));
      leaves[0].material.map = inkK > 0.99 || a0 > 0.002 ? inked2 : plain2;
    },
    /* world positions of the covers' 16 corners */
    corners(out = []) {
      passport.updateMatrixWorld();
      let n = 0;
      for (const m of [back, cover]) for (const c of CORN) { (out[n] ||= new THREE.Vector3()).set(c[0], c[1], c[2]).applyMatrix4(m.matrixWorld); n++; }
      return out;
    },
    dispose() { textures.forEach((t) => t.dispose()); passport.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); }); },
  };
}

/* ---------- the one shadow: soft, neutral, on the ground under the passport ----------
   Two baked layers: a tight contact shadow that fades fast as the passport lifts, and a wide soft one
   that grows and lightens with height. Both follow the passport's footprint and turn with it. */
export function createContactShadow(THREE, groundY) {
  const [c, x] = mk(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  [[0, 1], [0.35, 0.72], [0.6, 0.34], [0.8, 0.1], [1, 0]].forEach(([o, a]) => g.addColorStop(o, `rgba(0,0,0,${a})`));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const layer = () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, color: 0x000000, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
  };
  const group = new THREE.Group(), contact = layer(), soft = layer();
  group.position.y = groundY + 0.002; group.add(soft, contact);
  const u = new THREE.Vector3(), w = new THREE.Vector3();
  return {
    group,
    /* pts: the passport's corner positions in world space; vis: 0..1 for fading with the object */
    update(pts, vis = 1) {
      u.subVectors(pts[4], pts[0]); u.y = 0;                    // along the back cover's bottom edge
      if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
      u.normalize(); w.set(-u.z, 0, u.x);
      group.rotation.y = Math.atan2(-u.z, u.x);
      let minY = Infinity;
      for (const p of pts) minY = Math.min(minY, p.y);
      const ext = (near) => {
        let a = Infinity, b = -Infinity, c2 = Infinity, d = -Infinity;
        for (const p of pts) {
          if (near && p.y > minY + 0.15) continue;
          const pu = p.x * u.x + p.z * u.z, pw = p.x * w.x + p.z * w.z;
          a = Math.min(a, pu); b = Math.max(b, pu); c2 = Math.min(c2, pw); d = Math.max(d, pw);
        }
        return { cu: (a + b) / 2, cw: (c2 + d) / 2, su: b - a, sw: d - c2 };
      };
      const lift = Math.max(0, minY - groundY);
      const shift = lift * 0.12;                                  // the key light is up and to the left: the shadow falls right and back
      const place = (m, e, grow, op) => {
        const px = e.cu * u.x + e.cw * w.x + shift, pz = e.cu * u.z + e.cw * w.z - shift * 1.4;
        m.position.set((px * u.x + pz * u.z), 0, (px * w.x + pz * w.z));
        m.scale.set(e.su + grow, e.sw + grow, 1);
        m.material.opacity = op;
      };
      place(contact, ext(true), 0.1 + lift * 0.5, 0.55 * vis * (1 - smooth(0, 0.7, lift)));
      place(soft, ext(false), 0.7 + lift * 1.1, (0.34 * vis) / (1 + lift * 1.3));
    },
  };
}
