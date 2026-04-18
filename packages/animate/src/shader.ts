import type { ShaderLoader, ShaderPreset } from "./types";

const shaderRegistry = new Map<string, ShaderLoader>();

export const registerShader = (name: string, loader: ShaderLoader): void => {
  shaderRegistry.set(name, loader);
};

export const hasShader = (name: string): boolean => shaderRegistry.has(name);

export const listRegisteredShaders = (): string[] =>
  Array.from(shaderRegistry.keys()).sort();

export const loadShaderPreset = async (name: string): Promise<ShaderPreset | null> => {
  const loader = shaderRegistry.get(name);
  if (!loader) return null;
  return loader();
};

registerShader("ink-bleed", async () => {
  const mod = await import("./shaders/ink-bleed");
  return mod.inkBleedShader;
});

registerShader("dissolve", async () => {
  const mod = await import("./shaders/dissolve");
  return mod.dissolveShader;
});
