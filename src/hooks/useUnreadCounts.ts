'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LEGACY_TASK_READS_STORAGE_KEY,
  PRIMARY_TASK_READS_STORAGE_KEY,
} from '@/lib/runtime-compat';

/**
 * Hook to poll unread message counts for all tasks.
 * Returns a map of taskId -> unreadCount.
 * Uses hybrid approach: localStorage for immediate updates, API for ground truth.
 */

const LOCAL_STORAGE_KEY = PRIMARY_TASK_READS_STORAGE_KEY;
const LEGACY_LOCAL_STORAGE_KEY = LEGACY_TASK_READS_STORAGE_KEY;

function getLocalReads(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY) ?? localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function markTaskReadLocally(taskId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const reads = getLocalReads();
    reads[taskId] = new Date().toISOString();
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(reads));
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  } catch {
    // Silent
  }
}

export function useUnreadCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks/unread');
      if (res.ok) {
        const data: Array<{ task_id: string; unread_count: number }> = await res.json();
        const map: Record<string, number> = {};
        for (const row of data) {
          map[row.task_id] = row.unread_count;
        }
        setCounts(map);
      }
    } catch {
      // Silent
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    pollRef.current = setInterval(fetchCounts, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchCounts]);

  return counts;
}
