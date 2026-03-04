import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ewfcgdyjdnvkaejierbj.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_KEY environment variable is not set');
}

const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!supabase) {
      // Return mock data if Supabase is not configured
      return NextResponse.json({
        id,
        tool_name: 'Mock Tool',
        description: 'This is a mock bug report for testing',
        status: 'new',
        priority: 'medium',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    const { data, error } = await supabase
      .from('bug_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Bug report not found' }, { status: 404 });
      }
      console.error('Supabase query error:', error);
      return NextResponse.json({ error: 'Failed to fetch bug report' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Get bug report error:', error);
    return NextResponse.json({ error: 'Failed to fetch bug report' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    
    const allowedFields = [
      'status',
      'priority',
      'mc_task_id',
      'error_details',
      'reproduction_steps',
      'expected_behavior',
      'actual_behavior',
    ];

    // Filter to only allowed fields
    const updates = Object.keys(body)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = body[key];
        return obj;
      }, {} as Record<string, any>);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    if (!supabase) {
      // Return mock response if Supabase is not configured
      return NextResponse.json({
        id,
        ...updates,
        tool_name: 'Mock Tool',
        description: 'This is a mock bug report for testing',
        created_at: new Date().toISOString(),
      });
    }

    const { data, error } = await supabase
      .from('bug_reports')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Bug report not found' }, { status: 404 });
      }
      console.error('Supabase update error:', error);
      return NextResponse.json({ error: 'Failed to update bug report' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Update bug report error:', error);
    return NextResponse.json({ error: 'Failed to update bug report' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!supabase) {
      // Return mock response if Supabase is not configured
      return NextResponse.json({ success: true, deleted: id });
    }

    const { error } = await supabase
      .from('bug_reports')
      .delete()
      .eq('id', id);

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Bug report not found' }, { status: 404 });
      }
      console.error('Supabase delete error:', error);
      return NextResponse.json({ error: 'Failed to delete bug report' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Delete bug report error:', error);
    return NextResponse.json({ error: 'Failed to delete bug report' }, { status: 500 });
  }
}