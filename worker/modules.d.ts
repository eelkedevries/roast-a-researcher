// wrangler bundles .md files as Text modules (wrangler.toml [[rules]]), so an
// import of roast.md resolves to its contents as a string at runtime. This
// declaration mirrors that for the type-checker.
declare module '*.md' {
  const text: string
  export default text
}
