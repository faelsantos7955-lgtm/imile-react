/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        imile: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#3b82f6',
          500: '#0032A0',  // azul real iMile (site oficial)
          600: '#1048c8',
          700: '#1e3a8a',
          800: '#1e3470',
          900: '#151741',
          950: '#0a0d2e',
        },
        navy: {
          50:  '#f0f4f8',
          100: '#dbe4ef',
          700: '#1a2d45',
          800: '#122035',
          900: '#0d1828',
          950: '#0E2841',  // navy oficial do template iMile
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
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
        'imile':      '0 4px 14px 0 rgb(0 50 160 / 0.28)',
        'imile-sm':   '0 2px 8px 0 rgb(0 50 160 / 0.20)',
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
