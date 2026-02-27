import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  safelist: [
    // Apple color classes used in @apply
    'bg-apple-bg', 'bg-apple-bg-secondary', 'bg-apple-bg-tertiary',
    'text-apple-text', 'text-apple-text-secondary', 'text-apple-text-tertiary',
    'border-apple-border', 'border-apple-border-secondary',
    'bg-apple-accent', 'text-apple-accent',
    'bg-apple-green', 'bg-apple-yellow', 'bg-apple-red', 'bg-apple-orange', 'bg-apple-blue',
  ],
  theme: {
    extend: {
      colors: {
        // Mission Control color system (uses CSS variables for dark mode)
        'mc-bg': 'var(--mc-bg)',
        'mc-bg-secondary': 'var(--mc-bg-secondary)',
        'mc-bg-tertiary': 'var(--mc-bg-tertiary)',
        'mc-border': 'var(--mc-border)',
        'mc-text': 'var(--mc-text)',
        'mc-text-secondary': 'var(--mc-text-secondary)',
        'mc-accent': 'var(--mc-accent)',
        'mc-accent-cyan': 'var(--mc-accent-cyan)',
        'mc-accent-purple': 'var(--mc-accent-purple)',
        'mc-accent-green': 'var(--mc-accent-green)',
        'mc-accent-yellow': 'var(--mc-accent-yellow)',
        'mc-accent-red': 'var(--mc-accent-red)',
        'mc-accent-pink': 'var(--mc-accent-pink)',
        
        // Apple-style color system
        // Light mode (primary)
        'apple-bg': '#ffffff',
        'apple-bg-secondary': '#f9f9f9',
        'apple-bg-tertiary': '#f4f4f5',
        'apple-bg-overlay': 'rgba(255, 255, 255, 0.8)',
        
        'apple-border': '#e5e5e7',
        'apple-border-secondary': '#d2d2d7',
        
        'apple-text': '#1d1d1f',
        'apple-text-secondary': '#86868b',
        'apple-text-tertiary': '#a1a1a6',
        
        'apple-accent': '#0071e3',
        'apple-accent-hover': '#0077ed',
        'apple-accent-pressed': '#004db3',
        
        // Status colors (Apple-inspired)
        'apple-green': '#30d158',
        'apple-yellow': '#ffcc02',
        'apple-red': '#ff3b30',
        'apple-orange': '#ff9500',
        'apple-blue': '#007aff',
        'apple-purple': '#af52de',
        'apple-pink': '#ff2d92',
        'apple-cyan': '#64d2ff',
        
        // Dark mode colors
        dark: {
          'apple-bg': '#000000',
          'apple-bg-secondary': '#1c1c1e',
          'apple-bg-tertiary': '#2c2c2e',
          'apple-bg-overlay': 'rgba(28, 28, 30, 0.8)',
          
          'apple-border': '#38383a',
          'apple-border-secondary': '#48484a',
          
          'apple-text': '#ffffff',
          'apple-text-secondary': '#98989d',
          'apple-text-tertiary': '#636366',
          
          'apple-accent': '#0984ff',
          'apple-accent-hover': '#409cff',
          'apple-accent-pressed': '#0056b3',
        }
      },
      fontFamily: {
        // Apple's SF Pro font stack fallback
        'apple': [
          'ui-sans-serif',
          '-apple-system', 
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text', 
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        'apple-mono': [
          'SF Mono',
          'Monaco',
          'Inconsolata',
          'Fira Code',
          'Dank Mono',
          'Cascadia Code',
          'ui-monospace',
          'monospace'
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        // Apple's typography scale
        'apple-large-title': ['34px', { lineHeight: '41px', fontWeight: '700', letterSpacing: '-0.374px' }],
        'apple-title-1': ['28px', { lineHeight: '34px', fontWeight: '700', letterSpacing: '-0.374px' }],
        'apple-title-2': ['22px', { lineHeight: '28px', fontWeight: '700', letterSpacing: '-0.26px' }],
        'apple-title-3': ['20px', { lineHeight: '25px', fontWeight: '600', letterSpacing: '-0.45px' }],
        'apple-headline': ['17px', { lineHeight: '22px', fontWeight: '600', letterSpacing: '-0.43px' }],
        'apple-body': ['17px', { lineHeight: '22px', fontWeight: '400', letterSpacing: '-0.43px' }],
        'apple-callout': ['16px', { lineHeight: '21px', fontWeight: '400', letterSpacing: '-0.32px' }],
        'apple-subhead': ['15px', { lineHeight: '20px', fontWeight: '400', letterSpacing: '-0.24px' }],
        'apple-footnote': ['13px', { lineHeight: '18px', fontWeight: '400', letterSpacing: '-0.08px' }],
        'apple-caption-1': ['12px', { lineHeight: '16px', fontWeight: '400', letterSpacing: '0px' }],
        'apple-caption-2': ['11px', { lineHeight: '13px', fontWeight: '400', letterSpacing: '0.07px' }],
      },
      spacing: {
        // Apple's spacing system (4px base)
        'apple-1': '4px',
        'apple-2': '8px',
        'apple-3': '12px',
        'apple-4': '16px',
        'apple-5': '20px',
        'apple-6': '24px',
        'apple-8': '32px',
        'apple-10': '40px',
        'apple-12': '48px',
        'apple-16': '64px',
        'apple-20': '80px',
        'apple-24': '96px',
      },
      borderRadius: {
        // Apple's border radius system
        'apple-xs': '4px',
        'apple-sm': '6px',
        'apple-md': '8px',
        'apple-lg': '12px',
        'apple-xl': '16px',
        'apple-2xl': '20px',
        'apple-3xl': '24px',
      },
      boxShadow: {
        // Apple-style shadows - subtle and sophisticated
        'apple-sm': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'apple-md': '0 4px 6px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.06)',
        'apple-lg': '0 10px 15px rgba(0, 0, 0, 0.04), 0 4px 6px rgba(0, 0, 0, 0.05)',
        'apple-xl': '0 20px 25px rgba(0, 0, 0, 0.04), 0 10px 10px rgba(0, 0, 0, 0.04)',
        'apple-card': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 20px rgba(0, 0, 0, 0.04)',
        'apple-hover': '0 8px 25px rgba(0, 0, 0, 0.06), 0 4px 10px rgba(0, 0, 0, 0.05)',
        // Dark mode shadows
        'apple-dark-sm': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'apple-dark-md': '0 4px 6px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)',
        'apple-dark-lg': '0 10px 15px rgba(0, 0, 0, 0.3), 0 4px 6px rgba(0, 0, 0, 0.2)',
        'apple-dark-xl': '0 20px 25px rgba(0, 0, 0, 0.3), 0 10px 10px rgba(0, 0, 0, 0.2)',
        'apple-dark-card': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 20px rgba(0, 0, 0, 0.15)',
      },
      animation: {
        // Subtle Apple-style animations
        'apple-fade-in': 'apple-fade-in 0.3s ease-out',
        'apple-slide-up': 'apple-slide-up 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'apple-scale-in': 'apple-scale-in 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        'apple-bounce': 'apple-bounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },
      backdropBlur: {
        'apple': '20px',
        'apple-xl': '40px',
      },
    },
  },
  plugins: [
    // Custom Apple-style utilities
    function({ addUtilities }: any) {
      addUtilities({
        '.apple-glass': {
          'backdrop-filter': 'blur(20px) saturate(180%)',
          'background-color': 'rgba(255, 255, 255, 0.72)',
          'border': '1px solid rgba(255, 255, 255, 0.18)',
        },
        '.apple-glass-dark': {
          'backdrop-filter': 'blur(20px) saturate(180%)',
          'background-color': 'rgba(28, 28, 30, 0.72)',
          'border': '1px solid rgba(255, 255, 255, 0.08)',
        },
        '.apple-button': {
          'transition': 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          'transform-origin': 'center center',
        },
        '.apple-button:active': {
          'transform': 'scale(0.96)',
        },
        '.apple-text-rendering': {
          'text-rendering': 'optimizeLegibility',
          '-webkit-font-smoothing': 'antialiased',
          '-moz-osx-font-smoothing': 'grayscale',
        }
      });
    }
  ],
};

export default config;
