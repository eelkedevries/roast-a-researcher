import { config, copy, intensityLevels } from './config'

// Builds the static shell. No network call is made here; wiring the roast
// request to the Worker is the next prompt's work (003_worker_proxy).
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

  // Live character count against the client-side input cap.
  const textarea = root.querySelector<HTMLTextAreaElement>('#profile')
  const counter = root.querySelector<HTMLSpanElement>('#char-count')
  if (textarea && counter) {
    textarea.addEventListener('input', () => {
      counter.textContent = String(textarea.value.length)
    })
  }
}
