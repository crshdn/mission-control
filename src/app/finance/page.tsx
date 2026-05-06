'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, RefreshCw, TrendingUp, TrendingDown, CreditCard,
  PiggyBank, AlertCircle, ArrowUpRight, ArrowDownLeft, Loader2,
  Wallet, BarChart3, Activity, CheckCircle2
} from 'lucide-react';

interface MonzoData {
  authenticated: boolean;
  user?: { userId: string; clientId: string };
  accounts: AccountData[];
  summary: {
    totalBalance: number;
    totalMonthlySubscriptions: number;
    activeSubscriptions: number;
  };
  fetchedAt: string;
  error?: string;
  expired?: boolean;
  setup?: string;
}

interface AccountData {
  accountId: string;
  description: string;
  type: string;
  currency: string;
  balance: {
    current: number;
    total: number;
    spentToday: number;
    potsTotal: number;
  } | null;
  pots: { id: string; name: string; balance: number; style: string }[];
  transactions: {
    total: number;
    debits: number;
    credits: number;
    totalDebits: number;
    totalCredits: number;
    netCashflow: number;
  };
  subscriptions: {
    name: string;
    monthlyEstimate: number;
    occurrences: number;
    amounts: number[];
    category: string;
  }[];
  monthlySpend: Record<string, number>;
  recentTransactions: {
    id: string;
    amount: number;
    description: string;
    merchant: string | null;
    category: string;
    created: string;
  }[];
}

// Static fallback subscriptions for when Monzo is unavailable
const FALLBACK_SUBS = [
  { name: 'Claude Max (Anthropic)', monthlyEstimate: 18.00, category: 'software' },
  { name: 'Leonardo AI API', monthlyEstimate: 10.00, category: 'software' },
  { name: 'giffgaff', monthlyEstimate: 10.00, category: 'transport' },
  { name: 'VPS (DigitalOcean)', monthlyEstimate: 6.00, category: 'services' },
  { name: 'OpenAI API', monthlyEstimate: 5.00, category: 'software' },
  { name: '1Password', monthlyEstimate: 3.50, category: 'software' },
  { name: 'GitHub Pro', monthlyEstimate: 3.40, category: 'software' },
  { name: 'Domain (ateliertools.com)', monthlyEstimate: 0.99, category: 'services' },
  { name: 'Domain (ahoy-vibe.com)', monthlyEstimate: 0.99, category: 'services' },
];

const FALLBACK_MONTHLY = {
  '2025-11': 48.20, '2025-12': 51.50, '2026-01': 53.80,
  '2026-02': 57.90, '2026-03': 55.40, '2026-04': 57.88,
};

const FALLBACK_RECENT = [
  { amount: -18.00, description: 'Claude.ai Subscription', merchant: 'Anthropic', category: 'software', created: '2026-04-01' },
  { amount: -10.00, description: 'Leonardo AI', merchant: 'Leonardo AI', category: 'software', created: '2026-04-02' },
  { amount: -10.00, description: 'giffgaff', merchant: 'giffgaff', category: 'transport', created: '2026-04-03' },
  { amount: -6.00, description: 'DigitalOcean', merchant: 'DigitalOcean', category: 'services', created: '2026-04-05' },
  { amount: -5.00, description: 'OpenAI', merchant: 'OpenAI', category: 'software', created: '2026-04-06' },
  { amount: -3.50, description: '1Password Families', merchant: '1Password', category: 'software', created: '2026-04-08' },
  { amount: -3.40, description: 'GitHub Pro', merchant: 'GitHub', category: 'software', created: '2026-04-09' },
];

function formatCurrency(n: number): string {
  return '£' + Math.abs(n).toFixed(2);
}

function formatMonth(key: string): string {
  const [y, m] = key.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(m) - 1] || m;
}

function categoryColour(cat: string): string {
  const map: Record<string, string> = {
    software: 'text-emerald-400 bg-emerald-400/10',
    services: 'text-violet-400 bg-violet-400/10',
    transport: 'text-amber-400 bg-amber-400/10',
    eating_out: 'text-orange-400 bg-orange-400/10',
    groceries: 'text-green-400 bg-green-400/10',
    entertainment: 'text-pink-400 bg-pink-400/10',
    bills: 'text-blue-400 bg-blue-400/10',
    other: 'text-slate-400 bg-slate-400/10',
  };
  return map[cat] || map.other;
}

