# Deerzign

Landing page for Deerzign — an independent premium web studio.

The whole site is one file. Everything it needs sits beside it:

```
index.html      the site — markup, styles and script in one file
hero-v3.mp4     hero background video (forest, sun through the canopy)
hero-poster.webp  the video's own first frame, full 1920×1080 — see note below
deer.png        the studio mark — brand lockup + watermark (cropped from logo1.png)
logo1.png       original logo source, kept in case the mark needs re-cropping
work-*.jpg      project screenshots (nocte, bisque, invklub, zlatar)
og-image.jpg    social-share preview (Facebook/LinkedIn/Twitter), 1200×630 — see below
robots.txt      allows everything, points crawlers at sitemap.xml
sitemap.xml     lists index.html only — brief.html/hvala.html are noindex, so they
                stay out of it on purpose
serve.js        zero-dependency local server (optional)
README.md
```

## Opening it

Double-click `index.html`, or serve it — recommended, because the video then
streams instead of loading whole:

```bash
node serve.js
```

→ http://localhost:4000/index.html

## Design notes

- **Type**: Archivo for headings, Manrope for interface and body. Nothing is set
  in italic. Loaded from Google Fonts.
- **Colour**: warm paper `#F4F1EA`, ink `#0A0A0A`, brown `#8A8177`, and the
  accent as a *pair* — `--forest` `#A6210C` (paper ground) and `--ember-lit`
  `#EF4025` (dark ground). `.on-dark` swaps one for the other, so components use
  a single variable name. Both sit at hue 8 — true red, not orange — with
  saturation .86. An earlier pair sat at hue 15 / saturation .76 / lightness .56
  and read washed out: past about .55 lightness a red turns to salmon, and
  richness has to come from saturation instead. **The floor on the dark value is
  4.5:1 against `--ink`**, because `.btn-light:hover` puts ink-coloured text
  straight onto the accent — verified across all nine buttons at 5.09–5.12:1.
  Paper value measures 6.6:1. Anything darker than `#EF4025` on the dark ground
  breaks the buttons. All tokens live in `:root` at the top of `<style>`.
- **The deer** reads through the antler mark in the header and footer, the
  tracks along the process trail, and `deer.png` used large and quiet inside the
  dark panels.
- **Motion**: one entry animation, driven by an IntersectionObserver, played
  once per element, disabled under `prefers-reduced-motion`. The hero is not
  pinned, so scrolling never catches.
- **Hero → page fade**: what makes this read as smooth is *where the picture
  stops having detail*, not the colour ramp. `.hero::after` fades the film into
  `--ink` across roughly a third of the hero; measured, texture decays from
  st.dev 30 to 0.7 over ~300 px. An earlier version faded it over ~90 px and the
  video looked sliced off no matter what the band below did. `.dissolve` is then
  just two stops, `--ink → --warm`, over 190–330 px — at that height the
  per-pixel step stays under the banding threshold (measured max 2.5/255), so no
  multi-stop curve is needed. Three things were tried and are worth not
  repeating: a short band (reads as a stripe), bowing the ramp through warm tones
  to dodge the grey midpoint (swaps a grey stripe for a brown one), and hoof
  prints inside the band (they speckle the ramp and break up exactly the
  smoothness the band exists to provide). Keep it long, neutral and empty.
- **Nav performance**: the floating pill has no `backdrop-filter` while the
  hero video plays behind it — blurring a live video every frame is expensive
  and was the main cause of visible stutter on load. Blur is only turned on
  once scrolled, where it sits over the static page instead.
- **Hero video**: `hero-v3.mp4` is 1080p30 / ~2.9 MB (H.264, crf 26, faststart),
  cut from the `forest-master.mp4` master (1080p / 9.4 MB, kept outside the repo
  in `../drzgn-masters`). Never serve the master directly and never serve 4K —
  decoding 4K video is expensive regardless of file size, and that was the other
  half of the original stutter.
