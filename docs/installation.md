# Installation

How to set up the project locally for development.

## Prerequisites

- Node.js (with npm).

## Install

```bash
git clone git@github.com:eelkedevries/roast-a-researcher.git
cd roast-a-researcher
npm ci
```

`npm ci` installs the exact dependencies from the committed lockfile (use it
rather than `npm install`, which can drift the lockfile).

## Run locally

```bash
npm run dev
```

Open the printed local URL in a browser.
