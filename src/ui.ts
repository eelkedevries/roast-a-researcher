import { config, copy, intensityLevels, type Intensity } from './config'
import { extractText, ocrPdf, UnsupportedFileError, ScannedPdfError } from './extract'
import { demoResearcher } from './demo'
import { copyText, downloadText, downloadImage } from './share'
import {
  detectSource,
  retrieveSource,
  searchSource,
  type SourceKind,
  type Candidate,
  type SourceStats,
  type ChartData,
  type RetrieveResult,
} from './sources'
import { renderCharts } from './charts'

const SOURCE_LABELS: Record<SourceKind, string> = {
  github: 'GitHub',
  orcid: 'ORCID',
  openalex: 'OpenAlex',
  semanticscholar: 'Semantic Scholar',
  dblp: 'DBLP',
}
const SEARCH_SOURCES: readonly SourceKind[] = [
  'github',
  'orcid',
  'openalex',
  'semanticscholar',
  'dblp',
]
const UNSUPPORTED_LINK =
  'Not a supported link (ORCID, OpenAlex, GitHub, Semantic Scholar, DBLP). Paste the text instead.'

// Canonical public-record URL for a detected source (for the "View record" link).
function recordUrl(detected: { source: SourceKind; id: string }): string {
  const id = detected.id.trim()
  if (/^https?:\/\//i.test(id)) return id
  switch (detected.source) {
    case 'orcid':
      return `https://orcid.org/${id.replace(/.*\//, '')}`
    case 'openalex':
      return `https://openalex.org/${id.replace(/.*\//, '')}`
    case 'github':
      return `https://github.com/${id.replace(/^@/, '')}`
    case 'dblp':
      return `https://dblp.org/pid/${id}.html`
    case 'semanticscholar':
      return `https://www.semanticscholar.org/author/${id}`
  }
}

// Builds the "Focused Console" shell and wires it to the real Worker pipeline.
export function mountApp(root: HTMLElement): void {
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
  root.innerHTML = `
    <main class="wrap">
      <header>
        <p class="kicker">Roast · a · Researcher</p>
        <h1>${copy.title}</h1>
      </header>

      <section class="form" aria-label="Roast input">
        <div class="step">
          <div class="step__head">
            <span class="step__num">01</span>
            <h2 class="step__title">Input</h2>
            <button class="step__sample" id="sample" type="button">Try a sample</button>
          </div>

          <div class="search-hero">
            <span class="search-hero__icon" aria-hidden="true">⌕</span>
            <input id="search-query" class="search-hero__input" type="text" placeholder="Search by name…" />
            <button class="btn btn--primary search-hero__btn" id="search-btn" type="button">Search</button>
          </div>
          <div id="search-results" class="search-results"></div>

          <details class="manual" id="manual">
            <summary class="manual__summary"><span class="manual__chevron" aria-hidden="true">›</span> Or add a link or paste text manually</summary>
            <div class="manual__body">
              <div class="manual__group">
                <span class="micro-label">Profile links <span class="micro-label__sub">ORCID · OpenAlex · GitHub · Semantic Scholar · DBLP</span></span>
                <div id="links"></div>
                <button class="chip" id="add-link" type="button"><span class="chip__icon" aria-hidden="true">+</span> Add link</button>
              </div>
              <div class="manual__group">
                <span class="micro-label">Paste or upload text</span>
                <div class="field" id="dropzone">
                  <textarea id="profile" class="field__text" placeholder="${copy.inputPlaceholder}"></textarea>
                  <input id="file" type="file" multiple accept=".txt,.md,.pdf,.docx,.odt" hidden />
                  <div class="field__bar">
                    <div class="field__actions">
                      <button class="chip" id="choose" type="button"><span class="chip__icon" aria-hidden="true">↑</span> Upload files</button>
                    </div>
                    <span class="counter" id="counter">0 / ${config.maxInputChars}</span>
                  </div>
                </div>
                <ul class="file-list" id="file-list"></ul>
              </div>
            </div>
          </details>
        </div>

        <div class="step">
          <div class="step__head">
            <span class="step__num">02</span>
            <h2 class="step__title">Roast settings</h2>
          </div>
          <div class="action-row">
            <div class="action-row__intensity">
              <span class="micro-label">${copy.intensityLabel}</span>
              <div class="segmented" role="radiogroup" aria-label="${copy.intensityLabel}">
                ${intensityLevels
                  .map(
                    (level) =>
                      `<label><input type="radio" name="intensity" value="${level}"${
                        level === config.defaultIntensity ? ' checked' : ''
                      } /><span>${cap(level)}</span></label>`,
                  )
                  .join('')}
              </div>
            </div>
            <div class="action-row__go">
              <button class="btn btn--ghost" id="export-data" type="button">Download data</button>
              <button class="btn btn--primary" id="roast" type="button">${copy.roastButton}</button>
            </div>
          </div>
          <p class="step__hint">${copy.intensityHint}</p>
        </div>
      </section>

      <section class="result-card" aria-label="Roast output">
        <div class="out-head"><span class="label" style="margin:0">The roast</span></div>
        <dl class="personalia hidden" id="personalia">
          <div class="row"><dt>Name</dt><dd id="p-name">—</dd></div>
          <div class="row"><dt>Affiliation</dt><dd id="p-affil">—</dd></div>
          <div class="row"><dt>Sources</dt><dd id="p-sources">—</dd></div>
        </dl>
        <div class="output placeholder" id="output" aria-live="polite">${copy.outputPlaceholder}</div>
        <div class="stats-card" id="stats-card" hidden></div>
        <div class="charts-card" id="charts-card" hidden></div>
        <div class="share hidden" id="share">
          <button class="btn btn--ghost" id="s-copy" type="button">Copy</button>
          <button class="btn btn--ghost" id="s-txt" type="button">Download .txt</button>
          <button class="btn btn--ghost" id="s-img" type="button">Download image</button>
        </div>
      </section>

      <hr class="div" />

      <footer aria-label="Privacy">
        <p class="privacy">${copy.privacyNotice}
          <a href="${copy.providerPolicyUrl}" target="_blank" rel="noopener">${copy.providerPolicyLabel}</a>.</p>
      </footer>
    </main>
  `

  const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T
  const textarea = $<HTMLTextAreaElement>('#profile')
  const counter = $<HTMLElement>('#counter')
  const output = $<HTMLElement>('#output')
  const roastBtn = $<HTMLButtonElement>('#roast')
  const manual = $<HTMLDetailsElement>('#manual')
  const linksContainer = $<HTMLElement>('#links')
  const fileList = $<HTMLUListElement>('#file-list')
  const statsCard = $<HTMLElement>('#stats-card')
  const chartsCard = $<HTMLElement>('#charts-card')

  // Provenance of the current input (uploaded filenames, retrieved sources).
  const sources = new Set<string>()

  const setCounter = (): void => {
    const n = textarea.value.length
    counter.textContent = `${n} / ${config.maxInputChars}`
    counter.classList.toggle('warn', n > config.maxInputChars)
  }
  textarea.addEventListener('input', setCounter)

  roastBtn.addEventListener('click', () => {
    void runRoast(textarea, root, output, roastBtn, sources, manual)
  })

  // Try a sample: the zero-cost canned demo (no model call), seeded so the user
  // can see the seeded profile in the manual panel.
  $<HTMLButtonElement>('#sample').addEventListener('click', () => {
    showDemo(root, textarea, output)
    setCounter()
    manual.open = true
  })

  // File upload + drag-and-drop (the whole .field is the drop target).
  const fileInput = $<HTMLInputElement>('#file')
  const dropzone = $<HTMLElement>('#dropzone')
  $<HTMLButtonElement>('#choose').addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? [])
    if (files.length) void processFiles(files, textarea, setCounter, fileList, sources)
    fileInput.value = ''
  })
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropzone.classList.add('over')
  })
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'))
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropzone.classList.remove('over')
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length) void processFiles(files, textarea, setCounter, fileList, sources)
  })

  // Profile links.
  addLinkRow(linksContainer)
  $<HTMLButtonElement>('#add-link').addEventListener('click', () => addLinkRow(linksContainer))

  // Export retrieved data.
  const exportBtn = $<HTMLButtonElement>('#export-data')
  exportBtn.addEventListener('click', () => void exportRetrievedData(root, textarea, exportBtn))

  // Search by name (primary). Re-searching resets the added inputs first.
  const searchQuery = $<HTMLInputElement>('#search-query')
  const searchResults = $<HTMLElement>('#search-results')
  const resetInputs = (): void => {
    linksContainer.textContent = ''
    addLinkRow(linksContainer)
    textarea.value = ''
    setCounter()
    fileList.textContent = ''
    manual.open = false
    statsCard.setAttribute('hidden', '')
    chartsCard.setAttribute('hidden', '')
    sources.clear()
  }
  const runSearch = (): void => {
    resetInputs()
    void doSearch(searchQuery.value, searchResults, linksContainer)
  }
  $<HTMLButtonElement>('#search-btn').addEventListener('click', runSearch)
  searchQuery.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      runSearch()
    }
  })

  // Share controls.
  $<HTMLButtonElement>('#s-copy').addEventListener('click', () => {
    const btn = $<HTMLButtonElement>('#s-copy')
    copyText(output.textContent ?? '')
      .then(() => {
        const prev = btn.textContent
        btn.textContent = 'Copied ✓'
        setTimeout(() => (btn.textContent = prev), 1400)
      })
      .catch(() => {})
  })
  $<HTMLButtonElement>('#s-txt').addEventListener('click', () => {
    const text = output.textContent ?? ''
    if (text) downloadText(text, 'roast.txt')
  })
  $<HTMLButtonElement>('#s-img').addEventListener('click', () => {
    const text = output.textContent ?? ''
    if (text) downloadImage(text, copy.title, 'roast.png').catch(() => {})
  })

  setCounter()
}

