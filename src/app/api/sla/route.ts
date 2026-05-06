import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { queryAll } from '@/lib/db';
import type { Task } from '@/lib/types';

interface SLAMetrics {
  inbox_dispatch_time: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
    violations: number;
  };
  completion_rate: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
  };
  queue_wait_time: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
    violations: number;
  };
  avg_completion_time: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
  };
  error_rate: {
    current: number;
    target: number;
    unit: string;
    status: 'success' | 'warning' | 'danger';
  };
  sla_violations: {
    total: number;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      wait_time: number;
      created_at: string;
    }>;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';
    
    // Fetch all tasks for the workspace
    const tasks = queryAll<Task>(
      `SELECT * FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC`,
      [workspaceId]
    );

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Filter recent tasks for most metrics
    const recentTasks = tasks.filter(task => 
      new Date(task.created_at) > last24Hours
    );

    // 1. INBOX DISPATCH TIME - Time from creation to first assignment/dispatch
    // Target: 5 minutes (300 seconds)
    const dispatchedTasks = recentTasks.filter(task => 
      task.assigned_agent_id && task.status !== 'inbox'
    );
    
    const inboxTimes = dispatchedTasks.map(task => {
      const created = new Date(task.created_at);
      const updated = new Date(task.updated_at);
      return (updated.getTime() - created.getTime()) / 1000; // seconds
    });
    
    const avgInboxTime = inboxTimes.length > 0 
      ? inboxTimes.reduce((a, b) => a + b, 0) / inboxTimes.length 
      : 0;
    
    const inboxTarget = 300; // 5 minutes in seconds
    const inboxViolations = inboxTimes.filter(time => time > inboxTarget).length;
    
    // 2. COMPLETION RATE - Percentage of tasks completed vs created
    const completedTasks = recentTasks.filter(task => task.status === 'done');
    const completionRate = recentTasks.length > 0 
      ? (completedTasks.length / recentTasks.length) * 100 
      : 0;

    // 3. QUEUE WAIT TIME - Current tasks in inbox > 5 minutes
    const queuedTasks = tasks.filter(task => task.status === 'inbox');
    const currentQueueTimes = queuedTasks.map(task => {
      const created = new Date(task.created_at);
      return (now.getTime() - created.getTime()) / 1000; // seconds
    });
    
    const avgQueueTime = currentQueueTimes.length > 0 
      ? currentQueueTimes.reduce((a, b) => a + b, 0) / currentQueueTimes.length 
      : 0;
    
    const queueTarget = 300; // 5 minutes in seconds
    const queueViolations = currentQueueTimes.filter(time => time > queueTarget).length;
    
    // 4. AVERAGE COMPLETION TIME - From assignment to completion
    const completedWithTimes = completedTasks.filter(task => 
      task.assigned_agent_id && task.result_captured_at
    );
    
    const completionTimes = completedWithTimes.map(task => {
      const assigned = new Date(task.updated_at); // Approximation of assignment time
      const completed = new Date(task.result_captured_at!);
      return (completed.getTime() - assigned.getTime()) / (1000 * 60); // minutes
    });
    
    const avgCompletionTime = completionTimes.length > 0 
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length 
      : 0;

    // 5. ERROR RATE - Tasks stuck in certain statuses for too long (considered as errors)
    // For now, we'll calculate error rate as 0 since there are no explicit failed/error statuses
    // This could be enhanced later to detect tasks stuck in a status for too long
    const errorRate = 0;

    // 6. SLA VIOLATIONS - Tasks in inbox > 5 minutes
    const violatingTasks = queuedTasks
      .map(task => {
        const created = new Date(task.created_at);
        const waitTime = (now.getTime() - created.getTime()) / 1000; // seconds
        return { ...task, wait_time: waitTime };
      })
      .filter(task => task.wait_time > queueTarget)
      .map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        wait_time: Math.round(task.wait_time / 60), // convert to minutes
        created_at: task.created_at
      }));

    // Helper function to determine status
    const getStatus = (current: number, target: number, reverse = false): 'success' | 'warning' | 'danger' => {
      if (reverse) {
        // For metrics where lower is better (like error rate, completion time)
        if (current <= target) return 'success';
        if (current <= target * 1.5) return 'warning';
        return 'danger';
      } else {
        // For metrics where higher is better (like completion rate)
        if (current >= target) return 'success';
        if (current >= target * 0.8) return 'warning';
        return 'danger';
      }
    };

    const metrics: SLAMetrics = {
      inbox_dispatch_time: {
        current: Math.round(avgInboxTime),
        target: inboxTarget,
        unit: 'seconds',
        status: getStatus(avgInboxTime, inboxTarget, true),
        violations: inboxViolations
      },
      completion_rate: {
        current: Math.round(completionRate * 10) / 10,
        target: 95.0,
        unit: '%',
        status: getStatus(completionRate, 95.0, false)
      },
      queue_wait_time: {
        current: Math.round(avgQueueTime / 60), // convert to minutes
        target: 5, // 5 minutes
        unit: 'minutes',
        status: getStatus(avgQueueTime / 60, 5, true),
        violations: queueViolations
      },
      avg_completion_time: {
        current: Math.round(avgCompletionTime),
        target: 30, // 30 minutes
        unit: 'minutes',
        status: getStatus(avgCompletionTime, 30, true)
      },
      error_rate: {
        current: Math.round(errorRate * 10) / 10,
        target: 5.0,
        unit: '%',
        status: getStatus(errorRate, 5.0, true)
      },
      sla_violations: {
        total: violatingTasks.length,
        tasks: violatingTasks.slice(0, 10) // Limit to 10 most recent violations
      }
    };

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Failed to fetch SLA metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch SLA metrics' }, { status: 500 });
  }
}