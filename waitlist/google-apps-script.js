// Lahore Coffee Club waitlist: saves each number as a row in this Google Sheet.
//
// SETUP (or UPDATE an existing deployment):
// 1. In the Sheet: Extensions > Apps Script. Replace everything with this file. Save.
// 2. Row 1 headings on the "Waitlist" tab, in this order:
//      Time | WhatsApp | Page | Came from | Device | Consent
//    (Older rows have the browser string in column E. That's fine.)
// 3. Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
//    Updating the existing deployment keeps the same /exec URL, so the page needs no change.
//    (First time: Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone,
//    then paste the /exec URL into ENDPOINT in js/join.js.)
// 4. Keep the Sheet private: Share > General access > Restricted.
//
// To delete someone: find their row and delete it (right-click > Delete row). Do it within 7 days of the request.

const SHEET = "Waitlist"; // the tab name; row 1 holds the headings
const MAX_PER_MINUTE = 40; // a flood guard: real sign-ups never come this fast

function doPost(e) {
  // Anything odd gets a plain "bad"; bots learn nothing from the reply.
  let d;
  try {
    const raw = (e && e.postData && e.postData.contents) || "";
    if (raw.length > 4000) return out("bad");
    d = JSON.parse(raw || "{}");
  } catch (err) {
    return out("bad");
  }
  if (d.website) return out("ok"); // honeypot: pretend it worked

  const n = String(d.whatsapp || "");
  if (!/^\+923\d{9}$/.test(n)) return out("bad");
  const consent = /^privacy-\d{4}-\d{2}-\d{2}$/.test(String(d.consent || "")) ? d.consent : "";
  if (!consent) return out("bad"); // no agreement to the privacy notice, no row
  const device = d.device === "phone" || d.device === "computer" ? d.device : "";

  // flood guard
  const cache = CacheService.getScriptCache();
  const bucket = "rate:" + Math.floor(Date.now() / 60000);
  const count = Number(cache.get(bucket) || 0) + 1;
  cache.put(bucket, String(count), 120);
  if (count > MAX_PER_MINUTE) return out("busy");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return out("busy");
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SHEET) || ss.getSheets()[0]; // falls back to the first tab
    const last = sh.getLastRow();
    const nums = last > 1 ? sh.getRange(2, 2, last - 1, 1).getDisplayValues().flat() : [];
    if (nums.indexOf(n) >= 0) return out("dup"); // already on the list

    sh.appendRow([new Date(), "'" + n, safe(d.page), safe(d.ref), device, consent]);
    return out("ok");
  } finally {
    lock.releaseLock();
  }
}

// Plain-text cells only: trims length and stops anything being read as a formula (=, +, -, @).
function safe(v) {
  const s = String(v || "").slice(0, 300).replace(/[\u0000-\u001F\u007F]/g, " ");
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function out(s) {
  return ContentService.createTextOutput(s);
}

// Opening the /exec URL in a browser shows nothing useful.
function doGet() {
  return out("Lahore Coffee Club");
}
