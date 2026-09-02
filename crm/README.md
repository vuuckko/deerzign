# Deerzign CRM

Interni pregled poslovanja. Nije linkovan sa sajta, `noindex`, `Disallow: /crm/`
u `robots.txt`. Postavlja se na `deerzign.com/crm/` zajedno sa ostatkom sajta.

Zaštita je **login + RLS**, ne skrivenost adrese. Ko pogodi URL vidi login formu
i ništa iza nje.

## Stranice

| Stranica | Šta je | Ručni unos |
|---|---|---|
| **Pregled** | naplaćeno kroz godinu, levak upita, stopa konverzije | nema |
| **Upiti** | jedna kutija po upitu: otvoreni su crni i stoje gore, zaključeni pozelene i padnu ispod crte, odbijeni posive | faza + „Dogovoreno" |
| **Klijenti** | mreža kartica: ko je klijent, koliko je doneo, ko duguje, ko je arhiviran | naplata, arhiviranje |
| **Finansije** | fakture, ko duguje, naplaćeno po mesecu i godini | po fakturi |

Upit koji prebaciš na „Dobijen posao" **sam postaje klijent**. Klijenta koji nije
došao preko forme (outreach) dodaješ ručno na stranici Klijenti.

### Upiti — kako se koristi

Kutija nosi sve iz Sheet reda što treba da bi se odlučilo bez otvaranja: izvor i
datum, paket sa cenovnika ako ga je birao, koliko je fajlova poslao, šta traži,
budžet, rok, čime se bavi, telefon i mejl.

U redu odluke levo stoje **faze** (`Nov upit` → `Kontaktiran` → `Ponuda poslata`) —
to je gde je upit sada. Desno stoji jedina prava odluka: **`Dogovoreno`** (ember
dugme) i tiho **`Odbij`**. Kad klikneš `Dogovoreno`, kutija pozeleni na mestu, pa
padne ispod crte „Zaključeno" i napravi klijenta. `Vrati u toku` je tu za promašen
klik — vraća upit u `Ponuda poslata`.

Meta signal o zaključenom poslu ide tek kad u detalju upišeš **stvarnu vrednost**.

### Klijenti — kako se koristi

Mreža, ne kolona — klijenti se ne obrađuju jedan po jedan nego se pregledaju svi odjednom.
Tri kartice u redu na širokom ekranu, dve na užem, jedna na telefonu.

**Redosled radi posao stranice**, ne boja (svaki klijent je već dogovoren posao, pa su svi
zeleni). Gore idu oni koji duguju — prvo ko najduže kasni, pa ko duguje najviše. Za njima
ostali po poslednjoj aktivnosti. Arhivirani padnu ispod crte i posive.

Velika brojka je **naplaćeno**, ne fakturisano — isto pravilo kao na Finansijama: prihod se
broji kad legne. Traka ispod nje je srazmerna najvećem klijentu na stranici (belo = naplaćeno,
ember = duguje), pa se veličina klijenta vidi bez čitanja brojki.

`Naplaćeno €X` se pojavljuje samo kad klijent ima **tačno jednu** neplaćenu fakturu — tada je
jednoznačno koju naplaćuješ i jedan klik upiše današnji datum. Sa dve i više dugme vodi u
detalj, gde su redovi. Klijent bez duga nema to dugme uopšte.

## Kako je povezano

```
brief.html
    │  POST
    ▼
Apps Script  ──► Sheet "Upiti"        ← primarni prijemnik, uvek prvi
    │            Drive folder          ← arhiva materijala, ostaje
    │            Meta CAPI "Lead"      ← netaknuto
    │
    └─ best-effort ─► Supabase: leads + lead_files + Storage
                            │
                            ▼
                      crm/ (ova alatka)
                            │
                            └─ status = "Dobijen posao" + vrednost
                                   │  POST {action:"wonDeal"}
                                   ▼
                             Apps Script ──► Meta CAPI "Purchase"
```

Ako Supabase spava ili padne, prijava je i dalje u Sheet-u i može se kasnije
prekopirati. **Nijedan lead ne propada zbog CRM-a** — zato Sheet ostaje prvi.

## Podešavanje — jednom

1. **Supabase projekat.** Napravi nov projekat (preporuka; ne mešaj sa
   InvKlubom). Free projekat se pauzira posle 7 dana bez saobraćaja — otud
   gornje pravilo da Sheet ostaje prijemnik.

2. **Shema.** SQL Editor → New query → nalepi ceo `schema.sql` → Run.
   Zatim isto to sa `schema-2.sql` (Klijenti + Finansije).
   Ako ti mejl nije `andrejvuckovic44@gmail.com`, promeni ga u `is_owner()`
   na vrhu `schema.sql` **pre** pokretanja. To je jedino mesto gde stoji.

