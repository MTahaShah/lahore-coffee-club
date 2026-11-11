/* =====================================================================
   Lahore Coffee Club — sync.js
   Live sync between devices in the same demo "room".

     #/cafe?room=4821        café tablet
     #/app/pass?room=4821    member phone

   Two transports, both carrying the same small messages:
     1. BroadcastChannel  windows on the same computer (always on)
     2. Supabase Realtime Broadcast  other devices, over the internet.
        Broadcast only: no tables, nothing stored. If it can't connect
        the app carries on with (1) and says “Offline, this device only”.

   Messages: { v, id, from, type, data }. `from` is this window's sender
   id, so a window ignores its own messages; `id` de-duplicates a message
   that arrives over both transports. Incoming data goes through
   store.applyRemote(), which never re-sends, so there are no echo loops.

   What travels: café status, and ledger entries (redeem, purchase, expire,
   gift, reward, hold, release) with the plan header of any member whose
   plan changed. Entries are append-only with stable ids, so applying one
   twice is harmless. Pickup orders travel whole (`pickup`); a status only
   moves forward, so a late or repeated message can't undo one.

   Join handshake: a window that joins says “hello”. A café window answers
   with statuses plus this session’s ledger entries and plan changes; any
   other window that has live entries answers with those (newest plan wins).

   Approved exception to “no backend” (see CLAUDE.md).
   // BACKEND: replace Broadcast with Supabase tables + Postgres Changes:
   //   cafe_status (cafe_id, status, updated_at), ledger (insert-only:
   //   purchase/redeem/gift/expire/hold/release), subscriptions (member_id,
   //   plan, cycle, renews_at), orders (pickup orders and their status).
   //   Balances stay derived from the ledger. Rooms go away.
   ===================================================================== */
