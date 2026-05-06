import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ewfcgdyjdnvkaejierbj.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_KEY environment variable is not set');
}

const supabase = supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

interface BugReport {
  id: string;
  tool_name: string;
  description: string;
  status: 'new' | 'in_progress' | 'fixed' | 'duplicate' | 'wont_fix';
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
  updated_at: string;
  user_email?: string;
  error_details?: string;
  reproduction_steps?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  user_agent?: string;
  mc_task_id?: string;
}

export async function GET(request: NextRequest) {
  try {
    if (!supabase) {
      // Return mock data if Supabase is not configured
      return NextResponse.json([
        {
          id: 'bug_001',
          tool_name: 'PDF Merger',
          description: 'Tool crashes when uploading files larger than 10MB',
          status: 'new',
          priority: 'high',
          created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          updated_at: new Date(Date.now() - 86400000).toISOString(),
          user_email: 'user@example.com',
          error_details: 'RangeError: Maximum call stack size exceeded',
          reproduction_steps: '1. Upload a file > 10MB\n2. Click merge\n3. Tool crashes',
          expected_behavior: 'File should be processed normally',
          actual_behavior: 'Tool crashes with JavaScript error',
          user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        },
        {
          id: 'bug_002',
          tool_name: 'Color Palette Generator',
          description: 'Generated colors not accessible (low contrast)',
          status: 'in_progress',
          priority: 'medium',
          created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
          updated_at: new Date(Date.now() - 86400000).toISOString(),
          user_email: 'designer@company.com',
          mc_task_id: 'task_123',
          reproduction_steps: '1. Generate palette with "vibrant" theme\n2. Check contrast ratios',
          expected_behavior: 'All colors should meet WCAG AA contrast requirements',
          actual_behavior: 'Multiple color combinations fail contrast checks',
        },
        {
          id: 'bug_003',
          tool_name: 'Text Formatter',
          description: 'Special characters being stripped from output',
          status: 'new',
          priority: 'medium',
          created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          updated_at: new Date(Date.now() - 3600000).toISOString(),
          user_email: 'writer@blog.com',
          error_details: 'Unicode characters U+2013, U+2014 being removed',
          reproduction_steps: '1. Input text with em dashes and en dashes\n2. Apply formatting\n3. Check output',
          expected_behavior: 'Special characters should be preserved',
          actual_behavior: 'Dashes are completely removed from text',
        },
      ]);
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');

    let query = supabase
      .from('bug_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json({ error: 'Failed to fetch bug reports from Supabase' }, { status: 500 });
    }

    // Transform Supabase data to match component expectations
    const transformedData = (data || []).map((bug: Record<string, unknown>) => {
      // Parse description for [BUG] or [OTHER] tags
      const desc = (bug.description as string) || '';
      const isBug = desc.includes('[BUG]');
      const isOther = desc.includes('[OTHER]');
      
      // Derive priority from description or default
      let priority = 'medium';
      if (desc.toLowerCase().includes('crash') || desc.toLowerCase().includes('critical')) {
        priority = 'critical';
      } else if (desc.toLowerCase().includes('urgent') || desc.toLowerCase().includes('broken')) {
        priority = 'high';
      } else if (isOther) {
        priority = 'low';
      }
      
      // Map status: 'open' -> 'new'
      let status = bug.status;
      if (status === 'open') status = 'new';
      
      return {
        ...bug,
        user_email: bug.email,
        priority,
        status,
        // Parse notes JSON if present
        mc_task_id: bug.mc_task_id || null,
      };
    });

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Bug reports error:', error);
    return NextResponse.json({ error: 'Failed to fetch bug reports' }, { status: 500 });
  }
}

// POST endpoint to create a new bug report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tool_name,
      description,
      priority = 'medium',
      user_email,
      error_details,
      reproduction_steps,
      expected_behavior,
      actual_behavior,
      user_agent,
    } = body;

    if (!tool_name || !description) {
      return NextResponse.json({ error: 'tool_name and description are required' }, { status: 400 });
    }

    if (!supabase) {
      // Return mock response if Supabase is not configured
      return NextResponse.json({
        id: `bug_${Date.now()}`,
        tool_name,
        description,
        status: 'new',
        priority,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_email,
        error_details,
        reproduction_steps,
        expected_behavior,
        actual_behavior,
        user_agent,
      }, { status: 201 });
    }

    const newBugReport = {
      tool_name,
      description,
      status: 'new' as const,
      priority,
      user_email,
      error_details,
      reproduction_steps,
      expected_behavior,
      actual_behavior,
      user_agent,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('bug_reports')
      .insert([newBugReport])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: 'Failed to create bug report' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('Create bug report error:', error);
    return NextResponse.json({ error: 'Failed to create bug report' }, { status: 500 });
  }
}