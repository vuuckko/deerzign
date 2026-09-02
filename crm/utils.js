/* Deerzign CRM — zajednički sloj
 * Sve stranice dele ovo: Supabase klijent, escape, formatiranje, toast.
 * Namerno bez build koraka i bez modula — jedan globalni DZ objekat,
 * isti pristup kao InvKlub portal.
 */
window.DZ = (function () {
  'use strict';

  var CFG = window.CRM_CONFIG || {};
  var sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

  var STATUSES = ['Nov upit', 'Kontaktiran', 'Ponuda poslata', 'Dobijen posao', 'Odbijen'];
  var WON = 'Dobijen posao';
  var SOURCE_LABEL = { brief: 'sajt', meta: 'Meta Ads', partial: 'nezavršeno' };

  /* Escape mora da pokrije i navodnike — vrednost završava i unutar
     atributa (value="…"), gde bi goli " zatvorio atribut i pustio da se
     ubaci nov. Ista greška je nađena i popravljena na InvKlub portalu. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  /* --- datumi --- */

  function today() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function parseDate(v) {
    if (!v) return null;
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function daysSince(iso) {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  /** Pozitivno = rok je prošao pre toliko dana. Negativno = ima još toliko. */
  function daysOverdue(dateStr) {
    var d = parseDate(dateStr);
    if (!d) return null;
    return Math.round((today() - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  }

  function fmtDate(v) {
    var d = parseDate(v);
    if (!d) return '';
    return String(d.getDate()).padStart(2, '0') + '.' +
           String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() + '.';
  }

  /** Za <input type="date"> — uvek YYYY-MM-DD, nezavisno od jezika browsera. */
  function inputDate(v) {
    var d = parseDate(v);
    if (!d) return '';
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

  function ageLabel(days) {
    if (days === 0) return 'danas';
    if (days === 1) return 'juče';
    return 'pre ' + days + ' dana';
  }

  /* --- novac --- */

  function fmtMoney(n, valuta) {
    if (n == null || n === '') return '';
    var sign = valuta === 'RSD' ? '' : '€';
    var out = sign + Math.round(Number(n)).toLocaleString('sr-RS');
    return valuta === 'RSD' ? out + ' RSD' : out;
  }

  function num(v) { return v === '' || v == null ? null : Number(v); }

  /* --- razno --- */

  function telHref(raw) { return String(raw || '').replace(/[^\d+]/g, ''); }

  /* Srpska množina: 1 fajl / 2 fajla / 5 fajlova. Bez ovoga se svuda po
     alatki pojavi „5 faktura(e)" ili gola brojka bez imenice. */
  function mnozina(n, oblici) {
    var d = n % 10, dd = n % 100;
    if (d === 1 && dd !== 11) return n + ' ' + oblici[0];
    if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return n + ' ' + oblici[1];
    return n + ' ' + oblici[2];
  }

  function isImage(mime, name) {
    if (mime && /^image\//.test(mime)) return true;
    return /\.(jpe?g|png|webp|gif|avif)$/i.test(name || '');
  }

  /** Prazno stanje koje kaže šta se očekuje, ne samo „nema podataka". */
  function emptyHtml(text) {
    return '<div class="empty">' + esc(text) + '</div>';
  }

  /* --- ikone ---
     Linijske, stroke 1.6, currentColor, viewBox 24 — jedan set za ceo CRM.
     Namerno inline SVG, ne font ni biblioteka: četiri ikone ne opravdavaju
     zavisnost, a ovako nasleđuju boju iz konteksta. */
  var ICONS = {
    pregled:   '<path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z"/>',
    upiti:     '<path d="M4 13h4l2 3h4l2-3h4"/><path d="M6.4 5h11.2l2.4 8v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4l2.4-8Z"/>',
    klijenti:  '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.6"/><path d="M17.5 14.4A5.6 5.6 0 0 1 21 20"/>',
    finansije: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M7 12h.01M17 12h.01"/>',
    pretraga:  '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    plus:      '<path d="M12 5v14M5 12h14"/>',
    nazad:     '<path d="M15 5l-7 7 7 7"/>',
    preuzmi:   '<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M5 18h14"/>',
    spolja:    '<path d="M14 5h5v5"/><path d="m19 5-8 8"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    osvezi:    '<path d="M20 11a8 8 0 1 0-.9 4.6"/><path d="M20 5v6h-6"/>',
  };

  /* Grupa brojki u jednoj površini, razdvojenih vlasima — a ne tri
     odvojene kutije, koje se čitaju kao tri nepovezane stvari.
     cells: [{label, value, note, tone:'up'|'down', warn}] */
  function kpiGroup(cells) {
    return '<div class="kpi">' + cells.map(function (c) {
      return '<div class="kpi__cell' + (c.warn ? ' is-warn' : '') + '">' +
        '<div class="kpi__l">' + esc(c.label) + '</div>' +
        '<div class="kpi__v">' + esc(c.value) + '</div>' +
        (c.note ? '<div class="kpi__d' + (c.tone ? ' ' + c.tone : '') + '">' + esc(c.note) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  function icon(name, size) {
    var d = ICONS[name];
    if (!d) return '';
    var s = size || 18;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }

  /* Meki čip sa tonom — ne pilula (border-radius 999px je odbijen na
     brief formi kao generično), nego blago zaobljen pravougaonik. */
  function chip(text, ton) {
    if (!text) return '';
    return '<span class="chip' + (ton ? ' chip--' + ton : '') + '">' + esc(text) + '</span>';
  }

  return {
    CFG: CFG, sb: sb,
    STATUSES: STATUSES, WON: WON, SOURCE_LABEL: SOURCE_LABEL,
    esc: esc, $: $, $$: $$, toast: toast,
    today: today, parseDate: parseDate, daysSince: daysSince, daysOverdue: daysOverdue,
    fmtDate: fmtDate, inputDate: inputDate, ageLabel: ageLabel,
    fmtMoney: fmtMoney, num: num,
    telHref: telHref, isImage: isImage, emptyHtml: emptyHtml, mnozina: mnozina,
    icon: icon, chip: chip, kpiGroup: kpiGroup,
  };
})();
