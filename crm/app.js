/* Deerzign CRM — ljuska: prijava, sidebar, ruter, zajednički keš
 * ------------------------------------------------------------------
 * Sve stranice čitaju iz jednog keša (DZ.store) koji se puni jednom po
 * prijavi. Podataka je malo (desetine redova), pa je jedno učitavanje
 * jeftinije od četiri odvojena i drži Pregled i brojke u sidebar-u
 * trenutnim.
 */
(function () {
  'use strict';

  var sb = DZ.sb, $ = DZ.$, esc = DZ.esc;

  /* ---------------- keš ---------------- */

  var store = { leads: [], clients: [], invoices: [], loaded: false };
  DZ.store = store;

  function loadAll() {
    return Promise.all([
      sb.from('leads').select('*').order('created_at', { ascending: false }),
      sb.from('clients').select('*').order('created_at', { ascending: false }),
      sb.from('invoices').select('*').order('izdato', { ascending: false }),
    ]).then(function (res) {
      var failed = res.filter(function (r) { return r.error; });
      if (failed.length) {
        /* Najčešći uzrok nije pad baze nego neusklađen mejl: prijava
           prođe, ali is_owner() ne prepozna korisnika pa RLS vrati nulu.
           Zato poruka pominje baš to. */
        DZ.toast('Greška pri učitavanju: ' + failed[0].error.message);
      }
      store.leads = res[0].data || [];
      store.clients = res[1].data || [];
      store.invoices = res[2].data || [];
      store.loaded = true;
      paintBadges();
    });
  }
  DZ.reload = loadAll;

  /* ---------------- sidebar i pretraga ---------------- */

  /* Ikone se ubacuju iz JS-a da se ne dupliraju SVG putanje u HTML-u —
     jedan izvor istine je ICONS u utils.js. */
  function paintIcons() {
    DZ.$$('.side__link[data-ico]').forEach(function (a) {
      if (a.querySelector('svg')) return;
      a.insertAdjacentHTML('afterbegin', DZ.icon(a.dataset.ico, 17));
    });
    var sw = $('#searchWrap');
    if (sw && !sw.querySelector('svg')) {
      sw.insertAdjacentHTML('afterbegin', DZ.icon('pretraga', 16));
    }
  }

  /* Pretraga je u ljusci, ne u stranici — jedna traka koja filtrira
     ono što je trenutno otvoreno, kao u svakom CRM-u. */
  DZ.q = '';
  var PLACEHOLDER = {
    '/upiti': 'Pretraga upita — ime, firma, mejl…',
    '/klijenti': 'Pretraga klijenata — firma, kontakt…',
    '/finansije': 'Pretraga faktura — klijent, broj, opis…',
  };

  function paintBadges() {
    var novih = store.leads.filter(function (l) { return l.status === 'Nov upit'; }).length;
    $('#navUpiti').textContent = novih ? String(novih) : '';

    var kasne = store.invoices.filter(function (f) {
      if (f.placeno_datum) return false;
      var od = DZ.daysOverdue(f.rok_placanja);
      return od !== null && od > 0;
    }).length;
    $('#navFin').textContent = kasne ? String(kasne) : '';
  }
  DZ.paintBadges = paintBadges;

  /* ---------------- ruter ---------------- */

  var ROUTES = [
    { re: /^\/$/,            page: 'pregled'  },
    { re: /^\/upiti$/,       page: 'upiti'    },
    { re: /^\/upit\/(.+)$/,  page: 'upit'     },
    { re: /^\/klijenti$/,    page: 'klijenti' },
    { re: /^\/klijent\/(.+)$/, page: 'klijent' },
    { re: /^\/finansije$/,   page: 'finansije' },
  ];

  function currentPath() {
    var h = location.hash.replace(/^#/, '');
    return h || '/';
  }

  function route() {
    if (!store.loaded) return;

    var path = currentPath();
    var main = $('#main');
    var hit = null, param = null;

    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i].re);
      if (m) { hit = ROUTES[i]; param = m[1]; break; }
    }
    if (!hit) { location.hash = '#/'; return; }

    /* podvučena stavka u sidebar-u prati sekciju, ne tačnu putanju —
       detalj upita i dalje osvetljava „Upiti" */
    var section = { upit: '/upiti', klijent: '/klijenti' }[hit.page] ||
                  (hit.page === 'pregled' ? '/' : '/' + hit.page);
    DZ.$$('.side__link').forEach(function (a) {
      a.classList.toggle('is-on', a.dataset.route === section);
    });

    /* Pretraga nema smisla na Pregledu ni na stranicama detalja —
       traka koja ništa ne radi je gora od trake koje nema. */
    var searchable = PLACEHOLDER[section] && hit.page === section.slice(1);
    $('#searchWrap').classList.toggle('hidden', !searchable);
    if (searchable) $('#search').placeholder = PLACEHOLDER[section];

    main.scrollTop = 0;
    window.scrollTo(0, 0);

    switch (hit.page) {
      case 'pregled':   DZ.pregled.render(main); break;
      case 'upiti':     DZ.upiti.renderBoard(main); break;
      case 'upit':      DZ.upiti.renderDetail(main, param); break;
      case 'klijenti':  DZ.klijenti.renderList(main); break;
      case 'klijent':   DZ.klijenti.renderDetail(main, param); break;
      case 'finansije': DZ.finansije.render(main); break;
    }
  }
  DZ.route = route;

  /* Ista putanja se ne menja kroz hashchange, pa je potrebno i ručno
     osvežavanje posle izmene podataka. */
  DZ.rerender = function () { route(); };

  window.addEventListener('hashchange', route);

  /* Grafikon bira viewBox po širini kontejnera, pa promena veličine
     prozora mora da ga preciscrta — inače oznake osa ostanu skalirane
     za pogrešnu širinu. Odloženo, da se ne crta na svaki piksel. */
  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(route, 180);
  });

  /* ---------------- prijava ---------------- */

  function showLogin() {
    $('#loginView').classList.remove('hidden');
    $('#appView').classList.add('hidden');
  }

  function start(session) {
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    $('#whoami').textContent = (session && session.user && session.user.email) || '';
    paintIcons();
    loadAll().then(route);
  }

  $('#search').addEventListener('input', function (e) {
    DZ.q = e.target.value.trim().toLowerCase();
    route();
  });

  $('#refreshBtn').addEventListener('click', function () {
    loadAll().then(function () { route(); DZ.toast('Osveženo'); });
  });

  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('#loginBtn');
    btn.disabled = true;
    $('#loginErr').textContent = '';
    sb.auth.signInWithPassword({
      email: $('#loginEmail').value.trim(),
      password: $('#loginPass').value,
    }).then(function (res) {
      btn.disabled = false;
      if (res.error) { $('#loginErr').textContent = res.error.message; return; }
      start(res.data.session);
    });
  });

  $('#logoutBtn').addEventListener('click', function () {
    sb.auth.signOut().then(function () { location.reload(); });
  });

  sb.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (session) start(session); else showLogin();
  });
})();
