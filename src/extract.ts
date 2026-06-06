// Client-side file → text extraction. Heavy parsers are loaded lazily (dynamic
// import) so they stay out of the initial bundle. The Worker contract is
// text-only; uploaded files never leave the browser. See the specification,
// Domain rules → Input handling.

export class UnsupportedFileError extends Error {}

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

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  const out = parts.join('\n').trim()
  if (!out) {
    throw new UnsupportedFileError(
      'No text found — this looks like a scanned or image-only PDF. Paste the text instead.',
    )
  }
  return out
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
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
