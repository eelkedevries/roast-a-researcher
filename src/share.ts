// Client-side sharing/export of a produced roast. Nothing is uploaded or
// stored; the image is rendered in the browser on a canvas. See the
// specification, Domain rules → Sharing and export.

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export function downloadText(text: string, filename: string): void {
  triggerDownload(new Blob([text], { type: 'text/plain' }), filename)
}

export async function downloadImage(
  text: string,
  title: string,
  filename: string,
): Promise<void> {
  const blob = await renderPng(text, title)
  if (blob) triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function renderPng(text: string, title: string): Promise<Blob | null> {
  const width = 800
  const padding = 48
  const lineHeight = 30
  const titleGap = 50

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)

  const bodyFont = '20px system-ui, sans-serif'
  ctx.font = bodyFont
  const lines = wrapText(ctx, text, width - padding * 2)
  const height = padding * 2 + titleGap + lines.length * lineHeight

  canvas.width = width
  canvas.height = height

  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = '#ff7a59'
  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillText(title, padding, padding + 24)

  ctx.fillStyle = '#f5f5f5'
  ctx.font = bodyFont
  lines.forEach((line, i) => {
    ctx.fillText(line, padding, padding + titleGap + (i + 1) * lineHeight)
  })

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('')
      continue
    }
    let current = ''
    for (const word of paragraph.split(/\s+/)) {
      const test = current ? `${current} ${word}` : word
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = test
      }
    }
    if (current) lines.push(current)
  }
  return lines
}
