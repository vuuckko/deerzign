/* Deerzign CRM — Finansije (fakture, naplata, godišnji zbir)
 *
 * Status fakture se NE čuva kao kolona — izvodi se iz datuma:
 *   placeno_datum != null            → plaćeno
 *   placeno_datum == null, rok prošao → kasni
 *   inače                             → čeka
 * Tako status i datumi ne mogu da se raziđu.
 */
DZ.finansije = (function () {
  'use strict';

  var sb = DZ.sb, esc = DZ.esc, $ = DZ.$, $$ = DZ.$$;

  var filter = 'sve';   // sve | neplacene | kasne

  function stateOf(f) {
    if (f.placeno_datum) return 'placeno';
    var od = DZ.daysOverdue(f.rok_placanja);
    if (od !== null && od > 0) return 'kasni';
    return 'ceka';
  }

  function clientName(id) {
    var c = DZ.store.clients.filter(function (x) { return x.id === id; })[0];
    return c ? (c.firma || c.ime || 'Bez naziva') : 'Bez klijenta';
  }

  /* ---------------- red fakture (deli se sa stranicom Klijenti) ---------------- */

  function rowHtml(f) {
    var st = stateOf(f);
    var od = DZ.daysOverdue(f.rok_placanja);

    var right =
      st === 'placeno' ? 'plaćeno ' + DZ.fmtDate(f.placeno_datum)
    : st === 'kasni'   ? 'kasni ' + od + (od === 1 ? ' dan' : ' dana')
    : f.rok_placanja   ? 'rok ' + DZ.fmtDate(f.rok_placanja)
    : 'bez roka';

    return '<div class="row" data-inv="' + esc(f.id) + '">' +
      '<span class="dot dot--' + st + '"></span>' +
      '<span class="row__main">' +
        '<span class="row__name">' + esc(clientName(f.client_id)) + '</span>' +
        (f.opis ? '<span class="row__sub">' + esc(f.opis) + '</span>' : '') +
      '</span>' +
      '<span class="row__num">' + esc(DZ.fmtMoney(f.iznos, f.valuta)) + '</span>' +
      '<span class="row__when' + (st === 'kasni' ? ' is-warn' : '') + '">' + esc(right) + '</span>' +
    '</div>';
  }

  function wireRows(root) {
    $$('[data-inv]', root).forEach(function (r) {
      r.addEventListener('click', function () { editInvoice(r.dataset.inv); });
    });
  }

  /* ---------------- stranica ---------------- */

  function render(main) {
    var inv = DZ.store.invoices;
    var god = new Date().getFullYear();

    var ove = inv.filter(function (f) {
      var d = DZ.parseDate(f.placeno_datum || f.izdato);
      return d && d.getFullYear() === god;
    });

    var naplaceno = ove.filter(function (f) { return f.placeno_datum; })
                       .reduce(function (n, f) { return n + Number(f.iznos || 0); }, 0);
    var ceka = inv.filter(function (f) { return stateOf(f) === 'ceka'; })
                  .reduce(function (n, f) { return n + Number(f.iznos || 0); }, 0);
    var kasni = inv.filter(function (f) { return stateOf(f) === 'kasni'; })
                   .reduce(function (n, f) { return n + Number(f.iznos || 0); }, 0);

    var lista = inv.filter(function (f) {
      if (filter === 'neplacene' && f.placeno_datum) return false;
      if (filter === 'kasne' && stateOf(f) !== 'kasni') return false;
      if (!DZ.q) return true;
      return [clientName(f.client_id), f.broj, f.opis]
        .some(function (v) { return String(v || '').toLowerCase().indexOf(DZ.q) !== -1; });
    });

    var brojKasni = inv.filter(function (f) { return stateOf(f) === 'kasni'; }).length;

    main.innerHTML =
      '<div class="page__head">' +
        '<h1>Finansije</h1>' +
        '<button class="btn" id="addInv">' + DZ.icon('plus', 16) + 'Nova faktura</button>' +
      '</div>' +

      DZ.kpiGroup([
        { label: 'Naplaćeno ' + god, value: DZ.fmtMoney(naplaceno) || '€0',
          note: 'prihod se broji kad legne, ne kad se izda' },
        { label: 'Čeka naplatu', value: DZ.fmtMoney(ceka) || '€0' },
        { label: 'Kasni', value: DZ.fmtMoney(kasni) || '€0',
          note: brojKasni ? brojKasni + (brojKasni === 1 ? ' faktura' : ' fakture') : 'ništa ne kasni',
          warn: kasni > 0 },
      ]) +

      '<div class="panel">' +
        '<div class="panel__head"><h2>Po mesecima — ' + god + '</h2></div>' +
        monthsHtml(ove) +
      '</div>' +

      '<div class="panel">' +
        '<div class="panel__head">' +
          '<h2>Fakture</h2>' +
          '<div class="tabs">' +
            tab('sve', 'Sve', inv.length) +
            tab('neplacene', 'Neplaćene', inv.filter(function (f) { return !f.placeno_datum; }).length) +
            tab('kasne', 'Kasne', brojKasni) +
          '</div>' +
        '</div>' +
        (lista.length
          ? '<div class="rows">' + lista.map(rowHtml).join('') + '</div>'
          : DZ.emptyHtml(inv.length ? 'Nema faktura u ovom filteru.'
                                    : 'Još nema faktura. Prvu dodaješ dugmetom gore, ili sa stranice klijenta.')) +
      '</div>';

    $$('.tabs button', main).forEach(function (b) {
      b.addEventListener('click', function () { filter = b.dataset.f; render(main); });
    });
    $('#addInv', main).addEventListener('click', function () { newInvoice(null); });
    wireRows(main);
  }

  function tab(key, label, n) {
    return '<button data-f="' + key + '"' + (filter === key ? ' class="is-on"' : '') + '>' +
      esc(label) + (n ? ' <span>' + n + '</span>' : '') + '</button>';
  }

  /* Brojke, ne grafikon: kod fakturisanja je tačan iznos važniji od
     oblika krive, a dvanaest redova se pročita brže nego što se stubići
     protumače. */
  function monthsHtml(ove) {
    var IMENA = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'];
    var po = new Array(12).fill(0);
    ove.forEach(function (f) {
      if (!f.placeno_datum) return;
      var d = DZ.parseDate(f.placeno_datum);
      if (d) po[d.getMonth()] += Number(f.iznos || 0);
    });
    if (!po.some(function (v) { return v; })) {
      return '<p class="muted">Još nema naplaćenih faktura ove godine.</p>';
    }
    return '<div class="months">' + po.map(function (v, i) {
      return '<div class="month' + (v ? '' : ' is-zero') + '">' +
        '<div class="month__v">' + (v ? esc(DZ.fmtMoney(v)) : '—') + '</div>' +
        '<div class="month__l">' + IMENA[i] + '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------------- unos i izmena ---------------- */

  function newInvoice(clientId) {
    openForm({
      client_id: clientId || null,
      izdato: DZ.inputDate(new Date()),
      valuta: 'EUR',
    }, null);
  }

  function editInvoice(id) {
    var f = DZ.store.invoices.filter(function (x) { return x.id === id; })[0];
    if (f) openForm(f, id);
  }

  /* Jedan klik sa stranice Klijenti: novac je legao danas. Bez potvrde —
     potez je povratan iz forme fakture, a dijalog na svaki klik je trošak
     koji se plaća svaki put da bi se retka greška uhvatila jednom. */
  function markPaid(id) {
    var f = DZ.store.invoices.filter(function (x) { return x.id === id; })[0];
    if (!f || f.placeno_datum) return;
    var danas = DZ.inputDate(new Date());

    sb.from('invoices').update({ placeno_datum: danas }).eq('id', id).select().single()
      .then(function (res) {
        if (res.error) { DZ.toast('Nije sačuvano: ' + res.error.message); return; }
        var i = DZ.store.invoices.findIndex(function (x) { return x.id === id; });
        if (i !== -1) DZ.store.invoices[i] = res.data;
        DZ.paintBadges();
        DZ.rerender();
        DZ.toast(DZ.fmtMoney(f.iznos, f.valuta) + ' naplaćeno — upisano na ' + DZ.fmtDate(danas));
      });
  }

  function openForm(f, id) {
    var opts = DZ.store.clients.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (f.client_id === c.id ? ' selected' : '') + '>' +
        esc(c.firma || c.ime || 'Bez naziva') + '</option>';
    }).join('');

    var wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML =
      '<div class="modal__box">' +
        '<h2>' + (id ? 'Izmena fakture' : 'Nova faktura') + '</h2>' +
        '<label class="field"><span>Klijent</span><select id="iKlijent">' +
          '<option value="">— bez klijenta —</option>' + opts +
        '</select></label>' +
        '<div class="row2">' +
          '<label class="field"><span>Broj</span><input id="iBroj" value="' + esc(f.broj || '') + '"></label>' +
          '<label class="field"><span>Iznos</span><input id="iIznos" type="number" step="0.01" value="' + esc(f.iznos == null ? '' : f.iznos) + '"></label>' +
        '</div>' +
        '<label class="field"><span>Opis</span><input id="iOpis" value="' + esc(f.opis || '') + '" placeholder="Poslovni sajt — izrada"></label>' +
        '<div class="row2">' +
          '<label class="field"><span>Izdato</span><input id="iIzdato" type="date" value="' + esc(DZ.inputDate(f.izdato)) + '"></label>' +
          '<label class="field"><span>Rok plaćanja</span><input id="iRok" type="date" value="' + esc(DZ.inputDate(f.rok_placanja)) + '"></label>' +
        '</div>' +
        '<div class="row2">' +
          '<label class="field"><span>Plaćeno dana</span><input id="iPlaceno" type="date" value="' + esc(DZ.inputDate(f.placeno_datum)) + '"></label>' +
          '<label class="field"><span>Valuta</span><select id="iValuta">' +
            '<option value="EUR"' + (f.valuta !== 'RSD' ? ' selected' : '') + '>EUR</option>' +
            '<option value="RSD"' + (f.valuta === 'RSD' ? ' selected' : '') + '>RSD</option>' +
          '</select></label>' +
        '</div>' +
        '<p class="muted" style="font-size:12.6px;margin:-2px 0 12px">Ostavi „Plaćeno dana" prazno dok ne legne novac — po tome se računa šta kasni.</p>' +
        '<div class="modal__foot">' +
          (id ? '<button class="linkish" id="iDel">Obriši</button>' : '<span></span>') +
          '<span>' +
            '<button class="btn btn--ghost" id="iCancel">Odustani</button> ' +
            '<button class="btn" id="iSave">Sačuvaj</button>' +
          '</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    function close() { wrap.remove(); }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    $('#iCancel', wrap).addEventListener('click', close);

    $('#iSave', wrap).addEventListener('click', function () {
      var iznos = Number($('#iIznos', wrap).value);
      if (!iznos || iznos <= 0) { DZ.toast('Iznos mora biti veći od nule'); return; }
      if (!$('#iIzdato', wrap).value) { DZ.toast('Datum izdavanja je obavezan'); return; }

      var payload = {
        client_id: $('#iKlijent', wrap).value || null,
        broj: $('#iBroj', wrap).value.trim() || null,
        opis: $('#iOpis', wrap).value.trim() || null,
        iznos: iznos,
        valuta: $('#iValuta', wrap).value,
        izdato: $('#iIzdato', wrap).value,
        rok_placanja: $('#iRok', wrap).value || null,
        placeno_datum: $('#iPlaceno', wrap).value || null,
      };

      var q = id
        ? sb.from('invoices').update(payload).eq('id', id).select().single()
        : sb.from('invoices').insert(payload).select().single();

      q.then(function (res) {
        if (res.error) { DZ.toast('Nije sačuvano: ' + res.error.message); return; }
        if (id) {
          var i = DZ.store.invoices.findIndex(function (x) { return x.id === id; });
          if (i !== -1) DZ.store.invoices[i] = res.data;
        } else {
          DZ.store.invoices.unshift(res.data);
        }
        close();
        DZ.paintBadges();
        DZ.rerender();
        DZ.toast('Sačuvano');
      });
    });

    var del = $('#iDel', wrap);
    if (del) del.addEventListener('click', function () {
      if (!window.confirm('Obrisati ovu fakturu?')) return;
      sb.from('invoices').delete().eq('id', id).then(function (res) {
        if (res.error) { DZ.toast('Nije obrisano: ' + res.error.message); return; }
        DZ.store.invoices = DZ.store.invoices.filter(function (x) { return x.id !== id; });
        close();
        DZ.paintBadges();
        DZ.rerender();
      });
    });
  }

  return {
    render: render, rowHtml: rowHtml, wireRows: wireRows,
    newInvoice: newInvoice, markPaid: markPaid, stateOf: stateOf, clientName: clientName,
  };
})();
