import { describe, expect, it } from "vitest";
import {
  hasShader,
  listRegisteredShaders,
  loadShaderPreset,
  registerShader,
  type ShaderPreset,
} from "../src/index";

describe("shader registry", () => {
  it("pre-registers the built-in shader presets", async () => {
    expect(hasShader("ink-bleed")).toBe(true);
    expect(hasShader("dissolve")).toBe(true);

    const bleed = await loadShaderPreset("ink-bleed");
    const dissolve = await loadShaderPreset("dissolve");

    expect(bleed?.name).toBe("ink-bleed");
    expect(dissolve?.name).toBe("dissolve");
  });

  it("loads consumer-registered shaders by name", async () => {
    const preset: ShaderPreset = {
      name: "unit-test-shader",
      async init() {
        return {
          emit() {},
          dispose() {},
        };
      },
    };

    registerShader("unit-test-shader", async () => preset);

    expect(listRegisteredShaders()).toContain("unit-test-shader");
    expect(await loadShaderPreset("unit-test-shader")).toBe(preset);
  });
});
