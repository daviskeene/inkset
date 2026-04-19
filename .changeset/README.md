# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to version and publish packages.

## Common commands

```bash
pnpm changeset
pnpm version-packages
pnpm release
```

## Typical release flow

1. Add a changeset describing the public-facing package changes.
2. Merge the generated version PR from the Changesets GitHub Action.
3. Let the release workflow publish the updated packages to npm.
