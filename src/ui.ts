import { config, copy, intensityLevels, type Intensity } from './config'
import { extractText, UnsupportedFileError } from './extract'

// Builds the static shell and wires the roast request to the Worker. The request
// is non-streaming for now; the typing-effect streaming display is 004's work.
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

        <p class="field__upload">
          <input id="file" type="file" accept=".txt,.md,.pdf,.docx,.odt" />
          <span class="field__hint">…or drop a file onto the box above. Supported:
            .txt, .md, .pdf, .docx, .odt.</span>
        </p>

        <fieldset class="intensity">
          <legend class="field__label">${copy.intensityLabel}</legend>
          ${intensityLevels
            .map(
              (level) => `
          <label class="intensity__option">
            <input type="radio" name="intensity" value="${level}"
              ${level === config.defaultIntensity ? 'checked' : ''} />
            <span>${level}</span>
          </label>`,
            )
            .join('')}
          <p class="field__hint">${copy.intensityHint}</p>
        </fieldset>

        <button id="roast" class="button" type="button">${copy.roastButton}</button>
      </section>

      <section class="panel" aria-label="Roast output">
        <div id="roast-output" class="output" aria-live="polite">
          <p class="output__placeholder">${copy.outputPlaceholder}</p>
        </div>
      </section>

      <section class="panel helper" aria-label="Where to get your profile text">
        <h2 class="helper__heading">${copy.helperHeading}</h2>
        <ul class="helper__list">
          ${copy.helperLines.map((line) => `<li>${line}</li>`).join('')}
        </ul>
      </section>

      <footer class="app__footer">
        <p class="privacy">${copy.privacyNotice}</p>
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

  // File upload and drag-drop: extract text client-side into the editable field.
  const fileInput = root.querySelector<HTMLInputElement>('#file')
  if (fileInput && textarea && counter) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (file) void loadFile(file, textarea, counter)
    })
    textarea.addEventListener('dragover', (e) => {
      e.preventDefault()
    })
    textarea.addEventListener('drop', (e) => {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (file) void loadFile(file, textarea, counter)
    })
  }
}

async function loadFile(
  file: File,
  textarea: HTMLTextAreaElement,
  counter: HTMLElement,
): Promise<void> {
  const previous = textarea.value
  textarea.value = `Extracting text from ${file.name}…`
  try {
    textarea.value = await extractText(file)
  } catch (err) {
    textarea.value = previous
    window.alert(
      err instanceof UnsupportedFileError
        ? err.message
        : 'Could not read that file. Paste the text instead.',
    )
  }
  counter.textContent = String(textarea.value.length)
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
    }
  } catch {
    setOutput(output, randomError())
  } finally {
    button.disabled = false
  }
}
