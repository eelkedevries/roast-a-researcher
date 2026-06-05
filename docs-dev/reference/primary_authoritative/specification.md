# Stuck on the Tenure Track — LLM reference documentation

**Audience:** coding-focused LLM tools (Claude Code, Cursor, Copilot, similar) building this game alongside a solo developer. This document is the authoritative reference for the game's design, scope, and architecture. When the codebase and this document conflict, this document is correct.

**Status:** beta specification, v1.1. Last revised alongside design proposal v0.3 plus the decisions recorded in the design conversation that produced this document.

**House rules for the LLM using this document:**

1. When implementing any system, read this document's overview (§1–§3) plus the relevant per-system section (§4) before writing code.
2. Where this document specifies a data schema, follow it. Do not invent alternative schemas.
3. Where this document specifies a constraint (browser-based, single-player, ~30 minute runtime, etc.), do not violate it without explicit instruction from the developer.
4. Where this document is silent on an implementation detail, choose the simplest option compatible with the overall architecture, and surface the choice to the developer.
5. Use British English throughout, including in code comments and player-facing copy. (The developer is a non-native English speaker with high academic proficiency; aim for natural professional British English in player-facing text.)
6. **Version control workflow: after every code adjustment, commit and push to the GitHub repository.** Commits should be atomic (one logical change per commit), with clear conventional commit messages (e.g. `feat: add publication pipeline`, `fix: correct citation accrual formula`, `docs: update grant calibration`, `refactor: extract turn resolution into separate module`). **All work is committed directly to `main`. Do not create feature branches and do not open pull requests unless explicitly instructed by the developer.** Push after each commit. The repository is named `stuck-on-the-tenure-track` and is hosted on the developer's GitHub account. Deployment target is GitHub Pages; pushes to `main` trigger automatic redeployment via GitHub Actions (or are served directly from `main`, depending on the chosen build approach — see §5).

---

## 1. Architectural overview

### 1.1 What the game is, in one paragraph

*Stuck on the Tenure Track* is a turn-based, browser-based, single-player satirical simulation of an academic career, from undergraduate matriculation to the tenure decision. The player allocates time each term (~3 months) across research, teaching, service, relationships, and health, against three computer-controlled rivals from a shared high-school cohort. A full game is approximately 25 turns, takes around 30 minutes of real time, and runs on smartphone and desktop browsers. The beta covers psychology, with four sub-disciplines.

### 1.2 Hard constraints (non-negotiable)

| Constraint | Value | Rationale |
|---|---|---|
| Platform | Browser-based; mobile + desktop | Requirement from the developer. |
| Backend dependency | None for beta | Solo first-time developer; minimise infrastructure. Saves are local. |
| Runtime LLM | None for beta | Cost, latency, mobile compatibility, offline support. |
| Total runtime per game | ~30 minutes (target: 25–35 min) | Target audience's available attention; mobile context. |
| Visual style | Pixel art / retro | Aesthetic homage to *Jones in the Fast Lane* (Sierra, 1990); achievable solo. |
| Spelling | British English | Consistent with the developer's preference. |
| Language | English | At launch. Localisation deferred. |
| Discipline at beta | Psychology only | Scope. |
| Sub-disciplines at beta | Cognitive, social, clinical, developmental | Scope. |
| Multiplayer | None at beta | Scope. Deferred to post-launch. |
| Save model | Local browser storage (localStorage / IndexedDB) | No accounts, no server, no sync. |

### 1.3 Soft constraints (recommendations; the LLM should follow unless given a reason)

- The tech stack is not prescribed. The LLM should choose a stack appropriate to the constraints above and surface the choice to the developer. Reasonable choices include vanilla HTML/CSS/JS, or a lightweight framework (Svelte, Vue, React) with minimal build complexity.
- All content (events, journals, supervisor archetypes, names, etc.) lives in external data files, not in code. The engine reads content at runtime.
- The game state must be serialisable to JSON without loss. Saves are JSON blobs in browser storage.
- The codebase should be readable by a first-time game developer working with LLM assistance. Prefer clarity over cleverness. Comment non-obvious decisions inline.

### 1.4 Tone and content principles for player-facing text

The game is satirical, dry, and specific. Humour comes from accurate detail, not absurdity. Player-facing text should:

- Use real journal names, real funder names, real conferences. Recognition is the source of the comedy.
- Reference specific academic situations (Reviewer 2, IRB revisions, the Psychonomic Society poster session, the supervisor on sabbatical) rather than generic stand-ins.
- Avoid moralising. Misconduct and mental-health systems present consequences without commentary.
- Avoid promotional or inflated language. The game is matter-of-fact about academic life.
- Use British spelling (analyse, organise, behaviour, programme, recognise, defence) consistently.

---

## 2. Content architecture: the three-layer hierarchy

This is the most consequential architectural decision in the project. All other systems depend on it.

### 2.1 The three layers

**Layer 1: Universal.** The engine and all mechanics. Built once. No discipline-specific content. Includes: the turn engine, the four resources, the publication pipeline, the grant system, the health system, the misconduct system, the relationship system, the cohort tracker, the tenure decision logic, the save system, the UI framework.

**Layer 2: Broad discipline.** Content packs for top-level fields. For the beta, only one pack ships: **psychology**. A pack contains:

