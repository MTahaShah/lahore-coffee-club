/* Passport lab (/lab/passport): the realistic passport alone, with the landing's moves on buttons.
   Timing mirrors scene.js: the same story clock s drives the cover, the ink and the riffle. */
import * as THREE from "../vendor/three/three.module.min.js";
import { RoomEnvironment } from "../vendor/three/RoomEnvironment.js";
import { createPassport, createContactShadow } from "./passport.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const LOW = matchMedia("(pointer: coarse)").matches;
const $ = (id) => document.getElementById(id);
const panel = document.querySelector(".panel");
const canvas = $("gl"), fpsEl = $("fps"), info = $("info");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
let dpr = Math.min(devicePixelRatio, LOW ? 1.6 : 2);
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setClearColor(0x0b0b0b, 1);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
/* one soft key from the top left, a weak rim behind so the edges separate from the dark */
const key = new THREE.DirectionalLight(0xfff3e2, 2.4); key.position.set(-4, 6, 7); scene.add(key);
const rim = new THREE.DirectionalLight(0xffeedd, 1.1); rim.position.set(3.5, 2.5, -6); scene.add(rim);

const GROUND = -1.62;
/* a faint pool of light on the ground, only so the shadow has something to fall on in the lab */
{
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(40,37,34,1)"); g.addColorStop(1, "rgba(40,37,34,0)");
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = GROUND; scene.add(pool);
}
const shadow = createContactShadow(THREE, GROUND); scene.add(shadow.group);

const ringSvg = $("svg-ring").innerHTML.trim(), wordmarkSvg = $("svg-wordmark").innerHTML.trim();
const sizeSel = $("tex");
sizeSel.value = new URLSearchParams(location.search).get("tex") || "1024";
let P = null;
async function build() {
  const t0 = performance.now();
  info.textContent = "Building textures…";
  if (P) { scene.remove(P.group); P.dispose(); }
  P = await createPassport(THREE, { renderer, ringSvg, wordmarkSvg, size: +sizeSel.value, pageScale: 0.75 });
  scene.add(P.group);
  try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }
  P.textures.forEach((t) => renderer.initTexture(t));
  info.textContent = `Textures ${sizeSel.value}px, built in ${Math.round(performance.now() - t0)} ms`;
}
sizeSel.addEventListener("change", build);

/* ---------- state, as the landing drives it ---------- */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const expo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (x, a, b) => ease(clamp((x - a) / (b - a)));
const mix = (a, b, t) => a + (b - a) * t;
const S = { s: 0.27, riseAt: reduced ? -1e9 : performance.now(), vis: 1, spin: false, spinY: 0, tilt: reduced ? -0.35 : -0.3 };
/* for screenshots and checks: ?s=0.62 (story position), ?tilt=0.4 */
{ const q = new URLSearchParams(location.search); if (q.has("s")) S.s = +q.get("s"); if (q.has("tilt")) S.tilt = +q.get("tilt"); if (q.has("s") || q.has("tilt")) S.riseAt = -1e9; }
const tweens = {};
function tween(name, from, to, ms, fn) {
  return new Promise((res) => {
    if (reduced || ms <= 0) { fn(to); res(); return; }
    const t0 = performance.now(), id = Symbol(); tweens[name] = id;
    const step = (now) => {
      if (tweens[name] !== id) return res();               // replaced by a newer press: no pile-ups
      const k = Math.min(1, (now - t0) / ms); fn(mix(from, to, k));
      k < 1 ? requestAnimationFrame(step) : res();
    };
    requestAnimationFrame(step);
  });
}
/* the story clock: closed at s .27, cover open by .35, riffle done by .62 (as in scene.js) */
const OPEN_S = 0.62, CLOSED_S = 0.27, STORY_MS = 4200;
const goS = (to) => tween("s", S.s, to, (Math.abs(to - S.s) / (OPEN_S - CLOSED_S)) * STORY_MS, (v) => { S.s = v; });
$("rise").onclick = () => { S.riseAt = reduced ? -1e9 : performance.now(); };
$("open").onclick = () => goS(OPEN_S);
$("close").onclick = () => goS(CLOSED_S);
$("step").onclick = async () => { await tween("vis", S.vis, 0, 700, (v) => { S.vis = v; }); await new Promise((r) => setTimeout(r, reduced ? 0 : 350)); await tween("vis", 0, 1, 800, (v) => { S.vis = v; }); };
const spinBtn = $("spin");
spinBtn.disabled = reduced;
spinBtn.onclick = () => { S.spin = !S.spin; spinBtn.setAttribute("aria-pressed", String(S.spin)); };
const tiltEl = $("tilt");
tiltEl.value = String(Math.round(S.tilt * 100));
tiltEl.oninput = () => { S.tilt = +tiltEl.value / 100; };

/* ---------- framing ---------- */
const L = { w: 0, h: 0 };
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === L.w && h === L.h) return;
  L.w = w; L.h = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

/* ---------- frame ---------- */
const pts = [];
let last = performance.now(), fN = 0, fT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  resize();
  if (P) {
    const s = S.s, open = seg(s, 0.28, 0.35), kInk = seg(s, 0.345, 0.37);
    P.pose(open, kInk, Array.from({ length: P.dims.N }, (_, i) => Math.PI * seg(s, 0.38 + i * 0.036, 0.46 + i * 0.036)));
    P.book.position.x = open * (P.dims.W / 2);             // keep the open spread centred
    const rise = reduced ? 1 : expo(clamp((now - S.riseAt) / 1000 / 1.7));
    if (S.spin) S.spinY += dt * 0.55;
    const g = P.group;
    g.visible = S.vis > 0.001;
    g.scale.setScalar(Math.max(1e-4, mix(0.82, 1, rise) * mix(0.6, 1, S.vis)));
    g.position.set(0, mix(-5.5, 0, rise) + (reduced ? 0 : Math.sin(now / 1250) * 0.03), 0);
    g.rotation.set(0.1, S.tilt + S.spinY, 0);
    shadow.update(P.corners(pts), g.visible ? S.vis : 0);
    /* step back far enough to fit the open spread on a phone */
    const a = camera.aspect, tanH = Math.tan((camera.fov / 2) * Math.PI / 180);
    const free = Math.max(0.5, 1 - (panel.offsetHeight + 40) / L.h);    // the part of the screen above the controls
    const need = Math.max(3.9 / (2 * tanH * free), mix(2.7, 4.4, open) / (2 * tanH * a));
    camera.position.set(0, 0.9, need);
    camera.lookAt(0, -0.25, 0);
    /* lift the picture into the space above the controls */
    camera.setViewOffset(L.w, L.h, 0, (L.h - L.h * free) / 2, L.w, L.h);
  }
  renderer.render(scene, camera);
  fN++; fT += dt;
  if (fT > 0.5) { fpsEl.textContent = Math.round(fN / fT) + " fps"; fN = 0; fT = 0; }
  requestAnimationFrame(frame);
}
await build();
requestAnimationFrame((n) => { last = n; frame(n); });
