# Deerzign brief → CRM + izveštaj (playbook)

Ovo pokreće zakazani zadatak dva puta dnevno (08:00/18:00) i `/proveri-prijave` na zahtev.
Sve živi u Google-u (Sheet "Upiti" + tab "CRM" + jedan running Google Doc) preko Apps Script
web app-a deployovanog iz `brief-apps-script.gs`. Nema lokalnih Word/Excel fajlova — ništa se
ne čuva van Google-a.

Endpoint (iz `ENDPOINT` u `brief.html`):
`https://script.google.com/macros/s/AKfycbysPbaDWkhf1Be_vFjsGDMeiizoSDYRHfo_Iv98EpZz-RRFjiS3vBAgRLRiNY5hVHkv/exec`

**Napomena o kolonama**: `brief.html` je 2026-07-27 skraćen sa 26 na ~14 pitanja (3 koraka
umesto 4 — vidi listu ispod). Stariji redovi u Sheet-u i dalje imaju kolone koje novi brief
više ne šalje (npr. "Domen i hosting", "Usluga 2", "Ton komunikacije") — to su prazne za nove
redove, normalno je, ne pokušavaj da ih popuniš.

## Dva izvora leadova

Postoje **dva odvojena izvora** koje svaka provera mora proveriti — ne samo brief.html:

1. **`Upiti`** (brief.html na sajtu) — pun brief, 3 koraka, opisan ispod u ovom fajlu.
2. **`Leads Meta Ads`** (Meta-ina native Lead Ads / Instant Form integracija — Meta sama upisuje
   redove u ovaj tab, mi ništa ne šaljemo tamo) — kratka forma od 2 pitanja + kontakt, vidi
   posebnu sekciju "Meta Lead Ads (native forma)" niže. **Ne meša se sa Upiti-jem** — ima svoj
   endpoint, svoju logiku obeležavanja i lakšu, drugačiju analizu jer ima mnogo manje podataka.

## Koraci

