/* ============================================================
   FEROCIA — TEMPORARY: backfill missing fields from a CSV import
   ============================================================

   ⚠️  THIS FILE IS MEANT TO BE DELETED.

   WHAT IT DOES
     The CSV import skips any row whose person already exists as a player.
     While date of birth is still being collected, that means a spreadsheet
     containing a birthday for someone already in the system does nothing
     with it — the row is marked "Duplicate" and thrown away.

     This module spots that case: existing player, field empty in the
     database, value present in the CSV. The row is still not inserted
     (they are already a player), but the gap gets filled.

     Covers DATE OF BIRTH and COACH RATING, each independently — a row can
     fill in one, the other, or both.

   WHY IT IS TEMPORARY
     Add Player and the CSV now require both fields, so every new player
     has them. This only exists to close the gap for players already in
     the database. Once this returns 0 —

         select count(*) from players
         where date_of_birth is null or coach_rating is null;

     — the file has no reason to exist.

   HOW TO REMOVE IT
     1. Delete this file.
     2. Delete its <script> tag from admin.html.

     Nothing else. Every call site in admin-players.js is wrapped in
     `if (window.TempDobBackfill)`, so the import goes back to plain
     duplicate-skipping the moment the file is gone. That guard is the
     whole point of putting this in its own module rather than threading
     the logic through the importer.

   WHAT IT DELIBERATELY DOES NOT DO
     · It never OVERWRITES. Only fills nulls. A value already on file was
       entered by someone who saw the person; a spreadsheet is not grounds
       to replace that.
     · It does not touch phone, city or state. Those could be backfilled
       the same way, but each is a separate judgement about which source
       wins, and nobody has made it.
   ============================================================ */

(function () {
  'use strict';

  window.TempDobBackfill = {

    /* Columns the importer must fetch on top of what it already needs.
       Without date_of_birth there is nothing to compare, and without id
       there is no row to update. */
    SELECT_EXTRA: 'id,date_of_birth,coach_rating',

    /**
     * Which fields of this existing player can the CSV row fill in?
     *
     * Each field is judged on its own: a row may fill the date of birth,
     * the rating, both, or neither.
     *
     * @param {object} existing  The player row already in the database.
     * @param {object} row       The parsed CSV row.
     * @returns {{playerId:number, fields:object, labels:string[]}|null}
     */
    check(existing, row) {
      if (!existing || !existing.id || !row) return null;

      const fields = {};
      const labels = [];

      // Only fills gaps — never replaces an existing value.
      if (row.dob && !existing.date_of_birth) {
        fields.date_of_birth = row.dob;
        labels.push('DOB');
      }
      // == null catches both null and undefined; 0 is not a valid rating
      // (the range is 1-8) so there is no falsy-zero trap here.
      if (row.rating != null && existing.coach_rating == null) {
        fields.coach_rating = row.rating;
        fields.coach_rating_updated_at = new Date().toISOString();
        labels.push('rating');
      }

      if (!labels.length) return null;
      return { playerId: existing.id, fields, labels };
    },

    /** Badge shown next to "Duplicate" in the import preview. */
    badge(item) {
      const what = item && item.labels ? item.labels.join(' + ') : 'data';
      return `<span class="import-badge" title="This player already exists but is missing this. Importing will add it." `
           + `style="background:rgba(23,76,204,0.08);color:var(--blue);border:0.5px solid rgba(23,76,204,0.3);margin-left:4px;">`
           + `↻ Will add ${what}</span>`;
    },

    /**
     * Applies the updates. One PATCH per player, carrying only the fields
     * that were missing — never a whole row, so nothing else is touched.
     *
     * Never throws: the import that triggered it has already finished, and
     * a failure here must not be reported as an import failure.
     *
     * @param {Array<{playerId:number, fields:object, labels:string[]}>} items
     * @param {function} apiFn  The api() helper.
     * @returns {Promise<{updated:number, failed:number, dob:number, rating:number}>}
     */
    async apply(items, apiFn) {
      let updated = 0, failed = 0, dob = 0, rating = 0;
      for (const it of items) {
        try {
          await apiFn(`players?id=eq.${it.playerId}`, 'PATCH', it.fields);
          updated++;
          if (it.labels.includes('DOB'))    dob++;
          if (it.labels.includes('rating')) rating++;
        } catch (err) {
          failed++;
          console.warn(`[TempBackfill] player ${it.playerId} failed:`, err.message);
        }
      }
      return { updated, failed, dob, rating };
    },
  };
})();
