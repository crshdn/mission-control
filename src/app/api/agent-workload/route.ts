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
    
    // Build workload data - keyed by agent ID (UUID)
    const workloadMap = new Map();
    
    for (const agent of agents) {
      workloadMap.set(agent.id, {
        agentId: agent.id,
        agentName: agent.name || agent.id,
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        failedTasks: 0,
        inReview: 0,
        completionRate: 0,
        avgCompletionTime: 0,
        currentLoad: 'light' as const,
        lastActive: new Date().toISOString(),
        tasksLast24h: 0,
        tasksLast7d: 0
      });
    }
    
    for (const tc of taskCounts) {
      const data = workloadMap.get(tc.agent);
      if (data) {
        if (tc.status === 'in_progress') {
          data.pendingTasks = tc.count;
          data.totalTasks += tc.count;
        } else if (tc.status === 'review') {
          data.inReview = tc.count;
          data.totalTasks += tc.count;
        } else if (tc.status === 'done') {
          data.completedTasks = tc.count;
          data.totalTasks += tc.count;
        }
      }
    }
    
    for (const c of completions) {
      const data = workloadMap.get(c.agent);
      if (data) {
        data.tasksLast7d = c.completed;
        // Calculate completion rate
        if (data.totalTasks > 0) {
          data.completionRate = Math.round((data.completedTasks / data.totalTasks) * 100);
        }
        // Set current load based on pending tasks
        if (data.pendingTasks >= 5) data.currentLoad = 'overloaded';
        else if (data.pendingTasks >= 3) data.currentLoad = 'heavy';
        else if (data.pendingTasks >= 1) data.currentLoad = 'normal';
        else data.currentLoad = 'light';
      }
    }
    
    const workload = Array.from(workloadMap.values());
    
    return NextResponse.json({ 
      agents: workload,
      summary: {
        totalAgents: workload.length,
        totalActiveTasks: workload.reduce((sum: number, a: any) => sum + a.pendingTasks, 0),
        totalCompleted: workload.reduce((sum: number, a: any) => sum + a.completedTasks, 0)
      }
    });
  } catch (error) {
    console.error('Agent workload API error:', error);
    return NextResponse.json({ agents: [], error: String(error) });
  }
}
