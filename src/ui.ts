import { config, copy, intensityLevels, type Intensity } from './config'
import { extractText, UnsupportedFileError } from './extract'
import { copyText, downloadText, downloadImage } from './share'
import {
  detectSource,
  retrieveSource,
  searchSource,
  type SourceKind,
  type Candidate,
  type SourceStats,
  type ChartData,
} from './sources'
import { renderCharts } from './charts'

// Builds the static shell and wires the roast request to the Worker (streamed,
// with a typing effect), multi-file upload, and sharing.
export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="app">
      <header class="app__header">
        <h1 class="app__title">${copy.title}</h1>
        <p class="app__tagline">${copy.tagline}</p>
        <p class="app__framing">${copy.framing}</p>
      </header>

      <section class="panel" aria-label="Profile input">
        <label class="field__label" for="profile">${copy.inputLabel}</label>
        <textarea id="profile" class="field__input" rows="10"
          placeholder="${copy.inputPlaceholder}"></textarea>
        <p class="field__counter"><span id="char-count">0</span> / ${config.maxInputChars}</p>

        <div id="dropzone" class="dropzone">
          <input id="file" class="dropzone__input" type="file" multiple accept=".txt,.md,.pdf,.docx,.odt" />
          <button id="choose" class="button button--small" type="button">Choose files</button>
          <span class="dropzone__hint">or drag &amp; drop — .txt, .md, .pdf, .docx, .odt</span>
        </div>
        <ul id="file-list" class="file-list"></ul>

        <div class="links">
          <span class="field__label">Profile links (ORCID, OpenAlex, GitHub)</span>
          <div id="links"></div>
          <button id="add-link" class="button button--small" type="button">+ Add link</button>
        </div>

        <div class="search">
          <span class="field__label">Or search by name</span>
          <div class="search__row">
            <input id="search-query" class="field__input search__query" type="text"
              placeholder="Researcher name" />
            <button id="search-btn" class="button button--small search__btn" type="button">Search</button>
          </div>
          <p class="field__hint">Searches GitHub, ORCID and OpenAlex. Google Scholar and LinkedIn have no open search — paste or upload those.</p>
          <div id="search-results" class="search__results"></div>
        </div>

        <div class="intensity" role="radiogroup" aria-label="${copy.intensityLabel}">
          <span class="field__label">${copy.intensityLabel}</span>
          <div class="segmented">
            ${intensityLevels
              .map(
                (level) => `
            <label class="segmented__option">
              <input type="radio" name="intensity" value="${level}"
                ${level === config.defaultIntensity ? 'checked' : ''} />
              <span>${level}</span>
            </label>`,
              )
              .join('')}
          </div>
          <p class="field__hint">${copy.intensityHint}</p>
        </div>

        <button id="roast" class="button" type="button">${copy.roastButton}</button>
      </section>

      <section class="panel" aria-label="Roast output">
        <dl id="personalia" class="personalia" hidden>
          <div><dt>Name</dt><dd id="pers-name">—</dd></div>
          <div><dt>Affiliation</dt><dd id="pers-affil">—</dd></div>
          <div><dt>Sources</dt><dd id="pers-sources">—</dd></div>
        </dl>
        <div id="roast-output" class="output" aria-live="polite">
          <p class="output__placeholder">${copy.outputPlaceholder}</p>
        </div>
        <div id="stats-card" class="stats-card" hidden></div>
        <div id="charts-card" class="charts-card" hidden></div>
        <div id="share" class="share" hidden>
          <button id="share-copy" class="button button--small" type="button">Copy</button>
          <button id="share-text" class="button button--small" type="button">Download .txt</button>
          <button id="share-image" class="button button--small" type="button">Download image</button>
        </div>
      </section>

      <footer class="app__footer">
        <p class="privacy">${copy.privacyNotice}
          <a class="privacy__link" href="${copy.providerPolicyUrl}" target="_blank" rel="noopener">${copy.providerPolicyLabel}</a>.</p>
      </footer>
    </main>
  `

  const textarea = root.querySelector<HTMLTextAreaElement>('#profile')
  const counter = root.querySelector<HTMLSpanElement>('#char-count')
  const button = root.querySelector<HTMLButtonElement>('#roast')
  const output = root.querySelector<HTMLDivElement>('#roast-output')

  // Provenance of the current input: uploaded filenames (and, later, retrieved
  // sources). Shown in the personalia box.
  const sources = new Set<string>()

  // Live character count against the client-side input cap.
  if (textarea && counter) {
    textarea.addEventListener('input', () => {
      counter.textContent = String(textarea.value.length)
    })
  }

  if (textarea && button && output) {
    button.addEventListener('click', () => {
      void runRoast(textarea, root, output, button, sources)
    })
  }

  // File upload: a "Choose files" button + drag-and-drop dropzone. Files are
  // processed on select/drop and listed as chips with a tick or a cross + reason.
  const fileInput = root.querySelector<HTMLInputElement>('#file')
  const chooseBtn = root.querySelector<HTMLButtonElement>('#choose')
  const dropzone = root.querySelector<HTMLElement>('#dropzone')
  const fileList = root.querySelector<HTMLUListElement>('#file-list')
  if (fileInput && chooseBtn && dropzone && fileList && textarea && counter) {
    chooseBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files ?? [])
      if (files.length) void processFiles(files, textarea, counter, fileList, sources)
      fileInput.value = ''
    })
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault()
      dropzone.classList.add('dropzone--over')
    })
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dropzone--over')
    })
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault()
      dropzone.classList.remove('dropzone--over')
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) void processFiles(files, textarea, counter, fileList, sources)
    })
  }

  // Profile links: a row per identifier/URL, with a "+ Add link" control.
  const linksContainer = root.querySelector<HTMLElement>('#links')
  const addLinkBtn = root.querySelector<HTMLButtonElement>('#add-link')
  if (linksContainer && addLinkBtn) {
    addLinkRow(linksContainer)
    addLinkBtn.addEventListener('click', () => addLinkRow(linksContainer))
  }

  // Search by name across all supported sources at once, list the merged
  // candidates, and on selection add a pre-filled link row whose id is then
  // validated/retrieved on Roast as usual.
  const searchQuery = root.querySelector<HTMLInputElement>('#search-query')
  const searchBtn = root.querySelector<HTMLButtonElement>('#search-btn')
  const searchResults = root.querySelector<HTMLElement>('#search-results')
  if (searchQuery && searchBtn && searchResults && linksContainer) {
    const runSearch = (): void => {
      void doSearch(searchQuery.value, searchResults, linksContainer)
    }
    searchBtn.addEventListener('click', runSearch)
    searchQuery.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        runSearch()
      }
    })
  }

  // Share / export controls (revealed once a roast exists).
  const copyBtn = root.querySelector<HTMLButtonElement>('#share-copy')
  const textBtn = root.querySelector<HTMLButtonElement>('#share-text')
  const imageBtn = root.querySelector<HTMLButtonElement>('#share-image')
  if (output && copyBtn && textBtn && imageBtn) {
    copyBtn.addEventListener('click', () => {
      copyText(output.textContent ?? '').catch(() => {})
    })
    textBtn.addEventListener('click', () => {
      const text = output.textContent ?? ''
      if (text) downloadText(text, 'roast.txt')
    })
    imageBtn.addEventListener('click', () => {
      const text = output.textContent ?? ''
      if (text) downloadImage(text, copy.title, 'roast.png').catch(() => {})
    })
  }
}

// Extract each file client-side, listing it with a tick or a cross + reason, and
// merge the successful files' text into the editable input.
async function processFiles(
  files: File[],
  textarea: HTMLTextAreaElement,
  counter: HTMLElement,
  list: HTMLElement,
  sources: Set<string>,
): Promise<void> {
  for (const file of files) {
    const item = document.createElement('li')
    item.className = 'file-list__item'

    const status = document.createElement('span')
    status.className = 'file-list__status'
    status.textContent = '…'
    const name = document.createElement('span')
    name.className = 'file-list__name'
    name.textContent = file.name
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'file-list__remove'
    remove.setAttribute('aria-label', `Remove ${file.name}`)
    remove.textContent = '×'
    remove.addEventListener('click', () => {
      item.remove()
      sources.delete(file.name)
    })
    item.append(status, name, remove)
    list.appendChild(item)

    try {
      appendToInput(textarea, await extractText(file))
      status.textContent = '✓'
      item.classList.add('file-list__item--ok')
      sources.add(file.name)
    } catch (err) {
      status.textContent = '✗'
      item.classList.add('file-list__item--fail')
      const reason = document.createElement('small')
      reason.className = 'file-list__reason'
      reason.textContent =
        err instanceof UnsupportedFileError
          ? err.message
          : 'Could not read that file.'
      item.appendChild(reason)
    }
    counter.textContent = String(textarea.value.length)
  }
}

function appendToInput(textarea: HTMLTextAreaElement, text: string): void {
  const trimmed = text.trim()
  if (!trimmed) return
  const existing = textarea.value.trim()
  textarea.value = existing ? `${existing}\n\n${trimmed}` : trimmed
}

function addLinkRow(container: HTMLElement, value = ''): void {
  const row = document.createElement('div')
  row.className = 'link-row'

  const input = document.createElement('input')
  input.type = 'url'
  input.className = 'field__input link-row__input'
  input.placeholder = 'ORCID iD, or an orcid.org / openalex.org / github.com link'
  input.value = value

  const status = document.createElement('span')
  status.className = 'link-row__status'

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'link-row__remove'
  remove.setAttribute('aria-label', 'Remove link')
  remove.textContent = '×'
  remove.addEventListener('click', () => row.remove())

  const reason = document.createElement('small')
  reason.className = 'link-row__reason'

  const top = document.createElement('div')
  top.className = 'link-row__top'
  top.append(input, status, remove)
  row.append(top, reason)
  container.appendChild(row)
}

const SEARCH_SOURCES: readonly SourceKind[] = ['github', 'orcid', 'openalex']
const SOURCE_LABELS: Record<SourceKind, string> = {
  github: 'GitHub',
  orcid: 'ORCID',
  openalex: 'OpenAlex',
}

// Search every supported source by name at once and render the merged candidate
// list, each tagged with its source. Selecting a candidate adds a pre-filled link
// row (its concrete id), which is validated on Roast.
async function doSearch(
  query: string,
  results: HTMLElement,
  linksContainer: HTMLElement,
): Promise<void> {
  results.textContent = ''
  if (!query.trim()) return

  const pending = document.createElement('li')
  pending.className = 'search__status'
  pending.textContent = 'Searching…'
  results.appendChild(pending)

  const settled = await Promise.all(
    SEARCH_SOURCES.map(async (source) => ({
      source,
      result: await searchSource(config.workerUrl, source, query),
    })),
  )
  results.textContent = ''

  // Collect candidates, and a per-source note when a source errored or returned
  // nothing — so a failing source (e.g. OpenAlex) is visible, not silently dropped.
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

  // Each candidate is a checkbox row; the platform is tagged behind the name.
  // "Add selected" appends a link row for every ticked candidate, then clears
  // the result list.
  if (found.length) {
    const checks: Array<{ checkbox: HTMLInputElement; candidate: Candidate }> = []
    for (const { source, candidate } of found) {
      const row = document.createElement('label')
      row.className = 'search__result'

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'search__check'

      const name = document.createElement('span')
      name.className = 'search__name'
      const affil = candidate.affiliation ? ` — ${candidate.affiliation}` : ''
      name.textContent = `${candidate.name}${affil}`

      const tag = document.createElement('span')
      tag.className = 'search__tag'
      tag.textContent = SOURCE_LABELS[source]

      row.append(checkbox, name, tag)
      results.appendChild(row)
      checks.push({ checkbox, candidate })
    }

    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'button button--small search__add'
    add.textContent = 'Add selected'
    add.addEventListener('click', () => {
      const chosen = checks.filter(({ checkbox }) => checkbox.checked)
      if (!chosen.length) return
      for (const { candidate } of chosen) addLinkRow(linksContainer, candidate.id)
      results.textContent = ''
    })
    results.appendChild(add)
  } else if (!notes.length) {
    const empty = document.createElement('p')
    empty.className = 'search__status'
    empty.textContent = 'No matches found.'
    results.appendChild(empty)
  }

  // Per-source status notes (errors / no matches), always shown for diagnosis.
  for (const note of notes) {
    const line = document.createElement('p')
    line.className = 'search__status'
    line.textContent = note
    results.appendChild(line)
  }
}

// Validate each non-empty link row by retrieving it via the Worker, marking the
// row with a tick or a cross + reason. Returns the retrieved texts and any
// structured stats the sources provided (for the stats card).
async function validateLinks(
  root: HTMLElement,
  sources: Set<string>,
): Promise<{ texts: string[]; stats: SourceStats[]; charts: ChartData[] }> {
  const texts: string[] = []
  const stats: SourceStats[] = []
  const charts: ChartData[] = []
  for (const row of Array.from(root.querySelectorAll<HTMLElement>('.link-row'))) {
    const input = row.querySelector<HTMLInputElement>('.link-row__input')
    const status = row.querySelector<HTMLElement>('.link-row__status')
    const reason = row.querySelector<HTMLElement>('.link-row__reason')
    if (!input || !status || !reason) continue

    status.textContent = ''
    reason.textContent = ''
    row.classList.remove('link-row--ok', 'link-row--fail')
    const value = input.value.trim()
    if (!value) continue

    const detected = detectSource(value)
    if (!detected) {
      status.textContent = '✗'
      row.classList.add('link-row--fail')
      reason.textContent =
        'Not a supported link (ORCID, OpenAlex, or GitHub). Paste the text instead.'
      continue
    }

    status.textContent = '…'
    const result = await retrieveSource(config.workerUrl, detected.source, detected.id)
    if (result.ok && result.text) {
      status.textContent = '✓'
      row.classList.add('link-row--ok')
      texts.push(result.text)
      if (result.stats) stats.push(result.stats)
      if (result.charts) charts.push(result.charts)
      sources.add(`${detected.source}: ${detected.id}`)
    } else {
      status.textContent = '✗'
      row.classList.add('link-row--fail')
      reason.textContent = result.reason ?? 'Could not retrieve this link.'
    }
  }
  return { texts, stats, charts }
}

function setOutput(output: HTMLElement, text: string): void {
  output.textContent = text
}

function randomError(): string {
  const strings = copy.errorStrings
  return strings[Math.floor(Math.random() * strings.length)] ?? strings[0]
}

function selectedIntensity(root: HTMLElement): Intensity {
  const checked = root.querySelector<HTMLInputElement>(
    'input[name="intensity"]:checked',
  )
  const value = checked?.value
  return intensityLevels.includes(value as Intensity)
    ? (value as Intensity)
    : config.defaultIntensity
}

function fillPersonalia(
  root: HTMLElement,
  header: { name?: unknown; affiliation?: unknown } | null,
  sources: Set<string>,
): void {
  const value = (v: unknown): string =>
    typeof v === 'string' && v.trim() ? v.trim() : 'unknown'
  const used = sources.size ? [...sources] : ['Pasted text']
  const set = (id: string, text: string): void => {
    const el = root.querySelector(`#${id}`)
    if (el) el.textContent = text
  }
  set('pers-name', value(header?.name))
  set('pers-affil', value(header?.affiliation))
  set('pers-sources', used.join(', '))
  root.querySelector('#personalia')?.removeAttribute('hidden')
}

