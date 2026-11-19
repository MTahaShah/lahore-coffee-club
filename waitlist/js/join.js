/* Lahore Coffee Club waitlist: scroll story, the number, the slider, sending to the sheet. */
{
  /* Paste your Google Apps Script web app URL here (see the setup steps). Empty = demo mode, nothing is sent. */
  /* Which privacy notice the person agreed to. Change it when /privacy changes in a way that matters. */
  const CONSENT = "privacy-2026-11-17";
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbzuDl2z-5H39xKMYAFsE742vqLgNAU6gZDwwEAlnNO1leXulU-jnxQFOWIzAZxXsQyifw/exec";

  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const S = window.LCC = { p: 0, target: 0, reduced, joined: false, joinT: 0, introStart: 0, isReady: false, digits: 0, valid: false, slide: 0, slideAt: 0 };
  const caps = [...document.querySelectorAll(".cap")];
  /* where each chapter's words begin, so the 3D scene can sit in the space above them */
  const capTop = () => caps.forEach((el) => {
    const kids = [...el.querySelectorAll(":scope > *, :scope > .before > *, :scope > .after > *")].filter((k) => k.offsetHeight > 0 && !k.classList.contains("foot"));
    el._top = kids.length ? Math.min(...kids.map((k) => k.getBoundingClientRect().top - (parseFloat((el.style.transform.match(/,\s*(-?[\d.]+)px/) || [])[1]) || 0))) : innerHeight;
  });
  S.free = innerHeight * 0.62;
  const prog = [...document.querySelectorAll(".prog rect")];
  const gl = document.getElementById("gl");
  let max = 1;
  const touch = matchMedia("(pointer: coarse)").matches;
  /* the scroll range is read live, so the phone's address bar showing or hiding never jolts the story */
  /* the track is sized in pixels from the tallest view seen at this width, so a keyboard or a
     collapsing address bar can't shorten the page and knock you off the form */
  const track = document.getElementById("track");
  let baseW = 0, baseH = 0;
  const size = () => {
    if (innerWidth !== baseW) { baseW = innerWidth; baseH = innerHeight; }
    else if (innerHeight > baseH) baseH = innerHeight; else return;
    track.style.height = baseH * 10 + "px";
  };
  size();
  const measure = () => { max = Math.max(1, root.scrollHeight - innerHeight); };
  const read = () => { measure(); S.target = Math.min(1, Math.max(0, scrollY / max)); };
  addEventListener("scroll", read, { passive: true });
  addEventListener("resize", () => { size(); read(); capTop(); });
  capTop(); document.fonts?.ready.then(capTop); setTimeout(capTop, 1200);
  read();

  /* keyboard: lift the form above it (the page itself never resizes) */
  const vv = window.visualViewport;
  const kb = () => {
    if (!vv) return;
    const k = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty("--kb", k + "px");
    root.classList.toggle("kb", k > 120);
    capTop();
  };
  vv?.addEventListener("resize", kb); vv?.addEventListener("scroll", kb);

  const loader = document.getElementById("loader");
  S.ready = () => {
    if (S.isReady) return;
    S.isReady = true; loader.classList.add("gone"); root.classList.add("ready"); S.introStart = performance.now();
    if (location.hash === "#join") { history.replaceState(null, "", location.pathname + location.search); setTimeout(toEnd, reduced ? 0 : 700); }
  };
  setTimeout(() => { if (!S.isReady) { root.classList.add("no-gl"); S.ready(); } }, 10000);

  const ease3 = (t) => 1 - Math.pow(1 - t, 3);
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let last = performance.now(), litN = -1;
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    S.p = reduced ? S.target : S.p + (S.target - S.p) * (1 - Math.exp(-(touch ? 9 : 5) * dt));
    if (Math.abs(S.p - S.target) < 1e-5) S.p = S.target;
    const p = S.p;
    for (const el of caps) {
      const a = +el.dataset.a, b = +el.dataset.b, f = 0.03;
      const o = sm(a, a + f, p) * (1 - sm(b - f, b, p));
      const y = reduced ? 0 : (p < a + f ? 1 : -1) * (1 - o) * 28;
      const key = o.toFixed(3) + "|" + y.toFixed(1);
      if (el._k !== key) {
        el._k = key;
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;
        el.style.visibility = o < 0.01 ? "hidden" : "visible";
      }
      const live = o > 0.5;
      if (el._live !== live) { el._live = live; el.toggleAttribute("inert", !live); }
    }
    let wsum = 0, tsum = 0;
    for (const el of caps) { const o = +(el.style.opacity || 0); if (o > 0.01) { wsum += o; tsum += o * el._top; } }
    if (wsum > 0.05) S.free = tsum / wsum;
    const n = Math.round(p * 15);
    if (n !== litN) { litN = n; prog.forEach((r, i) => r.classList.toggle("on", i < n)); }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const toEnd = () => { measure(); scrollTo({ top: max, behavior: reduced ? "auto" : "smooth" }); };
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
    toEnd();
    if (!touch) setTimeout(() => input.focus({ preventScroll: true }), reduced ? 0 : 1600);  // phones: no surprise keyboard
  }));
  document.querySelector(".mark").addEventListener("click", (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); });

  /* The number: ten bricks, one per digit */
  const form = document.getElementById("join"), input = document.getElementById("wa"), err = document.getElementById("wa-err");
  const dial = document.getElementById("dial"), cellsEl = document.getElementById("cells");
  const slide = document.getElementById("slide"), knob = document.getElementById("knob"), slideTxt = document.getElementById("slide-txt");
  const cells = [];
  for (let i = 0; i < 10; i++) {
    if (i === 3) cellsEl.appendChild(document.createElement("span"));
    const c = document.createElement("span"); c.className = "cell"; cellsEl.appendChild(c); cells.push(c);
  }
  const clean = (v) => {
    let d = v.replace(/\D/g, "");
    if (d.length > 10 && d.startsWith("0092")) d = d.slice(4);
    if (d.length > 10 && d.startsWith("92")) d = d.slice(2);
    d = d.replace(/^0+/, "");
    return d.slice(0, 10);
  };
  function render() {
    const d = input.value;
    cells.forEach((c, i) => {
      const ch = d[i] || "";
      if (c.textContent !== ch) { c.textContent = ch; c.classList.toggle("on", !!ch); }
      c.classList.toggle("next", i === d.length || (d.length === 10 && i === 9 && false));
    });
    S.digits = d.length;
    S.valid = /^3\d{9}$/.test(d);
    slide.classList.toggle("ready", S.valid);
    if (!busy) slideTxt.textContent = S.valid ? "Slide the last brick in" : "Your number first";
  }
  input.addEventListener("input", () => {
    const d = clean(input.value);
    input.value = d;
    err.textContent = d && d[0] !== "3" ? "Pakistani mobile numbers start with 3." : "";
    input.toggleAttribute("aria-invalid", !!err.textContent);
    if (d.length !== S.digits) Sound.key(d.length < S.digits);                 // sound: a digit typed (or deleted)
    render();
  });
  input.addEventListener("focus", () => { dial.classList.add("focus"); if (S.target < 0.86) toEnd(); setTimeout(kb, 350); });
  input.addEventListener("blur", () => { dial.classList.remove("focus"); setTimeout(kb, 350); });
  /* the slider: drag the brick into the gap, or just tap it (keyboard and screen readers press it like a button) */
  let busy = false, x = 0, drag = null, tween = 0, noClick = false;
  const maxX = () => Math.max(1, slide.clientWidth - knob.offsetWidth - 8);
  const setX = (v) => {
    x = Math.min(maxX(), Math.max(0, v));
    slide.style.setProperty("--x", x.toFixed(1) + "px");
    S.slide = x / maxX();
    slide.style.setProperty("--p", S.slide.toFixed(3));
  };
  const slideTo = (to, ms = 420) => new Promise((res) => {
    cancelAnimationFrame(tween);
    const from = x, end = to * maxX(), t0 = performance.now();
    if (reduced || Math.abs(end - from) < 1) { setX(end); res(); return; }
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      setX(from + (end - from) * e);
      if (k < 1) tween = requestAnimationFrame(step); else res();
    };
    tween = requestAnimationFrame(step);
  });
  knob.addEventListener("pointerdown", (e) => {
    if (busy || !S.valid || e.button > 0) return;
    cancelAnimationFrame(tween);
    drag = { id: e.pointerId, x0: e.clientX - x, moved: false };
    knob.setPointerCapture(e.pointerId);
  });
  knob.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const v = e.clientX - drag.x0;
    if (Math.abs(v - x) > 3) drag.moved = true;
    if (drag.moved) setX(v);
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved; drag = null;
    if (!moved) return;                                       // a plain tap: the click below handles it
    noClick = true; setTimeout(() => { noClick = false; }, 400);
    if (S.slide > 0.78) form.requestSubmit(); else slideTo(0, 360);
  };
  knob.addEventListener("pointerup", release);
  knob.addEventListener("pointercancel", release);
  knob.addEventListener("click", (e) => { if (noClick) { e.preventDefault(); } });
  addEventListener("resize", () => { if (!drag) setX(S.slide * maxX()); });
  render();

  const done = () => {
    S.slideAt = ease3(S.slide) * 0.9; S.joined = true; S.joinT = performance.now(); root.classList.add("joined"); setTimeout(capTop, 50); try { localStorage.setItem("lcc-joined-v2", "1"); } catch {} };
  try { if (localStorage.getItem("lcc-joined-v2") === "1") { root.classList.add("joined"); S.joined = true; S.joinT = -1e9; } } catch {}

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    if (form.website.value) return;                 // a bot filled the hidden field
    const d = input.value;
    if (!/^3\d{9}$/.test(d)) {
      err.textContent = d.length < 10 ? "Ten digits after +92, starting with 3." : "Pakistani mobile numbers start with 3.";
      input.setAttribute("aria-invalid", "true"); input.focus({ preventScroll: true }); slideTo(0, 300); return;
    }
    busy = true; slide.classList.add("busy"); knob.setAttribute("aria-disabled", "true");
    input.blur();
    await slideTo(1, 520);
    slideTxt.textContent = "Holding your place…";
    if (!ENDPOINT) { done(); return; }               // demo mode
    try {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, signal: ctrl.signal,
        body: JSON.stringify({
          whatsapp: "+92" + d,
          consent: CONSENT,
          page: location.href.slice(0, 300),
          ref: document.referrer.slice(0, 300),
          device: touch ? "phone" : "computer",
        }) });
      clearTimeout(timer);
      const reply = (await res.text()).trim();
      if (reply !== "ok" && reply !== "dup") throw new Error(reply.slice(0, 200));  // only celebrate once the sheet confirms
      done();
    } catch {
      err.textContent = "That didn't go through. Check your connection and try again.";
      busy = false; slide.classList.remove("busy"); knob.removeAttribute("aria-disabled");
      await slideTo(0, 420); render();
    }
  });
}
