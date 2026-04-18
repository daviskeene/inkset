import type { ShaderInstance, ShaderPreset, ShaderToken } from "../types";

type BleedParticle = {
  x: number;
  y: number;
  width: number;
  height: number;
  bornAt: number;
  lifetimeMs: number;
  delayMs: number;
  tint: string;
};

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

const clamp01 = (value: number): number =>
  value < 0 ? 0 : value > 1 ? 1 : value;

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

export const inkBleedShader: ShaderPreset = {
  name: "ink-bleed",
  async init(_container, { canvas, dpr, options }): Promise<ShaderInstance> {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas unavailable for ink-bleed shader.");
    }

    const tint = readString(options, "tint", "216, 161, 64");
    const maxAlpha = clamp01(readNumber(options, "alpha", 0.18));
    const minLifetimeMs = Math.max(120, readNumber(options, "minLifetimeMs", 420));
    const lifetimeScale = Math.max(0.2, readNumber(options, "lifetimeScale", 1.35));
    const blurStartPx = Math.max(0, readNumber(options, "blurStartPx", 6));
    const blurEndPx = Math.max(blurStartPx, readNumber(options, "blurEndPx", 20));
    const spreadXStart = Math.max(0.2, readNumber(options, "spreadXStart", 0.8));
    const spreadXEnd = Math.max(spreadXStart, readNumber(options, "spreadXEnd", 1.25));
    const spreadYStart = Math.max(0.2, readNumber(options, "spreadYStart", 0.88));
    const spreadYEnd = Math.max(spreadYStart, readNumber(options, "spreadYEnd", 1.14));

    const particles: BleedParticle[] = [];
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

      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        const elapsed = t - particle.bornAt - particle.delayMs;
        if (elapsed < 0) continue;

        const progress = clamp01(elapsed / particle.lifetimeMs);
        if (progress >= 1) {
          particles.splice(i, 1);
          continue;
        }

        const eased = 1 - (1 - progress) * (1 - progress);
        const fade = 1 - progress;
        const spreadX = spreadXStart + eased * (spreadXEnd - spreadXStart);
        const spreadY = spreadYStart + eased * (spreadYEnd - spreadYStart);
        const blurPx = blurStartPx + eased * (blurEndPx - blurStartPx);
        const alpha = maxAlpha * fade;

        ctx.save();
        ctx.translate(particle.x + particle.width / 2, particle.y + particle.height * 0.58);
        ctx.scale(spreadX, spreadY);
        ctx.filter = `blur(${blurPx}px)`;
        ctx.fillStyle = particle.tint.replace("__ALPHA__", alpha.toFixed(3));
        ctx.beginPath();
        ctx.roundRect(
          -particle.width * 0.64,
          -particle.height * 0.34,
          particle.width * 1.28,
          particle.height * 0.68,
          Math.max(particle.height * 0.34, 8),
        );
        ctx.fill();
        ctx.restore();
      }

      if (particles.length > 0) {
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
          if (token.width <= 0 || token.height <= 0) continue;
          particles.push({
            x: token.x,
            y: token.y,
            width: token.width,
            height: token.height,
            bornAt: now(),
            lifetimeMs: Math.max(token.durationMs * lifetimeScale, minLifetimeMs),
            delayMs: token.delayMs,
            tint: `rgba(${tint}, __ALPHA__)`,
          });
        }
        if (particles.length > 0) {
          ensureFrame();
        }
      },
      dispose() {
        disposed = true;
        particles.length = 0;
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
