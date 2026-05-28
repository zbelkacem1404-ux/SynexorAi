import React from 'react';

type LogoVariant = 'primary' | 'secondary' | 'icon';
type LogoTheme   = 'light' | 'dark';

interface SynexorAILogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  /** Width in px; height scales proportionally */
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}

const PINK      = '#E8366D';
const DARK_TEXT = '#1C1C1E';
const DARK_BG   = '#0F0F14';
const MUTED_BLUE = '#7FBCD2';

/** SynexorAI logo — symbol + optional wordmark */
export function SynexorAILogo({
  variant  = 'primary',
  theme    = 'light',
  width    = 240,
  className,
  style,
}: SynexorAILogoProps) {
  const isDark   = theme === 'dark';
  const barColor = isDark ? '#FFFFFF' : DARK_TEXT;

  /* ── Icon only ────────────────────────────────────────────── */
  if (variant === 'icon') {
    const h = Math.round(width * (72 / 100));
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 72"
        width={width}
        height={h}
        className={className}
        style={style}
        aria-label="SynexorAI icon"
        role="img"
      >
        {isDark && <rect width="100" height="72" fill={DARK_BG} />}
        <path d="M 2,8 L 56,8 L 70,18 L 56,28 L 2,28 Z"          fill={barColor} />
        <path d="M 98,44 L 44,44 L 30,54 L 44,64 L 98,64 Z"        fill={barColor} />
        <circle cx="52" cy="36" r="6.5" fill={PINK} />
      </svg>
    );
  }

  /* ── Secondary (stacked) ──────────────────────────────────── */
  if (variant === 'secondary') {
    const h = Math.round(width * (130 / 200));
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 130"
        width={width}
        height={h}
        className={className}
        style={style}
        aria-label="SynexorAI"
        role="img"
      >
        {isDark && <rect width="200" height="130" fill={DARK_BG} />}
        <g transform="translate(50, 0)">
          <path d="M 2,8 L 56,8 L 70,18 L 56,28 L 2,28 Z"         fill={barColor} />
          <path d="M 98,44 L 44,44 L 30,54 L 44,64 L 98,64 Z"      fill={barColor} />
          <circle cx="52" cy="36" r="6.5" fill={PINK} />
        </g>
        <text
          x="100" y="100"
          textAnchor="middle"
          fontFamily="'Inter','Helvetica Neue',Helvetica,Arial,sans-serif"
          fontWeight="700"
          fontSize="28"
          letterSpacing="0.05em"
        >
          <tspan fill={isDark ? '#FFFFFF' : DARK_TEXT}>SYNEXOR</tspan>
          <tspan fill={PINK}>AI</tspan>
        </text>
        <text
          x="100" y="117"
          textAnchor="middle"
          fontFamily="'Space Mono','Roboto Mono',monospace"
          fontSize="7.5"
          letterSpacing="0.18em"
          fill={isDark ? MUTED_BLUE : '#6B7280'}
        >
          AI-POWERED SUPPLY CHAIN
        </text>
      </svg>
    );
  }

  /* ── Primary (horizontal) ─────────────────────────────────── */
  const h = Math.round(width * (72 / 320));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 72"
      width={width}
      height={h}
      className={className}
      style={style}
      aria-label="SynexorAI"
      role="img"
    >
      {isDark && <rect width="320" height="72" fill={DARK_BG} />}
      {/* Symbol */}
      <path d="M 2,8 L 56,8 L 70,18 L 56,28 L 2,28 Z"             fill={barColor} />
      <path d="M 98,44 L 44,44 L 30,54 L 44,64 L 98,64 Z"          fill={barColor} />
      <circle cx="52" cy="36" r="6.5" fill={PINK} />
      {/* Wordmark */}
      <text
        x="114" y="48"
        fontFamily="'Inter','Helvetica Neue',Helvetica,Arial,sans-serif"
        fontWeight="700"
        fontSize="32"
      >
        <tspan fill={isDark ? '#FFFFFF' : DARK_TEXT}>Synexor</tspan>
        <tspan fill={PINK}>AI</tspan>
      </text>
    </svg>
  );
}

export default SynexorAILogo;
