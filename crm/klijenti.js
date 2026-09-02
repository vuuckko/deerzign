/* Deerzign CRM — Klijenti (lista + detalj) */
DZ.klijenti = (function () {
  'use strict';

  var sb = DZ.sb, esc = DZ.esc, $ = DZ.$, $$ = DZ.$$;

  /* Ukupno naplaćeno = zbir PLAĆENIH faktura. Namerno ne izdatih —
     izdata a nenaplaćena faktura nije prihod, i mešanje ta dva je
     najbrži način da brojka na ovoj stranici počne da laže. */
  function totals(clientId) {
    var mine = DZ.store.invoices.filter(function (f) { return f.client_id === clientId; });
    return {
      placeno: mine.filter(function (f) { return f.placeno_datum; })
                   .reduce(function (n, f) { return n + Number(f.iznos || 0); }, 0),
      duguje: mine.filter(function (f) { return !f.placeno_datum; })
                  .reduce(function (n, f) { return n + Number(f.iznos || 0); }, 0),
      broj: mine.length,
    };
  }

  function find(id) {
    return DZ.store.clients.filter(function (c) { return c.id === id; })[0];
  }

  /* ---------------- lista ----------------
   * MREŽA, ne kolona: klijenti se ne obrađuju jedan po jedan kao upiti,
   * nego se pregledaju svi odjednom — koga ima, ko je koliko veliki, ko
   * duguje. Zato tri kartice u redu umesto jedne pune širine.
   *
   * Boja ne nosi stanje kao na Upitima (svaki klijent je već dogovoren
   * posao, pa su svi zeleni); nose ga REDOSLED i merilo. Ko duguje ide
   * gore, arhivirani padnu ispod crte, a traka u dnu kartice je srazmerna
   * najvećem klijentu na stranici — po njoj se veličina vidi bez čitanja.
   *
   * Ranija mreža od 232px kutica je imala isti oblik ali ne i sadržaj:
   * ime i dve gole brojke, bez kontakta, bez radnje i bez merila.
   */

  function domen(url) {
    return String(url || '')
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '');
  }

  function neplacene(id) {
    return DZ.store.invoices.filter(function (f) {
      return f.client_id === id && !f.placeno_datum;
    });
  }

  /* Koliko dana kasni najstarija neplaćena faktura; null ako ništa ne kasni. */
  function kasnjenje(id) {
    var dani = neplacene(id)
      .filter(function (f) { return DZ.finansije.stateOf(f) === 'kasni'; })
      .map(function (f) { return DZ.daysOverdue(f.rok_placanja); });
    return dani.length ? Math.max.apply(null, dani) : null;
  }

  /* Poslednja aktivnost = poslednja faktura, a ako ih nema, kad je klijent
     upisan. Po tome se vidi ko je živ, a ko samo stoji u bazi. */
  function poslednja(c) {
    var t = DZ.store.invoices.reduce(function (max, f) {
      if (f.client_id !== c.id) return max;
      var v = new Date(f.placeno_datum || f.izdato).getTime();
      return v > max ? v : max;
    }, 0);
    return t || new Date(c.created_at).getTime();
  }

  function stanje(c) { return c.aktivan ? 'client' : 'sleep'; }

  var RANG = { duguje: 0, uredan: 1, sleep: 2 };
  function rang(c) {
    if (!c.aktivan) return RANG.sleep;
    return totals(c.id).duguje > 0 ? RANG.duguje : RANG.uredan;
  }

  function renderList(main) {
    var all = DZ.store.clients;
    var clients = !DZ.q ? all.slice() : all.filter(function (c) {
      return [c.firma, c.ime, c.email, c.telefon]
        .some(function (v) { return String(v || '').toLowerCase().indexOf(DZ.q) !== -1; });
    });

    clients.sort(function (a, b) {
      var ra = rang(a), rb = rang(b);
      if (ra !== rb) return ra - rb;
      if (ra === RANG.duguje) {
        /* među dužnicima: prvo ko najduže kasni, pa ko duguje najviše */
        var ka = kasnjenje(a.id) || 0, kb = kasnjenje(b.id) || 0;
        if (ka !== kb) return kb - ka;
        return totals(b.id).duguje - totals(a.id).duguje;
      }
      return poslednja(b) - poslednja(a);
    });

    var svi = all.reduce(function (a, c) {
      var t = totals(c.id);
      a.placeno += t.placeno; a.duguje += t.duguje; return a;
    }, { placeno: 0, duguje: 0 });

    /* Zaglavlje umesto KPI kutija: tri bele ćelije iznad kolone tamnih
       kutija su vraćale izgled standardnog admin template-a, a ista
       brojka već stoji na Finansijama. Dug je jedina ember stvar ovde. */
    var note = all.length
      ? esc(DZ.mnozina(all.length, ['klijent', 'klijenta', 'klijenata'])) +
        ' · ' + esc(DZ.fmtMoney(svi.placeno) || '€0') + ' naplaćeno' +
        (svi.duguje ? ' · <b class="page__warn">' + esc(DZ.fmtMoney(svi.duguje)) + ' potražujem</b>' : '')
      : '';

    /* Traka u kutiji je srazmerna najvećem klijentu NA STRANICI, ne
       fiksnoj skali — inače bi kod malih iznosa sve trake bile podjednako
       kratke i merilo ne bi merilo ništa. */
    var max = clients.reduce(function (m, c) {
      var t = totals(c.id);
      return Math.max(m, t.placeno + t.duguje);
    }, 0);

    var podeljeno = false;
    var lista = clients.map(function (c) {
      var pre = '';
      if (!podeljeno && !c.aktivan) {
        podeljeno = true;
        pre = '<div class="usplit usplit--full"><span>Arhivirani</span><i></i></div>';
      }
      return pre + boxHtml(c, max);
    }).join('');

    main.innerHTML =
      '<div class="page__head">' +
        '<h1>Klijenti</h1>' +
        (note ? '<span class="page__note">' + note + '</span>' : '') +
        '<button class="btn" id="addClient">' + DZ.icon('plus', 16) + 'Dodaj klijenta</button>' +
      '</div>' +
      (clients.length
        ? '<div class="kgrid">' + lista + '</div>'
        : '<div class="panel">' + DZ.emptyHtml(all.length
            ? 'Nema klijenta koji odgovara pretrazi.'
            : 'Još nema klijenata. Upit koji prebaciš na „Dobijen posao" pojavi se ovde sam, a klijenta van forme dodaješ dugmetom gore.') + '</div>');

    wireBoxes(main);
    $('#addClient', main).addEventListener('click', function () { addClient(main); });
  }

  function boxHtml(c, max) {
    var t = totals(c.id);
    var id = esc(c.id);
    var ime = c.firma || c.ime || 'Bez naziva';
    var kasni = kasnjenje(c.id);
    var sajt = domen(c.sajt);
    var ukupno = t.placeno + t.duguje;
    var sirina = function (n) { return max > 0 ? (n / max * 100).toFixed(2) + '%' : '0%'; };

    /* U koloni od ~300px nema mesta za datum upisa — on je referenca i
       živi u detalju. Ovde stoji samo ono po čemu se klijent prepoznaje
       i procenjuje: koliko je faktura, odakle je došao, koliki je. */
    var meta = t.broj ? DZ.mnozina(t.broj, ['faktura', 'fakture', 'faktura']) : 'bez faktura';

    var kontakt = [
      c.firma && c.ime ? esc(c.ime) : '',
      c.telefon ? '<a href="tel:' + esc(DZ.telHref(c.telefon)) + '">' + esc(c.telefon) + '</a>' : '',
    ].filter(Boolean).join('<span class="cbox__dot">·</span>');

    return '<article class="ubox kcard ubox--' + stanje(c) + '" data-id="' + id + '">' +
      '<span class="ubox__meta">' + esc(meta) +
        (c.lead_id ? '<b class="ubox__tag">iz upita</b>' : '') +
      '</span>' +
      '<h2 class="ubox__name"><a href="#/klijent/' + id + '">' + esc(ime) + '</a></h2>' +
      (kontakt ? '<p class="cbox__contact">' + kontakt + '</p>' : '') +
      (sajt
        ? '<a class="cbox__site" href="' + esc(c.sajt) + '" target="_blank" rel="noopener">' +
          esc(sajt) + '</a>'
        : '') +

      /* Novac i merilo su dno kartice — poravnati kroz ceo red mreže, pa
         se tri kartice čitaju kao tri brojke jedna do druge, a ne kao tri
         nezavisne kutije. Zato ide margin-top:auto na .kcard__money. */
      '<div class="kcard__money">' +
        (t.broj
          ? '<span class="cbox__sum">' + esc(DZ.fmtMoney(t.placeno) || '€0') + '</span>' +
            '<span class="cbox__l">naplaćeno</span>'
          : '<span class="cbox__l">još nema faktura</span>') +

        (ukupno
          ? '<div class="cbox__bar" aria-hidden="true">' +
              '<i style="width:' + sirina(t.placeno) + '"></i>' +
              (t.duguje ? '<b style="width:' + sirina(t.duguje) + '"></b>' : '') +
            '</div>'
          : '') +

        (t.duguje
          ? '<span class="cbox__debt">' + esc(DZ.fmtMoney(t.duguje)) + ' duguje' +
            (kasni ? ' · kasni ' + esc(DZ.mnozina(kasni, ['dan', 'dana', 'dana'])) : '') + '</span>'
          : '') +
      '</div>' +

      doHtml(c) +
    '</article>';
  }

  /* Podnožje kartice.
   * U koloni od 300px ne stane red kao na Upitima, pa je podeljen na dva:
   * odluka (ember, puna širina — jednoznačna je i tu se klikće) pa tiha
   * linija sa retkim radnjama. Ember se pojavljuje SAMO kad postoji tačno
   * jedna neplaćena faktura, jer je samo tada jasno koju naplaćuješ; sa
   * dve i više vodi u detalj, gde su redovi.
   * Koristi samo c.id i c.aktivan, pa sme da se pozove i sa {id, aktivan}. */
  function doHtml(c) {
    var id = esc(c.id);
    var ne = neplacene(c.id);

    var odluka = '';
    if (ne.length === 1) {
      odluka = '<button class="udo udo--go kcard__go" data-pay="' + esc(ne[0].id) + '">Naplaćeno ' +
        esc(DZ.fmtMoney(ne[0].iznos, ne[0].valuta)) + '</button>';
    } else if (ne.length > 1) {
      odluka = '<a class="udo udo--go kcard__go" href="#/klijent/' + id + '">' +
        'Naplati ' + esc(DZ.mnozina(ne.length, ['fakturu', 'fakture', 'faktura'])) + '</a>';
    }

    return '<div class="kcard__foot">' +
      odluka +
      '<div class="kcard__links">' +
        '<button data-inv-new="' + id + '">Nova faktura</button>' +
        '<span class="cbox__dot">·</span>' +
        '<button data-sleep="' + id + '">' + (c.aktivan ? 'Arhiviraj' : 'Vrati u aktivne') + '</button>' +
      '</div>' +
    '</div>';
  }

  function wireBoxes(root) {
    $$('[data-inv-new]', root).forEach(function (b) {
      b.addEventListener('click', function () { DZ.finansije.newInvoice(b.dataset.invNew); });
    });
    $$('[data-pay]', root).forEach(function (b) {
      b.addEventListener('click', function () { DZ.finansije.markPaid(b.dataset.pay); });
    });
    $$('[data-sleep]', root).forEach(function (b) {
      b.addEventListener('click', function () { toggleSleep(b.dataset.sleep, b.closest('.ubox')); });
    });
  }

  /* Arhiviranje radi isti potez kao „Odbij" na Upitima: podloga se menja
     na mestu, pa se tek onda lista presloži — inače kutija samo skoči
     ispod crte i prelaz se ne vidi. */
  function toggleSleep(id, boxEl) {
    var c = find(id);
    if (!c) return;
    var novo = !c.aktivan;

    if (boxEl) {
      boxEl.classList.remove('ubox--client', 'ubox--sleep');
      boxEl.classList.add('ubox--' + (novo ? 'client' : 'sleep'));
      var stari = boxEl.querySelector('.kcard__foot');
      if (stari) {
        var tmp = document.createElement('div');
        tmp.innerHTML = doHtml({ id: c.id, aktivan: novo });
        var red = tmp.firstChild;
        stari.replaceWith(red);
        wireBoxes(red);
      }
    }

    sb.from('clients').update({ aktivan: novo }).eq('id', id).select().single().then(function (res) {
      if (res.error) { DZ.toast('Nije sačuvano: ' + res.error.message); DZ.rerender(); return; }
      var i = DZ.store.clients.findIndex(function (x) { return x.id === id; });
      if (i !== -1) DZ.store.clients[i] = res.data;
      setTimeout(DZ.rerender, boxEl ? 320 : 0);
    });
  }

  function addClient(main) {
    var firma = window.prompt('Naziv firme (ili ime, ako je fizičko lice):');
    if (!firma) return;
    sb.from('clients').insert({ firma: firma.trim() }).select().single().then(function (res) {
      if (res.error) { DZ.toast('Nije dodat: ' + res.error.message); return; }
      DZ.store.clients.unshift(res.data);
      location.hash = '#/klijent/' + res.data.id;
    });
  }

  /* ---------------- detalj ---------------- */

  function renderDetail(main, id) {
    var c = find(id);
    if (!c) { location.hash = '#/klijenti'; return; }

    var t = totals(c.id);
    var mine = DZ.store.invoices.filter(function (f) { return f.client_id === c.id; });
    var lead = c.lead_id && DZ.store.leads.filter(function (l) { return l.id === c.lead_id; })[0];

    main.innerHTML =
      '<a class="back" href="#/klijenti">' + DZ.icon('nazad', 15) + 'Nazad na klijente</a>' +
      '<div class="dhead">' +
        '<h1>' + esc(c.firma || c.ime || 'Bez naziva') + '</h1>' +
        '<div class="dhead__sub">' +
          esc(c.ime || '') +
          (c.telefon ? ' — <a href="tel:' + esc(DZ.telHref(c.telefon)) + '">' + esc(c.telefon) + '</a>' : '') +
          (c.email ? ' · <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
          (c.sajt ? ' · <a href="' + esc(c.sajt) + '" target="_blank" rel="noopener">sajt</a>' : '') +
        '</div>' +
      '</div>' +

      '<div class="dgrid">' +
        '<div>' +
          DZ.kpiGroup([
            { label: 'Naplaćeno', value: DZ.fmtMoney(t.placeno) || '€0' },
            { label: 'Duguje', value: DZ.fmtMoney(t.duguje) || '€0', warn: t.duguje > 0 },
            { label: 'Faktura', value: String(t.broj) },
          ]) +

          '<div class="panel">' +
            '<div class="panel__head"><h2>Fakture</h2>' +
              (mine.length ? '<span class="panel__count">' + mine.length + '</span>' : '') +
            '</div>' +
            (mine.length
              ? '<div class="rows">' + mine.map(DZ.finansije.rowHtml).join('') + '</div>'
              : '<p class="muted">Nema faktura za ovog klijenta.</p>') +
            '<button class="btn btn--ghost" id="addInv" style="margin-top:12px">' + DZ.icon('plus', 16) + 'Nova faktura</button>' +
          '</div>' +

          (lead
            ? '<div class="panel"><div class="panel__head"><h2>Došao kao upit</h2></div>' +
                '<p><a href="#/upit/' + esc(lead.id) + '">' + esc(lead.firma || lead.ime) + '</a> — ' +
                esc(DZ.fmtDate(lead.created_at)) + ' · ' + esc(DZ.SOURCE_LABEL[lead.source] || lead.source || '') + '</p>' +
                (lead.cime_se_bavite ? '<p class="muted">' + esc(lead.cime_se_bavite.slice(0, 260)) + (lead.cime_se_bavite.length > 260 ? '…' : '') + '</p>' : '') +
              '</div>'
            : '') +

          (c.napomena
            ? '<div class="panel"><div class="panel__head"><h2>Napomena</h2></div><p>' + esc(c.napomena) + '</p></div>'
            : '') +
        '</div>' +

        '<aside class="rail">' +
          '<h2>Podaci</h2>' +
          '<label class="field"><span>Firma</span><input id="cFirma" value="' + esc(c.firma || '') + '"></label>' +
          '<label class="field"><span>Kontakt osoba</span><input id="cIme" value="' + esc(c.ime || '') + '"></label>' +
          '<label class="field"><span>Telefon</span><input id="cTel" value="' + esc(c.telefon || '') + '"></label>' +
          '<label class="field"><span>Email</span><input id="cMail" value="' + esc(c.email || '') + '"></label>' +
          '<label class="field"><span>Sajt</span><input id="cSajt" value="' + esc(c.sajt || '') + '" placeholder="https://"></label>' +
          '<label class="field"><span>Napomena</span><textarea id="cNap" rows="3">' + esc(c.napomena || '') + '</textarea></label>' +
          '<button class="btn btn--wide" id="cSave">Sačuvaj</button>' +
        '</aside>' +
      '</div>';

    $('#cSave', main).addEventListener('click', function () {
      sb.from('clients').update({
        firma: $('#cFirma', main).value.trim() || null,
        ime: $('#cIme', main).value.trim() || null,
        telefon: $('#cTel', main).value.trim() || null,
        email: $('#cMail', main).value.trim() || null,
        sajt: $('#cSajt', main).value.trim() || null,
        napomena: $('#cNap', main).value.trim() || null,
      }).eq('id', c.id).select().single().then(function (res) {
        if (res.error) { DZ.toast('Nije sačuvano: ' + res.error.message); return; }
        var i = DZ.store.clients.findIndex(function (x) { return x.id === c.id; });
        if (i !== -1) DZ.store.clients[i] = res.data;
        DZ.toast('Sačuvano');
        DZ.rerender();
      });
    });

    $('#addInv', main).addEventListener('click', function () {
      DZ.finansije.newInvoice(c.id);
    });

    DZ.finansije.wireRows(main);
  }

  return { renderList: renderList, renderDetail: renderDetail, totals: totals };
})();
