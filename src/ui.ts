import { config, copy, intensityLevels, type Intensity } from './config'
import { extractText, UnsupportedFileError } from './extract'
import { copyText, downloadText, downloadImage } from './share'

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

  // Live character count against the client-side input cap.
  if (textarea && counter) {
    textarea.addEventListener('input', () => {
      counter.textContent = String(textarea.value.length)
    })
  }

  if (textarea && button && output) {
    button.addEventListener('click', () => {
      void runRoast(textarea, root, output, button)
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
      if (files.length) void processFiles(files, textarea, counter, fileList)
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
      if (files.length) void processFiles(files, textarea, counter, fileList)
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
    remove.addEventListener('click', () => item.remove())
    item.append(status, name, remove)
    list.appendChild(item)

    try {
      appendToInput(textarea, await extractText(file))
      status.textContent = '✓'
      item.classList.add('file-list__item--ok')
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

async function runRoast(
  textarea: HTMLTextAreaElement,
  root: HTMLElement,
  output: HTMLElement,
  button: HTMLButtonElement,
): Promise<void> {
  const profile = textarea.value.trim()
  if (!profile) {
    setOutput(output, 'Paste some profile text first.')
    return
  }
  if (profile.length > config.maxInputChars) {
    setOutput(output, `That is longer than ${config.maxInputChars} characters. Trim it down.`)
    return
  }
  if (!config.workerUrl) {
    setOutput(output, 'Roasting is not configured in this build yet (no Worker URL).')
    return
  }

  button.disabled = true
  setOutput(output, 'Roasting…')
  root.querySelector('#share')?.setAttribute('hidden', '')

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

    // Stream the SSE response, appending token deltas as they arrive (the
    // typing effect). The Worker relays OpenRouter's stream verbatim.
    const body = response.body
    if (!body) {
      setOutput(output, randomError())
      return
    }
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let roast = ''
    setOutput(output, '')
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
            roast += delta
            output.textContent = roast
          }
        } catch {
          // Partial or non-JSON line; wait for more data.
        }
      }
    }
    if (!roast.trim()) {
      setOutput(output, randomError())
    } else {
      root.querySelector('#share')?.removeAttribute('hidden')
    }
  } catch {
    setOutput(output, randomError())
  } finally {
    button.disabled = false
  }
}
