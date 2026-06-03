import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSourceArtifactPath, rewriteSourceArtifactPath } from './task-dispatch-context';

test('rewriteSourceArtifactPath rewrites Mission Control host artifact paths to sandbox paths', () => {
  const host = '/opt/openclaw/mission-control/data/task-artifacts/task-1/export-1/report.docx';

  assert.equal(
    rewriteSourceArtifactPath(host),
    '/workspace/mission-control-artifacts/task-1/export-1/report.docx'
  );
});

test('rewriteSourceArtifactPath preserves non-artifact paths', () => {
  assert.equal(rewriteSourceArtifactPath('/workspace/project/README.md'), '/workspace/project/README.md');
  assert.equal(rewriteSourceArtifactPath('relative/path/report.md'), 'relative/path/report.md');
});

test('rewriteSourceArtifactPath handles missing paths', () => {
  assert.equal(rewriteSourceArtifactPath(null), '');
  assert.equal(rewriteSourceArtifactPath(undefined), '');
  assert.equal(rewriteSourceArtifactPath(''), '');
});

test('resolveSourceArtifactPath prefers absolute path and rewrites it over relative storage path', () => {
  assert.equal(
    resolveSourceArtifactPath(
      '/opt/openclaw/mission-control/data/task-artifacts/task-2/export-2/report.md',
      'task-2/export-2/report.md'
    ),
    '/workspace/mission-control-artifacts/task-2/export-2/report.md'
  );
});

test('resolveSourceArtifactPath prefixes relative storage fallback with sandbox artifact root', () => {
  assert.equal(
    resolveSourceArtifactPath(null, 'task-3/export-3/report.docx'),
    '/workspace/mission-control-artifacts/task-3/export-3/report.docx'
  );
});
