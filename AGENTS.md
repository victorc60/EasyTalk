# EasyTalks — Agent Instructions

EasyTalks is a Telegram-based universal language-learning platform.

## Product scope

Supported learning languages currently planned:
- English
- Italian
- German

Core learning features include:
- Telegram bot onboarding and language selection
- CEFR-based levels
- vocabulary learning
- quizzes and mini-games
- idioms and phrasal verbs where appropriate to the target language
- contextual exercises
- AI conversation practice
- correction and explanation of learner mistakes
- spaced repetition
- streaks, XP and progress tracking

## Engineering principles

1. Inspect the existing architecture before making changes.
2. Do not break existing Telegram bot functionality.
3. Keep language-learning content separate from application/business logic.
4. Use one reusable architecture for English, Italian and German instead of duplicating application logic per language.
5. Prefer small, reviewable changes over large rewrites.
6. Preserve existing user data and behavior unless a task explicitly requires a migration or behavior change.
7. Never hard-code or expose Telegram tokens, OpenAI API keys, database credentials, or other secrets. Use environment variables.
8. Before changing the database schema, inspect the current schema/migrations and consider backward compatibility.
9. Add or update tests for important behavior whenever practical.
10. Run the relevant tests/checks before considering a task complete.
11. Do not silently fix unrelated technical debt; report it separately.
12. When uncertain about a product decision that could materially change user behavior, preserve current behavior and explain the decision needed.

## Critical user flows to protect

- /start
- user registration/onboarding
- language selection
- level selection
- main menu/navigation
- starting and completing learning games
- answering questions and recording correct/incorrect answers
- XP/streak/progress updates
- vocabulary/review scheduling
- AI conversation practice
- OpenAI error/timeout handling

## AI learning behavior

The AI tutor should help users communicate rather than merely grade them. Corrections should be useful, concise and appropriate to the learner's level. Exercises and vocabulary should favor practical, high-frequency language and real contexts.

## Before completing any coding task

1. Inspect the relevant files and existing implementation.
2. Identify affected user flows.
3. Implement the smallest maintainable solution.
4. Run available tests, linting and type/static checks relevant to the change.
5. Add tests where the change introduces important behavior.
6. Check for regressions in critical flows.
7. Summarize what changed, what was tested, and any remaining risks.

## Git workflow

For substantial or risky work, prefer a dedicated branch and pull request rather than making broad changes directly on `main`. Do not automatically merge risky changes into production without review.
