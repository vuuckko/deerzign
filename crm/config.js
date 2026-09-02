/* Deerzign CRM — podešavanja
 * ------------------------------------------------------------------
 * Popuni obe vrednosti iz Supabase → Project Settings → API.
 *
 * ANON ključ je javan po dizajnu — sme da stoji ovde i sme da bude vidljiv
 * u izvornom kodu stranice. Podatke čuva RLS (schema.sql), ne tajnost ključa.
 *
 * SERVICE_ROLE ključ NE SME NIKAD da uđe u ovaj fajl ni u bilo koji fajl u
 * drzgn folderu — on zaobilazi RLS i otvara celu bazu. Njegovo jedino mesto
 * je Apps Script → Project Settings → Script Properties.
 */
window.CRM_CONFIG = {
  SUPABASE_URL: 'https://TVOJ-PROJEKAT.supabase.co',
  SUPABASE_ANON_KEY: 'PASTE-ANON-KEY',

  /* Bucket iz schema.sql — menjaj samo ako si i tamo promenio. */
  BUCKET: 'brief-uploads',

  /* Isti /exec URL koji već stoji kao ENDPOINT u brief.html. Koristi se
     samo za jednu stvar: da javi Meti kad se posao zaključi. */
  APPS_SCRIPT_ENDPOINT: 'https://script.google.com/macros/s/AKfycbysPbaDWkhf1Be_vFjsGDMeiizoSDYRHfo_Iv98EpZz-RRFjiS3vBAgRLRiNY5hVHkv/exec',

  /* Posle koliko dana bez pomeranja kartica postane crvena. */
  STALE_DAYS: 4,
};
