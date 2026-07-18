import { ImageResponse } from "next/og";

export const alt = "Inkset — a rendering library for AI chat UIs in React";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0a0a0a";
const FG = "#ededed";
const MUTED = "#8b8fa6";
const ACCENT = "#8da3c9";

// Satori (used by next/og) only accepts TTF/OTF — a WOFF2 buffer fails with
// "Unsupported OpenType signature wOF2". We use Google Fonts' legacy v1 css
// endpoint (no UA header), which serves TTF URLs by default, then match the
// truetype format specifically so we never pick up a WOFF2 sibling.
const loadFont = async (weight: number): Promise<ArrayBuffer> => {
  const cssUrl = `https://fonts.googleapis.com/css?family=Libre+Franklin:${weight}`;
  const css = await (await fetch(cssUrl)).text();
  const url =
    css.match(/url\((https:\/\/[^)]+?)\)\s*format\(['"]?truetype['"]?\)/)?.[1] ??
    css.match(/url\((https:\/\/[^)]+?\.ttf)\)/)?.[1];
  if (!url) throw new Error(`Libre Franklin ${weight} TTF not found in css response`);
  return (await fetch(url)).arrayBuffer();
};

const Image = async () => {
  const [bold, medium] = await Promise.all([loadFont(700), loadFont(500)]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: BG,
        color: FG,
        padding: "72px 80px",
        fontFamily: "LibreFranklin",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <svg width="44" height="44" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M 10 18 L 30 18 Q 50 28 70 18 L 90 18 L 50 94 Z M 55 44 a 5 5 0 1 0 -10 0 a 5 5 0 1 0 10 0 Z"
            fill={FG}
            fillRule="evenodd"
          />
        </svg>
        <div style={{ fontSize: 26, color: MUTED, letterSpacing: "-0.01em" }}>inkset.dev</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: 156,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            color: FG,
          }}
        >
          Inkset
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 40,
            lineHeight: 1.2,
            letterSpacing: "-0.01em",
            color: MUTED,
            fontWeight: 500,
            maxWidth: 900,
          }}
        >
          A rendering library for AI chat UIs in React.
        </div>
      </div>

      <div style={{ display: "flex", width: 140, height: 4, backgroundColor: ACCENT }} />
    </div>,
    {
      ...size,
      fonts: [
        { name: "LibreFranklin", data: bold, weight: 700, style: "normal" },
        { name: "LibreFranklin", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
};

export default Image;
