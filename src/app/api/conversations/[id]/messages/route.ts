import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import type { Message, Agent, SendMessageRequest } from '@/lib/types';

// GET /api/conversations/[id]/messages - Get messages in a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const before = searchParams.get('before'); // For pagination

    let sql = `
      SELECT m.*, a.name as sender_name, a.avatar_emoji as sender_emoji, a.role as sender_role
      FROM messages m
      LEFT JOIN agents a ON m.sender_agent_id = a.id
      WHERE m.conversation_id = ?
    `;
    const queryParams: unknown[] = [id];

    if (before) {
      sql += ' AND m.created_at < ?';
      queryParams.push(before);
    }

    sql += ' ORDER BY m.created_at DESC LIMIT ?';
    queryParams.push(limit);

    const messages = queryAll<Message & { sender_name?: string; sender_emoji?: string; sender_role?: string }>(sql, queryParams);

    // Transform and reverse to get chronological order
    const transformedMessages = messages
      .map((msg) => ({
        ...msg,
        sender: msg.sender_agent_id
          ? {
              id: msg.sender_agent_id,
              name: msg.sender_name,
              avatar_emoji: msg.sender_emoji,
              role: msg.sender_role,
            }
          : undefined,
      }))
      .reverse();

    return NextResponse.json(transformedMessages);
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST /api/conversations/[id]/messages - Send a message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body: Omit<SendMessageRequest, 'conversation_id'> = await request.json();

    if (!body.content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Verify conversation exists
    const conversation = queryOne('SELECT id FROM conversations WHERE id = ?', [conversationId]);
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const messageId = uuidv4();
    const now = new Date().toISOString();

    // Insert message
    run(
      `INSERT INTO messages (id, conversation_id, sender_agent_id, content, message_type, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        messageId,
        conversationId,
        body.sender_agent_id || null,
        body.content,
        body.message_type || 'text',
        body.metadata || null,
        now,
      ]
    );

    // Update conversation's updated_at
    run('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);

    // Log event
    if (body.sender_agent_id) {
      const agent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [body.sender_agent_id]);
      if (agent) {
        run(
          `INSERT INTO events (id, type, agent_id, message, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), 'message_sent', body.sender_agent_id, `${agent.name} sent a message`, now]
        );
      }
    }

    // Fetch the created message with sender info
    const message = queryOne<Message & { sender_name?: string; sender_emoji?: string }>(
      `SELECT m.*, a.name as sender_name, a.avatar_emoji as sender_emoji
       FROM messages m
       LEFT JOIN agents a ON m.sender_agent_id = a.id
       WHERE m.id = ?`,
      [messageId]
    );

    return NextResponse.json(
      {
        ...message,
        sender: message?.sender_agent_id
          ? {
              id: message.sender_agent_id,
              name: message.sender_name,
              avatar_emoji: message.sender_emoji,
            }
          : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to send message:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
