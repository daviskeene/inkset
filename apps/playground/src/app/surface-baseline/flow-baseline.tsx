"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Inkset, InksetParts, type InksetPart, type InksetSurfacePart } from "@inkset/react";
import { createStateStore, type Spec, type StateStore } from "@json-render/core";
import {
  JSONUIProvider,
  Renderer,
  useStateValue,
  type ComponentRegistry,
  type ComponentRenderProps,
} from "@json-render/react";
import styles from "./flow-baseline.module.css";

type Fields = { name: string; amount: number; expanded: boolean; note: string };
type Field = keyof Fields;
type Session = { store: StateStore; dirty: Set<Field> };
type Counts = Record<string, { mounts: number; unmounts: number }>;
const initial: Fields = { name: "Alex", amount: 35, expanded: false, note: "Original model note" };

// Deliberately limited to this fixture's flat fields; this is not a generic merge API.
const mergeModelState = (session: Session, incoming: Fields) => {
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(incoming) as Field[]) {
    if (!session.dirty.has(key)) updates[`/${key}`] = incoming[key];
  }
  session.store.update(updates);
};

const Host = createContext<{
  session: Session;
  count: (id: string, phase: "mounts" | "unmounts") => void;
} | null>(null);

const useHost = () => {
  const host = useContext(Host);
  if (!host) throw new Error("Surface requires its application host");
  return host;
};

const useLifetime = (id: string) => {
  const { count } = useHost();
  const lifetime = useRef({ counted: false, active: false });
  useEffect(() => {
    const current = lifetime.current;
    current.active = true;
    if (!current.counted) {
      current.counted = true;
      count(id, "mounts");
    }
    return () => {
      current.active = false;
      // StrictMode may disconnect/reconnect effects on a moved subtree while
      // preserving its instance and DOM. Count disposal, not effect replay.
      queueMicrotask(() => {
        if (!current.active) count(id, "unmounts");
      });
    };
  }, [count, id]);
};

const useField = <K extends Field>(key: K) => {
  const { session } = useHost();
  const value = useStateValue<Fields[K]>(`/${key}`) ?? initial[key];
  const set = (next: Fields[K]) => {
    session.dirty.add(key);
    session.store.set(`/${key}`, next);
  };
  return [value, set] as const;
};

const Panel = ({ element, children }: ComponentRenderProps<{ title: string }>) => {
  useLifetime("panel");
  const note = useStateValue<string>("/note");
  return (
    <section className={styles.panel} aria-label="Interactive comparison" data-testid="surface">
      <h2>{element.props.title}</h2>
      <p data-testid="model-note">{note}</p>
      <div className={styles.fields}>{children}</div>
    </section>
  );
};

const NameField = () => {
  useLifetime("name");
  const [value, set] = useField("name");
  return (
    <label className={styles.field}>
      Your name
      <input data-control="name" value={value} onChange={(event) => set(event.target.value)} />
    </label>
  );
};

const AmountField = () => {
  useLifetime("amount");
  const [value, set] = useField("amount");
  const [dragging, setDragging] = useState(false);
  return (
    <label className={styles.field}>
      Allocation
      <input
        data-control="amount"
        data-dragging={dragging}
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => set(Number(event.target.value))}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onLostPointerCapture={() => setDragging(false)}
      />
      {/* Plain text intentionally has no implicit output/status live-region role. */}
      <span data-testid="amount-value">{value}% allocated</span>
    </label>
  );
};

const Details = () => {
  useLifetime("details");
  const [expanded, set] = useField("expanded");
  return (
    <div className={styles.details}>
      <button
        aria-expanded={expanded}
        aria-controls="surface-details"
        onClick={() => set(!expanded)}
      >
        {expanded ? "Collapse details" : "Expand details"}
      </button>
      <div className={styles.expansion} data-expanded={expanded}>
        <div id="surface-details" inert={!expanded} aria-hidden={!expanded}>
          <div className={styles.detailBody}>
            <p>This region animates its height in normal document flow.</p>
            <p>The following Markdown segment should move with it on every frame.</p>
            <p>There is no Inkset height estimate or settlement callback for this surface.</p>
            <a href="#baseline-controls">Back to fixture controls</a>
          </div>
        </div>
      </div>
    </div>
  );
};

const Menu = () => {
  useLifetime("menu");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button aria-expanded={open} aria-controls="fixed-menu" onClick={() => setOpen(!open)}>
        Toggle fixed menu
      </button>
      {open && (
        <div id="fixed-menu" className={styles.menu} data-testid="fixed-menu">
          <p>A non-portaled, viewport-fixed surface.</p>
          <button onClick={() => setOpen(false)}>Close menu</button>
        </div>
      )}
    </div>
  );
};

