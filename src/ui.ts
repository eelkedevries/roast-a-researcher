import { config, copy, intensityLevels, formats, defaultFormat } from './config'
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
  type ApiPaper,
} from './sources'
import { renderCharts } from './charts'
import { consumeAuthFragment, getSession, loginUrl, logout, normaliseOrcid } from './auth'

const SOURCE_LABELS: Record<SourceKind, string> = {
  github: 'GitHub',
  orcid: 'ORCID',
  openalex: 'OpenAlex',
  semanticscholar: 'Semantic Scholar',
  dblp: 'DBLP',
  website: 'Website',
}
// Name-searchable sources, in the order shown. Only these three offer a by-name
// search; the numbered fields 1–3 correspond to them.
const SEARCH_SOURCES: readonly SourceKind[] = ['orcid', 'openalex', 'github']
const UNSUPPORTED_LINK =
  'That does not look like a web address. Enter a full link (https://…).'

// The three numbered fields that take a single structured identifier each. The
// source is fixed by the field, so a bare id or a profile URL both work.
const NUMBERED: ReadonlyArray<{ n: number; source: SourceKind; label: string; ph: string; hint: string }> = [
  { n: 1, source: 'orcid', label: 'ORCID', ph: 'ORCID iD or profile URL', hint: 'e.g. 0000-0002-1825-0097' },
  { n: 2, source: 'openalex', label: 'OpenAlex', ph: 'OpenAlex author ID or URL', hint: 'e.g. A5023888391' },
  { n: 3, source: 'github', label: 'GitHub', ph: 'GitHub username or URL', hint: 'e.g. torvalds' },
]

// scrollIntoView ignores the CSS scroll-behavior override, so honour the
// reduced-motion preference explicitly.
function scrollBehaviour(): ScrollBehavior {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

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
    case 'website':
      // Any http(s) input already returned above, so this case is always a bare host.
      return `https://${id}`
  }
}

