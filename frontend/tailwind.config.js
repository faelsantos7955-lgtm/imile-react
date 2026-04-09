/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        imile: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fdd0a0',
          300: '#fba968',
          400: '#f78238',
          500: '#E97132',  // laranja iMile — cor oficial do template
          600: '#cc5a1e',
          700: '#a84418',
          800: '#883516',
          900: '#6f2d14',
          950: '#3d1408',
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
        'imile':      '0 4px 14px 0 rgb(233 113 50 / 0.30)',
        'imile-sm':   '0 2px 8px 0 rgb(233 113 50 / 0.22)',
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
