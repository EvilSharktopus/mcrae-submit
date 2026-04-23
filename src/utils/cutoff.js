// src/utils/cutoff.js
// ── Daily submission cutoff time (local time) ─────────────────────────────
export const CUTOFF_HOUR = 15; // 3 PM
export const CUTOFF_MIN  = 30; // :30

/** Returns true if the current local time is at or past the daily cutoff. */
export function isPastCutoff() {
  const now = new Date();
  return (
    now.getHours() > CUTOFF_HOUR ||
    (now.getHours() === CUTOFF_HOUR && now.getMinutes() >= CUTOFF_MIN)
  );
}

/**
 * Returns milliseconds until today's cutoff.
 * Negative if already past.
 */
export function msUntilCutoff() {
  const now    = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(CUTOFF_HOUR, CUTOFF_MIN, 0, 0);
  return cutoff.getTime() - now.getTime();
}
