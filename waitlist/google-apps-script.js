// Lahore Coffee Club waitlist: saves each number as a row in this Google Sheet.
// Paste into Extensions > Apps Script, then Deploy > New deployment > Web app
// (Execute as: Me, Who has access: Anyone). Copy the /exec URL into ENDPOINT in waitlist/index.html.

const SHEET = "Waitlist"; // the tab name; row 1 holds the headings

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e.postData && e.postData.contents) || "{}");
    const n = String(d.whatsapp || "");
    if (!/^\+923\d{9}$/.test(n)) return out("bad");

    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(SHEET) || ss.getSheets()[0]; // falls back to the first tab
    const last = sh.getLastRow();
    const nums = last > 1 ? sh.getRange(2, 2, last - 1, 1).getDisplayValues().flat() : [];
    if (nums.includes(n)) return out("dup"); // already on the list

    sh.appendRow([new Date(), "'" + n, d.page || "", d.ref || "", d.ua || ""]);
    return out("ok");
  } finally {
    lock.releaseLock();
  }
}

function out(s) {
  return ContentService.createTextOutput(s);
}
