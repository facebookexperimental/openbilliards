# openbilliards brand site — structure & conventions

Static, self-contained, hand-written. No frameworks, no build step, no CDN,
zero external requests; must work from plain static hosting **and** `file://`.
The binding design system is the project design-system doc (internal) — read it before
writing a page. `_shell.html` is the living styleguide: copy it, keep the
skeleton, replace the sample sections.

## Layout

```text
site/
├── _shell.html            # template + styleguide (NOT a public page)
├── index.html             # hero landing (EN)           — hero wave
├── assets/
│   ├── site.css           # tokens + all shared components (trunk-owned)
│   ├── site.js            # reveals, nav marking, menu, lang switch (trunk-owned)
│   ├── motion.js          # motion layer: hover/entrance/scroll choreography
│   ├── clip.js + clip.css # bb-clip: the in-place video clip component
│   │                      #   (viewport autoplay, capped; contract + budget
│   │                      #   in the design system "bb-clip")
│   ├── hero.css …         # page-scoped styles: one file per wave, additive only
│   ├── break.css          # page-scoped: "Anatomy of a break" scrub act (index)
│   ├── physics.css        # page-scoped: scenario gallery (docs/physics) + teaser (index)
│   ├── break-scrub/       # break record: manifest.json + frames (integration wave)
│   ├── physics/           # validated-physics scenario videos: mp4/poster/gates
│   │                      #   (byte-copies of the published pack, SOURCES.md) +
│   │                      #   generated physics-data.json — tile markup + data are
│   │                      #   OWNED by scripts/site-physics-data.mjs (CI drift-gated);
│   │                      #   preview/<id>-preview.mp4 = optional textless in-tile
│   │                      #   renditions (dual-source rule, the design system "bb-clip")
│   ├── fonts/             # Inter var + JetBrains Mono + OFL/Inter licenses
│   └── img/               # self-rendered stills only (imagery wave)
├── guide/<locale>/index.html   # en, zh-CN, es, ja, de, fr, ko
└── docs/{index,ts,python,cli,concepts}.html
```

## Hard rules (from the design system — the taste panel enforces these)

- Two surfaces only: `--bb-slate` canvas, `--bb-riser` fills. No third color,
  no gradients in chrome, `box-shadow` is globally banned.
- All type ivory; **chalk blue only** for citations, credits, active markers,
  link hovers, inline code names. <5% of any viewport.
- Exactly ONE filled pill per viewport and it is PLAY NOW (in the nav).
  Everything else is ghost pill or arrow-link.
- Every number in marketing copy carries a `.bb-cite` chip resolving to a repo
  artifact. An uncited number is a defect.
- Left-align everything. Never center or justify body copy. No exclamation
  marks, no emoji in chrome.
- Radii: 12px (cards/media) · 999px (pills) · 0 (everything else).

## Conventions

- **Paths are relative** (`file://` has no root): from `guide/<locale>/` use
  `../../assets/site.css`; from `docs/` use `../assets/site.css`.
- **Head**: copy `_shell.html`'s head — charset, viewport, title, description,
  inline `data:` SVG favicon, `site.css`, `site.js defer`.
- **Skeleton**: skip-link (`.bb-skip`, first in `<body>`) → `<header>` nav →
  `<main id="main">` → `<footer class="bb-footer">`.
- **Localized pages** set `<html lang="zh-CN">` etc. — CSS keys the CJK
  display register (smaller clamp, lh 1.08, label tracking 0.02em) off it.
- **Page-scoped CSS** goes in your own `assets/<page>.css`; never edit
  `site.css` (trunk-owned). Reuse tokens; don't mint new colors.

## Component classes (all in site.css, all demoed in _shell.html)

| Class | Role |
|---|---|
| `.bb-display / .bb-heading / .bb-heading-s` | uppercase graphic type, w560 |
| `.bb-label` (+`.bb-marker` for `◆` prefix) | 12px caps wayfinding layer |
| `.bb-body / .bb-body-s / .bb-muted` | mixed-case voice |
| `.bb-prose` | docs register: 16.5px/1.6, 68ch |
| `.bb-section / .bb-hero-100vh / .bb-band` | full-bleed sections (10vh pad) |
| `.bb-split` | label rail left, content right (stacks <760px) |
| `.bb-grid` | card row, auto-fit minmax(280px) |
| `.bb-link` (+`--ext ↗`, `--down ↓`, `--bare`) | arrow-glyph link language |
| `.bb-cite` | chalk citation chip, dashed underline, ↗ |
| `.bb-pill` / `.bb-pill--fill` | ghost / THE filled CTA |
| `.bb-card` | riser fill, hairline border, r12 |
| `.bb-code` (+`<b class=tk-n>`, `<i class=tk-c>`) | duotone mono well |
| `.bb-note` | brass wash, docs warnings only |
| `.bb-rule` | 1px dashed hairline divider |
| `.bb-list` | diamond-bullet list |
| `.bb-edge-tab` | rotated serial-plate label (hero) |
| `.bb-reveal` (+`.bb-d1…d5`) | scroll entrance, 60ms stagger |
| `.bb-lang-switch` + `a[data-lang]` | guide language switcher |
| `a[data-clip]` → `.bb-clip` | in-place video clip (assets/clip.js + clip.css, NOT site.css; full contract in the design system "bb-clip") |

## site.js contract

- Adds `html.js`; `.bb-reveal` only hides when JS is live, so no-JS renders
  everything. Reveals fire once via IntersectionObserver; reduced-motion or
  no-IO browsers get instant `.in`.
- Marks the nav link matching the current page with `aria-current="page"`
  (pathname compare, `index.html` ≡ `/`). Section links inside a directory
  (e.g. any `docs/*` page) match their nav entry by prefix.
- `.bb-nav-toggle` drives the <760px stacked menu (`aria-expanded` kept true).
- `window.bbLang.set('ja')` persists `localStorage['bb-lang']` and rewrites
  the `/guide/<locale>/` path segment; `a[data-lang]` links persist on click
  and the current locale gets `aria-current="true"`.

## Verifying your wave (do this before reporting)

```sh
cd site && python3 -m http.server <your-http-port>
node <your-harness>.mjs   # use web/tools/cdp.mjs: launchChrome(url, { port: <your-cdp-port>, tool: false })
```

Screenshot at 1280×900 and 390×844 minimum, LOOK at the images, and judge
against the design system. Log `Network.requestWillBeSent` and assert zero requests
off-origin; open the page via `file://` too. Fonts are already subset and
vendored — do not add font files or any external asset.
