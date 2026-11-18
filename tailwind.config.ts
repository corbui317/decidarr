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
          primary: 'var(--decidarr-primary)',
          secondary: 'var(--decidarr-secondary)',
          dark: 'var(--decidarr-dark)',
          accent: 'var(--decidarr-accent)',
          surface: 'var(--decidarr-surface)',
          text: 'var(--decidarr-text)',
          'text-muted': 'var(--decidarr-text-muted)',
          border: 'var(--decidarr-border)',
          success: '#22c55e',
          error: '#ef4444',
        },
      },
      animation: {
        'spin-slot': 'spinSlot 0.1s linear infinite',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'neon-flicker': 'neonFlicker 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        spinSlot: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-100%)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px var(--decidarr-glow)' },
          '50%': { boxShadow: '0 0 40px var(--decidarr-glow-strong)' },
        },
        neonFlicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': {
            textShadow: '0 0 4px var(--decidarr-primary), 0 0 11px var(--decidarr-primary), 0 0 19px var(--decidarr-primary)',
          },
          '20%, 24%, 55%': {
            textShadow: 'none',
          },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
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
