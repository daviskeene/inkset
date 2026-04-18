import type { ShaderLoader, ShaderPreset, ShaderRegistry, ShaderSource } from "./types";

type CreateShaderRegistryOptions = {
  includeBuiltIns?: boolean;
};

const registerBuiltIns = (registry: ShaderRegistry): void => {
  registry.register("ink-bleed", async () => {
    const mod = await import("./shaders/ink-bleed");
    return mod.inkBleedShader;
  });

  registry.register("dissolve", async () => {
    const mod = await import("./shaders/dissolve");
    return mod.dissolveShader;
  });
};

export const createShaderRegistry = (options: CreateShaderRegistryOptions = {}): ShaderRegistry => {
  const shaderLoaders = new Map<string, ShaderLoader>();

  const registry: ShaderRegistry = {
    register(name, loader) {
      shaderLoaders.set(name, loader);
    },
    has(name) {
      return shaderLoaders.has(name);
    },
    list() {
      return Array.from(shaderLoaders.keys()).sort();
    },
    async load(name) {
      const loader = shaderLoaders.get(name);
      if (!loader) return null;
      return loader();
    },
  };

  if (options.includeBuiltIns) {
    registerBuiltIns(registry);
  }

  return registry;
};

export const defaultShaderRegistry = createShaderRegistry({ includeBuiltIns: true });

export const resolveShaderSource = async (
  source: ShaderSource,
  registry: ShaderRegistry = defaultShaderRegistry,
): Promise<ShaderPreset | null> => {
  if (typeof source === "string") {
    return registry.load(source);
  }
  if (typeof source === "function") {
    return source();
  }
  return source;
};
