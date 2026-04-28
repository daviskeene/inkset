# @inkset/react

## 0.1.4

### Patch Changes

- Render semantic inline math nodes from `@inkset/core` and add a `linkAttrs` hook for Markdown anchors.
- Updated dependencies
  - @inkset/core@0.1.3
  - @inkset/animate@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.2
  - @inkset/animate@0.1.3

## 0.1.2

### Patch Changes

- Patch release for the latest playground and package updates.
  - `@inkset/react` adds the `cacheSize` prop and improves reveal/shader overlay behavior for long transcripts and dither-style reveals.
  - `@inkset/animate` adds the `ink-dither` built-in shader while preserving `ink-bleed` as a backward-compatible alias.
  - `@inkset/diagram` notifies Inkset when Mermaid content has settled so frozen block layout can update cleanly.

- Updated dependencies
  - @inkset/animate@0.1.2

## 0.1.1

### Patch Changes

- cbea9ce: Initial maintenance release following the first successful publish of 0.1.0. No runtime changes — this bump exists so the registry has a version superseding the rushed 0.1.0 slot from the CI debug cycle.
- Updated dependencies [cbea9ce]
  - @inkset/core@0.1.1
  - @inkset/animate@0.1.1
