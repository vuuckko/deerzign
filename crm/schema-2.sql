-- =====================================================================
-- Deerzign CRM — dopuna: Klijenti + Finansije
-- Pokreni POSLE schema.sql, jednom, u SQL Editoru. Bezbedno je ponoviti.
-- =====================================================================

-- ---------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------
-- Zasebna tabela, a ne „lead sa statusom Dobijen posao", iz dva razloga:
--   1. dosadašnji klijenti su došli preko outreach-a, ne preko forme —
--      oni nemaju lead i moraju da se unesu ručno
--   2. jedan klijent vremenom ima više poslova; lead je jedan trenutak,
--      klijent je odnos koji traje
create table if not exists clients (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- popunjeno kad je klijent nastao od upita; prazno za outreach klijente
  lead_id    uuid references leads (id) on delete set null,

  firma      text,
  ime        text,
  telefon    text,
  email      text,
  sajt       text,
  napomena   text,
  aktivan    boolean not null default true
);

-- Jedan lead ne sme da napravi dva klijenta ako se status vrati pa opet
-- prebaci na „Dobijen posao".
create unique index if not exists clients_lead_uniq
  on clients (lead_id) where lead_id is not null;

-- ---------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------
-- `placeno_datum is null` = nije plaćeno. Namerno bez `status` kolone:
-- status se izvodi iz datuma, pa ne mogu da se raziđu.
create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  client_id     uuid references clients (id) on delete set null,
  broj          text,                       -- tvoj broj fakture
  opis          text,
  iznos         numeric not null,
  valuta        text not null default 'EUR',

  izdato        date not null default current_date,
  rok_placanja  date,
  placeno_datum date,                       -- null = neplaćeno

  napomena      text,

  constraint invoices_iznos_pozitivan check (iznos > 0)
);

create index if not exists invoices_client_idx on invoices (client_id);
create index if not exists invoices_izdato_idx on invoices (izdato desc);
-- brzo pronalaženje neplaćenih za Pregled
create index if not exists invoices_neplacene_idx
  on invoices (rok_placanja) where placeno_datum is null;

-- ---------------------------------------------------------------------
-- updated_at (funkcija je već napravljena u schema.sql)
-- ---------------------------------------------------------------------
drop trigger if exists clients_touch_updated_at on clients;
create trigger clients_touch_updated_at
  before update on clients
  for each row execute function public.touch_updated_at();

drop trigger if exists invoices_touch_updated_at on invoices;
create trigger invoices_touch_updated_at
  before update on invoices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS — samo vlasnik, isto kao ostatak
-- ---------------------------------------------------------------------
alter table clients  enable row level security;
alter table invoices enable row level security;

drop policy if exists clients_owner_all  on clients;
drop policy if exists invoices_owner_all on invoices;

create policy clients_owner_all on clients
  for all using (public.is_owner()) with check (public.is_owner());

create policy invoices_owner_all on invoices
  for all using (public.is_owner()) with check (public.is_owner());