(function () {
  "use strict";
  const LCC = window.LCC;
  const { store, ui } = LCC;
  const { html } = ui;

  // Publishable key: meant for browser code. Never put a secret key here.
  const SUPABASE_URL = "https://nfgqswdtaemhpmnrries.supabase.co";
  const SUPABASE_KEY = "sb_publishable_iZ_OxDTfGnMoQlWuPswSVA_iuizC6qZ";
  // Where a paired phone goes. Always the deployed site, so pairing works
  // even when the café window runs from this computer.
  const LIVE_URL = "https://lcc-omega.vercel.app/";
  const CONNECT_TIMEOUT_MS = 8000;
  const ROOM_RE = /^[A-Za-z0-9-]{1,32}$/;

  const sender = Math.random().toString(36).slice(2, 10);
  const seen = new Set(); // message ids already applied
  let status = "connecting"; // connecting | online | offline
  let channel = null;      // Supabase channel
  let bc = null;           // BroadcastChannel
  let timeout = null;

  /* -------------------------------------------------------------------
     Room: from the URL, else the last one this browser used, else new
     ------------------------------------------------------------------- */
  function roomFromHash() {
    const q = location.hash.split("?")[1];
    const r = q ? new URLSearchParams(q).get("room") : null;
    return r && ROOM_RE.test(r) ? r : null;
  }
  function remembered() {
    try { const r = localStorage.getItem("lcc-room"); return r && ROOM_RE.test(r) ? r : null; } catch (_) { return null; }
  }
  const room = roomFromHash() || remembered() || String(1000 + Math.floor(Math.random() * 9000));
  try { localStorage.setItem("lcc-room", room); } catch (_) { /* fine without it */ }

  /** Any in-app hash, with this room attached. */
  function withRoom(hash) {
    const [path, q] = String(hash || "#/").split("?");
    const params = new URLSearchParams(q || "");
    params.set("room", room);
    return `${path}?${params}`;
  }
  // Links inside the app drop the query; put the room back without a new history entry
  function ensureRoomInUrl() {
    if (roomFromHash() === room) return;
    history.replaceState(null, "", withRoom(location.hash || "#/"));
  }
  ensureRoomInUrl();
  window.addEventListener("hashchange", ensureRoomInUrl);

  /** Link a phone opens to join this room on the member pass (always the live site). */
  function pairUrl() {
    return `${LIVE_URL}${withRoom("#/app/pass")}`;
  }

  /* -------------------------------------------------------------------
     Sending and receiving
     ------------------------------------------------------------------- */
  const msgId = () => `${sender}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  function post(type, data) {
    const msg = { v: 1, id: msgId(), from: sender, type, data };
    seen.add(msg.id);
    if (bc) { try { bc.postMessage(msg); } catch (_) { /* ignore */ } }
    if (channel && status === "online") {
      channel.send({ type: "broadcast", event: "lcc", payload: msg }).catch?.(() => {});
    }
  }

  function receive(msg) {
    if (!msg || msg.v !== 1 || msg.from === sender || seen.has(msg.id)) return;
    seen.add(msg.id);
    if (seen.size > 1000) seen.delete(seen.values().next().value);
    if (msg.type === "hello") return answerHello();
    store.applyRemote(msg.type, msg.data);
  }

  const isCafeDevice = () => LCC.router?.parse().name === "cafe";
  function answerHello() {
    if (isCafeDevice()) post("snapshot", store.roomSnapshot({ statuses: true }));
    else if (store.hasLiveData()) post("snapshot", store.roomSnapshot({ statuses: false }));
  }

  // Everything the store wants shared goes out on both transports
  store.addTransport((type, data) => post(type, data));

  /* -------------------------------------------------------------------
     Transport 1: same computer
     ------------------------------------------------------------------- */
  try {
    if ("BroadcastChannel" in window) {
      bc = new BroadcastChannel(`lahore-coffee-club:${room}`);
      bc.onmessage = ({ data }) => receive(data);
    }
  } catch (_) { bc = null; }

  /* -------------------------------------------------------------------
     Transport 2: Supabase Realtime Broadcast
     ------------------------------------------------------------------- */
  function setStatus(next) {
    if (status === next) return;
    status = next;
    paintPills();
    store.emit("sync", { status, room }, { remote: true });
  }

  function connect() {
    const lib = window.supabase;
    if (!lib || typeof lib.createClient !== "function") { setStatus("offline"); return; }
    try {
      const client = lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      // BACKEND: a private channel with RLS on realtime.messages, once members sign in
      channel = client.channel(`lcc-room-${room}`, { config: { broadcast: { self: false, ack: false } } });
      channel.on("broadcast", { event: "lcc" }, ({ payload }) => receive(payload));
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED") {
          clearTimeout(timeout);
          setStatus("online");
          post("hello", {}); // so the café (or a newer member copy) fills this device in
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("offline"); // supabase-js keeps retrying; SUBSCRIBED flips it back
        }
      });
      timeout = setTimeout(() => { if (status !== "online") setStatus("offline"); }, CONNECT_TIMEOUT_MS);
    } catch (err) {
      console.warn("[LCC] live sync unavailable; this device only", err);
      setStatus("offline");
    }
  }

  window.addEventListener("offline", () => setStatus("offline"));

  // Say hello on this computer straight away; the network hello follows on connect
  post("hello", {});
  connect();

  /* -------------------------------------------------------------------
     Quiet indicator: <span data-sync-pill> updates itself
     ------------------------------------------------------------------- */
  const LABELS = { connecting: "Connecting…", online: "Connected", offline: "Offline, this device only" };
  function pill() {
    return html`<span class="sync-pill" data-sync-pill data-state="${status}" role="status" title="Room ${room}">
      <span class="sync-pill__dot" aria-hidden="true"></span><span data-sync-label>${LABELS[status]}</span>
    </span>`;
  }
  function paintPills() {
    ui.$$("[data-sync-pill]").forEach((el) => {
      el.dataset.state = status;
      ui.$("[data-sync-label]", el).textContent = LABELS[status];
    });
  }

  LCC.sync = { room, sender, withRoom, pairUrl, pill, liveUrl: LIVE_URL, status: () => status };
})();
