import { NextRequest, NextResponse } from 'next/server';

const MONZO_API = 'https://api.monzo.com';

function getToken(): string | null {
  const fs = require('fs');
  const path = require('path');
  const tokenPath = path.join(process.env.HOME || '', '.hermes', 'secrets', 'monzo-token.txt');
  try {
    return fs.readFileSync(tokenPath, 'utf8').trim();
  } catch {
    return null;
  }
}

async function monzoFetch(endpoint: string, token: string) {
  const res = await fetch(`${MONZO_API}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.message || `Monzo API error: ${res.status}`);
  }
  return res.json();
}

export async function GET(request: NextRequest) {
  const token = getToken();
  if (!token) {
    return NextResponse.json({ error: 'Monzo token not found', setup: 'Run: hermes login or place token at ~/.hermes/secrets/monzo-token.txt' }, { status: 401 });
  }

  try {
    // 1. Whoami — verify token
    const whoami = await monzoFetch('/ping/whoami', token);

    // 2. List accounts
    const { accounts } = await monzoFetch('/accounts', token);

    const results = await Promise.all(accounts.map(async (acct: any) => {
      const accountId = acct.id;

      // 3. Balance
      const balance = await monzoFetch(`/balance?account_id=${accountId}`, token).catch(() => null);

      // 4. Pots
      const { pots } = await monzoFetch(`/pots?current_account_id=${accountId}`, token).catch(() => ({ pots: [] }));

      // 5. Transactions (last 90 days)
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { transactions } = await monzoFetch(
        `/transactions?account_id=${accountId}&since=${since}&limit=100&expand[]=merchant`,
        token
      ).catch(() => ({ transactions: [] }));

      // 6. Categorise transactions
      const successfulTx = transactions.filter((tx: any) => !tx.decline_reason);
      const debits = successfulTx.filter((tx: any) => tx.amount < 0);
      const credits = successfulTx.filter((tx: any) => tx.amount > 0);

      const totalDebits = debits.reduce((s: number, tx: any) => s + Math.abs(tx.amount), 0);
      const totalCredits = credits.reduce((s: number, tx: any) => s + tx.amount, 0);

      // 7. Find recurring subscriptions (group by merchant/description)
      const subMap = new Map<string, { name: string; amounts: number[]; dates: string[]; category: string }>();
      const subscriptionKeywords = [
        'anthropic', 'claude', 'openai', 'cloudflare', 'giffgaff', 'apple',
        'google', 'github', 'vercel', 'digitalocean', 'vultr', 'stripe',
        'supabase', 'resend', '1password', 'xero', 'notion', 'linear',
      ];

      for (const tx of debits) {
        const desc = (tx.description || '').toLowerCase();
        const merchantName = tx.merchant?.name?.toLowerCase() || '';
        const matchKey = tx.merchant?.id || desc;

        // Check if this looks like a subscription
        const isSub = subscriptionKeywords.some(kw => desc.includes(kw) || merchantName.includes(kw)) ||
                      tx.category === 'subscriptions' || tx.category === 'software';

        if (isSub && matchKey) {
          if (!subMap.has(matchKey)) {
            subMap.set(matchKey, {
              name: tx.merchant?.name || tx.description?.split(' ')[0] || 'Unknown',
              amounts: [],
              dates: [],
              category: tx.category || 'other',
            });
          }
          const entry = subMap.get(matchKey)!;
          entry.amounts.push(Math.abs(tx.amount));
          entry.dates.push(tx.created);
        }
      }

      const subscriptions = Array.from(subMap.values()).map(sub => {
        const avg = sub.amounts.reduce((a, b) => a + b, 0) / sub.amounts.length;
        return {
          name: sub.name,
          monthlyEstimate: Math.round(avg) / 100,
          occurrences: sub.amounts.length,
          amounts: sub.amounts.map(a => a / 100),
          category: sub.category,
        };
      }).sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);

      // 8. Monthly spend trend (last 6 months)
      const monthlySpend: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlySpend[key] = 0;
      }
      for (const tx of debits) {
        const key = tx.created.substring(0, 7); // "2026-04"
        if (key in monthlySpend) {
          monthlySpend[key] += Math.abs(tx.amount) / 100;
        }
      }

      // 9. Total pots value
      const potsTotal = pots.reduce((s: number, p: any) => s + p.balance, 0);

      return {
        accountId,
        description: acct.description,
        type: acct.type,
        currency: acct.currency,
        balance: balance ? {
          current: balance.balance / 100,
          total: balance.total_balance / 100,
          spentToday: balance.spend_today / 100,
          potsTotal: potsTotal / 100,
        } : null,
        pots: pots.map((p: any) => ({
          id: p.id,
          name: p.name,
          balance: p.balance / 100,
          style: p.style,
          deleted: p.deleted,
        })).filter((p: any) => !p.deleted),
        transactions: {
          total: successfulTx.length,
          debits: debits.length,
          credits: credits.length,
          totalDebits: totalDebits / 100,
          totalCredits: totalCredits / 100,
          netCashflow: (totalCredits - totalDebits) / 100,
        },
        subscriptions,
        monthlySpend,
        recentTransactions: successfulTx.slice(0, 20).map((tx: any) => ({
          id: tx.id,
          amount: tx.amount / 100,
          description: tx.description,
          merchant: tx.merchant?.name || null,
          category: tx.category,
          created: tx.created,
          declineReason: tx.decline_reason,
        })),
      };
    }));

    // Total across accounts
    const totalBalance = results.reduce((s, r) => s + (r.balance?.current || 0), 0);
    const totalSubs = results.flatMap(r => r.subscriptions);
    const totalMonthlySubs = totalSubs.reduce((s, sub) => s + sub.monthlyEstimate, 0);

    return NextResponse.json({
      authenticated: true,
      user: { userId: whoami.user_id, clientId: whoami.client_id },
      accounts: results,
      summary: {
        totalBalance,
        totalMonthlySubscriptions: Math.round(totalMonthlySubs * 100) / 100,
        activeSubscriptions: totalSubs.length,
      },
      fetchedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    const isExpired = error.message?.includes('expired') || error.message?.includes('invalid_token');
    return NextResponse.json(
      {
        error: error.message || 'Failed to fetch Monzo data',
        expired: isExpired,
        setup: isExpired ? 'Token expired. Re-auth: run `hermes login` or update ~/.hermes/secrets/monzo-token.txt' : undefined,
      },
      { status: isExpired ? 401 : 500 }
    );
  }
}
