/**
 * Agent Mapping Configuration
 * 
 * Maps Mission Control agent names to OpenClaw session IDs.
 * Used by the dispatch system to route tasks to the correct agent.
 */

export interface AgentMapping {
  openclawSessionId: string;
  description: string;
}

/**
 * Maps MC agent names/roles to OpenClaw agent session IDs
 */
export const AGENT_TO_OPENCLAW_SESSION: Record<string, AgentMapping> = {
  // Max - Orchestrator (main agent)
  'Max': {
    openclawSessionId: 'agent:main:main',
    description: 'Orchestrator agent (Max)'
  },
  
  // Dev - Builder
  'Developer': {
    openclawSessionId: 'agent:developer:main',
    description: 'Developer agent'
  },
  
  // Writer - Content
  'Copywriter & Content': {
    openclawSessionId: 'agent:writer:main',
    description: 'Content writer agent'
  },
  
  // Researcher - Intel
  'Deep Research & Market Intel': {
    openclawSessionId: 'agent:researcher:main',
    description: 'Research agent'
  },
  
  // Sophie - Executive Assistant
  'Executive Assistant': {
    openclawSessionId: 'agent:pa:main',
    description: 'Executive assistant agent (Sophie)'
  },
  
  // QA - Quality Assurance
  'QA Engineer': {
    openclawSessionId: 'agent:developer:main', // QA shares dev agent for now
    description: 'QA engineer (routed to developer)'
  },
  
  // Senior Dev - Code Reviewer
  'Senior Developer': {
    openclawSessionId: 'agent:developer:main', // Senior dev shares dev agent
    description: 'Senior developer (routed to developer)'
  }
};

/**
 * Get OpenClaw session ID for an MC agent name
 * @param agentName - Agent name from Mission Control
 * @returns OpenClaw session ID or null if not mapped
 */
export function getOpenClawSessionId(agentName: string): string | null {
  const mapping = AGENT_TO_OPENCLAW_SESSION[agentName];
  return mapping ? mapping.openclawSessionId : null;
}

/**
 * Check if an agent can be dispatched to OpenClaw
 * @param agentName - Agent name from Mission Control
 * @returns true if agent has an OpenClaw mapping
 */
export function canDispatchAgent(agentName: string): boolean {
  return agentName in AGENT_TO_OPENCLAW_SESSION;
}

/**
 * Get all dispatchable agent names
 */
export function getDispatchableAgents(): string[] {
  return Object.keys(AGENT_TO_OPENCLAW_SESSION);
}