// Builds the guided input console and wires it to the real Worker pipeline.
export function mountApp(root: HTMLElement): void {
  const segGroup = (name: string): string =>
    `<div class="segmented" role="radiogroup" aria-label="${copy.intensityLabel}">` +
    intensityLevels
      .map(
        (lvl) =>
          `<label><input type="radio" name="${name}" value="${lvl.value}"${
            lvl.value === config.defaultIntensity ? ' checked' : ''
          } /><span>${lvl.label}</span></label>`,
      )
      .join('') +
    `</div>`
  const optCheck = (key: string, label: string): string =>
    `<label class="inopt__check"><input type="checkbox" id="check-${key}" class="inopt__checkbox" aria-label="Include ${label}" /><span class="inopt__box" aria-hidden="true"></span></label>`
  const numberedRows = NUMBERED.map(
    (f) => `
      <li class="inopt" data-source="${f.source}">
        ${optCheck(f.source, f.label)}
        <span class="inopt__num" aria-hidden="true">${f.n}</span>
        <div class="inopt__body">
          <label class="inopt__label" for="in-${f.source}">${f.label}</label>
          <div class="inopt__manual">
            <input id="in-${f.source}" class="input inopt__input" type="text" placeholder="${f.ph}" aria-label="${f.label} — ${f.ph}" />
            <small class="inopt__hint">${f.hint}</small>
          </div>
          <div class="inopt__match" hidden></div>
          <p class="inopt__note" hidden></p>
        </div>
      </li>`,
  ).join('')
  root.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="topbar">
      <div class="topbar__inner">
        <a class="topbar__home" href="https://eelkedevries.com/">Eelke de Vries</a>
        <span class="topbar__sep" aria-hidden="true">/</span>
        <span class="topbar__here">Roast a Researcher</span>
      </div>
    </header>
    <main class="wrap" id="main">
      <header>
        <p class="kicker">Self-directed academic comedy</p>
        <h1>${copy.title}</h1>
        <p class="tagline">${copy.tagline}</p>
        <p class="framing">${copy.framing}</p>
        <div class="auth" id="auth-control"></div>
      </header>

      <section class="form" aria-label="Roast input">
        <div class="step">
          <div class="step__head">
            <span class="step__num">01</span>
            <h2 class="step__title">Add your sources</h2>
            <button class="step__sample" id="sample" type="button">See a sample roast</button>
          </div>

          <div class="search-hero">
            <span class="search-hero__icon" aria-hidden="true">⌕</span>
            <input id="search-query" class="search-hero__input" type="text" placeholder="Search for a researcher by name…" aria-label="Search for a researcher by name" />
            <button class="btn btn--primary search-hero__btn" id="search-btn" type="button">Search</button>
          </div>
          <p class="search-hint">Searches ORCID, OpenAlex and GitHub. Matches fill the options below — tick the ones to include, and change a match under “see more options”.</p>
          <p id="search-status" class="search-status" aria-live="polite"></p>

          <ol class="inputs" id="inputs" aria-label="Input options">
            ${numberedRows}
            <li class="inopt" data-kind="docs">
              ${optCheck('docs', 'uploaded documents')}
              <span class="inopt__num" aria-hidden="true">4</span>
              <div class="inopt__body">
                <span class="inopt__label">Upload documents <span class="inopt__eg">(e.g., CV)</span></span>
                <div class="upload" id="dropzone">
                  <input id="file" type="file" multiple accept=".txt,.md,.pdf,.docx,.odt" hidden />
                  <button class="chip" id="choose" type="button"><span class="chip__icon" aria-hidden="true">↑</span> Upload documents</button>
                  <span class="upload__hint">or drop files here — PDF · Word · ODT · txt · md</span>
                </div>
                <ul class="file-list" id="file-list"></ul>
              </div>
            </li>
            <li class="inopt" data-kind="url">
              ${optCheck('url', 'URL links')}
              <span class="inopt__num" aria-hidden="true">5</span>
              <div class="inopt__body">
                <span class="inopt__label">Enter URL link <span class="inopt__eg">(e.g., website)</span></span>
                <div id="urls"></div>
                <button class="chip" id="add-url" type="button"><span class="chip__icon" aria-hidden="true">+</span> Add another link</button>
              </div>
            </li>
          </ol>

          <div class="retrieve">
            <button class="btn btn--primary" id="retrieve-data" type="button">Retrieve data</button>
            <button class="step__utility" id="export-data" type="button" hidden>Download the retrieved data</button>
          </div>
          <div class="overview hidden" id="overview" aria-live="polite"></div>
        </div>

        <div class="step step--roast hidden" id="step-roast">
          <div class="step__head">
            <span class="step__num">02</span>
            <h2 class="step__title">Roast settings</h2>
          </div>
          <div class="action-row">
            <div class="action-row__intensity">
              <span class="micro-label">${copy.intensityLabel}</span>
              ${segGroup('intensity-in')}
            </div>
            <div class="action-row__format">
              <span class="micro-label">Format</span>
              <select id="format-in" class="select" aria-label="Roast format">
                ${formats
                  .map(
                    (f) =>
                      `<option value="${f.value}"${f.value === defaultFormat ? ' selected' : ''}>${f.label}</option>`,
                  )
                  .join('')}
              </select>
            </div>
            <div class="action-row__go">
              <button class="btn btn--primary" id="roast" type="button">${copy.roastButton}</button>
            </div>
          </div>
          <p class="step__hint">${copy.intensityHint}</p>
        </div>
      </section>

      <section class="result-card" aria-label="Roast output">
        <section class="rsec hidden" id="sec-personalia">
          <h2 class="rsec__h">Personalia</h2>
          <dl class="personalia" id="personalia"></dl>
          <div class="subsec hidden" id="sub-profiles">
            <h3 class="subsec__h">Profiles</h3>
            <ul class="plist" id="p-profiles"></ul>
          </div>
          <div class="subsec hidden" id="sub-grants">
            <h3 class="subsec__h">Grants</h3>
            <ul class="plist" id="p-grants"></ul>
          </div>
          <div class="subsec hidden" id="sub-awards">
            <h3 class="subsec__h">Awards</h3>
            <ul class="plist" id="p-awards"></ul>
          </div>
        </section>

        <section class="rsec" id="sec-profile">
          <h2 class="rsec__h">The roast</h2>
          <div class="output placeholder" id="output" aria-live="polite">${copy.outputPlaceholder}</div>
          <p class="runmeta hidden" id="runmeta"></p>
          <div class="reroast hidden" id="reroast">
            <div class="reroast__intensity">
              <span class="micro-label">${copy.intensityLabel}</span>
              ${segGroup('intensity-out')}
            </div>
            <div class="reroast__actions">
              <button class="btn btn--primary" id="reroast-btn" type="button">Re-roast</button>
              <button class="btn btn--ghost" id="inspect-papers" type="button">Inspect papers used</button>
            </div>
          </div>
        </section>

        <section class="rsec hidden" id="sec-papers">
          <h2 class="rsec__h">Papers</h2>
          <p class="papers-hint">Tick any that are not this researcher's — sources occasionally mis-attribute — then re-roast.</p>
          <ol class="papers" id="papers"></ol>
          <button class="btn btn--ghost hidden" id="papers-reroast" type="button">Re-roast without marked papers</button>
        </section>

        <section class="rsec hidden" id="sec-numbers">
          <h2 class="rsec__h">The numbers</h2>
          <div class="stats-card" id="stats-card" hidden></div>
          <div class="charts-card" id="charts-card" hidden></div>
        </section>

        <div class="share hidden" id="share">
          <button class="btn btn--ghost" id="s-copy" type="button">Copy</button>
          <button class="btn btn--ghost" id="s-txt" type="button">Download .txt</button>
          <button class="btn btn--ghost" id="s-img" type="button">Download image</button>
        </div>
      </section>

    </main>

    <footer class="site-footer">
      <div class="footer-inner">
        <span class="copy"><span class="bdot" aria-hidden="true"></span>&copy; Eelke de Vries · <a href="https://eelkedevries.com/">eelkedevries.com</a></span>
        <p class="privacy">${copy.privacyNotice}
          <a href="${copy.providerPolicyUrl}" target="_blank" rel="noopener">${copy.providerPolicyLabel}</a>.</p>
      </div>
    </footer>
  `

  const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T
  const output = $<HTMLElement>('#output')
  const roastBtn = $<HTMLButtonElement>('#roast')
  const fileList = $<HTMLUListElement>('#file-list')
  const urlsContainer = $<HTMLElement>('#urls')
  const searchStatus = $<HTMLElement>('#search-status')

  // Provenance of the current input (uploaded filenames, retrieved sources).
  const sources = new Set<string>()
  sourcesRef = sources

  // Any change to a provided input invalidates the last retrieval, so the next
  // roast re-retrieves rather than roasting stale data.
  const markDirty = (): void => {
    dirty = true
  }

  // ORCID login control (session-only). Read any token the Worker returned in the
  // URL fragment, then render the header control reflecting the current session.
  const { justLoggedIn } = consumeAuthFragment()
  const renderAuthControl = (): void => {
    const el = root.querySelector<HTMLElement>('#auth-control')
    if (!el) return
    if (!config.orcidLoginEnabled) {
      el.hidden = true
      return
    }
    el.hidden = false
    el.textContent = ''
    const session = getSession()
    if (session) {
      const who = document.createElement('span')
      who.className = 'auth__who'
      who.textContent = `${copy.loggedInLabel} ${session.orcid}`
      const out = document.createElement('button')
      out.type = 'button'
      out.className = 'auth__btn'
      out.textContent = copy.logoutButton
      out.addEventListener('click', () => {
        logout()
        renderAuthControl()
      })
      el.append(who, out)
    } else {
      const link = document.createElement('a')
      link.className = 'auth__btn auth__btn--login'
      link.href = loginUrl()
      link.textContent = copy.loginButton
      el.append(link)
    }
  }
  renderAuthControl()

  // The five include-checkboxes: toggling marks the retrieval stale and dims the row.
  for (const key of ['orcid', 'openalex', 'github', 'docs', 'url']) {
    const box = $<HTMLInputElement>(`#check-${key}`)
    box.addEventListener('change', () => {
      box.closest('.inopt')?.classList.toggle('inopt--off', !box.checked)
      markDirty()
    })
  }

  // Typing an ID/URL in a numbered field ticks that source and marks it stale.
  for (const f of NUMBERED) {
    const field = $<HTMLInputElement>(`#in-${f.source}`)
    field.addEventListener('input', () => {
      if (field.value.trim()) setChecked(root, f.source, true)
      markDirty()
    })
  }

  triggerRoast = (regenerate = false) =>
    void runRoast(root, output, roastBtn, regenerate)
  roastBtn.addEventListener('click', () => triggerRoast?.(false))
  $<HTMLButtonElement>('#papers-reroast').addEventListener('click', () => triggerRoast?.(true))

  // Intensity (3 levels), shared between the input control and the post-roast
  // control; picking a level in either updates the shared value and both controls.
  const intensityRadios = Array.from(
    root.querySelectorAll<HTMLInputElement>(
      'input[name="intensity-in"], input[name="intensity-out"]',
    ),
  )
  const syncIntensity = (val: number): void => {
    currentIntensity = val
    for (const r of intensityRadios) r.checked = Number(r.value) === val
  }
  for (const r of intensityRadios) {
    r.addEventListener('change', () => {
      if (r.checked) syncIntensity(Number(r.value))
    })
  }
  syncIntensity(currentIntensity)

  // Post-roast options: re-roast at the current intensity, or jump to the Papers
  // list to mark mis-attributed papers.
  $<HTMLButtonElement>('#reroast-btn').addEventListener('click', () => triggerRoast?.(true))
  $<HTMLButtonElement>('#inspect-papers').addEventListener('click', () => {
    root.querySelector('#sec-papers')?.scrollIntoView({ behavior: scrollBehaviour(), block: 'start' })
  })

  // Try a sample: the zero-cost canned demo (no model call).
  $<HTMLButtonElement>('#sample').addEventListener('click', () => {
    showDemo(root, output)
  })

  // File upload + drag-and-drop (the whole upload area is the drop target).
  // No paste box (option 4 is upload-only); a successful extract ticks the box.
  const fileInput = $<HTMLInputElement>('#file')
  const dropzone = $<HTMLElement>('#dropzone')
  const onDocsChange = (): void => {
    setChecked(root, 'docs', root.querySelectorAll('.file-list__item.is-ok').length > 0)
    markDirty()
  }
  $<HTMLButtonElement>('#choose').addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? [])
    if (files.length) void processFiles(files, fileList, sources, onDocsChange)
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
    if (files.length) void processFiles(files, fileList, sources, onDocsChange)
  })

  // URL rows (option 5); a valid URL ticks the box.
  const onUrlChange = (): void => {
    setChecked(root, 'url', root.querySelectorAll('.url-row.ok').length > 0)
    markDirty()
  }
  addUrlRow(urlsContainer, onUrlChange)
  $<HTMLButtonElement>('#add-url').addEventListener('click', () => addUrlRow(urlsContainer, onUrlChange))

  // Retrieve data (discrete step) — fetch everything, then show the overview.
  const retrieveBtn = $<HTMLButtonElement>('#retrieve-data')
  retrieveBtn.addEventListener('click', () => void runRetrieve(root, sources))

  // Export retrieved data.
  const exportBtn = $<HTMLButtonElement>('#export-data')
  exportBtn.addEventListener('click', () => void exportRetrievedData(exportBtn))

  // Search by name (primary). Re-searching resets the added inputs first.
  const searchQuery = $<HTMLInputElement>('#search-query')
  const resetInputs = (): void => {
    for (const f of NUMBERED) {
      resetSourceMatch(root, f.source)
      $<HTMLInputElement>(`#in-${f.source}`).value = ''
    }
    for (const key of ['orcid', 'openalex', 'github', 'docs', 'url']) setChecked(root, key, false)
    urlsContainer.textContent = ''
    addUrlRow(urlsContainer, onUrlChange)
    fileList.textContent = ''
    searchStatus.textContent = ''
    sources.clear()
    clearRetrieved(root)
  }
  const runSearch = (): void => {
    roastAbort?.abort()
    roastAbort = null
    resetInputs()
    void doSearch(searchQuery.value, root, searchStatus, markDirty)
  }
  $<HTMLButtonElement>('#search-btn').addEventListener('click', runSearch)
  searchQuery.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      runSearch()
    }
  })

  // Straight after a fresh ORCID login, pre-fill the verified researcher's own
  // iD so their data is one "Retrieve data" click away and a roast shows the badge.
  if (justLoggedIn) {
    const session = getSession()
    if (session) loadVerifiedProfile(root, session, searchStatus)
  }

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
}

// --- file upload ---

// Text extracted from each uploaded document, kept in memory (keyed by its
// file-list element) rather than dumped into the paste box. Collected into the
// roast input at retrieve time; entries vanish when the file row is removed.
const documentTexts = new WeakMap<HTMLElement, string>()

async function processFiles(
  files: File[],
  list: HTMLElement,
  sources: Set<string>,
  onChange: () => void,
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
      onChange()
    })
    top.append(status, name, size, remove)
    const reason = document.createElement('small')
    reason.className = 'file-list__reason'
    reason.hidden = true
    item.append(top, reason)
    list.appendChild(item)

    try {
      const extracted = (await extractText(file)).trim()
      documentTexts.set(item, extracted)
      status.textContent = '✓'
      item.classList.add('is-ok')
      reason.hidden = false
      reason.textContent = `Extracted — ${extracted.length.toLocaleString('en-GB')} characters used in the roast`
      sources.add(file.name)
      onChange()
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
              const t = text.trim()
              documentTexts.set(item, t)
              status.textContent = '✓'
              item.classList.remove('is-fail')
              item.classList.add('is-ok')
              reason.textContent = `Extracted via OCR — ${t.length.toLocaleString('en-GB')} characters used`
              sources.add(file.name)
              ocr.remove()
              onChange()
            })
            .catch((e: unknown) => {
              ocr.disabled = false
              reason.textContent =
                e instanceof UnsupportedFileError ? e.message : 'OCR failed. Try another file.'
            })
        })
        item.appendChild(ocr)
      }
    }
  }
}