- Authorship convention (psychology: first-matters-last-matters).
- Venue type (psychology: journal-dominant).
- Career-stage durations (psychology: standard EU timeline).
- A base name list (journals, conferences, funders, methods, supervisor archetypes, character name pools).
- A base set of events written at the broad-discipline level.

**Layer 3: Sub-discipline.** Smaller packs nested inside Layer 2 packs. For the psychology beta, four sub-discipline packs ship:

- `cognitive`
- `social`
- `clinical`
- `developmental`

Each Layer-3 pack contains: sub-discipline-specific journals, methods, event overrides and supplements, and famous-figure references for flavour.

### 2.2 Inheritance and override

The runtime content system resolves content lookups in precedence order: Layer 3 → Layer 2 → Layer 1. A sub-discipline event with the same `event_id` as a broad-discipline event overrides it. Otherwise, the broad-discipline event fires. Layer-1 events fire universally regardless of layer below.

### 2.3 Directory layout (recommendation)

```
/content/
  /core/
    events.yaml                  # Layer 1: universal events
    mechanics_text.yaml          # UI strings, system messages
    supervisor_archetypes.yaml   # universal archetype definitions
  /disciplines/
    /psychology/
      meta.yaml                  # authorship rule, venue type, durations
      journals.yaml
      conferences.yaml
      funders.yaml
      methods.yaml
      events.yaml                # Layer 2: psychology-flavoured events
      characters.yaml            # name pools, supervisor archetypes
      /sub-disciplines/
        /cognitive/
          meta.yaml
          journals.yaml          # additions to psychology journals
          methods.yaml
          events.yaml            # Layer 3: cognitive-specific events
          figures.yaml           # famous-figure references
        /social/
          ...
        /clinical/
          ...
        /developmental/
          ...
```

### 2.4 Why this matters even though the beta ships only one discipline

The engine must read content from these layered files from day one, even though only one pack exists at beta. Hardcoding psychology-specific content into the engine would make adding biology, physics, or computer science later approximately as expensive as building the engine again. This is not optional; it is the single most important technical decision in the project.

---

## 3. Time, turns, and the calendar

### 3.1 Turn unit

One turn represents one **academic term**, approximately three months. A full game spans approximately **25 turns** (~7.5 years compressed; earlier life stages are abstracted, see §3.4).

### 3.2 Calendar

The game uses a real calendar that begins in **September of the real-world current year at the moment of character creation**. Weekdays, month lengths, and leap years are accurate. Players see day, month, and year on the UI.

The academic calendar is the **Dutch / EU two-semester system**, hardcoded for the beta but stored in a structured constant or file (not scattered through code) so that other jurisdictions can be added later:

- **Autumn term:** September → late January (includes January exams)
- **Spring term:** February → late June (includes June exams)
- **Summer:** July → August (research-heavy, low teaching, hard to recruit participants)

### 3.3 Internal time representation

Engine maintains both:

- `turn_number: integer` — for mechanics, scheduling, and rivals' parallel timelines.
- `current_date: ISO date string (YYYY-MM-DD)` — for UI display and calendar-aware events.

A turn corresponds to a fixed span on the calendar (e.g. autumn term turn = Sept 1 – Jan 31). The mapping is bidirectional and deterministic.

### 3.4 Career stages and turn allocation

Approximate turn budget (subject to playtesting):

| Stage | In-game years | Approx. turns | Notes |
|---|---|---|---|
| Undergraduate | 3 | 3 | Compressed; one turn per year. Limited decisions. |
| MSc | 2 | 2 | One turn per year. Thesis defence at end. |
| PhD | 4 | 8 | Full term-by-term resolution. The most detailed phase. |
| Postdoc(s) | 3 | 6 | Term-by-term. Includes job market. |
| Assistant professor | 6 | 6 | One turn per year. Tenure clock. |
| **Total** | **~18** | **~25** | |

Early stages are coarser because the player has fewer meaningful choices; PhD and postdoc years are full resolution because that is where the game lives.

### 3.5 Seasonality (required mechanical effects)

The engine must support events conditional on calendar date or term phase. Required examples for the beta:

- **Exam weeks** (late January, late June): teaching demands spike; research suffers; some events fire only here (marking, oral exams, plagiarism cases).
- **Summer (July–August):** participant recruitment is harder (reduced study throughput); summer schools available; some collaborators are unreachable.
- **End-of-month financial events:** salary / stipend / study finance paid out. Modelled at month boundaries even when turns are term-length.
- **Grant calendars:** grant calls open and close on real dates tied to real funders (ERC, NWO, NIH).
- **Conference seasons:** major conferences fire at their actual calendar slots.

---

## 4. Per-system specifications

Each subsection below specifies one system. Subsections are intended to be retrievable in isolation; each begins with a brief overview so the LLM has context when only this section is loaded.

### 4.1 The four resources

**Overview.** The player has four core resources that respond to actions and events. The first two are scalars; the latter two are structured.

#### Funds

Two pools, both integers (or floats; choose one consistently):

```yaml
funds:
  personal: integer    # rent, food, leisure; can be negative (debt)
  research: integer    # grant-restricted; cannot be spent on personal
```

Personal funds going strongly negative triggers events (debt collection, eviction risk, declined credit). Research funds going to zero blocks research actions that require funding.

#### Wellbeing

A composite of three coupled sub-stats, each on a 0–100 scale:

