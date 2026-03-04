import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

interface UnreadItem {
  type: 'email' | 'question' | 'stale_task';
  title: string;
  preview?: string;
  date?: string;
  source?: string;
  taskId?: string;
}

export async function GET() {
  try {
    const items: UnreadItem[] = [];
    
    // Check Gmail unread (via gog CLI)
    try {
      const { stdout } = await execAsync(
        `gog gmail search 'is:unread newer_than:3d' --max 5 --account lilly.a.bott2@gmail.com --client lilly --format json 2>/dev/null || echo "[]"`,
        { timeout: 15000 }
      );
      const emails = JSON.parse(stdout || '[]');
      for (const email of emails) {
        items.push({
          type: 'email',
          title: email.subject || 'No subject',
          preview: email.snippet || '',
          date: email.date,
          source: 'Gmail (Lilly)'
        });
      }
    } catch (e) {
      // Gmail check failed silently
    }
    
    // Check unanswered questions file
    const questionsPath = '/Users/lilly/clawd/unanswered-questions.md';
    if (fs.existsSync(questionsPath)) {
      const content = fs.readFileSync(questionsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().startsWith('- '));
      for (const line of lines.slice(0, 5)) {
        items.push({
          type: 'question',
          title: line.replace(/^-\s*/, '').trim(),
          source: 'unanswered-questions.md'
        });
      }
    }
    
    // Check stale tasks (no activity in 3+ days)
    try {
      const { stdout: tasksJson } = await execAsync(
        `curl -s "http://localhost:4000/api/tasks" 2>/dev/null || echo "[]"`,
        { timeout: 5000 }
      );
      const tasks = JSON.parse(tasksJson || '[]');
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      for (const task of tasks) {
        if (task.status === 'done') continue;
        const updatedAt = new Date(task.updated_at || task.created_at);
        if (updatedAt < threeDaysAgo) {
          items.push({
            type: 'stale_task',
            title: task.title,
            date: task.updated_at || task.created_at,
            taskId: task.id,
            source: 'Mission Control'
          });
        }
      }
    } catch (e) {
      // Task check failed silently
    }
    
    return NextResponse.json({ 
      items,
      counts: {
        emails: items.filter(i => i.type === 'email').length,
        questions: items.filter(i => i.type === 'question').length,
        staleTasks: items.filter(i => i.type === 'stale_task').length
      },
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Unread API error:', error);
    return NextResponse.json({ items: [], counts: {}, error: String(error) });
  }
}