// Collect the in-memory text extracted from all currently-listed documents.
function collectDocumentTexts(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.file-list__item'))
    .map((el) => documentTexts.get(el))
    .filter((t): t is string => !!t && t.trim() !== '')
}

// --- URL rows (option 5) ---

function addUrlRow(container: HTMLElement, onChange: () => void, value = ''): HTMLElement {
  const row = document.createElement('div')
  row.className = 'url-row'
  row.innerHTML =
    '<div class="url-row__top">' +
    '<input class="input url-row__input" type="url" placeholder="https://your-site.com, or any profile URL" aria-label="URL link" />' +
    '<button class="url-row__remove" type="button" aria-label="Remove link">×</button></div>' +
    '<div class="url-row__meta" hidden><span class="url-row__tag"></span></div>' +
    '<small class="url-row__reason"></small>'
  const input = row.querySelector<HTMLInputElement>('.url-row__input') as HTMLInputElement
  if (value) input.value = value
  ;(row.querySelector('.url-row__remove') as HTMLButtonElement).addEventListener('click', () => {
    row.remove()
    onChange()
  })
  input.addEventListener('input', () => {
    updateUrlRow(row)
    onChange()
  })
  input.addEventListener('blur', () => updateUrlRow(row))
  container.appendChild(row)
  updateUrlRow(row)
  return row
}

// Live feedback for a URL row: show the detected source tag, or flag an unusable
// value. Retrieval itself happens at the Retrieve-data step.
function updateUrlRow(row: HTMLElement): void {
  const input = row.querySelector<HTMLInputElement>('.url-row__input') as HTMLInputElement
  const meta = row.querySelector<HTMLElement>('.url-row__meta') as HTMLElement
  const tag = row.querySelector<HTMLElement>('.url-row__tag') as HTMLElement
  const reason = row.querySelector<HTMLElement>('.url-row__reason') as HTMLElement
  const v = input.value.trim()
  row.classList.remove('ok', 'bad')
  reason.textContent = ''
  if (!v) {
    meta.hidden = true
    return
  }
  const det = detectSource(v)
  if (!det) {
    meta.hidden = true
    row.classList.add('bad')
    reason.textContent = UNSUPPORTED_LINK
    return
  }
  row.classList.add('ok')
  tag.textContent = SOURCE_LABELS[det.source]
  meta.hidden = false
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

// Lower score = closer match to the query.
function rankName(name: string, q: string, qTokens: string[]): number {
  const n = normaliseName(name)
  if (!q) return 0
  if (n === q) return 0
  const nTokens = n ? n.split(' ') : []
  const nSet = new Set(nTokens)
  const overlap = qTokens.filter((t) => nSet.has(t)).length
  const phrase = n.includes(q)
  const full = phrase || overlap === qTokens.length
  if (full) {
    const extra = Math.max(0, nTokens.length - qTokens.length)
    return 1 + extra + (phrase ? 0 : 0.25) + Math.min(0.9, Math.abs(n.length - q.length) / 200)
  }
  return 100 - overlap
}

// Tick/untick a source's include-checkbox and reflect the dim (excluded) state.
function setChecked(root: HTMLElement, key: string, on: boolean): void {
  const box = root.querySelector<HTMLInputElement>(`#check-${key}`)
  if (!box) return
  box.checked = on
  box.closest('.inopt')?.classList.toggle('inopt--off', !on)
}

// Return a numbered source option to manual-entry mode (hide the match display).
function resetSourceMatch(root: HTMLElement, source: SourceKind): void {
  const li = root.querySelector<HTMLElement>(`.inopt[data-source="${source}"]`)
  if (!li) return
  const manual = li.querySelector<HTMLElement>('.inopt__manual')
  const match = li.querySelector<HTMLElement>('.inopt__match')
  const note = li.querySelector<HTMLElement>('.inopt__note')
  if (manual) manual.hidden = false
  if (match) {
    match.hidden = true
    match.textContent = ''
  }
  if (note) {
    note.hidden = true
    note.textContent = ''
  }
}

// Show an inline note on a source option (e.g. "no match — enter manually").
function setSourceNote(root: HTMLElement, source: SourceKind, text: string): void {
  const note = root.querySelector<HTMLElement>(`.inopt[data-source="${source}"] .inopt__note`)
  if (!note) return
  note.textContent = text
  note.hidden = false
}

// Search ORCID, OpenAlex and GitHub by name and fold the matches straight into the
// five-option list: each source's closest match populates its numbered option (as a
// name, not a raw ID) and ticks it; there is no separate results block.
async function doSearch(
  query: string,
  root: HTMLElement,
  status: HTMLElement,
  onChange: () => void,
): Promise<void> {
  const q = query.trim()
  if (!q) return
  status.textContent = 'Searching ORCID, OpenAlex and GitHub…'

  const settled = await Promise.all(
    SEARCH_SOURCES.map(async (source) => ({
      source,
      result: await searchSource(config.workerUrl, source, q),
    })),
  )
  status.textContent = ''

  const nq = normaliseName(query)
  const qTokens = nq ? nq.split(' ') : []
  let anyMatch = false
  let anyFailure = false

  for (const { source, result } of settled) {
    if (!result.ok) {
      anyFailure = true
      setSourceNote(root, source, `Search unavailable — enter your ${SOURCE_LABELS[source]} manually.`)
      continue
    }
    const cands = result.candidates ?? []
    if (!cands.length) {
      setSourceNote(root, source, `No ${SOURCE_LABELS[source]} match — enter it manually if you have one.`)
      continue
    }
    anyMatch = true
    const ranked = cands
      .map((candidate) => ({ candidate, score: rankName(candidate.name, nq, qTokens) }))
      .sort((a, b) => a.score - b.score)
      .map((r) => r.candidate)
    applySourceMatch(root, source, ranked, onChange)
  }

  if (!anyMatch) {
    status.textContent = anyFailure
      ? 'Search sources are unavailable right now — enter IDs or a URL manually below.'
      : 'No matches found — enter IDs or a URL manually below.'
  }
}

// Fold a source's search matches into its numbered option: show the chosen
// candidate (name + affiliation) in place of the raw-ID field, store the id, tick
// the source, and offer the rest under a "see more options" foldout. Picking
// another moves it to the top and folds the list back in.
function applySourceMatch(
  root: HTMLElement,
  source: SourceKind,
  candidates: Candidate[],
  onChange: () => void,
): void {
  const li = root.querySelector<HTMLElement>(`.inopt[data-source="${source}"]`)
  if (!li) return
  const input = li.querySelector<HTMLInputElement>(`#in-${source}`)
  const manual = li.querySelector<HTMLElement>('.inopt__manual')
  const match = li.querySelector<HTMLElement>('.inopt__match')
  const note = li.querySelector<HTMLElement>('.inopt__note')
  if (!input || !manual || !match || !note) return
  note.hidden = true
  note.textContent = ''
  let chosen = candidates[0]

  const chipRow = (candidate: Candidate): HTMLElement => {
    const row = document.createElement('div')
    row.className = 'search__result'
    if (candidate === chosen) row.classList.add('is-selected')
    const mark = document.createElement('span')
    mark.className = 'search__pick'
    mark.setAttribute('aria-hidden', 'true')
    mark.textContent = candidate === chosen ? '●' : '○'
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
    const inspect = document.createElement('a')
    inspect.className = 'search__inspect'
    inspect.href = recordUrl({ source, id: candidate.id })
    inspect.target = '_blank'
    inspect.rel = 'noopener'
    inspect.title = 'Open the public record in a new tab'
    inspect.innerHTML = 'View record <span aria-hidden="true">↗</span>'
    inspect.addEventListener('click', (e) => e.stopPropagation())
    row.append(mark, body, inspect)
    row.setAttribute('role', 'button')
    row.tabIndex = 0
    const pick = (): void => {
      chosen = candidate
      input.value = candidate.id
      setChecked(root, source, true)
      onChange()
      render()
    }
    row.addEventListener('click', pick)
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        pick()
      }
    })
    return row
  }

  const render = (): void => {
    match.textContent = ''
    match.appendChild(chipRow(chosen))
    const rest = candidates.filter((c) => c !== chosen)
    if (rest.length) {
      const more = document.createElement('details')
      more.className = 'search__more'
      const summary = document.createElement('summary')
      summary.className = 'search__more-summary'
      summary.textContent = `See ${rest.length} more option${rest.length === 1 ? '' : 's'}`
      more.appendChild(summary)
      for (const c of rest) more.appendChild(chipRow(c))
      match.appendChild(more)
    }
    const manualBtn = document.createElement('button')
    manualBtn.type = 'button'
    manualBtn.className = 'inopt__manual-toggle'
    manualBtn.textContent = 'Enter a different ID manually'
    manualBtn.addEventListener('click', () => {
      resetSourceMatch(root, source)
      input.value = ''
      setChecked(root, source, false)
      onChange()
      input.focus()
    })
    match.appendChild(manualBtn)
  }

  input.value = chosen.id
  setChecked(root, source, true)
  manual.hidden = true
  match.hidden = false
  render()
  onChange()
}

