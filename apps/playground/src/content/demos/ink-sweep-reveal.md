The motion surface is not limited to built-in CSS presets. Inkset also lets you replace the default token wrapper entirely and supply your own **RevealComponent**.

That ends up being a neat capability because a custom reveal component gets more than just a token string and a delay. It also gets measured token geometry: **x**, **y**, **width**, **height**, the reveal timing, the block id, and the token's position within the tick. That gives it enough context to stay aligned with the text instead of guessing after paint.

This demo uses that hook to draw a warm ink sweep behind each fresh word before the glyphs sharpen into place. The visual itself is just one option. The more generally useful part is that the effect stays attached to the word it belongs to. As the paragraph wraps, narrows, or widens, the sweep tracks the measured token box instead of floating off as a separate decoration.

That is why the motion still feels fairly typographic. It is not sitting on top of the text as a generic embellishment; it is following the same reading path the layout already set up.

More broadly, this is the kind of thing Inkset makes easier once it already knows where the text goes. If you want a product-specific motion treatment, you can build one on top of real token geometry instead of approximating it from the DOM afterward.

And once the stream settles, the effect disappears and you are left with plain readable text.
