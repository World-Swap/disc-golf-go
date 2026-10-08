// src/modules/videos/lesson-generator.ts — turn a new channel upload into a
// lesson, filed in the existing category it teaches.
//
// This ADDS to the library. The 134 curated lessons are never read, re-filed,
// re-scored or replaced by anything here: a generated lesson is a new row, in an
// existing category, carrying `generated_from_video`. That column is the only
// thing that distinguishes it, and the curated rows leave it NULL.
//
// It publishes with NO HUMAN REVIEW, so it inherits three gates from the feed
// pipeline and adds nothing of its own invention:
//
//   1. the channel is on the trusted list (scripts/video-channels.json)
//   2. `teaches()` judged the title instruction rather than coverage
//   3. `classifyVideo()` found ONE category the title plainly names
//
// What it will not do is make anything up. It has not watched the video, so it
// writes no tips, no key takeaways and no difficulty grade -- inventing those is
// exactly the "plausible title is not evidence" failure the 2026-09-29 audit was
// cleaning up. The lesson is the video plus an honest framing of it.

import type { Pool, PoolClient } from 'pg';
import { classifyVideo } from './classify';

export interface GeneratedLesson {
  videoId: string;
  slug: string;
  title: string;
  categorySlug: string;
  score: number;
}

/**
 * Generated lessons pay the BEGINNER rate, the lowest of the three (100 / 150 /
 * 200), because nothing here can grade a video's difficulty from its title and
 * guessing high would inflate the economy that now buys coupons. `all_levels`
 * for the same reason: it is honest about not knowing, and /training's level
 * filters show it in every tab rather than hiding it in the wrong one.
 */
const GENERATED_XP = 100;
// NOT 'beginner'. Nothing has graded these, and 'beginner' is a claim shown
// as a badge beside lessons whose difficulty a person actually chose. It
// also let an unwatched upload win topRecommendedLesson, whose filter is
// `difficulty IN ('beginner','intermediate')`.
const GENERATED_DIFFICULTY = 'unrated';
const GENERATED_SKILL_LEVEL = 'all_levels';

