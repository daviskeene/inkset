---
"@inkset/core": patch
---

Plugin dependencies (Shiki, KaTeX, Mermaid) now load the first time the content has a block that needs them, instead of at pipeline start. Content without code, math, or diagrams never downloads them, and on a slow connection they no longer compete with the text. Each block shows its source until its dependency arrives, as before. Call `warmPlugins()` to load every plugin's dependency up front.
