import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import type { Conversation, Agent, Message } from '@/lib/types';

// GET /api/conversations - List all conversations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agent_id');
    const type = searchParams.get('type');

    let sql = `
      SELECT DISTINCT c.*
      FROM conversations c
      LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (agentId) {
      sql += ' AND cp.agent_id = ?';
      params.push(agentId);
    }
    if (type) {
      sql += ' AND c.type = ?';
      params.push(type);
    }

    sql += ' ORDER BY c.updated_at DESC';

    const conversations = queryAll<Conversation>(sql, params);

    // Get participants and last message for each conversation
    const enrichedConversations = conversations.map((conv) => {
      const participants = queryAll<Agent>(
        `SELECT a.* FROM agents a
         JOIN conversation_participants cp ON a.id = cp.agent_id
         WHERE cp.conversation_id = ?`,
        [conv.id]
      );

      const lastMessage = queryOne<Message>(
        `SELECT m.*, a.name as sender_name, a.avatar_emoji as sender_emoji
         FROM messages m
         LEFT JOIN agents a ON m.sender_agent_id = a.id
         WHERE m.conversation_id = ?
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [conv.id]
      );

      return {
        ...conv,
        participants,
        last_message: lastMessage,
      };
    });

    return NextResponse.json(enrichedConversations);
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

// POST /api/conversations - Create a new conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, type = 'direct', task_id, participant_ids } = body;

    if (!participant_ids || participant_ids.length < 1) {
      return NextResponse.json({ error: 'At least one participant is required' }, { status: 400 });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    transaction(() => {
      // Create conversation
      run(
        `INSERT INTO conversations (id, title, type, task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, title || null, type, task_id || null, now, now]
      );

      // Add participants
      for (const agentId of participant_ids) {
        run(
          `INSERT INTO conversation_participants (conversation_id, agent_id, joined_at)
           VALUES (?, ?, ?)`,
          [id, agentId, now]
        );
      }
    });

    // Fetch the created conversation with participants
    const conversation = queryOne<Conversation>('SELECT * FROM conversations WHERE id = ?', [id]);
    const participants = queryAll<Agent>(
      `SELECT a.* FROM agents a
       JOIN conversation_participants cp ON a.id = cp.agent_id
       WHERE cp.conversation_id = ?`,
      [id]
    );

    return NextResponse.json({ ...conversation, participants }, { status: 201 });
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