// --- file upload ---

async function processFiles(
  files: File[],
  textarea: HTMLTextAreaElement,
  setCounter: () => void,
  list: HTMLElement,
  sources: Set<string>,
): Promise<void> {
  for (const file of files) {
    const item = document.createElement('li')
    item.className = 'file-list__item'
    const top = document.createElement('div')
    top.className = 'file-list__top'
    const status = document.createElement('span')
    status.className = 'file-list__status'
    status.textContent = '…'
    const name = document.createElement('span')
    name.className = 'file-list__name'
    name.textContent = file.name
    const size = document.createElement('span')
    size.className = 'file-list__size'
    size.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB`
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'file-list__remove'
    remove.setAttribute('aria-label', `Remove ${file.name}`)
    remove.textContent = '×'
    remove.addEventListener('click', () => {
      item.remove()
      sources.delete(file.name)
    })
    top.append(status, name, size, remove)
    const reason = document.createElement('small')
    reason.className = 'file-list__reason'
    reason.hidden = true
    item.append(top, reason)
    list.appendChild(item)

    try {
      appendToInput(textarea, await extractText(file))
      status.textContent = '✓'
      item.classList.add('is-ok')
      sources.add(file.name)
    } catch (err) {
      status.textContent = '✗'
      item.classList.add('is-fail')
      reason.hidden = false
      reason.textContent =
        err instanceof UnsupportedFileError ? err.message : 'Could not read that file.'

      if (err instanceof ScannedPdfError) {
        const ocr = document.createElement('button')
        ocr.type = 'button'
        ocr.className = 'chip file-list__ocr'
        ocr.textContent = 'Try OCR (scanned PDF)'
        ocr.addEventListener('click', () => {
          ocr.disabled = true
          reason.textContent = 'Loading OCR…'
          void ocrPdf(file, (msg) => {
            reason.textContent = msg
          })
            .then((text) => {
              appendToInput(textarea, text)
              status.textContent = '✓'
              item.classList.remove('is-fail')
              item.classList.add('is-ok')
              reason.textContent = 'Extracted via OCR — review the text before roasting.'
              sources.add(file.name)
              ocr.remove()
              setCounter()
            })
            .catch((e: unknown) => {
              ocr.disabled = false
              reason.textContent =
                e instanceof UnsupportedFileError ? e.message : 'OCR failed. Paste the text instead.'
            })
        })
        item.appendChild(ocr)
      }
    }
    setCounter()
  }
}

function appendToInput(textarea: HTMLTextAreaElement, text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  const existing = textarea.value.trim()
  textarea.value = existing ? `${existing}\n\n${trimmed}` : trimmed
}

// --- manual link rows ---

const linkTimers = new WeakMap<HTMLElement, number>()

function addLinkRow(container: HTMLElement, value = ''): HTMLElement {
  // Reuse the first empty row when a value is supplied (e.g. from a search pick).
  if (value) {
    for (const input of Array.from(
      container.querySelectorAll<HTMLInputElement>('.link-row__input'),
    )) {
      if (!input.value.trim()) {
        input.value = value
        const reuse = input.closest('.link-row') as HTMLElement
        updateLinkRow(reuse)
        return reuse
      }
    }
  }
  const row = document.createElement('div')
  row.className = 'link-row'
  row.innerHTML =
    '<div class="link-row__top">' +
    '<input class="input link-row__input" type="url" placeholder="ORCID iD, or an orcid.org / openalex.org / github.com link" />' +
    '<button class="link-row__remove" type="button" aria-label="Remove link">×</button></div>' +
    '<div class="link-row__meta" hidden>' +
    '<span class="link-row__tag"></span>' +
    '<a class="link-row__inspect" target="_blank" rel="noopener">View record <span aria-hidden="true">↗</span></a>' +
    '<span class="link-row__retrieve"></span></div>' +
    '<small class="link-row__reason"></small>'
  const input = row.querySelector<HTMLInputElement>('.link-row__input') as HTMLInputElement
  if (value) input.value = value
  ;(row.querySelector('.link-row__remove') as HTMLButtonElement).addEventListener('click', () =>
    row.remove(),
  )
  input.addEventListener('input', () => updateLinkRow(row))
  input.addEventListener('blur', () => updateLinkRow(row))
  container.appendChild(row)
  updateLinkRow(row)
  return row
}

// Validate one row: show the source tag + record link immediately; debounce the
// retrieval and surface a ✓/✗ status. (The roast re-retrieves authoritatively.)
function updateLinkRow(row: HTMLElement): void {
  const input = row.querySelector<HTMLInputElement>('.link-row__input') as HTMLInputElement
  const meta = row.querySelector<HTMLElement>('.link-row__meta') as HTMLElement
  const tag = row.querySelector<HTMLElement>('.link-row__tag') as HTMLElement
  const inspect = row.querySelector<HTMLAnchorElement>('.link-row__inspect') as HTMLAnchorElement
  const retrieve = row.querySelector<HTMLElement>('.link-row__retrieve') as HTMLElement
  const reason = row.querySelector<HTMLElement>('.link-row__reason') as HTMLElement
  const v = input.value.trim()
  row.classList.remove('ok', 'bad')
  reason.textContent = ''
  if (!v) {
    meta.hidden = true
    row.dataset.retrieved = ''
    retrieve.className = 'link-row__retrieve'
    retrieve.textContent = ''
    return
  }
  const det = detectSource(v)
  if (!det) {
    meta.hidden = true
    row.classList.add('bad')
    reason.textContent = UNSUPPORTED_LINK
    row.dataset.retrieved = ''
    return
  }
  row.classList.add('ok')
  tag.textContent = SOURCE_LABELS[det.source]
  inspect.href = recordUrl(det)
  meta.hidden = false
  if (row.dataset.retrieved === v) return
  window.clearTimeout(linkTimers.get(row))
  retrieve.className = 'link-row__retrieve'
  retrieve.innerHTML = ''
  linkTimers.set(
    row,
    window.setTimeout(() => {
      row.dataset.retrieved = v
      retrieve.className = 'link-row__retrieve is-loading'
      retrieve.innerHTML = '<span class="spinner" aria-hidden="true"></span> Retrieving…'
      void retrieveSource(config.workerUrl, det.source, det.id).then((res) => {
        if (input.value.trim() !== v) return
        if (res.ok && res.text) {
          retrieve.className = 'link-row__retrieve is-ok'
          retrieve.innerHTML = '<span class="search__mark" aria-hidden="true">✓</span> Retrieved'
          retrieve.title = ''
        } else {
          retrieve.className = 'link-row__retrieve is-bad'
          retrieve.innerHTML = '<span class="search__mark" aria-hidden="true">✗</span> Failed'
          retrieve.title = res.reason ?? 'Retrieval failed.'
        }
      })
    }, 500),
  )
}

// --- search by name ---

function normaliseName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Lower score = closer match to the query. `full` is true when the candidate name
// contains the entire query name (so those rank first and stay out of the foldout).
function rankName(name: string, q: string, qTokens: string[]): { score: number; full: boolean } {
  const n = normaliseName(name)
  if (!q) return { score: 0, full: true }
  if (n === q) return { score: 0, full: true }
  const nTokens = n ? n.split(' ') : []
  const nSet = new Set(nTokens)
  const overlap = qTokens.filter((t) => nSet.has(t)).length
  const phrase = n.includes(q)
  const full = phrase || overlap === qTokens.length
  if (full) {
    // Penalise extra name parts and length difference so the shortest exact-ish
    // match (e.g. "Iliana Samara") beats longer ones ("Iliana Samara Hurtado…").
    const extra = Math.max(0, nTokens.length - qTokens.length)
    return {
      score: 1 + extra + (phrase ? 0 : 0.25) + Math.min(0.9, Math.abs(n.length - q.length) / 200),
      full: true,
    }
  }
  return { score: 100 - overlap, full: false }
}

async function doSearch(
  query: string,
  results: HTMLElement,
  linksContainer: HTMLElement,
): Promise<void> {
  results.textContent = ''
  const q = query.trim()
  if (!q) return

  const pending = document.createElement('p')
  pending.className = 'search__status'
  pending.textContent = 'Searching…'
  results.appendChild(pending)

  const settled = await Promise.all(
    SEARCH_SOURCES.map(async (source) => ({
      source,
      result: await searchSource(config.workerUrl, source, q),
    })),
  )
  results.textContent = ''

  const found: Array<{ source: SourceKind; candidate: Candidate }> = []
  const notes: string[] = []
  for (const { source, result } of settled) {
    if (!result.ok) {
      notes.push(`${SOURCE_LABELS[source]}: ${result.reason ?? 'search failed'}`)
      continue
    }
    const cands = result.candidates ?? []
    if (!cands.length) notes.push(`${SOURCE_LABELS[source]}: no matches`)
    for (const candidate of cands) found.push({ source, candidate })
  }

  if (!found.length && !notes.length) {
    const empty = document.createElement('p')
    empty.className = 'search__status'
    empty.textContent = 'No matches found.'
    results.appendChild(empty)
    return
  }

  // Rank all candidates across sources by similarity to the query. Entries that
  // contain the full name show first (closest/shortest first); the rest go under a
  // single "see more" foldout. When nothing contains the full name, show the top 3.
  const nq = normaliseName(query)
  const qTokens = nq ? nq.split(' ') : []
  const ranked = found
    .map((f) => ({ ...f, ...rankName(f.candidate.name, nq, qTokens) }))
    .sort((a, b) => a.score - b.score)
  let primary = ranked.filter((r) => r.full)
  let rest = ranked.filter((r) => !r.full)
  if (!primary.length) {
    primary = ranked.slice(0, 3)
    rest = ranked.slice(3)
  }
  for (const r of primary) {
    results.appendChild(searchResultRow(r.source, r.candidate, linksContainer))
  }
  if (rest.length) {
    const more = document.createElement('details')
    more.className = 'search__more'
    const summary = document.createElement('summary')
    summary.className = 'search__more-summary'
    summary.textContent = 'See more options if this may not be you'
    more.appendChild(summary)
    for (const r of rest) {
      more.appendChild(searchResultRow(r.source, r.candidate, linksContainer))
    }
    results.appendChild(more)
  }
  for (const note of notes) {
    const line = document.createElement('p')
    line.className = 'search__note'
    line.textContent = note
    results.appendChild(line)
  }
}

function searchResultRow(
  source: SourceKind,
  candidate: Candidate,
  linksContainer: HTMLElement,
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'search__result'

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'search__check'
  const cbWrap = document.createElement('label')
  cbWrap.className = 'search__checkwrap'
  cbWrap.appendChild(checkbox)

  const body = document.createElement('div')
  body.className = 'search__body'
  const name = document.createElement('span')
  name.className = 'search__name'
  name.textContent = candidate.name
  body.appendChild(name)
  if (candidate.affiliation) {
    const affil = document.createElement('span')
    affil.className = 'search__affil'
    affil.textContent = candidate.affiliation
    body.appendChild(affil)
  }
  body.addEventListener('click', () => {
    checkbox.checked = !checkbox.checked
    checkbox.dispatchEvent(new Event('change'))
  })

  const tag = document.createElement('span')
  tag.className = 'search__tag'
  tag.textContent = SOURCE_LABELS[source]
  const inspect = document.createElement('a')
  inspect.className = 'search__inspect'
  inspect.href = recordUrl({ source, id: candidate.id })
  inspect.target = '_blank'
  inspect.rel = 'noopener'
  inspect.title = 'Open the public record in a new tab'
  inspect.innerHTML = 'View record <span aria-hidden="true">↗</span>'
  const status = document.createElement('span')
  status.className = 'search__retrieve'
  const meta = document.createElement('div')
  meta.className = 'search__meta'
  meta.append(tag, inspect, status)

  const main = document.createElement('div')
  main.className = 'search__main'
  main.append(body, meta)
  row.append(cbWrap, main)

  // Ticking a result immediately adds its link row (in the background) and
  // retrieves it, showing the status inline on the result.
  let addedRow: HTMLElement | null = null
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      row.classList.add('is-selected')
      addedRow = addLinkRow(linksContainer, candidate.id)
      status.className = 'search__retrieve is-loading'
      status.innerHTML = '<span class="spinner" aria-hidden="true"></span> Retrieving…'
      checkbox.disabled = true
      void retrieveSource(config.workerUrl, source, candidate.id).then((res) => {
        checkbox.disabled = false
        if (res.ok && res.text) {
          status.className = 'search__retrieve is-ok'
          status.innerHTML = '<span class="search__mark" aria-hidden="true">✓</span> Retrieved'
          status.title = ''
        } else {
          status.className = 'search__retrieve is-bad'
          status.innerHTML = '<span class="search__mark" aria-hidden="true">✗</span> Failed'
          status.title = res.reason ?? 'Retrieval failed.'
        }
      })
    } else {
      row.classList.remove('is-selected')
      if (addedRow) {
        addedRow.remove()
        addedRow = null
      }
      status.className = 'search__retrieve'
      status.innerHTML = ''
      status.title = ''
    }
  })
  return row
}

// After Roast me / Download data, reduce the search results to just the ticked
// entries (flattened out of any "see more" foldout); drop everything else.
function collapseSearchToSelected(root: HTMLElement): void {
  const results = root.querySelector<HTMLElement>('#search-results')
  if (!results) return
  const checked = Array.from(results.querySelectorAll<HTMLElement>('.search__result')).filter(
    (r) => r.querySelector<HTMLInputElement>('.search__check')?.checked,
  )
  results.replaceChildren(...checked)
}

// --- roast ---

// The OpenAlex author id a retrieved block reports (ORCID auto-embeds an OpenAlex
// block; a standalone OpenAlex selection reports the same id), used to de-duplicate.
function openalexKeyOf(text: string): string | null {
  return text.match(/OpenAlex:[^\n]*\((A\d+)\)/i)?.[1]?.toUpperCase() ?? null
}

// De-duplicate retrieved records: collapse blocks that describe the same OpenAlex
// author (keeping the richest/longest copy — e.g. the ORCID block that embeds it),
// and drop exact-duplicate keyless blocks. Input order is preserved.
function dedupeRecords<T extends { text: string }>(items: T[]): T[] {
  const keyless: T[] = []
  const byKey = new Map<string, T>()
  for (const it of items) {
    const key = openalexKeyOf(it.text)
    if (!key) {
      if (!keyless.some((x) => x.text === it.text)) keyless.push(it)
      continue
    }
    const existing = byKey.get(key)
    if (!existing || it.text.length > existing.text.length) byKey.set(key, it)
  }
  const chosen = new Set<T>([...keyless, ...byKey.values()])
  const out: T[] = []
  for (const it of items) {
    if (chosen.has(it) && !out.includes(it)) out.push(it)
  }
  return out
}

// Retrieve every link row authoritatively (cached) and collect its text/stats/
// charts, updating each row's inline status; de-duplicate overlapping records.
async function validateLinks(
  root: HTMLElement,
  sources: Set<string>,
): Promise<{ texts: string[]; stats: SourceStats[]; charts: ChartData[] }> {
  const collected: Array<{ text: string; stats?: SourceStats; charts?: ChartData }> = []
  for (const row of Array.from(root.querySelectorAll<HTMLElement>('.link-row'))) {
    const input = row.querySelector<HTMLInputElement>('.link-row__input')
    const meta = row.querySelector<HTMLElement>('.link-row__meta')
    const tag = row.querySelector<HTMLElement>('.link-row__tag')
    const inspect = row.querySelector<HTMLAnchorElement>('.link-row__inspect')
    const retrieve = row.querySelector<HTMLElement>('.link-row__retrieve')
    const reason = row.querySelector<HTMLElement>('.link-row__reason')
    if (!input || !meta || !tag || !inspect || !retrieve || !reason) continue

    row.classList.remove('ok', 'bad')
    reason.textContent = ''
    const value = input.value.trim()
    if (!value) {
      meta.hidden = true
      continue
    }
    const detected = detectSource(value)
    if (!detected) {
      meta.hidden = true
      row.classList.add('bad')
      reason.textContent = UNSUPPORTED_LINK
      continue
    }
    row.classList.add('ok')
    tag.textContent = SOURCE_LABELS[detected.source]
    inspect.href = recordUrl(detected)
    meta.hidden = false
    retrieve.className = 'link-row__retrieve is-loading'
    retrieve.innerHTML = '<span class="spinner" aria-hidden="true"></span> Retrieving…'
    const res = await retrieveSource(config.workerUrl, detected.source, detected.id)
    if (res.ok && res.text) {
      retrieve.className = 'link-row__retrieve is-ok'
      retrieve.innerHTML = '<span class="search__mark" aria-hidden="true">✓</span> Retrieved'
      retrieve.title = ''
      row.dataset.retrieved = value
      collected.push({ text: res.text, stats: res.stats, charts: res.charts })
      sources.add(SOURCE_LABELS[detected.source])
    } else {
      retrieve.className = 'link-row__retrieve is-bad'
      retrieve.innerHTML = '<span class="search__mark" aria-hidden="true">✗</span> Failed'
      retrieve.title = res.reason ?? 'Retrieval failed.'
    }
  }
  const kept = dedupeRecords(collected)
  const texts = kept.map((k) => k.text)
  const statsSeen = new Set<string>()
  const stats: SourceStats[] = []
  for (const k of kept) {
    if (k.stats && !statsSeen.has(k.stats.title)) {
      statsSeen.add(k.stats.title)
      stats.push(k.stats)
    }
  }
  const charts = kept.flatMap((k) => (k.charts ? [k.charts] : []))
  return { texts, stats, charts }
}

function randomError(): string {
  const strings = copy.errorStrings
  return strings[Math.floor(Math.random() * strings.length)] ?? strings[0]
}

function selectedIntensity(root: HTMLElement): Intensity {
  const checked = root.querySelector<HTMLInputElement>('input[name="intensity"]:checked')
  const value = checked?.value
  return intensityLevels.includes(value as Intensity)
    ? (value as Intensity)
    : config.defaultIntensity
}

function placeholderOut(output: HTMLElement, text: string): void {
  output.className = 'output placeholder'
  output.textContent = text
}
function statusOut(output: HTMLElement, msg: string): void {
  output.className = 'output'
  const span = document.createElement('span')
  span.className = 'status-line'
  span.textContent = msg
  output.replaceChildren(span)
}
function streamOut(output: HTMLElement, text: string): void {
  output.className = 'output'
  const caret = document.createElement('span')
  caret.className = 'caret'
  output.replaceChildren(document.createTextNode(text), caret)
}

function fillPersonalia(
  root: HTMLElement,
  header: { name?: unknown; affiliation?: unknown } | null,
  sources: Set<string>,
): void {
  const value = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : 'unknown')
  const used = sources.size ? [...sources] : ['Pasted text']
  const set = (id: string, text: string): void => {
    const el = root.querySelector(`#${id}`)
    if (el) el.textContent = text
  }
  set('p-name', value(header?.name))
  set('p-affil', value(header?.affiliation))
  set('p-sources', used.join(', '))
  root.querySelector('#personalia')?.classList.remove('hidden')
}

