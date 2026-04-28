# @inkset/math

## 0.1.3

### Patch Changes

- Updated dependencies
  - @inkset/core@0.1.3

## 0.1.2

### Patch Changes

- Support bare `\begin{env}...\end{env}` math blocks without `$$` wrapping, strip KaTeX-unsupported `\label{...}`, and resolve `\eqref{...}` cross-references to the matching equation tag.
  - `splitBlocks` tracks LaTeX env depth so nested `\begin{equation}\begin{aligned}...\end{aligned}\end{equation}` stays in a single block across blank lines.
  - `detectBlockType` recognizes common AMS envs (`equation`, `align`, `gather`, `multline`, `cases`, matrix variants, etc.) as `math-display`.
  - `parseBlock` bypasses remark for math blocks so CommonMark escape handling no longer collapses `\\` → `\`.
  - `repair()` resolves `\eqref{name}` by scanning `\label` + `\tag{N}` (or an auto-incremented counter for numbered envs). Short-circuits on docs without `\eqref{`.
  - Math plugin strips `\label{...}` and replaces unresolved `\eqref{...}` with `(?)` before handing LaTeX to KaTeX.

- Updated dependencies
  - @inkset/core@0.1.2

## 0.1.1

### Patch Changes

- cbea9ce: Initial maintenance release following the first successful publish of 0.1.0. No runtime changes — this bump exists so the registry has a version superseding the rushed 0.1.0 slot from the CI debug cycle.
- Updated dependencies [cbea9ce]
  - @inkset/core@0.1.1
