import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

type TableName = 'agents' | 'tasks' | 'workspaces';

export type ForeignKeyValidationFailure = {
  field: string;
  value: string;
  table: TableName;
};

export function foreignKeyErrorResponse(failure: ForeignKeyValidationFailure) {
  return NextResponse.json(
    {
      error: 'Invalid foreign key reference',
      field: failure.field,
      value: failure.value,
      details: `No ${failure.table} row exists for ${failure.field}`,
    },
    { status: 400 }
  );
}

export function missingForeignKey(field: string, value: string | null | undefined, table: TableName): ForeignKeyValidationFailure | null {
  if (!value) {
    return null;
  }

  const row = queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [value]);
  return row ? null : { field, value, table };
}