export default function FinancePage() {
  const [data, setData] = useState<MonzoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/finance', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load');
        setData(json);
      } else {
        setData(json);
      }
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh every 60s
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Determine what data to show
  const isLive = data?.authenticated && !data.error;
  const accounts = data?.accounts || [];
  const summary = data?.summary || { totalBalance: 0, totalMonthlySubscriptions: 0, activeSubscriptions: 0 };

  // Use live or fallback data
  const subs = isLive
    ? accounts.flatMap(a => a.subscriptions)
    : FALLBACK_SUBS;
  const totalMonthly = isLive
    ? summary.totalMonthlySubscriptions
    : FALLBACK_SUBS.reduce((s, sub) => s + sub.monthlyEstimate, 0);

  const monthlySpend = isLive && accounts[0]
    ? accounts[0].monthlySpend
    : FALLBACK_MONTHLY;

  const recentTx = isLive && accounts[0]
    ? accounts[0].recentTransactions
    : FALLBACK_RECENT;

  const pots = isLive ? accounts.flatMap(a => a.pots) : [];
  const balance = isLive && accounts[0]?.balance ? accounts[0].balance : null;

  // Bar chart data
  const chartData = Object.entries(monthlySpend).sort();
  const chartMax = Math.max(...chartData.map(([, v]) => v), 1);

  // Savings suggestions
  const savings = [
    { amount: '£10/mo', text: 'Switch giffgaff to cheaper SIM if <2GB/mo used' },
    { amount: '£5-8/mo', text: 'Move tasks to free local models — reduce OpenAI spend' },
    { amount: '£3.40/mo', text: 'GitHub Free now includes Actions — Pro may be unnecessary' },
    { amount: '£1.98/mo', text: 'Bundle domains on single registrar for bulk discount' },
  ];
  const totalSavings = 20.38;

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-mc-accent-cyan animate-spin mx-auto mb-4" />
          <p className="text-mc-text-secondary">Loading financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mc-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-mc-bg-secondary/80 backdrop-blur-xl border-b border-mc-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-mc-text">Finance</h1>
              <p className="text-xs text-mc-text-secondary">
                {isLive ? '🔴 Live Monzo data' : '📊 Static data — Monzo token expired'}
                {lastRefresh && ` · Updated ${lastRefresh.toLocaleTimeString()}`}
              </p>
            </div>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-mc-bg-tertiary hover:bg-mc-bg-hover rounded-lg text-mc-text-secondary hover:text-mc-text transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm text-amber-300 font-medium">{error}</p>
              <p className="text-xs text-amber-400/60 mt-1">
                Showing cached data. Re-authenticate at <code className="bg-amber-500/10 px-1 rounded">~/.hermes/secrets/monzo-token.txt</code>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Top KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Balance */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5 hover:border-mc-accent/30 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-4 h-4 text-mc-text-secondary" />
              <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Balance</span>
            </div>
            <div className="text-3xl font-bold text-mc-text">
              {balance ? formatCurrency(balance.current) : '—'}
            </div>
            <div className="text-xs text-mc-text-secondary mt-1">
              {balance ? `+${formatCurrency(balance.potsTotal)} in pots` : 'Connect Monzo to see live balance'}
            </div>
          </div>

          {/* Monthly Burn */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5 hover:border-blue-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Monthly Burn</span>
            </div>
            <div className="text-3xl font-bold text-blue-400">{formatCurrency(totalMonthly)}</div>
            <div className="text-xs text-mc-text-secondary mt-1">All subscriptions</div>
          </div>

          {/* Annual Projection */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5 hover:border-violet-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-violet-400" />
              <span className="text-xs text-mc-text-secondary uppercase tracking-wider">Annual Projection</span>
            </div>
            <div className="text-3xl font-bold text-violet-400">{formatCurrency(totalMonthly * 12)}</div>
            <div className="text-xs text-mc-text-secondary mt-1">12× current rate</div>
          </div>

          {/* Cashflow (live only) */}
          <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5 hover:border-emerald-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-mc-text-secondary uppercase tracking-wider">
                {isLive ? 'Net Cashflow (90d)' : 'Potential Savings'}
              </span>
            </div>
            {isLive && accounts[0] ? (
              <>
                <div className={`text-3xl font-bold ${accounts[0].transactions.netCashflow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {accounts[0].transactions.netCashflow >= 0 ? '+' : '-'}{formatCurrency(accounts[0].transactions.netCashflow)}
                </div>
                <div className="text-xs text-mc-text-secondary mt-1">
                  {formatCurrency(accounts[0].transactions.totalCredits)} in · {formatCurrency(accounts[0].transactions.totalDebits)} out
                </div>
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-emerald-400">{formatCurrency(totalSavings)}</div>
                <div className="text-xs text-mc-text-secondary mt-1">Identified monthly savings</div>
              </>
            )}
          </div>
        </div>

        {/* Main content: 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Subscriptions + Trend */}
          <div className="lg:col-span-2 space-y-6">
            {/* Subscriptions table */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-mc-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-mc-text-secondary" />
                  <h2 className="font-semibold text-mc-text text-sm">Subscriptions</h2>
                </div>
                <span className="text-xs text-mc-text-secondary">
                  {subs.length} active · {formatCurrency(totalMonthly)}/mo
                </span>
              </div>
              <div className="divide-y divide-mc-border/50">
                {subs.map((sub, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-mc-bg-tertiary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${categoryColour(sub.category)}`}>
                        {sub.category}
                      </span>
                      <span className="text-sm text-mc-text">{sub.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-mc-text font-mono">
                      {formatCurrency(sub.monthlyEstimate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Spend trend */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-5">
                <TrendingUp className="w-4 h-4 text-mc-text-secondary" />
                <h2 className="font-semibold text-mc-text text-sm">6-Month Spend Trend</h2>
              </div>
              <div className="flex items-end gap-3 h-32">
                {chartData.map(([month, value], i) => (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-mc-text-secondary font-mono">
                      {formatCurrency(value)}
                    </span>
                    <div
                      className="w-full rounded-t-md transition-all duration-700 ease-out"
                      style={{
                        height: `${(value / chartMax) * 100}%`,
                        background: i === chartData.length - 1
                          ? 'linear-gradient(to top, #3b82f6, #60a5fa)'
                          : 'rgba(100, 116, 139, 0.3)',
                        minHeight: '4px',
                      }}
                    />
                    <span className="text-[10px] text-mc-text-secondary">{formatMonth(month)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: Pots, Recent Tx, Savings */}
          <div className="space-y-6">
            {/* Pots (live only) */}
            {isLive && pots.length > 0 && (
              <div className="bg-mc-bg-secondary border border-mc-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-mc-border flex items-center gap-2">
                  <PiggyBank className="w-4 h-4 text-mc-text-secondary" />
                  <h2 className="font-semibold text-mc-text text-sm">Pots</h2>
                </div>
                <div className="divide-y divide-mc-border/50">
                  {pots.map(pot => (
                    <div key={pot.id} className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm text-mc-text">{pot.name}</span>
                      <span className="text-sm font-mono font-semibold text-mc-text">
                        {formatCurrency(pot.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent transactions */}
            <div className="bg-mc-bg-secondary border border-mc-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-mc-border flex items-center gap-2">
                <Activity className="w-4 h-4 text-mc-text-secondary" />
                <h2 className="font-semibold text-mc-text text-sm">Recent Transactions</h2>
              </div>
              <div className="divide-y divide-mc-border/50 max-h-80 overflow-y-auto">
                {recentTx.map((tx, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-mc-bg-tertiary/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {tx.amount < 0
                        ? <ArrowUpRight className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        : <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm text-mc-text truncate">{tx.merchant || tx.description}</p>
                        <p className="text-[10px] text-mc-text-secondary">
                          {new Date(tx.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-sm font-mono font-semibold flex-shrink-0 ${tx.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {tx.amount < 0 ? '-' : '+'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Savings */}
            {!isLive && (
              <div className="bg-mc-bg-secondary border border-mc-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-mc-border flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h2 className="font-semibold text-mc-text text-sm">Quick Wins</h2>
                </div>
                <div className="divide-y divide-mc-border/50">
                  {savings.map((s, i) => (
                    <div key={i} className="px-5 py-3">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-bold text-emerald-400 flex-shrink-0">{s.amount}</span>
                        <span className="text-xs text-mc-text-secondary">{s.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-6">
          <p className="text-xs text-mc-text-secondary">
            {isLive ? '🔴 Live data from Monzo API' : '📊 Showing cached data'} · Auto-refreshes every 60s
          </p>
        </div>
      </div>
    </div>
  );
}
