// src/lib/scheduler.ts — in-process scheduler for the recurring jobs.
//
// Each job runs in an isolated child process (fork) at a fixed UTC time, so a
// script's own pool teardown / process.exit() can never affect the web server.
// This reuses the standalone scripts in scripts/ (DB-only; child inherits env,
// so DATABASE_URL flows through). No external cron service required.
//
// Set RUN_SCHEDULER=false to disable — e.g. if the web service ever scales to
// more than one instance, so the jobs don't double-fire.
//
// Run state is tracked in memory and exposed via getSchedulerStatus() so the
// /health/scheduler endpoint can report it (Render logs aren't otherwise
// reachable programmatically).

import { fork } from 'child_process';
import path from 'path';

interface Job {
  name: string;
  script: string; // filename within scripts/
  hourUtc: number;
  minuteUtc: number;
  runOnBoot?: boolean; // also run ~10s after startup (job must be idempotent)
}

interface JobStatus {
  schedule: string; // "HH:MM UTC"
  nextRunAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastExitCode: number | null;
  lastError: string | null;
  runs: number;
}

// dist/lib/scheduler.js and src/lib/scheduler.ts both resolve to <repo>/scripts.
const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts');

const JOBS: Job[] = [
  // Idempotent (ON CONFLICT DO NOTHING) — safe to also run on boot so a fresh
  // deploy immediately has today's challenges assigned.
  { name: 'daily-challenge-assign', script: 'daily-challenge-assign.js', hourUtc: 0, minuteUtc: 0, runOnBoot: true },
  // Notification jobs fire only at their scheduled time (not on boot) so a
  // restart never re-sends tips/reminders.
  { name: 'training-daily-tip', script: 'training-daily-tip.js', hourUtc: 8, minuteUtc: 0 },
  { name: 'training-reminder', script: 'training-reminder.js', hourUtc: 10, minuteUtc: 0 },
  { name: 'training-reengagement', script: 'training-reengagement.js', hourUtc: 12, minuteUtc: 0 },
];

const hhmm = (j: Job): string =>
  `${String(j.hourUtc).padStart(2, '0')}:${String(j.minuteUtc).padStart(2, '0')} UTC`;

let enabled = false;
const status: Record<string, JobStatus> = Object.fromEntries(
  JOBS.map((j) => [
    j.name,
    { schedule: hhmm(j), nextRunAt: null, lastStartedAt: null, lastFinishedAt: null, lastExitCode: null, lastError: null, runs: 0 },
  ]),
);

/** Snapshot of scheduler state for the /health/scheduler endpoint. */
export function getSchedulerStatus(): { enabled: boolean; now: string; jobs: Record<string, JobStatus> } {
  return { enabled, now: new Date().toISOString(), jobs: status };
}

function runJob(job: Job): void {
  const scriptPath = path.join(SCRIPTS_DIR, job.script);
  const s = status[job.name]!;
  s.lastStartedAt = new Date().toISOString();
  s.runs += 1;
  console.log(`[scheduler] running ${job.name}`);
  const child = fork(scriptPath, [], { env: process.env, stdio: 'inherit' });
  child.on('exit', (code) => {
    s.lastFinishedAt = new Date().toISOString();
    s.lastExitCode = code;
    console.log(`[scheduler] ${job.name} exited with code ${code}`);
  });
  child.on('error', (err) => {
    s.lastError = err.message;
    console.error(`[scheduler] ${job.name} failed to start:`, err.message);
  });
}

function msUntilNextUtc(hourUtc: number, minuteUtc: number): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, minuteUtc, 0, 0,
  ));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleDaily(job: Job): void {
  const delay = msUntilNextUtc(job.hourUtc, job.minuteUtc);
  status[job.name]!.nextRunAt = new Date(Date.now() + delay).toISOString();
  setTimeout(() => {
    runJob(job);
    scheduleDaily(job); // re-arm for the following day
  }, delay);
}

export function startScheduler(): void {
  if (process.env.RUN_SCHEDULER === 'false') {
    console.log('[scheduler] disabled (RUN_SCHEDULER=false)');
    return;
  }
  enabled = true;
  for (const job of JOBS) {
    scheduleDaily(job);
    if (job.runOnBoot) setTimeout(() => runJob(job), 10_000);
  }
  console.log('[scheduler] armed:', JOBS.map((j) => `${j.name} @ ${hhmm(j)}`).join(', '));
}