3. **Nalog.** Authentication → Users → Add user → Create new user.
   Mejl **mora** biti isti kao u `is_owner()`, i **čekiraj „Auto Confirm User"**.
   Ako se mejlovi razlikuju, prijava prođe ali su sve stranice prazne — RLS te
   ne prepozna kao vlasnika i vrati nula redova, bez ijedne poruke o grešci.

4. **`config.js`.** Project Settings → API → prekopiraj `Project URL` i
   `anon public` ključ. Anon ključ sme da bude javan.

5. **Apps Script.** U `brief-apps-script.gs` postavi `SUPABASE_URL`.
   Zatim Project Settings → Script Properties → dodaj
   `SUPABASE_SERVICE_KEY` = `service_role` ključ iz Supabase-a.
   **Taj ključ nikad ne ide u fajl** — zaobilazi RLS i otvara celu bazu.
   Na kraju: Deploy → Manage deployments → edit → New version.
   Bez redeploya stari kod nastavlja da radi.

6. **Provera.** Pošalji test prijavu kroz `brief.html`. Treba da se pojavi
   red u Sheet-u *i* kartica u koloni „Nov upit".

7. **Stari upiti.** Kad sve radi, jednom pozovi `{action:"backfillSupabase"}`
   da se postojeći redovi iz Sheet-a prekopiraju. Bezbedno je ponoviti.

## Fajlovi

| Fajl | Šta je |
|---|---|
| `index.html` | ljuska — login, sidebar, kontejner |
| `app.js` | prijava, ruter (`#/upiti`, `#/klijent/<id>`…), zajednički keš |
| `utils.js` | escape, datumi, novac, toast |
| `upiti.js` · `klijenti.js` · `finansije.js` · `pregled.js` | stranice |
| `charts.js` | grafikoni na Pregledu — inline SVG, bez biblioteke |
| `crm.css` | Deerzign paleta; strukturne odluke iz InvKlub portala |
| `zip.js` | „Preuzmi sve" — store-only ZIP, bez biblioteke i bez CDN-a |
| `config.js` | URL, anon ključ, endpoint |
| `schema.sql` · `schema-2.sql` | tabele, RLS, Storage bucket |

## Napomene

- **Statusi su ugovor.** `Dobijen posao` mora da se piše tačno tako — ista
  vrednost stoji u `CRM_WON_STATUS` u Apps Script-u. Menjaš li je, menjaj na
  oba mesta plus `constraint leads_status_valid` u `schema.sql`.

- **`SB_FIELD_MAP` u Apps Script-u prati `data-col` labele iz `brief.html`.**
  Promeniš li labelu u formi, to polje ovde tiho ostane prazno. Vidi
  `automation/PLAYBOOK.md`.

- **Meta signal ide direktnim pozivom, ne preko Sheet-a.** Instalirani
  „on edit" triger u Google Sheets-u okida se samo na izmenu koju napravi
  čovek u tabeli — izmena iz skripte ga ne pokreće. Zato CRM zove
  `{action:"wonDeal"}`, a `onCrmValueEdit` ostaje za ručne izmene.

- **Status fakture se ne čuva.** Izvodi se iz datuma (`placeno_datum`,
  `rok_placanja`), pa status i datumi ne mogu da se raziđu.

- **Prihod se broji kad je NAPLAĆEN**, ne kad je faktura izdata. Zato
  „Naplaćeno 2026" i zbir po mesecima gledaju `placeno_datum`.

- **Nema poreskih pragova u kodu.** Namerno — pravila za frilenser
  oporezivanje se menjaju i ne treba da budu zakucana ovde. Stranica daje
  tačan godišnji zbir, prag držiš ti.

- **Rampa levka je proverena, ne izabrana po oku.** `RAMP` u `charts.js`
  (`#EC9E8A → #8A1E0B`) prolazi četiri ordinal testa: monotona svetlina,
  razmaci ≥0.06, svetli kraj 2.10:1 nad površinom, raspon tona 3°. Ako ti
  ikad zatreba druga, propusti je kroz isti validator — svetlije varijante
  padaju na kontrastu prema beloj podlozi.

- **Dužina trake u levku sme da zavisi samo od podatka.** Mreža je jedna,
  na `.fun`, a redovi su `display:contents`. Kad je svaki red bio sopstvena
  mreža, širina labele je menjala širinu staze, pa su se dve faze sa istom
  vrednošću crtale različito dugačko.

- **Testiranje bez baze.** Postojao je harness sa lažnim podacima koji
  stubuje `window.supabase` pre učitavanja ostalih skripti, pa se sve četiri
  stranice mogu gledati bez prijave. Obrisan je iz ovog foldera da ne ode na
  živi sajt; kopija je u scratchpadu sesije (`crm-test-harness.html`).
