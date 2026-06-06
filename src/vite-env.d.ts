/// <reference types="vite/client" />

// mammoth ships a browser build without bundled type declarations; we only use
// extractRawText.
declare module 'mammoth/mammoth.browser' {
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer
  }): Promise<{ value: string }>
}
