-- =====================================================================
-- Deerzign CRM — shema
-- Pokreni JEDNOM, ceo fajl, u Supabase → SQL Editor → New query.
-- Bezbedno je pokrenuti ponovo (sve je if not exists / drop policy if exists).
--
-- Ko sme šta:
--   - TI (ulogovan mejlom iz OWNER_EMAIL ispod) — sve
--   - Apps Script — piše preko service_role ključa, koji RLS ZAOBILAZI
--     potpuno, pa mu ne treba nijedna politika
--   - svi ostali, uključujući anon ključ iz config.js — ništa
--
-- NAPOMENA: nigde nema uslova `auth.uid() is null`. Taj uslov je TAČAN za
-- nprijavljen zahtev, pa bi otvorio bazu svakome ko ima anon ključ — a on
-- stoji u izvornom kodu stranice. (Isti obrazac postoji u InvKlub shemi i
-- tamo je stvarna rupa.) Ne dodavati ga ovde ni pod jednim izgovorom.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Vlasnik
-- ---------------------------------------------------------------------
-- Ako ikad promeniš mejl, promeni ga OVDE i pokreni ovaj blok ponovo —
-- to je jedino mesto gde je zapisan.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'andrejvuckovic44@gmail.com'
$$;

-- ---------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------
create table if not exists leads (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- odakle je stigao: 'brief' (forma na sajtu) | 'meta' (Meta Lead Ads)
  -- | 'partial' (napuštena forma)
  source             text not null default 'brief',

  -- broj reda u Google Sheet-u, da se red uvek može upariti nazad
  sheet_row          integer,        -- tab "Upiti"
  crm_row            integer,        -- tab "CRM" (upisuje ga writeback)

  -- kontakt
  ime                text,
  firma              text,
  telefon            text,
  email              text,

  -- odgovori iz brief-a (imena kolona prate data-col labele iz brief.html)
  sta_treba          text,           -- "Šta vam je potrebno"
  rok                text,           -- "Željeni rok"
  budzet             text,           -- "Budžet"
  cime_se_bavite     text,           -- "Čime se bavite"
  linkovi            text,           -- "Linkovi"
  adresa             text,           -- "Adresa, radno vreme, kontakt"
  ostalo             text,           -- "Ostalo"
  saglasnost         text,           -- "Saglasnost"
  paket_sa_cenovnika text,           -- popunjeno samo ako je došao sa cenovnika

  -- meta podaci o samom slanju
  poslato_u          text,           -- "Vreme" iz Sheet-a, kako ga je Script formatirao
  jezik              text,
  stranica           text,
  izvor              text,
  drive_folder       text,           -- "Folder materijala" (Drive ostaje kao arhiva)

  -- ovo popunjavaš ti / automatika
  status             text not null default 'Nov upit',
  paket              text,
  cena               numeric,
  analiza            text,           -- ono što je do sad išlo u Google Doc
  sledeci_kontakt    date,
  vrednost           numeric,        -- "Stvarna vrednost (€)" — ide Meti
  meta_signal_at     timestamptz,    -- kad je Purchase signal potvrđen

  constraint leads_status_valid check (status in (
    'Nov upit', 'Kontaktiran', 'Ponuda poslata', 'Dobijen posao', 'Odbijen'
  ))
);

-- Sprečava duplikat kad Apps Script pokuša isti red dvaput (npr. posle
-- neuspelog odgovora koji je zapravo prošao — vidi curl -L zamku u
-- automation/PLAYBOOK.md). Parcijalni indeks: važi samo za brief redove.
create unique index if not exists leads_sheet_row_uniq
  on leads (sheet_row) where source = 'brief' and sheet_row is not null;

create index if not exists leads_status_idx     on leads (status);
create index if not exists leads_created_at_idx on leads (created_at desc);

-- ---------------------------------------------------------------------
-- lead_files — metapodaci; sami fajlovi su u Storage bucket-u
-- ---------------------------------------------------------------------
create table if not exists lead_files (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads (id) on delete cascade,
  polje        text,          -- 'Logo' | 'Fotografije'
  name         text not null,
  storage_path text not null,
  file_size    bigint,
  mime_type    text,
  created_at   timestamptz not null default now()
);

create index if not exists lead_files_lead_idx on lead_files (lead_id);

-- ---------------------------------------------------------------------
-- lead_notes — beleške posle poziva, jedna po unosu, sa datumom
-- ---------------------------------------------------------------------
create table if not exists lead_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists lead_notes_lead_idx on lead_notes (lead_id, created_at desc);

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_touch_updated_at on leads;
create trigger leads_touch_updated_at
  before update on leads
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS — samo vlasnik
-- ---------------------------------------------------------------------
alter table leads      enable row level security;
alter table lead_files enable row level security;
alter table lead_notes enable row level security;

drop policy if exists leads_owner_all      on leads;
drop policy if exists lead_files_owner_all on lead_files;
drop policy if exists lead_notes_owner_all on lead_notes;

create policy leads_owner_all on leads
  for all using (public.is_owner()) with check (public.is_owner());

create policy lead_files_owner_all on lead_files
  for all using (public.is_owner()) with check (public.is_owner());

create policy lead_notes_owner_all on lead_notes
  for all using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------------
-- Storage — privatan bucket, fajlovi se serviraju samo potpisanim URL-om
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('brief-uploads', 'brief-uploads', false)
on conflict (id) do nothing;

drop policy if exists brief_uploads_owner_all on storage.objects;
create policy brief_uploads_owner_all on storage.objects
  for all
  using      (bucket_id = 'brief-uploads' and public.is_owner())
  with check (bucket_id = 'brief-uploads' and public.is_owner());
