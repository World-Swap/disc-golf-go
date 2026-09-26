import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Database } from '../../db/types';
import { createTournamentService, MAX_ENTRIES, TOURNAMENT_HOLES } from './tournament.service';
import type { TournamentRepo, TournamentRow, EntryRow, BoardRow } from './tournament.repo';

// A transaction stub: withTransaction only needs connect(), BEGIN/COMMIT and
// release, and the fake repo below ignores the client it is handed.
const db = {
  query: async () => ({ rows: [] }) as never,
  connect: async () => ({ query: async () => ({ rows: [] }) as never, release: () => {} }) as never,
} as unknown as Database;

/** An in-memory stand-in for the tables, so the rules can be tested directly. */
function fakeRepo(opts: { courses?: { id: number; name: string }[] } = {}) {
  const courses = opts.courses ?? [
    { id: 11, name: 'Brock Park DGC' },
    { id: 22, name: 'Idlewild' },
  ];
  const tournaments: TournamentRow[] = [];
  const entries: EntryRow[] = [];
  let nextEntry = 1;
  let draws = 0;

  const repo: TournamentRepo = {
    async find(_e, weekKey) { return tournaments.find((t) => t.week_key === weekKey) ?? null; },
    async randomCourse() { return courses[draws++ % courses.length] ?? null; },
    async create(_c, weekKey, course, holes, startsAt, endsAt) {
      const found = tournaments.find((t) => t.week_key === weekKey);
      if (found) return found;                       // ON CONFLICT DO NOTHING
      const row: TournamentRow = {
        id: tournaments.length + 1, week_key: weekKey, course_id: course.id,
        course_name: course.name, holes,
        starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      };
      tournaments.push(row);
      return row;
    },
    async entries(_e, tid, pid) { return entries.filter((e) => e.tournament_id === tid && e.player_id === pid); },
    async entryById(_e, id, pid) { return entries.find((e) => e.id === id && e.player_id === pid) ?? null; },
    async takeEntry(_c, tid, pid, attempt) {
      if (entries.some((e) => e.tournament_id === tid && e.player_id === pid && e.attempt === attempt)) return null;
      const row: EntryRow = {
        id: nextEntry++, tournament_id: tid, player_id: pid, attempt, status: 'in_progress',
        par: null, strokes: null, vs_par: null, game_round_id: null,
        started_at: new Date().toISOString(), completed_at: null,
      };
      entries.push(row);
      return row;
    },
    async abandonOpen(_c, tid, pid, exceptId) {
      let n = 0;
      for (const e of entries) {
        if (e.tournament_id === tid && e.player_id === pid && e.status === 'in_progress' && e.id !== exceptId) {
          e.status = 'abandoned'; e.completed_at = new Date().toISOString(); n++;
        }
      }
      return n;
    },
    async completeEntry(_c, id, score) {
      const e = entries.find((x) => x.id === id)!;
      e.status = 'completed'; e.par = score.par; e.strokes = score.strokes;
      e.vs_par = score.vsPar; e.game_round_id = score.gameRoundId;
      e.completed_at = new Date(Date.now() + id).toISOString();   // stable, increasing
      return e;
    },
    async board(_e, tid, limit) {
      const best = new Map<number, EntryRow>();
      for (const e of entries) {
        if (e.tournament_id !== tid || e.status !== 'completed' || e.vs_par == null) continue;
        const cur = best.get(e.player_id);
        if (!cur || e.vs_par < cur.vs_par!) best.set(e.player_id, e);
      }
      return [...best.values()]
        .sort((a, b) => a.vs_par! - b.vs_par! || Date.parse(a.completed_at!) - Date.parse(b.completed_at!))
        .slice(0, limit)
        .map((e): BoardRow => ({
          player_id: e.player_id, display_name: 'P' + e.player_id, username: null, level: 1,
          vs_par: e.vs_par!, strokes: e.strokes!, completed_at: e.completed_at!,
        }));
    },
    async place(_e, tid, pid) {
      const board = new Map<number, EntryRow>();
      for (const e of entries) {
        if (e.tournament_id !== tid || e.status !== 'completed' || e.vs_par == null) continue;
        const cur = board.get(e.player_id);
        if (!cur || e.vs_par < cur.vs_par!) board.set(e.player_id, e);
      }
      const me = board.get(pid);
      if (!me) return null;
      let ahead = 0;
      for (const e of board.values()) {
        if (e.vs_par! < me.vs_par! ||
           (e.vs_par === me.vs_par && Date.parse(e.completed_at!) < Date.parse(me.completed_at!))) ahead++;
      }
      return ahead + 1;
    },
    async playerCount(_e, tid) {
      return new Set(entries.filter((e) => e.tournament_id === tid && e.status === 'completed').map((e) => e.player_id)).size;
    },
  };
  return { repo, entries, tournaments };
}

