# Task: Site-theme alignment + input-console refresh

## Goal

Make `roast-a-researcher` fully adopt the look and chrome of eelkedevries.com, and
refresh the Step 01 input console and the intensity control. This implements the
design handoff (`design_handoff_roast_a_researcher/`, high-fidelity: exact hex,
spacing and typography are authoritative). The retrieval/overview/roast pipeline is
unchanged; only the input surface, chrome and copy change.

## Required changes

`src/ui.ts`:
- **Masthead + pipe-nav** — replace the slim `.topbar` with the eelkedevries.com
  masthead (black-hole-eye banner, "Eelke de Vries, PhD" / "Cognitive neuroscientist",
  four social icons) and the sticky pipe-nav (About · Research · Publications ·
  Projects · Observations · Contact). Links are absolute cross-site URLs; no nav item
  is marked active. Banner images referenced base-aware via `--banner` /
  `--banner-portrait` custom properties (`import.meta.env.BASE_URL`).
- **Header** — just the h1 (gold); drop `.kicker` / `.tagline` / `.framing`.
- **ORCID login** — remove the header `#auth-control` and `renderAuthControl`;
  `config.orcidLoginEnabled = false`. The auth backend / verified-badge stay dormant.
- **Step 01** — add the subtitle "Search by name, or add sources directly"; drop the
  old `.search-hint`. Search placeholder loses its ellipsis; input + Search stay on
  one line.
- **Five input rows** — uniform single-line rows (`26px 84px minmax(0,1fr) ~70px`):
  number-badge · label · field · action. The **number badge is the include
  indicator** (a hidden `#check-<key>` checkbox behind it; fills gold when included,
  toggling excludes). Labels ORCID · OpenAlex · GitHub · Documents · Website; examples
  fold into placeholders. Action is outline-gold **Add** (1–3, 5) / **Browse** (4).
  Documents is a dashed drop box; Website is a single auto-detecting URL field. The
  search now **auto-fills** each source's best match (no picker / "see more options").
- **Copy** — papers hint → "Tick any that aren't this researcher's, then re-roast.";
  footer privacy completes "…before pasting anything sensitive."

`src/config.ts`: `intensityLevels` → two (`Factual` = 1, `Roast` = 3), default `Roast`;
shortened `privacyNotice`; `orcidLoginEnabled = false`.

`src/style.css`: ported masthead / pipe-nav styles; gold h1; brighter input fields
(`#16161f` / `#43434f`); number-badge + outline-gold action styles; `.segmented` →
two-option **pill** toggle; global `::placeholder`; content column 860px, chrome
1040px; remove `.topbar*` / old `.inopt*` / `.url-row*` / `.search__*` picker rules.

`public/`: `black_hole_eye_banner.jpg` + `black_hole_eye_banner_portrait.jpg`.

## Acceptance criteria

- `npm run check` passes.
- Masthead + sticky pipe-nav render; gold h1; no ORCID login; five uniform rows with
  the number-badge include indicator and outline-gold Add/Browse; search auto-fills
  best-match ids; intensity is a 2-option pill (Factual / Roast, Roast default);
  include/exclude, Add-to-verify, retrieve → overview → roast still work end to end.

## Commit and push

Commit using this file's exact filename, then push.
