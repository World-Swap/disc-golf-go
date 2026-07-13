// src/db/types.ts — minimal DB interfaces so modules depend on a capability,
// not on the concrete pg Pool. The real pool satisfies Database; tests pass a
// fake Queryable. Keeps repositories unit-testable without a live database.

import type { QueryResult, QueryResultRow, PoolClient } from 'pg';

export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface Database extends Queryable {
  connect(): Promise<PoolClient>;
}
