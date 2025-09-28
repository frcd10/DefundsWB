// Font tokens centralization
// Geist font variables are provided by next/font in layout.tsx; we reference semantic names here.

export const fonts = {
  sansVariable: '--font-geist-sans',
  monoVariable: '--font-geist-mono',
  stacks: {
    sans: `var(--font-geist-sans), system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'`,
    mono: `var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace`,
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export type Fonts = typeof fonts;
