This is the simplest version of what Inkset does well: no extra motion layer, no visual garnish, just a reply arriving token by token while the column stays calm.

That is nice to isolate because a lot of streaming UI weirdness shows up before you ever get to code blocks or math. A fast model emits text in bursts. The browser treats each burst as a layout change, lines rewrap, everything below shifts, and the page can feel a little slippery.

Inkset takes a different approach. Text measurement does not depend on asking the live DOM where everything is on every token. It happens through **pretext**, and then re-layout is mostly arithmetic over cached widths. In practice that just means the renderer already knows more about the text than a naïve DOM-first stack would.

The result is straightforward but useful. A response can grow word by word without constantly renegotiating the whole page. Resize can happen mid-stream without the column turning into a moving target. It feels more like text arriving into a stable layout and less like a document trying to catch up with itself.

That same setup also makes the richer demos possible later on. Math, highlighted code, diagrams, and other asynchronous blocks can still settle locally because the renderer is already built around measurement and correction instead of hoping ordinary DOM flow will stay calm under pressure.

```javascript
// This is the hot path — pure arithmetic.
const layout = computeLayout(measured, { containerWidth });
// ~0.0002ms per block. 1000 blocks < 0.2ms.
```

$$\text{speedup} = \frac{t_{\text{DOM reflow}}}{t_{\text{pretext layout}}} \approx 300\text{-}600\times$$

That is the point of this demo. Before you get into motion presets or branded effects, it is nice to have the plain streamed text case feel solid.
