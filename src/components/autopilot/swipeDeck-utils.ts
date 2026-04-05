import { SWIPE_BATCH_THRESHOLD } from '@/lib/constants';

export function shouldShowReviewAll(totalIdeas: number): boolean {
  return totalIdeas >= SWIPE_BATCH_THRESHOLD;
}