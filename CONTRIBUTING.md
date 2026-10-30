# Contributing to Inkset

Inkset is still early, and the project is moving quickly. Contributions are welcome, but it helps a lot to keep the changes focused and easy to review.

## Before you start

- For larger features, API changes, or new plugins, open an issue or discussion first so we can make sure the direction makes sense.
- Small fixes are great to send directly: bug fixes, docs improvements, test coverage, and targeted polish.

## Local setup

```bash
pnpm install
pnpm --filter @inkset/playground dev
```

Useful commands:

```bash
pnpm test
pnpm lint
pnpm format
pnpm typecheck
```

## What to keep in sync

- If you change public APIs, update the relevant README and docs pages in `apps/playground/src/content/docs`.
- If you touch streaming, layout, measurement, or plugins, add or update tests close to the package you changed.
- Keep changes scoped. Small, clear pull requests are much easier to land than broad refactors.

## Repo shape

- `packages/core` contains the pipeline: ingest, parse, transform, measure, and layout.
- `packages/react` contains the main React renderer and hook.
- `packages/*` contains optional plugins like code, math, tables, diagrams, and animation helpers.
- `apps/playground` is the docs site, playground, and the easiest way to test user-facing behavior.

## Style

- Use `pnpm format` before sending changes.
- Match the existing code style and avoid broad unrelated cleanup.
- Prefer clear behavior and good docs over clever abstractions.

## Releases

- Package publishing and release versioning are maintainer-managed.
- Do not add release changes or version bumps unless the change specifically asks for them.