- **Before the video arrives**: `.hero-fallback` carries `hero-poster.webp`,
  which is frame one of `hero-v3.mp4` itself, so the film fades in over an
  identical picture and the swap is invisible. A `poster=""` attribute cannot do
  this job here — `.hero video` sits at `opacity:0` until `canplay`, which hides
  the poster along with the video. Regenerate the still alongside any new video:
  ```bash
  ffmpeg -ss 0 -i hero-v3.mp4 -frames:v 1 -vf scale=1280:-2 -c:v libwebp -quality 68 hero-poster.webp
  ```
  Note this element is *not* an accent surface. It was briefly given an accent
  tint, which made the hero flash red on every refresh until the video loaded.
- **Loop seam**: the master fades in from black and ends on lit forest, so a
  plain `loop` hard-cuts from bright to near-black every pass (measured: mean
  pixel delta 48/255 between last and first frame). The served file fixes this by
  dropping the first 1.2 s and cross-dissolving the tail back into it, so the
  clip ends on exactly the frame it starts on — seam delta 2.6/255. If you
  replace the video, re-encode the same way and give the file a new name so
  caches update:
  ```bash
  # X = crossfade length (1.2s), offset = source duration - 2X (13.133 - 2.4)
  ffmpeg -i source.mp4 -filter_complex "[0:v]split[a][b];[a]trim=start=1.2,setpts=PTS-STARTPTS[main];[b]trim=duration=1.2,setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=1.2:offset=10.733[v]" -map "[v]" -an -c:v libx264 -profile:v high -crf 26 -preset slow -pix_fmt yuv420p -movflags +faststart hero-v3.mp4
  ```

## SEO

- `<head>` carries a full set of tags: title, meta description, canonical,
  Open Graph + Twitter card (both pointing at `og-image.jpg`), and a JSON-LD
  `Organization`/`ProfessionalService` block with `makesOffer` listing all
  three pricing tiers (kept in sync with the `.ladder` section by hand — if a
  price or tier name changes there, update the JSON-LD too).
- **`og-image.jpg`** is a rendered still, not a photo — same dark panel
  treatment as the rest of the site (`deer.png` watermark, Archivo headline),
  built at 1200×630 straight from the hero copy. To regenerate after a copy
  change: rebuild the same markup as a standalone HTML file sized to
  1200×630 using the site's own tokens, then
  `chrome.exe --headless=new --window-size=1200,630 --screenshot=out.png <url>`
  and re-encode with `ffmpeg -i out.png -q:v 4 og-image.jpg`.
- `robots.txt` and `sitemap.xml` assume the site is served from the domain
  root (`https://www.deerzign.com/`) — update both, plus the canonical/og:url
  tags and the JSON-LD `url`/`image`, if the domain ever changes.
- `brief.html` and `hvala.html` are intentionally left out of the sitemap and
  carry their own `noindex` meta tags rather than a `robots.txt` disallow —
  combining both would let a crawler skip the page entirely and never see the
  noindex, so only one mechanism is used per page.

## The brief form

`brief.html` is a separate page — a three-step client brief, SR/EN, styled from
the same tokens as the site. It answers to nobody until you wire it up:

1. Open the Google Sheet → **Extensions → Apps Script**, paste
   `brief-apps-script.gs` over `Code.gs`, save.
2. **Deploy → New deployment → Web app**, execute as *Me*, access *Anyone*.
3. Copy the `/exec` URL into `ENDPOINT` at the top of the `<script>` block in
   `brief.html`.

Answers land as one row per submission; uploads go to a Drive folder per
submission and the links are written into their columns. Files are capped at
10 MB each, 25 MB per submission — over that, the form asks for a link instead.
Until `ENDPOINT` is set, sending falls back to an email with the answers in the
body. Answers autosave to `localStorage`, so a half-finished brief survives a
closed tab. The page is `noindex` — it is an intake form, not a landing page.

## Before going live

### Replace the placeholders

| What | Where |
| --- | --- |
| Instagram / LinkedIn URLs | the two `href="#"` links in the footer, marked with a comment — also add them to the JSON-LD as `sameAs` once real |
| Case-study links | `View project` links point at each project's own anchor until real case studies exist |
| Domain | canonical/`og:url`/`sitemap.xml`/`robots.txt`/JSON-LD all assume `https://www.deerzign.com/` — update everywhere listed under **SEO** above if that's wrong or changes |

Nothing on the page invents a client, a result, an award or a statistic. The
three projects are self-initiated concepts and every one is labelled
"Concept project" in its category line.
