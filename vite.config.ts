import { defineConfig } from 'vite'

// Served under the base path for this project.
export default defineConfig({
  base: '/roast-a-researcher/',
  // Bundle web workers (pdf.js) as ES-module chunks emitted with a .js extension,
  // so any static host serves them with a correct JavaScript MIME type. A raw
  // .mjs worker is served as octet-stream by many hosts, which silently breaks
  // the module worker and makes every PDF upload fail.
  worker: { format: 'es' },
})
