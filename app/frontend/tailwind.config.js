/** @type {import('tailwindcss').Config} */
// Colours come from CSS variables (see index.css) as RGB channels so opacity modifiers work.
const rgb = (name) => ({ opacityValue }) => (opacityValue === undefined ? `rgb(var(${name}))` : `rgb(var(${name}) / ${opacityValue})`)

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Button variants are composed dynamically (btn-${variant}), so Tailwind cannot see them.
  safelist: ['btn-primary', 'btn-oil', 'btn-ghost', 'btn-danger'],
  theme: {
    extend: {
      colors: {
        app: rgb('--bg-rgb'),
        surface: { DEFAULT: rgb('--surface-rgb'), 2: rgb('--surface-2-rgb') },
        line: { DEFAULT: rgb('--line-rgb'), strong: rgb('--line-strong-rgb') },
        ink: { DEFAULT: rgb('--ink-rgb'), 2: rgb('--ink-2-rgb'), 3: rgb('--ink-3-rgb') },
        accent: { DEFAULT: rgb('--accent-rgb'), soft: rgb('--accent-soft-rgb') },
        signal: rgb('--signal-rgb'),
        ok: rgb('--ok-rgb'),
        warn: rgb('--warn-rgb'),
        bad: rgb('--bad-rgb'),
        hud: { cyan: rgb('--hud-cyan-rgb'), white: rgb('--hud-white-rgb'), bg: rgb('--hud-bg-rgb') },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { DEFAULT: '4px', md: '4px', lg: '6px', xl: '6px', '2xl': '8px' },
      keyframes: {
        rise: { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'none' } },
        page: { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'none' } },
      },
      animation: { rise: 'rise .35s ease-out both', page: 'page .28s ease-out both' },
    },
  },
  plugins: [],
}
