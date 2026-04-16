// Ambient declarations for Bram Stein's Hypher + hyphenation.en-us, which ship
// without type definitions. Referenced via triple-slash from hyphenate.ts so
// consumers that resolve @inkset/core to source (playground) still see these.
declare module "hypher" {
  type HyphenPatterns = {
    id: string[];
    leftmin: number;
    rightmin: number;
    patterns: Record<string, string>;
    exceptions?: string;
  };

  class Hypher {
    constructor(patterns: HyphenPatterns);
    hyphenate(word: string): string[];
    hyphenateText(text: string, minLength?: number): string;
  }

  export default Hypher;
}

declare module "hyphenation.en-us" {
  const patterns: {
    id: string[];
    leftmin: number;
    rightmin: number;
    patterns: Record<string, string>;
    exceptions?: string;
  };
  export default patterns;
}