function renderStatsCard(root: HTMLElement, stats: SourceStats[]): void {
  const card = root.querySelector<HTMLElement>('#stats-card')
  if (!card) return
  card.textContent = ''
  if (!stats.length) {
    card.setAttribute('hidden', '')
    return
  }
  for (const block of stats) {
    const title = document.createElement('h3')
    title.className = 'stats-card__title'
    title.textContent = block.title
    card.appendChild(title)
    const grid = document.createElement('dl')
    grid.className = 'stats-card__grid'
    for (const { label, value } of block.entries) {
      const cell = document.createElement('div')
      cell.className = 'stats-card__cell'
      const dt = document.createElement('dt')
      dt.textContent = label
      const dd = document.createElement('dd')
      dd.textContent = value
      cell.append(dt, dd)
      grid.appendChild(cell)
    }
    card.appendChild(grid)
  }
  card.removeAttribute('hidden')
}

// Zero-cost demo: render the saved fake researcher fully client-side.
function showDemo(root: HTMLElement, textarea: HTMLTextAreaElement, output: HTMLElement): void {
  textarea.value = demoResearcher.profile
  const demoSources = new Set<string>(['Simulated demo data'])
  output.className = 'output'
  output.textContent = demoResearcher.roast
  fillPersonalia(
    root,
    { name: demoResearcher.name, affiliation: demoResearcher.affiliation },
    demoSources,
  )
  renderStatsCard(root, [demoResearcher.stats])
  const chartsCard = root.querySelector<HTMLElement>('#charts-card')
  if (chartsCard) renderCharts(chartsCard, [demoResearcher.charts])
  root.querySelector('#share')?.classList.remove('hidden')
  output.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function runRoast(
  textarea: HTMLTextAreaElement,
  root: HTMLElement,
  output: HTMLElement,
  button: HTMLButtonElement,
  sources: Set<string>,
  manual: HTMLDetailsElement,
): Promise<void> {
  if (!config.workerUrl) {
    placeholderOut(output, 'Roasting is not configured in this build yet (no Worker URL).')
    return
  }

  button.disabled = true
  collapseSearchToSelected(root)
  root.querySelector('#share')?.classList.add('hidden')
  root.querySelector('#personalia')?.classList.add('hidden')
  root.querySelector('#stats-card')?.setAttribute('hidden', '')
  root.querySelector('#charts-card')?.setAttribute('hidden', '')
  statusOut(output, 'Checking links…')

  const { texts: linkTexts, stats: linkStats, charts: linkCharts } = await validateLinks(
    root,
    sources,
  )
  const profile = [textarea.value.trim(), ...linkTexts].filter(Boolean).join('\n\n').trim()
  if (!profile) {
    manual.open = true
    placeholderOut(output, 'Search for a name above, or add a link or paste text to get started.')
    button.disabled = false
    return
  }
  if (profile.length > config.maxInputChars) {
    placeholderOut(output, `That is longer than ${config.maxInputChars} characters. Trim it down.`)
    button.disabled = false
    return
  }
  statusOut(output, 'Roasting…')

  try {
    const response = await fetch(config.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        intensity: selectedIntensity(root),
        model: config.defaultModel,
      }),
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      const plain = new Set(['too_large', 'bad_model', 'bad_request', 'rate_limited'])
      placeholderOut(
        output,
        data && data.error && plain.has(data.error) && data.message ? data.message : randomError(),
      )
      return
    }

    // Stream the SSE response. The model emits a one-line JSON header
    // {name, affiliation} first; parse that into the personalia box and stream the
    // remainder as the roast (typing effect with a caret).
    const body = response.body
    if (!body) {
      placeholderOut(output, randomError())
      return
    }
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let raw = ''
    let headerDone = false
    let headerEnd = 0

    const tryHeader = (): void => {
      if (headerDone) return
      const s = raw.trimStart()
      if (!s.startsWith('{')) {
        if (raw.length > 200) {
          headerDone = true
          headerEnd = 0
          fillPersonalia(root, null, sources)
        }
        return
      }
      const close = s.indexOf('}')
      if (close === -1) return
      let header: { name?: unknown; affiliation?: unknown } | null = null
      try {
        header = JSON.parse(s.slice(0, close + 1)) as typeof header
      } catch {
        header = null
      }
      headerDone = true
      headerEnd = header ? raw.length - s.length + close + 1 : 0
      fillPersonalia(root, header, sources)
    }

    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          buffer = ''
          break
        }
        try {
          const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> }
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            raw += delta
            tryHeader()
            if (headerDone) streamOut(output, raw.slice(headerEnd).replace(/^\s+/, ''))
          }
        } catch {
          // Partial or non-JSON line; wait for more data.
        }
      }
    }

    if (!headerDone) {
      fillPersonalia(root, null, sources)
      headerEnd = 0
    }
    const roast = raw.slice(headerEnd).trim()
    if (!roast) {
      placeholderOut(output, randomError())
    } else {
      output.className = 'output'
      output.textContent = roast
      root.querySelector('#personalia')?.classList.remove('hidden')
      renderStatsCard(root, linkStats)
      const chartsCard = root.querySelector<HTMLElement>('#charts-card')
      if (chartsCard) renderCharts(chartsCard, linkCharts)
      root.querySelector('#share')?.classList.remove('hidden')
    }
  } catch {
    placeholderOut(output, randomError())
  } finally {
    button.disabled = false
  }
}