```yaml
wellbeing:
  sleep: integer       # 0-100; ideal 70-100
  mood: integer        # 0-100; ideal 60-100
  physical: integer    # 0-100; ideal 60-100
```

Each is updated every turn based on time allocation and events. Below thresholds, the player enters a *health condition state* (§4.7).

#### Expertise

A skill tree. Each branch has an integer level 0–10:

```yaml
expertise:
  methods: integer       # experimental design, data collection
  theory: integer        # domain knowledge, conceptual depth
  writing: integer       # paper writing, grant writing
  statistics: integer    # quantitative analysis
  teaching: integer      # pedagogy, course design
  politics: integer      # networking, self-promotion, grant strategy
```

Skill levels gate certain actions (e.g. submitting to top-tier journals requires writing ≥ 5; running advanced analyses requires statistics ≥ 4).

#### Standing

```yaml
standing:
  rank: enum             # undergraduate, msc_student, phd_candidate,
                         # postdoc, assistant_professor, tenured
  h_index: integer       # computed from publications, not stored independently
  reputation: integer    # 0-100; visibility, prestige
  affiliation_prestige: integer  # 0-100; current institution
```

### 4.2 The turn engine

**Overview.** Each turn, the player allocates time across actions, events fire, AI rivals take their turns, and state updates. The turn loop is the central control flow of the game.

#### Turn structure

```
1. Turn start
   a. Advance current_date to the start of the new term
   b. Compute and apply automatic effects from previous turn (paper progress, citation accrual, relationship decay, etc.)
   c. Determine which events may fire this turn (calendar-conditional, state-conditional, random)

2. Event phase
   a. Surface mandatory events to player (decisions required)
   b. Surface optional events (news, gossip, opportunities)

3. Action phase
   a. Player allocates time budget across available actions
   b. Player commits the turn

4. Resolution phase
   a. Compute action outcomes (with stochasticity)
   b. Update all stats
   c. Check milestone triggers (§4.10)
   d. Check game-end triggers (§4.10)

5. Rival phase
   a. Each AI rival takes their turn (scripted stochastic archetypes, §4.11)
   b. Update cohort tracker

6. Save game state
7. Turn end; return to step 1
```

#### Time budget

Each turn, the player receives a base time budget representing one term. The unit is **time points** (TP), an abstraction; the LLM may choose the exact number (recommendation: 100 TP per term as a clean base). The budget is modified by:

- Health condition states (reduced budget)
- Life events (e.g. caring for a sick relative reduces budget)
- Career stage (PhD candidates have more discretionary time than assistant professors with heavy teaching loads)

#### Available actions

Actions are defined in content data (Layer 1 by default; Layer 2/3 may add discipline-specific actions). A canonical action definition:

```yaml
action_id: write_paper
display_name: "Work on a paper"
cost_time: variable      # player chooses how much to invest
cost_funds: 0
requires:
  - has_active_paper: true
location: office
effects:
  paper_progress: function_of(time_invested, expertise.writing)
visible_when:
  rank: [phd_candidate, postdoc, assistant_professor, tenured]
```

#### Action categories (for UI grouping)

- **Research:** data collection, writing, analysis, literature search.
- **Teaching:** prep, delivery, marking, supervision of students.
- **Service:** committee work, peer review, departmental admin.
- **Networking:** conferences, seminars, collaborations.
- **Funding:** grant writing, applications.
- **Personal:** sleep, exercise, time with partner/family/friends, therapy.
- **Misconduct:** see §4.8. Same UI affordances as other actions; consequences differ.

### 4.3 The publication system

**Overview.** Papers are first-class objects with full metadata. Citation dynamics, retraction consequences, and authorship politics all key off paper-level data. This is the central reputational mechanic.

#### Paper data model

```yaml
paper_id: unique_string
title: string                    # generated from templated slots
authors:
  - author_id: string            # player_id or rival_id or npc_id
    position: integer            # 1 = first, 2 = second, ..., N = last
    is_corresponding: boolean
journal:
  name: string                   # from content pack
  tier: integer                  # 1 = top, 2 = good, 3 = mid, 4 = low, 5 = predatory
  impact_factor: float           # from content pack
status: enum                     # in_prep, submitted, in_revision, published, rejected, retracted
date_started: date
date_submitted: date | null
date_published: date | null
date_retracted: date | null
citations: integer               # accrued over time after publication
citations_history:               # for trajectory visualisation
  - date: date
    count: integer
methodology_quality: integer     # 0-100, hidden; affects detection risk
contains_misconduct: enum        # none, grey_area, fabrication, falsification, plagiarism
contains_misconduct_by: author_id | null   # who did it (may be a student/RA the player supervised)
preregistered: boolean
open_data: boolean
visibility: integer              # 0-100; press coverage, social media attention; affects retraction impact
```

#### Paper lifecycle

```
1. in_prep:    player invests time; paper accrues progress
2. submitted:  player chooses journal; review period (1-3 turns)
3. in_revision: 60-80% of submissions; player invests time to revise
4. Outcome:
   a. published (good outcome)
   b. rejected (player may resubmit to lower-tier journal)
5. After publication:
   a. citations accrue stochastically, weighted by:
      - journal tier and impact factor
      - methodology quality
      - field size (psychology subfields vary)
      - luck term
      - co-authors' standing (boost from senior co-authors)
   b. visibility may rise if press picks up the paper
   c. retraction may trigger if misconduct is detected (see §4.8)
```

