/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070b14',
          900: '#0b1120',
          850: '#0f172a',
          800: '#17223b',
          700: '#1e293b',
          600: '#334155'
        },
        risk: {
          low: '#10b981',      // Emerald Green
          moderate: '#f59e0b', // Amber/Yellow
          high: '#f97316',     // Orange
          critical: '#ef4444'  // Crimson Red
        }
      }
    },
  },
  plugins: [],
}