/** A submitter that scores the card the way the game service would. */
const submitRound = async (_pid: number, input: { holes: { par: number; strokes: number }[] }) => {
  const par = input.holes.reduce((a, h) => a + h.par, 0);
  const strokes = input.holes.reduce((a, h) => a + h.strokes, 0);
  return {
    round: { id: 900, par, strokes, vsPar: strokes - par },
    xp_earned: 120, challenges_completed: [], new_badges: [],
  };
};

const card = (strokesPerHole: number, holes = TOURNAMENT_HOLES) =>
  Array.from({ length: holes }, () => ({ par: 3, strokes: strokesPerHole }));

const NOW = new Date('2026-09-24T12:00:00Z');   // a Thursday

test('the tournament is one course a week, 18 holes', async (t) => {
  await t.test('created once, then reused — everyone gets the same course', async () => {
    const { repo, tournaments } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const a = await svc.current(NOW);
    const b = await svc.current(NOW);
    assert.equal(tournaments.length, 1, 'only one tournament row for the week');
    assert.equal(a.id, b.id);
    assert.equal(a.course_name, b.course_name, 'the course does not change mid-week');
  });

  await t.test('always 18 holes, and the week runs Monday to Monday', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const t1 = await svc.current(NOW);
    assert.equal(t1.holes, 18);
    assert.equal(new Date(t1.starts_at).getUTCDay(), 1, 'starts on a Monday');
    assert.equal(Date.parse(t1.ends_at) - Date.parse(t1.starts_at), 7 * 24 * 3600 * 1000);
  });

  await t.test('a new week draws a new tournament', async () => {
    const { repo, tournaments } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    await svc.current(NOW);
    await svc.current(new Date('2026-10-01T12:00:00Z'));   // the following week
    assert.equal(tournaments.length, 2);
    assert.notEqual(tournaments[0]!.week_key, tournaments[1]!.week_key);
  });
});

test('two entries, and starting one spends it', async (t) => {
  await t.test('an unfinished entry is still used up', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });

    const first = await svc.startEntry(1, NOW);
    assert.equal(first.entries_remaining, 1);

    // Walk away — no score posted — then take the second.
    const second = await svc.startEntry(1, NOW);
    assert.equal(second.entries_remaining, 0);

    // The first is closed out, not left hanging, and both are spent.
    const view = await svc.overview(1, NOW);
    assert.equal(view.me!.used, MAX_ENTRIES);
    assert.equal(view.me!.remaining, 0);
    assert.equal(view.me!.entries[0]!.status, 'abandoned');

    await assert.rejects(() => svc.startEntry(1, NOW), /used both entries/i,
      'a dropped round does not hand the entry back');
  });

  await t.test('abandoning explicitly does not refund either', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const e = await svc.startEntry(2, NOW);
    const after = await svc.abandonEntry(2, e.entry.id, NOW);
    assert.equal(after.entry.status, 'abandoned');
    assert.equal(after.entries_remaining, 1, 'one left, not two');
  });

  await t.test('a finished entry spends one too', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const e = await svc.startEntry(3, NOW);
    const done = await svc.finishEntry(3, e.entry.id, card(3), NOW);
    assert.equal(done.entry.status, 'completed');
    assert.equal(done.entry.vs_par, 0);
    assert.equal(done.entries_remaining, 1);
  });

  await t.test('two players each get their own two entries', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    await svc.startEntry(1, NOW); await svc.startEntry(1, NOW);
    const other = await svc.startEntry(2, NOW);
    assert.equal(other.entries_remaining, 1, "one player's entries are not another's");
  });
});

