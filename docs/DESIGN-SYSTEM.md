# Hopewick 2.0 design system

Files:

* `assets/hopewick-tokens.css` - all colours, type, spacing, radii, shadows, motion.
  Light (`:root`), dark (`:root[data-theme="dark"]`) and system dark
  (`prefers-color-scheme`, unless the person chose light).
* `assets/hopewick-ui.css` - shared components with the `hw-` prefix: buttons, cards,
  inputs, chips, toggles, crisis button, bottom nav, sidebar nav, empty and loading
  states, toasts, progress.
* `assets/theme.js` - light/dark switch for every page. Saves the choice on the device
  (`localStorage hopewick.theme`); any button with `data-theme-toggle` toggles it.
* `tools/design/contrast.mjs` - WCAG 2.2 AA check of every text/UI colour pair in all
  three themes (`npm run test:contrast`). Also run by `tests/design-tokens.test.mjs`.

## Brand palette (approved 18 Oct 2026)

The founder approved logo variant F ("mockup navy"): navy hands, light-blue river,
gold sunrise, all-navy wordmark, no red. Tokens in the **"BRAND PALETTE - swap here"**
blocks of `assets/hopewick-tokens.css`:

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand-primary` | `#233a55` | `#acd2e9` | primary buttons, links |
| `--brand-primary-strong` / `--brand-ink` | `#0b1b37` | `#d6e9f5` / `#eef3f9` | hover, headings, body text |
| `--brand-secondary` | `#344f6f` | `#8fb0d0` | icons, charts |
| `--brand-river` | `#acd2e9` | `#acd2e9` | decorative fills (text on it uses `--on-river` `#0b1b37`) |
| `--accent-gold-bright` / `--accent-gold-light` | `#e3ab54` / `#ebc78b` | same | logo gold: rules, dots, badges (not body text) |
| `--accent-gold` | `#7f5a14` | `#ebc78b` | gold text (darkened in light mode for AA) |
| `--accent-warm` | `#9a4a3a` | `#f0a596` | muted warm accent for alerts |
| `--danger` | `#a3271d` | `#ff9e92` | crisis and destructive actions only (semantic, not brand) |

To re-colour later, change only those blocks (the dark values are duplicated in the
explicit and system-dark blocks) and run `npm run test:contrast`.

## Logo files

`tools/brand/build_logo_assets.py` builds every logo file from
`brand/source/hopewick-logo-source.png` (variant F): app icons 512/192/180/32/16,
maskable icons, `favicon.ico`, `apple-touch-icon.png`, `brand/hopewick-mark*.png`
(header), `brand/hopewick-lockup*.png`, the 1200x630 `og-image.png`, and the
dark-mode lockup `brand/hopewick-lockup-dark*.png` (same artwork, only the wordmark
and tagline pixels recoloured to near-white, gold divider kept). Pages show the
light or dark lockup with `.hw-lockup__light` / `.hw-lockup__dark`.

## Rules

* Text 4.5:1, large text and UI parts (borders of inputs, focus ring) 3:1.
* Focus: 3px outline in `--focus-color`, never removed.
* Touch targets at least 44px (`--tap`).
* `prefers-reduced-motion: reduce` turns animation off.
* Crisis help (Lifeline 13 11 14, 000) is visible on every screen, works without the
  AI chat, and is never behind Plus.