/** Trailing " | Channel Name" / " - Channel" promo tails, and leading emoji. */
function cleanTitle(raw: string): string {
  let t = String(raw || '')
    // Leading decoration: the feed is full of "🥏 Stop Rushing Your Plant Foot".
    .replace(/^[\s\p{Extended_Pictographic}\p{So}|·—–-]+/u, '')
    .replace(/[\s\p{Extended_Pictographic}\p{So}]+$/u, '')
    .trim();
  // Drop a trailing segment that is channel branding or a hashtag run rather
  // than part of the title ("| Jomez", "#shorts").
  t = t.replace(/\s*(\|\||\|)\s*[^|]{0,40}$/u, (m) =>
    /\b(disc golf|guide|explained|tutorial|tips?|how to|part \d)\b/i.test(m) ? m : ''
  );
  t = t.replace(/\s*#\w+(\s+#\w+)*\s*$/u, '').trim();
  // SHOUTING words back to Title Case, leaving real acronyms (PDGA, OB) alone.
  t = t.replace(/\b[A-Z]{4,}(?:['’][A-Z]+)?\b/g, (w) =>
    ['PDGA', 'USDGC', 'DGPT'].includes(w) ? w : w[0] + w.slice(1).toLowerCase()
  );
  // A leading "Part 3 of 3." buries what the lesson is about behind
  // bookkeeping, so it moves to the end -- but it is appended AFTER truncation,
  // never before. Truncating a title that ends "(Part 3)" cuts the marker off,
  // and a three-part series then publishes three lessons with identical titles.
  const part = t.match(/^part\s+(\d+)(\s*(of|\/)\s*\d+)?\s*[.:\-–—]?\s*/i);
  const suffix = part ? ` (Part ${part[1]})` : '';
  if (part) t = t.slice(part[0].length);
  t = t
    .replace(/\|\|+/g, '|')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[.\s:\-–—|]+/, '')
    .replace(/[.\s|]+$/, '')
    .trim();
  return truncateWords(t, TITLE_MAX - suffix.length) + suffix;
}

/** Longest title a lesson card can show without wrapping into a paragraph. */
const TITLE_MAX = 72;

/**
 * Cut on a word boundary and SAY SO with an ellipsis. A YouTube title is
 * sometimes a whole sentence ("If you struggle with getting enough power on
 * putts, there are three things you must do"), which is a video title and not a
 * lesson title. Truncating visibly is honest -- the untouched original is still
 * stored in youtube_title and shown on the video itself -- where cutting
 * silently would read as a broken string.
 */
function truncateWords(t: string, max: number): string {
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/**
 * Slug for the lesson page, which is an INDEXED url on .com, so it wants to be
 * readable. The video id is always appended rather than only on collision: it
 * makes the slug unique by construction against the curated 134 and against
 * every other generated lesson, so there is no retry loop and no chance of
 * clobbering a hand-written lesson's indexed url.
 */
function lessonSlug(title: string, videoId: string): string {
  const base = cleanTitle(title)
    .replace(/…$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  const id = videoId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11).toLowerCase();
  return `${base || 'lesson'}-${id}`;
}

/** An honest body for a video nobody here has watched. */
/**
 * WHAT A GENERATED ROW IS ALLOWED TO SAY ABOUT ITSELF.
 *
 * The old copy read "Coaching from <channel>. This lesson is the video
 * itself…" -- which claims coaching twice and calls itself a lesson, next to
 * 134 hand-written lessons that really are coached. Nothing here has watched
 * the video, graded it, or written a word about what it teaches, so none of
 * those words are ours to use.
 *
 * It says instead what is actually true: a recent upload from a channel the
 * library already draws on, filed by what its title names. That is genuinely
 * useful and it is not a lesson.
 */
export function descriptionFor(channel: string): string {
  return `New upload from ${channel}.`;
}

export function bodyFor(channel: string) {
  return {
    body:
      `A recent upload from ${channel}, filed here by what its title says it ` +
      `covers. Nobody at Disc Golf Go has watched it, so there are no notes or ` +
      `drills with it — it is the video, and the channel's own work.`,
    // Marked in the content as well as the column, so a row dumped on its own
    // still says where it came from.
    generated: true,
  };
}

/**
 * Bring every existing generated row to the current copy.
 *
 * `INSERT … ON CONFLICT DO NOTHING` is what makes the job idempotent, and it
 * also means a row written months ago keeps whatever wording it was created
 * with. Without this, changing the copy above would only affect uploads that
 * had not happened yet, and the rows already claiming to be coaching would
 * stay that way forever. Runs on every pass and is a no-op once settled.
 */
export async function relabelGeneratedLessons(pool: Pool): Promise<number> {
  const r = await pool.query(
    `UPDATE training_lessons l
        SET description = $1 || l.youtube_channel || $2,
            content_body = jsonb_build_object(
              'body', $3 || l.youtube_channel || $4,
              'generated', true
            ),
            difficulty = $5
      WHERE l.generated_from_video IS NOT NULL
        AND l.youtube_channel IS NOT NULL
        AND (l.description IS DISTINCT FROM $1 || l.youtube_channel || $2
             OR l.content_body->>'body' IS DISTINCT FROM $3 || l.youtube_channel || $4
             OR l.difficulty IS DISTINCT FROM $5)`,
    [
      'New upload from ', '.',
      'A recent upload from ',
      ", filed here by what its title says it covers. Nobody at Disc Golf Go has watched it, so there are no notes or drills with it — it is the video, and the channel's own work.",
      GENERATED_DIFFICULTY,
    ]
  );
  return r.rowCount ?? 0;
}

/**
 * Publish a lesson for every trusted, instructional upload that names a
 * category, skipping any video already turned into one.
 *
 * Each lesson is its own transaction: one bad row must not cost the rest of the
 * batch, and the unique index means a concurrent run simply loses the race
 * rather than duplicating.
 */
export async function generateLessonsFromVideos(
  pool: Pool,
  opts: { limit?: number; dryRun?: boolean } = {}
): Promise<{ created: GeneratedLesson[]; considered: number; refused: number }> {
  const limit = opts.limit ?? 200;
  const { rows } = await pool.query<{
    video_id: string;
    title: string;
    channel_name: string;
  }>(
    `SELECT v.video_id, v.title, v.channel_name
       FROM channel_videos v
      WHERE v.teaches = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM training_lessons l WHERE l.generated_from_video = v.video_id
        )
      ORDER BY v.published_at DESC
      LIMIT $1`,
    [limit]
  );

  const created: GeneratedLesson[] = [];
  let refused = 0;

  for (const v of rows) {
    const c = classifyVideo(v.title);
    if (!c) { refused++; continue; }

    const title = cleanTitle(v.title);
    if (!title) { refused++; continue; }
    const slug = lessonSlug(v.title, v.video_id);

    if (opts.dryRun) {
      created.push({ videoId: v.video_id, slug, title, categorySlug: c.categorySlug, score: c.score });
      continue;
    }

    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      const cat = await client.query<{ id: number }>(
        'SELECT id FROM training_categories WHERE slug = $1',
        [c.categorySlug]
      );
      const categoryId = cat.rows[0]?.id;
      if (categoryId === undefined) {
        // The classifier can only emit real category slugs (a test pins that),
        // so this means the category is missing from THIS database. Skip rather
        // than invent one.
        await client.query('ROLLBACK');
        refused++;
        continue;
      }

      // Append after everything already in the category, so a generated lesson
      // never pushes a curated one down the page.
      const ord = await client.query<{ next: number }>(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM training_lessons WHERE category_id = $1',
        [categoryId]
      );

      const ins = await client.query<{ id: number }>(
        `INSERT INTO training_lessons
           (category_id, title, slug, description, difficulty, content_type, content_body,
            xp_reward, sort_order, skill_level, youtube_url, youtube_title, youtube_channel,
            generated_from_video, is_active)
         VALUES ($1,$2,$3,$4,$5,'video_embed',$6,$7,$8,$9,$10,$11,$12,$13,TRUE)
         ON CONFLICT (generated_from_video) WHERE generated_from_video IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [
          categoryId,
          title,
          slug,
          // Not the title again: the description renders directly under the
          // title on every row, so repeating it wastes the only line there is
          // to say something the player does not already see.
          descriptionFor(v.channel_name),
          GENERATED_DIFFICULTY,
          JSON.stringify(bodyFor(v.channel_name)),
          GENERATED_XP,
          Number(ord.rows[0]?.next ?? 1),
          GENERATED_SKILL_LEVEL,
          `https://www.youtube.com/watch?v=${v.video_id}`,
          v.title,
          v.channel_name,
          v.video_id,
        ]
      );
      await client.query('COMMIT');
      if (ins.rows[0]) {
        created.push({ videoId: v.video_id, slug, title, categorySlug: c.categorySlug, score: c.score });
      }
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[lessons:generate] ${v.video_id} failed:`, (e as Error).message);
    } finally {
      client.release();
    }
  }

  return { created, considered: rows.length, refused };
}

export const __test = { cleanTitle, lessonSlug, GENERATED_XP };
