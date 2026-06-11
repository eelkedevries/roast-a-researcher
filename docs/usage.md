# Usage

Roast a Researcher turns a public academic profile into a comedic roast. Run it
on your own record.

## 1. Provide a profile

The quickest route is the search box: **search your name**, tick the result
that is you, and the app fetches that record (ORCID, OpenAlex, Semantic
Scholar, DBLP or GitHub) automatically. Results that match your full name are
listed first; the rest sit under a "see more options" foldout.

Under *"Or add a personal website, links, or upload documents"* you can also:

- **Add your personal website** — the whole site is crawled (CV, publications,
  media pages), not just the one page.
- **Add profile links** — an ORCID iD, or an OpenAlex, GitHub, Semantic Scholar
  or DBLP profile URL. Any other URL is fetched as a website.
- **Paste text or upload documents** — PDF, Word (.docx), ODT, .txt or .md.
  Files are converted to text *in your browser*; the file itself is never
  uploaded. Scanned PDFs offer an opt-in OCR fallback.

Inputs combine: you can mix a search pick, a website and pasted text in one
roast. **Try a sample** shows the whole pipeline on an invented researcher at
zero cost.

## 2. Choose intensity and format

- **Intensity** — *Keep it factual* (dry and deadpan), *Don't hold back*
  (sharp), or *Show no mercy* (as cutting as the content rules allow). The
  rules themselves never relax.
- **Format** — a straight roast, or a comedic frame: Reviewer 2 report,
  desk-rejection letter, tenure-denial memo, grant-panel assessment, conference
  introduction, or performance review.

## 3. Roast

Press **Roast me**. The roast streams into the output card, followed by:

- **Personalia** — name, position, affiliations, research focus, education,
  profiles, grants and awards extracted from the record;
- **Papers** — your publications merged and de-duplicated across all sources;
- **The numbers** — citation metrics (h-index, g-index, FWCI, …) and charts.

A metadata line under the roast shows generation time, input size, model and
cost. After a roast you can change the intensity and **Re-roast** without
re-entering anything.

If a source mis-attributed a paper to you, tick **"not mine"** on it in the
Papers list and re-roast — the marked papers are excluded.

## 4. Keep it

- **Copy**, **Download .txt**, or **Download image** — all client-side; no
  hosted link is created and nothing is stored (see `privacy.md`).
- **Download data** (next to Roast me) exports everything the tool retrieved
  and fed to the model as a Markdown file, so you can inspect exactly what was
  roasted.

## Optional: ORCID login

**Log in with ORCID** verifies your iD for the current session only. A roast of
that same iD then shows an "ORCID-verified" badge, and your own record is
pre-loaded after login. Nothing is stored server-side.