test('posting a score', async (t) => {
  await t.test('a card that is not 18 holes is refused', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const e = await svc.startEntry(1, NOW);
    await assert.rejects(() => svc.finishEntry(1, e.entry.id, card(3, 9), NOW), /18 holes/);
    await assert.rejects(() => svc.finishEntry(1, e.entry.id, card(3, 0), NOW), /18 holes/);
  });

  await t.test('an entry cannot be scored twice', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const e = await svc.startEntry(1, NOW);
    await svc.finishEntry(1, e.entry.id, card(3), NOW);
    await assert.rejects(() => svc.finishEntry(1, e.entry.id, card(2), NOW), /already has a score/i,
      'no improving a posted score');
  });

  await t.test('an abandoned entry cannot be scored later', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const first = await svc.startEntry(1, NOW);
    await svc.startEntry(1, NOW);                       // abandons the first
    await assert.rejects(() => svc.finishEntry(1, first.entry.id, card(2), NOW), /abandoned/i);
  });

  await t.test("someone else's entry is not yours to score", async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const e = await svc.startEntry(1, NOW);
    await assert.rejects(() => svc.finishEntry(2, e.entry.id, card(3), NOW), /not found/i);
  });

  await t.test('the better of the two rounds is the one that counts', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const a = await svc.startEntry(1, NOW);
    await svc.finishEntry(1, a.entry.id, card(4), NOW);        // +18
    const b = await svc.startEntry(1, NOW);
    const second = await svc.finishEntry(1, b.entry.id, card(2), NOW);   // -18
    assert.equal(second.best!.vs_par, -18, 'best of the two, not the latest');

    const view = await svc.overview(1, NOW);
    assert.equal(view.me!.best!.vs_par, -18);
  });

  await t.test('a worse second round does not replace a good first', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const a = await svc.startEntry(1, NOW);
    await svc.finishEntry(1, a.entry.id, card(2), NOW);        // -18
    const b = await svc.startEntry(1, NOW);
    const second = await svc.finishEntry(1, b.entry.id, card(5), NOW);   // +36
    assert.equal(second.best!.vs_par, -18);
  });
});

test('place and remaining are told straight', async (t) => {
  await t.test('place counts the whole field, not just the rows on screen', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    // 30 players finish ahead of ours — more than the 25 the board shows.
    for (let pid = 1; pid <= 30; pid++) {
      const e = await svc.startEntry(pid, NOW);
      await svc.finishEntry(pid, e.entry.id, card(2), NOW);       // -18
    }
    const late = await svc.startEntry(99, NOW);
    await svc.finishEntry(99, late.entry.id, card(5), NOW);       // +36, last
    const view = await svc.overview(99, NOW);
    assert.equal(view.me!.place, 31, 'ranked 31st, not unranked for being off the page');
    assert.equal(view.leaderboard.length, 25, 'the board itself still shows 25');
  });

  await t.test('abandoning an already-closed entry still reports what is left', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const e = await svc.startEntry(1, NOW);
    await svc.finishEntry(1, e.entry.id, card(3), NOW);
    const again = await svc.abandonEntry(1, e.entry.id, NOW);
    assert.equal(again.entries_remaining, 1, 'one entry is still there to play');
  });
});

test('the board', async (t) => {
  await t.test('lowest score first, and one row per player', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    for (const [pid, strokes] of [[1, 4], [2, 2], [3, 3]] as const) {
      const e = await svc.startEntry(pid, NOW);
      await svc.finishEntry(pid, e.entry.id, card(strokes), NOW);
    }
    // Player 1 improves on the second attempt but still gets one row.
    const again = await svc.startEntry(1, NOW);
    await svc.finishEntry(1, again.entry.id, card(1), NOW);

    const { leaderboard } = await svc.leaderboard(25, NOW);
    assert.deepEqual(leaderboard.map((r) => r.player_id), [1, 2, 3]);
    assert.deepEqual(leaderboard.map((r) => r.rank), [1, 2, 3]);
    assert.equal(leaderboard.filter((r) => r.player_id === 1).length, 1, 'one row per player');
    assert.equal(leaderboard[0]!.vs_par, -36);
  });

  await t.test('an unfinished round is not on the board', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    await svc.startEntry(1, NOW);                      // started, never posted
    const view = await svc.overview(1, NOW);
    assert.equal(view.leaderboard.length, 0);
    assert.equal(view.players, 0);
    assert.equal(view.me!.place, null, 'no place without a score');
    assert.equal(view.me!.used, 1, 'but the entry is gone');
  });

  await t.test('overview works signed out', async () => {
    const { repo } = fakeRepo();
    const svc = createTournamentService({ db, repo, submitRound });
    const e = await svc.startEntry(1, NOW);
    await svc.finishEntry(1, e.entry.id, card(3), NOW);
    const view = await svc.overview(null, NOW);
    assert.equal(view.me, null);
    assert.equal(view.leaderboard.length, 1);
    assert.equal(view.holes, TOURNAMENT_HOLES);
    assert.ok(view.course.name);
  });
});
