# SynexorAI — Brand Assets

Version 1.0 · March 2026

---

## File Structure

```
logos/
├── primary/
│   ├── logo-primary.svg          Horizontal mark, light backgrounds
│   └── logo-primary-dark.svg     Horizontal mark, dark backgrounds
├── secondary/
│   ├── logo-secondary.svg        Stacked mark, light backgrounds
│   └── logo-secondary-dark.svg   Stacked mark, dark backgrounds
├── icons/
│   ├── logo-icon.svg             Symbol only, light backgrounds
│   └── logo-icon-dark.svg        Symbol only, dark backgrounds
├── monochrome/
│   ├── logo-black.svg            Full black, single-color print
│   └── logo-white.svg            Full white, single-color on dark
├── favicons/
│   └── favicon.svg               32×32 simplified browser mark
├── components/
│   └── SynexorAILogo.tsx         React TSX component (all variants)
├── brand-assets.json             Machine-readable color/variant registry
├── preview.html                  Interactive preview (open in browser)
└── README.md                     This file
```

---

## Colours

| Name           | Hex       | Usage                                    |
|----------------|-----------|------------------------------------------|
| Vibrant Pink   | `#E8366D` | "AI" suffix, pivot dot, primary accents  |
| Muted Blue     | `#7FBCD2` | Tagline on dark, secondary accents       |
| Soft Peach     | `#E8A87C` | Warm highlight, illustrative contexts    |
| Deep Burgundy  | `#5B1A2A` | Deep dark accent                         |
| Dark BG        | `#0F0F14` | Dark mode background                     |
| Dark Text      | `#1C1C1E` | Symbol fill and wordmark on light bg     |

---

## Typography

- **Primary wordmark:** Inter / Helvetica Neue — Bold 700
- **Tagline / data labels:** Space Mono / Roboto Mono — Regular 400

---

## React Component

```tsx
import { SynexorAILogo } from './logos/components/SynexorAILogo';

// Horizontal primary — light
<SynexorAILogo width={240} />

// Horizontal primary — dark
<SynexorAILogo theme="dark" width={240} />

// Stacked secondary — dark
<SynexorAILogo variant="secondary" theme="dark" width={160} />

// Icon only — light
<SynexorAILogo variant="icon" width={80} />
```

**Props:**

| Prop      | Type                              | Default     | Description                   |
|-----------|-----------------------------------|-------------|-------------------------------|
| variant   | `'primary' \| 'secondary' \| 'icon'` | `'primary'` | Logo layout variant           |
| theme     | `'light' \| 'dark'`              | `'light'`   | Colour scheme                 |
| width     | `number`                         | `240`       | Width in px; height auto-scales |
| className | `string`                         | —           | CSS class on `<svg>`          |
| style     | `React.CSSProperties`            | —           | Inline style on `<svg>`       |

---

## Usage Rules

- **Always** use the dark variant on backgrounds darker than `#888`.
- **Never** alter the `#E8366D` "AI" tspan colour.
- **Never** stretch, distort, rotate, or add effects to the symbol.
- **Minimum size:** 120 px wide for the horizontal logo; 24 px for the icon.
- **Clear space:** maintain a margin equal to the pivot dot height (~6.5 SVG units, ~7 % of logo height) on all sides.
- Use monochrome variants only for single-colour print (embossing, screen-printing, stamps).

---

## Preview

Open `preview.html` in any browser to see all variants on light and dark backgrounds with the full colour palette.
