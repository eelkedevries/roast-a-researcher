// Client-side file → text extraction. Heavy parsers are loaded lazily (dynamic
// import) so they stay out of the initial bundle. The Worker contract is
// text-only; uploaded files never leave the browser. See the specification,
// Domain rules → Input handling.

export class UnsupportedFileError extends Error {}

// A PDF with no text layer (scanned / image-only). Distinct so the UI can offer
// the opt-in OCR fallback rather than only advising to paste.
export class ScannedPdfError extends UnsupportedFileError {}

export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  const ext = name.slice(name.lastIndexOf('.') + 1)

  switch (ext) {
    case 'txt':
    case 'md':
      return (await file.text()).trim()
    case 'pdf':
      return extractPdf(file)
    case 'docx':
      return extractDocx(file)
    case 'odt':
      return extractOdt(file)
    default:
      throw new UnsupportedFileError(
        'That file type is not supported. Save it as PDF or .docx, or paste the text.',
      )
  }
}

// Load pdf.js and wire its worker through Vite's `?worker` bundling. Vite emits the
// worker as a normal hashed `.js` chunk, which every static host serves with a
// correct JavaScript MIME type — unlike the raw `pdf.worker.min.mjs`, which some
// hosts serve as octet-stream, silently breaking the module worker so every PDF
// fails. A fresh worker is created per call and terminated by the caller.
async function pdfjsWithWorker(): Promise<{
  pdfjs: typeof import('pdfjs-dist')
  worker: Worker
}> {
  const pdfjs = await import('pdfjs-dist')
  const PdfWorker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default
  const worker = new PdfWorker()
  pdfjs.GlobalWorkerOptions.workerPort = worker
  return { pdfjs, worker }
}

async function extractPdf(file: File): Promise<string> {
  const { pdfjs, worker } = await pdfjsWithWorker()

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  try {
    const pdf = await loadingTask.promise
    const parts: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
    }
    const out = parts.join('\n').trim()
    if (!out) {
      throw new ScannedPdfError(
        'No text found — this looks like a scanned or image-only PDF.',
      )
    }
    return out
  } finally {
    // Release the pdf.js document and its worker across repeated uploads.
    await loadingTask.destroy()
    worker.terminate()
  }
}

// Opt-in OCR for scanned/image-only PDFs (032). Lazily loads tesseract.js and,
// reusing pdf.js, renders each page to a canvas and recognises the text — entirely
// in the browser, so the file never leaves the device. OCR assets (the WASM core
// and the English language data) are downloaded from the tesseract.js CDN on first
// use. Bounded to `maxPages` to keep time/memory sane on mobile.
export async function ocrPdf(
  file: File,
  onProgress?: (message: string) => void,
  maxPages = 10,
): Promise<string> {
  const { pdfjs, worker } = await pdfjsWithWorker()
  const Tesseract = (await import('tesseract.js')).default

  const data = new Uint8Array(await file.arrayBuffer())
  // One OCR worker for the whole document — Tesseract.recognize() would otherwise
  // spin up and tear down the WASM engine (and reload the language data) per page.
  const ocrWorker = await Tesseract.createWorker('eng')
  const loadingTask = pdfjs.getDocument({ data })
  try {
    const pdf = await loadingTask.promise
    const pages = Math.min(pdf.numPages, maxPages)
    const parts: string[] = []
    for (let i = 1; i <= pages; i++) {
      onProgress?.(`OCR page ${i} of ${pages}…`)
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      const result = await ocrWorker.recognize(canvas)
      parts.push(result.data.text)
      canvas.width = 0
      canvas.height = 0
    }
    const out = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    if (!out) {
      throw new UnsupportedFileError('OCR found no readable text. Paste the text instead.')
    }
    return out
  } finally {
    await ocrWorker.terminate()
    await loadingTask.destroy()
    worker.terminate()
  }
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser')
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value.trim()
}

async function extractOdt(file: File): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const content = zip['content.xml']
  if (!content) {
    throw new UnsupportedFileError('Could not read this ODT file. Paste the text instead.')
  }
  return strFromU8(content)
    .replace(/<text:(p|h)[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
