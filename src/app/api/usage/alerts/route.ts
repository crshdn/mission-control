import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

interface UsageAlert {
  id: string;
  provider: string;
  model: string;
  threshold: number;
  currentUsage: number;
  alertType: 'warning' | 'critical';
  createdAt: Date;
}

// Mock function to generate usage alerts based on current usage
function generateMockAlerts(): UsageAlert[] {
  const alerts: UsageAlert[] = [];
  
  // Generate some realistic alerts
  const now = new Date();
  
  // Claude warning at 75% usage
  if (Math.random() > 0.3) { // 70% chance of having this alert
    alerts.push({
      id: 'alert_claude_warning',
      provider: 'Claude (Anthropic)',
      model: 'claude-3.5-sonnet',
      threshold: 70,
      currentUsage: 75,
      alertType: 'warning',
      createdAt: new Date(now.getTime() - 3600000), // 1 hour ago
    });
  }
  
  // OpenAI critical at 90% usage
  if (Math.random() > 0.7) { // 30% chance of having this alert
    alerts.push({
      id: 'alert_openai_critical',
      provider: 'OpenAI GPT-4',
      model: 'gpt-4o',
      threshold: 85,
      currentUsage: 92,
      alertType: 'critical',
      createdAt: new Date(now.getTime() - 1800000), // 30 minutes ago
    });
  }
  
  return alerts;
}

export async function GET(request: NextRequest) {
  try {
    // In a real implementation, this would:
    // 1. Query the database for active usage alerts
    // 2. Check current usage against configured thresholds
    // 3. Generate new alerts if thresholds are exceeded
    // 4. Return both stored and newly generated alerts

    const alerts = generateMockAlerts();

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Usage alerts error:', error);
    return NextResponse.json({ error: 'Failed to fetch usage alerts' }, { status: 500 });
  }
}

// POST endpoint to create a new usage alert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, model, threshold, currentUsage, alertType } = body;

    if (!provider || !model || threshold === undefined || currentUsage === undefined || !alertType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // In a real implementation, this would save the alert to the database
    const newAlert: UsageAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider,
      model,
      threshold,
      currentUsage,
      alertType,
      createdAt: new Date(),
    };

    return NextResponse.json(newAlert, { status: 201 });
  } catch (error) {
    console.error('Create usage alert error:', error);
    return NextResponse.json({ error: 'Failed to create usage alert' }, { status: 500 });
  }
}

// DELETE endpoint to dismiss an alert
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const alertId = searchParams.get('id');

    if (!alertId) {
      return NextResponse.json({ error: 'Alert ID is required' }, { status: 400 });
    }

    // In a real implementation, this would remove the alert from the database
    
    return NextResponse.json({ success: true, dismissed: alertId });
  } catch (error) {
    console.error('Dismiss usage alert error:', error);
    return NextResponse.json({ error: 'Failed to dismiss usage alert' }, { status: 500 });
  }
}