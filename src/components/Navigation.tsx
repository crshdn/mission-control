'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';

const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/chat', label: 'Chat' },
  { href: '/feed', label: 'Feed' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/search', label: 'Search' },
  { href: '/usage', label: 'Usage' },
  { href: '/settings', label: 'Settings' },
];

export function Navigation() {
  const pathname = usePathname();
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    const poll = () =>
      fetch('/api/gateway/health')
        .then((r) => r.json())
        .then((d: { healthy: boolean }) => setHealthy(d.healthy))
        .catch(() => setHealthy(false));
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-14 bg-mc-bg-secondary/80 backdrop-blur-md border-b border-mc-border flex items-center px-4 gap-6">
      <Link href="/chat" className="flex items-center gap-2 shrink-0">
        <span className="text-xl">🦀</span>
        <span className="font-semibold text-mc-text hidden sm:inline">Mission Control</span>
      </Link>

      <div className="flex items-center gap-1 mx-auto">
        {NAV_LINKS.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                active
                  ? 'bg-mc-accent/15 text-mc-accent'
                  : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      <ThemeToggle />

      <div className="shrink-0 flex items-center gap-2" title={healthy ? 'Gateway connected' : 'Gateway offline'}>
        <span
          className={`w-2 h-2 rounded-full ${
            healthy === null
              ? 'bg-mc-text-secondary animate-pulse'
              : healthy
                ? 'bg-mc-accent-green'
                : 'bg-mc-accent-red'
          }`}
        />
        <span className="text-xs text-mc-text-secondary hidden sm:inline">
          {healthy === null ? '...' : healthy ? 'Online' : 'Offline'}
        </span>
      </div>
    </nav>
  );
}
