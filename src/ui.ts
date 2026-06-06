import { config, copy, intensityLevels, type Intensity } from './config'
import { extractText, UnsupportedFileError } from './extract'
import { copyText, downloadText, downloadImage } from './share'
import {
  detectSource,
  retrieveSource,
  searchSource,
  type SourceKind,
  type Candidate,
} from './sources'

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
          <ul id="search-results" class="search__results"></ul>
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
        <div id="share" class="share" hidden>
          <button id="share-copy" class="button button--small" type="button">Copy</button>
          <button id="share-text" class="button button--small" type="button">Download .txt</button>
          <button id="share-image" class="button button--small" type="button">Download image</button>
        </div>
      </section>

      <section class="panel helper" aria-label="Where to get your profile text">
        <h2 class="helper__heading">${copy.helperHeading}</h2>
        <ul class="helper__list">
          ${copy.helperLines.map((line) => `<li>${line}</li>`).join('')}
        </ul>
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
  const searchResults = root.querySelector<HTMLUListElement>('#search-results')
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

  const found: Array<{ source: SourceKind; candidate: Candidate }> = []
  for (const { source, result } of settled) {
    for (const candidate of result.candidates ?? []) {
      found.push({ source, candidate })
    }
  }

  if (!found.length) {
    const li = document.createElement('li')
    li.className = 'search__status'
    li.textContent = 'No matches found.'
    results.appendChild(li)
    return
  }

  for (const { source, candidate } of found) {
    const li = document.createElement('li')
    const pick = document.createElement('button')
    pick.type = 'button'
    pick.className = 'button button--small search__pick'
    const affil = candidate.affiliation ? ` — ${candidate.affiliation}` : ''
    pick.textContent = `${candidate.name}${affil} · ${SOURCE_LABELS[source]}`
    pick.addEventListener('click', () => {
      addLinkRow(linksContainer, candidate.id)
      results.textContent = ''
    })
    li.appendChild(pick)
    results.appendChild(li)
  }
}

// Validate each non-empty link row by retrieving it via the Worker, marking the
// row with a tick or a cross + reason. Returns the retrieved texts.
async function validateLinks(root: HTMLElement, sources: Set<string>): Promise<string[]> {
  const texts: string[] = []
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
      sources.add(`${detected.source}: ${detected.id}`)
    } else {
      status.textContent = '✗'
      row.classList.add('link-row--fail')
      reason.textContent = result.reason ?? 'Could not retrieve this link.'
    }
  }
  return texts
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
  setOutput(output, 'Checking links…')

  // Validate any profile links first (retrieving each via the Worker), then
  // combine the pasted/uploaded text with the retrieved text.
  const linkTexts = await validateLinks(root, sources)
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
      root.querySelector('#share')?.removeAttribute('hidden')
    }
  } catch {
    setOutput(output, randomError())
  } finally {
    button.disabled = false
  }
}
