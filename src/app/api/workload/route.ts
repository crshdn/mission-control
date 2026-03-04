import { NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';

export async function GET() {
  try {
    // Get all agents
    const agents = queryAll(`
      SELECT id, name, status FROM agents
    `) as any[];
    
    // Get task counts per agent
    const taskCounts = queryAll(`
      SELECT 
        assigned_agent_id as agent,
        status,
        COUNT(*) as count
      FROM tasks 
      WHERE assigned_agent_id IS NOT NULL
      GROUP BY assigned_agent_id, status
    `) as any[];
    
    // Get recent completions per agent
    const completions = queryAll(`
      SELECT 
        assigned_agent_id as agent,
        COUNT(*) as completed
      FROM tasks 
      WHERE status = 'done' 
        AND assigned_agent_id IS NOT NULL
        AND updated_at > datetime('now', '-7 days')
      GROUP BY assigned_agent_id
    `) as any[];
    
    // Build workload data
    const workloadMap = new Map();
    
    for (const agent of agents) {
      workloadMap.set(agent.name || agent.id, {
        id: agent.id,
        name: agent.name || agent.id,
        status: agent.status,
        activeTasks: 0,
        completedThisWeek: 0,
        inReview: 0,
        queued: 0
      });
    }
    
    for (const tc of taskCounts) {
      const data = workloadMap.get(tc.agent);
      if (data) {
        if (tc.status === 'in_progress') data.activeTasks = tc.count;
        else if (tc.status === 'review') data.inReview = tc.count;
        else if (tc.status === 'inbox') data.queued = tc.count;
      }
    }
    
    for (const c of completions) {
      const data = workloadMap.get(c.agent);
      if (data) data.completedThisWeek = c.completed;
    }
    
    const workload = Array.from(workloadMap.values());
    
    return NextResponse.json({ 
      agents: workload,
      summary: {
        totalAgents: workload.length,
        totalActiveTasks: workload.reduce((sum: number, a: any) => sum + a.activeTasks, 0),
        totalCompleted: workload.reduce((sum: number, a: any) => sum + a.completedThisWeek, 0)
      }
    });
  } catch (error) {
    console.error('Agent workload API error:', error);
    return NextResponse.json({ agents: [], error: String(error) });
  }
}
