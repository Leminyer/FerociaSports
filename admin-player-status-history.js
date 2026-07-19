/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PLAYER STATUS HISTORY MODAL
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-player-status-history.js -> app.js

   Extracted from app.js's PLAYER STATUS HISTORY MODAL section. Reads
   AdminState.allPlayers (populated elsewhere — Players page, Standings,
   etc.) to resolve the player's name for the modal title.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  const openPlayerHistory = async () => {
    const id = parseInt(document.getElementById('edit-id').value, 10);
    if (!id) return;
    const player = AdminState.allPlayers.find((x) => x.id === id);
    const titleEl = document.getElementById('player-history-title');
    if (titleEl && player) {
      titleEl.textContent = `Status history — ${player.first_name} ${player.last_name}`;
    }
    const contentEl = document.getElementById('player-history-content');
    if (contentEl) {
      contentEl.innerHTML =
        '<div class="loading" style="padding:24px;text-align:center;color:var(--text-muted);">Loading...</div>';
    }
    document.getElementById('player-history-modal').classList.add('open');

    try {
      const rows = await api(
        `player_status_history?player_id=eq.${id}&select=*&order=changed_at.desc`,
      );
      if (!rows || !rows.length) {
        contentEl.innerHTML =
          '<div class="empty" style="padding:24px;text-align:center;color:var(--text-muted);">No history yet.</div>';
        return;
      }
      contentEl.innerHTML = rows
        .map((r) => {
          const when = fmtDate(r.changed_at?.split('T')[0], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
          // Time portion (HH:MM, 24h)
          const time = r.changed_at
            ? new Date(r.changed_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';
          const transition = `${esc(r.old_status || '?')} → ${esc(r.new_status)}`;
          return `<div style="padding:12px 0;border-bottom:0.5px solid var(--border);">
            <div class="row-between gap-6">
              <div class="text-bold" style="font-size:13px;">${esc(when)} ${esc(time)}</div>
              <div class="text-muted-12">${transition}</div>
            </div>
            <div class="text-13 mt-4" style="white-space:pre-wrap;line-height:1.5;">${esc(r.reason || '(no reason recorded)')}</div>
          </div>`;
        })
        .join('');
    } catch (err) {
      contentEl.innerHTML = `<div class="empty" style="padding:24px;text-align:center;color:var(--orange);">Error: ${esc(err.message)}</div>`;
    }
  };

  const closePlayerHistory = () =>
    document.getElementById('player-history-modal').classList.remove('open');

  // ── Register with the shared infrastructure ───────────────────────────
  Object.assign(window.CLICK_HANDLERS, {
    openPlayerHistory: () => openPlayerHistory(),
    closePlayerHistory: () => closePlayerHistory(),
  });
})();
