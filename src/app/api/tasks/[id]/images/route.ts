import { NextRequest, NextResponse } from 'next/server';
import { queryOne, run } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Task, TaskImage } from '@/lib/types';

export const dynamic = 'force-dynamic';

const IMAGES_DIR = path.join(process.cwd(), 'data', 'task-images');

// Allowed image MIME types
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

function getTaskImages(task: Task): TaskImage[] {
  if (!task.images) return [];
  try {
    return JSON.parse(task.images);
  } catch {
    return [];
  }
}

/**
 * GET /api/tasks/[id]/images
 * List all images attached to a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ images: getTaskImages(task) });
}

/**
 * POST /api/tasks/[id]/images
 * Upload an image to a task (multipart form data)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `File type not allowed: ${file.type}. Allowed: png, jpeg, gif, webp, svg` },
      { status: 400 }
    );
  }

  // Limit file size to 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  // Create task image directory
  const taskDir = path.join(IMAGES_DIR, id);
  if (!existsSync(taskDir)) {
    await mkdir(taskDir, { recursive: true });
  }

  // Sanitize filename and make unique
  const ext = path.extname(file.name) || '.png';
  const safeName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_');
  const timestamp = Date.now();
  const filename = `${timestamp}-${safeName}`;

  // Write file to disk
  const filePath = path.join(taskDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  // Update task images JSON
  const images = getTaskImages(task);
  const newImage: TaskImage = {
    filename,
    original_name: file.name,
    uploaded_at: new Date().toISOString(),
  };
  images.push(newImage);

  const now = new Date().toISOString();
  run(
    'UPDATE tasks SET images = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(images), now, id]
  );

  return NextResponse.json({ image: newImage, total: images.length }, { status: 201 });
}

/**
 * DELETE /api/tasks/[id]/images
 * Remove an image from a task
 * Body: { filename: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const body = await request.json();
  if (!body.filename) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 });
  }

  const images = getTaskImages(task).filter(img => img.filename !== body.filename);
  const now = new Date().toISOString();
  run(
    'UPDATE tasks SET images = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(images), now, id]
  );

  // Try to delete the file (best-effort)
  const { unlink } = await import('fs/promises');
  try {
    await unlink(path.join(IMAGES_DIR, id, body.filename));
  } catch {
    // File may already be gone
  }

  return NextResponse.json({ success: true, remaining: images.length });
}
