# Privacy

Roast a Researcher is a self-service tool: you run it on your own profile text.
This note describes what happens to that text.

## What is sent, and where

The profile text you paste (or that is extracted from a file in your browser) is
sent to the Worker, which forwards it to a language model **via OpenRouter** to
generate the roast. The roast streams back the same way.

- Files never leave your browser as files — they are converted to text locally,
  and only the text is sent.
- The text reaches OpenRouter and the underlying model provider. Read
  [OpenRouter's data policy](https://openrouter.ai/privacy) before pasting
  anything sensitive.

## What is stored

Nothing. The roast is generated per request and is not saved. The Worker keeps no
profile text and no logs of it; the only state it retains is the rate-limit
counter — a **hashed** IP and a count (see `docs/spend-and-limits.md`), which
expires daily and contains no raw IP.

The page keeps the text and the roast only in memory for the session.

## Sharing and search visibility

Sharing is entirely client-side: copy, download as text, or download as an image
rendered in your browser. No hosted or shareable URL is created.

The page is marked `noindex` so a roast is not mistaken for a sincere profile by a
search engine. A downloaded image, once saved, is outside the tool's control —
which is one reason the comedic content rules are enforced at generation time.
