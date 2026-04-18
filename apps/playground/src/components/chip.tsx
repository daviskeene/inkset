"use client";

import React, { forwardRef } from "react";

type ChipVariant = "toggle" | "quiet" | "accent";

type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  active?: boolean;
  variant?: ChipVariant;
  label: React.ReactNode;
  detail?: React.ReactNode;
  leadingDot?: boolean;
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  {
    active = false,
    variant = "toggle",
    label,
    detail,
    leadingDot = false,
    disabled,
    className,
    style,
    ...rest
  },
  ref,
) {
  const isAccent = variant === "accent";
  const isQuiet = variant === "quiet";

  const border =
    isAccent && active
      ? "1px solid color-mix(in srgb, var(--pg-accent) 55%, transparent)"
      : active
        ? "1px solid var(--pg-border-strong)"
        : "1px solid var(--pg-border-default)";

  const background = active
    ? isAccent
      ? "var(--pg-accent-soft)"
      : "var(--pg-chip-active-bg)"
    : "transparent";

  const color = active
    ? isAccent
      ? "var(--pg-accent)"
      : "var(--pg-chip-active-text)"
    : isQuiet
      ? "var(--pg-text-muted)"
      : "var(--pg-text-primary)";

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={className}
      style={{
        padding: "4px 10px",
        fontSize: 12.5,
        lineHeight: 1.4,
        border,
        borderRadius: 999,
        background,
        color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "inherit",
        letterSpacing: "-0.005em",
        transition: "border-color 120ms ease, background-color 120ms ease, color 120ms ease",
        ...style,
      }}
      {...rest}
    >
      {leadingDot ? (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: active ? "var(--pg-accent)" : "var(--pg-text-faint)",
            transition: "background-color 120ms ease",
          }}
        />
      ) : null}
      <span>{label}</span>
      {detail ? (
        <span style={{ opacity: 0.55, fontSize: 11, marginLeft: 2 }}>{detail}</span>
      ) : null}
    </button>
  );
});

export const CHIP_GROUP_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
};

// Section label: plain sans, lowercase, muted. Quiet marginalia — no
// tracking tricks, no italics, no caps. Sits next to the chips without
// competing for attention.
export const CHIP_SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--pg-text-muted)",
  letterSpacing: 0,
  marginRight: 8,
  lineHeight: 1.2,
};

// Bracket-state toggle — reads like a settings-file entry: `label[on]`.
// Deliberately unpill-shaped so it doesn't read as a generic UI chip.
// Label in sans; state in mono for a printed-toggle feel.
type BracketToggleProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: React.ReactNode;
  active: boolean;
  stateLabel?: { on: string; off: string };
};

export const BracketToggle = ({
  label,
  active,
  stateLabel = { on: "on", off: "off" },
  disabled,
  style,
  ...rest
}: BracketToggleProps) => {
  const state = active ? stateLabel.on : stateLabel.off;
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        background: "transparent",
        border: 0,
        padding: "2px 0",
        margin: 0,
        display: "inline-flex",
        alignItems: "baseline",
        gap: 2,
        cursor: disabled ? "not-allowed" : "pointer",
        // Label stays in the primary text color regardless of state so it
        // doesn't collide with the muted section labels beside it. The
        // bracketed state carries all the on/off signal.
        color: "var(--pg-text-primary)",
        fontFamily: "inherit",
        fontSize: 13,
        letterSpacing: "-0.005em",
        transition: "color 120ms ease",
        ...style,
      }}
      {...rest}
    >
      <span>{label}</span>
      <span
        aria-hidden
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          color: active ? "var(--pg-accent)" : "var(--pg-text-faint)",
          transition: "color 120ms ease",
          transform: "translateY(-0.5px)",
        }}
      >
        [{state}]
      </span>
    </button>
  );
};
