// src/config.ts — parse + validate environment once, fail fast on missing
// required secrets. Import `config` anywhere for typed, validated settings.

export type NodeEnv = 'development' | 'production' | 'test';

export interface Config {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  adminJwtSecret: string;
  appBaseUrl: string;
  nodeEnv: NodeEnv;
  isProduction: boolean;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: ${name} environment variable is required`);
    process.exit(1);
  }
  return value;
}

const nodeEnv = (process.env.NODE_ENV as NodeEnv) || 'development';
const isProduction = nodeEnv === 'production';

// In production the signing secrets must come from the environment; the dev
// fallbacks are intentionally insecure and never used in prod.
export const config: Config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: isProduction ? required('JWT_SECRET') : process.env.JWT_SECRET || 'dev-only-insecure-jwt-secret',
  adminJwtSecret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'dev-only-insecure-admin-secret',
  appBaseUrl: process.env.APP_BASE_URL || process.env.APP_URL || 'https://discgolfgo.app',
  nodeEnv,
  isProduction,
};