#### Authorship rules (psychology, beta)

- **First author:** primary contributor; reputational weight ~1.0.
- **Last author:** senior author / PI; reputational weight ~0.8.
- **Middle authors:** reputational weight scales down (~0.3 for second, ~0.1 for others).
- Player negotiates position with collaborators when starting a paper. The player's own contribution and seniority constrain plausible positions.

#### Citation dynamics

Citations accrue per turn after publication, with the per-turn expected count given by:

```
expected_citations_per_turn = base_rate
                              * journal_impact_factor_term
                              * methodology_quality_term
                              * field_size_term
                              * visibility_boost
                              * age_decay
                              * luck_multiplier
```

The LLM should choose specific functional forms calibrated such that:
- A typical paper accrues most citations in years 2–5 after publication.
- Top-tier-journal papers accrue 5–20× the citations of low-tier-journal papers.
- A small number of papers receive disproportionately many citations (long-tailed distribution).
- The h-index is computed each turn from the player's full publication record.

### 4.4 The grant system

**Overview.** Grant applications cost time, mostly fail, and when they succeed transform the player's career. Grant calls follow real calendar cycles.

#### Grant data model

```yaml
grant_id: unique_string
funder: string                   # e.g. ERC, NWO, NIH (from content pack)
scheme: string                   # e.g. "Starting Grant", "Veni"
amount: integer                  # research funds awarded
duration_turns: integer          # how many turns of funding
call_opens: date
call_closes: date
typical_success_rate: float      # base rate (e.g. 0.13 for ERC Starting Grant)
requires:
  rank: enum                     # eligibility by career stage
  years_since_phd_min: integer | null
  years_since_phd_max: integer | null
```

#### Application lifecycle

```
1. Call announced (event fires; appears on calendar)
2. Player chooses to apply: commits N time points across 1-2 turns to writing
3. Application submitted; outcome resolves 1-3 turns later
4. Probability of success modified by:
   - base success rate
   - player's writing expertise
   - player's politics expertise
   - time invested in application
   - prior grant success
   - publication record (h-index, top-tier papers)
   - luck term
5. If awarded: research funds replenished; reputation gains; career advancement points
6. If declined: time investment lost; small wellbeing hit; may reapply next cycle
```

#### Beta grant calendar (psychology, EU context)

The content pack should specify at minimum:

- ERC Starting Grant (annual call; ~13% success; ~€1.5M; for early-career researchers post-PhD)
- NWO Veni (annual; ~15%; ~€320k; post-PhD)
- NWO Vidi (annual; ~15%; ~€800k; mid-career)
- NIH R01 equivalent (if including US funders; ~20%)
- Smaller institutional / departmental seed grants (~30–50% success; small amounts)

### 4.5 The relationship system

**Overview.** Relationships are tracked individually as NPC objects with role tags. Each decays at its own rate when neglected. The supervisor relationship is the single most consequential in the early game.

#### NPC data model

```yaml
npc_id: unique_string
name: string                     # from content pack name pool
gender: enum
role_relative_to_player: enum    # supervisor, phd_student, postdoc, peer_collaborator,
                                 # partner, family, friend, departmental_colleague
relationship_score: integer      # 0-100; affects events and opportunities
relationship_status: enum        # active, strained, broken, deceased
last_interaction_turn: integer
persistent: boolean              # named recurring NPCs (supervisor, partner) vs transient
shared_papers: [paper_id]
notes: string                    # contextual tags (e.g. "supervisor archetype: exploitative")
```

#### Relationship categories and decay

| Role | Decay per turn neglected | Effects when broken |
|---|---|---|
| Partner | -3 | Wellbeing hit; possible departure with financial / wellbeing consequences |
| Family | -1 | Slow guilt accumulation; events when crisis hits |
| Friends (non-academic) | -4 | Disappear without drama; isolation increases imposter risk |
| Friends (academic) | -2 | Lost collaboration opportunities |
| Peer collaborators | -3 | Stop offering co-authorships |
| Supervisor (PhD) | -2 | Catastrophic: no reference letter, lost protection |
| Departmental colleagues | -1 | Reputational drip; service load redistributed unfavourably |

#### Supervisor archetypes (psychology, beta)

The PhD supervisor is assigned at the start of the PhD stage with partial visibility. Archetypes (each defined in content as a parameter set):

- **Supportive mentor.** Best outcomes for the player; rare.
- **Hands-off.** Player gets autonomy and time, but no guidance; outcome depends on player's own capability.
- **Micromanager.** Constant interruptions; lower wellbeing; somewhat protective on the job market.
- **Status-driven.** Demands first-authorship from students on group papers; helps with prestige; risk of exploitation.
- **Absent.** On sabbatical, leaving the institution, or otherwise unavailable; player navigates alone.
- **Exploitative.** Takes credit; demands unreasonable hours; may take last-author on papers the player did alone. Worst outcome; players should be able to recognise the signs after a few turns.

