import path from 'path';
import { assert, loadLocalEnv, request, waitFor } from './_shared';

type JsonRecord = Record<string, any>;

async function ensureIdeas(baseUrl: string, productId: string): Promise<any[]> {
  let ideas = await request(baseUrl, `/api/products/${productId}/swipe/deck`);

  if (ideas.length >= 2) return ideas;

  const fillers = [
    {
      title: 'Smoke idea alpha',
      description: 'Manual idea created by smoke test to exercise swipe actions.',
      category: 'feature',
      complexity: 'S',
      impact_score: 6,
      feasibility_score: 9,
      technical_approach: 'No-op smoke path.',
      tags: ['smoke', 'manual'],
    },
    {
      title: 'Smoke idea beta',
      description: 'Second manual idea created by smoke test to exercise approve and maybe flows.',
      category: 'ux',
      complexity: 'S',
      impact_score: 5,
      feasibility_score: 9,
      technical_approach: 'No-op smoke path.',
      tags: ['smoke', 'manual'],
    },
  ];

  for (const filler of fillers) {
    if (ideas.length >= 2) break;
    await request(baseUrl, `/api/products/${productId}/ideas`, {
      method: 'POST',
      body: JSON.stringify(filler),
    });
    ideas = await request(baseUrl, `/api/products/${productId}/swipe/deck`);
  }

  assert(ideas.length >= 2, 'Expected at least two swipeable ideas after ideation/manual fallback');
  return ideas;
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const { missionControlUrl } = loadLocalEnv(repoRoot);
  const baseUrl = missionControlUrl;
  const productName = `Smoke Product ${new Date().toISOString()}`;

  const product = await request(baseUrl, '/api/products', {
    method: 'POST',
    body: JSON.stringify({
      name: productName,
      description: 'Mission Control v2 smoke test product',
      product_program: [
        '# Product Program',
        'Focus on practical product improvements with clear user value.',
        'Prioritize research-backed ideas and planning-first task creation.',
      ].join('\n'),
      live_url: 'https://example.com',
      build_mode: 'plan_first',
      workspace_id: 'default',
    }),
  });
  const productId = product.id as string;
  assert(productId, 'Product creation did not return an id');

  await request(baseUrl, `/api/products/${productId}/research/run`, {
    method: 'POST',
    body: JSON.stringify({ chainIdeation: false }),
  });

  const researchCycles = await waitFor(
    'research cycle',
    () => request(baseUrl, `/api/products/${productId}/research/cycles`),
    (cycles: JsonRecord[]) =>
      Array.isArray(cycles) &&
      cycles.length > 0 &&
      ['completed', 'failed', 'interrupted'].includes(cycles[0].status),
  );
  assert(researchCycles[0].status === 'completed', `Research did not complete successfully: ${researchCycles[0].status}`);

  await request(baseUrl, `/api/products/${productId}/ideation/run`, {
    method: 'POST',
    body: JSON.stringify({ cycle_id: researchCycles[0].id }),
  });

  const ideationCycles = await waitFor(
    'ideation cycle',
    () => request(baseUrl, `/api/products/${productId}/ideation/cycles`),
    (cycles: JsonRecord[]) =>
      Array.isArray(cycles) &&
      cycles.length > 0 &&
      ['completed', 'failed', 'interrupted'].includes(cycles[0].status),
  );
  assert(ideationCycles[0].status === 'completed', `Ideation did not complete successfully: ${ideationCycles[0].status}`);

  const ideas = await ensureIdeas(baseUrl, productId);
  const maybeIdea = ideas[0];
  const approveIdea = ideas[1];

  const maybeResult = await request(baseUrl, `/api/products/${productId}/swipe`, {
    method: 'POST',
    body: JSON.stringify({
      idea_id: maybeIdea.id,
      action: 'maybe',
      notes: 'Smoke test maybe action',
    }),
  });
  assert(maybeResult.idea?.status === 'maybe', 'Maybe swipe did not update idea status');

  const approveResult = await request(baseUrl, `/api/products/${productId}/swipe`, {
    method: 'POST',
    body: JSON.stringify({
      idea_id: approveIdea.id,
      action: 'approve',
      notes: 'Smoke test approve action',
    }),
  });
  const taskId = approveResult.task?.id as string | undefined;
  assert(taskId, 'Approve swipe did not create a task');

  const maybePool = await request(baseUrl, `/api/products/${productId}/maybe`);
  assert(
    Array.isArray(maybePool) && maybePool.some((entry: JsonRecord) => entry.idea_id === maybeIdea.id),
    'Maybe pool does not contain the swiped idea',
  );

  const activity = await request(baseUrl, `/api/products/${productId}/activity?limit=20`);
  assert(Array.isArray(activity.entries), 'Activity endpoint did not return an entries array');
  assert(activity.entries.length > 0, 'Expected autopilot activity entries after research and ideation');

  const costs = await request(baseUrl, `/api/products/${productId}/costs`);
  assert(typeof costs === 'object' && costs !== null, 'Costs endpoint did not return an object');

  const planningResponse = await fetch(`${baseUrl}/api/tasks/${taskId}/planning`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.MC_API_TOKEN ? { Authorization: `Bearer ${process.env.MC_API_TOKEN}` } : {}),
    },
    body: JSON.stringify({}),
  });
  assert(
    planningResponse.ok || planningResponse.status === 409,
    `Planning endpoint was not reachable as expected: ${planningResponse.status}`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        productId,
        researchCycleId: researchCycles[0].id,
        ideationCycleId: ideationCycles[0].id,
        maybeIdeaId: maybeIdea.id,
        approvedIdeaId: approveIdea.id,
        taskId,
        planningStatus: planningResponse.status,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[smoke] failed:', error);
  process.exitCode = 1;
});
