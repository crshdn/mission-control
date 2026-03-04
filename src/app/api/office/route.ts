import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface Agent {
  id: string;
  name: string;
  emoji: string;
  status: 'working' | 'idle' | 'offline' | 'break';
  currentTask?: string;
  position: { x: number; y: number };
  lastActivity?: string;
}

interface OfficeData {
  agents: Agent[];
  lastUpdated: string;
}

async function fetchAgentStatuses(): Promise<Agent[]> {
  // Mock agent data for now - replace with actual agent status from MC API
  const agents: Agent[] = [
    {
      id: 'ged',
      name: 'Ged',
      emoji: '👑',
      status: 'working',
      currentTask: 'Reviewing quarterly strategy',
      position: { x: 20, y: 20 },
      lastActivity: new Date(Date.now() - 1000 * 60 * 15).toISOString() // 15 min ago
    },
    {
      id: 'lilly',
      name: 'Lilly',
      emoji: '🛠️',
      status: 'working',
      currentTask: 'Architecture review session',
      position: { x: 120, y: 20 },
      lastActivity: new Date(Date.now() - 1000 * 60 * 5).toISOString() // 5 min ago
    },
    {
      id: 'polly',
      name: 'Polly',
      emoji: '📋',
      status: 'working',
      currentTask: 'Processing inbox tasks',
      position: { x: 220, y: 20 },
      lastActivity: new Date(Date.now() - 1000 * 60 * 2).toISOString() // 2 min ago
    },
    {
      id: 'mason',
      name: 'Mason',
      emoji: '🔨',
      status: 'working',
      currentTask: 'Building MC Dashboard components',
      position: { x: 20, y: 120 },
      lastActivity: new Date(Date.now() - 1000 * 60 * 1).toISOString() // 1 min ago
    },
    {
      id: 'vale',
      name: 'Vale',
      emoji: '📚',
      status: 'idle',
      currentTask: undefined,
      position: { x: 120, y: 120 },
      lastActivity: new Date(Date.now() - 1000 * 60 * 30).toISOString() // 30 min ago
    },
    {
      id: 'archie',
      name: 'Archie',
      emoji: '⚙️',
      status: 'working',
      currentTask: 'System architecture optimization',
      position: { x: 220, y: 120 },
      lastActivity: new Date(Date.now() - 1000 * 60 * 10).toISOString() // 10 min ago
    },
    {
      id: 'riff',
      name: 'Riff',
      emoji: '🎨',
      status: 'break',
      currentTask: undefined,
      position: { x: 320, y: 120 },
      lastActivity: new Date(Date.now() - 1000 * 60 * 45).toISOString() // 45 min ago
    },
    {
      id: 'max',
      name: 'Max',
      emoji: '✨',
      status: 'offline',
      currentTask: undefined,
      position: { x: 320, y: 20 },
      lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() // 3 hours ago
    }
  ];

  return agents;
}

export async function GET() {
  try {
    const agents = await fetchAgentStatuses();
    
    const officeData: OfficeData = {
      agents,
      lastUpdated: new Date().toISOString()
    };

    return NextResponse.json(officeData);
  } catch (error) {
    console.error('Failed to fetch office data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch office data' },
      { status: 500 }
    );
  }
}

// TODO: Replace mock implementation with actual agent status from MC API
/*
async function fetchAgentStatuses(): Promise<Agent[]> {
  try {
    // Fetch active sessions from MC API
    const sessionsResponse = await fetch('http://localhost:4000/api/openclaw/sessions');
    if (!sessionsResponse.ok) throw new Error('Failed to fetch sessions');
    const sessions = await sessionsResponse.json();

    // Fetch current tasks from MC API
    const tasksResponse = await fetch('http://localhost:4000/api/tasks?status=in-progress');
    if (!tasksResponse.ok) throw new Error('Failed to fetch tasks');
    const tasks = await tasksResponse.json();

    // Map known agents with their statuses
    const knownAgents = [
      { id: 'ged', name: 'Ged', emoji: '👑' },
      { id: 'lilly', name: 'Lilly', emoji: '🛠️' },
      { id: 'polly', name: 'Polly', emoji: '📋' },
      { id: 'mason', name: 'Mason', emoji: '🔨' },
      { id: 'vale', name: 'Vale', emoji: '📚' },
      { id: 'archie', name: 'Archie', emoji: '⚙️' },
      { id: 'riff', name: 'Riff', emoji: '🎨' },
      { id: 'max', name: 'Max', emoji: '✨' }
    ];

    return knownAgents.map(agent => {
      // Check if agent has active session
      const activeSession = sessions.find((s: any) => 
        s.agentId === agent.id && s.status === 'active'
      );
      
      // Check if agent has assigned tasks
      const currentTask = tasks.find((t: any) => 
        t.assigned_agent_id === agent.id && t.status === 'in-progress'
      );

      // Determine status based on activity
      let status: Agent['status'] = 'offline';
      if (activeSession) {
        status = currentTask ? 'working' : 'idle';
      }

      return {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        status,
        currentTask: currentTask?.title,
        position: getDeskPosition(agent.id),
        lastActivity: activeSession?.lastActivity || new Date(Date.now() - 1000 * 60 * 60).toISOString()
      };
    });
  } catch (error) {
    console.error('Error fetching real agent statuses:', error);
    // Fallback to mock data if real API fails
    return fetchMockAgentStatuses();
  }
}

function getDeskPosition(agentId: string): { x: number; y: number } {
  const positions: Record<string, { x: number; y: number }> = {
    'ged': { x: 20, y: 20 },
    'lilly': { x: 120, y: 20 },
    'polly': { x: 220, y: 20 },
    'mason': { x: 20, y: 120 },
    'vale': { x: 120, y: 120 },
    'archie': { x: 220, y: 120 },
    'riff': { x: 320, y: 120 },
    'max': { x: 320, y: 20 }
  };
  return positions[agentId] || { x: 0, y: 0 };
}
*/