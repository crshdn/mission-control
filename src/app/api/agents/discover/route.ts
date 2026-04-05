import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { normalizeGatewayAgent } from '@/lib/openclaw/gateway-compat';
import type { Agent, DiscoveredAgent } from '@/lib/types';

// This route must always be dynamic - it queries live Gateway state + DB
export const dynamic = 'force-dynamic';

// GET /api/agents/discover - Discover existing agents from the OpenClaw Gateway
export async function GET() {
  try {
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway. Is it running?' },
          { status: 503 }
        );
      }
    }

    let gatewayAgents: unknown[];
    try {
      gatewayAgents = await client.listAgents();
    } catch (err) {
      logger.error('Failed to list agents from Gateway:', err);
      return NextResponse.json(
        { error: 'Failed to list agents from OpenClaw Gateway' },
        { status: 502 }
      );
    }

    if (!Array.isArray(gatewayAgents)) {
      return NextResponse.json(
        { error: 'Unexpected response from Gateway agents.list' },
        { status: 502 }
      );
    }

    // Get all agents already imported from the gateway
    const existingAgents = queryAll<Agent>(
      `SELECT * FROM agents WHERE gateway_agent_id IS NOT NULL`
    );
    const importedGatewayIds = new Map(
      existingAgents.map((a) => [a.gateway_agent_id, a.id])
    );

    // Map gateway agents to our DiscoveredAgent type
    const discovered: DiscoveredAgent[] = gatewayAgents
      .map((ga) => normalizeGatewayAgent(ga))
      .filter((ga): ga is NonNullable<typeof ga> => ga !== null)
      .map((ga) => {
        const gatewayId = ga.id;
        const alreadyImported = importedGatewayIds.has(gatewayId);
        return {
          id: gatewayId,
          name: ga.name,
          label: ga.label,
          model: ga.model,
          channel: ga.channel,
          status: ga.status,
          already_imported: alreadyImported,
          existing_agent_id: alreadyImported ? importedGatewayIds.get(gatewayId) : undefined,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      agents: discovered,
      total: discovered.length,
      already_imported: discovered.filter((a) => a.already_imported).length,
    });
  } catch (error) {
    logger.error('Failed to discover agents:', error);
    return NextResponse.json(
      { error: 'Failed to discover agents from Gateway' },
      { status: 500 }
    );
  }
}
