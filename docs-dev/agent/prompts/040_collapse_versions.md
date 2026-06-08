# Task: Make the model collapse near-duplicate paper versions into one work

## Goal

The model still roasts researchers for "publishing the same paper multiple
times" / "running out of ideas" when their list contains a preprint, a conference
paper and a journal article of one piece of research (similar titles, close years,
same topic). The existing rule only says *don't read this as misconduct*; it does
not tell the model to actively merge such entries. Make the model treat near-
duplicate entries — similar titles, the same or adjacent years, the same topic —
as a **single publication**, both in the structured `papers` JSON and in the
roast, so the republication joke can never arise.

## Scope

A wording change to the system prompt's existing preprint/version rule in
`buildSystemPrompt` (`worker/src/index.ts`), plus a matching note in the
specification. No behavioural code, UI, or retrieval changes (the front-end
structured de-dup from `038` is unchanged).

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Roast generation
(Outside knowledge / Content rules); Roast output presentation (Papers de-dup).

## Required changes

1. `worker/src/index.ts`, `buildSystemPrompt`: extend the existing
   "single piece of research … SAME work in different venues/versions" bullet so
   it is an active instruction: before extracting papers or writing the roast,
   collapse near-duplicate entries (similar titles, the same or adjacent years,
   the same topic) into one work; emit them once in the `papers` JSON and treat
   them as a single publication in the roast. Never joke about the same paper
   being published repeatedly, "running out of unique thoughts", padding a CV
   through republication, or similar.
2. `specification.md`: record that the model collapses preprint/conference/journal
   versions of one work into a single publication (and never roasts them as
   repeated publication), in the Roast generation prose. Bump the version.

## Do not implement

- changing the front-end structured de-dup (DOI/normalised title) from `038`;
- a separate verification pass or second model call.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- The system prompt instructs the model to merge near-duplicate versions into one
  publication and forbids the republication joke; the spec records the same and
  its version is bumped.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

After deploy: roast a profile whose list includes a preprint + journal version of
the same work and confirm the roast treats them as one paper and makes no
"published twice / ran out of ideas" joke.

## Commit and push

Commit using this file's exact filename (`040_collapse_versions.md`), then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
