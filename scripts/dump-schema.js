#!/usr/bin/env node
// scripts/dump-schema.js — capture the live Postgres schema into schema/baseline.sql.
// Prefers `pg_dump --schema-only` (authoritative); falls back to catalog
// introspection (pure node/pg) when pg_dump isn't on PATH.
//
// Usage: DATABASE_URL='postgres://…' npm run schema:dump

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const outDir = path.join(__dirname, '..', 'schema');
const outFile = path.join(outDir, 'baseline.sql');
fs.mkdirSync(outDir, { recursive: true });

// ── Preferred: pg_dump ──
const dump = spawnSync('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', url], { encoding: 'utf8' });
if (dump.status === 0 && dump.stdout) {
  fs.writeFileSync(outFile, dump.stdout);
  console.log(`Wrote ${path.relative(process.cwd(), outFile)} via pg_dump`);
  process.exit(0);
}
console.warn('[schema] pg_dump unavailable — using catalog introspection fallback.');

// ── Fallback: introspect information_schema / pg_catalog ──
const pool = new Pool({
  connectionString: url,
  ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
});

function columnType(c) {
  if (c.data_type === 'character varying') return c.character_maximum_length ? `varchar(${c.character_maximum_length})` : 'varchar';
  if (c.data_type === 'numeric' && c.numeric_precision) return `numeric(${c.numeric_precision},${c.numeric_scale || 0})`;
  if (c.data_type === 'ARRAY') return `${c.udt_name.replace(/^_/, '')}[]`;
  if (c.data_type === 'USER-DEFINED') return c.udt_name;
  return c.data_type;
}

(async () => {
  try {
    const tables = (await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )).rows;

    let sql = `-- Disc Golf Go — schema baseline (catalog introspection)\n-- Generated ${new Date().toISOString()}\n-- NOTE: columns + primary keys only; for full fidelity (indexes, FKs, defaults\n-- on sequences) run with pg_dump on PATH.\n\n`;

    for (const { table_name } of tables) {
      const cols = (await pool.query(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default,
                character_maximum_length, numeric_precision, numeric_scale
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table_name]
      )).rows;

      const pk = (await pool.query(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
         ORDER BY kcu.ordinal_position`,
        [table_name]
      )).rows.map((r) => r.column_name);

      const lines = cols.map((c) => {
        let def = `  ${c.column_name} ${columnType(c)}`;
        if (c.is_nullable === 'NO') def += ' NOT NULL';
        if (c.column_default) def += ` DEFAULT ${c.column_default}`;
        return def;
      });
      if (pk.length) lines.push(`  PRIMARY KEY (${pk.join(', ')})`);

      sql += `CREATE TABLE IF NOT EXISTS ${table_name} (\n${lines.join(',\n')}\n);\n\n`;
    }

    fs.writeFileSync(outFile, sql);
    console.log(`Wrote ${path.relative(process.cwd(), outFile)} (${tables.length} tables) via introspection`);
  } catch (err) {
    console.error('[schema] introspection failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
