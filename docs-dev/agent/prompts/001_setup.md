# Task: Initial project scaffold

## Goal

Create the minimal runnable project scaffold for the **node** stack and
nothing else.

## Scope

Implement only the work described in this prompt. Do not implement adjacent
systems or future prompts.

## Context

This is the first prompt in a new project initialised from the `eek-a-dev`
template. Reference relevant notes in `docs-dev/planning/` if they exist.

## Required changes

1. Initialise the chosen Node scaffold (for example, `npm create vite@latest`) with default configuration only.
2. Add a `README.md` line describing how to run the project locally.
3. Ensure the project starts cleanly with the standard development command.

## Do not implement

Do not implement:
- application features, screens, or content;
- GitHub Pages deployment or CI changes beyond what is already templated;
- tests, state management, or architecture beyond the default scaffold.

## Acceptance criteria

The task is complete when:
- the scaffold installs cleanly;
- the project starts without errors;
- no feature code beyond the default scaffold has been added.

## Checks

Run the relevant checks for this prompt (install dependencies and start the
project).

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`001_setup.md`) as the commit message,
then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
