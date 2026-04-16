/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        imile: {
          50:  '#fff7ed', 100: '#ffedd5', 200: '#fdd0a0',
          300: '#fba968', 400: '#f78238', 500: '#E97132',
          600: '#cc5a1e', 700: '#a84418', 800: '#883516',
          900: '#6f2d14', 950: '#3d1408',
        },
        navy: {
          800: '#122035', 900: '#0d1828', 950: '#0E2841',
        },
        wpp: {
          bg:      '#ECE5DD',
          sent:    '#DCF8C6',
          sentTxt: '#075E54',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