const registry: ComponentRegistry = { Panel, NameField, AmountField, Details, Menu };
const makeSpec = (revision: number): Spec => ({
  root: "panel",
  elements: {
    panel: {
      type: "Panel",
      props: { title: revision ? `Comparison revision ${revision}` : "Choose an allocation" },
      children: ["name", "amount", "details", "menu"],
    },
    name: { type: "NameField", props: {} },
    amount: { type: "AmountField", props: {} },
    details: { type: "Details", props: {} },
    menu: { type: "Menu", props: {} },
  },
});

const Surface = ({ session, spec }: { session: Session; spec: Spec }) => {
  useLifetime("surface");
  return (
    <JSONUIProvider registry={registry} store={session.store}>
      <Renderer registry={registry} spec={spec} />
    </JSONUIProvider>
  );
};

const intro =
  "## Before the surface\n\nThis Markdown segment owns its own Inkset pipeline. The interactive component after it is a sibling in normal flow.";
const tail =
  "## After the surface\n\nThis is the reading anchor. It follows the interactive component in normal document flow.\n\n" +
  Array.from(
    { length: 16 },
    (_, i) =>
      `Paragraph ${i + 1}. This longer response gives the scroll container enough space to test native anchoring. Each Markdown segment still uses Inkset's current renderer internally.`,
  ).join("\n\n");
const streamText =
  "\n\nTokens continue arriving after the interactive comparison. Editing the controls does not need to wait for this paragraph to finish. A model may later update the title and untouched defaults while keeping the user's values.";

type Metrics = {
  frames: number;
  overlapFrames: number;
  maxOverlapPx: number;
  maxAnchorDisplacementPx: number;
  anchorDisplacementPx: number;
  controlReplacements: number;
  lifetimes: Counts;
};
const blankMetrics = (): Metrics => ({
  frames: 0,
  overlapFrames: 0,
  maxOverlapPx: 0,
  maxAnchorDisplacementPx: 0,
  anchorDisplacementPx: 0,
  controlReplacements: 0,
  lifetimes: {},
});

