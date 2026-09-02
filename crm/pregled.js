/* Deerzign CRM — Pregled (početna)
 *
 * Vizuelni ekran, ne spisak: gore brojke sa poređenjem, ispod jedan veliki
 * grafikon prihoda kroz godinu i levak upita, pa tek onda ono što traži
 * potez danas. Forme su birane po poslu podatka (vidi charts.js), ne po
 * tome kako izgledaju.
 */
DZ.pregled = (function () {
  'use strict';

  var esc = DZ.esc, $ = DZ.$, $$ = DZ.$$;

  /* mesec 0 = ovaj, 1 = prošli */
  function inMonth(v, back) {
    var d = DZ.parseDate(v);
    if (!d) return false;
    var t = new Date();
    t.setDate(1);
    t.setMonth(t.getMonth() - (back || 0));
    return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
  }

  function render(main) {
    var leads = DZ.store.leads, inv = DZ.store.invoices;
    var god = new Date().getFullYear();

    var novih   = [0, 1].map(function (b) { return leads.filter(function (l) { return inMonth(l.created_at, b); }).length; });
    var zakljuc = [0, 1].map(function (b) { return leads.filter(function (l) { return l.status === DZ.WON && inMonth(l.updated_at, b); }).length; });
    var naplac  = [0, 1].map(function (b) {
      return inv.filter(function (f) { return inMonth(f.placeno_datum, b); })
                .reduce(function (n, f) { return n + Number(f.iznos || 0); }, 0);
    });

    var javljanja = leads.filter(function (l) {
      if (!l.sledeci_kontakt) return false;
      if (l.status === DZ.WON || l.status === 'Odbijen') return false;
      var od = DZ.daysOverdue(l.sledeci_kontakt);
      return od !== null && od >= 0;
    }).sort(function (a, b) { return DZ.daysOverdue(b.sledeci_kontakt) - DZ.daysOverdue(a.sledeci_kontakt); });

    var cekaju = leads.filter(function (l) { return l.status === 'Nov upit'; })
      .sort(function (a, b) { return DZ.daysSince(b.created_at) - DZ.daysSince(a.created_at); });

    var kasne = inv.filter(function (f) { return DZ.finansije.stateOf(f) === 'kasni'; })
      .sort(function (a, b) { return DZ.daysOverdue(b.rok_placanja) - DZ.daysOverdue(a.rok_placanja); });

    var nista = !javljanja.length && !cekaju.length && !kasne.length;

    /* Nema ni naslova stranice ni KPI reda. Naslov „Pregled" ne kaže
       ništa što ekran već ne pokazuje, a KPI red je duplirao herojski
       broj („Naplaćeno €0" iznad „€3.728") i vraćao tačno onaj generički
       potez zbog kojeg smo krenuli ispočetka. Datum ostaje kao tiha
       jedna linija. */
    main.innerHTML =
      '<p class="daynote">' + esc(danasTekst()) + '</p>' +

      /* HEROJ — bez kartice, direktno na papiru: broj, tiha meta na
         njegovoj osnovnoj liniji, pa grafikon preko cele širine. */
      '<section class="year">' +
        '<div class="year__top">' +
          '<div class="year__fig">' +
            '<span class="year__lab">Naplaćeno ' + god + '</span>' +
            '<span class="year__v" id="yearV">—</span>' +
          '</div>' +
          '<dl class="year__meta" id="yearMeta"></dl>' +
        '</div>' +
        '<div class="year__chart chartbox" id="yearChart"></div>' +
      '</section>' +

      '<div class="dash">' +
        '<section class="panel">' +
          '<div class="panel__head"><h2>Levak upita</h2></div>' +
          '<div id="chartLevak"></div>' +
        '</section>' +
        '<section class="panel">' +
          '<div class="panel__head"><h2>Konverzija</h2></div>' +
          '<div id="chartMeter"></div>' +
        '</section>' +
      '</div>' +

      (nista
        ? '<div class="panel"><div class="allclear">' +
            '<strong>Ništa ne čeka na tebe.</strong>' +
            '<span>Nema zakazanih javljanja, svi upiti su obrađeni i nijedna faktura ne kasni.</span>' +
          '</div></div>'
        : '') +

      sekcija('Javiti se', javljanja, function (l) {
        var od = DZ.daysOverdue(l.sledeci_kontakt);
        return {
          href: '#/upit/' + l.id,
          name: l.firma || l.ime || 'Bez naziva',
          sub: [l.telefon, l.status].filter(Boolean).join(' · '),
          right: od === 0 ? 'danas' : 'kasni ' + od + (od === 1 ? ' dan' : ' dana'),
          warn: od > 0,
        };
      }) +

      sekcija('Novi upiti bez odgovora', cekaju, function (l) {
        var d = DZ.daysSince(l.created_at);
        return {
          href: '#/upit/' + l.id,
          name: l.firma || l.ime || 'Bez naziva',
          sub: [l.paket, DZ.SOURCE_LABEL[l.source] || l.source].filter(Boolean).join(' · '),
          num: DZ.fmtMoney(l.cena),
          right: DZ.ageLabel(d),
          warn: d >= (DZ.CFG.STALE_DAYS || 4),
        };
      }) +

      sekcija('Fakture koje kasne', kasne, function (f) {
        var od = DZ.daysOverdue(f.rok_placanja);
        return {
          href: '#/finansije',
          name: DZ.finansije.clientName(f.client_id),
          sub: [f.broj, f.opis].filter(Boolean).join(' · '),
          num: DZ.fmtMoney(f.iznos, f.valuta),
          right: 'kasni ' + od + (od === 1 ? ' dan' : ' dana'),
          warn: true,
        };
      });

    /* grafikoni se crtaju posle innerHTML-a, u svoje kontejnere */
    var ukupno = DZ.charts.area(inv, $('#yearChart', main));
    DZ.charts.funnel(leads, $('#chartLevak', main));
    DZ.charts.meter(leads, $('#chartMeter', main));

    var poslova = leads.filter(function (l) {
      if (l.status !== DZ.WON) return false;
      var d = DZ.parseDate(l.updated_at);
      return d && d.getFullYear() === god;
    }).length;
    var t = { ukupno: ukupno, poslova: poslova };

    $('#yearV', main).textContent = DZ.fmtMoney(t.ukupno) || '€0';

    var ceka = inv.filter(function (f) { return !f.placeno_datum; })
                  .reduce(function (n, f) { return n + Number(f.iznos || 0); }, 0);
    var meta = [
      [t.poslova, t.poslova === 1 ? 'posao' : 'posla'],
      [String(leads.filter(function (l) {
        var d = DZ.parseDate(l.created_at);
        return d && d.getFullYear() === god;
      }).length), 'upita'],
    ];
    if (ceka) meta.push([DZ.fmtMoney(ceka), 'čeka naplatu']);

    $('#yearMeta', main).innerHTML = meta.map(function (m) {
      return '<div><dt>' + esc(m[0]) + '</dt><dd>' + esc(m[1]) + '</dd></div>';
    }).join('');

    $$('[data-go]', main).forEach(function (r) {
      r.addEventListener('click', function () { location.hash = r.dataset.go; });
    });
  }

  function cell(label, value, sada, pre) {
    var note = delta(sada, pre);
    var tone = note.charAt(0) === '↑' ? 'up' : (note.charAt(0) === '↓' ? 'down' : '');
    return { label: label, value: value, note: note, tone: tone };
  }

  /* Kad je prošli mesec bio nula, procenat nema smisla (deljenje nulom
     daje beskonačan „rast"), pa se piše apsolutna razlika. */
  function delta(sada, pre) {
    if (!pre && !sada) return 'isto kao prošlog meseca';
    if (!pre) return '↑ ' + (sada > 1 ? sada + ' novih' : 'prvi ovog meseca');
    var pct = Math.round(((sada - pre) / pre) * 100);
    if (pct === 0) return 'isto kao prošlog meseca';
    return (pct > 0 ? '↑ ' : '↓ ') + Math.abs(pct) + '% u odnosu na prošli mesec';
  }

  function sekcija(naslov, items, map) {
    if (!items.length) return '';
    return '<div class="panel">' +
      '<div class="panel__head"><h2>' + esc(naslov) + '</h2>' +
        '<span class="panel__count">' + items.length + '</span></div>' +
      '<div class="rows">' + items.map(function (x) {
        var v = map(x);
        return '<div class="row" data-go="' + esc(v.href) + '">' +
          '<span class="dot' + (v.warn ? ' dot--kasni' : ' dot--ceka') + '"></span>' +
          '<span class="row__main">' +
            '<span class="row__name">' + esc(v.name) + '</span>' +
            (v.sub ? '<span class="row__sub">' + esc(v.sub) + '</span>' : '') +
          '</span>' +
          (v.num ? '<span class="row__num">' + esc(v.num) + '</span>' : '') +
          '<span class="row__when' + (v.warn ? ' is-warn' : '') + '">' + esc(v.right) + '</span>' +
        '</div>';
      }).join('') + '</div></div>';
  }

  function danasTekst() {
    var DANI = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];
    var d = new Date();
    return DANI[d.getDay()] + ', ' + DZ.fmtDate(d);
  }

  return { render: render };
})();
