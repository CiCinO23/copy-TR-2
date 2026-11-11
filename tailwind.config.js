/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B0E11',
        panel: '#12171D',
        'panel-elevated': '#1A222B',
        kucoin: {
          DEFAULT: '#01BC8D',
          light: '#00D49F',
          dark: '#0D2B24',
          border: '#01BC8D',
        },
        gold: '#01BC8D',
        'gold-light': '#00D49F',
        green: {
          DEFAULT: '#01BC8D',
          dark: '#0D2B24',
          subtle: '#11332B',
        },
        redalert: '#F6465D',
        muted: '#8A99AD',
        'blue-accent': '#00C8FF',
      },
      fontFamily: {
        sans: ['Cairo', 'sans-serif'],
        mono: ['Cairo', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
