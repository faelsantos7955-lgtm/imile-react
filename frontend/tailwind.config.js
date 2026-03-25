/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // iMile brand azul oficial #095EF7
        imile: {
          50:  '#eff4ff',
          100: '#dce6fe',
          200: '#c0d0fd',
          300: '#93b1fb',
          400: '#5f87f7',
          500: '#095EF7',  // primary oficial
          600: '#084fd4',
          700: '#0640ab',
          800: '#083289',
          900: '#0a2d70',
          950: '#071c4a',
        },
        // Sidebar / dark surfaces
        navy: {
          50:  '#f0f4ff',
          100: '#e0e8ff',
          700: '#1e2d4a',
          800: '#162038',
          900: '#0e1728',
          950: '#090f1d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      boxShadow: {
        'card':  '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px -1px rgb(0 0 0 / 0.04)',
        'imile': '0 4px 14px 0 rgb(9 94 247 / 0.30)',
      },
    },
  },
  plugins: [],
}