// On a fresh ORCID login, pre-fill the ORCID field with the verified iD, tick it,
// and note it, so a single "Retrieve data" click loads the researcher's own record.
function loadVerifiedProfile(
  root: HTMLElement,
  session: { orcid: string; name: string | null },
  status: HTMLElement,
): void {
  const input = root.querySelector<HTMLInputElement>('#in-orcid')
  if (input) input.value = session.orcid
  setChecked(root, 'orcid', true)
  dirty = true
  status.textContent = `Loaded your verified ORCID (${session.orcid}) — press Retrieve data.`
}

// --- retrieval ---

interface RetrievedItem {
  kind: 'source' | 'document'
  source?: SourceKind
  id?: string
  label: string
  ok: boolean
  skipped?: boolean
  reason?: string
  text?: string
  stats?: SourceStats
  charts?: ChartData
  papers?: ApiPaper[]
}

interface Retrieved {
  items: RetrievedItem[]
  docTexts: string[]
  blocks: Array<{ source: SourceKind; text: string }>
  stats: SourceStats[]
  charts: ChartData[]
  mergedPapers: Paper[]
}

// Individual papers / GitHub projects the user has de-selected in the overview, so
// they are dropped from the roast input. Papers reuse `excludedPaperKeys` (shared
// with the post-roast Papers list); projects are keyed by repository name. Applied
// when the profile is assembled at roast time, so toggling needs no re-fetch.
const excludedRepos = new Set<string>()

// The last successful retrieval, reused by Roast me and the export. `dirty` is set
// whenever an input changes, so the next roast re-retrieves instead of using stale
// data. Cleared on a new search.
let retrieved: Retrieved | null = null
let dirty = true

function clearRetrieved(root: HTMLElement): void {
  retrieved = null
  dirty = true
  const overview = root.querySelector<HTMLElement>('#overview')
  if (overview) {
    overview.textContent = ''
    overview.classList.add('hidden')
  }
  root.querySelector('#export-data')?.setAttribute('hidden', '')
  root.querySelector('#step-roast')?.classList.add('hidden')
  root.querySelector('#reroast')?.classList.add('hidden')
  root.querySelector('#stats-card')?.setAttribute('hidden', '')
  root.querySelector('#charts-card')?.setAttribute('hidden', '')
  excludedPaperKeys.clear()
  excludedRepos.clear()
}

// The OpenAlex author id a retrieved block reports (ORCID auto-embeds an OpenAlex
// block; a standalone OpenAlex selection reports the same id), used to de-duplicate.
function openalexKeyOf(text: string): string | null {
  return text.match(/OpenAlex:[^\n]*\((A\d+)\)/i)?.[1]?.toUpperCase() ?? null
}

// The OpenAlex author id a detected input points at (for skipping a redundant fetch).
function openalexIdOf(detected: { source: SourceKind; id: string }): string | null {
  if (detected.source !== 'openalex') return null
  return detected.id.match(/A\d+/i)?.[0]?.toUpperCase() ?? null
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

// Resolve every ticked input to a concrete {source, id}. The numbered fields force
// their source; URL rows auto-detect. Only options whose include-checkbox is ticked
// are collected, so a user can exclude a mis-matched source.
function collectInputs(root: HTMLElement): Array<{ source: SourceKind; id: string }> {
  const out: Array<{ source: SourceKind; id: string }> = []
  for (const f of NUMBERED) {
    if (!root.querySelector<HTMLInputElement>(`#check-${f.source}`)?.checked) continue
    const v = root.querySelector<HTMLInputElement>(`#in-${f.source}`)?.value.trim()
    if (v) out.push({ source: f.source, id: v })
  }
  if (root.querySelector<HTMLInputElement>('#check-url')?.checked) {
    for (const el of Array.from(root.querySelectorAll<HTMLInputElement>('.url-row__input'))) {
      const v = el.value.trim()
      if (!v) continue
      const det = detectSource(v)
      if (det) out.push(det)
    }
  }
  return out
}

// Retrieve every provided source, de-duplicating an OpenAlex record already
// covered by an ORCID one. Documents (extracted client-side) and pasted text are
// folded in. Returns the assembled bundle, or null if nothing was provided.
async function retrieveInputs(root: HTMLElement, sources: Set<string>): Promise<Retrieved | null> {
  const inputs = collectInputs(root)
  const docsChecked = root.querySelector<HTMLInputElement>('#check-docs')?.checked ?? false
  const docTexts = docsChecked ? collectDocumentTexts(root) : []
  if (!inputs.length && !docTexts.length) return null

  type Slot = { detected: { source: SourceKind; id: string }; item: RetrievedItem }
  const slots: Slot[] = inputs.map((detected) => ({
    detected,
    item: {
      kind: 'source',
      source: detected.source,
      id: detected.id,
      label: `${SOURCE_LABELS[detected.source]} — ${detected.id}`,
      ok: false,
    },
  }))

  const coveredOpenAlex = new Set<string>()
  const fetchSlot = async (slot: Slot): Promise<void> => {
    const res = await retrieveSource(config.workerUrl, slot.detected.source, slot.detected.id)
    if (res.ok && res.text) {
      slot.item.ok = true
      slot.item.text = res.text
      slot.item.stats = res.stats
      slot.item.charts = res.charts
      slot.item.papers = res.papers
      sources.add(SOURCE_LABELS[slot.detected.source])
      const k = openalexKeyOf(res.text)
      if (k) coveredOpenAlex.add(k)
    } else {
      slot.item.ok = false
      slot.item.reason = res.reason ?? 'Retrieval failed.'
    }
  }

  // Non-OpenAlex first, so an ORCID's embedded OpenAlex record can cover a
  // standalone OpenAlex input and skip its redundant fetch.
  const nonOpenalex = slots.filter((s) => s.detected.source !== 'openalex')
  const openalex = slots.filter((s) => s.detected.source === 'openalex')
  await Promise.all(nonOpenalex.map(fetchSlot))
  for (const slot of openalex) {
    const aId = openalexIdOf(slot.detected)
    if (aId && coveredOpenAlex.has(aId)) {
      slot.item.ok = true
      slot.item.skipped = true
      slot.item.reason = 'Already included via the ORCID record'
      sources.add(SOURCE_LABELS[slot.detected.source])
      continue
    }
    await fetchSlot(slot)
  }

  const documentItems: RetrievedItem[] = docsChecked
    ? Array.from(
        root.querySelectorAll<HTMLElement>('.file-list__item.is-ok .file-list__name'),
      ).map((el) => ({ kind: 'document', label: el.textContent ?? 'Document', ok: true }))
    : []

  const items = [...slots.map((s) => s.item), ...documentItems]

  // De-duplicate the retrieved text blocks and collect stats/charts/papers.
  const kept = dedupeRecords(
    slots
      .map((s) => s.item)
      .filter((it): it is RetrievedItem & { text: string } => !!it.text),
  )
  const blocks = kept.map((k) => ({ source: (k.source ?? 'website') as SourceKind, text: k.text }))
  const statsSeen = new Set<string>()
  const stats: SourceStats[] = []
  for (const k of kept) {
    if (k.stats && !statsSeen.has(k.stats.title)) {
      statsSeen.add(k.stats.title)
      stats.push(k.stats)
    }
  }
  const charts = kept.flatMap((k) => (k.charts ? [k.charts] : []))
  const allPapers = kept.flatMap((k) => k.papers ?? [])
  const mergedPapers = mergePapers(allPapers)

  return { items, docTexts, blocks, stats, charts, mergedPapers }
}

// The papers still selected in the overview (all, minus any the user unticked).
function activePapers(data: Retrieved): Paper[] {
  return data.mergedPapers.filter((p) => p.title && !excludedPaperKeys.has(paperKey(p.title)))
}

// Parse the repository entries from a GitHub retrieval block ("Notable
// repositories:" list). Each `- <name>[, lang][, ★n][: description]` line is one.
function parseRepos(text: string): Array<{ name: string; display: string }> {
  const out: Array<{ name: string; display: string }> = []
  let inList = false
  for (const line of text.split('\n')) {
    if (/^Notable repositories:/i.test(line)) {
      inList = true
      continue
    }
    if (!inList) continue
    const m = line.match(/^-\s+(.*)$/)
    if (!m) continue
    const display = m[1].trim()
    const name = display.split(/[,:]/)[0].trim()
    if (name) out.push({ name, display })
  }
  return out
}

// Drop de-selected repository lines from a GitHub block.
function filterExcludedRepos(text: string): string {
  if (!excludedRepos.size) return text
  let inList = false
  return text
    .split('\n')
    .filter((line) => {
      if (/^Notable repositories:/i.test(line)) {
        inList = true
        return true
      }
      if (inList) {
        const m = line.match(/^-\s+(.*)$/)
        if (m) return !excludedRepos.has(m[1].split(/[,:]/)[0].trim())
      }
      return true
    })
    .join('\n')
}

// Assemble the roast profile from the retrieved bundle, honouring the overview's
// paper/project de-selections (applied here, not at fetch time, so toggling a
// checkbox needs no re-fetch).
function assembleProfile(data: Retrieved): string {
  const blocks = data.blocks.map((b) =>
    b.source === 'github' ? filterExcludedRepos(b.text) : b.text,
  )
  return [...data.docTexts, ...blocks, publicationsBlock(activePapers(data))]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

// The Retrieve-data step: fetch, store, and render the compact overview.
async function runRetrieve(root: HTMLElement, sources: Set<string>): Promise<Retrieved | null> {
  const btn = root.querySelector<HTMLButtonElement>('#retrieve-data')
  const overview = root.querySelector<HTMLElement>('#overview')
  const original = btn?.textContent ?? 'Retrieve data'
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Retrieving…'
  }
  if (overview) {
    overview.classList.remove('hidden')
    overview.innerHTML = '<p class="overview__status"><span class="spinner" aria-hidden="true"></span> Retrieving your sources…</p>'
  }
  try {
    const data = await retrieveInputs(root, sources)
    if (!data) {
      retrieved = null
      dirty = true
      if (overview) {
        overview.classList.remove('hidden')
        overview.innerHTML =
          '<p class="overview__status">Nothing to retrieve yet — search for a name, or add a source above.</p>'
      }
      root.querySelector('#export-data')?.setAttribute('hidden', '')
      root.querySelector('#step-roast')?.classList.add('hidden')
      return null
    }
    retrieved = data
    dirty = false
    renderOverview(root, data)
    root.querySelector('#export-data')?.removeAttribute('hidden')
    root.querySelector('#step-roast')?.classList.remove('hidden')
    return data
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = original
    }
  }
}

