import { NextRequest, NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';

interface SessionData {
  key: string;
  model?: string;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  updatedAt: number;
}

// Cost per 1K tokens (approximate)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'default': { input: 0.003, output: 0.015 },
};

export async function GET(request: NextRequest) {
  try {
    // Get real session data from OpenClaw
    let sessions: SessionData[] = [];
    try {
      const client = getOpenClawClient();
      if (!client.isConnected()) {
        await client.connect();
      }
      const sessionsData = await client.listSessions() as unknown as { sessions?: SessionData[] } | SessionData[];
      if (Array.isArray(sessionsData)) {
        sessions = sessionsData;
      } else if (sessionsData && typeof sessionsData === 'object' && 'sessions' in sessionsData) {
        sessions = sessionsData.sessions || [];
      }
    } catch (err) {
      console.log('[USAGE API] OpenClaw not reachable');
    }

    // Calculate time boundaries
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    // Aggregate by model
    const modelStats: Record<string, {
      model: string;
      sessionsTotal: number;
      sessionsToday: number;
      tokensTotal: number;
      tokensToday: number;
      tokensWeek: number;
      inputTokens: number;
      outputTokens: number;
    }> = {};

    for (const session of sessions) {
      const model = session.model || 'unknown';
      if (!modelStats[model]) {
        modelStats[model] = {
          model,
          sessionsTotal: 0,
          sessionsToday: 0,
          tokensTotal: 0,
          tokensToday: 0,
          tokensWeek: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }

      const stats = modelStats[model];
      const tokens = session.totalTokens || 0;
      const isToday = session.updatedAt >= todayStart.getTime();
      const isThisWeek = session.updatedAt >= weekStart.getTime();

      stats.sessionsTotal++;
      stats.tokensTotal += tokens;
      stats.inputTokens += session.inputTokens || 0;
      stats.outputTokens += session.outputTokens || 0;

      if (isToday) {
        stats.sessionsToday++;
        stats.tokensToday += tokens;
      }
      if (isThisWeek) {
        stats.tokensWeek += tokens;
      }
    }

    // Format for response
    const providers = Object.values(modelStats)
      .filter(s => s.model !== 'unknown' && s.model !== 'gateway-injected')
      .map(stats => {
        const costs = MODEL_COSTS[stats.model] || MODEL_COSTS['default'];
        const costToday = (stats.inputTokens / 1000 * costs.input) + (stats.outputTokens / 1000 * costs.output);
        
        // Weekly limit based on model (Max subscription limits)
        const weeklyLimit = stats.model.includes('opus') ? 10000000 : 50000000; // Opus more limited
        const weeklyPercentage = Math.round((stats.tokensWeek / weeklyLimit) * 100);

        return {
          provider: stats.model.includes('opus') ? 'Claude Opus' : 
                   stats.model.includes('sonnet') ? 'Claude Sonnet' : stats.model,
          model: stats.model,
          requestsToday: stats.sessionsToday,
          tokensToday: stats.tokensToday,
          tokensWeek: stats.tokensWeek,
          tokensTotal: stats.tokensTotal,
          costToday: Math.round(costToday * 100) / 100,
          weeklyLimit,
          weeklyUsed: stats.tokensWeek,
          weeklyPercentage: Math.min(weeklyPercentage, 100),
          status: weeklyPercentage >= 85 ? 'critical' : weeklyPercentage >= 70 ? 'warning' : 'healthy',
        };
      })
      .sort((a, b) => b.tokensTotal - a.tokensTotal);

    const totalCostToday = providers.reduce((sum, p) => sum + p.costToday, 0);
    const totalTokensToday = providers.reduce((sum, p) => sum + p.tokensToday, 0);
    const totalTokensWeek = providers.reduce((sum, p) => sum + p.tokensWeek, 0);

    return NextResponse.json({
      providers,
      totalCostToday: Math.round(totalCostToday * 100) / 100,
      totalTokensToday,
      totalTokensWeek,
      totalSessions: sessions.length,
      lastUpdated: new Date().toISOString(),
      source: 'openclaw', // Flag that this is real data
    });
  } catch (error) {
    console.error('Usage summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch usage summary' }, { status: 500 });
  }
}
