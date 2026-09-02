/* Deerzign CRM — grafikoni
 * ------------------------------------------------------------------
 * Inline SVG, bez biblioteke. Tri forme, svaka bira se po poslu koji
 * podatak ima, ne po tome kako izgleda:
 *
 *   area   — kretanje kroz vreme, jedna serija        (prihod po mesecima)
 *   funnel — magnituda kroz UREĐENE faze              (levak upita)
 *   meter  — jedan odnos prema granici                (stopa konverzije)
 *
 * Boja: jedan ton (ember iz palete sajta). Levak koristi ordinalnu rampu
 * proverenu validatorom — monotona svetlina, razmaci >= 0.06, svetli kraj
 * 2.10:1 nad površinom, raspon tona 3°. Ne menjati vrednosti napamet;
 * ako zatreba druga, propustiti je kroz isti validator.
 */
DZ.charts = (function () {
  'use strict';

  var esc = DZ.esc;

  /* ordinalna rampa levka: svetlo -> tamno kroz faze ka poslu */
  var RAMP = ['#EC9E8A', '#E67C62', '#DF5C3D', '#C93619', '#8A1E0B'];
  var LINE = '#C93619';          // 2px linija i tačke
  var GRID = 'rgba(10,10,10,.07)'; // vlas, puna, jedan korak od površine
  var SURFACE = '#FFFDF9';

  var MES = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'];

  function money(n) { return DZ.fmtMoney(n) || '€0'; }

  /* zaokruži gornju granicu ose na čist broj */
  function niceMax(v) {
    if (v <= 0) return 100;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var step = mag / 2;
    return Math.ceil(v / step) * step;
  }

  /* ================= area: prihod kroz godinu ================= */

  /**
   * Kumulativno naplaćeno po mesecima. Kumulativno, a ne mesečno, jer je
   * pitanje na koje odgovara „koliko sam zaradio ove godine" — i jer
   * mesečni niz sa dve popunjene vrednosti nema oblik koji se čita.
   * Linija staje na tekućem mesecu: crtanje budućih meseci kao nula
   * napravilo bi lažan pad.
   */
  function area(invoices, host) {
    var god = new Date().getFullYear();
    var doMeseca = new Date().getMonth();

    var poMesecu = new Array(12).fill(0);
    invoices.forEach(function (f) {
      var d = DZ.parseDate(f.placeno_datum);
      if (d && d.getFullYear() === god) poMesecu[d.getMonth()] += Number(f.iznos || 0);
    });

    var kum = [], zbir = 0;
    for (var i = 0; i <= doMeseca; i++) { zbir += poMesecu[i]; kum.push(zbir); }

    /* viewBox prati širinu kontejnera. Fiksnih 640 na telefonu se skalira
       na ~0.47, pa oznaka od 11 jedinica postane 5px — nečitljivo. Uži
       viewBox drži odnos blizu 1:1 i tekst ostaje u čitljivoj veličini. */
    var usko = (host.clientWidth || 640) < 460;
    var W = usko ? 360 : 640, H = usko ? 170 : 216;
    var PL = usko ? 34 : 46, PR = usko ? 10 : 16, PT = 14, PB = 26;
    var iw = W - PL - PR, ih = H - PT - PB;
    var kratko = usko;
    var max = niceMax(Math.max.apply(null, kum.concat([1])));
    var x = function (i) { return PL + (iw * (i / 11)); };
    var y = function (v) { return PT + ih - (ih * (v / max)); };

    var pts = kum.map(function (v, i) { return [x(i), y(v)] });
    var linePath = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var areaPath = pts.length
      ? linePath + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (PT + ih) + ' L' + pts[0][0].toFixed(1) + ' ' + (PT + ih) + ' Z'
      : '';

    /* tri čiste linije mreže; ose nose vrednosti koje nisu direktno označene */
    /* na uskom se iznos skraćuje („2k" umesto „€2.000") jer duga oznaka
       ne stane u leviji pojas bez ulaska u polje crtanja */
    var tickLabel = function (t) {
      if (!kratko) return money(t);
      return t >= 1000 ? '€' + Math.round(t / 1000) + 'k' : '€' + Math.round(t);
    };

    var ticks = [0, max / 2, max];
    var grid = ticks.map(function (t) {
      return '<line x1="' + PL + '" y1="' + y(t).toFixed(1) + '" x2="' + (W - PR) + '" y2="' + y(t).toFixed(1) + '" stroke="' + GRID + '" stroke-width="1"/>' +
        '<text x="' + (PL - 6) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end" class="ax">' + esc(tickLabel(t)) + '</text>';
    }).join('');

    /* svaki treći mesec na širokom, svaki četvrti na uskom — da se
       oznake ne sudaraju */
    var korak = kratko ? 4 : 3;
    var xlab = MES.map(function (m, i) {
      if (i % korak !== 0) return '';
      return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" class="ax">' + m + '</text>';
    }).join('');

    var last = pts[pts.length - 1];
    /* jedna direktna oznaka — krajnja tačka. Broj na svakoj tački je haos. */
    var end = last
      ? '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4.5" fill="' + LINE + '" stroke="' + SURFACE + '" stroke-width="2"/>'
      : '';

    host.innerHTML =
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
        'aria-label="Kumulativno naplaćeno u ' + god + ': ' + esc(money(zbir)) + '">' +
        '<defs><linearGradient id="dzArea" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="' + LINE + '" stop-opacity=".16"/>' +
          '<stop offset="1" stop-color="' + LINE + '" stop-opacity="0"/>' +
        '</linearGradient></defs>' +
        grid + xlab +
        (areaPath ? '<path d="' + areaPath + '" fill="url(#dzArea)"/>' : '') +
        (linePath ? '<path d="' + linePath + '" fill="none" stroke="' + LINE + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' : '') +
        end +
        '<line class="cross" x1="0" y1="' + PT + '" x2="0" y2="' + (PT + ih) + '" stroke="' + LINE + '" stroke-width="1" opacity="0"/>' +
        '<rect x="' + PL + '" y="' + PT + '" width="' + iw + '" height="' + ih + '" fill="transparent" class="hit"/>' +
      '</svg>' +
      '<div class="tip" hidden></div>';

    wireArea(host, { pts: pts, kum: kum, PL: PL, iw: iw, doMeseca: doMeseca, W: W, H: H });
    return zbir;
  }

  /* Krstić + tooltip: HTML/SVG grafikon JESTE interaktivan, pa ovo nije
     dodatak nego podrazumevani sloj. */
  function wireArea(host, s) {
    var svg = host.querySelector('svg');
    var cross = svg.querySelector('.cross');
    var tip = host.querySelector('.tip');

    function idxFromEvent(e) {
      var r = svg.getBoundingClientRect();
      var vx = ((e.clientX - r.left) / r.width) * s.W;
      var i = Math.round(((vx - s.PL) / s.iw) * 11);
      return Math.max(0, Math.min(s.doMeseca, i));
    }

    svg.addEventListener('mousemove', function (e) {
      var i = idxFromEvent(e);
      var p = s.pts[i];
      if (!p) return;
      cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]);
      cross.setAttribute('opacity', '.28');
      tip.hidden = false;
      tip.innerHTML = '<b>' + MES[i] + '</b> ' + esc(money(s.kum[i]));
      var r = svg.getBoundingClientRect();
      tip.style.left = ((p[0] / s.W) * r.width) + 'px';
      tip.style.top = ((p[1] / s.H) * r.height) + 'px';
    });
    svg.addEventListener('mouseleave', function () {
      cross.setAttribute('opacity', '0');
      tip.hidden = true;
    });
  }

  /* ================= levak ================= */

  /**
   * Uređene faze -> ordinalna rampa. Odbijen NIJE faza levka nego izlaz,
   * pa ne ulazi u trake; broji se posebno ispod.
   */
  function funnel(leads, host) {
    var FAZE = ['Nov upit', 'Kontaktiran', 'Ponuda poslata', 'Dobijen posao'];
    var brojevi = FAZE.map(function (st) {
      return leads.filter(function (l) { return l.status === st; }).length;
    });
    var max = Math.max.apply(null, brojevi.concat([1]));
    var odbijen = leads.filter(function (l) { return l.status === 'Odbijen'; }).length;

    host.innerHTML =
      '<div class="fun">' + FAZE.map(function (st, i) {
        var n = brojevi[i];
        var pct = Math.max(n / max, 0) * 100;
        return '<div class="fun__row" title="' + esc(st + ': ' + n) + '">' +
          '<span class="fun__l">' + esc(st) + '</span>' +
          '<span class="fun__track">' +
            (n ? '<span class="fun__bar" style="width:' + pct.toFixed(1) + '%;background:' + RAMP[i + 1] + '"></span>' : '') +
          '</span>' +
          '<span class="fun__v">' + n + '</span>' +
        '</div>';
      }).join('') + '</div>' +
      (odbijen ? '<p class="fun__note">' + odbijen + ' odbijeno — izlaz iz levka, ne faza.</p>' : '');
  }

  /* ================= meter: stopa konverzije ================= */

  /**
   * Jedan odnos prema granici -> meter na istoj rampi, a ne pita sa dva
   * parčeta. Traka je pun raspon, ispuna je udeo.
   */
  function meter(leads, host) {
    var ukupno = leads.length;
    var dobijeno = leads.filter(function (l) { return l.status === DZ.WON; }).length;
    var pct = ukupno ? Math.round((dobijeno / ukupno) * 100) : 0;

    host.innerHTML =
      '<div class="meter">' +
        '<div class="meter__v">' + pct + '%</div>' +
        '<div class="meter__track"><span style="width:' + pct + '%"></span></div>' +
        '<div class="meter__l">' + dobijeno + ' od ' + ukupno + ' upita je postalo posao</div>' +
      '</div>';
  }

  return { area: area, funnel: funnel, meter: meter, RAMP: RAMP, LINE: LINE };
})();
