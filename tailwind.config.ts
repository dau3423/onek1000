import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#FF6B00', dark: '#E55F00' },
        cheap: '#16A34A',
        normal: '#EAB308',
        expensive: '#DC2626',
      },
      fontFamily: {
        sans: ['var(--font-pretendard)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        sheet: '0 -8px 24px rgba(0,0,0,.12)',
      },
    },
  },
  plugins: [],
};

export default config;
