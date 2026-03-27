/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        imile: {
          50:  '#eff4ff',
          100: '#dce6fe',
          200: '#c0d0fd',
          300: '#93b1fb',
          400: '#5f87f7',
          500: '#095EF7',
          600: '#084fd4',
          700: '#0640ab',
          800: '#083289',
          900: '#0a2d70',
          950: '#071c4a',
        },
        navy: {
          50:  '#f0f4ff',
          100: '#e0e8ff',
          700: '#1e2d4a',
          800: '#141e32',
          900: '#0d1525',
          950: '#080e19',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        // Clean & Premium — sombras muito sutis
        'xs':         '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'sm':         '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card':       '0 1px 3px 0 rgb(0 0 0 / 0.05)',
        'card-hover': '0 4px 16px 0 rgb(0 0 0 / 0.08)',
        'imile':      '0 4px 14px 0 rgb(9 94 247 / 0.25)',
        'imile-sm':   '0 2px 8px 0 rgb(9 94 247 / 0.20)',
        'popover':    '0 8px 30px 0 rgb(0 0 0 / 0.12), 0 2px 8px 0 rgb(0 0 0 / 0.06)',
      },
      borderRadius: {
        'xl':  '12px',
        '2xl': '16px',
      },
      spacing: {
        '18': '4.5rem',
      },
      letterSpacing: {
        'widest2': '0.15em',
      },
    },
  },
  plugins: [],
}
