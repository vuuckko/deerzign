/**
 * Deerzign — brief.html → Google Sheet
 * ------------------------------------------------------------------
 * Receives one submission as JSON, appends a row to the sheet and, if
 * files came with it, drops them into a per-submission Drive folder and
 * writes the links into the matching columns.
 *
 * Also serves the twice-daily report/CRM automation (automation/PLAYBOOK.md):
 *   GET  ?action=unprocessed                    -> rows not yet marked "Obrađeno"
 *   POST {action:"markProcessed", rows:[...]}   -> stamps those rows as done
 *   POST {action:"upsertCrm", row:{...}}        -> appends a row to the "CRM" tab
 *   POST {action:"appendReport", client:{...}}  -> appends a section to the running Google Doc
 *   GET  ?action=unprocessedMetaLeads                  -> new rows from "Leads Meta Ads"
 *   POST {action:"markMetaLeadsProcessed", ids:[...]}  -> marks those leads as done
 *   GET  ?action=testWonDeal&email=&phone=&value=&testCode=  -> diagnostic only,
 *        see onCrmValueEdit(e) below for the real (non-HTTP) won-deal mechanism
 *
 * SETUP
 *  1. Open the sheet → Extensions → Apps Script.
 *  2. Paste this file over Code.gs and save.
 *  3. Deploy → New deployment → type "Web app"
 *       Execute as:        Me
 *       Who has access:    Anyone
 *     Authorise when asked (the warning screen is normal for your own script:
 *     Advanced → Go to project).
 *  4. Copy the /exec URL and paste it into ENDPOINT at the top of the
 *     <script> block in brief.html.
 *
 * After changing this file, deploy again (Deploy → Manage deployments →
 * edit → New version), otherwise the old code keeps running.
 */

var SHEET_ID    = '1jPb539ikjMtj8QligQkNghhyl3imIBJN3RbX-mqIl8Y';
var SHEET_NAME  = 'Upiti';                 // created if missing
var DRIVE_ROOT  = 'Deerzign — brief upload';
var NOTIFY      = '';                      // e.g. 'team@deerzign.com' — leave empty for no email

var META_COLS  = ['Vreme', 'Jezik', 'Stranica', 'Izvor'];
/* always-tracked columns for the automation pipeline (see automation/PLAYBOOK.md) */
var EXTRA_COLS = ['Obrađeno', 'Folder materijala'];

/* CRM tab (same spreadsheet, second sheet) and the single running report doc —
   both live entirely in Google's own apps, so there is nothing local to lock
   or lose. See automation/PLAYBOOK.md for how the automation calls these. */
var CRM_SHEET_NAME = 'CRM';
var CRM_HEADER = [
  'Datum', 'Ime i prezime', 'Firma', 'Telefon', 'Email', 'Šta je potrebno',
  'Preporučeni paket', 'Okvirna cena', 'Rok', 'Status', 'Sledeći korak',
  'Link ka izveštaju', 'Link ka materijalima', 'Napomena',
  'Stvarna vrednost (€)', 'Meta signal poslat',
];
var DOC_NAME = 'Deerzign — Izveštaj o klijentima';

/* the exact Status text that means "real, paying client" — set by hand in
   the CRM sheet, never by the automation. Matched case-insensitively so
   "Dobijen posao" / "dobijen posao" both work, but the words must be exact. */
var CRM_WON_STATUS = 'Dobijen posao';

/* people who filled in at least name+contact but left before submitting —
   sent via navigator.sendBeacon() on pagehide, so no response is ever read.
   Separate tab, on purpose: these never had the consent checkbox in front
   of them, so they don't feed the CRM/report automation like real
   submissions do — this is just a visibility list for manual follow-up. */
var PARTIAL_SHEET_NAME = 'Nezavršeno';

/* Meta's own native Lead Ads → Google Sheets sync writes here directly —
   we never write to this tab, only read it. Its header row is managed by
   Meta (columns can shift if the form is edited), so lookups are always
   by header NAME, never by fixed column letter. Processed-state is kept
   in a separate tab we fully own, rather than added to Meta's tab, so a
   future re-sync can never clobber our tracking. */