1. **GET `?action=unprocessed`** — vraća `{ok, count, rows:[...]}`, svaki red ima sva polja iz
   brief-a plus `_row` (broj reda u Sheet-u, treba za korak 3). Ako `count` je 0 — gotovo, ništa
   se ne radi.

   **I** **GET `?action=unprocessedMetaLeads`** — vraća `{ok, count, rows:[...]}` za "Leads Meta
   Ads" tab, svaki red ima `_leadId` (string, treba za markMetaLeadsProcessed) plus `Ime i
   prezime, Telefon, Email, Budžet (Meta forma), Rok (Meta forma), Kampanja, Vreme`. Meta-ini
   sopstveni test/dummy redovi (sadrže "dummy data" u imenu ili telefonu) se automatski
   preskaču i markiraju obrađenim od strane samog endpoint-a — ne pojavljuju se ovde, ne treba
   ih ni tražiti ni prijavljivati u rezimeu.

   Obrađuj oba izvora u istoj proveri, redom (prvo Upiti, pa Meta Leads), ali potpuno odvojeno —
   svaki ima svoj set poziva i svoje pravilo za markProcessed (koraci 3a/3b ispod).

2. Za svaki red iz **Upiti** uradi analizu (pravila ispod) i sastavi:
   - **Doc sekciju** (`POST {action:"appendReport", client:{...}}`) — polja `naziv, ime, firma,
     telefon, email, sta_treba, paket, cena, rok, folder, items:[[naslov, tekst], ...]`.
     `appendReport` vraća `docUrl`.
   - **CRM red** (`POST {action:"upsertCrm", row:{...}}`) — kolone tačno kao `CRM_HEADER` u
     `.gs`-u: `Datum, Ime i prezime, Firma, Telefon, Email, Šta je potrebno, Preporučeni paket,
     Okvirna cena, Rok, Status, Sledeći korak, Link ka izveštaju, Link ka materijalima, Napomena`.
     "Link ka izveštaju" = `docUrl` iz prethodnog poziva (zato Doc ide prvo, pa tek onda CRM).
3a. **markProcessed** (`POST {action:"markProcessed", rows:[_row, _row, ...]}`) — svi obrađeni
   redovi iz **Upiti** odjednom, na kraju, tek kad su CRM i Doc upisi za sve njih uspešno prošli.
3b. Za svaki red iz **Leads Meta Ads** uradi lakšu analizu (pravila u sekciji "Meta Lead Ads"
   niže) i sastavi Doc sekciju + CRM red na isti način (appendReport pa upsertCrm), zatim
   **markMetaLeadsProcessed** (`POST {action:"markMetaLeadsProcessed", ids:[_leadId, _leadId,
   ...]}`) — svi obrađeni Meta Leads odjednom, na kraju, tek kad su CRM i Doc upisi uspešno
   prošli. Meta Leads NE koriste `_row`/markProcessed — koriste `_leadId`/markMetaLeadsProcessed,
   to su dva različita mehanizma za dva različita taba, ne mešati ih.
4. Rezime na kraju: koliko novih iz svakog izvora, koje firme/imena, link ka Doc-u.
5. **notify** (`POST {action:"notify", to, count, firms:[...], docUrl, when}`) — poslednji
   korak, **posle svake provere bez izuzetka** — zakazane 08:00/18:00 (deerzign-brief-check-jutro
   / -vece) I ručni `/proveri-prijave`. Šalje mejl (preko `MailApp.sendEmail` u Apps Script-u,
   akcija `notify`) sa rezimeom ove provere — uvek, i kad je `count` 0 (kratak "nema novih
   prijava" mejl). `to` = `andrejvuckovic44@gmail.com` (team@deerzign.com ne prima ove mejlove —
   verovatno spam/grupa ograničenje, testirano 2026-07-27; može se probati ponovo kasnije).
   `when` = "jutro" / "veče" / "ručna provera". `firms` = lista naziva firmi/imena iz OBA izvora
   ove provere (prazno ako je ukupan count 0). `docUrl` = link ka Google Doc izveštaju (prazno
   ako je ukupan count 0). `count` = zbir iz oba izvora (Upiti + Leads Meta Ads).

## Kolone koje red iz brief-a sada ima (posle skraćivanja 2026-07-27)

`Ime i prezime, Naziv firme, Telefon, Email, Šta vam je potrebno, Željeni rok, Budžet,
Čime se bavite, Logo, Fotografije, Linkovi, Adresa, radno vreme, kontakt,
Ostalo, Saglasnost, Paket sa cenovnika (samo ako je klijent došao preko dugmeta na
cenovniku), Vreme, Jezik, Stranica, Izvor, Obrađeno, Folder materijala`

- **"Čime se bavite"** je sada veliko slobodno polje — klijent tu piše i delatnost i šta ga
  izdvaja, sve zajedno. To je glavni izvor sirovog materijala za analizu; nema više odvojenih
  polja za "usluge", "razloge", "ton", "pitanja klijenata" ni "tip klijenta" — sve to treba
  izvesti iz ovog jednog teksta.
- **Ciljnu publiku izvedi iz "Čime se bavite"** — polje "Tip klijenta" je uklonjeno iz forme
  2026-08-04 jer se odgovor ionako skoro uvek vidi iz opisa biznisa. Stariji redovi tu kolonu
  još imaju popunjenu; novi je nemaju. Ako se iz opisa ne da zaključiti, to je pitanje za
  klijenta (tačka 7), ne pretpostavka.
- Prazna vrednost = klijent nije popunio (obavezni su samo kontakt, "Šta vam je potrebno",
  "Željeni rok", "Budžet", opis biznisa i saglasnost — **adresa/radno vreme više NIJE obavezno**
  od 2026-08-04) — ne izmišljaj podatak, zabeleži kao nedostajuće gde je relevantno.

## Pravila analize

**Preporučeni paket + okvirna cena** (stvarne cene sa cenovnika na `index.html` — ako se ovo
ikad promeni na sajtu, ažuriraj i ovde):
- **Osnovni — €249**, jednokratno, jedna strana do 5 sekcija. Klijent šalje gotov tekst i
  fotografije, mi ih uklapamo — bez rada na strukturi sadržaja, 1 runda izmena, 7 dana podrške.
- **Starter — €499**, jednokratno, jedna strana do 6 sekcija + naš rad na strukturi i redosledu
  sadržaja, SEO osnove i analitika, 2 runde izmena, 14 dana podrške.
- **Landmark — €849**, jednokratno, do 5 strana.
- **Signature — po dogovoru**, 6+ strana / po meri.

Razlika Osnovni ↔ Starter nije broj strana (obe su jedna strana) nego **koliko posla mi radimo
na sadržaju**: Osnovni je samo izrada od onoga što klijent pošalje, Starter uključuje i
oblikovanje strukture. Ako neko sa budžetom za Osnovni traži i pomoć oko sadržaja — to je
Starter, reci to otvoreno u tački 2 umesto da se obim tiho proširi po ceni Osnovnog.

Logika:
- Ako je polje **"Paket sa cenovnika"** popunjeno (klijent je kliknuo CTA sa cenovnika) —
  koristi taj paket direktno, cena kao gore.
- Inače mapiraj po **"Budžet"**:
  - `do 300 €` → Osnovni (€249)
  - `300–500 €` → Starter (€499)
  - `500–1.000 €` → Landmark (€849)
  - `1.000–2.500 €` ili `2.500–5.000 €` ili `preko 5.000 €` → Signature (po dogovoru)
  - `do 500 €` → stara vrednost (opsezi su razdvojeni na 300 € tek 2026-08-04); za takve
    starije redove tretiraj kao Starter (€499)
  - `Nisam siguran/na — predložite` → nema tvrde preporuke, napomena "budžet nije
    naveden, predložiti paket na pozivu na osnovu onoga što piše u Čime se bavite"

**Status** — automatika uvek upisuje `Nov upit` (Andrej ručno menja status kasnije u CRM tabu
kako razgovor napreduje — automatika nikad ne prepisuje postojeći CRM red, samo dodaje nove).

**Sledeći korak** — izvedi iz **"Željeni rok"**:
- `Što pre — do 30 dana` → "Pozvati u naredna 24–48h"
- svaki drugi rok → "Kontaktirati u naredna 2–3 dana"

**Doc izveštaj (`items`) — pun format, 10 tačaka.** Ovo NIJE kratka napomena — cilj je da
izveštaj bude dovoljno potpun da (a) Andrej iz njega sam odluči šta da odgovori klijentu i
(b) kasnije, kad se posao potvrdi, ovaj isti izveštaj posluži kao brief za pravljenje sajta,
bez vraćanja na sirove odgovore iz Sheet-a. Pošto forma sad ima manje strukturiranih polja,
većina ovoga se izvodi iz slobodnog teksta u "Čime se bavite" — čitaj ga pažljivo, ne
preskači. Svaka tačka je jedan `[naslov, tekst]` par u `items`, tim redosledom:

1. **Sažetak projekta** — ko je klijent, čime se bavi i ko mu je ciljna publika (oboje iz
   "Čime se bavite"), šta tačno traži (nov sajt / redizajn / landing / prodavnica),
   budžet, rok — u par rečenica.
2. **Preporučeni paket** — paket + cena + obrazloženje iz pravila iznad. Ako nešto iz "Čime se
   bavite" (npr. eksplicitan zahtev za online prodaju, rezervacije, kompleksne integracije)
   prevazilazi obim tog paketa — eksplicitno to napisati ovde kao upozorenje i uputiti na
   tačku 5, umesto da se tiho zaokruži naniže.
3. **Predložena struktura sajta** — konkretna lista stranica/sekcija izvedena iz "Čime se
   bavite" (npr. Početna, Usluge/Proizvodi, O nama, Kontakt + eventualno online prodavnica ako
   se obim potvrdi). Za Osnovni i Starter to je lista sekcija na jednoj strani, ne strana.
4. **Okvirna cena i rok** — uslovna procena: cena/rok ako obim ostane u granicama
   preporučenog paketa, i posebno cena/rok ako se obim proširi.
5. **Rizici i nejasnoće** — sve što u "Čime se bavite" ili ostalim poljima nije jasno, a menja
   obim/cenu/rok ako se pogrešno pretpostavi. Ovde takođe ide flag ako je unos očigledno
   test/placeholder (besmislen tekst, isti mejl kao Andrejev) — "IZGLEDA KAO TEST UNOS —
   proveriti pre kontakta", i onda se tačke 6–10 mogu skratiti/preskočiti jer nema pravog
   leada za obradu.
6. **Materijali koji nedostaju** — proveri da li su "Logo" i "Fotografije" prazni; ako jesu,
   navedi ih kao nedostajuće. Pomeni "Folder materijala" ako ima priloga.
7. **Pitanja za klijenta** — konkretna, direktno postavljiva pitanja koja rešavaju tačku 5 pre
   nego što se pošalje pisana ponuda (npr. tačan obim, da li već ima domen/hosting — ovo se
   više ne pita u formi, pa ako je bitno za posao, pitaj ovde).
8. **Sledeći korak** — konkretna akcija i kad (izvedeno iz pravila iznad).
9. **Nacrt poruke za klijenta** (WhatsApp/mejl, na jeziku prijave — SR ili EN) — gotov tekst
   spreman za slanje, fokusiran na razrešavanje ključne nejasnoće iz tačke 5 i traženje
   materijala iz tačke 6.
10. **Nacrt ponude** — konkretna pisana ponuda AKO je obim dovoljno jasan; inače kratko
    objašnjenje zašto se ponuda ne šalje dok se tačka 7 ne razjasni.

CRM red ("Napomena" kolona) ostaje kratak pokazivač na Doc, ne duplira ceo izveštaj — npr.
"Vidi izveštaj — nejasno da li treba prava online prodavnica" ili "IZGLEDA KAO TEST UNOS".

## Meta Lead Ads (native forma)

Ovo je **drugi, odvojeni izvor leadova** — Meta-ina native Lead Ads (Instant Form) integracija,
konfigurisana direktno u Meta Ads Manageru, koja sama upisuje redove u tab **"Leads Meta Ads"**
u istom Google Sheet-u. Mi ne primamo POST od te forme — Meta je sinhronizuje sama.

**Aktivna forma** (stanje na 2026-08-04, "Simple form setup", ID 1020843140934913, oglas
Deerzign2) ima samo dva prilagođena pitanja plus kontakt:
- **Budžet**: "Koji je vaš okvirni budžet za sajt?" — `300€ - 500€` / `500€ - 1000€` /
  `Preko 1000€`
- **Rok**: "Kada želite da počnete sa projektom?" — `Odmah` / `U narednih mesec dana` /
  `Samo se informišem`
- Kontakt: puno ime, broj telefona, email adresa

Ako se pitanja/odgovori u formi ikad promene u Meta Ads Manageru, ažuriraj ovu sekciju.

**Mapiranje polja** (iz `getUnprocessedMetaLeads_()` u `.gs`-u): `Ime i prezime` ← full_name,
`Telefon` ← phone_number (bez "p:" prefiksa), `Email` ← email (ako ga forma ikad doda — trenutno
NE traži email eksplicitno, kolona može biti prazna), `Budžet (Meta forma)` ← odgovor na budžet
pitanje, `Rok (Meta forma)` ← odgovor na rok pitanje, `Kampanja` ← campaign_name, `Vreme` ←
created_time.

**Preporučeni paket + okvirna cena** (isti paketi kao gore, drugo mapiranje jer su opsezi
drugačiji od brief.html-a):
- `300€ - 500€` → **Starter (€499)**
- `500€ - 1000€` → **Landmark (€849)**
- `Preko 1000€` → **Signature (po dogovoru)**
- ako se u Meta formi ikad doda opcija ispod 300 € (planirano — "sajt do 300 €, osnovni") →
  **Osnovni (€249)**

**Sledeći korak** — iz "Rok (Meta forma)":
- `Odmah` → "Pozvati u naredna 24h" (najviši prioritet)
- `U narednih mesec dana` → "Kontaktirati u naredna 2–3 dana"
- `Samo se informišem` → niži prioritet — meki lead, ne žuriti sa pozivom, radije kratka
  informativna poruka

**Bitna razlika u dubini analize**: ova forma NEMA polje "Čime se bavite" niti bilo šta o
delatnosti, ciljnoj publici ili obimu projekta — samo budžet i rok. **Ne izmišljaj** te podatke i
ne pokušavaj da primeniš pun 10-tačkasti format iz sekcije "Doc izveštaj" iznad (namenjen je
brief.html-u koji ima taj tekst). Za Meta Lead Ads koristi laganiji format, isto kao `items`
lista u `appendReport`, ali samo ove tačke:
1. **Šta znamo** — ime, telefon, budžet, rok, kampanja preko koje je stigao — u par rečenica.
2. **Preporučeni paket** — iz mapiranja iznad.
3. **Nedostaje** — eksplicitno napisati da nema podataka o delatnosti/obimu/ciljnoj publici;
   sve to mora da se sazna na pozivu.
4. **Sledeći korak** — iz mapiranja iznad, uvek uz napomenu da je prvi kontakt telefonski poziv
   (ne pisana ponuda — nema dovoljno podataka za ponudu).
5. **Nacrt poruke** (WhatsApp/SMS, srpski — Meta forma nema jezik kao brief.html) — kratak,
   predstavljanje + poziv na kratak telefonski razgovor da se sazna više o projektu; NE nuditi
   cenu/paket kao gotovu stvar, samo okvir. **Uvek uključi handoff link** ka brief.html (vidi
   "Handoff link" ispod) — to je jedini način da osoba stvarno završi kompletan upit, pošto
   Meta forma ima samo 2 pitanja.

### Handoff link (Meta forma → brief.html)

Meta-in "Thank you screen" ne podržava dinamičko ubacivanje odgovora te osobe u link (obična
Instant Form, bez CRM integracije, nosi samo statičan URL) — zato se personalizacija radi ovde,
u nacrtu poruke, ne na samoj Meti. Andrej ručno šalje ovaj link (WhatsApp/SMS), sa PRAVIM
podacima te osobe iz Sheet-a, umesto Meta-inog generičkog dugmeta.

`brief.html` prihvata `?budzet=` i `?rok=` kao URL parametre i unapred čekira odgovarajuću
opciju (poredi se tačnom vrednošću, mora biti IDENTIČNO jedna od postojećih chip vrednosti u
formi — ne Meta-ina formulacija). `?izvor=meta-handoff` takođe treba dodati (obeležava izvor
pouzdanije nego browser referrer, koji WhatsApp/SMS linkovi obično ne nose).

**Prevod Meta vrednosti → brief.html vrednosti** (Meta koristi drugačije formulacije — nikad
ne prosleđivati Meta-in tekst direktno u link, uvek prevesti prvo):

| Meta "Budžet" | → brief.html `?budzet=` |
|---|---|
| `300€ - 500€` | `300–500 €` |
| `500€ - 1000€` | `500–1.000 €` |
| `Preko 1000€` | `1.000–2.500 €` |

| Meta "Rok" | → brief.html `?rok=` |
|---|---|
| `Odmah` | `Što pre — do 30 dana` |
| `U narednih mesec dana` | `1–2 meseca` |
| `Samo se informišem` | `Nije hitno, planiramo unapred` |

Ceo link (URL-enkodovan, razmaci kao `%20`, `—` kao `%E2%80%94`, `–` kao `%E2%80%93`, `€` kao
`%E2%82%AC`):

```
https://www.deerzign.com/brief.html?budzet=<prevedeno>&rok=<prevedeno>&izvor=meta-handoff
```

Primer za budžet "500€ - 1000€" i rok "Odmah":

```
https://www.deerzign.com/brief.html?budzet=500%E2%80%931.000%20%E2%82%AC&rok=%C5%A0to%20pre%20%E2%80%94%20do%2030%20dana&izvor=meta-handoff
```

Osoba na brief.html vidi napomenu da su joj budžet i rok već štiklirani — ostaje samo da
popuni opis biznisa i pošalje.

CRM red ("Napomena" kolona): "Meta Lead Ads — {kampanja} — nema detalja o projektu, prvi
kontakt = poziv".

**CAPI/Pixel**: Meta Lead Ads leadovi **ne treba** da prolaze kroz `sendMetaLead_`/Conversions
API — Meta ih već sama prati kao native lead-eve od trenutka kad je forma popunjena, slanje
dodatnog CAPI signala za njih bi bilo duplo/pogrešno pripisivanje. CAPI je samo za brief.html
submissione (gde Meta inače ne bi znala da je konverzija nastala iz njene reklame bez tog
signala).

## Meta uči iz stvarnih ishoda ("Dobijen posao")

Ovo **nije deo posla automatike/AI-ja** — čisto Apps Script mehanizam, opisan ovde samo da AI
zna šta su te kolone i da ih nikad sam ne popunjava.

CRM tab sad ima dve dodatne kolone na kraju: **"Stvarna vrednost (€)"** i **"Meta signal
poslat"**. Kad Andrej ručno postavi `Status` reda na tačno **"Dobijen posao"** i upiše pravu
cenu dogovorenog posla u "Stvarna vrednost (€)", instalirani trigger (`onCrmValueEdit` u
`.gs`-u — mora se ručno povezati jednom preko Triggers panela, vidi komentar iznad te funkcije)
automatski pošalje Meti "Purchase" CAPI signal sa tom stvarnom vrednošću, hash-ovanim
email/telefonom tog klijenta. To uči Meta-in algoritam da traži više ljudi sličnih profilu
onih koji **stvarno postanu klijenti**, ne samo onih koji popune formu — jača verzija od
signala koji se šalje na samoj prijavi (koji nosi samo procenu iz budžeta).

Radi identično za oba izvora (Upiti i Leads Meta Ads) jer oba sad pišu Email/Telefon u CRM red.

**Pravilo za AI**: nikad ne upisuj ništa u "Stvarna vrednost (€)" niti menjaj Status na "Dobijen
posao" tokom automatske obrade — to su isključivo Andrejevi ručni unosi, pišu se tek kad se
posao stvarno zaključi (dana ili nedeljama posle prve prijave), ne u trenutku kad se red prvi
put doda u CRM. Kolona "Meta signal poslat" se popunjava sama (timestamp) čim trigger uspešno
pošalje signal — ako je već popunjena, ne dirati, znači da je već prijavljeno.

## Napomena o starim fajlovima

Stari Word/Excel-based sistem (i njegov playbook) je namerno izbačen 2026-07-27 — sve je
prešlo na Google Sheet/Docs preko gornjeg endpoint-a. Ovaj fajl je jedini izvor istine za
automatiku i živi samo ovde (nije duplikat ni od čega u Google Drive-u).
