/**
 * Hand-drawn inline-SVG pixel icons (16x16 grid, crisp edges, no binary
 * assets) — the "art pass" placeholder-emoji replacements called for by
 * trade-winds-design-doc.md §12. `currentColor` drives the base shape so
 * icons inherit surrounding text color; `accent` drives the highlight.
 */

import type { ReactNode } from 'react'

interface IconProps {
  size?: number
  accent?: string
  className?: string
}

const DEFAULT_ACCENT = '#e8a33d'

function Icon({
  size = 16,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      style={{ shapeRendering: 'crispEdges', imageRendering: 'pixelated', flexShrink: 0 }}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function SkylineIcon({ size = 16, accent = DEFAULT_ACCENT, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect x={1} y={9} width={4} height={6} fill="currentColor" />
      <rect x={6} y={5} width={4} height={10} fill="currentColor" />
      <rect x={11} y={8} width={4} height={7} fill="currentColor" />
      <rect x={0} y={15} width={16} height={1} fill="currentColor" />
      <rect x={2} y={10} width={1} height={1} fill={accent} />
      <rect x={3} y={12} width={1} height={1} fill={accent} />
      <rect x={7} y={7} width={1} height={1} fill={accent} />
      <rect x={7} y={10} width={1} height={1} fill={accent} />
      <rect x={8} y={12} width={1} height={1} fill={accent} />
      <rect x={12} y={10} width={1} height={1} fill={accent} />
      <rect x={12} y={12} width={1} height={1} fill={accent} />
    </Icon>
  )
}

export function CoinIcon({ size = 16, accent = DEFAULT_ACCENT, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect x={5} y={2} width={6} height={2} fill="currentColor" />
      <rect x={3} y={4} width={10} height={8} fill="currentColor" />
      <rect x={5} y={12} width={6} height={2} fill="currentColor" />
      <rect x={7} y={6} width={2} height={4} fill={accent} />
    </Icon>
  )
}

export function CargoIcon({ size = 16, accent = DEFAULT_ACCENT, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect x={2} y={4} width={12} height={2} fill="currentColor" />
      <rect x={2} y={12} width={12} height={2} fill="currentColor" />
      <rect x={2} y={4} width={2} height={10} fill="currentColor" />
      <rect x={12} y={4} width={2} height={10} fill="currentColor" />
      <rect x={2} y={8} width={12} height={2} fill={accent} />
      <rect x={7} y={4} width={2} height={10} fill={accent} />
    </Icon>
  )
}

export function CompassIcon({ size = 16, accent = DEFAULT_ACCENT, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect x={7} y={2} width={2} height={1} fill={accent} />
      <rect x={6} y={3} width={4} height={1} fill={accent} />
      <rect x={7} y={4} width={2} height={2} fill={accent} />
      <rect x={6} y={9} width={4} height={1} fill="currentColor" />
      <rect x={4} y={10} width={8} height={1} fill="currentColor" />
      <rect x={3} y={11} width={10} height={2} fill="currentColor" />
      <rect x={4} y={13} width={8} height={1} fill="currentColor" />
      <rect x={6} y={14} width={4} height={1} fill="currentColor" />
    </Icon>
  )
}

export function BedIcon({ size = 16, accent = DEFAULT_ACCENT, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect x={2} y={5} width={2} height={8} fill="currentColor" />
      <rect x={2} y={12} width={12} height={1} fill="currentColor" />
      <rect x={2} y={9} width={12} height={3} fill="currentColor" />
      <rect x={3} y={9} width={3} height={2} fill={accent} />
      <rect x={2} y={13} width={1} height={2} fill="currentColor" />
      <rect x={13} y={13} width={1} height={2} fill="currentColor" />
    </Icon>
  )
}

export function LedgerIcon({ size = 16, accent = DEFAULT_ACCENT, className }: IconProps) {
  return (
    <Icon size={size} className={className}>
      <rect x={3} y={2} width={10} height={12} fill="currentColor" />
      <rect x={3} y={2} width={2} height={12} fill={accent} />
      <rect x={6} y={5} width={5} height={1} fill={accent} />
      <rect x={6} y={8} width={5} height={1} fill={accent} />
      <rect x={6} y={11} width={5} height={1} fill={accent} />
    </Icon>
  )
}
