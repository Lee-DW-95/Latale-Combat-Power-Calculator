/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        latale: {
          primary: '#6366f1',
          accent: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
};
