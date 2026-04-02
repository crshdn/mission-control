import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import { normalizeGatewayModel } from '@/lib/openclaw/gateway-compat';
import type { Agent } from '@/lib/types';

export const dynamic = 'force-dynamic';
interface ImportAgentRequest {
  gateway_agent_id: string;
  name: string;
  model?: unknown;
  workspace_id?: string;
}

interface ImportRequest {
  agents: ImportAgentRequest[];
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// POST /api/agents/import - Import one or more agents from the OpenClaw Gateway
export async function POST(request: NextRequest) {
  try {
    const body: ImportRequest = await request.json();

    if (!body.agents || !Array.isArray(body.agents) || body.agents.length === 0) {
      return NextResponse.json(
        { error: 'At least one agent is required in the agents array' },
        { status: 400 }
      );
    }

    // Validate each agent
    for (const agentReq of body.agents) {
      const gatewayAgentId = sanitizeText(agentReq.gateway_agent_id);
      const name = sanitizeText(agentReq.name);
      if (!gatewayAgentId || !name) {
        return NextResponse.json(
          { error: 'Each agent must have gateway_agent_id and name' },
          { status: 400 }
        );
      }
    }

    // Check for conflicts (already imported)
    const existingImports = queryAll<Agent>(
      `SELECT * FROM agents WHERE gateway_agent_id IS NOT NULL`
    );
    const importedGatewayIds = new Set(existingImports.map((a) => a.gateway_agent_id));

    const results: { imported: Agent[]; skipped: { gateway_agent_id: string; reason: string }[] } = {
      imported: [],
      skipped: [],
    };

    transaction(() => {
      const now = new Date().toISOString();

      for (const agentReq of body.agents) {
        const gatewayAgentId = sanitizeText(agentReq.gateway_agent_id);
        const name = sanitizeText(agentReq.name);
        if (!gatewayAgentId || !name) {
          continue;
        }

        // Skip if already imported
        if (importedGatewayIds.has(gatewayAgentId)) {
          results.skipped.push({
            gateway_agent_id: gatewayAgentId,
            reason: 'Already imported',
          });
          continue;
        }

        const id = uuidv4();
        const workspaceId = sanitizeText(agentReq.workspace_id) || 'default';
        const model = normalizeGatewayModel(agentReq.model) || null;

        // Generate default identity files referencing the gateway agent.
        // The gateway does not expose SOUL.md/USER.md/AGENTS.md via its API,
        // so we populate sensible defaults that prompt the user to paste their
        // existing content from the OpenClaw workspace.
        const soulMd = [
          `# ${name}`,
          '',
          `Imported from OpenClaw Gateway (agent: ${gatewayAgentId}).`,
          '',
          'Configure this agent\'s personality, values, and communication style here.',
          'If this agent has a SOUL.md in your OpenClaw workspace, paste its contents here.',
        ].join('\n');

        const userMd = [
          '# User Context',
          '',
          `Imported from OpenClaw Gateway (agent: ${gatewayAgentId}).`,
          '',
          'Add context about the human this agent works with.',
          'If this agent has a USER.md in your OpenClaw workspace, paste its contents here.',
        ].join('\n');

        const agentsMd = [
          '# Team Roster',
          '',
          `Imported from OpenClaw Gateway (agent: ${gatewayAgentId}).`,
          '',
          'Describe the other agents this agent collaborates with.',
          'If this agent has an AGENTS.md in your OpenClaw workspace, paste its contents here.',
        ].join('\n');

        run(
          `INSERT INTO agents (id, name, role, description, avatar_emoji, is_master, workspace_id, soul_md, user_md, agents_md, model, source, gateway_agent_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            name,
            'Imported Agent',
            `Imported from OpenClaw Gateway (${gatewayAgentId})`,
            '🔗',
            0,
            workspaceId,
            soulMd,
            userMd,
            agentsMd,
            model,
            'gateway',
            gatewayAgentId,
            now,
            now,
          ]
        );

        // Log event
        run(
          `INSERT INTO events (id, type, agent_id, message, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), 'agent_joined', id, `${name} imported from OpenClaw Gateway`, now]
        );

        const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [id]);
        if (agent) {
          results.imported.push(agent);
        }

        importedGatewayIds.add(gatewayAgentId);
      }
    });

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Failed to import agents:', error);
    return NextResponse.json(
      { error: 'Failed to import agents' },
      { status: 500 }
    );
  }
}
