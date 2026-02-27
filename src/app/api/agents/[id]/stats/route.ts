import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { queryOne } from '@/lib/db';
import type { Agent } from '@/lib/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface GatewaySession {
  key: string;
  model?: string;
  modelProvider?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  channel?: string;
  kind?: string;
  displayName?: string;
  [k: string]: unknown;
}

/**
 * GET /api/agents/[id]/stats — Token usage & cost stats for an agent
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get agent info from DB
    const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Gateway returns nested structure: { ts, path, count, defaults, sessions: [...] }
    const rawResult = await client.listSessions();
    let allSessions: GatewaySession[] = [];

    if (Array.isArray(rawResult)) {
      allSessions = rawResult as unknown as GatewaySession[];
    } else if (rawResult && typeof rawResult === 'object') {
      const obj = rawResult as unknown as Record<string, unknown>;
      if (Array.isArray(obj.sessions)) {
        allSessions = obj.sessions as GatewaySession[];
      }
    }

    // Filter sessions for this agent
    const agentName = agent.name.toLowerCase();
    const gatewayAgentId = agent.gateway_agent_id;

    const agentSessions = allSessions.filter((s) => {
      const key = (s.key || '').toLowerCase();
      if (gatewayAgentId && key.includes(gatewayAgentId.toLowerCase())) return true;
      if (key.includes(`agent:${agentName}`)) return true;
      return false;
    });

    // Calculate stats
    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    const modelsUsed = new Set<string>();
    const sessionCount = agentSessions.length;

    for (const session of agentSessions) {
      if (typeof session.inputTokens === 'number') totalTokensInput += session.inputTokens;
      if (typeof session.outputTokens === 'number') totalTokensOutput += session.outputTokens;

      const model = session.model;
      if (model && typeof model === 'string') {
        modelsUsed.add(model);
      }
    }

    // Use agent's configured model as fallback
    if (modelsUsed.size === 0 && agent.model) {
      modelsUsed.add(agent.model);
    }

    // Estimate cost based on common model pricing (rough estimates)
    const estimatedCost = estimateTokenCost(totalTokensInput, totalTokensOutput, Array.from(modelsUsed)[0]);

    return NextResponse.json({
      agentId: id,
      agentName: agent.name,
      sessionCount,
      totalTokens: totalTokensInput + totalTokensOutput,
      totalTokensInput,
      totalTokensOutput,
      estimatedCost: Math.round(estimatedCost * 10000) / 10000,
      models: Array.from(modelsUsed),
      sessions: agentSessions.map((s) => ({
        id: s.key,
        channel: s.channel || s.kind || '',
        model: s.model || '',
        status: s.kind || 'unknown',
        displayName: s.displayName || '',
      })),
    });
  } catch (error) {
    console.error('Failed to get agent stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function estimateTokenCost(inputTokens: number, outputTokens: number, model?: string): number {
  // Rough pricing per 1M tokens (input / output)
  const pricing: Record<string, [number, number]> = {
    'claude-sonnet-4-6': [3, 15],
    'claude-sonnet-4': [3, 15],
    'claude-opus-4': [15, 75],
    'claude-opus-4.6': [15, 75],
    'claude-3.5-sonnet': [3, 15],
    'claude-3-opus': [15, 75],
    'gpt-4o': [2.5, 10],
    'gpt-4o-mini': [0.15, 0.6],
    'minimax-m2.5': [0.5, 1.5],
  };

  let inputRate = 3; // default $/1M tokens
  let outputRate = 15;

  if (model) {
    for (const [key, [iRate, oRate]] of Object.entries(pricing)) {
      if (model.includes(key)) {
        inputRate = iRate;
        outputRate = oRate;
        break;
      }
    }
  }

  return (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
}
