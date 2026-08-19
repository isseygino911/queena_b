/**
 * African drum challenge routes.
 *
 * Self-contained: drum runs are stored in `drum_scores`, which has no
 * dependency on `tracks`, so nothing here touches the piano game's tables or
 * queries.
 *
 *   POST /api/drums/challenges/:challengeId/score  - save a run (auth)
 *   GET  /api/drums/challenges/:challengeId/scores - leaderboard (public)
 *   GET  /api/drums/me/progress                    - personal bests (auth)
 */

import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/database';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/** The twelve instruments, mirroring the client's data file. */
const INSTRUMENT_SLUGS = new Set([
  'djembe',
  'dunun',
  'talking-drum',
  'bata',
  'sabar',
  'bougarabou',
  'ashiko',
  'kpanlogo',
  'ngoma',
  'slit-drum',
  'balafon',
  'mbira',
]);

const GRADES = new Set(['S', 'A+', 'A', 'B', 'C', 'D', 'F']);

/** `${slug}-${1..10}`, e.g. "talking-drum-7". */
const CHALLENGE_ID = /^([a-z-]+)-([1-9]|10)$/;

/**
 * Guard against absurd values without pretending this is anti-cheat — a
 * determined client can still post a plausible score. The point is that
 * malformed or nonsensical payloads never reach the table.
 */
const MAX_SCORE = 1_000_000;
const MAX_NOTES = 1_000;

interface ScoreBody {
  instrumentSlug: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  perfectCount: number;
  goodCount: number;
  missCount: number;
  totalNotes: number;
  grade: string;
}

const isCount = (value: unknown, max: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= max;

/** Outcome of validating a submission. */
type Validation =
  | { ok: true; body: ScoreBody }
  | { ok: false; message: string };

/**
 * Validate a submission. On success the body is returned already narrowed to
 * `ScoreBody`, so the insert below needs no casts or non-null assertions.
 */
function validate(challengeId: string, body: Partial<ScoreBody>): Validation {
  const match = CHALLENGE_ID.exec(challengeId);
  if (!match) return { ok: false, message: 'Invalid challenge id.' };

  const slugFromId = match[1];
  if (!INSTRUMENT_SLUGS.has(slugFromId)) return { ok: false, message: 'Unknown instrument.' };
  if (body.instrumentSlug !== slugFromId) {
    return { ok: false, message: 'Instrument does not match the challenge.' };
  }

  if (!isCount(body.score, MAX_SCORE)) return { ok: false, message: 'Invalid score.' };
  if (!isCount(body.maxCombo, MAX_NOTES)) return { ok: false, message: 'Invalid maxCombo.' };
  if (!isCount(body.perfectCount, MAX_NOTES)) return { ok: false, message: 'Invalid perfectCount.' };
  if (!isCount(body.goodCount, MAX_NOTES)) return { ok: false, message: 'Invalid goodCount.' };
  if (!isCount(body.missCount, MAX_NOTES)) return { ok: false, message: 'Invalid missCount.' };
  if (!isCount(body.totalNotes, MAX_NOTES)) return { ok: false, message: 'Invalid totalNotes.' };

  if (
    typeof body.accuracy !== 'number' ||
    !Number.isFinite(body.accuracy) ||
    body.accuracy < 0 ||
    body.accuracy > 100
  ) {
    return { ok: false, message: 'Invalid accuracy.' };
  }

  if (typeof body.grade !== 'string' || !GRADES.has(body.grade)) {
    return { ok: false, message: 'Invalid grade.' };
  }

  // The hit counts have to describe the run they claim to summarise.
  const judged = body.perfectCount + body.goodCount + body.missCount;
  if (judged !== body.totalNotes) {
    return { ok: false, message: 'Hit counts do not add up to totalNotes.' };
  }
  if (body.maxCombo > body.totalNotes) {
    return { ok: false, message: 'maxCombo exceeds totalNotes.' };
  }

  return { ok: true, body: body as ScoreBody };
}

// ---------------------------------------------------------------------------
// POST /api/drums/challenges/:challengeId/score – save a finished run
// ---------------------------------------------------------------------------

router.post(
  '/challenges/:challengeId/score',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { challengeId } = req.params;

      const result = validate(challengeId, req.body as Partial<ScoreBody>);
      if (!result.ok) {
        res.status(400).json({ message: result.message });
        return;
      }
      const body = result.body;

      const [inserted] = await pool.execute(
        `INSERT INTO drum_scores
           (user_id, instrument_slug, challenge_id, score, accuracy,
            max_combo, perfect_count, good_count, miss_count,
            total_notes, grade)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user!.userId,
          body.instrumentSlug,
          challengeId,
          body.score,
          body.accuracy,
          body.maxCombo,
          body.perfectCount,
          body.goodCount,
          body.missCount,
          body.totalNotes,
          body.grade,
        ],
      );

      res.status(201).json({ id: (inserted as { insertId: number }).insertId });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/drums/challenges/:challengeId/scores – leaderboard, top 20
// ---------------------------------------------------------------------------

router.get(
  '/challenges/:challengeId/scores',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!CHALLENGE_ID.test(req.params.challengeId)) {
        res.status(400).json({ message: 'Invalid challenge id.' });
        return;
      }

      const [rows] = await pool.execute(
        `SELECT d.id, d.score, d.accuracy, d.max_combo,
                d.perfect_count, d.good_count, d.miss_count,
                d.total_notes, d.grade, d.created_at,
                u.username
         FROM drum_scores d
         LEFT JOIN users u ON u.id = d.user_id
         WHERE d.challenge_id = ?
         ORDER BY d.score DESC, d.created_at ASC
         LIMIT 20`,
        [req.params.challengeId],
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/drums/me/progress – the caller's best on every challenge played
// ---------------------------------------------------------------------------

router.get(
  '/me/progress',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Derived from the score rows rather than kept in a second table, so
      // there is no progress record that can drift out of step with them.
      const [rows] = await pool.execute(
        `SELECT challenge_id,
                MAX(score)  AS best_score,
                COUNT(*)    AS play_count,
                SUBSTRING_INDEX(
                  GROUP_CONCAT(grade ORDER BY score DESC), ',', 1
                ) AS best_grade
         FROM drum_scores
         WHERE user_id = ?
         GROUP BY challenge_id`,
        [req.user!.userId],
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
