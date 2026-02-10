import type { Config } from 'tailwindcss';

function mcColor(name: string) {
  return `rgb(var(--mc-${name}) / <alpha-value>)`;
}

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'mc-bg': mcColor('bg'),
        'mc-bg-secondary': mcColor('bg-secondary'),
        'mc-bg-tertiary': mcColor('bg-tertiary'),
        'mc-border': mcColor('border'),
        'mc-text': mcColor('text'),
        'mc-text-secondary': mcColor('text-secondary'),
        'mc-accent': mcColor('accent'),
        'mc-accent-green': mcColor('accent-green'),
        'mc-accent-yellow': mcColor('accent-yellow'),
        'mc-accent-red': mcColor('accent-red'),
        'mc-accent-purple': mcColor('accent-purple'),
        'mc-accent-pink': mcColor('accent-pink'),
        'mc-accent-cyan': mcColor('accent-cyan'),
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
