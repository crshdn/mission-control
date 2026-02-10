import { NextResponse } from 'next/server';
import { invokeToolJson, invokeToolText, parseStatusText } from '@/lib/openclaw';
import { estimateCost, getModelInfo } from '@/lib/cost';
import type { GatewaySession, GatewayUsageResponse, UsageModelBreakdown } from '@/lib/types';

export const dynamic = 'force-dynamic';

type SessionsListResponse = {
  count: number;
  sessions: GatewaySession[];
};

export async function GET() {
  try {
    const [sessionsData, statusText] = await Promise.all([
      invokeToolJson<SessionsListResponse>('sessions_list'),
      invokeToolText('session_status').catch(() => ''),
    ]);

    const sessions = sessionsData.sessions ?? [];
    const status = statusText ? parseStatusText(statusText) : null;

    let totalTokens = 0;
    let totalCost = 0;
    const models: Record<string, UsageModelBreakdown> = {};

    const sessionSummaries = sessions.map((s) => {
      const model = s.model ?? 'unknown';
      const tokens = s.totalTokens ?? 0;
      const cost = estimateCost(tokens, model);
      const info = getModelInfo(model);

      totalTokens += tokens;
      totalCost += cost;

      if (!models[info.name]) {
        models[info.name] = { tokens: 0, sessions: 0, cost: 0 };
      }
      models[info.name].tokens += tokens;
      models[info.name].sessions += 1;
      models[info.name].cost += cost;

      return {
        key: s.key,
        displayName: s.displayName ?? s.label ?? s.key,
        model,
        totalTokens: tokens,
        contextTokens: s.contextTokens ?? 0,
        cost,
        updatedAt: s.updatedAt,
      };
    });

    sessionSummaries.sort((a, b) => b.totalTokens - a.totalTokens);

    const response: GatewayUsageResponse = {
      totalTokens,
      totalCost,
      sessions: sessionSummaries,
      models,
      context: status?.context_usage ?? null,
    };

    return NextResponse.json(response);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch usage data' },
      { status: 502 },
    );
  }
}