// Ensure a fresh retrieval exists before roasting (re-retrieving if the inputs
// changed), so Roast me works even if Retrieve data was skipped.
async function ensureRetrieved(root: HTMLElement, sources: Set<string>): Promise<Retrieved | null> {
  if (retrieved && !dirty) return retrieved
  return runRetrieve(root, sources)
}

// The GitHub public-repo count, parsed from the retrieved block ("Public repos: N").
function githubRepoCount(text: string): number | null {
  const m = text.match(/Public repos:\s*([\d,]+)/i)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

// A compact line describing a paper, for the papers foldout.
function paperEntryText(p: Paper): string {
  const bits = [p.venue, p.year != null ? String(p.year) : null].filter(Boolean).join(', ')
  const cites = p.citations != null ? `${p.citations} citation${p.citations === 1 ? '' : 's'}` : ''
  const meta = [bits, cites].filter(Boolean).join(' · ')
  return meta ? `${p.title} — ${meta}` : (p.title ?? '')
}

// A fold-out headline count whose entries each carry a checkbox (ticked = kept in
// the roast). Deselecting an entry calls its onToggle and updates the live count.
function selectionFoldout(
  label: string,
  sub: string,
  entries: Array<{ text: string; initial: boolean; onToggle: (on: boolean) => void }>,
): HTMLElement {
  const details = document.createElement('details')
  details.className = 'overview__group'
  const summary = document.createElement('summary')
  summary.className = 'overview__foldsummary'
  const num = document.createElement('span')
  num.className = 'overview__chip-n'
  const text = document.createElement('span')
  text.className = 'overview__foldtext'
  const lab = document.createElement('span')
  lab.className = 'overview__chip-label'
  lab.textContent = label
  const sb = document.createElement('span')
  sb.className = 'overview__chip-sub'
  sb.textContent = `${sub} · tap to select`
  text.append(lab, sb)
  const caret = document.createElement('span')
  caret.className = 'overview__caret'
  caret.setAttribute('aria-hidden', 'true')
  caret.textContent = '›'
  summary.append(num, text, caret)
  details.appendChild(summary)

  const ul = document.createElement('ul')
  ul.className = 'overview__entries'
  const boxes: HTMLInputElement[] = []
  const updateNum = (): void => {
    num.textContent = String(boxes.filter((c) => c.checked).length)
  }
  for (const e of entries) {
    const li = document.createElement('li')
    li.className = 'overview__entry'
    if (!e.initial) li.classList.add('is-off')
    const l = document.createElement('label')
    l.className = 'overview__entry-label'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.className = 'overview__entry-check'
    cb.checked = e.initial
    const span = document.createElement('span')
    span.className = 'overview__entry-text'
    span.textContent = e.text
    cb.addEventListener('change', () => {
      e.onToggle(cb.checked)
      li.classList.toggle('is-off', !cb.checked)
      updateNum()
    })
    l.append(cb, span)
    li.appendChild(l)
    ul.appendChild(li)
    boxes.push(cb)
  }
  updateNum()
  details.appendChild(ul)
  return details
}

// Render the compact overview: papers and projects as fold-out checklists (deselect
// an entry to drop it from the roast), documents/links as counts, plus a per-source
// ✓/✗ status list.
function renderOverview(root: HTMLElement, data: Retrieved): void {
  const overview = root.querySelector<HTMLElement>('#overview')
  if (!overview) return
  overview.textContent = ''
  overview.classList.remove('hidden')

  const sourceItems = data.items.filter((it) => it.kind === 'source')
  const okSources = sourceItems.filter((it) => it.ok)
  const documents = data.items.filter((it) => it.kind === 'document')
  const repos = okSources
    .filter((it) => it.source === 'github' && it.text)
    .flatMap((it) => parseRepos(it.text as string))
  const links = okSources.filter((it) => it.source === 'website').length

  const title = document.createElement('h3')
  title.className = 'overview__title'
  title.textContent = okSources.length || documents.length ? 'Retrieved data' : 'Nothing retrieved yet'
  overview.appendChild(title)

  // Papers foldout — deselect to drop a paper from the roast.
  if (data.mergedPapers.length) {
    overview.appendChild(
      selectionFoldout(
        'papers',
        'via ORCID · OpenAlex',
        data.mergedPapers.map((p) => ({
          text: paperEntryText(p),
          initial: !!p.title && !excludedPaperKeys.has(paperKey(p.title)),
          onToggle: (on) => {
            const k = paperKey(p.title ?? '')
            if (on) excludedPaperKeys.delete(k)
            else excludedPaperKeys.add(k)
          },
        })),
      ),
    )
  }

  // Projects foldout — deselect to drop a repository from the roast.
  if (repos.length) {
    overview.appendChild(
      selectionFoldout(
        'projects',
        'via GitHub',
        repos.map((r) => ({
          text: r.display,
          initial: !excludedRepos.has(r.name),
          onToggle: (on) => {
            if (on) excludedRepos.delete(r.name)
            else excludedRepos.add(r.name)
          },
        })),
      ),
    )
  }

  // Documents / links — simple counts (no per-entry selection).
  const chips: Array<{ n: string; label: string; sub: string }> = []
  if (documents.length)
    chips.push({ n: String(documents.length), label: documents.length === 1 ? 'document' : 'documents', sub: 'scanned' })
  if (links)
    chips.push({ n: String(links), label: links === 1 ? 'link' : 'links', sub: 'scanned' })
  if (chips.length) {
    const grid = document.createElement('div')
    grid.className = 'overview__chips'
    for (const c of chips) {
      const chip = document.createElement('div')
      chip.className = 'overview__chip'
      const num = document.createElement('span')
      num.className = 'overview__chip-n'
      num.textContent = c.n
      const lab = document.createElement('span')
      lab.className = 'overview__chip-label'
      lab.textContent = c.label
      const sub = document.createElement('span')
      sub.className = 'overview__chip-sub'
      sub.textContent = c.sub
      chip.append(num, lab, sub)
      grid.appendChild(chip)
    }
    overview.appendChild(grid)
  }

  const list = document.createElement('ul')
  list.className = 'overview__list'
  for (const it of data.items) {
    const li = document.createElement('li')
    li.className = `overview__row ${it.ok ? 'is-ok' : 'is-bad'}`
    const mark = document.createElement('span')
    mark.className = 'overview__mark'
    mark.setAttribute('aria-hidden', 'true')
    mark.textContent = it.ok ? '✓' : '✗'
    const label = document.createElement('span')
    label.className = 'overview__label'
    label.textContent = it.label
    const detail = document.createElement('span')
    detail.className = 'overview__detail'
    if (it.skipped) detail.textContent = it.reason ?? 'already included'
    else if (!it.ok) detail.textContent = it.reason ?? 'retrieval failed'
    else if (it.kind === 'document') detail.textContent = 'scanned'
    else if (it.source === 'github') {
      const n = it.text ? githubRepoCount(it.text) : null
      detail.textContent = n != null ? `${n.toLocaleString('en-GB')} public repos` : 'retrieved'
    } else if (it.papers?.length) detail.textContent = `${it.papers.length.toLocaleString('en-GB')} papers`
    else detail.textContent = 'retrieved'
    li.append(mark, label, detail)
    list.appendChild(li)
  }
  if (list.children.length) overview.appendChild(list)

  const hint = document.createElement('p')
  hint.className = 'overview__hint'
  hint.textContent = okSources.length || documents.length
    ? 'Looks right? Choose an intensity and roast. Wrong match? Fix a field above and retrieve again.'
    : 'No sources came back — check the links above and retrieve again.'
  overview.appendChild(hint)
}

// --- papers merge/de-dupe ---

// A few common words ignored when comparing titles, so a preprint and its journal
// version (which often differ by a word or two) collapse to one work.
const TITLE_STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'on', 'in', 'to', 'and', 'with', 'from', 'by',
])

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((w) => w && !TITLE_STOPWORDS.has(w)),
  )
}

