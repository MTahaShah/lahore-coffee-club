/* =====================================================================
   Lahore Coffee Club — ui.js
   Small DOM helpers behind the components in base.css: safe templating,
   icons, toast, bottom sheet, number animation, and live bindings that
   keep status pills and “X min ago” text in sync with the store.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = (window.LCC = window.LCC || {});
  const { store, fmt } = LCC;

  /* Templating ---------------------------------------------------------- */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
  const raw = (s) => new Raw(s);
  /** html`<p>${userText}</p>` escapes values; wrap trusted markup in raw(). */
  function html(strings, ...values) {
    let out = strings[0];
    values.forEach((v, i) => {
      const val = Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.s : esc(x))).join("") : v instanceof Raw ? v.s : esc(v);
      out += val + strings[i + 1];
    });
    return raw(out);
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Icons: 24px grid, 1.5px stroke, round caps. Extended in later passes. */
  const ICON_PATHS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevronRight: '<path d="M9.5 6l6 6-6 6"/>',
    chevronDown: '<path d="M6 9.5l6 6 6-6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    // Tab bar
    home: '<path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5z"/>',
    store: '<path d="M4 9.5L5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0A2.67 2.67 0 0 0 20 9.5M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h1M20 14v1"/>',
    map: '<path d="M9 5L4 7v12l5-2 6 2 5-2V5l-5 2-6-2zM9 5v12M15 7v12"/>',
    award: '<circle cx="12" cy="9" r="5"/><path d="M9 13.2L7.5 20l4.5-2.5 4.5 2.5-1.5-6.8"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 20.5s6-5.6 6-10.5a6 6 0 0 0-12 0c0 4.9 6 10.5 6 10.5z"/><circle cx="12" cy="10" r="2"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    wallet: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H18v3"/><rect x="4" y="9" width="16" height="10" rx="1.5"/><path d="M16 14h.01"/>',
    card: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M3.5 10h17M7 15h3"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8.5V20M12 8.5C10.5 5.5 7 5 7 7.25S10 8.5 12 8.5zM12 8.5c1.5-3 5-3.5 5-1.25S14 8.5 12 8.5z"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.5"/><path d="M15.5 8.5V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3"/>',
    share: '<path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5M15.5 5.3a3.5 3.5 0 0 1 0 6.4M17.5 14.8c1.8.7 3 2.3 3.5 4.7"/>',
    user: '<circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 20c.9-3.75 3.75-5.75 7.25-5.75s6.35 2 7.25 5.75"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>',
    // A coffee bean: an oval on the diagonal with its S-shaped crease (Beans, the club's points)
    bean: '<ellipse cx="12" cy="12" rx="6" ry="8.75" transform="rotate(40 12 12)"/><path d="M15.9 6.9c-2.6 1.2-2.4 3.6-3.6 5.1s-3.5 1.6-4.2 5.1"/>',
  };
  function icon(name, { size = 24, label } = {}) {
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
    return raw(
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${ICON_PATHS[name] || ""}</svg>`
    );
  }

  /* Cup-level icon: how full the café is ---------------------------------
     Outline cup = quiet, half full = moderate, full = packed. Fill uses
     currentColor, so it inverts inside a selected (ink) segment.        */
  const CUP_BODY = "M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8z";
  const CUP_FILL = {
    quiet: "",
    moderate: '<path d="M5 13.25h12V14a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-.75z" fill="currentColor" stroke="none"/>',
    packed: `<path d="${CUP_BODY}" fill="currentColor" stroke="none"/>`,
  };
  function cupIcon(status, { size = 16, cls = "status__icon" } = {}) {
    return raw(
      `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
        `${CUP_FILL[status] || ""}<path d="${CUP_BODY}"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/></svg>`
    );
  }

  /* Logos ----------------------------------------------------------------
     The real SVGs from src/logos/, inlined by build.sh as
     <template id="logo-NAME">. Their fills read --logo-ink, --logo-face,
     --logo-side and --logo-top, so CSS sets the colours (ink for type, coffee tones for bricks).
     name: wordmark | monogram-horizontal | ring | app-icon-mark          */
  const logoCache = {};
  function logo(name, { label = "Lahore Coffee Club", cls = "" } = {}) {
    if (!(name in logoCache)) {
      const tpl = document.getElementById(`logo-${name}`);
      logoCache[name] = tpl
        ? tpl.innerHTML.trim().replace(/\s(role|aria-label)="[^"]*"/g, "").replace("<svg ", '<svg aria-hidden="true" focusable="false" ')
        : null;
    }
    const svg = logoCache[name];
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
    if (!svg) return raw(`<span class="logo logo--${name} logo--text ${cls}" ${a11y}>Lahore Coffee Club</span>`);
    return raw(`<span class="logo logo--${name} ${cls}" ${a11y}>${svg}</span>`);
  }

  /* Brick ring -----------------------------------------------------------
     The brand's signature graphic: one brick per cup on a ring, with one
     gap at 3 o'clock. Bricks run clockwise from the gap; the first `filled`
     are solid, the rest (used cups) are outlined. Flat in the interface.
     Colours come from CSS (.brick-ring: color for bricks, --brick-line). */
  function brickRing({ total = 0, filled = 0, size = 200, radius = 82, length = 22, twist = 14, cls = "", stagger = false } = {}) {
    const c = size / 2;
    if (!total) {
      return raw(`<svg class="brick-ring ${cls}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false"><circle class="brick-ring__empty" cx="${c}" cy="${c}" r="${radius}"/></svg>`);
    }
    const slots = total + 1;                       // one empty slot: the gap at 3 o'clock
    const step = 360 / slots;
    const arc = (2 * Math.PI * radius) / slots;
    const width = Math.max(4, Math.min(length * 0.5, arc * 0.45));
    let out = "";
    for (let i = 0; i < total; i++) {
      const angle = (i + 1) * step;                // 0deg = 3 o'clock, clockwise in SVG
      const on = i < filled;
      out += `<g transform="translate(${c} ${c}) rotate(${angle.toFixed(2)}) translate(${radius} 0) rotate(${twist})">` +
        `<rect class="brick${on ? " is-full" : " is-used"}"${stagger && on ? ` style="--i:${i}"` : ""} x="${(-length / 2).toFixed(2)}" y="${(-width / 2).toFixed(2)}" width="${length}" height="${width.toFixed(2)}" rx="${Math.min(2.5, width / 3).toFixed(2)}"/></g>`;
    }
    return raw(`<svg class="brick-ring ${cls}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">${out}</svg>`);
  }

  /* Status pill --------------------------------------------------------- */
  /** Renders a pill bound to a café; it updates itself on store changes. */
  function statusPill(cafeId, { bare = false, time = true } = {}) {
    const cafe = store.select.cafe(cafeId);
    return html`<span class="status${bare ? " status--bare" : ""}" data-status="${cafe.status}" data-live-status="${cafeId}" data-live-time="${time ? "1" : "0"}">
      ${cupIcon(cafe.status)}
      <span class="status__label">${fmt.statusLabel(cafe.status)}</span>
      ${time ? html`<span class="status__time" data-rel-time="${cafe.statusUpdatedAt}" data-rel-prefix="updated">${fmt.updated(cafe.statusUpdatedAt)}</span>` : ""}
    </span>`;
  }

  function refreshStatusPills(cafeId, { flash = false } = {}) {
    const cafe = store.select.cafe(cafeId);
    $$(`[data-live-status="${cafeId}"]`).forEach((el) => {
      el.dataset.status = cafe.status;
      const ic = el.querySelector(".status__icon");
      if (ic) ic.outerHTML = cupIcon(cafe.status).s;
      const label = el.querySelector(".status__label");
      if (label) label.textContent = fmt.statusLabel(cafe.status);
      const t = el.querySelector("[data-rel-time]");
      if (t) { t.dataset.relTime = cafe.statusUpdatedAt; t.textContent = fmt.updated(cafe.statusUpdatedAt); }
      if (flash) { el.classList.remove("is-changed"); void el.offsetWidth; el.classList.add("is-changed"); }
    });
  }

  function refreshRelativeTimes() {
    $$("[data-rel-time]").forEach((el) => {
      const ts = Number(el.dataset.relTime);
      const prefix = el.dataset.relPrefix;
      el.textContent = prefix ? `${prefix} ${fmt.ago(ts)}` : fmt.ago(ts);
    });
  }

  store.on("cafe:status", ({ cafeId }) => refreshStatusPills(cafeId, { flash: true }));
  store.on("tick", refreshRelativeTimes);

  /* Number animation ---------------------------------------------------- */
  const running = new WeakMap();
  /** Count from the element’s current value to `to`. */
  function animateNumber(el, to, { format = fmt.num, duration = 420 } = {}) {
    if (!el) return;
    const from = Number(el.dataset.value ?? to);
    el.dataset.value = to;
    if (from === to || reducedMotion()) { el.textContent = format(to); return; }
    cancelAnimationFrame(running.get(el));
    const t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      el.textContent = format(Math.round(from + (to - from) * ease(p)));
      if (p < 1) running.set(el, requestAnimationFrame(step));
    };
    running.set(el, requestAnimationFrame(step));
  }

  /* Toast --------------------------------------------------------------- */
  function toast(message, { iconName = "check", duration = 2800, region } = {}) {
    const host = region || $(".phone__screen .toast-region") || $("#toast-region");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `${iconName ? icon(iconName, { size: 18 }) : ""}<span>${esc(message)}</span>`;
    host.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-leaving");
      el.addEventListener("animationend", () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 400);
    }, duration);
  }

  /* Bottom sheet -------------------------------------------------------
     Markup:
       <div class="sheet" id="x" role="dialog" aria-modal="true" aria-labelledby="x-title" aria-hidden="true">
         <div class="sheet__scrim" data-sheet-close></div>
         <div class="sheet__panel">
           <div class="sheet__handle" aria-hidden="true"></div>
           <div class="sheet__body">…</div>
         </div>
       </div>
     Opens with focus moved inside, closes on scrim, Escape, or drag down.  */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const openSheets = [];

  function openSheet(sheet, { onClose } = {}) {
    if (!sheet || sheet.dataset.open === "true") return;
    sheet._returnFocus = document.activeElement;
    sheet._onClose = onClose;
    sheet.dataset.open = "true";
    sheet.setAttribute("aria-hidden", "false");
    openSheets.push(sheet);
    bindDrag(sheet);
    requestAnimationFrame(() => {
      const target = sheet.querySelector("[autofocus]") || sheet.querySelector(FOCUSABLE) || sheet.querySelector(".sheet__panel");
      if (target) { if (!target.hasAttribute("tabindex") && target.classList.contains("sheet__panel")) target.tabIndex = -1; target.focus({ preventScroll: true }); }
    });
  }

  function closeSheet(sheet) {
    if (!sheet || sheet.dataset.open !== "true") return;
    sheet.dataset.open = "false";
    sheet.setAttribute("aria-hidden", "true");
    sheet.style.removeProperty("--drag");
    const i = openSheets.indexOf(sheet);
    if (i > -1) openSheets.splice(i, 1);
    const back = sheet._returnFocus;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
    if (typeof sheet._onClose === "function") sheet._onClose();
  }

  function bindDrag(sheet) {
    if (sheet._dragBound) return;
    sheet._dragBound = true;
    if (sheet.classList.contains("sheet--drawer")) { bindSwipe(sheet); return; }
    const handle = sheet.querySelector(".sheet__handle");
    if (!handle) return;
    let startY = 0, dy = 0, t0 = 0, active = false;
    handle.addEventListener("pointerdown", (e) => {
      active = true; startY = e.clientY; dy = 0; t0 = performance.now();
      sheet.classList.add("is-dragging");
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!active) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.setProperty("--drag", `${dy}px`);
    });
    const end = () => {
      if (!active) return;
      active = false;
      sheet.classList.remove("is-dragging");
      const velocity = dy / Math.max(1, performance.now() - t0);
      if (dy > 96 || velocity > 0.6) closeSheet(sheet);
      else sheet.style.setProperty("--drag", "0px");
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  /* Side drawer (.sheet--drawer): swipe right on the panel to close.
     Vertical moves are left alone, so the drawer still scrolls. */
  function bindSwipe(sheet) {
    const panel = sheet.querySelector(".sheet__panel");
    let x0 = 0, y0 = 0, dx = 0, t0 = 0, mode = null; // null: undecided, "x": dragging, "y": scrolling
    panel.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; t0 = performance.now(); mode = null;
    });
    panel.addEventListener("pointermove", (e) => {
      if (mode === "y" || e.pointerType === "mouse") return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (mode === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        mode = Math.abs(mx) > Math.abs(my) ? "x" : "y";
        if (mode === "x") { sheet.classList.add("is-dragging"); panel.setPointerCapture(e.pointerId); }
        return;
      }
      dx = Math.max(0, mx);
      sheet.style.setProperty("--drag", `${dx}px`);
    });
    const end = () => {
      if (mode !== "x") { mode = null; return; }
      mode = null;
      sheet.classList.remove("is-dragging");
      const velocity = dx / Math.max(1, performance.now() - t0);
      if (dx > 80 || velocity > 0.5) closeSheet(sheet);
      else sheet.style.setProperty("--drag", "0px");
    };
    panel.addEventListener("pointerup", end);
    panel.addEventListener("pointercancel", end);
  }

  document.addEventListener("click", (e) => {
    const closer = e.target.closest("[data-sheet-close]");
    if (closer) closeSheet(closer.closest(".sheet"));
    const opener = e.target.closest("[data-sheet-open]");
    if (opener) openSheet(document.getElementById(opener.dataset.sheetOpen));
  });

  document.addEventListener("keydown", (e) => {
    const top = openSheets[openSheets.length - 1];
    if (!top) return;
    if (e.key === "Escape") { e.preventDefault(); closeSheet(top); return; }
    if (e.key === "Tab") {
      const items = $$(FOCUSABLE, top).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* QR code (qrcode-generator from cdnjs) -----------------------------
     Returns SVG markup, or a fallback note when the library didn't load. */
  function qrSvg(payload, { fallback = "QR unavailable offline. Read the code below to the barista." } = {}) {
    if (typeof window.qrcode !== "function") return html`<div class="qr--fallback" style="height:100%">${fallback}</div>`.s;
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(payload);
      qr.make();
      const n = qr.getModuleCount();
      let d = "";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" aria-hidden="true" focusable="false"><path d="${d}" fill="currentColor"/></svg>`;
    } catch (err) {
      console.warn("[LCC] QR render failed", err);
      return html`<div class="qr--fallback" style="height:100%">${fallback}</div>`.s;
    }
  }

  /* Stepper ------------------------------------------------------------- */
  function stepper({ id, value = 0, min = 0, max = 10, label }) {
    return html`<div class="stepper" role="group" aria-label="${label}" data-stepper="${id}" data-min="${min}" data-max="${max}">
      <button type="button" class="stepper__btn" data-step="-1" aria-label="One fewer" ${value <= min ? raw("disabled") : ""}>${icon("minus")}</button>
      <output class="stepper__value" aria-live="polite">${value}</output>
      <button type="button" class="stepper__btn" data-step="1" aria-label="One more" ${value >= max ? raw("disabled") : ""}>${icon("plus")}</button>
    </div>`;
  }
  /** Sync a rendered stepper with a new value. */
  function setStepper(el, value) {
    const min = Number(el.dataset.min), max = Number(el.dataset.max);
    el.querySelector(".stepper__value").textContent = value;
    el.querySelector('[data-step="-1"]').disabled = value <= min;
    el.querySelector('[data-step="1"]').disabled = value >= max;
  }

  /* Segmented control --------------------------------------------------- */
  function segmented({ name, options, value, label }) {
    const index = Math.max(0, options.findIndex((o) => o.value === value));
    return html`<div class="segmented" role="tablist" aria-label="${label}" data-segmented="${name}" style="--count:${options.length};--index:${index}">
      <span class="segmented__thumb" aria-hidden="true"></span>
      ${options.map((o) => html`<button type="button" role="tab" class="segmented__option" data-value="${o.value}" aria-selected="${o.value === value}" tabindex="${o.value === value ? 0 : -1}">${o.label}</button>`)}
    </div>`;
  }
  function selectSegment(group, value) {
    const opts = $$(".segmented__option", group);
    opts.forEach((o, i) => {
      const on = o.dataset.value === value;
      o.setAttribute("aria-selected", on);
      o.tabIndex = on ? 0 : -1;
      if (on) group.style.setProperty("--index", i);
    });
  }
  // Arrow keys move between segments (tablist pattern)
  document.addEventListener("keydown", (e) => {
    const opt = e.target.closest?.(".segmented__option");
    if (!opt || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const opts = $$(".segmented__option", opt.parentElement);
    const next = opts[(opts.indexOf(opt) + (e.key === "ArrowRight" ? 1 : -1) + opts.length) % opts.length];
    next.focus(); next.click();
  });

  LCC.ui = {
    html, raw, esc, $, $$, icon, logo, brickRing,
    cupIcon, statusPill, refreshStatusPills, refreshRelativeTimes,
    animateNumber, toast, openSheet, closeSheet, qrSvg,
    stepper, setStepper, segmented, selectSegment,
    reducedMotion,
  };
})();