var META_LEADS_SHEET_NAME = 'Leads Meta Ads';
var META_LEADS_TRACK_SHEET_NAME = 'Meta Leads — obrađeno';

/* Meta Conversions API — server-side "Lead" signal for every real
   submission, so ad optimisation doesn't depend on the browser Pixel
   surviving ad blockers/iOS tracking limits. Access token lives in
   Script Properties (Project Settings → Script Properties), never in
   this file — see automation/PLAYBOOK.md for the one-time setup note. */
var META_PIXEL_ID = '1056070890490241';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.action === 'markProcessed') {
      return json_(markProcessed_(body.rows || []));
    }
    if (body.action === 'upsertCrm') {
      return json_(upsertCrm_(body.row || {}));
    }
    if (body.action === 'appendReport') {
      return json_(appendReport_(body.client || {}));
    }
    if (body.action === 'partialLead') {
      return json_(savePartialLead_(body.fields || [], body.meta || {}));
    }
    if (body.action === 'pruneColumns') {
      return json_(pruneColumns_(body.columns || []));
    }
    if (body.action === 'markMetaLeadsProcessed') {
      return json_(markMetaLeadsProcessed_(body.ids || []));
    }

    var fields = body.fields || [];
    var meta = body.meta || {};
    var incoming = body.files || [];

    var sheet = getSheet_();
    var uploads = saveFiles_(incoming, fields);

    // one map of column label -> value for this submission
    var values = {};
    fields.forEach(function (f) { values[f.label] = f.value || ''; });
    Object.keys(uploads).forEach(function (label) { values[label] = uploads[label]; });

    values['Vreme']     = Utilities.formatDate(new Date(), 'Europe/Belgrade', 'dd.MM.yyyy HH:mm');
    values['Jezik']     = meta.jezik || '';
    values['Stranica']  = meta.stranica || '';
    values['Izvor']     = meta.izvor || '';

    var header = syncHeader_(sheet, META_COLS.concat(EXTRA_COLS).concat(fields.map(function (f) { return f.label; })));
    var row = header.map(function (h) { return values[h] !== undefined ? values[h] : ''; });
    sheet.appendRow(row);

    if (NOTIFY) notify_(values, fields);

    /* best-effort — a Meta hiccup must never fail the actual submission */
    try { sendMetaLead_(values, meta, body.eventId || ''); } catch (capiErr) { console.error(capiErr); }

    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** GET with no params is a human checking the deployment is alive;
    ?action=unprocessed feeds the twice-daily automation (see automation/PLAYBOOK.md) */
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'unprocessed') return json_(getUnprocessed_());
  if (action === 'unprocessedMetaLeads') return json_(getUnprocessedMetaLeads_());
  if (action === 'testCapi') return json_(testCapi_(e.parameter));
  if (action === 'testWonDeal') return json_(testWonDeal_(e.parameter));
  return json_({ ok: true, service: 'deerzign-brief' });
}

function getUnprocessed_() {
  var sheet = getSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, count: 0, rows: [] };

  var header = data[0];
  var idxObradjeno = header.indexOf('Obrađeno');
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var line = data[r];
    if (line.join('') === '') continue;               // blank trailing row
    if (idxObradjeno > -1 && line[idxObradjeno]) continue; // already handled
    var obj = {};
    header.forEach(function (h, i) { obj[h] = line[i]; });
    obj._row = r + 1; // 1-based sheet row, for markProcessed
    rows.push(obj);
  }
  return { ok: true, count: rows.length, rows: rows };
}

function markProcessed_(rowNumbers) {
  var sheet = getSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = header.indexOf('Obrađeno') + 1; // 1-based column index
  if (col < 1) return { ok: false, error: 'Obrađeno column missing' };
  var stamp = Utilities.formatDate(new Date(), 'Europe/Belgrade', 'dd.MM.yyyy HH:mm');
  rowNumbers.forEach(function (r) { sheet.getRange(r, col).setValue(stamp); });
  return { ok: true, marked: rowNumbers.length };
}

function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

/**
 * Makes sure every label has a column, keeping the ones already there.
 * New questions get appended on the right rather than shifting old data.
 */