export const FlowBaseline = ({ mode }: { mode: "baseline" | "parts" }) => {
  const [session] = useState<Session>(() => ({
    store: createStateStore(initial),
    dirty: new Set(),
  }));
  const counts = useRef<Counts>({});
  const host = useMemo(
    () => ({
      session,
      count: (id: string, phase: "mounts" | "unmounts") => {
        const entry = counts.current[id] ?? { mounts: 0, unmounts: 0 };
        counts.current[id] = { ...entry, [phase]: entry[phase] + 1 };
      },
    }),
    [session],
  );
  const [spec, setSpec] = useState(() => makeSpec(0));
  const revision = useRef(0);
  const [inserted, setInserted] = useState(false);
  const [surfaceLast, setSurfaceLast] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("Ready");
  const scrollRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const measurement = useRef({
    metrics: blankMetrics(),
    anchorTop: null as number | null,
    controls: [] as Element[],
    baseline: {} as Counts,
  });
  const [metrics, setMetrics] = useState(blankMetrics);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => {
      setStreamed((value) => streamText.slice(0, value.length + 5));
    }, 40);
    return () => clearInterval(timer);
  }, [streaming]);
  useEffect(() => {
    if (streamed.length === streamText.length) setStreaming(false);
  }, [streamed]);

  const resetMeasurements = () => {
    const root = scrollRef.current;
    measurement.current = {
      metrics: blankMetrics(),
      anchorTop:
        root?.querySelector('[data-inkset-part="tail"] .inkset-root p')?.getBoundingClientRect()
          .top ?? null,
      controls: root ? [...root.querySelectorAll("[data-control]")] : [],
      baseline: structuredClone(counts.current),
    };
    setMetrics(blankMetrics());
  };

  useEffect(() => {
    let raf = 0;
    let lastPublish = 0;
    const sample = (time: number) => {
      const root = scrollRef.current;
      const current = measurement.current;
      if (root) {
        const parts = [...root.querySelectorAll<HTMLElement>("[data-inkset-part]")];
        let overlap = 0;
        for (let i = 1; i < parts.length; i++) {
          overlap = Math.max(
            overlap,
            parts[i - 1].getBoundingClientRect().bottom - parts[i].getBoundingClientRect().top,
          );
        }
        const top = root
          .querySelector('[data-inkset-part="tail"] .inkset-root p')
          ?.getBoundingClientRect().top;
        const displacement =
          top !== undefined && current.anchorTop !== null ? top - current.anchorTop : 0;
        const controls = [...root.querySelectorAll("[data-control]")];
        if (current.controls.length && controls.some((node, i) => node !== current.controls[i])) {
          current.metrics.controlReplacements++;
          current.controls = controls;
        }
        current.metrics.frames++;
        if (overlap > 0.5) current.metrics.overlapFrames++;
        current.metrics.maxOverlapPx = Math.max(current.metrics.maxOverlapPx, overlap);
        current.metrics.anchorDisplacementPx = displacement;
        current.metrics.maxAnchorDisplacementPx = Math.max(
          current.metrics.maxAnchorDisplacementPx,
          Math.abs(displacement),
        );
        if (time - lastPublish > 200) {
          lastPublish = time;
          const lifetimes: Counts = {};
          for (const [id, count] of Object.entries(counts.current)) {
            const before = current.baseline[id] ?? { mounts: 0, unmounts: 0 };
            lifetimes[id] = {
              mounts: count.mounts - before.mounts,
              unmounts: count.unmounts - before.unmounts,
            };
          }
          setMetrics({ ...current.metrics, lifetimes });
        }
      }
      raf = requestAnimationFrame(sample);
    };
    raf = requestAnimationFrame(sample);
    return () => cancelAnimationFrame(raf);
  }, []);

  const schedule = (label: string, action: () => void) => {
    setStatus(`${label} pending`);
    timers.current.push(
      setTimeout(() => {
        action();
        setStatus(`${label} applied`);
      }, 600),
    );
  };
  const patch = () => {
    const next = ++revision.current;
    mergeModelState(session, {
      name: "Model replacement",
      amount: 10,
      expanded: false,
      note: `Model note ${next}`,
    });
    setSpec(makeSpec(next));
  };
  const parts: InksetPart<Spec>[] = [{ id: "intro", type: "markdown", content: intro }];
  if (inserted)
    parts.push({
      id: "inserted",
      type: "markdown",
      content:
        "An inserted paragraph before the surface.\n\nAn inserted paragraph before the surface.",
    });
  const surface: InksetPart<Spec> = { id: "comparison", type: "surface", data: spec };
  const trailing: InksetPart<Spec> = {
    id: "tail",
    type: "markdown",
    content: tail + streamed,
    streaming,
  };
  parts.push(...(surfaceLast ? [trailing, surface] : [surface, trailing]));
  const renderSurface = (part: InksetSurfacePart<Spec>) => (
    <Surface session={session} spec={part.data} />
  );
  const shared = {
    font: "Arial",
    reveal: reveal ? { css: { preset: "fadeIn" as const } } : undefined,
  };

  return (
    <Host.Provider value={host}>
      <main className={styles.page}>
        {mode === "parts" ? (
          <>
            <h1>Surface parts</h1>
            <p>The same parts rendered through InksetParts.</p>
          </>
        ) : (
          <>
            <h1>Surface flow baseline</h1>
            <p>
              Independent Inkset Markdown segments and a json-render surface in a flex column. No
              core changes, surface measurement, or custom anchoring.
            </p>
          </>
        )}
        <div id="baseline-controls" className={styles.toolbar}>
          <button
            onClick={() => {
              setStreamed("");
              setStreaming(true);
            }}
          >
            Start stream
          </button>
          <button onClick={() => schedule("Patch", patch)}>Patch in 600 ms</button>
          <button onClick={() => schedule("Insert/remove", () => setInserted((value) => !value))}>
            Insert/remove in 600 ms
          </button>
          <button onClick={() => schedule("Reorder", () => setSurfaceLast((value) => !value))}>
            Reorder in 600 ms
          </button>
          <button onClick={() => schedule("Resize", () => setNarrow((value) => !value))}>
            Resize in 600 ms
          </button>
          <button
            onClick={() =>
              schedule("Expand/collapse", () => {
                session.dirty.add("expanded");
                session.store.set("/expanded", !session.store.get("/expanded"));
              })
            }
          >
            Expand/collapse in 600 ms
          </button>
          <label>
            <input
              type="checkbox"
              checked={reveal}
              onChange={(event) => setReveal(event.target.checked)}
            />{" "}
            Markdown reveal
          </label>
          <button onClick={resetMeasurements}>Reset measurements</button>
        </div>
        <p data-testid="status">
          {status} · {streaming ? "Streaming" : "Stream idle"}
        </p>
        <div className={styles.workspace}>
          <div
            ref={scrollRef}
            className={styles.scroll}
            data-testid="scroll"
            style={{ width: narrow ? 360 : 760 }}
          >
            {mode === "parts" ? (
              <InksetParts
                parts={parts}
                renderSurface={renderSurface}
                className={styles.parts}
                {...shared}
              />
            ) : (
              // All parts have one parent and stable host IDs. No changes to Inkset are needed.
              <div className={styles.parts}>
                {parts.map((part) => (
                  <div key={part.id} data-inkset-part={part.id}>
                    {part.type === "markdown" ? (
                      <Inkset content={part.content} streaming={part.streaming} {...shared} />
                    ) : (
                      renderSurface(part)
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <aside className={styles.audit}>
            <h2>Measurements</h2>
            <p>
              Reset after initial mount to exclude StrictMode setup. Anchor motion includes
              deliberate scroll and resize. Sampled once per animation frame.
            </p>
            <pre data-testid="metrics">{JSON.stringify(metrics, null, 2)}</pre>
          </aside>
        </div>
      </main>
    </Host.Provider>
  );
};