Supervisor archetype is partly visible at selection (rumours, prior students' outcomes) and partly hidden. The selection is itself a decision point with imperfect information.

### 4.6 Specialisation (sub-discipline) system

**Overview.** The player begins in psychology with no sub-discipline. Through coursework, MSc selection, and PhD supervisor choice, the player progressively commits to a sub-discipline. This commits Layer-3 content (specific journals, methods, events).

#### State variable

```yaml
specialisation:
  status: enum                   # undeclared, leaning, committed, switched
  current_sub_discipline: string | null   # one of: cognitive, social, clinical, developmental
  commitment_turn: integer | null
```

#### Specialisation transitions

```
1. Undergraduate (turns 1-3):
   - Player takes electives; small nudges toward one sub-discipline based on choices
   - status: undeclared throughout
2. MSc application (between turn 3 and 4):
   - Player chooses MSc programme; selection nudges sub-discipline
   - status: leaning
3. PhD supervisor selection (turn 5):
   - Player chooses supervisor; supervisor's sub-discipline becomes player's
   - status: committed
4. Post-PhD:
   - Switching is possible but costs significant time (1-2 turns) and reputation
   - status: switched (rarely)
```

#### Content loading on commit

When `status` transitions to `committed`, the engine loads the Layer-3 content pack for that sub-discipline. From this point, Layer-3 events override matching Layer-2 events, Layer-3 journals become available, etc.

### 4.7 The mental and physical health system

**Overview.** Health is a first-class system, not flavour. Crossing clinical thresholds enters health condition states with significant penalties that cannot be ignored.

#### Wellbeing dynamics

Sleep, mood, and physical health update each turn:

```
delta_sleep = sleep_action_investment - (work_hours_excess * 0.5) - (stress_events_term * 2)
delta_mood = positive_events_term - negative_events_term - (rival_lead_perception * factor) - (sleep_debt * factor)
delta_physical = exercise_investment + (sleep > 60 ? 1 : -1) - (chronic_stress_factor)
```

Specific functional forms left to implementation; the LLM should calibrate such that:

- A player who allocates zero time to wellbeing for 4–6 consecutive turns enters a health condition.
- A player who allocates moderate time (~10 TP per turn) maintains baseline wellbeing.
- Wellbeing recovery after burnout takes multiple turns.

#### Health condition states

When any sub-stat crosses a threshold, the player enters a state:

```yaml
health_conditions:
  - condition_id: string
    type: enum                   # burnout, depression, anxiety, chronic_insomnia,
                                 # RSI, chronic_pain, autoimmune_flare, other
    severity: enum               # mild, moderate, severe
    onset_turn: integer
    status: enum                 # acute, recovering, chronic, resolved
    treatment_in_progress: enum  # none, GP, therapy, medication, sick_leave
    productivity_penalty: float  # 0.0 to 1.0 (1.0 = no penalty; 0.5 = half productivity)
```

#### Treatment actions

Available when a health condition is active:

- **GP visit:** 5 TP; 1-2 turn wait for appointment; outcome: prescription, referral, sick leave, or no action.
- **Therapy:** 5 TP per turn ongoing; gradual mood recovery; gated by 2-4 turn waiting list for first appointment.
- **Medication:** small ongoing TP cost; faster recovery but possible side-effect events.
- **Reduced workload:** voluntary; cuts time budget by 25%; halves productivity penalty; recovery proceeds.
- **Sick leave:** institutionally imposed or chosen; pauses career progression for 1-3 turns; full recovery probable; rivals continue.

#### Required design constraints

- Conditions **cannot be ignored**. The engine enforces this: if a player tries to allocate full time to work while in a severe condition, the engine reduces effective output and triggers worsening events.
- Some conditions become **chronic**: they manage rather than resolve. The chronic state has ongoing small TP cost and occasional flare-ups.
- The end-of-game CV records all conditions experienced.

#### Imposter syndrome (separate sub-system)

```yaml
imposter_state:
  perceived_competence: integer  # 0-100; player's self-assessment
  actual_competence: integer     # 0-100; from expertise and accomplishments
  gap: integer                   # actual - perceived
```

When gap exceeds threshold (perceived << actual), the player auto-declines opportunities (low-tier journal choices, withdrawn grant applications, declined collaborations). Treatable through therapy, mentorship, and accumulated successes. Rarely fully eliminated.

#### Content tone for health events

Player-facing text for health events must be specific and matter-of-fact, never sensational or condescending. The game does not lecture. Resource signposting (mental-health helplines, etc.) appears in the main menu, not in event text. An optional "lighter narrative" toggle reduces detail in event text while keeping mechanics unchanged.

### 4.8 The misconduct system

**Overview.** Players can engage in research misconduct, with consequences scaling to the visibility of the work involved. The system is designed such that long-running misconduct strategies fail more often than they succeed across many playthroughs.

#### Categories

**Grey-area practices** (low per-instance risk; ubiquitous in academia):

- HARKing (hypothesising after results known)
- Selective reporting / undisclosed exclusions
- p-hacking via optional stopping
- Gift authorship
- Salami-slicing
- Citation cartels / self-citation gaming

Each grey-area action provides a modest productivity or reputation boost. Per-instance detection probability is low (~1–3%) but compounds across actions.

**Outright misconduct** (high per-instance risk):

- Data fabrication
- Data falsification
- Plagiarism

Larger boosts; per-instance detection probability ~5–15%, modified by visibility, co-author presence, and data-sharing.

#### Detection mechanics

Detection probability per turn for a misconduct-bearing paper:

```
P_detection_per_turn = base_rate
                     * visibility_multiplier         # high-visibility papers are scrutinised more
                     * coauthor_factor               # more co-authors = higher chance someone notices
                     * data_sharing_factor           # if data shared publicly, much higher risk
                     * time_since_publication_factor # rises then falls; spike around years 1-3
                     * whistleblower_factor          # mistreated students/RAs more likely to report
                     * data_sleuth_factor            # rare random scrutiny events
```

#### Consequences

When misconduct is detected on a paper:

- **Grey-area:** paper receives correction notice; small reputation hit (-5 to -10); citations on that paper down-weighted.
- **Outright (own work):** paper retracted; large reputation hit (-30 to -60 scaled by visibility); h-index drops; collaborators distance themselves; possible dismissal if at vulnerable career stage.
- **Outright (student's work the player supervised):** moderate reputation hit (-15 to -30); paper retracted; departmental scrutiny.

A retraction event surfaces on Retraction Watch (in-game flavour element). Multiple retractions can end the game with a "retracted" ending screen.

#### Required design constraints

- The system tracks misconduct per paper, not as a global player flag, so consequences scale to the specific work involved.
- The game presents misconduct as an available action without warnings or moral commentary; the consequence system carries the moral weight.
- Across many playthroughs, the expected value of a misconduct strategy should be negative or marginal, not positive. This is a calibration requirement for playtesting.

### 4.9 The cohort tracker

**Overview.** Three AI rivals run in parallel with the player. Their visible progress drives social comparison and is a major source of imposter-syndrome and motivation events.

#### Tracker display

The cohort tracker shows, for each player (human + rivals):

- Name and (optionally) avatar
- Current rank (undergraduate, MSc, etc.)
- Publication count (totals; not full bibliographies)
- h-index
- Major recent events ("Just published in *Psychological Science*", "Awarded a Veni", "Defended PhD")
- Current institution prestige indicator

#### Update timing

The tracker updates each turn after the rival phase. Major rival events also fire as news events to the player ("[Rival name] just published in *Nature Human Behaviour*"), with appropriate effects on imposter syndrome.

#### Visibility constraints

Rivals' detailed states (their wellbeing, their relationships, their misconduct) are **not visible** to the player. Only public outputs are visible. This is faithful to real academic life and is part of what makes the comparison painful.

### 4.10 Milestones and game-end conditions

**Overview.** Four explicit milestones structure the career arc. Each can be failed. The win condition is the first tenured offer in the cohort.

#### Milestones

| Milestone | Triggered when | Failure consequence |
|---|---|---|
| MSc thesis defence | End of MSc stage (turn ~5) | Extra term; possible dropout from MSc programme |
| PhD dissertation defence | End of PhD stage (turn ~13) | Extra 1-2 turns; possible no-defence ending |
| Assistant professor appointment | Successful job market run after postdoc (turn ~19) | Continue postdoc; eventually exit if no offer |
| Tenure decision | Tenure clock expires (turn ~25) | Tenure denied; exit |

Each milestone has a dedicated event (ceremony, celebration, or rejection screen). Successful milestones are recorded on the end-game CV with date.

#### Win condition

The first player (human or rival) to receive a tenured offer wins first place. Remaining players continue playing for second, third, and fourth place by accumulated record.

#### End conditions

The game ends when:

- All four players have either secured tenure, been definitively denied tenure, or exited academia (industry / alt-ac).
- Or: the cut-off date (~turn 25–28) is reached, in which case current standing determines final rankings.

#### End screens

Every ending produces a CV screen (§4.13) showing the player's final state. Players who finish second through fourth see "Tenured at [institution]: [winner]" and their own final position. Players who exit to industry see an alternative ending screen that frames the exit positively.

### 4.11 AI rivals

**Overview.** Three computer-controlled rivals run in parallel with the player. Each rival is a scripted stochastic archetype: deterministic strategy with weighted random choices, no runtime LLM.

#### Rival data model

```yaml
rival_id: unique_string
name: string                     # from name pool
gender: enum                     # randomised or balanced across rivals
archetype: enum                  # grinder, networker, gambler, scholar
sub_discipline: string           # one of the four; varied across rivals
state:                           # full game state, parallel to the player's
  funds: ...
  expertise: ...
  papers: ...
  health_conditions: ...
  ...
```

#### Archetypes

| Archetype | Behaviour | Strength | Weakness |
|---|---|---|---|
| **The grinder** | High time on writing and data collection; low on networking | High publication count | Low visibility; rarely top journals |
| **The networker** | High conferences, collaborations, politics | Many co-authorships; well-placed papers | Lower first-author output |
| **The gambler** | High-variance choices; risks misconduct; chases top journals | Spectacular when it works | High burnout / retraction risk |
| **The genuine scholar** | Slow, methodical, high-quality work | Strong long-term citation accrual | Slower early career; may miss tenure clock |

#### Rival decision-making

Each turn, each rival:

1. Determines available actions (same logic as player).
2. Computes a weighted score for each action based on archetype weights + small random perturbation.
3. Selects the top action(s) up to time budget.
4. Resolves outcomes with the same stochasticity as the player.

The implementation should be deterministic given a seed (for reproducible bug reports) and complete in under 500ms per rival turn.

#### Rival visibility

Rivals' internal state is not exposed to the player. The cohort tracker (§4.9) shows only their public outputs.

### 4.12 The campus / map

**Overview.** Actions are taken at locations. The map is the navigational metaphor inherited from the original *Jones in the Fast Lane*.

#### Locations

| Location | Actions enabled |
|---|---|
| Office | Writing, email, admin, grant applications |
| Lab | Data collection, experiments, participant testing |
| Library | Literature search, reading |
| Classroom | Teaching (as student or instructor) |
| Seminar room | Departmental talks, networking |
| Café / pub | Informal collaboration, gossip, morale |
| Home | Sleep, partner/family time, recovery |
| Conference venue | Travel-gated; networking, talks, job-market |
| Funder portal | Grant submissions (often "at office", but UI-distinct) |
| Gym / outdoors | Wellbeing maintenance |
| GP / therapist / occupational health | Health treatment |

#### Map behaviour

- Mobile: vertical list / scrollable panel of locations with icons.
- Desktop: pixel-art campus map with clickable locations.
- Both: tapping/clicking a location reveals available actions and their time/funds costs.

#### Ghost penalty

Players who never visit certain social locations (seminar room, café) accrue a small reputational penalty per turn. This is intentional: visibility matters in academia independently of output.

### 4.13 The end-of-game CV screen

**Overview.** The final summary of the player's career. Both an in-game artefact and the game's word-of-mouth marketing surface.

#### Layout

Formatted as a CV in the conventions of psychology. Left column (or top section on mobile):

- Final placement (1st, 2nd, 3rd, 4th, or exited)
- Name, final rank, current institution
- Publications: full list with journal, year, citations
- Grants: list with funder, amount, dates
- Awards
- Teaching record
- Service

Right column (or bottom section on mobile), in smaller print and labelled clearly (suggested: "what this took"):

- Relationships ended
- Hobbies abandoned
- Weeks spent on sick leave
- Chronic conditions acquired
- Cities lived in for less than two years
- Total sleep deficit accumulated (in nights)

#### Sharing

- "Share" button generates a PNG of the CV.
- Recommendation: PNG generated client-side (e.g. via HTML-to-canvas).
- Optional: sharable URL pointing to a regenerated CV view from a serialised state hash. This requires minimal serverless infrastructure (a free-tier Vercel / Cloudflare function) and is **optional for beta**. Default beta behaviour: download PNG, share manually.

---

## 5. UI and platform requirements

### 5.1 Platforms

- Modern desktop browsers (Chrome, Firefox, Safari, Edge) on Windows / macOS / Linux.
- Modern mobile browsers (Chrome / Safari) on iOS and Android.
- Responsive layout: single codebase, two layouts (mobile-first; desktop is mobile expanded, not a separate build).

### 5.2 Save and resume

- Saves on every turn end to local browser storage.
- One slot at beta (recommendation; can be extended later).
- Resume on page load if a save exists.
- Save format: JSON; the full game state serialises cleanly.
- "Reset / new game" option clears local save.

### 5.3 Visual style

Pixel art / retro. Cohesive 16-bit-era aesthetic with deliberate nods to *Jones in the Fast Lane*. Typography may be pixel font for headers and crisp sans-serif for body text (readable on mobile). Limited colour palette; high contrast.

### 5.4 Accessibility (minimum)

- Adequate colour contrast for text and meaningful UI elements.
- All colour-coded information also available via text label (relationship roles shown by role tag, not colour alone).
- Reasonable font sizing; respect browser zoom.
- Keyboard navigability for desktop.

### 5.5 Performance budgets

- Time to interactive: under 3 seconds on a mid-range smartphone over 4G.
- Total bundle size: under 5 MB for the beta (pixel art is light; the heaviest payload will be content YAML).
- Turn resolution (including all three rival turns): under 1 second.

### 5.6 Deployment

The beta is deployed as a static site on **GitHub Pages** from the repository `stuck-on-the-tenure-track`. This constrains implementation in the following ways:

- All assets, content, and code must be served from relative paths (no absolute URLs assuming a specific domain).
- No server-side anything: no Node.js runtime in production, no API endpoints, no backend database. All logic runs in the player's browser.
- No build secrets or API keys baked into the production bundle.
- If a build step is used (e.g. Vite, Rollup, esbuild for a framework-based build), it must produce static output suitable for GitHub Pages and the deployment should be automated via GitHub Actions on push to `main`. Alternatively, the project may be written in vanilla HTML/CSS/JS with no build step and served directly from `main`.
- The deployment URL will be `https://<username>.github.io/stuck-on-the-tenure-track/` by default, or a custom domain if configured by the developer.

### 5.7 Repository structure (recommendation)

```
/
  README.md                                          # public-facing description
  LICENSE                                            # MIT or similar
  CLAUDE.md                                          # Claude Code persistent instructions
  stuck-on-the-tenure-track-llm-reference.md         # this document (authoritative spec)
  stuck-on-the-tenure-track-overview.md              # short overview (context document)
  /src/                                              # source code
  /content/                                          # YAML content packs (see §2.3)
  /assets/                                           # pixel art, fonts, icons
  /public/                                           # static files served as-is (favicon, etc.)
  /.github/workflows/                                # GitHub Actions (if using a build step)
  index.html                                         # entry point
```

If a build step is used, built output goes to `/dist/` or a dedicated `gh-pages` branch, not committed to `main`. **No other feature branches are created during development.** Build-output branches generated by deployment workflows are the only exception to the "everything on `main`" rule (see house rule 6).

---

## 6. Content authoring guidance for the LLM

This section is for the LLM when generating event text, character names, or other content.

### 6.1 Voice

- Dry, specific, satirical.
- Real journal names, real funders, real conferences, real methods.
- Concrete situations preferred to abstract ones. "Reviewer 2 objects that your N is underpowered" beats "you receive negative feedback".
- No moralising, no warnings, no lessons. The game shows, does not tell.
- British spelling throughout: analyse, behaviour, organise, programme, defence.

### 6.2 Event text structure

A canonical event has:

```yaml
event_id: unique_string
trigger: condition expression    # when this event can fire
weight: integer                  # relative probability among eligible events
title: string                    # short headline shown to player
body: string                     # 1-3 sentences of flavour
choices:                         # 0-4 player options
  - label: string
    effects: {stat: change, ...}
    next_event_id: unique_string | null
```

### 6.3 Templated variation

Where useful, events use slot substitution:

```yaml
body: "Reviewer 2 complains about your {sample_size_complaint}."
slots:
  sample_size_complaint:
    - "underpowered N"
    - "lack of pre-registration"
    - "missing manipulation check"
    - "questionable choice of control condition"
    - "use of student samples"
```

This multiplies content variety without proportional writing cost.

### 6.4 Sub-discipline specificity (when authoring Layer-3 events)

A Layer-3 event should be one that **only makes sense for that sub-discipline**. Examples:

- *Cognitive:* "Your eye-tracker drift correction failed mid-session." Generic for cognitive; nonsensical for clinical or social.
- *Social:* "The high-profile failed replication of [adjacent finding] just hit Twitter." Hits social hardest because of replication-crisis history.
- *Clinical:* "Your participant didn't return for the 6-month follow-up." Specific to longitudinal clinical work.
- *Developmental:* "The preschool you were recruiting from has closed for summer." Recruitment-pipeline-specific.

If the event would make sense across all sub-disciplines, put it in Layer 2 (psychology) instead.

### 6.5 Real-name use

Use real journal, conference, and funder names. Avoid:

- Real living named academics (legal risk; outdated risk).
- Real institutions named in ways that are insulting or libellous (generic "your institution" is safer than "Stanford specifically").
- Real students or RAs by name; use generated names from the name pool.

### 6.6 Name pool requirements

Character names (rivals, supervisors, collaborators) should be:

- Culturally varied (reflecting an international academic environment).
- Gender-balanced.
- Spelled in original-script-friendly Latin transliteration where applicable.
- Available in the name pool YAML as separate first/last lists.

---

## 7. Save schema

**Overview.** The complete game state, serialisable to JSON.

```yaml
save_version: integer            # schema version for forward compatibility
game_seed: string                # for reproducibility
created_at: ISO datetime
last_played_at: ISO datetime

calendar:
  current_date: ISO date
  turn_number: integer
  start_date: ISO date

settings:
  spelling: string               # "en-GB"
  light_narrative_mode: boolean  # for health-event tone

player:
  name: string
  gender: string
  broad_discipline: string       # "psychology" in beta
  funds: {personal: integer, research: integer}
  wellbeing: {sleep: integer, mood: integer, physical: integer}
  expertise: {methods, theory, writing, statistics, teaching, politics: integer}
  standing: {rank: enum, reputation: integer, affiliation_prestige: integer}
  specialisation:
    status: enum
    current_sub_discipline: string | null
    commitment_turn: integer | null
  imposter_state:
    perceived_competence: integer
    actual_competence: integer
  health_conditions: [health_condition objects]
  papers: [paper objects]
  grants_held: [grant objects]
  grants_applied: [application objects]
  relationships: [npc objects]
  milestones_completed: [milestone records]

rivals: [rival objects]          # each contains a parallel state

events_history: [event records]  # for traceability and end-game summary
```

Full sub-object schemas are specified in the relevant per-system sections above.

---

## 8. Glossary of key terms

- **Term:** approximately 3 months. One turn in the game.
- **Time points (TP):** the abstract unit of effort the player allocates per turn. Typically 100 TP per term as a baseline.
- **Broad discipline:** top-level field (psychology, biology, etc.); the player's overall academic identity.
- **Sub-discipline:** specialisation within a broad discipline (cognitive, social, etc.); committed during the PhD.
- **Cohort:** the player and three rivals from the same shared high-school class.
- **Tenure:** the win condition. A permanent academic position at the assistant professor or higher rank.
- **Ghost penalty:** reputational cost from not appearing at department-visibility events.
- **Layer 1 / 2 / 3:** the three-layer content hierarchy (universal / broad discipline / sub-discipline).

---

## 9. Out of scope for the beta

For clarity, the following are explicitly out of scope at beta and should not be implemented unless the developer instructs otherwise:

- Multiplayer (hot-seat or online).
- Broad disciplines other than psychology.
- Sub-disciplines other than the four named.
- Country / jurisdiction other than Dutch / EU.
- Runtime LLM integration.
- Account systems, cloud sync, server-side state.
- Localisation (translations).
- Mobile app (the game is browser-only).
- A linked back-end for global leaderboards or community features.
- Advanced character creation beyond name, gender, and broad discipline.
- Post-tenure gameplay.

When in doubt, the LLM should implement the minimum compatible with this specification and surface the choice to the developer.
