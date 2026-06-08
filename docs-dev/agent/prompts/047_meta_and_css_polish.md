# Task: Document metadata and CSS/accessibility polish (additive)

## Goal

Add safe, additive `<head>` metadata and CSS polish that improve accessibility,
shared-link previews, mobile chrome and reduced-motion comfort. No behaviour or
layout regressions.

## Required changes

`index.html` (`<head>`):
- `color-scheme: dark` and `theme-color: #100e0c` metas.
- a `description` meta.
- `preconnect` to the Worker origin (faster first call).
- Open Graph + Twitter Card metas for a rich preview of the shared page URL
  (compatible with the existing `noindex`; no `og:image` since there is no raster
  asset).

`src/style.css`:
- `--faint` `#6b635a` → `#8a8073` (raise small-text contrast to WCAG AA; stays below
  `--muted`).
- `color-scheme: dark` on `:root` (native scrollbars/controls render dark).
- `min-width/height: 24px` + `inline-flex` centring on `.file-list__remove` /
  `.link-row__remove` (WCAG 2.2 target size).
- `overflow-wrap: break-word` on `.output` (long tokens can't overflow).
- In the `max-width:480px` query: stack the intensity segmented control full-width.
- A `prefers-reduced-motion: reduce` block neutralising the looping spinner/caret
  and shortening transitions.

## Acceptance criteria

- `npm run check` passes; the metas appear in `dist/index.html`.
- Purely additive; no existing rule removed.

## Commit and push

Commit using this file's exact filename, then push.
