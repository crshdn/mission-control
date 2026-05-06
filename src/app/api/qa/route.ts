import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import fs from 'fs';
import path from 'path';

interface PlaywrightResult {
  workerIndex: number;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration: number;
  startTime: string;
  errors: any[];
}

interface PlaywrightTest {
  projectName: string;
  results: PlaywrightResult[];
  status: string;
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
  tests: PlaywrightTest[];
  id: string;
}

interface PlaywrightSuite {
  title: string;
  file: string;
  specs: PlaywrightSpec[];
  suites?: PlaywrightSuite[];
}

interface PlaywrightReport {
  config: any;
  suites: PlaywrightSuite[];
  stats: {
    startTime: string;
    duration: number;
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
  };
}

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
  duration_ms?: number;
  notes?: string;
}

// Recursively extract all specs from nested suites
function extractSpecs(suite: PlaywrightSuite, parentTitle: string = ''): { spec: PlaywrightSpec; category: string }[] {
  const results: { spec: PlaywrightSpec; category: string }[] = [];
  const category = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;
  
  // Add specs from this suite
  for (const spec of suite.specs || []) {
    results.push({ spec, category });
  }
  
  // Recurse into child suites
  for (const childSuite of suite.suites || []) {
    results.push(...extractSpecs(childSuite, category));
  }
  
  return results;
}

// Parse Playwright results file
function parsePlaywrightResults(): QATest[] {
  const resultsPath = path.join(process.cwd(), '..', 'test-results', 'results.json');
  const altPath = '/Users/lilly/clawd/test-results/results.json';
  
  let report: PlaywrightReport | null = null;
  
  try {
    if (fs.existsSync(resultsPath)) {
      report = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    } else if (fs.existsSync(altPath)) {
      report = JSON.parse(fs.readFileSync(altPath, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to read Playwright results:', error);
    return [];
  }
  
  if (!report) return [];
  
  const qaTests: QATest[] = [];
  const startTime = report.stats?.startTime || new Date().toISOString();
  
  // Extract all specs from all suites
  for (const suite of report.suites) {
    const allSpecs = extractSpecs(suite);
    
    for (const { spec, category } of allSpecs) {
      const test = spec.tests?.[0];
      const result = test?.results?.[0];
      
      // Determine test type from category or title
      let testType: QATest['test_type'] = 'functional';
      const lowerTitle = (spec.title + category).toLowerCase();
      if (lowerTitle.includes('performance') || lowerTitle.includes('load')) {
        testType = 'performance';
      } else if (lowerTitle.includes('accessibility') || lowerTitle.includes('a11y')) {
        testType = 'accessibility';
      } else if (lowerTitle.includes('integration')) {
        testType = 'integration';
      } else if (lowerTitle.includes('regression')) {
        testType = 'regression';
      }
      
      // Extract tool name from category if it matches Atelier pattern
      let toolName = category;
      const toolMatch = category.match(/Tool:\s*([^>]+)/i) || 
                       category.match(/Atelier\s+Tool[s]?\s*[-:>]\s*([^>]+)/i);
      if (toolMatch) {
        toolName = toolMatch[1].trim();
      }
      
      const status: QATest['test_status'] = 
        result?.status === 'passed' ? 'passed' :
        result?.status === 'failed' ? 'failed' :
        result?.status === 'skipped' ? 'blocked' :
        'pending';
      
      qaTests.push({
        id: spec.id || `test_${qaTests.length}`,
        tool_name: toolName,
        test_status: status,
        test_type: testType,
        last_tested: result?.startTime || startTime,
        tester: 'Playwright E2E',
        issues_found: result?.errors?.length || 0,
        passed_checks: spec.ok ? 1 : 0,
        total_checks: 1,
        duration_ms: result?.duration,
        notes: spec.title,
      });
    }
  }
  
  return qaTests;
}

// Aggregate tests by tool/category for summary view
function aggregateByTool(tests: QATest[]): QATest[] {
  const byTool: Record<string, QATest[]> = {};
  
  for (const test of tests) {
    const key = test.tool_name;
    if (!byTool[key]) byTool[key] = [];
    byTool[key].push(test);
  }
  
  return Object.entries(byTool).map(([toolName, toolTests]) => {
    const passed = toolTests.filter(t => t.test_status === 'passed').length;
    const failed = toolTests.filter(t => t.test_status === 'failed').length;
    const total = toolTests.length;
    const lastTest = toolTests.reduce((latest, t) => 
      new Date(t.last_tested) > new Date(latest.last_tested) ? t : latest
    );
    
    return {
      id: `summary_${toolName.replace(/\s+/g, '_').toLowerCase()}`,
      tool_name: toolName,
      test_status: failed > 0 ? 'failed' : passed === total ? 'passed' : 'pending',
      test_type: 'functional' as const,
      last_tested: lastTest.last_tested,
      tester: 'Playwright E2E',
      issues_found: failed,
      passed_checks: passed,
      total_checks: total,
      duration_ms: toolTests.reduce((sum, t) => sum + (t.duration_ms || 0), 0),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const detailed = searchParams.get('detailed') === 'true';
    
    const allTests = parsePlaywrightResults();
    
    if (allTests.length === 0) {
      return NextResponse.json({
        tests: [],
        message: 'No Playwright test results found. Run tests with: npm test',
        source: 'playwright',
      });
    }
    
    const tests = detailed ? allTests : aggregateByTool(allTests);
    
    // Sort by status (failed first) then by name
    tests.sort((a, b) => {
      if (a.test_status === 'failed' && b.test_status !== 'failed') return -1;
      if (b.test_status === 'failed' && a.test_status !== 'failed') return 1;
      return a.tool_name.localeCompare(b.tool_name);
    });
    
    return NextResponse.json(tests);
  } catch (error) {
    console.error('QA tracker error:', error);
    return NextResponse.json({ error: 'Failed to fetch QA data' }, { status: 500 });
  }
}
