// HTML serialization utilities for converting AST nodes to safe HTML strings.
import type { ASTNode } from "./types";

const SELF_CLOSING_TAGS = ["br", "hr", "img", "input"] as const;

export const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

export const nodeToHtml = (node: Readonly<ASTNode>): string => {
  if (node.type === "text") return escapeHtml(node.value ?? "");
  if (node.type === "inlineMath") {
    return `<span data-inkset-inline-math>${escapeHtml(node.value ?? "")}</span>`;
  }
  if (node.type === "root" && node.children) {
    return node.children.map(nodeToHtml).join("");
  }

  const tag = node.tagName ?? "div";
  const attrs = propsToAttrs(node.properties);
  const children = node.children?.map(nodeToHtml).join("") ?? "";

  if ((SELF_CLOSING_TAGS as readonly string[]).includes(tag)) {
    return `<${tag}${attrs} />`;
  }

  return `<${tag}${attrs}>${children}</${tag}>`;
};

export const propsToAttrs = (props?: Readonly<Record<string, unknown>>): string => {
  if (!props) return "";
  return Object.entries(props)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => {
      const attr = k === "className" ? "class" : k;
      if (v === true) return ` ${attr}`;
      return ` ${attr}="${escapeHtml(String(v))}"`;
    })
    .join("");
};
