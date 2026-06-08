# Model parameters

User-adjustable knobs that influence how the model generates a roast. Edit the
values in the `json` block below, then redeploy the Worker (`wrangler deploy`, or
push to `main` to let CI deploy). The prompt text itself lives in `prompt.md`.

These are **not** the only model-related settings. Two live elsewhere because they
are deployment/security configuration:

- **Allowed model(s)** — `MODEL_ALLOWLIST` in `wrangler.toml` (the Worker only ever
  calls a model on this list). The browser's default model and the intensity slider
  labels are in `src/config.ts`.
- **Maximum input length** — `MAX_INPUT_CHARS` in `wrangler.toml`.

## Parameters

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

```json
{
  "maxOutputTokens": 1500,
  "temperature": null,
  "topP": null,
  "intensity": {
    "default": 3,
    "levels": [
      {
        "level": 1,
        "label": "Keep it factual",
        "directive": "Keep it factual: dry, deadpan and understated — wry observations grounded strictly in the record, with the lightest comic touch and no exaggeration."
      },
      {
        "level": 2,
        "label": "Don't hold back",
        "directive": "Don't hold back: sharp, witty and properly cutting, with real bite."
      },
      {
        "level": 3,
        "label": "Show no mercy",
        "directive": "Show no mercy: as brutal, savage and cutting as the content rules allow — go for the jugular within the rules."
      }
    ]
  }
}
```