// Render a card of basic stats (one block per source that provided them) below
// the roast. Hidden when no source returned stats.
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

async function runRoast(
  textarea: HTMLTextAreaElement,
  root: HTMLElement,
  output: HTMLElement,
  button: HTMLButtonElement,
  sources: Set<string>,
): Promise<void> {
  if (!config.workerUrl) {
    setOutput(output, 'Roasting is not configured in this build yet (no Worker URL).')
    return
  }

  button.disabled = true
  root.querySelector('#share')?.setAttribute('hidden', '')
  root.querySelector('#personalia')?.setAttribute('hidden', '')
  root.querySelector('#stats-card')?.setAttribute('hidden', '')
  root.querySelector('#charts-card')?.setAttribute('hidden', '')
  setOutput(output, 'Checking links…')

  // Validate any profile links first (retrieving each via the Worker), then
  // combine the pasted/uploaded text with the retrieved text.
  const { texts: linkTexts, stats: linkStats, charts: linkCharts } = await validateLinks(
    root,
    sources,
  )
  const profile = [textarea.value.trim(), ...linkTexts]
    .filter(Boolean)
    .join('\n\n')
    .trim()
  if (!profile) {
    setOutput(output, 'Paste some text, upload a file, or add a valid link first.')
    button.disabled = false
    return
  }
  if (profile.length > config.maxInputChars) {
    setOutput(output, `That is longer than ${config.maxInputChars} characters. Trim it down.`)
    button.disabled = false
    return
  }
  setOutput(output, 'Roasting…')

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
      // Explicable limits and bad requests carry a plain message; everything
      // else is shown in character. A failed roast never triggers a second
      // model call.
      const data = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null
      const plain = new Set(['too_large', 'bad_model', 'bad_request', 'rate_limited'])
      if (data && data.error && plain.has(data.error) && data.message) {
        setOutput(output, data.message)
      } else {
        setOutput(output, randomError())
      }
      return
    }

    // Stream the SSE response. The model emits a one-line JSON header
    // {name, affiliation} first; we parse that into the personalia box and
    // stream the remainder as the roast (the typing effect), never showing the
    // raw header. The Worker relays OpenRouter's stream verbatim.
    const body = response.body
    if (!body) {
      setOutput(output, randomError())
      return
    }
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let raw = ''
    let headerDone = false
    let headerEnd = 0
    setOutput(output, '…')

    const tryHeader = (): void => {
      if (headerDone) return
      const s = raw.trimStart()
      if (!s.startsWith('{')) {
        // No JSON header (model didn't comply); treat everything as the roast.
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
        // Ignore blank lines and `:` keep-alive comments.
        if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
          continue
        }
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') {
          buffer = ''
          break
        }
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const delta = json.choices?.[0]?.delta?.content
          if (delta) {
            raw += delta
            tryHeader()
            if (headerDone) output.textContent = raw.slice(headerEnd).replace(/^\s+/, '')
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
      setOutput(output, randomError())
    } else {
      output.textContent = roast
      root.querySelector('#personalia')?.removeAttribute('hidden')
      renderStatsCard(root, linkStats)
      const chartsCard = root.querySelector<HTMLElement>('#charts-card')
      if (chartsCard) renderCharts(chartsCard, linkCharts)
      root.querySelector('#share')?.removeAttribute('hidden')
    }
  } catch {
    setOutput(output, randomError())
  } finally {
    button.disabled = false
  }
}