// --- data export (kept from before; lives in the manual disclosure) ---

function chartsToMarkdown(charts: ChartData): string {
  const out: string[] = []
  const series = (title: string, rows: Array<[string, string | number]>): void => {
    out.push(`**${title}**`, '', '| | |', '|---|---|', ...rows.map(([a, b]) => `| ${a} | ${b} |`), '')
  }
  if (charts.citationsPerYear?.length)
    series('Citations per year', charts.citationsPerYear.map((p) => [String(p.year), p.value]))
  if (charts.worksPerYear?.length)
    series('Publications per year', charts.worksPerYear.map((p) => [String(p.year), p.value]))
  if (charts.openAccess?.length)
    series('Open access', charts.openAccess.map((p) => [p.status, p.count]))
  if (charts.topCountries?.length)
    series('Co-author countries', charts.topCountries.map((p) => [p.country, p.count]))
  if (charts.topVenues?.length)
    series('Top venues', charts.topVenues.map((p) => [p.venue, p.count]))
  return out.length ? out.join('\n') : '_None._'
}

async function exportRetrievedData(
  root: HTMLElement,
  textarea: HTMLTextAreaElement,
  exportBtn: HTMLButtonElement,
): Promise<void> {
  const original = exportBtn.textContent
  exportBtn.disabled = true
  exportBtn.textContent = 'Retrieving…'
  collapseSearchToSelected(root)
  try {
    const parts: string[] = [
      '# Retrieved data',
      '',
      `_Generated ${new Date().toISOString()} — the data the tool retrieves and feeds to the roast._`,
      '',
      '## Pasted / uploaded input',
      '',
    ]
    const pasted = textarea.value.trim()
    parts.push(pasted ? '```\n' + pasted + '\n```' : '_None._', '')

    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('.link-row__input'))
      .map((i) => i.value.trim())
      .filter(Boolean)

    if (!inputs.length) {
      parts.push('## Sources', '', '_No profile links entered — add links and export again._')
    } else {
      type Row = {
        value: string
        detected: { source: SourceKind; id: string } | null
        result: RetrieveResult | null
      }
      const rows: Row[] = []
      for (const value of inputs) {
        const detected = detectSource(value)
        const result = detected
          ? await retrieveSource(config.workerUrl, detected.source, detected.id, true)
          : null
        rows.push({ value, detected, result })
      }
      // Same de-duplication as the roast: omit a record already contained in another.
      const okRows = rows.filter((r) => r.result?.ok && r.result.text)
      const kept = new Set(
        dedupeRecords(okRows.map((r) => ({ text: r.result?.text ?? '', row: r }))).map(
          (x) => x.row,
        ),
      )
      for (const r of rows) {
        if (!r.detected) {
          parts.push(`## ${r.value}`, '', '_Not a supported link._', '')
          continue
        }
        parts.push(`## ${r.detected.source} — ${r.detected.id}`, '')
        const result = r.result
        if (!result || !result.ok || !result.text) {
          parts.push(`_Retrieval failed: ${result?.reason ?? 'unknown error'}._`, '')
          continue
        }
        if (!kept.has(r)) {
          parts.push('_Same record as another selected source above — omitted to avoid duplication._', '')
          continue
        }
        parts.push('### Retrieved text (fed to the roast)', '', '```\n' + result.text + '\n```', '')
        if (result.stats) {
          parts.push('### Stats', '', '| Metric | Value |', '|---|---|')
          for (const e of result.stats.entries) parts.push(`| ${e.label} | ${e.value} |`)
          parts.push('')
        }
        if (result.charts) parts.push('### Charts data', '', chartsToMarkdown(result.charts), '')
      }
    }
    downloadText(parts.join('\n'), 'retrieved-data.md')
  } finally {
    exportBtn.disabled = false
    exportBtn.textContent = original
  }
}
