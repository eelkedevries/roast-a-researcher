import { config, copy, intensityLevels, formats, defaultFormat } from './config'
import { extractText, ocrPdf, UnsupportedFileError, ScannedPdfError } from './extract'
import { demoResearcher } from './demo'
import { copyText, downloadText, downloadImage } from './share'
import {
  detectSource,
  retrieveSource,
  searchSource,
  type SourceKind,
  type SourceStats,
  type ChartData,
  type ApiPaper,
} from './sources'
import { renderCharts } from './charts'
import { getSession, normaliseOrcid } from './auth'

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

// The five numbered input rows. Rows 1–3 and 5 take a single identifier field
// with an "Add" button (`kind: 'source'`); the source is fixed for 1–3, while
// the Website row auto-detects. Row 4 is the upload/drop area (`kind: 'docs'`)
// with a "Browse" button. The number badge is each row's include indicator.
interface InputRow {
  n: number
  key: string
  label: string
  kind: 'source' | 'docs'
  source?: SourceKind
  ph?: string
}
const INPUT_ROWS: ReadonlyArray<InputRow> = [
  { n: 1, key: 'orcid', label: 'ORCID', kind: 'source', source: 'orcid', ph: '0000-0002-1825-0097 or profile URL' },
  { n: 2, key: 'openalex', label: 'OpenAlex', kind: 'source', source: 'openalex', ph: 'A5023888391 or author URL' },
  { n: 3, key: 'github', label: 'GitHub', kind: 'source', source: 'github', ph: 'username or profile URL' },
  { n: 4, key: 'docs', label: 'Documents', kind: 'docs' },
  { n: 5, key: 'website', label: 'Website', kind: 'source', source: 'website', ph: 'https://your-site.com or any profile URL' },
]
// The identifier rows (1–3, 5): a fixed-source field plus Add button, wired the
// same way. The Website row auto-detects its source on Add.
const SOURCE_ROWS: ReadonlyArray<InputRow & { source: SourceKind }> = INPUT_ROWS.filter(
  (r): r is InputRow & { source: SourceKind } => r.kind === 'source' && !!r.source,
)
// Every row's include-indicator key, in order (used to reset the badges).
const ROW_KEYS: readonly string[] = INPUT_ROWS.map((r) => r.key)

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
  // The number badge is the row's include indicator: it wraps a hidden checkbox
  // (`#check-<key>`, the state store every collect/reset/tick path already reads)
  // and fills gold when the source is included.
  const numBadge = (key: string, n: number, label: string): string =>
    `<label class="inopt__num"><input type="checkbox" id="check-${key}" class="inopt__checkbox" aria-label="Include ${label}" /><span class="inopt__num-mark" aria-hidden="true">${n}</span></label>`
  const rowMarkup = (r: InputRow): string => {
    const field =
      r.kind === 'docs'
        ? `<div class="inopt__drop" id="dropzone">
             <input id="file" type="file" multiple accept=".txt,.md,.pdf,.docx,.odt" hidden />
             <span class="inopt__drop-icon" aria-hidden="true">↑</span>
             <span class="inopt__drop-text">Drop a CV here — PDF · Word · ODT · txt</span>
           </div>`
        : `<input id="in-${r.key}" class="inopt__field" type="${r.source === 'website' ? 'url' : 'text'}" placeholder="${r.ph}" aria-label="${r.label} — ${r.ph}" />`
    const action =
      r.kind === 'docs'
        ? `<button id="choose" class="inopt__action" type="button">Browse</button>`
        : `<button id="add-${r.key}" class="inopt__action inopt__add" type="button" disabled>Add</button>`
    const tail = r.kind === 'docs' ? '<ul class="file-list" id="file-list"></ul>' : ''
    return `
      <li class="inopt" data-row="${r.key}">
        ${numBadge(r.key, r.n, r.label)}
        <span class="inopt__label" ${r.kind === 'docs' ? '' : `id="label-${r.key}"`}>${r.label}</span>
        ${field}
        ${action}
        ${tail}
      </li>`
  }
  const inputRows = INPUT_ROWS.map(rowMarkup).join('')
  root.innerHTML = `
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="masthead" style="--banner:url('${import.meta.env.BASE_URL}black_hole_eye_banner.jpg');--banner-portrait:url('${import.meta.env.BASE_URL}black_hole_eye_banner_portrait.jpg')">
      <div class="banner-img" role="img" aria-label="A blue human iris at the centre of a black-hole accretion disk"></div>
      <div class="banner-fade"></div>
      <div class="banner-inner">
        <a class="namelink" href="https://eelkedevries.com/" title="Home" aria-label="Home — Eelke de Vries">
          <span class="name">Eelke de Vries, PhD</span>
          <span class="role">Cognitive neuroscientist</span>
        </a>
        <div class="banner-social">
          <a href="https://eelkedevries.com/contact.html" title="Contact" aria-label="Contact"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m2 7 10 6 10-6"></path></svg></a>
          <a href="https://scholar.google.nl/citations?user=UGVOZHcAAAAJ" target="_blank" rel="noopener" title="Google Scholar" aria-label="Google Scholar"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"></path></svg></a>
          <a href="https://github.com/eelkedevries" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.83 1.24 1.83 1.24 1.07 1.83 2.8 1.3 3.49.99.1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5z"></path></svg></a>
          <a href="https://www.linkedin.com/in/eelkedevries" target="_blank" rel="noopener" title="LinkedIn" aria-label="LinkedIn"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z"></path></svg></a>
        </div>
      </div>
    </header>
    <div class="pipenav-wrap">
      <div class="nav-hairline"></div>
      <nav class="pipenav" aria-label="Primary">
        <a href="https://eelkedevries.com/about.html">About</a>
        <a href="https://eelkedevries.com/research.html">Research</a>
        <a href="https://eelkedevries.com/publications.html">Publications</a>
        <a href="https://eelkedevries.com/projects.html">Projects</a>
        <a href="https://eelkedevries.com/blog/">Observations</a>
        <a href="https://eelkedevries.com/contact.html">Contact</a>
      </nav>
    </div>
    <main class="wrap" id="main">
      <header>
        <h1>${copy.title}</h1>
      </header>

      <section class="form" aria-label="Roast input">
        <div class="step">
          <div class="step__head">
            <span class="step__num">01</span>
            <h2 class="step__title">Add your data</h2>
            <button class="step__sample" id="sample" type="button">See a sample roast</button>
          </div>
          <p class="step__subtitle">Search by name, or add sources directly</p>

          <div class="search-hero">
            <span class="search-hero__icon" aria-hidden="true">⌕</span>
            <input id="search-query" class="search-hero__input" type="text" placeholder="Search for a researcher by name" aria-label="Search for a researcher by name" />
            <button class="btn btn--primary search-hero__btn" id="search-btn" type="button">Search</button>
          </div>
          <p id="search-status" class="search-status" aria-live="polite"></p>

          <ol class="inputs" id="inputs" aria-label="Input options">
            ${inputRows}
          </ol>

          <div class="retrieve">
            <button class="btn btn--primary" id="retrieve-data" type="button">Retrieve data</button>
            <button class="step__utility" id="export-data" type="button" hidden>Download the retrieved data</button>
          </div>
        </div>

        <div class="step step--confirm hidden" id="step-confirm">
          <div class="step__head">
            <span class="step__num">02</span>
            <h2 class="step__title">Confirm your data</h2>
          </div>
          <div class="overview" id="overview" aria-live="polite"></div>
        </div>

        <div class="step step--roast hidden" id="step-roast">
          <div class="step__head">
            <span class="step__num">03</span>
            <h2 class="step__title">Roast your data</h2>
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
          <p class="papers-hint">Tick any that aren’t this researcher’s, then re-roast.</p>
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
          <a href="${copy.providerPolicyUrl}" target="_blank" rel="noopener">${copy.providerPolicyLabel}</a> before pasting anything sensitive.</p>
      </div>
    </footer>
  `

  const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel) as T
  const output = $<HTMLElement>('#output')
  const roastBtn = $<HTMLButtonElement>('#roast')
  const fileList = $<HTMLUListElement>('#file-list')
  const searchStatus = $<HTMLElement>('#search-status')

  // Provenance of the current input (uploaded filenames, retrieved sources).
  const sources = new Set<string>()
  sourcesRef = sources

  // Any change to a provided input invalidates the last retrieval, so the next
  // roast re-retrieves rather than roasting stale data.
  const markDirty = (): void => {
    dirty = true
  }

  // Each row's number badge is its include indicator (a hidden checkbox behind
  // the badge). Toggling it marks the retrieval stale.
  for (const key of ROW_KEYS) {
    const box = $<HTMLInputElement>(`#check-${key}`)
    box.addEventListener('change', () => {
      box.closest('.inopt')?.classList.toggle('inopt--off', !box.checked)
      markDirty()
    })
  }

  // Identifier rows (1–3, 5): a manually-entered value is confirmed with an "Add"
  // button that retrieves it and shows green "Added" / red "Failed"; only a
  // successful Add (or a search-match pick) ticks the source. Editing un-confirms
  // it. Rows 1–3 force their source; the Website row auto-detects it.
  for (const r of SOURCE_ROWS) {
    const field = $<HTMLInputElement>(`#in-${r.key}`)
    const addBtn = $<HTMLButtonElement>(`#add-${r.key}`)
    field.addEventListener('input', () => {
      setChecked(root, r.key, false)
      resetInoptAdd(root, r.key)
      markDirty()
    })
    addBtn.addEventListener('click', () => {
      const v = field.value.trim()
      if (!v) return
      // The Website row accepts any recognisable link/ID; the others are fixed.
      const detected = r.source === 'website' ? detectSource(v) : { source: r.source, id: v }
      if (!detected) {
        addBtn.className = 'inopt__action inopt__add is-bad'
        addBtn.textContent = 'Failed'
        addBtn.title = 'Not a recognisable link or ID.'
        return
      }
      void verifyAndAdd(addBtn, 'inopt__action inopt__add', detected.source, detected.id).then((ok) => {
        setChecked(root, r.key, ok)
        markDirty()
      })
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

  // Retrieve data (discrete step) — fetch everything, then show the overview.
  const retrieveBtn = $<HTMLButtonElement>('#retrieve-data')
  retrieveBtn.addEventListener('click', () => void runRetrieve(root, sources))

  // Export retrieved data.
  const exportBtn = $<HTMLButtonElement>('#export-data')
  exportBtn.addEventListener('click', () => void exportRetrievedData(exportBtn))

  // Search by name (primary). Re-searching resets the added inputs first.
  const searchQuery = $<HTMLInputElement>('#search-query')
  const resetInputs = (): void => {
    for (const r of SOURCE_ROWS) {
      $<HTMLInputElement>(`#in-${r.key}`).value = ''
      resetInoptAdd(root, r.key)
    }
    for (const key of ROW_KEYS) setChecked(root, key, false)
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
    const name = document.createElement('span')
    name.className = 'file-list__name'
    name.textContent = file.name
    const size = document.createElement('span')
    size.className = 'file-list__size'
    size.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB`
    // Status badge, mirroring the URL "Add" button: spinner → green "Added" / red
    // "Failed" (the detail — char count or error — is kept as its tooltip).
    const badge = document.createElement('span')
    badge.className = 'file-list__badge is-loading'
    badge.innerHTML = '<span class="spinner" aria-hidden="true"></span>'
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
    top.append(name, size, badge, remove)
    item.append(top)
    list.appendChild(item)

    const setBadge = (state: 'ok' | 'bad', label: string, title: string): void => {
      badge.className = `file-list__badge is-${state}`
      badge.textContent = label
      badge.title = title
    }

    try {
      const extracted = (await extractText(file)).trim()
      documentTexts.set(item, extracted)
      item.classList.add('is-ok')
      setBadge('ok', 'Added', `Extracted — ${extracted.length.toLocaleString('en-GB')} characters used in the roast`)
      sources.add(file.name)
      onChange()
    } catch (err) {
      item.classList.add('is-fail')
      setBadge('bad', 'Failed', err instanceof UnsupportedFileError ? err.message : 'Could not read that file.')

      if (err instanceof ScannedPdfError) {
        const reason = document.createElement('small')
        reason.className = 'file-list__reason'
        const ocr = document.createElement('button')
        ocr.type = 'button'
        ocr.className = 'chip file-list__ocr'
        ocr.textContent = 'Try OCR (scanned PDF)'
        ocr.addEventListener('click', () => {
          ocr.disabled = true
          badge.className = 'file-list__badge is-loading'
          badge.innerHTML = '<span class="spinner" aria-hidden="true"></span>'
          badge.title = ''
          reason.textContent = 'Loading OCR…'
          void ocrPdf(file, (msg) => {
            reason.textContent = msg
          })
            .then((text) => {
              const t = text.trim()
              documentTexts.set(item, t)
              item.classList.remove('is-fail')
              item.classList.add('is-ok')
              setBadge('ok', 'Added', `Extracted via OCR — ${t.length.toLocaleString('en-GB')} characters used`)
              reason.remove()
              ocr.remove()
              sources.add(file.name)
              onChange()
            })
            .catch((e: unknown) => {
              ocr.disabled = false
              setBadge('bad', 'Failed', e instanceof UnsupportedFileError ? e.message : 'OCR failed.')
              reason.textContent =
                e instanceof UnsupportedFileError ? e.message : 'OCR failed. Try another file.'
            })
        })
        item.append(reason, ocr)
      }
      onChange()
    }
  }
}

// Collect the in-memory text extracted from all currently-listed documents.
function collectDocumentTexts(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.file-list__item'))
    .map((el) => documentTexts.get(el))
    .filter((t): t is string => !!t && t.trim() !== '')
}

// --- Add-to-verify (identifier rows) ---

// Retrieve {source, id} now and turn a status button into a spinner → green "Added"
// / red "Failed" (the failure reason is kept as its tooltip). `base` is the button's
// own class, so this is shared by every identifier row's Add button.
async function verifyAndAdd(
  btn: HTMLButtonElement,
  base: string,
  source: SourceKind,
  id: string,
): Promise<boolean> {
  btn.className = `${base} is-loading`
  btn.setAttribute('aria-busy', 'true')
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>'
  const res = await retrieveSource(config.workerUrl, source, id)
  btn.removeAttribute('aria-busy')
  const ok = !!(res.ok && res.text)
  btn.className = `${base} ${ok ? 'is-ok' : 'is-bad'}`
  btn.textContent = ok ? 'Added' : 'Failed'
  btn.title = ok ? '' : res.reason ?? 'Could not retrieve this.'
  return ok
}

// Return an identifier row's Add button to its idle state (disabled while empty).
function resetInoptAdd(root: HTMLElement, key: string): void {
  const field = root.querySelector<HTMLInputElement>(`#in-${key}`)
  const addBtn = root.querySelector<HTMLButtonElement>(`#add-${key}`)
  if (!field || !addBtn) return
  addBtn.className = 'inopt__action inopt__add'
  addBtn.textContent = 'Add'
  addBtn.title = ''
  addBtn.disabled = !field.value.trim()
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

// Search ORCID, OpenAlex and GitHub by name and auto-fill each source's closest
// match straight into its field, ticking that row's include badge. Unmatched or
// unavailable sources are left blank for manual entry.
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

  const nq = normaliseName(query)
  const qTokens = nq ? nq.split(' ') : []
  let anyMatch = false
  let anyFailure = false

  for (const { source, result } of settled) {
    if (!result.ok) {
      anyFailure = true
      continue
    }
    const cands = result.candidates ?? []
    if (!cands.length) continue
    const best = cands
      .map((candidate) => ({ candidate, score: rankName(candidate.name, nq, qTokens) }))
      .sort((a, b) => a.score - b.score)[0].candidate
    const field = root.querySelector<HTMLInputElement>(`#in-${source}`)
    if (field) field.value = best.id
    resetInoptAdd(root, source)
    setChecked(root, source, true)
    anyMatch = true
  }
  onChange()

  status.textContent = anyMatch
    ? ''
    : anyFailure
      ? 'Search sources are unavailable right now — enter IDs or a URL manually below.'
      : 'No matches found — enter IDs or a URL manually below.'
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
  if (overview) overview.textContent = ''
  root.querySelector('#export-data')?.setAttribute('hidden', '')
  root.querySelector('#step-confirm')?.classList.add('hidden')
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
  for (const r of SOURCE_ROWS) {
    if (!root.querySelector<HTMLInputElement>(`#check-${r.key}`)?.checked) continue
    const v = root.querySelector<HTMLInputElement>(`#in-${r.key}`)?.value.trim()
    if (!v) continue
    // Rows 1–3 force their source; the Website row auto-detects (it may hold any
    // profile URL). A ticked Website row was only ticked after a successful Add,
    // so detection succeeds here.
    if (r.source === 'website') {
      const det = detectSource(v)
      if (det) out.push(det)
    } else {
      out.push({ source: r.source, id: v })
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
  root.querySelector('#step-confirm')?.classList.remove('hidden')
  if (overview) {
    overview.innerHTML = '<p class="overview__status"><span class="spinner" aria-hidden="true"></span> Retrieving your sources…</p>'
  }
  try {
    const data = await retrieveInputs(root, sources)
    if (!data) {
      retrieved = null
      dirty = true
      if (overview) {
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

// Compact, ISO-4-ish journal-word abbreviations for the papers foldout's second line.
const VENUE_ABBR: Record<string, string> = {
  journal: 'J.', international: 'Int.', national: 'Natl.',
  proceedings: 'Proc.', conference: 'Conf.', symposium: 'Symp.', workshop: 'Worksh.',
  transactions: 'Trans.', review: 'Rev.', reviews: 'Rev.', letters: 'Lett.',
  research: 'Res.', report: 'Rep.', reports: 'Rep.', bulletin: 'Bull.', annual: 'Annu.',
  science: 'Sci.', sciences: 'Sci.', scientific: 'Sci.', advances: 'Adv.', current: 'Curr.', frontiers: 'Front.',
  cognitive: 'Cogn.', cognition: 'Cogn.', neuroscience: 'Neurosci.', neurosciences: 'Neurosci.',
  psychology: 'Psychol.', psychological: 'Psychol.', perception: 'Percept.',
  communications: 'Commun.', communication: 'Commun.', vision: 'Vis.', visual: 'Vis.',
  experimental: 'Exp.', behavioural: 'Behav.', behavioral: 'Behav.', behaviour: 'Behav.', behavior: 'Behav.',
  computational: 'Comput.', computer: 'Comput.', computing: 'Comput.',
  systems: 'Syst.', system: 'Syst.', network: 'Netw.', networks: 'Netw.', networked: 'Netw.',
  services: 'Serv.', information: 'Inf.', archiving: 'Arch.',
  university: 'Univ.', association: 'Assoc.', society: 'Soc.', academy: 'Acad.',
  european: 'Eur.', american: 'Am.', british: 'Br.', royal: 'R.',
  medicine: 'Med.', medical: 'Med.', biology: 'Biol.', biological: 'Biol.',
  physics: 'Phys.', physical: 'Phys.', chemistry: 'Chem.', chemical: 'Chem.',
  engineering: 'Eng.', mathematics: 'Math.', mathematical: 'Math.', applied: 'Appl.',
}
const VENUE_DROP = new Set(['of', 'the', 'for', 'and', 'in', 'on', 'a', 'an', 'de', 'het', 'van', 'een'])

// Abbreviate a journal/venue name: prefer a trailing acronym in parentheses
// (e.g. "… (DANS)" → "DANS"), otherwise abbreviate common words and drop stop-words.
function abbreviateVenue(venue: string): string {
  const v = venue.trim()
  if (!v) return ''
  const paren = v.match(/\(([A-Za-z][A-Za-z0-9&.\-/]{1,14})\)\s*$/)
  if (paren && /[A-Z]{2,}/.test(paren[1])) return paren[1]
  const out = v
    .replace(/\([^)]*\)/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => {
      const key = w.toLowerCase().replace(/[^a-z]/g, '')
      if (!key || VENUE_DROP.has(key)) return ''
      return VENUE_ABBR[key] ?? w
    })
    .filter(Boolean)
  return out.join(' ') || v
}

// The second line for a paper entry: abbreviated venue · year · citations.
function paperMeta(p: Paper): string {
  const venue = p.venue ? abbreviateVenue(p.venue) : ''
  const year = p.year != null ? String(p.year) : ''
  const cites = p.citations != null ? `${p.citations} citation${p.citations === 1 ? '' : 's'}` : ''
  return [venue, year, cites].filter(Boolean).join(' · ')
}

// A fold-out headline count whose entries each carry a checkbox (ticked = kept in
// the roast). Deselecting an entry calls its onToggle and updates the live count.
function selectionFoldout(
  label: string,
  sub: string,
  entries: Array<{ primary: string; secondary?: string; initial: boolean; onToggle: (on: boolean) => void }>,
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
    const primary = document.createElement('span')
    primary.className = 'overview__entry-title'
    primary.textContent = e.primary
    span.appendChild(primary)
    if (e.secondary) {
      const meta = document.createElement('span')
      meta.className = 'overview__entry-meta'
      meta.textContent = e.secondary
      span.appendChild(meta)
    }
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

  const sourceItems = data.items.filter((it) => it.kind === 'source')
  const okSources = sourceItems.filter((it) => it.ok)
  const documents = data.items.filter((it) => it.kind === 'document')
  const repos = okSources
    .filter((it) => it.source === 'github' && it.text)
    .flatMap((it) => parseRepos(it.text as string))
  const links = okSources.filter((it) => it.source === 'website').length

  // Papers foldout — listed chronologically by year (oldest first); deselect to drop
  // a paper from the roast.
  if (data.mergedPapers.length) {
    const papersByYear = [...data.mergedPapers].sort(
      (a, b) => (a.year ?? Infinity) - (b.year ?? Infinity),
    )
    overview.appendChild(
      selectionFoldout(
        'papers',
        'via ORCID · OpenAlex',
        papersByYear.map((p) => ({
          primary: p.title ?? '(untitled)',
          secondary: paperMeta(p),
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

  // Repositories foldout — repository names only (no language); deselect to drop one.
  if (repos.length) {
    overview.appendChild(
      selectionFoldout(
        'repositories',
        'via GitHub',
        repos.map((r) => ({
          primary: r.name,
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

  // Surface only failures (retrieval errors); successful sources are already
  // represented by the counts above, so their rows are omitted to reduce clutter.
  const failed = sourceItems.filter((it) => !it.ok && !it.skipped)
  if (failed.length) {
    const note = document.createElement('p')
    note.className = 'overview__fail'
    note.textContent =
      'Could not retrieve: ' +
      failed.map((it) => `${it.label} (${it.reason ?? 'failed'})`).join('; ')
    overview.appendChild(note)
  } else if (!okSources.length && !documents.length) {
    const note = document.createElement('p')
    note.className = 'overview__fail'
    note.textContent = 'No sources came back — check the fields above and retrieve again.'
    overview.appendChild(note)
  }
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

// Sort text entries chronologically by the (last) year each contains; entries with
// no year keep to the end. Oldest first.
function sortByYear(entries: string[]): string[] {
  const yearOf = (s: string): number | null => {
    const years = s.match(/\b(?:19|20)\d{2}\b/g)
    return years ? Number(years[years.length - 1]) : null
  }
  return [...entries].sort((a, b) => {
    const ya = yearOf(a)
    const yb = yearOf(b)
    if (ya == null && yb == null) return 0
    if (ya == null) return 1
    if (yb == null) return -1
    return ya - yb
  })
}

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
  addRow('Education', sortByYear(asStrList(data?.education)).join('; '))

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
  root.querySelector('#step-confirm')?.classList.remove('hidden')
  root.querySelector('#step-roast')?.classList.remove('hidden')
  const overview = root.querySelector<HTMLElement>('#overview')
  if (overview) {
    overview.innerHTML =
      '<p class="overview__status">Sample data — a fully invented researcher. Press Roast me for a live roast, or search for a real name above.</p>'
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
