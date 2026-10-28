"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import type { StateStore } from "@json-render/core";
import {
  useStateValue,
  type ComponentRegistry,
  type ComponentRenderProps,
} from "@json-render/react";
import styles from "./gear-catalog.module.css";

// The application's catalog: the only components a model can place in a spec.

/** A surface's live state, plus the paths the reader changed, which model revisions keep. */
export type SurfaceSession = { store: StateStore; touched: Set<string> };

export const SessionContext = createContext<SurfaceSession | null>(null);

// 700 × 28c road wheel.
const WHEEL_CIRCUMFERENCE_M = 2.1;

const useNumber = (path: string) => {
  const session = useContext(SessionContext);
  const value = useStateValue<number>(path) ?? 0;
  const set = (next: number) => {
    session?.touched.add(path);
    session?.store.set(path, next);
  };
  return [value, set] as const;
};

const useGear = () => {
  const [front] = useNumber("/front");
  const [rear] = useNumber("/rear");
  const [cadence] = useNumber("/cadence");
  const ratio = front / rear;
  const development = ratio * WHEEL_CIRCUMFERENCE_M;
  return { front, rear, cadence, ratio, development, speed: development * cadence * 0.06 };
};

type Gear = ReturnType<typeof useGear>;

const Explorer = ({ element, children }: ComponentRenderProps<{ title: string }>) => (
  <section aria-label={element.props.title} className={styles.explorer}>
    <h3 className={styles.title}>{element.props.title}</h3>
    {children}
  </section>
);

const Stack = ({ children }: ComponentRenderProps) => (
  <div className={styles.stack}>{children}</div>
);

const Stats = ({ children }: ComponentRenderProps) => (
  <div className={styles.stats}>{children}</div>
);

const Slider = ({
  element,
}: ComponentRenderProps<{
  label: string;
  path: string;
  min: number;
  max: number;
  unit: string;
}>) => {
  const { label, path, min, max, unit } = element.props;
  const [value, set] = useNumber(path);
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <label className={styles.field}>
      <span className={styles.fieldRow}>
        {label}
        <span className={styles.fieldValue}>
          {value} {unit}
        </span>
      </span>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        value={value}
        onChange={(event) => set(Number(event.target.value))}
        style={{ "--fill": fill } as CSSProperties}
      />
    </label>
  );
};

const METRICS: Record<string, (gear: Gear) => [value: string, unit: string]> = {
  ratio: (gear) => [gear.ratio.toFixed(2), ""],
  development: (gear) => [gear.development.toFixed(1), "m"],
  speed: (gear) => [gear.speed.toFixed(1), "km/h"],
};

const Readout = ({ element }: ComponentRenderProps<{ label: string; metric: string }>) => {
  const [value, unit] = METRICS[element.props.metric](useGear());
  return (
    <div>
      <span className={styles.label}>{element.props.label}</span>
      <span className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </span>
    </div>
  );
};

const Preset = ({
  element,
}: ComponentRenderProps<{ note: string; label: string; front: number; rear: number }>) => {
  const [front, setFront] = useNumber("/front");
  const [rear, setRear] = useNumber("/rear");
  const selected = front === element.props.front && rear === element.props.rear;
  return (
    <div className={styles.preset}>
      <p className={styles.presetNote}>{element.props.note}</p>
      <button
        type="button"
        className={styles.presetButton}
        aria-pressed={selected}
        onClick={() => {
          setFront(element.props.front);
          setRear(element.props.rear);
        }}
      >
        {element.props.label}
      </button>
    </div>
  );
};

// ── Drivetrain ──────────────────────────────────────────────────────

// Seen from the drive side with the front of the bike to the right, so pedaling
// turns everything clockwise. Sprockets are sized from a real chain pitch, which
// is what lets the chain's links sit on the teeth.
const PITCH = 6.4;
const CY = 92;
const REAR_X = 66;
const FRONT_X = 228;
const CRANK = 62;
const START_ANGLE = 40;

const pitchRadius = (teeth: number) => PITCH / (2 * Math.sin(Math.PI / teeth));

const fixed = (n: number) => n.toFixed(2);
const polar = (radius: number, angle: number) =>
  `${fixed(radius * Math.cos(angle))} ${fixed(radius * Math.sin(angle))}`;

