/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          'muted-blue': '#7FBCD2',
          'vibrant-pink': '#E8366D',
          'soft-peach': '#E8A87C',
          'deep-burgundy': '#5B1A2A',
        },
        status: {
          compliant: '#7FBCD2', // Muted Blue
          warning: '#E8A87C', // Soft Peach
          deviation: '#E8366D', // Vibrant Pink
        },
        dark: '#0F0F14',
      },
      fontFamily: {
        primary: ['Inter', 'Helvetica Neue', 'sans-serif'],
        mono: ['Space Mono', 'Roboto Mono', 'monospace'],
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(to right, #7FBCD2, #E8366D)',
        'gradient-accent': 'linear-gradient(to right, #7FBCD2, #E8366D)',
      },
    },
  },
  plugins: [],
}