// Two titles are the same work when (almost) every token of the shorter appears in
// the longer — containment ≥ 0.9 — provided the shorter has enough tokens (≥ 4)
// that the overlap is meaningful. Conservative, to avoid merging distinct papers.
function sameWork(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  if (small.size < 4) return false
  let shared = 0
  for (const t of small) if (large.has(t)) shared++
  return shared / small.size >= 0.9
}

// Merge papers from every source and remove duplicates: an exact match on DOI or
// normalised title, plus a fuzzy pass that collapses near-identical titles (a
// preprint and its journal version, or the same work from two sources). Keep the
// highest citation count, fill any missing venue/year, prefer the fullest title;
// sort by citations then year (most notable first).
function mergePapers(papers: ApiPaper[]): Paper[] {
  const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  type Group = { paper: Paper; tokens: Set<string>; doi: string | null; key: string }
  const groups: Group[] = []
  for (const p of papers) {
    const title = (p.title || '').trim()
    if (!title) continue
    const doi = p.doi ?? null
    const key = norm(title)
    const tokens = titleTokens(title)
    const match = groups.find(
      (g) => (doi && g.doi === doi) || g.key === key || sameWork(g.tokens, tokens),
    )
    if (!match) {
      groups.push({
        paper: { title, venue: p.venue ?? null, year: p.year ?? null, citations: p.citations ?? null },
        tokens,
        doi,
        key,
      })
      continue
    }
    const ex = match.paper
    if ((p.citations ?? -1) > (ex.citations ?? -1)) ex.citations = p.citations ?? ex.citations
    if (!ex.venue && p.venue) ex.venue = p.venue
    if (ex.year == null && p.year != null) ex.year = p.year
    if (title.length > (ex.title?.length ?? 0)) ex.title = title
    if (!match.doi && doi) match.doi = doi
    for (const t of tokens) match.tokens.add(t)
  }
  return groups
    .map((g) => g.paper)
    .sort((a, b) => (b.citations ?? -1) - (a.citations ?? -1) || (b.year ?? 0) - (a.year ?? 0))
}

// An authoritative, de-duplicated publications list to hand the model, so it never
// sees the same work twice with conflicting citation counts (the per-source
// narrative can list a preprint and its journal version separately). Capped to
// keep the input bounded.
function publicationsBlock(papers: Paper[]): string {
  if (!papers.length) return ''
  const lines = papers.slice(0, 60).map((p) => {
    const meta = [p.venue, p.year != null ? String(p.year) : null].filter(Boolean).join(', ')
    const cites =
      p.citations != null ? ` — ${p.citations} citation${p.citations === 1 ? '' : 's'}` : ''
    return `- "${p.title}"${meta ? ` (${meta})` : ''}${cites}`
  })
  return [
    'PUBLICATIONS (authoritative, de-duplicated across all sources — each distinct work appears exactly once, with its highest citation count):',
    ...lines,
  ].join('\n')
}

function randomError(): string {
  const strings = copy.errorStrings
  return strings[Math.floor(Math.random() * strings.length)] ?? strings[0]
}

// Current roast intensity (one of the three levels), shared by the input and
// post-roast controls; read at roast time.
let currentIntensity = config.defaultIntensity
function selectedIntensity(): number {
  return currentIntensity
}

function selectedFormat(): string {
  return document.querySelector<HTMLSelectElement>('#format-in')?.value || defaultFormat
}

// The roast text. Prefer everything after the ===ROAST=== marker, which is robust to
// models that wrap the leading JSON in ```code fences``` before the marker (e.g.
// Claude); fall back to the parser-computed roastStart when the marker is absent.
function roastBody(raw: string, roastStart: number): string {
  const MARK = '===ROAST==='
  const mk = raw.indexOf(MARK)
  const body = mk >= 0 ? raw.slice(mk + MARK.length) : raw.slice(roastStart)
  // The roast is rendered as plain text; strip any stray markdown emphasis asterisks
  // some models (e.g. Claude) add despite the plain-prose instruction, so they don't
  // show as literal "*". (Asterisks have no legitimate place in roast prose.)
  return body.replace(/^\s+/, '').replace(/\*+/g, '')
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

interface Paper {
  title?: string
  venue?: string | null
  year?: number | null
  citations?: number | null
}
interface Personalia {
  name?: string | null
  position?: string | null
  currentAffiliations?: string[]
  previousAffiliations?: string[]
  researchDomain?: string | null
  researchFocus?: string[]
  education?: string[]
  grants?: string[]
  awards?: string[]
  papers?: Paper[]
}

const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const asStrList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((s) => s.trim())
    : []

// Render the structured Personalia + Profiles/Grants/Awards + Papers sections from
// the model's JSON block. Empty fields and sections are omitted. `data` is null
// when the model did not return a parseable block (sections stay hidden).
function renderResult(root: HTMLElement, data: Personalia | null): void {
  const dl = root.querySelector<HTMLElement>('#personalia')
  const sec = root.querySelector<HTMLElement>('#sec-personalia')
  if (!dl || !sec) return
  dl.textContent = ''

  const addRow = (label: string, value: string, id?: string): void => {
    if (!value) return
    const row = document.createElement('div')
    row.className = 'row'
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    if (id) dd.id = id
    row.append(dt, dd)
    dl.appendChild(row)
  }

  addRow('Name', asStr(data?.name), 'p-name')
  addRow('Position', asStr(data?.position))
  addRow('Current affiliation', asStrList(data?.currentAffiliations).join('; '))
  addRow('Previous affiliations', asStrList(data?.previousAffiliations).join('; '))
  addRow('Research domain', asStr(data?.researchDomain))
  addRow('Research focus', asStrList(data?.researchFocus).join(', '))
  addRow('Education & qualifications', asStrList(data?.education).join('; '))

  renderProfiles(root)
  renderSubList(root, '#sub-grants', '#p-grants', asStrList(data?.grants))
  renderSubList(root, '#sub-awards', '#p-awards', asStrList(data?.awards))
  maybeAddVerifiedBadge(root)

  const hasSub = (sel: string): boolean => !root.querySelector(sel)?.classList.contains('hidden')
  const hasPersonalia =
    dl.children.length > 0 || hasSub('#sub-profiles') || hasSub('#sub-grants') || hasSub('#sub-awards')
  sec.classList.toggle('hidden', !hasPersonalia)

  renderPapers(root, Array.isArray(data?.papers) ? (data?.papers as Paper[]) : [])
}

// The "Profiles" subsection lists the online profiles/links the user supplied.
function renderProfiles(root: HTMLElement): void {
  const sub = root.querySelector<HTMLElement>('#sub-profiles')
  const list = root.querySelector<HTMLElement>('#p-profiles')
  if (!sub || !list) return
  list.textContent = ''
  const seen = new Set<string>()
  for (const detected of collectInputs(root)) {
    const url = recordUrl(detected)
    if (seen.has(url)) continue
    seen.add(url)
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = `${SOURCE_LABELS[detected.source]}: ${url}`
    li.appendChild(a)
    list.appendChild(li)
  }
  sub.classList.toggle('hidden', list.children.length === 0)
}

function renderSubList(root: HTMLElement, secSel: string, listSel: string, items: string[]): void {
  const sec = root.querySelector<HTMLElement>(secSel)
  const list = root.querySelector<HTMLElement>(listSel)
  if (!sec || !list) return
  list.textContent = ''
  for (const item of items) {
    const li = document.createElement('li')
    li.textContent = item
    list.appendChild(li)
  }
  sec.classList.toggle('hidden', items.length === 0)
}

// Papers the user has marked as "not theirs" (by normalised title); excluded from
// the roast on re-roast. Persists across re-roasts, cleared on a new search.
const excludedPaperKeys = new Set<string>()
// The in-flight roast fetch, so a new Search/Sample can cancel a stale stream
// before it overwrites the freshly-reset UI.
let roastAbort: AbortController | null = null
const paperKey = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Re-runs the current roast (set by mountApp); used by the Papers re-roast button.
let triggerRoast: ((regenerate?: boolean) => void) | null = null

function updateReroastButton(root: HTMLElement): void {
  const btn = root.querySelector<HTMLButtonElement>('#papers-reroast')
  if (!btn) return
  const n = excludedPaperKeys.size
  btn.classList.toggle('hidden', n === 0)
  btn.textContent = `Re-roast without ${n} marked paper${n === 1 ? '' : 's'}`
}

function renderPapers(root: HTMLElement, papers: Paper[]): void {
  const sec = root.querySelector<HTMLElement>('#sec-papers')
  const ol = root.querySelector<HTMLElement>('#papers')
  if (!sec || !ol) return
  ol.textContent = ''
  for (const p of papers) {
    const title = asStr(p?.title)
    if (!title) continue
    const key = paperKey(title)
    const li = document.createElement('li')
    li.className = 'paper'
    if (excludedPaperKeys.has(key)) li.classList.add('excluded')

    const label = document.createElement('label')
    label.className = 'paper__mark'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = excludedPaperKeys.has(key)
    cb.title = "Tick if this paper is not by this researcher"
    cb.addEventListener('change', () => {
      if (cb.checked) excludedPaperKeys.add(key)
      else excludedPaperKeys.delete(key)
      li.classList.toggle('excluded', cb.checked)
      updateReroastButton(root)
    })
    const markText = document.createElement('span')
    markText.className = 'paper__mark-text'
    markText.textContent = 'not mine'
    label.append(cb, markText)

    const body = document.createElement('div')
    body.className = 'paper__body'
    const t = document.createElement('span')
    t.className = 'paper__title'
    t.textContent = title
    body.appendChild(t)
    const bits: string[] = []
    const venue = asStr(p?.venue)
    if (venue) bits.push(venue)
    if (typeof p?.year === 'number') bits.push(String(p.year))
    let metaText = bits.join(' · ')
    if (typeof p?.citations === 'number') metaText += `${metaText ? ' — ' : ''}cited ${p.citations}`
    if (metaText) {
      const meta = document.createElement('span')
      meta.className = 'paper__meta'
      meta.textContent = metaText
      body.append(document.createElement('br'), meta)
    }
    li.append(label, body)
    ol.appendChild(li)
  }
  sec.classList.toggle('hidden', ol.children.length === 0)
  updateReroastButton(root)
}

// Show or hide the "The numbers" section based on whether any stats/charts rendered.
function toggleNumbers(root: HTMLElement, stats: SourceStats[], charts: ChartData[]): void {
  const hasCharts = charts.some(
    (c) =>
      c.worksPerYear?.length ||
      c.citationsPerYear?.length ||
      c.openAccess?.length ||
      c.topCountries?.length ||
      c.topVenues?.length,
  )
  root.querySelector('#sec-numbers')?.classList.toggle('hidden', !(stats.length || hasCharts))
}

// Extract a complete leading JSON object from a string by brace-balancing (string
// aware), independent of any marker or surrounding prose/code fences. Returns the
// parsed object and the index just past its closing brace, or null if there is no
// balanced object yet (still streaming) or it does not parse.
function extractLeadingJson(s: string): { obj: unknown; end: number } | null {
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        try {
          return { obj: JSON.parse(s.slice(start, i + 1)), end: i + 1 }
        } catch {
          return null
        }
      }
    }
  }
  return null
}