function syncHeader_(sheet, labels) {
  var width = sheet.getLastColumn();
  var header = width ? sheet.getRange(1, 1, 1, width).getValues()[0] : [];
  header = header.filter(function (h) { return h !== ''; });

  var missing = labels.filter(function (l) { return header.indexOf(l) === -1; });
  if (missing.length || header.length === 0) {
    header = header.concat(missing);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.getRange(1, 1, 1, header.length)
      .setFontWeight('bold')
      .setBackground('#14150F')
      .setFontColor('#F4F1E9');
    sheet.setFrozenRows(1);
  }
  return header;
}

/**
 * Writes the uploads into Drive and returns { columnLabel: "name — url" }.
 * Files are grouped per submission so a folder maps to one row.
 */
function saveFiles_(incoming, fields) {
  if (!incoming.length) return {};

  var company = '';
  fields.forEach(function (f) { if (f.label === 'Naziv firme') company = f.value; });

  var root = folder_(DriveApp.getRootFolder(), DRIVE_ROOT);
  var stamp = Utilities.formatDate(new Date(), 'Europe/Belgrade', 'yyyy-MM-dd HH.mm');
  var box = root.createFolder((company || 'Bez naziva') + ' — ' + stamp);

  // field key in brief.html -> the sheet column it belongs to
  var COLS = { logo: 'Logo', fotografije: 'Fotografije' };

  var out = {};
  incoming.forEach(function (f) {
    var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.type, f.name);
    var saved = box.createFile(blob);
    var col = COLS[f.field] || f.field;
    var link = f.name + ' — ' + saved.getUrl();
    out[col] = out[col] ? out[col] + '\n' + link : link;
  });

  out['Folder materijala'] = box.getUrl();
  return out;
}

function folder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function notify_(values, fields) {
  var lines = fields.map(function (f) {
    return f.label + ': ' + (values[f.label] || '—');
  });
  MailApp.sendEmail({
    to: NOTIFY,
    subject: 'Novi brif — ' + (values['Naziv firme'] || 'nepoznata firma'),
    body: lines.join('\n') + '\n\n' + (values['Folder materijala'] || '')
  });
}

/**
 * CRM tab — same spreadsheet as "Upiti", second sheet. Created with a
 * header row on first use, then just appended to (one row per client).
 */
function getCrmSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(CRM_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CRM_SHEET_NAME);
    sheet.getRange(1, 1, 1, CRM_HEADER.length).setValues([CRM_HEADER]);
    sheet.getRange(1, 1, 1, CRM_HEADER.length)
      .setFontWeight('bold')
      .setBackground('#14150F')
      .setFontColor('#F4F1E9');
    sheet.setFrozenRows(1);
  } else {
    ensureCrmHeader_(sheet);
  }
  return sheet;
}

/**
 * Extends an already-live CRM header with any CRM_HEADER columns it
 * doesn't have yet (e.g. the won-deal columns added later), always on the
 * right so existing data and column order never shift.
 */
function ensureCrmHeader_(sheet) {
  var width = sheet.getLastColumn();
  var header = width ? sheet.getRange(1, 1, 1, width).getValues()[0] : [];
  if (header.length >= CRM_HEADER.length) return;
  var extra = CRM_HEADER.slice(header.length);
  var startCol = header.length + 1;
  sheet.getRange(1, startCol, 1, extra.length).setValues([extra]);
  sheet.getRange(1, startCol, 1, extra.length)
    .setFontWeight('bold')
    .setBackground('#14150F')
    .setFontColor('#F4F1E9');
}

function upsertCrm_(row) {
  var sheet = getCrmSheet_();
  sheet.appendRow(CRM_HEADER.map(function (h) { return row[h] !== undefined ? row[h] : ''; }));
  return { ok: true };
}

/**
 * The single running Google Doc report. Found by name in the same Drive
 * folder as the brief uploads (created there the first time it's needed),
 * then just appended to — one section per client, never regenerated.
 */
