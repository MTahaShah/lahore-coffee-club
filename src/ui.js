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
  };
  function icon(name, { size = 24, label } = {}) {
    const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
    return raw(
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${ICON_PATHS[name] || ""}</svg>`
    );
  }

  /* Status pill --------------------------------------------------------- */
  /** Renders a pill bound to a café; it updates itself on store changes. */
  function statusPill(cafeId, { bare = false, time = true } = {}) {
    const cafe = store.select.cafe(cafeId);
    return html`<span class="status${bare ? " status--bare" : ""}" data-status="${cafe.status}" data-live-status="${cafeId}" data-live-time="${time ? "1" : "0"}">
      <span class="status__dot" aria-hidden="true"></span>
      <span class="status__label">${fmt.statusLabel(cafe.status)}</span>
      ${time ? html`<span class="status__time" data-rel-time="${cafe.statusUpdatedAt}" data-rel-prefix="updated">${fmt.updated(cafe.statusUpdatedAt)}</span>` : ""}
    </span>`;
  }

  function refreshStatusPills(cafeId, { flash = false } = {}) {
    const cafe = store.select.cafe(cafeId);
    $$(`[data-live-status="${cafeId}"]`).forEach((el) => {
      el.dataset.status = cafe.status;
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
      el.textContent = el.dataset.relPrefix === "updated" ? fmt.updated(ts) : fmt.ago(ts);
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
    html, raw, esc, $, $$, icon,
    statusPill, refreshStatusPills, refreshRelativeTimes,
    animateNumber, toast, openSheet, closeSheet,
    stepper, setStepper, segmented, selectSegment,
    reducedMotion,
  };
})();
