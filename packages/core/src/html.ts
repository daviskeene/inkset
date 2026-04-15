import type { ASTNode } from "./types";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function nodeToHtml(node: ASTNode): string {
  if (node.type === "text") return escapeHtml(node.value ?? "");
  if (node.type === "root" && node.children) {
    return node.children.map(nodeToHtml).join("");
  }

  const tag = node.tagName ?? "div";
  const attrs = propsToAttrs(node.properties);
  const children = node.children?.map(nodeToHtml).join("") ?? "";

  if (["br", "hr", "img", "input"].includes(tag)) {
    return `<${tag}${attrs} />`;
  }

  return `<${tag}${attrs}>${children}</${tag}>`;
}

export function propsToAttrs(props?: Record<string, unknown>): string {
  if (!props) return "";
  return Object.entries(props)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => {
      const attr = k === "className" ? "class" : k;
      if (v === true) return ` ${attr}`;
      return ` ${attr}="${escapeHtml(String(v))}"`;
    })
    .join("");
}
