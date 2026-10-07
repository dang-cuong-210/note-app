/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['var(--font-ui)'], brand: ['var(--font-brand)'], mono: ['var(--font-code)'] },
      fontSize: {
        'page-title': ['28px', { lineHeight: '1.25', fontWeight: '700' }],
        h1: ['24px', { lineHeight: '1.25', fontWeight: '700' }],
        h2: ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['17px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        ui: ['14px', { lineHeight: '1.5', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      transitionTimingFunction: {
        'ease-out-quart': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
