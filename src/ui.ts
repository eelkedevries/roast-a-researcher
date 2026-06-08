import { config, copy, intensityLevels } from './config'
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
const SEARCH_SOURCES: readonly SourceKind[] = [
  'github',
  'orcid',
  'openalex',
  'semanticscholar',
  'dblp',
]
const UNSUPPORTED_LINK =
  'That does not look like a web address. Enter a full link (https://…) or paste the text instead.'

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
      return /^https?:\/\//i.test(id) ? id : `https://${id}`
  }
}

// Builds the "Focused Console" shell and wires it to the real Worker pipeline.
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
  root.innerHTML = `
    <main class="wrap">
      <header>
        <p class="kicker">Roast · a · Researcher</p>
        <h1>${copy.title}</h1>
        <div class="auth" id="auth-control"></div>
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
            <summary class="manual__summary"><span class="manual__chevron" aria-hidden="true">›</span> Or add a personal website, links, or upload documents</summary>
            <div class="manual__body">
              <div class="manual__group">
                <span class="micro-label">Personal website <span class="micro-label__sub">the whole site is scraped — CV, media, publications…</span></span>
                <div id="websites"></div>
                <button class="chip" id="add-website" type="button"><span class="chip__icon" aria-hidden="true">+</span> Add website</button>
              </div>
              <div class="manual__group">
                <span class="micro-label">Profile links <span class="micro-label__sub">ORCID · OpenAlex · GitHub · Semantic Scholar · DBLP</span></span>
                <div id="links"></div>
                <button class="chip" id="add-link" type="button"><span class="chip__icon" aria-hidden="true">+</span> Add link</button>
              </div>
              <div class="manual__group">
                <span class="micro-label">Paste text or upload documents <span class="micro-label__sub">PDF · Word · ODT · txt · md</span></span>
                <div class="field" id="dropzone">
                  <textarea id="profile" class="field__text" placeholder="${copy.inputPlaceholder}"></textarea>
                  <input id="file" type="file" multiple accept=".txt,.md,.pdf,.docx,.odt" hidden />
                  <div class="field__bar">
                    <div class="field__actions">
                      <button class="chip" id="choose" type="button"><span class="chip__icon" aria-hidden="true">↑</span> Upload documents</button>
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
              ${segGroup('intensity-in')}
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
          <h2 class="rsec__h">Profile</h2>
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
          <p class="papers-hint">Tick any that aren't this researcher's (data sources sometimes mis-attribute), then re-roast.</p>
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

  // Straight after a fresh ORCID login, load the verified researcher's own
  // profile — as if they had searched for and picked themselves — so their data
  // is fed in immediately and a roast shows the verified badge.
  if (justLoggedIn) {
    const session = getSession()
    if (session) loadVerifiedProfile(root, session, linksContainer)
  }

  const setCounter = (): void => {
    const n = textarea.value.length
    counter.textContent = `${n} / ${config.maxInputChars}`
    counter.classList.toggle('warn', n > config.maxInputChars)
  }
  textarea.addEventListener('input', setCounter)

  triggerRoast = () => void runRoast(textarea, root, output, roastBtn, sources, manual)
  roastBtn.addEventListener('click', () => triggerRoast?.())
  // Re-roast from the Papers section after marking mis-attributed papers.
  $<HTMLButtonElement>('#papers-reroast').addEventListener('click', () => triggerRoast?.())

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
  $<HTMLButtonElement>('#reroast-btn').addEventListener('click', () => triggerRoast?.())
  $<HTMLButtonElement>('#inspect-papers').addEventListener('click', () => {
    root.querySelector('#sec-papers')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    if (files.length) void processFiles(files, setCounter, fileList, sources)
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
    if (files.length) void processFiles(files, setCounter, fileList, sources)
  })

  // Personal website(s) — always fully crawled.
  const websitesContainer = $<HTMLElement>('#websites')
  addWebsiteRow(websitesContainer)
  $<HTMLButtonElement>('#add-website').addEventListener('click', () => addWebsiteRow(websitesContainer))

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
    websitesContainer.textContent = ''
    addWebsiteRow(websitesContainer)
    textarea.value = ''
    setCounter()
    fileList.textContent = ''
    manual.open = false
    statsCard.setAttribute('hidden', '')
    chartsCard.setAttribute('hidden', '')
    sources.clear()
    excludedPaperKeys.clear()
    lastRenderedPapers = []
    root.querySelector('#reroast')?.classList.add('hidden')
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

// Text extracted from each uploaded document, kept in memory (keyed by its
// file-list element) rather than dumped into the paste box. Collected into the
// roast input at roast time; entries vanish when the file row is removed.
const documentTexts = new WeakMap<HTMLElement, string>()

async function processFiles(
  files: File[],
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
      const extracted = (await extractText(file)).trim()
      documentTexts.set(item, extracted)
      status.textContent = '✓'
      item.classList.add('is-ok')
      reason.hidden = false
      reason.textContent = `Extracted — ${extracted.length.toLocaleString('en-GB')} characters used in the roast`
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
              const t = text.trim()
              documentTexts.set(item, t)
              status.textContent = '✓'
              item.classList.remove('is-fail')
              item.classList.add('is-ok')
              reason.textContent = `Extracted via OCR — ${t.length.toLocaleString('en-GB')} characters used`
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

// Collect the in-memory text extracted from all currently-listed documents.
function collectDocumentTexts(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.file-list__item'))
    .map((el) => documentTexts.get(el))
    .filter((t): t is string => !!t && t.trim() !== '')
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
    '<input class="input link-row__input" type="url" placeholder="ORCID iD, a profile link, or any website URL" />' +
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

// A dedicated "Personal website" row: any value is treated as a website URL and
// the whole site is crawled (forced `website` source), with the same status UI.
function addWebsiteRow(container: HTMLElement, value = ''): HTMLElement {
  const row = document.createElement('div')
  row.className = 'link-row'
  row.dataset.website = '1'
  row.innerHTML =
    '<div class="link-row__top">' +
    '<input class="input link-row__input" type="url" placeholder="https://your-personal-site.com (whole site is scraped)" />' +
    '<button class="link-row__remove" type="button" aria-label="Remove website">×</button></div>' +
    '<div class="link-row__meta" hidden>' +
    '<span class="link-row__tag"></span>' +
    '<a class="link-row__inspect" target="_blank" rel="noopener">Open <span aria-hidden="true">↗</span></a>' +
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

// Resolve a row's input to a source: website rows force the `website` (full-crawl)
// source; ordinary link rows auto-detect.
function rowSource(row: HTMLElement, value: string): { source: SourceKind; id: string } | null {
  if (row.dataset.website === '1') return value ? { source: 'website', id: value } : null
  return detectSource(value)
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
  const det = rowSource(row, v)
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

// On a fresh ORCID login, surface the verified researcher's own profile as a
// pre-ticked result, reusing the search-pick flow: ticking adds the link row and
// retrieves it, so the data is fed in and a roast shows the verified badge.
function loadVerifiedProfile(
  root: HTMLElement,
  session: { orcid: string; name: string | null },
  linksContainer: HTMLElement,
): void {
  const results = root.querySelector<HTMLElement>('#search-results')
  if (!results) return
  const candidate: Candidate = {
    id: session.orcid,
    name: session.name ?? session.orcid,
    affiliation: null,
  }
  const note = document.createElement('p')
  note.className = 'search__note'
  note.textContent = 'Loaded from your verified ORCID — press Roast me.'
  const row = searchResultRow('orcid', candidate, linksContainer)
  results.replaceChildren(note, row)
  const checkbox = row.querySelector<HTMLInputElement>('.search__check')
  if (checkbox) {
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
  }
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

// The OpenAlex author id a link row points at (for skipping a redundant fetch).
function openalexIdOf(detected: { source: SourceKind; id: string }): string | null {
  if (detected.source !== 'openalex') return null
  return detected.id.match(/A\d+/i)?.[0]?.toUpperCase() ?? null
}

// Retrieve every link row, updating its inline status. Non-OpenAlex sources are
// fetched first (ORCID auto-embeds OpenAlex); a standalone OpenAlex is then fetched
// only if that author wasn't already covered — so the same record is never fetched
// twice. Returns the de-duplicated text/stats/charts for the roast.
async function validateLinks(
  root: HTMLElement,
  sources: Set<string>,
): Promise<{ texts: string[]; stats: SourceStats[]; charts: ChartData[]; papers: ApiPaper[] }> {
  type Entry = { retrieve: HTMLElement; detected: { source: SourceKind; id: string } }
  const entries: Entry[] = []
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
    const detected = rowSource(row, value)
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
    row.dataset.retrieved = value
    entries.push({ retrieve, detected })
  }

  // OpenAlex rows last, so an ORCID's embedded OpenAlex can cover them.
  entries.sort(
    (a, b) =>
      (a.detected.source === 'openalex' ? 1 : 0) - (b.detected.source === 'openalex' ? 1 : 0),
  )

  const collected: Array<{ text: string; stats?: SourceStats; charts?: ChartData; papers?: ApiPaper[] }> = []
  const coveredOpenAlex = new Set<string>()
  for (const { retrieve, detected } of entries) {
    const aId = openalexIdOf(detected)
    if (aId && coveredOpenAlex.has(aId)) {
      retrieve.className = 'link-row__retrieve is-ok'
      retrieve.innerHTML = '<span class="search__mark" aria-hidden="true">✓</span> Retrieved'
      retrieve.title = 'Already included via the ORCID record'
      sources.add(SOURCE_LABELS[detected.source])
      continue
    }
    retrieve.className = 'link-row__retrieve is-loading'
    retrieve.innerHTML = '<span class="spinner" aria-hidden="true"></span> Retrieving…'
    const res = await retrieveSource(config.workerUrl, detected.source, detected.id)
    if (res.ok && res.text) {
      retrieve.className = 'link-row__retrieve is-ok'
      retrieve.innerHTML = '<span class="search__mark" aria-hidden="true">✓</span> Retrieved'
      retrieve.title = ''
      collected.push({ text: res.text, stats: res.stats, charts: res.charts, papers: res.papers })
      sources.add(SOURCE_LABELS[detected.source])
      const k = openalexKeyOf(res.text)
      if (k) coveredOpenAlex.add(k)
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
  const papers = kept.flatMap((k) => k.papers ?? [])
  return { texts, stats, charts, papers }
}

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

// Current roast intensity (1–10 scaler), shared by the input and post-roast
// sliders; read at roast time.
let currentIntensity = config.defaultIntensity
function selectedIntensity(): number {
  return currentIntensity
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
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>('.link-row__input'))) {
    const detected = detectSource(input.value.trim())
    if (!detected) continue
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
let lastRenderedPapers: Paper[] = []
const paperKey = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
// Re-runs the current roast (set by mountApp); used by the Papers re-roast button.
let triggerRoast: (() => void) | null = null

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
  lastRenderedPapers = papers
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
// iD matches an ORCID iD among the selected link rows. Cosmetic and session-only.
function maybeAddVerifiedBadge(root: HTMLElement): void {
  const nameEl = root.querySelector<HTMLElement>('#p-name')
  if (!nameEl) return
  nameEl.querySelector('.badge')?.remove()
  const session = getSession()
  if (!session) return
  const me = normaliseOrcid(session.orcid)
  if (!me) return
  const selected = Array.from(root.querySelectorAll<HTMLInputElement>('.link-row__input'))
    .map((i) => detectSource(i.value))
    .filter((d): d is { source: SourceKind; id: string } => d?.source === 'orcid')
    .map((d) => normaliseOrcid(d.id))
  if (!selected.includes(me)) return
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

// Zero-cost demo: render the saved fake researcher fully client-side.
function showDemo(root: HTMLElement, textarea: HTMLTextAreaElement, output: HTMLElement): void {
  textarea.value = demoResearcher.profile
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
  root.querySelector('#sec-personalia')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  const started = performance.now()
  button.disabled = true
  collapseSearchToSelected(root)
  root.querySelector('#share')?.classList.add('hidden')
  root.querySelector('#sec-personalia')?.classList.add('hidden')
  root.querySelector('#sec-papers')?.classList.add('hidden')
  root.querySelector('#sec-numbers')?.classList.add('hidden')
  root.querySelector('#runmeta')?.classList.add('hidden')
  root.querySelector('#reroast')?.classList.add('hidden')
  root.querySelector('#stats-card')?.setAttribute('hidden', '')
  root.querySelector('#charts-card')?.setAttribute('hidden', '')
  statusOut(output, 'Checking links…')

  const {
    texts: linkTexts,
    stats: linkStats,
    charts: linkCharts,
    papers: linkPapers,
  } = await validateLinks(root, sources)
  const docTexts = collectDocumentTexts(root)
  // One authoritative, de-duplicated publications list, appended to the profile so
  // the model never sees the same work twice with conflicting citation counts.
  const mergedPapers = mergePapers(linkPapers)
  const profile = [textarea.value.trim(), ...docTexts, ...linkTexts, publicationsBlock(mergedPapers)]
    .filter(Boolean)
    .join('\n\n')
    .trim()
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

  // Papers the user has marked as not theirs (from a previous render): sent as a
  // trusted exclusion list so the model ignores mis-attributed works.
  const exclude = lastRenderedPapers
    .filter((p) => p.title && excludedPaperKeys.has(paperKey(p.title)))
    .map((p) => p.title as string)

  try {
    const response = await fetch(config.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile,
        intensity: selectedIntensity(),
        exclude,
      }),
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      const plain = new Set(['too_large', 'bad_request', 'rate_limited'])
      placeholderOut(
        output,
        data && data.error && plain.has(data.error) && data.message ? data.message : randomError(),
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
            if (metaDone) streamOut(output, raw.slice(roastStart).replace(/^\s+/, ''))
          }
        } catch {
          // Partial or non-JSON line; wait for more data.
        }
      }
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
    const roast = raw.slice(roastStart).replace(/^\s+/, '').trim()
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
        skipped: boolean
      }
      const rows: Row[] = inputs.map((value) => ({
        value,
        detected: detectSource(value),
        result: null,
        skipped: false,
      }))
      // Fetch non-OpenAlex first; fetch a standalone OpenAlex only if not already
      // covered by an ORCID's embedded record — so it isn't retrieved twice.
      const order = rows
        .map((_, i) => i)
        .sort(
          (a, b) =>
            (rows[a].detected?.source === 'openalex' ? 1 : 0) -
            (rows[b].detected?.source === 'openalex' ? 1 : 0),
        )
      const covered = new Set<string>()
      for (const i of order) {
        const r = rows[i]
        if (!r.detected) continue
        const aId = openalexIdOf(r.detected)
        if (aId && covered.has(aId)) {
          r.skipped = true
          continue
        }
        r.result = await retrieveSource(config.workerUrl, r.detected.source, r.detected.id, true)
        if (r.result.ok && r.result.text) {
          const k = openalexKeyOf(r.result.text)
          if (k) covered.add(k)
        }
      }
      for (const r of rows) {
        if (!r.detected) {
          parts.push(`## ${r.value}`, '', '_Not a supported link._', '')
          continue
        }
        parts.push(`## ${r.detected.source} — ${r.detected.id}`, '')
        if (r.skipped) {
          parts.push('_Already included via the ORCID record above — not fetched again._', '')
          continue
        }
        const result = r.result
        if (!result || !result.ok || !result.text) {
          parts.push(`_Retrieval failed: ${result?.reason ?? 'unknown error'}._`, '')
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
