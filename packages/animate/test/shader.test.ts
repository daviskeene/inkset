import { describe, expect, it } from "vitest";
import {
  createShaderRegistry,
  defaultShaderRegistry,
  resolveShaderSource,
  type ShaderPreset,
} from "../src/index";

describe("shader registry", () => {
  it("pre-registers the built-in shader presets", async () => {
    expect(defaultShaderRegistry.has("ink-dither")).toBe(true);
    expect(defaultShaderRegistry.has("ink-bleed")).toBe(true);
    expect(defaultShaderRegistry.has("dissolve")).toBe(true);

    const dither = await defaultShaderRegistry.load("ink-dither");
    const bleed = await defaultShaderRegistry.load("ink-bleed");
    const dissolve = await defaultShaderRegistry.load("dissolve");

    expect(dither?.name).toBe("ink-dither");
    expect(bleed?.name).toBe("ink-dither");
    expect(dissolve?.name).toBe("dissolve");
  });

  it("loads consumer-registered shaders by name from an instance-scoped registry", async () => {
    const preset: ShaderPreset = {
      name: "unit-test-shader",
      async init() {
        return {
          emit() {},
          dispose() {},
        };
      },
    };
    const registry = createShaderRegistry();

    registry.register("unit-test-shader", async () => preset);

    expect(registry.list()).toContain("unit-test-shader");
    expect(await registry.load("unit-test-shader")).toBe(preset);
    expect(defaultShaderRegistry.has("unit-test-shader")).toBe(false);
  });

  it("resolves direct preset and loader sources without registration", async () => {
    const preset: ShaderPreset = {
      name: "direct-shader",
      async init() {
        return {
          emit() {},
          dispose() {},
        };
      },
    };

    expect(await resolveShaderSource(preset)).toBe(preset);
    expect(await resolveShaderSource(async () => preset)).toBe(preset);
  });
});
