import type { ShaderInstance, ShaderPreset, ShaderToken } from "../types";

type DitherBurst = {
  x: number;
  y: number;
  width: number;
  height: number;
  bornAt: number;
  lifetimeMs: number;
  delayMs: number;
  tickId: number;
  tokenIndex: number;
};

const BAYER_4X4 = [
  0 / 16,
  8 / 16,
  2 / 16,
  10 / 16,
  12 / 16,
  4 / 16,
  14 / 16,
  6 / 16,
  3 / 16,
  11 / 16,
  1 / 16,
  9 / 16,
  15 / 16,
  7 / 16,
  13 / 16,
  5 / 16,
];

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

const smooth01 = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

const hash = (seed: number): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453123;
  return x - Math.floor(x);
};

const readNumber = (
  options: Record<string, unknown> | undefined,
  key: string,
  fallback: number,
): number => {
  const value = options?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const readString = (
  options: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string => {
  const value = options?.[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
};

export const inkDitherShader: ShaderPreset = {
  name: "ink-dither",
  async init(_container, { canvas, dpr, options }): Promise<ShaderInstance> {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas unavailable for ink-dither shader.");
    }

    const tint = readString(options, "tint", "116, 228, 255");
    const fogTint = readString(options, "fogTint", tint);
    const maxDotAlpha = clamp01(readNumber(options, "alpha", 0.18));
    const fogAlpha = clamp01(readNumber(options, "fogAlpha", 0.055));
    const minLifetimeMs = Math.max(120, readNumber(options, "minLifetimeMs", 420));
    const lifetimeScale = Math.max(0.2, readNumber(options, "lifetimeScale", 1.15));
    const gridSize = Math.max(2, readNumber(options, "gridSize", 4));
    const dotMinSize = Math.max(1, readNumber(options, "dotMinSize", 1.2));
    const dotMaxSize = Math.max(dotMinSize, readNumber(options, "dotMaxSize", 2.6));
    const blurStartPx = Math.max(0, readNumber(options, "blurStartPx", 6));
    const blurEndPx = Math.max(0, readNumber(options, "blurEndPx", 1));
    const jitterPx = Math.max(0, readNumber(options, "jitterPx", 0.7));
    const expandX = Math.max(0, readNumber(options, "expandX", 5));
    const expandY = Math.max(0, readNumber(options, "expandY", 3));
    const bandTop = clamp01(readNumber(options, "bandTop", 0));
    const bandHeight = Math.max(0.1, Math.min(1, readNumber(options, "bandHeight", 1)));

    const bursts: DitherBurst[] = [];
    let frameId: number | null = null;
    let disposed = false;

    const ensureFrame = () => {
      if (frameId == null) {
        frameId = window.requestAnimationFrame(render);
      }
    };

    const render = () => {
      frameId = null;
      if (disposed) return;

      const scale = dpr > 0 ? dpr : 1;
      const cssWidth = canvas.width / scale;
      const cssHeight = canvas.height / scale;
      const t = now();

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      for (let i = bursts.length - 1; i >= 0; i -= 1) {
        const burst = bursts[i];
        const elapsed = t - burst.bornAt - burst.delayMs;
        if (elapsed < 0) continue;

        const progress = clamp01(elapsed / burst.lifetimeMs);
        if (progress >= 1) {
          bursts.splice(i, 1);
          continue;
        }

        const hold = progress < 0.5 ? progress * 0.28 : 0.14 + ((progress - 0.5) / 0.5) * 0.86;
        const settle = smooth01(hold);
        const fade = 1 - settle;
        const blurPx = blurStartPx + settle * (blurEndPx - blurStartPx);
        const padX = expandX * (0.7 + fade * 0.3);
        const padY = expandY * (0.7 + fade * 0.3);
        const left = burst.x - padX;
        const bandY = burst.y + burst.height * bandTop;
        const bandBoxHeight = burst.height * bandHeight;
        const top = bandY - padY * 0.6;
        const width = burst.width + padX * 2;
        const height = bandBoxHeight + padY * 2;

        if (fogAlpha > 0) {
          ctx.save();
          ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
          ctx.fillStyle = `rgba(${fogTint}, ${(fogAlpha * fade).toFixed(3)})`;
          ctx.fillRect(left, top, width, height);
          ctx.restore();
        }

        const coverage = clamp01(0.96 - settle * 1.26);
        if (coverage <= 0) continue;

        const cols = Math.max(1, Math.ceil(width / gridSize));
        const rows = Math.max(1, Math.ceil(height / gridSize));

        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const bayer = BAYER_4X4[(row & 3) * 4 + (col & 3)];
            const seed = burst.tickId * 4099 + burst.tokenIndex * 131 + row * 41 + col * 17;
            const noise = hash(seed);
            const threshold = bayer * 0.62 + noise * 0.38;
            if (threshold > coverage) continue;

            const localFade = 0.72 + noise * 0.34;
            const size =
              dotMinSize + (dotMaxSize - dotMinSize) * (0.34 + noise * 0.56) * (0.72 + fade * 0.42);
            const jitterScale = jitterPx * (0.3 + fade * 0.7);
            const jitterX = (hash(seed + 1) - 0.5) * jitterScale;
            const jitterY = (hash(seed + 2) - 0.5) * jitterScale;
            const alpha = maxDotAlpha * fade * localFade;

            ctx.fillStyle = `rgba(${tint}, ${alpha.toFixed(3)})`;
            ctx.fillRect(
              left + col * gridSize + jitterX,
              top + row * gridSize + jitterY,
              size,
              size,
            );
          }
        }
      }

      if (bursts.length > 0) {
        ensureFrame();
      }
    };

    return {
      emit(tokens: ShaderToken[]) {
        for (const token of tokens) {
          if (token.width <= 0 || token.height <= 0) continue;
          bursts.push({
            x: token.x,
            y: token.y,
            width: token.width,
            height: token.height,
            bornAt: now(),
            lifetimeMs: Math.max(token.durationMs * lifetimeScale, minLifetimeMs),
            delayMs: token.delayMs,
            tickId: token.tickId,
            tokenIndex: token.tokenIndex,
          });
        }

        if (bursts.length > 0) {
          ensureFrame();
        }
      },
      dispose() {
        disposed = true;
        bursts.length = 0;
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