function getOrCreateDoc_() {
  var root = folder_(DriveApp.getRootFolder(), DRIVE_ROOT);
  var it = root.getFilesByName(DOC_NAME);
  if (it.hasNext()) return DocumentApp.openById(it.next().getId());

  var doc = DocumentApp.create(DOC_NAME);
  doc.getBody().appendParagraph(DOC_NAME).setHeading(DocumentApp.ParagraphHeading.TITLE);
  doc.saveAndClose();

  var file = DriveApp.getFileById(doc.getId());
  root.addFile(file);
  DriveApp.getRootFolder().removeFile(file); // move out of Drive root, into DRIVE_ROOT only
  return DocumentApp.openById(doc.getId());
}

function appendReport_(c) {
  var doc = getOrCreateDoc_();
  var body = doc.getBody();

  body.appendPageBreak();
  body.appendParagraph(c.naziv || (c.ime || 'Klijent')).setHeading(DocumentApp.ParagraphHeading.HEADING1);

  var contact = [
    ['Ime i prezime', c.ime], ['Firma', c.firma], ['Telefon', c.telefon], ['Email', c.email],
    ['Šta je potrebno', c.sta_treba], ['Preporučeni paket', c.paket],
    ['Okvirna cena', c.cena], ['Rok', c.rok],
  ].map(function (kv) { return kv[0] + ': ' + (kv[1] || '—'); }).join('   ·   ');
  body.appendParagraph(contact).setItalic(true).setForegroundColor('#756B5E');

  if (c.folder) {
    body.appendParagraph('Folder materijala: ' + c.folder).setForegroundColor('#263D32');
  }

  (c.items || []).forEach(function (item) {
    body.appendParagraph(item[0]).setBold(true).setSpacingBefore(10);
    body.appendParagraph(item[1]);
  });

  doc.saveAndClose();
  return { ok: true, docUrl: 'https://docs.google.com/document/d/' + doc.getId() + '/edit' };
}

/**
 * TEMPORARY — run this once from the editor's function picker (it's a
 * public function, unlike the _-suffixed ones, so it actually shows up
 * there) to trigger the Google Docs permission prompt. Safe to delete
 * afterwards; it does not run as part of doGet/doPost.
 */
function testDocs() {
  var doc = getOrCreateDoc_();
  Logger.log(doc.getUrl());
}

/**
 * One-off cleanup: removes named columns (by exact header text) from
 * "Upiti", so old questions that brief.html no longer asks stop cluttering
 * the sheet. Deletes right-to-left so earlier indices stay valid mid-loop.
 * Column DATA in those cells is gone once deleted — Sheets version history
 * (File → Version history) is the only way back.
 */
function pruneColumns_(names) {
  var sheet = getSheet_();
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var indices = names
    .map(function (n) { return header.indexOf(n) + 1; }) // 1-based column index
    .filter(function (i) { return i > 0; })
    .sort(function (a, b) { return b - a; }); // right-to-left
  indices.forEach(function (i) { sheet.deleteColumn(i); });
  return { ok: true, deleted: indices.length, requested: names.length };
}

/**
 * "Nezavršeno" tab — same self-expanding header pattern as "Upiti"
 * (syncHeader_), so it automatically follows brief.html whenever a
 * question changes. One row per abandoned attempt; never overwritten.
 */
function getPartialSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(PARTIAL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PARTIAL_SHEET_NAME);
  }
  return sheet;
}

function savePartialLead_(fields, meta) {
  if (!fields.length) return { ok: false, error: 'no fields' };
  var sheet = getPartialSheet_();

  var values = {};
  fields.forEach(function (f) { values[f.label] = f.value || ''; });
  values['Vreme']    = Utilities.formatDate(new Date(), 'Europe/Belgrade', 'dd.MM.yyyy HH:mm');
  values['Jezik']    = meta.jezik || '';
  values['Stranica'] = meta.stranica || '';
  values['Izvor']    = meta.izvor || '';

  var header = syncHeader_(sheet, META_COLS.concat(fields.map(function (f) { return f.label; })));
  var row = header.map(function (h) { return values[h] !== undefined ? values[h] : ''; });
  sheet.appendRow(row);
  return { ok: true };
}