/** A sprocket around the origin: a roller seat at every pitch, a tooth between seats. */
const sprocketPath = (teeth: number) => {
  const r = pitchRadius(teeth);
  const seat = PITCH * 0.3;
  const tip = r + PITCH * 0.42;
  const step = (2 * Math.PI) / teeth;
  const tipHalf = (PITCH * 0.12) / tip;
  let d = "";
  for (let k = 0; k < teeth; k++) {
    const a = k * step;
    const [x, y] = [r * Math.cos(a), r * Math.sin(a)];
    const [tx, ty] = [-Math.sin(a) * seat, Math.cos(a) * seat];
    d += `${k ? "L" : "M"} ${fixed(x - tx)} ${fixed(y - ty)} `;
    d += `A ${seat} ${seat} 0 0 0 ${fixed(x + tx)} ${fixed(y + ty)} `;
    d += `L ${polar(tip, a + step / 2 - tipHalf)} `;
    d += `A ${fixed(tip)} ${fixed(tip)} 0 0 1 ${polar(tip, a + step / 2 + tipHalf)} `;
  }
  return `${d}Z`;
};

const circlePath = (r: number) =>
  `M ${fixed(r)} 0 A ${fixed(r)} ${fixed(r)} 0 1 0 ${fixed(-r)} 0 A ${fixed(r)} ${fixed(r)} 0 1 0 ${fixed(r)} 0 Z`;

/**
 * The chain loop along the sprockets' pitch circles, joined by their outer
 * tangents. It runs in the direction the chain moves, and its link length
 * divides the loop evenly so the moving links have no seam.
 */
const chainLoop = (rFront: number, rRear: number) => {
  const span = FRONT_X - REAR_X;
  // Angle from +x to the normal of each tangent, the same on both sprockets.
  const wrap = Math.acos((rRear - rFront) / span);
  const at = (x: number, r: number, angle: number) =>
    `${fixed(x + r * Math.cos(angle))} ${fixed(CY + r * Math.sin(angle))}`;
  const frontLarge = 2 * wrap > Math.PI ? 1 : 0;
  const path = [
    `M ${at(REAR_X, rRear, -wrap)}`,
    `L ${at(FRONT_X, rFront, -wrap)}`,
    `A ${fixed(rFront)} ${fixed(rFront)} 0 ${frontLarge} 1 ${at(FRONT_X, rFront, wrap)}`,
    `L ${at(REAR_X, rRear, wrap)}`,
    `A ${fixed(rRear)} ${fixed(rRear)} 0 ${1 - frontLarge} 1 ${at(REAR_X, rRear, -wrap)}`,
    "Z",
  ].join(" ");
  const length =
    2 * Math.sqrt(span ** 2 - (rFront - rRear) ** 2) +
    rFront * 2 * wrap +
    rRear * (2 * Math.PI - 2 * wrap);
  return { path, link: length / Math.round(length / PITCH) };
};

