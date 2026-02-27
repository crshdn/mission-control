'use client';

import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage or system preference
    const stored = localStorage.getItem('mc-theme');
    if (stored) {
      setIsDark(stored === 'dark');
    } else {
      setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('mc-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('mc-theme', 'light');
    }
  }, [isDark, mounted]);

  // Avoid hydration mismatch
  if (!mounted) {
    return (
      <button className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary">
        <Moon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <button
      onClick={() => setIsDark(!isDark)}
      className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary transition-colors"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