interface Usage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  cost?: number
}

// Render the run metadata below the roast: elapsed time, input size, model, tokens
// and (when OpenRouter reports it) the dollar cost.
function renderRunMeta(
  root: HTMLElement,
  info: { elapsedMs: number; inputChars: number; model: string; usage: Usage | null },
): void {
  const el = root.querySelector<HTMLElement>('#runmeta')
  if (!el) return
  const n = (v: number): string => v.toLocaleString('en-GB')
  const parts: string[] = []
  parts.push(`Generated in ${(info.elapsedMs / 1000).toFixed(1)}s`)
  const promptTok = info.usage?.prompt_tokens
  parts.push(
    `Input ${n(info.inputChars)} chars${typeof promptTok === 'number' ? ` (${n(promptTok)} tokens)` : ''}`,
  )
  if (info.model) parts.push(`Model ${info.model}`)
  const total = info.usage?.total_tokens
  if (typeof total === 'number') {
    const p = info.usage?.prompt_tokens
    const c = info.usage?.completion_tokens
    const breakdown =
      typeof p === 'number' && typeof c === 'number' ? ` (prompt ${n(p)} + completion ${n(c)})` : ''
    parts.push(`${n(total)} tokens${breakdown}`)
  }
  if (typeof info.usage?.cost === 'number') {
    parts.push(`$${info.usage.cost.toFixed(4)}`)
  }
  el.textContent = parts.join(' · ')
  el.classList.remove('hidden')
}

