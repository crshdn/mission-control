'use client';

import { useState, useEffect, useCallback } from 'react';
import { Moon, Sun } from 'lucide-react';

// Safe localStorage access (handles cases where it's disabled or quota exceeded)
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore localStorage errors (quota exceeded, disabled, etc.)
  }
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Initialize theme from storage or system preference
  useEffect(() => {
    setMounted(true);
    try {
      const stored = safeGetItem('mc-theme');
      if (stored) {
        setIsDark(stored === 'dark');
      } else if (typeof window !== 'undefined' && window.matchMedia) {
        setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    } catch {
      // Fallback to light mode on any error
      setIsDark(false);
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;
    
    try {
      const root = document.documentElement;
      if (isDark) {
        root.classList.add('dark');
        safeSetItem('mc-theme', 'dark');
      } else {
        root.classList.remove('dark');
        safeSetItem('mc-theme', 'light');
      }
    } catch {
      // Ignore DOM errors (shouldn't happen, but defensive)
    }
  }, [isDark, mounted]);

  // Memoized toggle handler
  const handleToggle = useCallback(() => {
    setIsDark(prev => !prev);
  }, []);

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
      onClick={handleToggle}
      className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary transition-colors"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