/**
 * Meta Conversions API — mirrors the browser Pixel's Lead event, sent
 * server-side so it lands even when the browser event is blocked/dropped.
 * `eventId` must match the id the Pixel used on hvala.html for the same
 * submission, so Meta de-duplicates the two into a single conversion.
 */
function sha256Hex_(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/* "060 123 4567" / "+381 60 123 4567" / "0641234567" -> "381601234567" */
function normalizePhone_(raw) {
  var digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.indexOf('381') === 0) return digits;
  if (digits.indexOf('0') === 0) return '381' + digits.slice(1);
  return digits;
}

/* budget range (or a pricing-page package) -> a rough EUR value, so Meta
   optimises toward higher-value leads, not just any submitted form */
function estimateLeadValue_(values) {
  var paket = values['Paket sa cenovnika'];
  if (paket === 'Landing') return 399;
  if (paket === 'Poslovni') return 649;
  if (paket === 'Signature') return 1500;
  /* pre-2026-08-31 pricing-page package names, kept for historical rows */
  if (paket === 'Osnovni' || paket === 'Starter') return 399;
  if (paket === 'Landmark') return 649;

  var budzet = values['Budžet'] || '';
  if (budzet.indexOf('do 500') === 0) return 399;
  if (budzet.indexOf('do 300') === 0) return 399;
  if (budzet.indexOf('300') === 0) return 399;
  if (budzet.indexOf('500') === 0) return 649;
  if (budzet.indexOf('1.000') === 0) return 1500;
  if (budzet.indexOf('2.500') === 0) return 3000;
  if (budzet.indexOf('preko 5.000') === 0) return 5000;
  return 0; // unknown — still send the Lead, just with no value attached
}

function getMetaCapiToken_() {
  return PropertiesService.getScriptProperties().getProperty('META_CAPI_TOKEN') || '';
}

function sendMetaLead_(values, meta, eventId) {
  var token = getMetaCapiToken_();
  if (!token) return { skipped: 'no token configured' };

  var email = (values['Email'] || '').trim().toLowerCase();
  var phone = normalizePhone_(values['Telefon']);
  if (!email && !phone) return { skipped: 'no email or phone to match' };

  var userData = {};
  if (email) userData.em = [sha256Hex_(email)];
  if (phone) userData.ph = [sha256Hex_(phone)];

  var value = estimateLeadValue_(values);
  var customData = { currency: 'EUR' };
  if (value) customData.value = value;

  var event = {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: meta.stranica || '',
    user_data: userData,
    custom_data: customData,
  };
  if (eventId) event.event_id = String(eventId);

  var url = 'https://graph.facebook.com/v19.0/' + META_PIXEL_ID + '/events?access_token=' + encodeURIComponent(token);
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ data: [event] }),
    muteHttpExceptions: true,
  });
  var code = resp.getResponseCode();
  var result = { code: code, body: resp.getContentText(), sentValue: value };
  if (code < 200 || code >= 300) console.error('Meta CAPI ' + code + ': ' + result.body);
  return result;
}

/**
 * TEMPORARY diagnostic — GET ?action=testCapi&email=...&phone=... sends one
 * real test event and returns Meta's actual response so we can confirm the
 * token/pixel work, without waiting on Events Manager. Safe to delete once
 * confirmed; doesn't touch the sheet.
 */
function testCapi_(params) {
  return sendMetaLead_(
    { Email: params.email || 'test@example.com', Telefon: params.phone || '', Budžet: '1.000–2.500 €' },
    { stranica: 'https://www.deerzign.com/brief.html' },
    'dz-diagnostic-' + Date.now()
  );
}

/** TEMPORARY — run this once from the editor's function picker (public,
    unlike testCapi_) to trigger the "external request" permission prompt
    that UrlFetchApp needs. Safe to delete afterwards. */
function grantExternalRequestPermission() {
  Logger.log(JSON.stringify(testCapi_({})));
}

