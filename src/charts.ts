// Lightweight, dependency-free chart rendering (027). Each chart is inline SVG
// (no network, no secret) with an accessible label and a collapsible data table,
// so the numbers are available without the visual. Driven by the `charts` data the
// Worker returns (025).

import type { ChartData } from './sources'

interface BarItem {
  label: string
  value: number
}

function escapeXml(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'))
}

// Horizontal bar chart as an SVG string. Responsive via viewBox; bars scale to the
// largest value.
function barChartSvg(items: BarItem[]): string {
  const max = Math.max(...items.map((i) => i.value), 1)
  const rowH = 22
  // Size the label column to the longest label (~6.7px per character at 11px
  // JetBrains Mono) so long venue/country names do not collide with the bars;
  // the bar column absorbs the difference to keep the figure width constant.
  const longest = Math.max(...items.map((i) => String(i.label).length), 4)
  const labelW = Math.min(140, Math.max(60, Math.ceil(longest * 6.7) + 4))
  const valueW = 40
  const barW = 280 - valueW - labelW
  const pad = 4
  const width = labelW + barW + valueW
  const height = items.length * rowH + pad * 2
  // Labels that would still overrun the column are ellipsised (sliced by code
  // point so a surrogate pair is never split); the full text stays available
  // in the figure's aria-label and the data table.
  const maxChars = Math.floor((labelW - 4) / 6.7)
  const rows = items
    .map((it, idx) => {
      const y = pad + idx * rowH
      const w = Math.max(1, Math.round((it.value / max) * barW))
      const chars = Array.from(String(it.label))
      const label =
        chars.length > maxChars
          ? `${chars.slice(0, maxChars - 1).join('').trimEnd()}…`
          : String(it.label)
      return (
        `<text x="0" y="${y + 15}" class="chart__label">${escapeXml(label)}</text>` +
        `<rect x="${labelW}" y="${y + 4}" width="${w}" height="${rowH - 8}" rx="2" class="chart__bar"></rect>` +
        `<text x="${labelW + w + 4}" y="${y + 15}" class="chart__value">${Number(it.value)}</text>`
      )
    })
    .join('')
  // max-width caps the figure at its natural size, so the 11px text is never
  // scaled up and only shrinks when the container is genuinely narrower.
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" style="max-width:${width}px" preserveAspectRatio="xMinYMin meet" role="img" class="chart__svg">${rows}</svg>`
}

function dataTable(items: BarItem[]): HTMLDetailsElement {
  const details = document.createElement('details')
  details.className = 'chart__data'
  const summary = document.createElement('summary')
  summary.textContent = 'Data'
  const table = document.createElement('table')
  for (const it of items) {
    const tr = document.createElement('tr')
    const th = document.createElement('th')
    th.textContent = String(it.label)
    const td = document.createElement('td')
    td.textContent = String(it.value)
    tr.append(th, td)
    table.appendChild(tr)
  }
  details.append(summary, table)
  return details
}

function chartFigure(title: string, items: BarItem[]): HTMLElement {
  const figure = document.createElement('figure')
  figure.className = 'chart'

  const caption = document.createElement('figcaption')
  caption.className = 'chart__title'
  caption.textContent = title
  figure.appendChild(caption)

  const wrap = document.createElement('div')
  wrap.innerHTML = barChartSvg(items)
  const svg = wrap.firstElementChild
  if (svg) {
    svg.setAttribute(
      'aria-label',
      `${title}: ${items.map((i) => `${i.label} ${i.value}`).join(', ')}`,
    )
    figure.appendChild(svg)
  }

  figure.appendChild(dataTable(items))
  return figure
}

// Render every chart from one or more sources' chart data into the container.
// Hides the container when there is nothing to plot.
export function renderCharts(container: HTMLElement, chartsList: ChartData[]): void {
  container.textContent = ''
  const figures: HTMLElement[] = []
  for (const charts of chartsList) {
    if (charts.citationsPerYear?.length) {
      figures.push(
        chartFigure(
          'Citations per year',
          charts.citationsPerYear.map((p) => ({ label: String(p.year), value: p.value })),
        ),
      )
    }
    if (charts.worksPerYear?.length) {
      figures.push(
        chartFigure(
          'Publications per year',
          charts.worksPerYear.map((p) => ({ label: String(p.year), value: p.value })),
        ),
      )
    }
    if (charts.openAccess?.length) {
      figures.push(
        chartFigure(
          'Open access',
          charts.openAccess.map((p) => ({ label: p.status, value: p.count })),
        ),
      )
    }
    if (charts.topCountries?.length) {
      figures.push(
        chartFigure(
          'Co-author countries',
          charts.topCountries.map((p) => ({ label: p.country, value: p.count })),
        ),
      )
    }
    if (charts.topVenues?.length) {
      figures.push(
        chartFigure(
          'Top venues',
          charts.topVenues.map((p) => ({ label: p.venue, value: p.count })),
        ),
      )
    }
  }
  if (!figures.length) {
    container.setAttribute('hidden', '')
    return
  }
  for (const fig of figures) container.appendChild(fig)
  container.removeAttribute('hidden')
}
