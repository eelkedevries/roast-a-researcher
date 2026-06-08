# Usage

Roast a Researcher turns a public academic profile into a comedic roast. Run it on
your own record.

## Basic usage

1. **Give it a profile.** Either paste your bio, publications, grants or CV text
   into the profile box, or enter a source identifier or URL — an ORCID iD, a
   Semantic Scholar, DBLP or GitHub profile, or any website (the site is scraped).
   You can also search by name to find your record. Optionally "Log in with ORCID"
   to show a verified badge on a roast of your own iD.
2. **Choose an intensity** — *Keep it factual*, *Don't hold back*, or
   *Show no mercy*.
3. **Click "Roast me".** The roast streams back in the result area.
4. **Keep it.** Copy the text, download it as a text file, or download it as an
   image — all client-side. Nothing is stored (see `docs/privacy.md`).

You can change the intensity and re-roast after seeing the result.

## Build

```bash
npm run build
npm run preview
```

The build output is written to `dist/` and previewed locally before deployment.
