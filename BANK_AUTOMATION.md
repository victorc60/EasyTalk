# Automatic bank maintenance

## Runtime

The existing bank lifecycle service now performs maintenance at startup and daily
at 03:00 Europe/Chisinau. It refills the existing English word, idiom, phrasal-verb,
quiz and Saturday-question banks when remaining stock falls below 30. Each bank
can attempt at most one batch of 10 per local date, including failed attempts.
Repeated admin commands and restarts cannot allocate another batch for that date.
Low stock is topped up in batches (up to 10), rather than requesting just one
item when 29 remain. BANK_TARGET_REMAINING bounds the post-refill stock; it is
not a promise to reach that count in a single run.
No computer or open chat is required; the Railway process executes the schedule.

New content lives in generated_bank_items in MySQL. JSON files remain seed banks.
Daily content is inserted into the existing content_queue in the same transaction;
new words and expressions also enter learning_items. No deployed question or seed
file is overwritten.

The English, Italian and German learning catalogs are also maintained. Each
language gets at most one batch per local date, across all CEFR levels A1–B2.
The least-stocked level is selected. Stock means unique active expressions
minus the largest number already seen by any one learner at that level.
With no learning history this builds a base reserve; as learners progress it
adds fresh content. Duplicate source rows and inactive items do not inflate
stock. A learner's review schedule and progress are never reset.

Catalog items include target-language examples and Russian translations of both
text and example. They pass the same separate generation/review pipeline and
are saved atomically into generated_bank_items and learning_items. The catalog
reader sees them immediately. Italian/German entries never enter English games.
No database schema change is required beyond the existing bank migrations.

Generation and independent review each have a 45-second timeout, no SDK retries,
and a maximum of 4,000 output tokens. There are at most 16 requests per day by
default (18 with fact generation enabled; 10 with catalog generation disabled). The duplicate context is capped at 200
items and 12,000 characters. These are usage caps, not a guaranteed currency budget;
cost also depends on input tokens and selected models.

## Quality and failures

Candidates must pass local schema checks and normalized-text duplicate detection.
Only an explicit boolean approval by the second model call allows publication.
Missing, duplicated or malformed review decisions reject the affected candidate.
Candidates/reviews are recorded in the maintenance run, and publication is atomic.
Semantic and factual accuracy cannot be guaranteed by AI review. Fact generation
is disabled by default; existing unused facts remain available, but are never recycled.

Failed or interrupted runs are not retried on the same date. The next day's run
checks supply again. A processing row left after a restart needs investigation;
do not delete run records to retry, as that bypasses usage limits. A failed bank
does not prevent processing of the other banks. Existing content remains usable.

## Saturday preparation

From Thursday, maintenance fixes the upcoming Saturday's 10 questions plus up to
10 reserve questions in mini_event_plans. Only unused question texts are eligible,
even when a reupload changes their IDs. Plans and legacy history exclude previous
questions. If fewer than 10 unused valid questions remain, preparation fails
visibly instead of repeating old content. Reserve size is included in the report.

The selected question snapshots are immutable. The invitation uses this plan and
questions are resolved from it even after restart. Existing live events retain
their IDs and can still resolve legacy questions. Missing legacy event content
is an error, never a reason to silently replace active questions. Reserve questions
are for operational recovery; they do not silently replace questions mid-game.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| BANK_AUTOFILL_ENABLED | true | false disables AI generation |
| BANK_AUTOFILL_CATALOGS | true | false disables English/Italian/German catalog generation |
| BANK_AUTOFILL_FACTS | false | Explicit opt-in to reviewed AI facts |
| BANK_AUTOFILL_BATCH_SIZE | 10 | Positive integer, capped at 10 |
| BANK_MIN_REMAINING | 30 | Stock threshold, capped at 90 |
| BANK_TARGET_REMAINING | 60 | Refill ceiling, at least BANK_MIN_REMAINING and capped at 90 |
| BANK_GENERATION_MODEL | OPENAI_MODEL or gpt-4o-mini | Generation model |
| BANK_REVIEW_MODEL | OPENAI_MODEL or gpt-4o-mini | Review model |

