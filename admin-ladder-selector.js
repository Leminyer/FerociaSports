/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: LADDER SELECTOR
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-ladder-selector.js -> app.js

   Extracted from app.js's LADDER SELECTOR section. This module OWNS the
   writes to AdminState.currentLadder / .allLadders / .ladderPlayers — it's
   the reason those three had to move to shared state before anything
   could be safely extracted: every other section (Standings, Sessions,
   Players, Ladder Management, FTC...) reads whichever ladder is currently
   selected, and this is where that selection happens.

   Exposes on window (called directly by many still-in-app.js functions,
   not through the CLICK_HANDLERS/AdminPageLoaders registries, since these
   were always plain function calls, not data-action buttons):
     window.loadLadderSelector()
     window.onLadderChange()
     window.updateLadderBanner()
     window.loadLadderPlayers()
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  const loadLadderSelector = async () => {
    try {
      AdminState.allLadders = await api('ladders?select=*&status=neq.closed&order=id.desc');
    } catch (e) {
      toast(`Error loading ladders: ${e.message}`, true);
      return;
    }
    const sel = document.getElementById('ladder-selector');
    if (!sel) return;
    if (!AdminState.allLadders.length) {
      sel.innerHTML = '<option value="">-- No ladders yet --</option>';
      AdminState.currentLadder = null;
      return;
    }
    sel.innerHTML =
      '<option value="">-- Select a ladder --</option>' +
      AdminState.allLadders
        .map(
          (l) =>
            `<option value="${l.id}">${esc(l.name)}</option>`,
        )
        .join('');

    // Show blank selection — user must pick a ladder
    sel.value = '';
    AdminState.currentLadder = null;
  };

  const onLadderChange = async () => {
    const id = parseInt(document.getElementById('ladder-selector').value, 10);
    AdminState.currentLadder = AdminState.allLadders.find((l) => l.id === id) || null;
    updateLadderBanner();
    await loadLadderPlayers();
    if (AdminState.currentLadder?.ladder_type === 'ftc') {
      window.showPage('ftc-standings', document.getElementById('sb-ftc-standings'));
    } else {
      window.showPage('ladder', document.getElementById('sb-standings'));
    }
  };

  const updateLadderBanner = () => {
    const ladderPages    = ['ladder', 'sessions', 'entry'];
    const ftcPages       = ['ftc-standings', 'ftc-teams', 'ftc-schedule', 'ftc-playoffs'];
    const allLadderPages = [...ladderPages, ...ftcPages];
    const ladderNavBtns  = document.querySelectorAll('#sb-standings, #sb-sessions, #sb-entry, #sb-ftc-teams, #sb-ftc-schedule, #sb-ftc-playoffs');
    if (!AdminState.currentLadder) {
      ladderNavBtns.forEach((b) => (b.disabled = true));
      allLadderPages.forEach((p) => {
        const el = document.getElementById(`page-${p}`);
        if (el) el.classList.add('page-disabled');
      });
      return;
    }
    ladderNavBtns.forEach((b) => (b.disabled = false));
    allLadderPages.forEach((p) => {
      const el = document.getElementById(`page-${p}`);
      if (el) el.classList.remove('page-disabled');
    });
  };

  const loadLadderPlayers = async () => {
    if (!AdminState.currentLadder) {
      AdminState.ladderPlayers = [];
      return;
    }
    try {
      const rows = await api(
        `ladder_players?select=*,players(*)&ladder_id=eq.${AdminState.currentLadder.id}`,
      );
      AdminState.ladderPlayers = rows
        .filter((r) => r.players)
        .map((r) => ({ ...r.players, ladder_status: r.status || 'active' }));
    } catch (e) {
      toast(`Error loading ladder players: ${e.message}`, true);
      AdminState.ladderPlayers = [];
    }
  };

  // Own the selector's change listener directly (DOM is already parsed by
  // the time this script runs, same pattern used elsewhere).
  document.getElementById('ladder-selector')?.addEventListener('change', onLadderChange);

  // ── Expose for the many direct call sites still in app.js ─────────────
  window.loadLadderSelector = loadLadderSelector;
  window.onLadderChange     = onLadderChange;
  window.updateLadderBanner = updateLadderBanner;
  window.loadLadderPlayers  = loadLadderPlayers;
})();
