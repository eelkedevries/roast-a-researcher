// ISO 3166-1 alpha-2 country code → continent, used to summarise the geographic
// spread of an author's collaborating institutions (019). Compact by design: a
// lookup table, no external dependency.

const GROUPS: Record<string, string[]> = {
  Africa: [
    'DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CM', 'CV', 'CF', 'TD', 'KM', 'CG', 'CD',
    'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE',
    'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'YT', 'MA', 'MZ', 'NA', 'NE',
    'NG', 'RE', 'RW', 'SH', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ',
    'TG', 'TN', 'UG', 'EH', 'ZM', 'ZW',
  ],
  Asia: [
    'AF', 'AM', 'AZ', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'CY', 'GE', 'HK', 'IN',
    'ID', 'IR', 'IQ', 'IL', 'JP', 'JO', 'KZ', 'KW', 'KG', 'LA', 'LB', 'MO', 'MY',
    'MV', 'MN', 'MM', 'NP', 'KP', 'OM', 'PK', 'PS', 'PH', 'QA', 'SA', 'SG', 'KR',
    'LK', 'SY', 'TW', 'TJ', 'TH', 'TL', 'TR', 'TM', 'AE', 'UZ', 'VN', 'YE',
  ],
  Europe: [
    'AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FO', 'FI',
    'FR', 'DE', 'GI', 'GR', 'GG', 'HU', 'IS', 'IE', 'IM', 'IT', 'JE', 'LV', 'LI',
    'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU',
    'SM', 'RS', 'SK', 'SI', 'ES', 'SJ', 'SE', 'CH', 'UA', 'GB', 'VA',
  ],
  'North America': [
    'AI', 'AG', 'AW', 'BS', 'BB', 'BZ', 'BM', 'BQ', 'CA', 'KY', 'CR', 'CU', 'CW',
    'DM', 'DO', 'SV', 'GL', 'GD', 'GP', 'GT', 'HT', 'HN', 'JM', 'MQ', 'MX', 'MS',
    'NI', 'PA', 'PR', 'BL', 'KN', 'LC', 'MF', 'PM', 'VC', 'SX', 'TT', 'TC', 'US',
    'VG', 'VI',
  ],
  'South America': [
    'AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY',
    'VE',
  ],
  Oceania: [
    'AS', 'AU', 'CK', 'FJ', 'PF', 'GU', 'KI', 'MH', 'FM', 'NR', 'NC', 'NZ', 'NU',
    'NF', 'MP', 'PW', 'PG', 'PN', 'WS', 'SB', 'TK', 'TO', 'TV', 'VU', 'WF',
  ],
  Antarctica: ['AQ', 'BV', 'GS', 'HM', 'TF'],
}

const CONTINENT_BY_CODE: Record<string, string> = {}
for (const [continent, codes] of Object.entries(GROUPS)) {
  for (const code of codes) CONTINENT_BY_CODE[code] = continent
}

export function continentOf(code: string): string | null {
  return CONTINENT_BY_CODE[code.toUpperCase()] ?? null
}

// Full English country name for a 2-letter code (e.g. NL → Netherlands), via the
// runtime's Intl data; falls back to the code if unavailable.
let regionNames: Intl.DisplayNames | null = null
export function countryName(code: string): string {
  const c = code.toUpperCase()
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return regionNames.of(c) ?? c
  } catch {
    return c
  }
}
