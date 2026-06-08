# Task: Hard-stop all jokes about similar / repeated paper titles

## Goal

Despite prompts `008c5f53`/`040`, the model still roasts researchers for
near-identical titles — e.g. quoting "No obligatory trade-off between the use of
space and time for working memory" (2023) beside "No trade-off between the use of
space and time for working memory" (2023) and joking about "minute linguistic
variation" / "hard to tell if it's a new discovery or a re-run". The model
receives the profile *text* (which lists both titles), and `mergePapers` only
de-dupes exact/punctuation-identical titles, so one-word-apart duplicates reach
the model. Make this joke impossible: an absolute prohibition, named explicitly,
that holds at every intensity.

## Scope

Strengthen the existing versions/duplicate-titles rule in `buildSystemPrompt`
(`worker/src/index.ts`) into a standalone, emphatic, no-exceptions content rule,
and update the matching spec paragraph. No code/UI/retrieval changes (text de-dup
of free-form profile prose is unreliable; the prompt is the lever).

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Roast generation
(Versions of one work; Content rules the floor).

## Required changes

1. `worker/src/index.ts`, `buildSystemPrompt`: replace the current
   preprint/versions bullet with an ABSOLUTE rule that: (a) explains near-identical
   titles — even one word or only punctuation apart, even in the same/adjacent
   years — are the same work duplicated by indexing (versions or plain database
   duplicates), never a second publication; (b) forbids, with no exceptions at any
   intensity, commenting on, quoting, comparing, or joking about title similarity,
   repeated/near-duplicate titles, "minute"/"linguistic" variation, or a paper
   seemingly published more than once, and any implication of republication,
   self-plagiarism, salami-slicing, padding, retraction, or "running out of
   ideas"; (c) instructs the model to silently treat such entries as one work,
   keep at most one, and never draw attention to the repetition.
2. `specification.md`: update the "Versions of one work" paragraph to state the
   prohibition is absolute and covers near-identical titles (not only
   venue/version pairs). Bump the version.

## Do not implement

- changing `mergePapers` / structured de-dup or attempting to de-dupe profile prose;
- a separate verification pass or second model call.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- The system prompt contains an absolute, no-exceptions prohibition on
  similar/repeated-title jokes naming the specific failure mode; the spec records
  it and its version is bumped.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

After deploy: roast a profile listing two one-word-apart titles in the same year
and confirm the roast neither quotes nor jokes about the similarity.

## Commit and push

Commit using this file's exact filename (`041_no_similar_title_jokes.md`), then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
