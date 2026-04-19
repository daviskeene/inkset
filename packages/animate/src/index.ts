// Public API for @inkset/animate.
//
// Phase 1 exports: token throttling + delta-aware text wrapping. The React
// integration lives in @inkset/react and consumes these primitives via the
// `reveal` prop on <Inkset>.

export { createTokenGate } from "./gate";
export type { TokenGate, CreateTokenGateOptions } from "./gate";

export { wrapBlockDelta, splitByWord, splitByChar } from "./wrap";
export type { WrapOptions, WrapResult } from "./wrap";
export { createShaderRegistry, defaultShaderRegistry, resolveShaderSource } from "./shader";

export type {
  ChunkingMode,
  ThrottleOptions,
  TimelineOptions,
  CssRevealOptions,
  CssRevealPreset,
  StaggerOrder,
  ShaderOptions,
  ShaderToken,
  ShaderInitOptions,
  ShaderInstance,
  ShaderPreset,
  ShaderLoader,
  ShaderSource,
  ShaderConfig,
  ShaderRegistry,
  RevealProp,
  RevealComponent,
  RevealComponentProps,
  TokenEmitter,
} from "./types";
