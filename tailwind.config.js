/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Gold-on-dark — matches hi-flow-mobile/src/constants/theme.ts
        bg: '#0F0F11',
        surface: '#1A1A1E',
        card: '#202027',
        border: '#2E2E36',
        muted: '#71717A',
        subtle: '#A1A1AA',
        brand: {
          DEFAULT: '#D4AF37',
          dark: '#B8962E',
          light: '#F3E5AB',
        },
        ok: '#3FB65B',
        danger: '#E5484D',
        warn: '#E0A83E',
        info: '#4C8DFF',
        // legacy slate steps still referenced in a few places
        'slate-850': '#1a1a1f',
      },
    },
  },
  plugins: [],
};
