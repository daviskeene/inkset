import type { Spec } from "@json-render/core";

// A recorded model response, replayed in the order a model streams it: Markdown
// text, and json-render specs that may only use the app's gear catalog. A later
// spec for the same surface ID updates that surface in place.

export type ReplayEvent =
  | { type: "text"; part: string; text: string }
  | { type: "surface"; part: string; spec: Spec };

export type ReplayTurn = { question: string; events: ReplayEvent[] };

const gearExplorer = (withClimbingGear: boolean): Spec => ({
  root: "explorer",
  state: { front: 50, rear: 17, cadence: 85 },
  elements: {
    explorer: {
      type: "Explorer",
      props: { title: "Gear explorer" },
      children: ["diagram", "readouts", "controls", ...(withClimbingGear ? ["climb"] : [])],
    },
    diagram: { type: "GearDiagram", props: {} },
    controls: { type: "Stack", props: {}, children: ["front", "rear", "cadence"] },
    front: {
      type: "Slider",
      props: { label: "Front ring", path: "/front", min: 30, max: 53, unit: "teeth" },
    },
    rear: {
      type: "Slider",
      props: { label: "Rear cog", path: "/rear", min: 11, max: 34, unit: "teeth" },
    },
    cadence: {
      type: "Slider",
      props: { label: "Cadence", path: "/cadence", min: 50, max: 110, unit: "rpm" },
    },
    readouts: { type: "Stats", props: {}, children: ["ratio", "development", "speed"] },
    ratio: { type: "Readout", props: { label: "Gear ratio", metric: "ratio" } },
    development: { type: "Readout", props: { label: "Per pedal stroke", metric: "development" } },
    speed: { type: "Readout", props: { label: "Speed", metric: "speed" } },
    ...(withClimbingGear && {
      climb: {
        type: "Preset",
        props: {
          note: "For steep climbs, use the small front ring with a big rear cog.",
          label: "Try 34 × 28",
          front: 34,
          rear: 28,
        },
      },
    }),
  },
});

export const TURNS: ReplayTurn[] = [
  {
    question: "How do bike gears actually work?",
    events: [
      {
        type: "text",
        part: "intro",
        text: "Bike gears decide how far you travel each time the pedals go around once. The chain connects a ring at the front to a cog on the rear wheel, so the ratio between their teeth sets how many times the wheel turns for every pedal stroke. A 50-tooth ring driving a 17-tooth cog turns the wheel almost three times per stroke.",
      },
      { type: "surface", part: "gears", spec: gearExplorer(false) },
      {
        type: "text",
        part: "reading",
        text: "Raising the ratio, with a bigger front ring or a smaller rear cog, makes each stroke carry you further. It feels heavier, but you go faster at the same pedaling rhythm. Lowering the ratio does the opposite, so each stroke moves you a shorter distance with less effort, which is why the smallest ring and the biggest cog are the climbing gears.\n\nMost riders are comfortable holding a cadence of about 80 to 95 pedal turns per minute. Shifting is how you keep that rhythm as the road changes, and the speed readout shows what each gear gives you at the cadence you set.",
      },
    ],
  },
  {
    question: "Which gear should I use to climb a steep hill?",
    events: [
      {
        type: "text",
        part: "climb",
        text: "Shift into a low gear before the climb gets steep: the small front ring with one of the largest rear cogs. On a typical road bike that's 34 × 28, a ratio of about 1.2, so each pedal stroke moves you roughly 2.5 meters instead of the 6 or so you'd cover in 50 × 17.",
      },
      { type: "surface", part: "gears", spec: gearExplorer(true) },
      {
        type: "text",
        part: "climb-tips",
        text: "I added that gear to the explorer above so you can compare it with your current setting. Shift before your cadence starts to drop, since changing gear under heavy pressure is hard on the chain, and aim to keep spinning at around 70 to 80 rpm. If the climb is steeper than your lowest gear can handle, standing on the pedals for a few strokes will get you over the hardest part.",
      },
    ],
  },
];
