export const COLORS = {
  // Page + surface
  background: '#D6E8FF',
  card: '#FFFFFF',
  border: '#E2E8F0',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(15, 23, 42, 0.40)',

  // Sign-in surfaces (translucent over the brand backdrop image).
  inputBg: 'rgba(255,255,255,0.95)',
  cardBg:  'rgba(255,255,255,0.18)',

  // Brand
  navy: '#16356B',
  navySoft: '#EAF0F8',
  teal: '#19B6D2',
  tealSoft: '#E7F9FC',

  // Text — bumped subtext slightly darker so 13–15px reads in sun.
  text: '#0F172A',
  subtext: '#64748B',
  muted: '#94A3B8',

  // Status colors (pulled from per-screen duplicates, now centralized).
  red: '#EF4444',
  redSoft: '#FEF2F2',
  dangerSoft: '#FEF2F2',
  green: '#22C55E',
  greenSoft: '#ECFDF5',
  amber: '#E65100',
  amberSoft: '#FFF3E0',
  // Aliases for orange — files that already say COLORS.orange map here.
  orange: '#E65100',
  orangeSoft: '#FFF3E0',

  // Yellow / amount accents used on smart-tools and expense screens.
  yellow: '#F9A825',
  yellowSoft: '#FFF8E1',
  yellowText: '#A16207',
  blue: '#1565C0',
  blueSoft: '#E3F2FD',
  amount: '#C62828',

  // Disabled states (used by BigActionCard).
  disabled: '#94A3B8',
  disabledSoft: '#CBD5E1',
} as const

// Minimum tap target for gloved hands. Use this on action buttons.
export const TOUCH = {
  minHeight: 48,
  pillPaddingV: 14,
  pillPaddingH: 18,
} as const

// Body text scale tuned for outdoor readability. Keep section headings
// from per-screen typography but pipe body/subtext through these.
export const TYPE = {
  body: 15,
  bodyBold: 15,
  caption: 13,
} as const

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 28,
} as const

export const RADIUS = {
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  pill: 28,
} as const