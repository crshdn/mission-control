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
        'mc-bg': '#0d1117',
        'mc-bg-secondary': '#161b22',
        'mc-bg-tertiary': '#21262d',
        'mc-border': '#30363d',
        'mc-text': '#c9d1d9',
        'mc-text-secondary': '#8b949e',
        'mc-accent': '#58a6ff',
        'mc-accent-green': '#3fb950',
        'mc-accent-yellow': '#d29922',
        'mc-accent-red': '#f85149',
        'mc-accent-purple': '#a371f7',
        'mc-accent-pink': '#db61a2',
        'mc-accent-cyan': '#39d353',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
