import { NextRequest, NextResponse } from 'next/server';

interface QATest {
  id: string;
  tool_name: string;
  test_status: 'pending' | 'in_progress' | 'passed' | 'failed' | 'blocked';
  test_type: 'functional' | 'performance' | 'accessibility' | 'integration' | 'regression';
  last_tested: string;
  tester: string;
  issues_found: number;
  passed_checks: number;
  total_checks: number;
  notes?: string;
  bug_reports?: string[];
}

// In-memory store for demo purposes
// In a real implementation, this would be a database
const qaTestStore: Map<string, QATest> = new Map();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // For now, return mock data since we don't have persistent storage
    // In a real implementation, this would query the QA database
    const mockTest: QATest = {
      id,
      tool_name: 'Mock Tool',
      test_status: 'pending',
      test_type: 'functional',
      last_tested: new Date().toISOString(),
      tester: 'QA Bot',
      issues_found: 0,
      passed_checks: 0,
      total_checks: 10,
      notes: 'This is a mock QA test for development',
    };

    return NextResponse.json(mockTest);
  } catch (error) {
    console.error('Get QA test error:', error);
    return NextResponse.json({ error: 'Failed to fetch QA test' }, { status: 500 });
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
      'test_status',
      'issues_found',
      'passed_checks', 
      'notes',
      'last_tested',
      'bug_reports',
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

    // Always update the last_tested timestamp
    updates.last_tested = new Date().toISOString();

    // Auto-update issues_found and passed_checks based on test_status
    if (updates.test_status === 'passed') {
      updates.issues_found = 0;
      if (!updates.passed_checks) {
        updates.passed_checks = 10; // Default total_checks
      }
    } else if (updates.test_status === 'failed' && !updates.issues_found) {
      updates.issues_found = 1; // Default to at least 1 issue if failed
    }

    // In a real implementation, this would update the QA database
    // For now, store in memory and return the updated test
    const existingTest = qaTestStore.get(id);
    const updatedTest = {
      id,
      tool_name: existingTest?.tool_name || 'Updated Tool',
      test_type: existingTest?.test_type || 'functional',
      tester: existingTest?.tester || 'QA Bot',
      total_checks: existingTest?.total_checks || 10,
      passed_checks: existingTest?.passed_checks || 0,
      issues_found: existingTest?.issues_found || 0,
      test_status: existingTest?.test_status || 'pending',
      notes: existingTest?.notes,
      bug_reports: existingTest?.bug_reports,
      last_tested: existingTest?.last_tested || new Date().toISOString(),
      ...updates,
    } as QATest;

    qaTestStore.set(id, updatedTest);

    return NextResponse.json(updatedTest);
  } catch (error) {
    console.error('Update QA test error:', error);
    return NextResponse.json({ error: 'Failed to update QA test' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // In a real implementation, this would delete from the QA database
    qaTestStore.delete(id);

    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error('Delete QA test error:', error);
    return NextResponse.json({ error: 'Failed to delete QA test' }, { status: 500 });
  }
}