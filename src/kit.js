/* =====================================================================
   Lahore Coffee Club — kit.js
   #/kit: every Pass 1 component on one page, wired to the real store,
   so the design system can be reviewed before screens are built.
   Not linked from the switcher.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, fmt, ui } = LCC;
  const { html, raw, $, $$ } = ui;

  const swatches = ["--bg", "--surface", "--surface-2", "--ink", "--ink-2", "--ink-3", "--line", "--accent", "--accent-soft", "--status-quiet", "--status-moderate", "--status-packed"];

  LCC.router.register("kit", {
    title: "Component kit",
    mount(el) {
      const cafes = store.select.cafes();
      const kiln = store.select.cafe("kiln");
      el.innerHTML = html`
        <div class="surface container kit">
          <p class="eyebrow">Pass 1 · design system</p>
          <h1 class="t-display" style="margin-top:var(--space-3)">Every café you love.<br>One monthly pass.</h1>
          <p class="t-body t-muted measure" style="margin-top:var(--space-4)">Pick your places, pick your cups. Pay once, drink well all month.</p>

          <div class="kit-grid">
            <section class="card stack" style="--stack-gap:var(--space-4)">
              <h2 class="eyebrow">Colour</h2>
              <div class="kit-swatches">
                ${swatches.map((s) => html`<div class="kit-swatch"><span style="background:var(${s})"></span><span>${s.slice(2)}</span></div>`)}
              </div>
            </section>

            <section class="card stack" style="--stack-gap:var(--space-3)">
              <h2 class="eyebrow">Type</h2>
              <p class="t-h1">Fraunces 40</p>
              <p class="t-h2">Fraunces 28, for titles</p>
              <p class="t-h3">Inter Tight 20, medium</p>
              <p class="t-body">Body 16. We send you regulars. You serve them coffee.</p>
              <p class="t-small t-muted">Small 14, secondary ink.</p>
              <p class="t-micro t-faint num">Micro 12 · Rs 6,500 · 11 of 16</p>
            </section>

            <section class="card stack" style="--stack-gap:var(--space-3)">
              <h2 class="eyebrow">Buttons</h2>
              <button class="btn btn--primary btn--block" type="button" data-kit-toast="You’re on the list.">Join the waitlist</button>
              <button class="btn btn--secondary btn--block" type="button">See the app</button>
              <div class="cluster">
                <button class="btn btn--secondary btn--compact" type="button">Partner with us</button>
                <button class="btn btn--link" type="button">How we pay you</button>
                <button class="btn btn--primary btn--compact" type="button" disabled>Disabled</button>
              </div>
            </section>

            <section class="card">
              <h2 class="eyebrow" style="margin-bottom:var(--space-4)">Inputs</h2>
              <form class="stack" style="--stack-gap:var(--space-4)" data-kit-form novalidate>
                <div class="field">
                  <label class="field__label" for="kit-name">Your name</label>
                  <input class="input" id="kit-name" name="name" autocomplete="given-name" placeholder="Ayesha" aria-describedby="kit-name-err">
                  <p class="field__error" id="kit-name-err">We’ll need a name to save your spot.</p>
                </div>
                <div class="field">
                  <label class="field__label" for="kit-area">Area</label>
                  <div class="select">
                    <select class="input" id="kit-area">
                      ${store.getState().areas.map((a) => html`<option>${a.name}</option>`)}
                    </select>
                  </div>
                </div>
                <button class="btn btn--primary" type="submit">Check validation</button>
              </form>
            </section>

            <section class="card stack" style="--stack-gap:var(--space-4)">
              <h2 class="eyebrow">Chips, segmented, toggle</h2>
              <div class="cluster" style="--cluster-gap:var(--space-2)">
                ${["Area", "Quiet now", "Roastery", "Pastries"].map((c, i) => html`<button type="button" class="chip" aria-pressed="${i === 1}" data-kit-chip>${c}</button>`)}
              </div>
              ${ui.segmented({ name: "plan", label: "Plan type", value: "fixed", options: [{ value: "fixed", label: "Fixed" }, { value: "custom", label: "Build your own" }] })}
              <div class="row">
                <div class="row__main"><div class="row__title">Renewal reminders</div><div class="row__meta">Two days before, on WhatsApp</div></div>
                <button type="button" class="toggle" role="switch" aria-checked="true" aria-label="Renewal reminders" data-kit-toggle></button>
              </div>
              <div class="cluster"><span class="badge">3 of 5 visits</span><span class="badge badge--accent">Your plan</span></div>
            </section>

            <section class="card">
              <div class="panel-title"><h2 class="eyebrow">Stepper · live builder price</h2></div>
              <div data-kit-builder>
                ${cafes.slice(0, 4).map((c) => html`
                  <div class="row">
                    <div class="row__main"><div class="row__title">${c.name}</div><div class="row__meta num">${fmt.rs(c.price)} at the counter</div></div>
                    ${ui.stepper({ id: c.id, value: store.getState().builder[c.id] || 0, max: store.getState().rules.maxCupsPerCafe, label: `Cups per month at ${c.name}` })}
                  </div>`)}
              </div>
              <hr class="divider" style="margin-block:var(--space-4)">
              <div style="display:flex;justify-content:space-between;align-items:baseline">
                <span class="t-small t-muted"><span class="num" data-kit-cups></span></span>
                <span class="t-h2 num" data-kit-price></span>
              </div>
              <p class="t-small t-faint num" data-kit-savings style="text-align:right"></p>
            </section>

            <section class="card">
              <div class="panel-title"><h2 class="eyebrow">Status · shared store</h2></div>
              <p class="t-small t-muted" style="margin-bottom:var(--space-3)">Change Kiln &amp; Bean here, then open the member app or café view. Open two windows to see it mirror across them.</p>
              <div class="cluster" style="--cluster-gap:var(--space-2);margin-bottom:var(--space-4)" role="group" aria-label="Set Kiln & Bean status">
                ${store.statuses.map((s) => html`<button type="button" class="chip" aria-pressed="${kiln.status === s}" data-kit-status="${s}">${fmt.statusLabel(s)}</button>`)}
              </div>
              ${cafes.map((c) => html`<div class="row"><div class="row__main"><div class="row__title">${c.name}</div><div class="row__meta">${store.select.area(c.area).name}</div></div>${ui.statusPill(c.id)}</div>`)}
            </section>

            <section class="card">
              <div class="panel-title"><h2 class="eyebrow">Bottom sheet, toast, check</h2></div>
              <div class="kit-demo-phone">
                <div style="padding:var(--space-5)" class="stack">
                  <button class="btn btn--secondary btn--block" type="button" data-sheet-open="kit-sheet">Open café sheet</button>
                  <button class="btn btn--ghost btn--block" type="button" data-kit-toast="Cup redeemed. 10 left.">Show toast</button>
                  <svg class="check-draw" data-kit-check viewBox="0 0 48 48" width="48" height="48" style="color:var(--accent);margin:var(--space-2) auto 0" aria-hidden="true"><circle cx="24" cy="24" r="22" pathLength="1"/><path d="M15 24.5l6 6 12-13" pathLength="1"/></svg>
                </div>
                <div class="sheet" id="kit-sheet" role="dialog" aria-modal="true" aria-labelledby="kit-sheet-title" aria-hidden="true">
                  <div class="sheet__scrim" data-sheet-close></div>
                  <div class="sheet__panel">
                    <div class="sheet__handle" aria-hidden="true"></div>
                    <div class="sheet__body stack" style="--stack-gap:var(--space-3)">
                      <h3 class="t-h2" id="kit-sheet-title">${kiln.name}</h3>
                      ${ui.statusPill("kiln")}
                      <p class="t-small t-muted">${kiln.blurb}</p>
                      <button class="btn btn--primary btn--block" type="button" data-sheet-close>Directions</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>`;

      // Builder
      const cupsEl = $("[data-kit-cups]", el), priceEl = $("[data-kit-price]", el), saveEl = $("[data-kit-savings]", el);
      const paintPrice = (animate) => {
        const p = store.select.customPrice();
        cupsEl.textContent = `${fmt.cups(p.cups)} a month`;
        if (animate) ui.animateNumber(priceEl, p.price, { format: fmt.rs }); else { priceEl.textContent = fmt.rs(p.price); priceEl.dataset.value = p.price; }
        saveEl.textContent = p.meetsMinimum ? `You save ${fmt.rs(p.savings)} vs paying at the counter` : `Add ${fmt.cups(p.cupsShort)} to reach the six-cup minimum`;
      };
      paintPrice(false);

      const onClick = (e) => {
        const step = e.target.closest("[data-step]");
        if (step) {
          const box = step.closest("[data-stepper]");
          const id = box.dataset.stepper;
          store.actions.setBuilderCups(id, (store.getState().builder[id] || 0) + Number(step.dataset.step));
          ui.setStepper(box, store.getState().builder[id] || 0);
        }
        const st = e.target.closest("[data-kit-status]");
        if (st) store.actions.setCafeStatus("kiln", st.dataset.kitStatus);
        const chip = e.target.closest("[data-kit-chip]");
        if (chip) chip.setAttribute("aria-pressed", chip.getAttribute("aria-pressed") !== "true");
        const tog = e.target.closest("[data-kit-toggle]");
        if (tog) tog.setAttribute("aria-checked", tog.getAttribute("aria-checked") !== "true");
        const seg = e.target.closest(".segmented__option");
        if (seg) ui.selectSegment(seg.parentElement, seg.dataset.value);
        const t = e.target.closest("[data-kit-toast]");
        if (t) {
          ui.toast(t.dataset.kitToast);
          const check = $("[data-kit-check]", el);
          const clone = check.cloneNode(true); check.replaceWith(clone); // replay draw
        }
      };
      el.addEventListener("click", onClick);

      const form = $("[data-kit-form]", el);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const field = $("#kit-name", el).closest(".field");
        const ok = $("#kit-name", el).value.trim().length > 0;
        field.dataset.invalid = String(!ok);
        $("#kit-name", el).setAttribute("aria-invalid", String(!ok));
        if (ok) ui.toast("Looks good.");
        else $("#kit-name", el).focus();
      });

      const offs = [
        store.on("builder", () => paintPrice(true)),
        store.on("cafe:status", ({ cafeId, status }) => {
          if (cafeId !== "kiln") return;
          $$("[data-kit-status]", el).forEach((b) => b.setAttribute("aria-pressed", b.dataset.kitStatus === status));
        }),
      ];
      return () => { el.removeEventListener("click", onClick); offs.forEach((f) => f()); };
    },
  });
})();
