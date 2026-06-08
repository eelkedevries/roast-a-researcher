# Model parameters

User-adjustable knobs that influence how the model generates a roast. The live
values are in **`model-config.json`** (the single source of truth) — edit that file,
then redeploy the Worker (`wrangler deploy`, or push to `main` to let CI deploy). A
syntax error in the JSON fails `wrangler deploy --dry-run`, so a bad edit is caught
before it ships. The prompt text itself lives in `prompt.md`.

These are **not** the only model-related settings. Two live elsewhere because they
are deployment/security configuration:

- **Allowed model(s)** — `MODEL_ALLOWLIST` in `wrangler.toml` (the Worker only ever
  calls a model on this list). The browser's default model and the intensity slider
  labels are in `src/config.ts`.
- **Maximum input length** — `MAX_INPUT_CHARS` in `wrangler.toml`.

## Parameters (in `model-config.json`)

- **maxOutputTokens** — hard cap on the length of the generated roast (OpenRouter
  `max_tokens`).
- **temperature** — sampling temperature (OpenRouter `temperature`). `null` leaves it
  unset, so the model uses its own default; set a number (typically `0`–`1`) to
  override. Higher is more random/varied, lower is more focused/deterministic.
- **topP** — nucleus sampling (OpenRouter `top_p`). `null` leaves it unset; set a
  number `0`–`1` to override.
- **intensity** — the user-selectable sharpness scale sent with each request.
  `default` is used when the request omits one. Each `level` has the `value` the
  browser sends, a short `label`, and the `directive` text appended to the prompt.
  The minimum and maximum selectable levels are taken from the smallest and largest
  `level` values present.
