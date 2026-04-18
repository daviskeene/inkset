import type { ShaderInstance, ShaderPreset, ShaderToken } from "../types";

type Speck = {
  x: number;
  y: number;
  size: number;
  driftX: number;
  driftY: number;
  bornAt: number;
  lifetimeMs: number;
  delayMs: number;
};

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

const hash = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export const dissolveShader: ShaderPreset = {
  name: "dissolve",
  async init(_container, { canvas, dpr }): Promise<ShaderInstance> {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas unavailable for dissolve shader.");
    }

    const specks: Speck[] = [];
    let frameId: number | null = null;
    let disposed = false;

    const render = () => {
      frameId = null;
      if (disposed) return;

      const scale = dpr > 0 ? dpr : 1;
      const cssWidth = canvas.width / scale;
      const cssHeight = canvas.height / scale;
      const t = now();

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      for (let i = specks.length - 1; i >= 0; i -= 1) {
        const speck = specks[i];
        const elapsed = t - speck.bornAt - speck.delayMs;
        if (elapsed < 0) continue;

        const progress = clamp01(elapsed / speck.lifetimeMs);
        if (progress >= 1) {
          specks.splice(i, 1);
          continue;
        }

        const fade = 1 - progress;
        ctx.fillStyle = `rgba(184, 192, 214, ${(0.2 * fade).toFixed(3)})`;
        ctx.fillRect(
          speck.x + speck.driftX * progress,
          speck.y + speck.driftY * progress,
          speck.size,
          speck.size,
        );
      }

      if (specks.length > 0) {
        frameId = window.requestAnimationFrame(render);
      }
    };

    const ensureFrame = () => {
      if (frameId == null) {
        frameId = window.requestAnimationFrame(render);
      }
    };

    return {
      emit(tokens: ShaderToken[]) {
        for (const token of tokens) {
          const count = Math.min(12, Math.max(4, Math.round(token.width / 14)));
          for (let i = 0; i < count; i += 1) {
            const seed = token.tickId * 997 + token.tokenIndex * 101 + i * 17;
            specks.push({
              x: token.x + hash(seed) * Math.max(token.width - 3, 1),
              y: token.y + hash(seed + 1) * Math.max(token.height - 3, 1),
              size: 1.5 + hash(seed + 2) * 2.5,
              driftX: (hash(seed + 3) - 0.5) * 12,
              driftY: -8 - hash(seed + 4) * 10,
              bornAt: now(),
              lifetimeMs: Math.max(token.durationMs * 1.1, 320),
              delayMs: token.delayMs,
            });
          }
        }
        if (specks.length > 0) {
          ensureFrame();
        }
      },
      dispose() {
        disposed = true;
        specks.length = 0;
        if (frameId != null) {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
        const scale = dpr > 0 ? dpr : 1;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, canvas.width / scale, canvas.height / scale);
      },
    };
  },
};