const GearDiagram = () => {
  const { front, rear, cadence } = useGear();
  const rFront = pitchRadius(front);
  const rRear = pitchRadius(rear);
  const ring = useMemo(() => {
    const band = rFront - PITCH * 1.25;
    return { teeth: `${sprocketPath(front)} ${circlePath(band)}`, band };
  }, [front, rFront]);
  const cog = useMemo(() => sprocketPath(rear), [rear]);
  const chain = useMemo(() => chainLoop(rFront, rRear), [rFront, rRear]);

  const frontRef = useRef<SVGGElement>(null);
  const crankRef = useRef<SVGGElement>(null);
  const rearRef = useRef<SVGGElement>(null);
  const pedalRef = useRef<SVGGElement>(null);
  const platesRef = useRef<SVGPathElement>(null);
  const pinsRef = useRef<SVGPathElement>(null);
  const angle = useRef(START_ANGLE);
  const live = useRef({ cadence, ratio: front / rear, rFront, link: chain.link });
  live.current = { cadence, ratio: front / rear, rFront, link: chain.link };

  // Rotations are written straight to the DOM so React never resets them.
  const apply = () => {
    const { ratio, rFront, link } = live.current;
    const a = angle.current % 360;
    frontRef.current?.setAttribute("transform", `rotate(${a})`);
    crankRef.current?.setAttribute("transform", `rotate(${a})`);
    rearRef.current?.setAttribute("transform", `rotate(${(angle.current * ratio) % 360})`);
    pedalRef.current?.setAttribute("transform", `rotate(${-a} 0 ${CRANK})`);
    const offset = -((((angle.current * Math.PI) / 180) * rFront) % link);
    platesRef.current?.setAttribute("stroke-dashoffset", fixed(offset));
    pinsRef.current?.setAttribute("stroke-dashoffset", fixed(offset - link * 0.9));
  };
  useLayoutEffect(apply);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A quarter of real speed, so the rear cog's extra turns are easy to follow.
      angle.current += (live.current.cadence / 60) * 360 * ((now - last) / 1000) * 0.25;
      last = now;
      apply();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const metal = "var(--pg-text-primary)";
  const steel = "var(--pg-text-muted)";
  const stage = "var(--pg-bg)";

  return (
    <div className={styles.stage}>
      <svg
        viewBox="5 12 320 172"
        role="img"
        aria-label={`A ${front}-tooth front ring driving a ${rear}-tooth rear cog`}
      >
        <g transform={`translate(${REAR_X} ${CY})`}>
          <g ref={rearRef}>
            <path d={cog} fill={steel} />
            <circle r={Math.max(3, rRear * 0.34)} fill={stage} />
            <circle r={1.6} fill={metal} />
            <circle cx={rRear * 0.62} r={1.8} fill="var(--pg-accent)" />
          </g>
        </g>

        <g transform={`translate(${FRONT_X} ${CY})`}>
          <g ref={frontRef}>
            <path d={ring.teeth} fill={metal} fillRule="evenodd" />
            {[0, 1, 2, 3, 4].map((arm) => {
              const a = (arm * 2 * Math.PI) / 5;
              const reach = ring.band + 1;
              const bolt = ring.band - 2.6;
              return (
                <g key={arm}>
                  <line
                    x2={fixed(reach * Math.cos(a))}
                    y2={fixed(reach * Math.sin(a))}
                    stroke={metal}
                    strokeWidth={7}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={fixed(bolt * Math.cos(a))}
                    cy={fixed(bolt * Math.sin(a))}
                    r={1.5}
                    fill={stage}
                  />
                </g>
              );
            })}
          </g>
        </g>

        {/* A halo in the stage color keeps the chain legible where it crosses the teeth. */}
        <path d={chain.path} fill="none" stroke={stage} strokeWidth={6} strokeLinejoin="round" />
        <path
          ref={platesRef}
          d={chain.path}
          fill="none"
          stroke={metal}
          strokeOpacity={0.85}
          strokeWidth={3.6}
          strokeDasharray={`${fixed(chain.link * 0.8)} ${fixed(chain.link * 0.2)}`}
        />
        <path
          ref={pinsRef}
          d={chain.path}
          fill="none"
          stroke={stage}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeDasharray={`0 ${fixed(chain.link)}`}
        />

        {/* The crank turns with the chainring but sits outboard of the chain. */}
        <g transform={`translate(${FRONT_X} ${CY})`}>
          <g ref={crankRef}>
            <path
              d={`M -4.5 0 L -3 ${CRANK} A 3 3 0 0 0 3 ${CRANK} L 4.5 0 A 4.5 4.5 0 0 0 -4.5 0 Z`}
              fill={steel}
              stroke={stage}
              strokeWidth={1.5}
              paintOrder="stroke"
            />
            <circle r={6} fill={metal} />
            <circle r={2.2} fill={stage} />
            {/* Pedals stay level while the crank turns. */}
            <g ref={pedalRef}>
              <rect x={-11} y={CRANK - 3} width={22} height={6} rx={2} fill={metal} />
              <circle cy={CRANK} r={1.6} fill={steel} />
            </g>
          </g>
        </g>

        <text x={REAR_X} y={178} textAnchor="middle" fontSize={10} fill={steel}>
          Rear cog
        </text>
        <text x={FRONT_X} y={178} textAnchor="middle" fontSize={10} fill={steel}>
          Front ring
        </text>
      </svg>
    </div>
  );
};

export const gearCatalog: ComponentRegistry = {
  Explorer,
  Stack,
  Stats,
  GearDiagram,
  Slider,
  Readout,
  Preset,
};
