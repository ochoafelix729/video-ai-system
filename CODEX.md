# GUIDELINES TO FOLLOW FOR EVERY TASK:

## Before Editing Code

Start the virtual environment and install dependencies listed on requirements.txt.

Never assume architecture that can be discovered from the repository.

For non-trivial changes, create a plan before modifying code.

## Scope

Implement only the requested task.

Do not:
- add unrelated features
- refactor unrelated code
- rename unrelated types
- reorganize the project without need
- introduce speculative abstractions
- introduce dependencies without justification
- change public interfaces unnecessarily

Prefer the smallest *coherent* change that fully solves the task.

## Existing Patterns

Before introducing a new pattern, search the repository for an existing
solution to the same kind of problem.

Prefer consistency with the existing codebase over inventing a new pattern.

## Data Model Changes

Treat persistent data model changes as high-impact changes.

Before changing persistent schemas:

- determine migration implications
- preserve existing user data where applicable
- document the decision

Do not casually rename or delete persisted fields.

## Security

Never:

- commit secrets
- hardcode API keys
- log authentication tokens
- log sensitive financial information
- store passwords for third-party services

Use platform-standard secure storage where credentials or tokens are needed.

## UI Design

Follow existing design patterns.

Do not redesign unrelated features while implementing a new feature.

## Error Handling

Never silently swallow errors.

Errors should either:

- be handled,
- be presented appropriately,
- or be propagated to a layer capable of handling them.

## Comments

Prefer self-documenting code.

Comments should explain WHY, not restate WHAT the code does.

## Coding Conventions

- Use Python 3.12+ with type hints for the API and worker. Prefer top-down, module-oriented code with small, composable functions; use classes only for cohesive stateful concerns such as API clients, storage adapters, or long-lived job context. Keep route handlers thin and place ingestion, indexing, and retrieval logic in focused modules.
- Use TypeScript with `strict` enabled for the Manifest V3 extension. Keep content scripts, the service worker, side-panel UI, and YouTube-player integration in separate modules.
- For JavaScript and TypeScript, optimize for straightforward reading over terseness:
  - Use two-space indentation, semicolons, double-quoted strings, and trailing commas where the formatter supports them.
  - Prefer small, single-purpose functions with descriptive verb-first names such as `getVideoContext` or `openTutorPanel`.
  - Use guard clauses to handle invalid or missing input early; avoid deeply nested conditionals.
  - Give complex values explicit types at module boundaries, especially extension messages and API payloads. Keep `unknown` values narrowed before use; do not use `any` unless a library requires it.
  - Keep one logical operation per statement. Do not combine assignment, branching, side effects, and error handling into dense expressions.
  - Prefer `const`; use `let` only when reassignment makes the changing state clearer. Never use `var`.
  - Keep event handlers and promise chains short by delegating work to named functions. Handle expected failures close to the operation and show users an actionable message when appropriate.
  - Avoid abbreviations, unexplained magic values, and clever abstractions. Extract named constants only when they communicate meaning or are reused.
- Define request, response, job-status, and evidence-timestamp schemas once; validate untrusted API and extension messages at their boundary.
- Use `snake_case` for Python modules, functions, and variables; use `camelCase` for TypeScript values and `PascalCase` for types, classes, and UI components.
- Treat timestamps internally as numeric seconds and serialize them consistently. Include source/evidence metadata with retrieved segments rather than embedding it only in prose.
- Keep configuration in environment variables, provide an `.env.example` without values, and never expose backend credentials to content scripts.
- Format and lint code with the project's configured tools; add focused tests for changed behavior, especially API contracts, indexing state transitions, and player-seek interactions.
