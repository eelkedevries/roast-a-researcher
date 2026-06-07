// A fully simulated "researcher" for the try-it-out demo. Everything here is
// invented — profile text, metrics, stats and chart series — so a new visitor can
// see the whole pipeline (roast + personalia + stats card + charts) on one click,
// without supplying real data. The profile is written as an easy, clearly
// fictional target; the roast itself is still generated live from this text.

import type { SourceStats, ChartData } from './sources'

export interface DemoResearcher {
  profile: string
  stats: SourceStats
  charts: ChartData
}

export const demoResearcher: DemoResearcher = {
  profile: [
    'Name: Prof. Dr. Maximilian Q. Buzzworth III',
    'Affiliation: Institute for Disruptive Paradigms, University of the Cutting Edge',
    '',
    'Bio: A visionary, world-leading, internationally renowned thought leader at the',
    'intersection of synergy and paradigms. I leverage holistic, AI-powered,',
    'blockchain-enabled frameworks to disrupt ecosystems and unlock impactful,',
    'next-generation, stakeholder-centric value propositions. Passionate about',
    'excellence, innovation, and being passionate. My h-index is my favourite number.',
    '',
    'Selected publications:',
    '- "Towards a Framework for Frameworks: A Meta-Framework Approach" (2021), cited 2',
    '- "Leveraging Synergies: A Holistic Paradigm" (2020), cited 1',
    '- "On the Disruptive Potential of Disruption" (2019), cited 0',
    '- "A Preliminary Survey of Our Own Previous Work" (2022), cited 41 (self-citations: 40)',
    '- "Rethinking Rethinking: A Position Paper" (2023), cited 0',
    '- 482 further papers, mostly entitled "Towards a…", all single-authored',
    '',
    'Grants: "Exploratory Pilot Feasibility Study Grant" (€4,000); applied for 73 ERC',
    'grants, awarded 0.',
    'Awards: Best Paper Award (a workshop he co-organised); LinkedIn Top Voice.',
    'Metrics he lists on his website: h-index 9, "citations: thousands (incl. self)".',
  ].join('\n'),
  stats: {
    source: 'demo',
    title: 'Prof. Dr. Maximilian Q. Buzzworth III — simulated demo',
    entries: [
      { label: 'Publications', value: '487' },
      { label: 'Citations', value: '203' },
      { label: 'h-index', value: '9' },
      { label: 'i10-index', value: '3' },
      { label: 'g-index', value: '11' },
      { label: 'Mean citations', value: '0.4' },
      { label: 'FWCI', value: '0.18' },
      { label: 'Self-citation %', value: '71' },
    ],
  },
  charts: {
    worksPerYear: [
      { year: 2017, value: 12 },
      { year: 2018, value: 28 },
      { year: 2019, value: 61 },
      { year: 2020, value: 94 },
      { year: 2021, value: 120 },
      { year: 2022, value: 88 },
      { year: 2023, value: 84 },
    ],
    citationsPerYear: [
      { year: 2017, value: 3 },
      { year: 2018, value: 9 },
      { year: 2019, value: 21 },
      { year: 2020, value: 44 },
      { year: 2021, value: 70 },
      { year: 2022, value: 31 },
      { year: 2023, value: 25 },
    ],
    openAccess: [
      { status: 'closed', count: 451 },
      { status: 'bronze', count: 28 },
      { status: 'green', count: 8 },
    ],
    topCountries: [{ country: 'Solo (no co-authors)', count: 487 }],
    topVenues: [
      { venue: 'Journal of Frameworks', count: 96 },
      { venue: 'Proceedings of Workshops He Organised', count: 71 },
      { venue: 'arXiv (never published further)', count: 240 },
    ],
  },
}
