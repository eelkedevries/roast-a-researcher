# Troubleshooting

Project-facing troubleshooting notes.

## Blank GitHub Pages screen

A blank deployed page is usually a base-path problem. For a project Pages site served from `https://username.github.io/repository-name/`, the build tool's base path must match the repository name, for example:

```ts
base: '/repository-name/'
```

Check the browser console for asset 404s after deployment.

## Development server will not start

- Confirm the required runtime version is installed.
- Remove `node_modules/` and reinstall dependencies.

## Build succeeds but assets are missing online

- Verify the base path matches the public repository name.
- Confirm assets are referenced with relative or base-aware paths.