// Append the "ORCID-verified" badge to the Name row when the logged-in researcher's
// iD matches the ORCID field. Cosmetic and session-only.
function maybeAddVerifiedBadge(root: HTMLElement): void {
  const nameEl = root.querySelector<HTMLElement>('#p-name')
  if (!nameEl) return
  nameEl.querySelector('.badge')?.remove()
  const session = getSession()
  if (!session) return
  const me = normaliseOrcid(session.orcid)
  if (!me) return
  const field = root.querySelector<HTMLInputElement>('#in-orcid')?.value ?? ''
  if (normaliseOrcid(field) !== me) return
  const badge = document.createElement('span')
  badge.className = 'badge'
  badge.textContent = `✓ ${copy.verifiedBadge}`
  badge.title = copy.verifiedTitle
  nameEl.appendChild(badge)
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

// Zero-cost demo: render the saved fake researcher fully client-side, and seed the
// retrieval bundle so a re-roast runs live on the demo profile.
function showDemo(root: HTMLElement, output: HTMLElement): void {
  roastAbort?.abort()
  roastAbort = null
  retrieved = {
    items: [{ kind: 'document', label: `${demoResearcher.name} — simulated demo`, ok: true }],
    docTexts: [demoResearcher.profile],
    blocks: [],
    stats: [demoResearcher.stats],
    charts: [demoResearcher.charts],
    mergedPapers: [],
  }
  dirty = false
  root.querySelector('#step-roast')?.classList.remove('hidden')
  const overview = root.querySelector<HTMLElement>('#overview')
  if (overview) {
    overview.classList.remove('hidden')
    overview.innerHTML =
      '<h3 class="overview__title">Sample data</h3><p class="overview__hint">A fully invented researcher — press Roast me to generate a live roast, or search for a real name above.</p>'
  }
  output.className = 'output'
  output.textContent = demoResearcher.roast
  renderResult(root, {
    name: demoResearcher.name,
    position: 'Self-described thought leader',
    currentAffiliations: [demoResearcher.affiliation],
    researchDomain: 'Disruptive paradigms',
    researchFocus: ['synergy', 'frameworks', 'stakeholder value'],
    grants: ['Exploratory Pilot Feasibility Study Grant (€4,000)', '73 ERC applications, 0 awarded'],
    awards: ['Best Paper Award (a workshop he co-organised)', 'LinkedIn Top Voice'],
    papers: [
      { title: 'A Preliminary Survey of Our Own Previous Work', year: 2022, citations: 41 },
      { title: 'Towards a Framework for Frameworks: A Meta-Framework Approach', year: 2021, citations: 2 },
      { title: 'Leveraging Synergies: A Holistic Paradigm', year: 2020, citations: 1 },
      { title: 'On the Disruptive Potential of Disruption', year: 2019, citations: 0 },
    ],
  })
  renderStatsCard(root, [demoResearcher.stats])
  const chartsCard = root.querySelector<HTMLElement>('#charts-card')
  if (chartsCard) renderCharts(chartsCard, [demoResearcher.charts])
  toggleNumbers(root, [demoResearcher.stats], [demoResearcher.charts])
  root.querySelector('#share')?.classList.remove('hidden')
  root.querySelector('#sec-personalia')?.scrollIntoView({ behavior: scrollBehaviour(), block: 'start' })
}

async function runRoast(
  root: HTMLElement,
  output: HTMLElement,
  button: HTMLButtonElement,
  regenerate = false,
): Promise<void> {
  if (!config.workerUrl) {
    placeholderOut(output, 'Roasting is not configured in this build yet (no Worker URL).')
    return
  }

  // Cancel any still-streaming previous roast, then own the in-flight slot.
  roastAbort?.abort()
  const controller = new AbortController()
  roastAbort = controller

  const started = performance.now()
  button.disabled = true
  root.querySelector('#share')?.classList.add('hidden')
  root.querySelector('#sec-personalia')?.classList.add('hidden')
  root.querySelector('#sec-papers')?.classList.add('hidden')
  root.querySelector('#sec-numbers')?.classList.add('hidden')
  root.querySelector('#runmeta')?.classList.add('hidden')
  root.querySelector('#reroast')?.classList.add('hidden')
  root.querySelector('#stats-card')?.setAttribute('hidden', '')
  root.querySelector('#charts-card')?.setAttribute('hidden', '')

  // Make sure we have a fresh retrieval (re-retrieving if the inputs changed).
  let data = retrieved
  if (!data || dirty) {
    statusOut(output, 'Retrieving sources…')
    data = await ensureRetrieved(root, sourcesRef)
  }
  const profile = data ? assembleProfile(data) : ''
  if (!profile) {
    placeholderOut(output, 'Search for a name above, or add a source, then Retrieve data.')
    button.disabled = false
    return
  }
  if (profile.length > config.maxInputChars) {
    placeholderOut(output, `That is longer than ${config.maxInputChars} characters. Trim it down.`)
    button.disabled = false
    return
  }
  statusOut(output, 'Roasting…')

  const mergedPapers = data?.mergedPapers ?? []
  const linkStats = data?.stats ?? []
  const linkCharts = data?.charts ?? []

  // Papers the user has de-selected (in the overview foldout or the post-roast
  // Papers list): sent as a trusted exclusion list so the model ignores them too.
  const exclude = mergedPapers
    .filter((p) => p.title && excludedPaperKeys.has(paperKey(p.title)))
    .map((p) => p.title as string)

  try {
    const response = await fetch(config.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        intensity: selectedIntensity(),
        format: selectedFormat(),
        regenerate,
        exclude,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errData = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      const plain = new Set(['too_large', 'bad_request', 'rate_limited'])
      placeholderOut(
        output,
        errData && errData.error && plain.has(errData.error) && errData.message
          ? errData.message
          : randomError(),
      )
      return
    }

    // Stream the SSE response. The model emits a JSON personalia block, then a
    // line `===ROAST===`, then the roast. Buffer until the marker arrives, parse
    // and render the structured sections, then stream the remainder as the roast.
    const body = response.body
    if (!body) {
      placeholderOut(output, randomError())
      return
    }
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let raw = ''
    let metaDone = false
    let roastStart = 0
    let usage: Usage | null = null
    // The model is fixed server-side (roast.md); the stream reports which one ran.
    let usedModel = ''

    // Parse the leading JSON personalia block as soon as it is complete, without
    // depending on the marker or clean formatting. An optional `===ROAST===` marker
    // (and surrounding whitespace) after the object is skipped.
    const tryMeta = (): void => {
      if (metaDone) return
      const firstBrace = raw.indexOf('{')
      // No JSON block coming (roast started as prose): give up once enough arrived.
      if (firstBrace === -1 || raw.slice(0, firstBrace).trim().length > 40) {
        if (raw.trim().length > 80) {
          metaDone = true
          roastStart = 0
          renderResult(root, null)
        }
        return
      }
      const res = extractLeadingJson(raw)
      if (!res) return // object not complete yet
      metaDone = true
      const after = raw.slice(res.end).match(/^\s*(?:===ROAST===)?\s*/)
      roastStart = res.end + (after ? after[0].length : 0)
      renderResult(root, res.obj as Personalia)
    }

    // Suppress per-token re-announcements to screen readers; the completed roast
    // is announced once when aria-busy clears (in the finally).
    output.setAttribute('aria-busy', 'true')
    try {
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
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>
              usage?: Usage
              model?: string
            }
            if (json.usage) usage = json.usage
            if (json.model) usedModel = json.model
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              raw += delta
              tryMeta()
              if (metaDone) streamOut(output, roastBody(raw, roastStart))
            }
          } catch {
            // Partial or non-JSON line; wait for more data.
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {})
    }

    if (!metaDone) {
      // Stream ended before the marker fired; try one last parse of a leading block.
      const res = extractLeadingJson(raw)
      if (res) {
        const after = raw.slice(res.end).match(/^\s*(?:===ROAST===)?\s*/)
        roastStart = res.end + (after ? after[0].length : 0)
        renderResult(root, res.obj as Personalia)
      } else {
        roastStart = 0
        renderResult(root, null)
      }
    }
    const roast = roastBody(raw, roastStart).trim()
    if (!roast) {
      placeholderOut(output, randomError())
    } else {
      output.className = 'output'
      output.textContent = roast
      renderRunMeta(root, {
        elapsedMs: performance.now() - started,
        inputChars: profile.length,
        model: usedModel,
        usage,
      })
      // Structured papers from all sources, merged and de-duplicated, take
      // precedence over the model's per-source extraction (reusing the list already
      // built for the model's authoritative publications block).
      if (mergedPapers.length) renderPapers(root, mergedPapers.slice(0, 300))
      renderStatsCard(root, linkStats)
      const chartsCard = root.querySelector<HTMLElement>('#charts-card')
      if (chartsCard) renderCharts(chartsCard, linkCharts)
      toggleNumbers(root, linkStats, linkCharts)
      root.querySelector('#share')?.classList.remove('hidden')
      // Post-roast options: adjust intensity & re-roast, and inspect papers.
      root.querySelector('#reroast')?.classList.remove('hidden')
      root
        .querySelector('#inspect-papers')
        ?.classList.toggle('hidden', root.querySelector('#sec-papers')?.classList.contains('hidden') ?? true)
    }
  } catch (err) {
    // An intentional cancel (new Search/Sample) must not flash an error over the
    // freshly-reset UI; only real failures show the in-character error.
    if ((err as { name?: string }).name !== 'AbortError') placeholderOut(output, randomError())
  } finally {
    button.disabled = false
    output.setAttribute('aria-busy', 'false')
    if (roastAbort === controller) roastAbort = null
  }
}

// The upload provenance set is owned by mountApp; runRoast needs it to re-retrieve.
// A module-level handle avoids threading it through every call.
let sourcesRef: Set<string> = new Set()

// --- data export ---

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

// Export the already-retrieved data as Markdown. Retrieve first if needed.
async function exportRetrievedData(exportBtn: HTMLButtonElement): Promise<void> {
  const data = retrieved
  if (!data) {
    const prev = exportBtn.textContent
    exportBtn.textContent = 'Retrieve data first'
    setTimeout(() => (exportBtn.textContent = prev), 1600)
    return
  }
  const original = exportBtn.textContent
  exportBtn.disabled = true
  exportBtn.textContent = 'Preparing…'
  try {
    const parts: string[] = [
      '# Retrieved data',
      '',
      '_The data the tool retrieved and feeds to the roast._',
      '',
      '## Uploaded documents',
      '',
    ]
    if (data.docTexts.length) {
      data.docTexts.forEach((t, i) => parts.push(`### Document ${i + 1}`, '', '```\n' + t + '\n```', ''))
    } else {
      parts.push('_None._', '')
    }

    const sourceItems = data.items.filter((it) => it.kind === 'source')
    if (!sourceItems.length) {
      parts.push('## Sources', '', '_No profile links or IDs entered._', '')
    } else {
      for (const it of sourceItems) {
        parts.push(`## ${it.label}`, '')
        if (it.skipped) {
          parts.push('_Already included via the ORCID record above — not fetched again._', '')
          continue
        }
        if (!it.ok || !it.text) {
          parts.push(`_Retrieval failed: ${it.reason ?? 'unknown error'}._`, '')
          continue
        }
        parts.push('### Retrieved text (fed to the roast)', '', '```\n' + it.text + '\n```', '')
        if (it.stats) {
          parts.push('### Stats', '', '| Metric | Value |', '|---|---|')
          for (const e of it.stats.entries) parts.push(`| ${e.label} | ${e.value} |`)
          parts.push('')
        }
        if (it.charts) parts.push('### Charts data', '', chartsToMarkdown(it.charts), '')
      }
    }

    if (data.mergedPapers.length) {
      parts.push('## Publications (de-duplicated across sources)', '')
      for (const p of data.mergedPapers) {
        const meta = [p.venue, p.year != null ? String(p.year) : null].filter(Boolean).join(', ')
        const cites = p.citations != null ? ` — ${p.citations} citations` : ''
        parts.push(`- "${p.title}"${meta ? ` (${meta})` : ''}${cites}`)
      }
      parts.push('')
    }
    downloadText(parts.join('\n'), 'retrieved-data.md')
  } finally {
    exportBtn.disabled = false
    exportBtn.textContent = original
  }
}