/**
 * Won-deal feedback loop — teaches Meta's algorithm which leads turn into
 * real, paying clients, not just which ones fill in a form. sendMetaLead_
 * above fires once, at submission time, with an ESTIMATED value guessed
 * from the budget answer; this fires later, by hand, with the ACTUAL price
 * of the deal that closed. Sent as a "Purchase" event — that's the event
 * type Meta's value-based bidding/lookalike tools are built around, even
 * though nothing is being "purchased" online; mapping "closed-won" to it
 * is the standard way lead-gen advertisers unlock that tooling.
 * No event_id/dedup here on purpose — this is a distinct, later moment in
 * the funnel from the original Lead event, not the same conversion twice.
 */
function sendWonDealToMeta_(rowValues, testEventCode) {
  var token = getMetaCapiToken_();
  if (!token) return { skipped: 'no token configured' };

  var email = String(rowValues['Email'] || '').trim().toLowerCase();
  var phone = normalizePhone_(rowValues['Telefon']);
  if (!email && !phone) return { skipped: 'no email or phone to match' };

  var userData = {};
  if (email) userData.em = [sha256Hex_(email)];
  if (phone) userData.ph = [sha256Hex_(phone)];

  var value = Number(rowValues['Stvarna vrednost (€)']) || 0;
  var customData = { currency: 'EUR' };
  if (value) customData.value = value;

  var event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'system_generated',
    user_data: userData,
    custom_data: customData,
    event_id: 'dz-won-' + Utilities.getUuid(),
  };

  var payload = { data: [event] };
  if (testEventCode) payload.test_event_code = testEventCode;

  var url = 'https://graph.facebook.com/v19.0/' + META_PIXEL_ID + '/events?access_token=' + encodeURIComponent(token);
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = resp.getResponseCode();
  var result = { code: code, body: resp.getContentText(), sentValue: value };
  if (code < 200 || code >= 300) console.error('Meta CAPI Purchase ' + code + ': ' + result.body);
  return result;
}

/**
 * INSTALLABLE trigger — wire this up ONCE by hand, it is not automatic
 * from a redeploy: Apps Script editor → clock icon "Triggers" (left
 * sidebar) → Add Trigger → function "onCrmValueEdit" → event source
 * "From spreadsheet" → event type "On edit" → Save. A plain onEdit(e)
 * (no installable trigger) runs in a restricted mode that isn't allowed
 * to call UrlFetchApp, which is exactly what this needs to reach Meta —
 * hence the installable version instead.
 *
 * Fires on every edit anywhere in the spreadsheet; only acts when the
 * edited row is in the CRM tab, its Status is CRM_WON_STATUS, a value is
 * filled in, and no signal has been sent yet for that row — so re-saving
 * an already-reported row, or editing any other column, is a no-op.
 */
