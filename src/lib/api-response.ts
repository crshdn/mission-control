import { NextResponse } from 'next/server';
import type { ApiError } from '@/lib/types';

/**
 * Create a standardized error response
 */
export function errorResponse(error: string, status = 400): NextResponse<ApiError> {
  return NextResponse.json({ error }, { status });
}

/**
 * Create a standardized error response with details
 */
export function errorResponseWithDetails(error: string, details: unknown, status = 400): NextResponse<ApiError> {
  return NextResponse.json({ error, details }, { status });
}

/**
 * Parse error for logging and return user-safe message
 */
export function parseError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  return 'An unexpected error occurred';
}
