import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { PlanningQuestion, PlanningCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';
// Generate markdown spec from answered questions
function generateSpecMarkdown(task: { title: string; description?: string }, questions: PlanningQuestion[]): string {
  const lines: string[] = [];
  
  lines.push(`# ${task.title}`);
  lines.push('');
  lines.push('**Status:** SPEC LOCKED ✅');
  lines.push('');
  
  if (task.description) {
    lines.push('## Original Request');
    lines.push(task.description);
    lines.push('');
  }

  // Group questions by category
  const byCategory = questions.reduce((acc, q) => {
    if (!acc[q.category]) acc[q.category] = [];
    acc[q.category].push(q);
    return acc;
  }, {} as Record<string, PlanningQuestion[]>);

  const categoryLabels: Record<PlanningCategory, string> = {
    goal: '🎯 Goal & Success Criteria',
    audience: '👥 Target Audience',
    scope: '📋 Scope',
    design: '🎨 Design & Visual',
    content: '📝 Content',
    technical: '⚙️ Technical Requirements',
    timeline: '📅 Timeline',
    constraints: '⚠️ Constraints'
  };

  const categoryOrder: PlanningCategory[] = ['goal', 'audience', 'scope', 'design', 'content', 'technical', 'timeline', 'constraints'];

  for (const category of categoryOrder) {
    const categoryQuestions = byCategory[category];
    if (!categoryQuestions || categoryQuestions.length === 0) continue;

    lines.push(`## ${categoryLabels[category]}`);
    lines.push('');

    for (const q of categoryQuestions) {
      if (q.answer) {
        lines.push(`**${q.question}**`);
        lines.push(`> ${q.answer}`);
        lines.push('');
      }
    }
  }

  lines.push('---');
  lines.push(`*Spec locked at ${new Date().toISOString()}*`);

  return lines.join('\n');
}

// POST /api/tasks/[id]/planning/approve - Lock spec and move to inbox
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  try {
    // Get task
    const task = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as { id: string; title: string; description?: string; status: string } | undefined;
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if already locked
    const existingSpec = getDb().prepare(
      'SELECT * FROM planning_specs WHERE task_id = ?'
    ).get(taskId);

    if (existingSpec) {
      return NextResponse.json({ error: 'Spec already locked' }, { status: 400 });
    }

    // Get all questions
    const questions = getDb().prepare(
      'SELECT * FROM planning_questions WHERE task_id = ? ORDER BY sort_order'
    ).all(taskId) as PlanningQuestion[];

    // Check if all questions are answered
    const unanswered = questions.filter(q => !q.answer);
    if (unanswered.length > 0) {
      return NextResponse.json({ 
        error: 'All questions must be answered before locking',
        unanswered: unanswered.length
      }, { status: 400 });
    }

    // Parse options for each question
    const parsedQuestions = questions.map(q => ({
      ...q,
      options: q.options ? JSON.parse(q.options as unknown as string) : undefined
    }));

    // Generate spec markdown
    const specMarkdown = generateSpecMarkdown(task, parsedQuestions);

    // Create spec record
    const specId = crypto.randomUUID();
    getDb().prepare(`
      INSERT INTO planning_specs (id, task_id, spec_markdown, locked_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(specId, taskId, specMarkdown);

    // Update task description with spec and move to inbox
    getDb().prepare(`
      UPDATE tasks 
      SET description = ?, status = 'inbox', updated_at = datetime('now')
      WHERE id = ?
    `).run(specMarkdown, taskId);

    // Log activity
    const activityId = crypto.randomUUID();
    getDb().prepare(`
      INSERT INTO task_activities (id, task_id, activity_type, message)
      VALUES (?, ?, 'status_changed', 'Planning complete - spec locked and moved to inbox')
    `).run(activityId, taskId);

    // Get the created spec
    const spec = getDb().prepare(
      'SELECT * FROM planning_specs WHERE id = ?'
    ).get(specId);

    return NextResponse.json({
      success: true,
      spec,
      specMarkdown
    });
  } catch (error) {
    console.error('Failed to approve spec:', error);
    return NextResponse.json({ error: 'Failed to approve spec' }, { status: 500 });
  }
}
