/* Deerzign CRM — Upiti (tabla + detalj upita) */
DZ.upiti = (function () {
  'use strict';

  var sb = DZ.sb, esc = DZ.esc, $ = DZ.$, $$ = DZ.$$;
  var STATUSES = DZ.STATUSES, WON = DZ.WON;

  /* ---------------- spisak ----------------
   * Namerno NIJE kanban tabla. Sa šest upita pet jednakih kolona drži po
   * jednu karticu, 65% ekrana je prazno, a prevlačenje je gest koji se
   * radi dvaput mesečno. Uz to kartica nije govorila ni šta klijent traži
   * ni koliki mu je budžet — moralo se kliknuti da bi se saznalo išta.
   *
   * Levak kao OBLIK i dalje postoji, ali na Pregledu i kao grafikon —
   * tamo je to tačna forma. Ovde je posao drugi: koga zvati sada.
   */

  function visible() {
    var all = DZ.store.leads;
    if (!DZ.q) return all;
    return all.filter(function (l) {
      return [l.ime, l.firma, l.email, l.telefon, l.cime_se_bavite]
        .some(function (v) { return String(v || '').toLowerCase().indexOf(DZ.q) !== -1; });
    });
  }

  /* Koliko je fajlova klijent poslao uz upit — jedan upit po tabli,
     keširano. Ne stoji u DZ.store jer je ovo jedina stranica kojoj treba. */
  var filesBy = null;
  function loadFileCounts() {
    if (filesBy) return Promise.resolve(filesBy);
    return sb.from('lead_files').select('lead_id').then(function (res) {
      filesBy = {};
      (res.data || []).forEach(function (r) {
        filesBy[r.lead_id] = (filesBy[r.lead_id] || 0) + 1;
      });
      return filesBy;
    });
  }

  /* Svaki upit je ista kutija. Otvoreni su crni i stoje gore; zaključen
     pozeleni i padne dole; odbijen posivi i padne najniže. Veličina se
     NE menja — sadržaj je isti u sva tri stanja, menja se samo podloga,
     red odluke i mesto u nizu. */
  function stanje(l) {
    if (l.status === WON) return 'won';
    if (l.status === 'Odbijen') return 'lost';
    return 'open';
  }
  var RANG = { open: 0, won: 1, lost: 2 };

  function renderBoard(main) {
    var leads = visible().slice().sort(function (a, b) {
      var ra = RANG[stanje(a)], rb = RANG[stanje(b)];
      if (ra !== rb) return ra - rb;
      /* unutar iste grupe: najskoriji gore */
      return new Date(b.created_at) - new Date(a.created_at);
    });

    var otvorenih = leads.filter(function (l) { return stanje(l) === 'open'; }).length;
    var zatvorenih = leads.length - otvorenih;

    /* Crta pre prvog zaključenog. Sa šest upita boja je dovoljna, ali kad
       ih bude četrdeset granica između „radi se" i „gotovo" mora da postoji. */
    var podeljeno = false;
    var lista = leads.map(function (l) {
      var pre = '';
      if (!podeljeno && stanje(l) !== 'open') {
        podeljeno = true;
        pre = '<div class="usplit"><span>Zaključeno</span><i></i></div>';
      }
      return pre + boxHtml(l);
    }).join('');

    main.innerHTML =
      '<div class="page__head">' +
        '<h1>Upiti</h1>' +
        '<span class="page__note">' + otvorenih + ' otvoreno · ' + zatvorenih + ' zatvoreno</span>' +
      '</div>' +
      (leads.length
        ? '<div class="uboxes" id="uboxes">' + lista + '</div>'
        : '<div class="panel">' + DZ.emptyHtml(
            DZ.q ? 'Nema upita koji odgovara pretrazi.'
                 : 'Nema upita. Novi stižu sami sa forme na sajtu.') + '</div>');

    wireBoxes(main);
    paintFiles(main);
  }

  /* Broj fajlova stiže posle prvog crtanja i upisuje se na mesto — bez
     ponovnog rendera, da se kutije ne pomere pod rukom. */
  function paintFiles(main) {
    if (!$('[data-files]', main)) return;
    loadFileCounts().then(function (map) {
      $$('[data-files]', main).forEach(function (el) {
        var n = map[el.dataset.files] || 0;
        if (n) el.textContent = ' · ' + DZ.mnozina(n, ['fajl', 'fajla', 'fajlova']);
      });
    });
  }

  function boxHtml(l) {
    var st = stanje(l);
    var linija = [l.sta_treba, l.budzet, l.rok].filter(Boolean).join('  ·  ');

    /* Desno gore: kod otvorenog koliko je star, kod zaključenog koliko
       je posao vredeo. Isti prostor, druga informacija. */
    var desno = st === 'won'
      ? (DZ.fmtMoney(l.vrednost || l.cena) || 'dobijen')
      : (st === 'lost' ? 'odbijen' : DZ.ageLabel(DZ.daysSince(l.created_at)));

    return '<article class="ubox ubox--' + st + '" data-id="' + esc(l.id) + '">' +
      '<div class="ubox__top">' +
        '<div class="ubox__head">' +
          '<span class="ubox__meta">' +
            esc(DZ.SOURCE_LABEL[l.source] || l.source || 'upit') + ' · ' + esc(DZ.fmtDate(l.created_at)) +
            /* došao sa cenovnika sa već izabranim paketom — najjači signal
               namere koji forma uopšte šalje, pa stoji u prvom redu */
            (l.paket_sa_cenovnika ? '<b class="ubox__tag">' + esc(l.paket_sa_cenovnika) + '</b>' : '') +
            '<span data-files="' + esc(l.id) + '"></span>' +
          '</span>' +
          '<h2 class="ubox__name">' + esc(l.firma || l.ime || 'Bez naziva') + '</h2>' +
          (linija ? '<p class="ubox__line">' + esc(linija) + '</p>' : '') +
          /* čime se bavi — ono zbog čega se do sada moralo otvarati da bi
             se znalo ko je uopšte pisao; CSS ga seče na dva reda */
          (l.cime_se_bavite ? '<p class="ubox__about">' + esc(l.cime_se_bavite) + '</p>' : '') +
        '</div>' +
        '<span class="ubox__right">' + esc(desno) + '</span>' +
      '</div>' +

      '<div class="ubox__act">' +
        (l.telefon
          ? '<a class="ubox__tel" href="tel:' + esc(DZ.telHref(l.telefon)) + '">' + esc(l.telefon) + '</a>'
          : '<span class="ubox__tel ubox__tel--none">bez telefona</span>') +
        (l.email ? '<a class="ubox__mail" href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '') +
        '<a class="ubox__open" href="#/upit/' + esc(l.id) + '">Otvori upit →</a>' +
      '</div>' +

      doHtml(l) +
    '</article>';
  }

  /* Red odluke.
   * Pet ravnopravnih dugmadi je bio spisak podešavanja, a odluka je ovde
   * tačno jedna: je li posao dogovoren. Zato faze stoje levo i tiho (gde
   * je upit sada), a odluka desno (šta radim s njim). Zaključena kutija
   * ne nosi faze uopšte — samo povratak, za slučaj promašenog klika.
   * Koristi samo l.id i l.status, pa sme da se pozove i sa {id, status}. */
  function doHtml(l) {
    var id = esc(l.id);

    if (stanje(l) !== 'open') {
      return '<div class="ubox__do ubox__do--done">' +
        '<button class="udo udo--back" data-set="' + id + '" data-status="Ponuda poslata" ' +
          'title="Vraća upit među otvorene, u fazu „Ponuda poslata”">Vrati u toku</button>' +
      '</div>';
    }

    return '<div class="ubox__do">' +
      '<div class="ubox__ph">' +
        ['Nov upit', 'Kontaktiran', 'Ponuda poslata'].map(function (s) {
          return '<button data-set="' + id + '" data-status="' + esc(s) + '"' +
            (l.status === s ? ' class="is-on"' : '') + '>' + esc(s) + '</button>';
        }).join('') +
      '</div>' +
      '<button class="udo udo--no" data-set="' + id + '" data-status="Odbijen">Odbij</button>' +
      '<button class="udo udo--go" data-set="' + id + '" data-status="' + esc(WON) + '">Dogovoreno</button>' +
    '</div>';
  }

  function wireBoxes(root) {
    $$('[data-set]', root).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        setStatus(b.dataset.set, b.dataset.status, b.closest('.ubox'));
      });
    });
  }

  /* ---------------- izmene ---------------- */

  function find(id) {
    return DZ.store.leads.filter(function (l) { return l.id === id; })[0];
  }

  function patch(id, fields) {
    return sb.from('leads').update(fields).eq('id', id).select().single()
      .then(function (res) {
        if (res.error) { DZ.toast('Nije sačuvano: ' + res.error.message); return null; }
        var i = DZ.store.leads.findIndex(function (l) { return l.id === id; });
        if (i !== -1) DZ.store.leads[i] = res.data;
        DZ.paintBadges();
        return res.data;
      });
  }
  DZ.upitiPatch = patch;

  function setStatus(id, status, boxEl) {
    var lead = find(id);
    if (!lead || lead.status === status) return;

    /* Boja se menja NA MESTU pa se tek onda lista presloži. Da odmah
       pozovemo rerender, čvor bi bio zamenjen novim i prelaz boje se ne
       bi ni video — kutija bi samo skočila dole već zelena. */
    if (boxEl) {
      boxEl.classList.remove('ubox--open', 'ubox--won', 'ubox--lost');
      boxEl.classList.add('ubox--' + (status === WON ? 'won' : (status === 'Odbijen' ? 'lost' : 'open')));

      /* Red odluke nije isti u sva tri stanja — zaključena kutija nema
         faze — pa se prezida na licu mesta i ponovo poveže. Menja se samo
         taj red, da prelaz podloge na ostatku kutije ne bude prekinut. */
      var stari = boxEl.querySelector('.ubox__do');
      if (stari) {
        var tmp = document.createElement('div');
        tmp.innerHTML = doHtml({ id: id, status: status });
        var novi = tmp.firstChild;
        stari.replaceWith(novi);
        wireBoxes(novi);
      }
    }

    patch(id, { status: status }).then(function (updated) {
      if (!updated) return;
      /* 320ms = trajanje prelaza podloge; posle toga se niz presloži */
      setTimeout(DZ.rerender, boxEl ? 320 : 0);

      if (status === WON) {
        ensureClient(updated);
        if (!updated.vrednost) DZ.toast('Upiši stvarnu vrednost posla da signal ode Meti');
        else maybeSendWonDeal(updated);
      }
    });
  }

  /* Zaključen posao pravi klijenta sam — unique indeks na lead_id
     sprečava dupliranje ako se status vrati pa opet prebaci. */
  function ensureClient(lead) {
    if (DZ.store.clients.some(function (c) { return c.lead_id === lead.id; })) return;
    sb.from('clients').insert({
      lead_id: lead.id,
      firma: lead.firma || null,
      ime: lead.ime || null,
      telefon: lead.telefon || null,
      email: lead.email || null,
    }).select().single().then(function (res) {
      if (res.error) return;   // najverovatnije 409 iz unique indeksa
      DZ.store.clients.unshift(res.data);
      DZ.toast('Klijent dodat u Klijente');
    });
  }

  /* ---------------- Meta: signal o zaključenom poslu ----------------
   * Zove Apps Script, koji već ima sendWonDealToMeta_() i token.
   *
   * NE ide preko upisa u CRM tab Sheet-a: instalirani "on edit" triger
   * okida se samo na izmenu koju napravi čovek u tabeli, nikad na izmenu
   * iz skripte. Da smo se oslonili na to, signal bi tiho prestao.
   */
  function maybeSendWonDeal(lead) {
    if (!DZ.CFG.APPS_SCRIPT_ENDPOINT) return;
    if (lead.meta_signal_at) return;
    if (!lead.vrednost) return;
    if (!lead.email && !lead.telefon) return;

    /* Content-Type: text/plain tera browser da preskoči CORS preflight,
       koji Apps Script /exec ne ume da odgovori.
       Namerno NIJE mode:'no-cors': tamo fetch uspe i kad poziv padne, pa
       bi signal bio obeležen kao poslat a nikad ne bi otišao. */
    fetch(DZ.CFG.APPS_SCRIPT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'wonDeal',
        email: lead.email || '',
        phone: lead.telefon || '',
        value: lead.vrednost,
      }),
    }).then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.error) || 'Meta je odbila signal');
        return patch(lead.id, { meta_signal_at: new Date().toISOString() });
      })
      .then(function () { DZ.toast('Signal o poslu poslat Meti'); })
      .catch(function (e) {
        DZ.toast('Signal Meti nije prošao (' + e.message + ') — probaj ponovo dugmetom Sačuvaj');
      });
  }

  /* ---------------- detalj ---------------- */

  function renderDetail(main, id) {
    var l = find(id);
    if (!l) { location.hash = '#/upiti'; return; }

    var kontakt = [
      l.telefon ? '<a href="tel:' + esc(DZ.telHref(l.telefon)) + '">' + esc(l.telefon) + '</a>' : '',
      l.email ? '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '',
    ].filter(Boolean).join(' · ');

    /* Unutar panela ovo su podnaslovi, ne novi naslovi — h2 na svakom
       bloku bi napravio pet ravnopravnih nivoa u jednoj kartici. */
    var free = function (label, val) {
      if (!val) return '';
      return '<div class="sub"><span class="sub__l">' + esc(label) + '</span>' +
             '<p>' + esc(val) + '</p></div>';
    };
    var row = function (label, val) {
      if (!val) return '';
      return '<dt>' + esc(label) + '</dt><dd>' + esc(val) + '</dd>';
    };

    main.innerHTML =
      '<a class="back" href="#/upiti">' + DZ.icon('nazad', 15) + 'Nazad na tablu</a>' +
      '<div class="dhead">' +
        '<h1>' + esc(l.firma || l.ime || 'Bez naziva') + '</h1>' +
        '<div class="dhead__sub">' + esc(l.ime || '') + (kontakt ? ' — ' : '') + kontakt + '</div>' +
        '<div class="statusbar">' +
          STATUSES.map(function (st) {
            return '<button data-status="' + esc(st) + '"' +
              (l.status === st ? ' class="is-on"' : '') + '>' + esc(st) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="dgrid">' +
        '<div>' +
          /* Jedna površina nosi ceo upit — činjenice pa klijentov tekst.
             Osam odvojenih kartica bi razbilo ono što je jedna misao. */
          '<div class="panel">' +
            '<div class="panel__head"><h2>Upit</h2></div>' +
            '<dl class="facts">' +
              row('Šta', l.sta_treba) +
              row('Rok', l.rok) +
              row('Budžet', l.budzet) +
              row('Sa cenovnika', l.paket_sa_cenovnika) +
              row('Stigao', DZ.fmtDate(l.created_at) + ' · ' + (DZ.SOURCE_LABEL[l.source] || l.source || '')) +
              row('Stranica', l.stranica) +
            '</dl>' +
            free('Čime se bavi', l.cime_se_bavite) +
            free('Linkovi', l.linkovi) +
            free('Adresa, radno vreme, kontakt', l.adresa) +
            free('Ostalo', l.ostalo) +
          '</div>' +

          '<div class="panel">' +
            '<div class="panel__head"><h2>Materijali</h2></div>' +
            '<div id="filesHost"><p class="muted">Učitavam…</p></div>' +
            (l.drive_folder
              ? '<p style="margin-top:10px"><a class="file__dl" href="' + esc(l.drive_folder) + '" target="_blank" rel="noopener">' +
                DZ.icon('spolja', 14) + 'Drive folder (arhiva)</a></p>'
              : '') +
          '</div>' +

          '<div class="panel">' +
            '<div class="panel__head"><h2>Analiza</h2></div>' +
            (l.analiza ? '<p>' + esc(l.analiza) + '</p>'
                       : '<p class="muted">Još nema analize — pokreni /proveri-prijave.</p>') +
          '</div>' +

          '<div class="panel">' +
            '<div class="panel__head"><h2>Beleške</h2></div>' +
            '<label class="field"><textarea id="noteInput" rows="3" placeholder="Šta je rečeno na pozivu…"></textarea></label>' +
            '<button class="btn btn--ghost" id="noteAdd">Dodaj belešku</button>' +
            '<div class="notes" id="notesHost" style="margin-top:14px"></div>' +
          '</div>' +
        '</div>' +
        '<aside class="rail">' +
          '<h2>Posao</h2>' +
          '<label class="field"><span>Paket</span><input id="fPaket" value="' + esc(l.paket || '') + '" placeholder="Landing / Poslovni / Signature"></label>' +
          '<label class="field"><span>Okvirna cena (€)</span><input id="fCena" type="number" step="1" value="' + esc(l.cena == null ? '' : l.cena) + '"></label>' +
          '<label class="field"><span>Stvarna vrednost (€)</span><input id="fVrednost" type="number" step="1" value="' + esc(l.vrednost == null ? '' : l.vrednost) + '"></label>' +
          '<label class="field"><span>Sledeće javljanje</span><input id="fSledeci" type="date" value="' + esc(DZ.inputDate(l.sledeci_kontakt)) + '"></label>' +
          '<button class="btn btn--wide" id="saveRail">Sačuvaj</button>' +
          '<p class="muted" style="font-size:12.6px;margin-top:10px">' +
            (l.meta_signal_at ? 'Meta signal poslat ' + esc(DZ.fmtDate(l.meta_signal_at))
                              : 'Meta signal ide kad status bude „' + WON + '" i vrednost bude upisana.') +
          '</p>' +
        '</aside>' +
      '</div>';

    $$('.statusbar button', main).forEach(function (b) {
      b.addEventListener('click', function () { setStatus(l.id, b.dataset.status); });
    });

    $('#saveRail', main).addEventListener('click', function () {
      patch(l.id, {
        paket: $('#fPaket', main).value.trim() || null,
        cena: DZ.num($('#fCena', main).value),
        vrednost: DZ.num($('#fVrednost', main).value),
        sledeci_kontakt: $('#fSledeci', main).value || null,
      }).then(function (updated) {
        if (!updated) return;
        DZ.toast('Sačuvano');
        if (updated.status === WON) maybeSendWonDeal(updated);
      });
    });

    $('#noteAdd', main).addEventListener('click', function () {
      var body = $('#noteInput', main).value.trim();
      if (!body) return;
      sb.from('lead_notes').insert({ lead_id: l.id, body: body }).then(function (res) {
        if (res.error) { DZ.toast('Beleška nije sačuvana'); return; }
        $('#noteInput', main).value = '';
        loadNotes(main, l);
      });
    });

    loadFiles(main, l);
    loadNotes(main, l);
  }

  /* ---------------- beleške ---------------- */

  function loadNotes(main, l) {
    sb.from('lead_notes').select('*').eq('lead_id', l.id)
      .order('created_at', { ascending: false })
      .then(function (res) {
        var host = $('#notesHost', main);
        if (!host) return;
        var rows = res.data || [];
        if (!rows.length) { host.innerHTML = '<p class="muted">Još nema beleški.</p>'; return; }
        host.innerHTML = rows.map(function (n) {
          return '<div class="note">' +
            '<div class="note__when">' + esc(DZ.fmtDate(n.created_at)) +
              '<button class="note__del" data-note="' + esc(n.id) + '">obriši</button></div>' +
            '<div class="note__body">' + esc(n.body) + '</div></div>';
        }).join('');
        $$('[data-note]', host).forEach(function (b) {
          b.addEventListener('click', function () {
            sb.from('lead_notes').delete().eq('id', b.dataset.note)
              .then(function () { loadNotes(main, l); });
          });
        });
      });
  }

  /* ---------------- materijali ---------------- */

  function loadFiles(main, l) {
    sb.from('lead_files').select('*').eq('lead_id', l.id)
      .order('created_at', { ascending: true })
      .then(function (res) {
        var host = $('#filesHost', main);
        if (!host) return;
        var files = res.data || [];
        if (!files.length) { host.innerHTML = '<p class="muted">Nije poslao materijale.</p>'; return; }

        host.innerHTML =
          '<div class="files">' + files.map(function (f) {
            return '<figure class="file" style="margin:0" data-path="' + esc(f.storage_path) + '">' +
              (DZ.isImage(f.mime_type, f.name)
                ? '<img alt="' + esc(f.name) + '">'
                : '<div class="file__doc">' + esc((f.name.split('.').pop() || 'fajl').toUpperCase()) + '</div>') +
              '<figcaption class="file__row">' +
                '<span class="file__name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
                '<button class="file__dl" data-dl="' + esc(f.id) + '">' + DZ.icon('preuzmi', 14) + 'preuzmi</button>' +
              '</figcaption></figure>';
          }).join('') + '</div>' +
          (files.length > 1 ? '<button class="btn btn--ghost" id="dlAll" style="margin-top:10px">Preuzmi sve (.zip)</button>' : '');

        /* Duži rok (1h) da slike stoje dok gledaš stranicu; link i dalje ističe. */
        files.forEach(function (f) {
          if (!DZ.isImage(f.mime_type, f.name)) return;
          sb.storage.from(DZ.CFG.BUCKET).createSignedUrl(f.storage_path, 3600).then(function (r) {
            if (r.error) return;
            var img = host.querySelector('[data-path="' + CSS.escape(f.storage_path) + '"] img');
            if (!img) return;
            img.src = r.data.signedUrl;
            /* Pločica pokazuje da nešto postoji; klik daje da se vidi. */
            img.addEventListener('click', function () {
              window.open(r.data.signedUrl, '_blank', 'noopener');
            });
          });
        });

        $$('[data-dl]', host).forEach(function (b) {
          b.addEventListener('click', function () {
            var f = files.filter(function (x) { return x.id === b.dataset.dl; })[0];
            if (f) downloadOne(f);
          });
        });

        var all = host.querySelector('#dlAll');
        if (all) all.addEventListener('click', function () { downloadAll(l, files, all); });
      });
  }

  /* download:<ime> tera Content-Disposition: attachment, pa browser snima
     fajl umesto da ga otvori u tabu. */
  function downloadOne(f) {
    sb.storage.from(DZ.CFG.BUCKET).createSignedUrl(f.storage_path, 60, { download: f.name })
      .then(function (r) {
        if (r.error) throw new Error(r.error.message);
        window.location.href = r.data.signedUrl;
      })
      .catch(function (e) { DZ.toast('Preuzimanje nije uspelo: ' + e.message); });
  }

  function downloadAll(lead, files, btn) {
    btn.disabled = true;
    btn.textContent = 'Pakujem…';

    Promise.all(files.map(function (f) {
      return sb.storage.from(DZ.CFG.BUCKET).createSignedUrl(f.storage_path, 120)
        .then(function (r) {
          if (r.error) throw new Error(r.error.message);
          return fetch(r.data.signedUrl);
        })
        .then(function (resp) {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.arrayBuffer();
        })
        .then(function (buf) { return { name: f.name, data: new Uint8Array(buf) }; });
    })).then(function (entries) {
      var base = (lead.firma || lead.ime || 'materijali').replace(/[\\/:*?"<>|]/g, '-').trim();
      var url = URL.createObjectURL(window.makeZip(entries));
      var a = document.createElement('a');
      a.href = url; a.download = base + ' — materijali.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      btn.disabled = false; btn.textContent = 'Preuzmi sve (.zip)';
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Preuzmi sve (.zip)';
      DZ.toast('Pakovanje nije uspelo: ' + e.message);
    });
  }

  return { renderBoard: renderBoard, renderDetail: renderDetail };
})();
