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
        // Dark theme colors matching the screenshot
        'autensa-bg': '#0d1117',
        'autensa-bg-secondary': '#161b22',
        'autensa-bg-tertiary': '#21262d',
        'autensa-border': '#30363d',
        'autensa-text': '#c9d1d9',
        'autensa-text-secondary': '#8b949e',
        'autensa-accent': '#58a6ff',
        'autensa-accent-green': '#3fb950',
        'autensa-accent-yellow': '#d29922',
        'autensa-accent-red': '#f85149',
        'autensa-accent-purple': '#a371f7',
        'autensa-accent-pink': '#db61a2',
        'autensa-accent-cyan': '#39d353',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
