// Brand source of truth — colors + strings + fonts, kept in lockstep with
// the website's design tokens (`frontend/src/app/globals.css` @theme block).
// Every embed and every canvas-rendered asset (PNL cards, banners) MUST
// import from here so a single palette edit propagates everywhere.
//
// Mapping back to globals.css:
//   bgBase           = --color-offivex-bg-base           (#0B0918)
//   bgSurface        = --color-offivex-bg-surface        (#131129)
//   bgElevated       = --color-offivex-bg-elevated       (#1B182F)
//   purple           = --color-offivex-purple            (#9945FF, Solana primary)
//   purpleLight      = --color-offivex-purple-light      (#B070FF)
//   purpleDark       = --color-offivex-purple-dark       (#6B21A8)
//   purpleDeep       = --color-offivex-purple-deep       (#2E1065)
//   green            = --color-offivex-green             (#14F195, Solana)
//   greenLight       = --color-offivex-green-light       (#5DFFC0)
//   greenDark        = --color-offivex-green-dark        (#0FA86A)
//   textPrimary      = --color-offivex-text-primary      (#F5F3FF)
//   textSecondary    = --color-offivex-text-secondary    (#A8A3BD)
//   textMuted        = --color-offivex-text-muted        (#8581A0, WCAG AA-clean)

const COLOR = {
  // Backgrounds
  bgBase: '#0B0918',
  bgSurface: '#131129',
  bgElevated: '#1B182F',
  // Purple ramp (Solana brand)
  purple: '#9945FF',
  purpleLight: '#B070FF',
  purpleDark: '#6B21A8',
  purpleDeep: '#2E1065',
  // Green ramp (Solana brand)
  green: '#14F195',
  greenLight: '#5DFFC0',
  greenDark: '#0FA86A',
  // Text
  textPrimary: '#F5F3FF',
  textSecondary: '#A8A3BD',
  textMuted: '#8581A0',
  // Borders / glass — mirror the --offivex-border / --offivex-glass rgba()s.
  pillBorder: 'rgba(168,163,189,0.20)',
  border: 'rgba(255,255,255,0.06)',
  glass: 'rgba(255,255,255,0.04)',

  // ── Discord embed colors (integer form for EmbedBuilder.setColor) ────────
  // Each value here corresponds to the left vertical bar Discord paints on
  // the embed. We pick from the same ramp so embeds match the site.
  embedDefault: 0x9945ff, // purple — neutral / informational by default
  embedSuccess: 0x14f195, // green — confirmation, success
  embedWarning: 0xff9300, // amber — caution
  embedDanger: 0xff4040, // red — destructive / error
  embedInfo: 0xb070ff, // purple-light — secondary info
};

// Font stacks — node-canvas can't load TTF without bundling, so we fall back
// to widely-available system fonts that visually match the website family
// (Bricolage Grotesque for display, Figtree for body). Segoe UI is a clean
// neutral choice on the Windows host; Arial as ultimate fallback.
const FONT = {
  display: 'bold 64px "Segoe UI", Arial, sans-serif',
  title: 'bold 28px "Segoe UI", Arial, sans-serif',
  subtitle: '18px "Segoe UI", Arial, sans-serif',
  body: '14px "Segoe UI", Arial, sans-serif',
  small: '11px "Segoe UI", Arial, sans-serif',
};

const BRAND_NAME = 'Offivex';
const SITE_URL = 'offivex.gg';

function brandFooter() {
  return `${BRAND_NAME} © ${new Date().getFullYear()}`;
}

module.exports = { COLOR, FONT, BRAND_NAME, SITE_URL, brandFooter };