The existing OPENAI_API_KEY is used. A missing key skips generation and appears
in the report. Disabling generation does not disable preparation from existing
content or normal games.

## Operations and rollout

- npm run bank:audit: read-only coverage report; no AI requests or plan writes.
- npm run bank:maintain: perform maintenance, including real OpenAI requests.
- npm test: local checks with mocked OpenAI and database; no production access.
- Apply database/migrations/002_bank_automation.sql before starting with
  DB_SYNC_MODE=off, together with 003_content_identities.sql. Default safe sync creates the four new tables; no existing
  schema or user data needs rewriting. Do not use force/alter.
- Test against isolated MySQL before production; unit tests do not establish
  actual database locking guarantees. Never launch a second polling production bot.
- Back up the new tables together with the existing MySQL database. Old code
  cannot resolve generated Saturday question IDs; before rollback complete the
  active event or retain the new plan reader. Do not drop the tables on rollback.

Inspect failed or interrupted work:

```sql
SELECT bank, date, status, result, updated_at
FROM bank_maintenance_runs
ORDER BY date DESC, bank;
```

The existing Saturday invitation timetable, participant scoring and reward rules
are unchanged by this maintenance feature.

## Content refresh 2026-09-14

The versioned manifest in content/releases/2026-09-14.json lists 127 new entries:
30 words, 15 idioms, 20 phrasal verbs, 20 quizzes, 12 facts and 30 Saturday questions.
Docker bootstrap appends missing texts to the mounted banks, preserving existing
IDs, answers, usage flags and custom content. Invalid JSON fails closed instead
of replacing a live bank. Repeated deployment is idempotent.

Startup synchronizes all five queues, not only empty queues. Existing queue rows
are immutable; new IDs derive from normalized text. content_identities persists
canonical fingerprints and consumption independently of mutable queue flags.
History is backfilled from used rows, daily_log, legacy daily sessions/word games
and JSON histories. Scheduled and legacy game selection share this guard.
An exhausted bank returns no new question; it never clears history automatically.

Back up content_identities along with content_queue, daily_log, mini_event_day,
mini_event_plans, generated_bank_items and the mounted data directory. Lost or
deleted historical records cannot be reconstructed from current seed files.
Text normalization catches formatting/ID changes, not semantic paraphrases.
Deliberate spaced-repetition learning exercises are unaffected.

Do not delete queues or truncate history to import new content. Use startup or
`npm run queue:sync`; `-- --dry-run` reports missing texts without mutations.
Real MySQL and OpenAI integration checks still require an isolated environment.

## September 21 continuation

The last main commit inspected before this change was b612402. GitHub reported
its Railway deployment as failed; a working production rollout was not verified.
Check the first failing Railway Deploy Log before claiming the feature is live.
Do not reset bank tables, queue flags, volumes or history to recover a deployment.

Legacy daily game generators now also read content_queue, so database-generated
content remains available after JSON seeds are exhausted. Queue consumption and
canonical history updates share a transaction and the scheduled delivery lock
order. The seed-file fallback preserves its existing no-repeat guard.

Rollout verification:

1. Back up the existing database and volume, and inspect the Railway startup error.
2. Apply the previously documented bank migrations if DB_SYNC_MODE=off.
3. Run npm run bank:audit in the deployed environment. This command is read-only;
   it must show all six game banks plus learning_en, learning_it and learning_de.
4. After a successful deployment, inspect the startup maintenance report or run
   npm run bank:maintain once. This makes real, bounded AI requests. In Telegram,
   /bank_audit also performs maintenance; unlike the CLI audit it is not read-only.
5. Confirm published counts, learning_items languages and CEFR levels, and that
   a second run on the same date reports already_attempted_today or stock_ok.
6. Confirm the 03:00 Europe/Chisinau report on the next date. If a bank fails,
   inspect bank_maintenance_runs.result; do not delete the row to retry that day.

New automated tests use mocked OpenAI and database methods. They establish
language isolation, per-language daily limits, stock selection, atomic-operation
boundaries, duplicate rejection and access from legacy games. They do not verify
real model quality, MySQL locking or the Railway environment.
