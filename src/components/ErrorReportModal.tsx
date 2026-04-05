'use client';

const REPORT_EMAIL = 'hello@mission-control.com';

/**
 * Opens the user's default email client with error details + logs pre-filled.
 * Fetches recent logs from the server before opening.
 */
export async function openErrorReport(opts: {
  errorType: string;
  errorMessage: string;
  productId?: string;
  taskId?: string;
}) {
  // Fetch logs from server
  const params = new URLSearchParams();
  if (opts.productId) params.set('productId', opts.productId);
  if (opts.taskId) params.set('taskId', opts.taskId);

  let logs = '';
  try {
    const res = await fetch(`/api/error-reports?${params}`);
    if (res.ok) {
      const data = await res.json();
      logs = data.logs || '';
    }
  } catch {
    logs = '(Could not fetch logs)';
  }

  const subject = `Issue: ${opts.errorType} — ${opts.errorMessage.slice(0, 60)}`;
  const body = [
    `Error: ${opts.errorType}`,
    `Message: ${opts.errorMessage}`,
    `Page: ${window.location.href}`,
    `Time: ${new Date().toISOString()}`,
    '',
    '--- What were you trying to do? ---',
    '(Please describe briefly)',
    '',
    '--- System Logs ---',
    logs,
  ].join('\n');

  // mailto: has a ~2000 char URL limit in some clients, truncate if needed
  const maxBodyLen = 1800 - subject.length - REPORT_EMAIL.length;
  const truncatedBody = body.length > maxBodyLen
    ? body.slice(0, maxBodyLen) + '\n\n(Logs truncated — check Activity panel for full details)'
    : body;

  window.location.href = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(truncatedBody)}`;
}