function onCrmValueEdit(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() !== CRM_SHEET_NAME) return;

    var lastCol = sheet.getLastColumn();
    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var statusCol = header.indexOf('Status');
    var valueCol = header.indexOf('Stvarna vrednost (€)');
    var sentCol = header.indexOf('Meta signal poslat');
    if (statusCol < 0 || valueCol < 0 || sentCol < 0) return;

    var firstRow = Math.max(range.getRow(), 2); // never the header row
    var lastRow = range.getRow() + range.getNumRows() - 1;

    for (var row = firstRow; row <= lastRow; row++) {
      var line = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
      if (line[sentCol]) continue; // already reported, skip silently

      var status = String(line[statusCol] || '').trim().toLowerCase();
      if (status !== CRM_WON_STATUS.toLowerCase()) continue;

      var rowValues = {};
      header.forEach(function (h, i) { rowValues[h] = line[i]; });

      var result = sendWonDealToMeta_(rowValues);
      if (result && result.code >= 200 && result.code < 300) {
        var stamp = Utilities.formatDate(new Date(), 'Europe/Belgrade', 'dd.MM.yyyy HH:mm');
        sheet.getRange(row, sentCol + 1).setValue(stamp);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

/**
 * TEMPORARY diagnostic — GET ?action=testWonDeal[&email=&phone=&value=&testCode=]
 * sends one Purchase event without touching the CRM sheet at all. Pass the
 * Test Event Code shown in Meta Events Manager → Test Events as `testCode`
 * so it shows up there for verification WITHOUT counting toward real ad
 * optimisation — leave it off and it sends for real, same as testCapi.
 */
function testWonDeal_(params) {
  return sendWonDealToMeta_(
    {
      Email: params.email || 'test@example.com',
      Telefon: params.phone || '',
      'Stvarna vrednost (€)': params.value || 849,
    },
    params.testCode || ''
  );
}

/**
 * "Leads Meta Ads" — read-only, Meta-managed. Looks columns up by header
 * name (never a fixed letter), so it survives Meta reordering/adding
 * columns if the form is edited later.
 */
function getMetaLeadsSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(META_LEADS_SHEET_NAME);
  if (!sheet) throw new Error('Sheet "' + META_LEADS_SHEET_NAME + '" not found');
  return sheet;
}

function getMetaLeadsTrackSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(META_LEADS_TRACK_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(META_LEADS_TRACK_SHEET_NAME);
    sheet.getRange(1, 1, 1, 2).setValues([['Lead ID', 'Obrađeno']]);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#14150F').setFontColor('#F4F1E9');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getProcessedMetaLeadIds_() {
  var sheet = getMetaLeadsTrackSheet_();
  if (sheet.getLastRow() < 2) return {};
  var ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var set = {};
  ids.forEach(function (r) { if (r[0]) set[String(r[0])] = true; });
  return set;
}

function markMetaLeadsProcessed_(ids) {
  if (!ids.length) return { ok: true, marked: 0 };
  var sheet = getMetaLeadsTrackSheet_();
  var stamp = Utilities.formatDate(new Date(), 'Europe/Belgrade', 'dd.MM.yyyy HH:mm');
  var rows = ids.map(function (id) { return [String(id), stamp]; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 2).setValues(rows);
  return { ok: true, marked: rows.length };
}

/**
 * Returns new (unprocessed, non-test) leads from "Leads Meta Ads", each
 * mapped to a flat {label: value} shape similar in spirit to the "Upiti"
 * rows, but only with what a 2-question Instant Form actually collects —
 * no "Čime se bavite" free text, no "Šta vam je potrebno". See
 * automation/PLAYBOOK.md for how these get analysed differently.
 * Meta's own dummy "<test lead: ...>" rows (sent via their form tester)
 * are auto-marked processed here and never returned — they're not a real
 * lead to act on, but they must stop showing up as "new" every run.
 */
function getUnprocessedMetaLeads_() {
  var sheet = getMetaLeadsSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { ok: true, count: 0, rows: [] };

  var header = data[0];
  var col = function (name) { return header.indexOf(name); };
  var idCol = col('id'), nameCol = col('full_name'), phoneCol = col('phone_number'),
      emailCol = col('email'), budgetCol = col('koji_je_vaš_okvirni_budžet_za_sajt?'),
      whenCol = col('kada_želite_da_počnete_sa_projektom?'),
      campCol = col('campaign_name'), timeCol = col('created_time');

  var processed = getProcessedMetaLeadIds_();
  var toAutoMark = [];
  var rows = [];

  for (var r = 1; r < data.length; r++) {
    var line = data[r];
    var id = idCol > -1 ? String(line[idCol] || '') : '';
    if (!id || processed[id]) continue;

    var name = nameCol > -1 ? String(line[nameCol] || '') : '';
    var phone = phoneCol > -1 ? String(line[phoneCol] || '').replace(/^p:/, '') : '';
    var isDummy = /dummy data/i.test(name) || /dummy data/i.test(phone);
    if (isDummy) { toAutoMark.push(id); continue; }

    rows.push({
      _leadId: id,
      'Ime i prezime': name,
      'Telefon': phone,
      'Email': emailCol > -1 ? String(line[emailCol] || '') : '',
      'Budžet (Meta forma)': budgetCol > -1 ? String(line[budgetCol] || '') : '',
      'Rok (Meta forma)': whenCol > -1 ? String(line[whenCol] || '') : '',
      'Kampanja': campCol > -1 ? String(line[campCol] || '') : '',
      'Vreme': timeCol > -1 ? String(line[timeCol] || '') : '',
    });
  }

  if (toAutoMark.length) markMetaLeadsProcessed_(toAutoMark);
  return { ok: true, count: rows.length, rows: rows };
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
