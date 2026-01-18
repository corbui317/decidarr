import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        decidarr: {
          primary: '#E5A00D',
          secondary: '#1a1a2e',
          dark: '#0f0f1a',
          accent: '#cc7000',
          success: '#22c55e',
          error: '#ef4444',
        },
      },
      animation: {
        'spin-slot': 'spinSlot 0.1s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        spinSlot: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-100%)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(229, 160, 13, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(229, 160, 13, 0.6)' },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
