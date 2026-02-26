/**
 * Scheduled Job Registry
 * Pure data — all 4 recurring jobs defined here.
 */

import type { ScheduledJob } from '../types';

export const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    id: 'zeus-news-scan',
    name: 'Zeus News Scan',
    agentName: 'Zeus',
    schedule: {
      type: 'interval',
      intervalMs: 15 * 60 * 1000, // 15 minutes
      marketHoursOnly: true,
      weekdaysOnly: true,
    },
    taskTemplate: {
      title: 'Scheduled: Security & News Scan',
      description:
        'Run security news scan. Check for threat alerts, market-moving news, and anomalies across monitored feeds. Report findings to mission control.',
      priority: 'normal',
    },
    enabled: true,
  },
  {
    id: 'apollo-daily-pnl',
    name: 'Apollo Daily P&L',
    agentName: 'Apollo',
    schedule: {
      type: 'daily',
      hour: 16,
      minute: 30,
      weekdaysOnly: true,
    },
    taskTemplate: {
      title: 'Scheduled: Daily P&L Report',
      description:
        'Generate end-of-day P&L report. Summarize positions, realized/unrealized gains, and notable moves. Post report to mission control.',
      priority: 'high',
    },
    enabled: true,
  },
  {
    id: 'scanner-pre-market',
    name: 'Scanner Pre-Market',
    agentName: 'Scanner',
    schedule: {
      type: 'daily',
      hour: 9,
      minute: 25,
      weekdaysOnly: true,
    },
    taskTemplate: {
      title: 'Scheduled: Pre-Market Scan',
      description:
        'Run pre-market scanner. Identify high-volume movers, gap-ups/downs, and key levels for watchlist stocks. Deliver scan results before market open.',
      priority: 'high',
    },
    enabled: true,
  },
  {
    id: 'zen-cost-check',
    name: 'Zen Cost Check',
    agentName: 'Zen',
    schedule: {
      type: 'interval',
      intervalMs: 5 * 60 * 1000, // 5 minutes
    },
    taskTemplate: {
      title: 'Scheduled: API Cost Check',
      description:
        'Check current API spend against budget limits. Update cost state and alert if approaching daily or monthly thresholds.',
      priority: 'low',
    },
    enabled: true,
  },
];
