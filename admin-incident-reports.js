/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: INCIDENT REPORTS (shared module)
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-incident-reports.js -> app.js
               (must load before admin-sessions.js / tournament.js,
               since both call window.openIncidentReportModal)

   One modal, opened from two different contexts:
     - Ladder Sessions (admin-sessions.js) — court pre-selected,
       player pool = players enrolled in that ladder.
     - Tournaments (tournament.js) — court starts blank, player pool =
       every player across every category/team in that tournament.

   Incident Reports are NEVER created from Player Profile — that page
   only reads them (see get_player_incidents, consumed in
   admin-player-profile.js).
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  // Current modal context — set fresh each time the modal opens.
  let _irCtx = null; // { sourceType, ladderId, tournamentId, sessionDate, sessionTime, defaultCourt, playerPool, onSaved }

  const IR_COURT_COUNT = 30; // "Court 1".."Court 30" covers every court number used anywhere in the app today

  // ── Open / populate ──────────────────────────────────────────────────
  window.openIncidentReportModal = (ctx) => {
    _irCtx = ctx;

    // Context box (read-only, per spec Section 1)
    const ctxEl = document.getElementById('ir-context-box');
    if (ctx.sourceType === 'ladder') {
      const dateLabel = ctx.sessionDate ? fmtDate(ctx.sessionDate) : '—';
      const timeLabel = ctx.sessionTime
        ? new Date(`1970-01-01T${ctx.sessionTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '';
      ctxEl.innerHTML = `<b>${esc(ctx.ladderName || 'Ladder')}</b><br>${dateLabel}${timeLabel ? ` · ${timeLabel}` : ''}`;
    } else {
      ctxEl.innerHTML = `<b>${esc(ctx.tournamentName || 'Tournament')}</b><br>${ctx.tournamentDate ? fmtDate(ctx.tournamentDate) : '—'}`;
    }

    // ── Court — already known when opened from a specific ladder court
    // (no need to ask again); still a real dropdown for tournaments,
    // which have no single "current court" to infer. ───────────────────
    const courtDropdownWrap = document.getElementById('ir-court-dropdown-wrap');
    const courtLockedNote = document.getElementById('ir-court-locked-note');
    if (ctx.lockedCourt) {
      courtDropdownWrap.style.display = 'none';
      courtLockedNote.style.display = 'block';
      courtLockedNote.textContent = `This incident report is for ${ctx.lockedCourt}.`;
      courtLockedNote.dataset.court = ctx.lockedCourt;
    } else {
      courtDropdownWrap.style.display = '';
      courtLockedNote.style.display = 'none';
      const courtSel = document.getElementById('ir-court');
      courtSel.innerHTML = '<option value="">Select court...</option>' +
        Array.from({ length: IR_COURT_COUNT }, (_, i) => `<option>Court ${i + 1}</option>`).join('') +
        '<option>Unknown / Not Assigned</option>';
      courtSel.value = '';
    }

    // ── Player — a real dropdown when the pool is already narrowed to
    // "who's on this court" (ladders); a search box when the pool is
    // large (every player across a whole tournament). ──────────────────
    const playerSearchWrap = document.getElementById('ir-player-search-wrap');
    const playerDropdownWrap = document.getElementById('ir-player-dropdown-wrap');
    if (ctx.playerSelectMode === 'dropdown') {
      playerSearchWrap.style.display = 'none';
      playerDropdownWrap.style.display = '';
      const dd = document.getElementById('ir-player-dropdown');
      dd.innerHTML = '<option value="">Select player...</option>' +
        (ctx.playerPool || []).map((p) => `<option value="${p.id}">${esc(p.first_name)} ${esc(p.last_name)}</option>`).join('');
      dd.value = '';
    } else {
      playerSearchWrap.style.display = '';
      playerDropdownWrap.style.display = 'none';
      document.getElementById('ir-player-search').value = '';
      document.getElementById('ir-player-id').value = '';
      document.getElementById('ir-player-results').style.display = 'none';
    }

    // Reset the rest of the form
    document.getElementById('ir-reason').value = '';
    document.getElementById('ir-other-wrap').style.display = 'none';
    document.getElementById('ir-other-reason').value = '';
    document.getElementById('ir-description').value = '';
    document.getElementById('ir-char-count').textContent = '0 / 2000';

    document.getElementById('incident-report-modal').classList.add('open');
  };

  window.closeIncidentReportModal = () => {
    document.getElementById('incident-report-modal').classList.remove('open');
    _irCtx = null;
  };

  // ── Player search (against whatever pool this context provided) ──────
  document.getElementById('ir-player-search')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const resultsEl = document.getElementById('ir-player-results');
    document.getElementById('ir-player-id').value = ''; // typing invalidates any prior selection
    if (!q || !_irCtx) { resultsEl.style.display = 'none'; return; }
    const matches = (_irCtx.playerPool || [])
      .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
      .slice(0, 8);
    resultsEl.innerHTML = matches.length
      ? matches.map((p) => `<div class="ir-player-row" data-id="${p.id}" data-name="${esc(p.first_name)} ${esc(p.last_name)}" style="padding:9px 12px;font-size:12px;font-weight:700;color:var(--text);cursor:pointer;">${esc(p.first_name)} ${esc(p.last_name)}</div>`).join('')
      : '<div style="padding:9px 12px;font-size:12px;color:var(--text-muted);">No players found</div>';
    resultsEl.style.display = 'block';
    resultsEl.querySelectorAll('.ir-player-row').forEach((row) => {
      row.addEventListener('mouseenter', () => { row.style.background = '#f4f7ff'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'white'; });
      row.addEventListener('click', () => {
        document.getElementById('ir-player-search').value = row.dataset.name;
        document.getElementById('ir-player-id').value = row.dataset.id;
        resultsEl.style.display = 'none';
      });
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#ir-player-search') && !e.target.closest('#ir-player-results')) {
      const el = document.getElementById('ir-player-results');
      if (el) el.style.display = 'none';
    }
  });

  // ── Reason dropdown — show/hide the "Other" field ────────────────────
  document.getElementById('ir-reason')?.addEventListener('change', (e) => {
    document.getElementById('ir-other-wrap').style.display = e.target.value === 'Other' ? 'block' : 'none';
  });

  // ── Description character counter ────────────────────────────────────
  document.getElementById('ir-description')?.addEventListener('input', (e) => {
    document.getElementById('ir-char-count').textContent = `${e.target.value.length} / 2000`;
  });

  // ── Save ──────────────────────────────────────────────────────────────
  document.getElementById('incident-report-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!_irCtx) return;

    const court = _irCtx.lockedCourt || document.getElementById('ir-court').value;
    const playerId = _irCtx.playerSelectMode === 'dropdown'
      ? parseInt(document.getElementById('ir-player-dropdown').value, 10)
      : parseInt(document.getElementById('ir-player-id').value, 10);
    const reason = document.getElementById('ir-reason').value;
    const otherReason = document.getElementById('ir-other-reason').value.trim();
    const description = document.getElementById('ir-description').value.trim();

    if (!court) { toast('Please select a court.', true); return; }
    if (!playerId) { toast('Please select the player involved.', true); return; }
    if (!reason) { toast('Please select an incident reason.', true); return; }
    if (reason === 'Other' && !otherReason) { toast('Please specify the reason.', true); return; }
    if (description.length < 20) { toast('Description must be at least 20 characters.', true); return; }
    if (!AdminState.currentAdminId) { toast('Could not identify the current admin — try refreshing the page.', true); return; }

    const saveBtn = document.getElementById('ir-save-btn');
    const origHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving...';

    try {
      await api('incident_reports', 'POST', {
        source_type: _irCtx.sourceType,
        ladder_id: _irCtx.sourceType === 'ladder' ? _irCtx.ladderId : null,
        tournament_id: _irCtx.sourceType === 'tournament' ? _irCtx.tournamentId : null,
        session_date: _irCtx.sourceType === 'ladder' ? _irCtx.sessionDate : null,
        session_time: _irCtx.sourceType === 'ladder' ? _irCtx.sessionTime : null,
        court,
        player_id: playerId,
        incident_reason: reason,
        other_reason: reason === 'Other' ? otherReason : null,
        description,
        admin_id: AdminState.currentAdminId,
      });
      if (window.logAuditAction) {
        window.logAuditAction(playerId, 'incident_report_created', `Incident reported: ${reason}`);
      }
      toast('Incident Report created successfully.');
      window.closeIncidentReportModal();
      if (typeof _irCtx.onSaved === 'function') _irCtx.onSaved();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = origHTML;
    }
  });

  // ── Shared list renderer — used by Ladder Sessions, Tournament Detail,
  //    and (read-only, no create) Player Profile's Admin tab. ───────────
  window.renderIncidentReportsList = (incidents, opts) => {
    opts = opts || {};
    if (!incidents.length) return '';
    const rows = incidents.map((r) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:0.5px solid #f4f5f8;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:700;color:var(--text);">${esc(opts.showPlayer !== false ? r.player_name : r.source_name)}${opts.showPlayer !== false ? '' : ` <span style="color:var(--text-muted);font-weight:600;">· ${r.source_type === 'ladder' ? 'Ladder' : 'Tournament'}</span>`}</div>
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);">${esc(r.court)} · ${esc(r.incident_reason === 'Other' ? r.other_reason : r.incident_reason)} · ${fmtDate(r.created_at?.slice(0, 10))}</div>
        </div>
        <button type="button" data-action="viewIncidentDetail" data-description="${esc(r.description)}" data-admin="${esc(r.admin_name)}"
          style="font-size:10px;font-weight:700;color:var(--blue);background:none;border:none;cursor:pointer;white-space:nowrap;">View Details</button>
      </div>`).join('');
    return `
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin:12px 0 6px;">Incident Reports (${incidents.length})</div>
      ${rows}`;
  };

  Object.assign(window.CLICK_HANDLERS, {
    closeIncidentReportModal: () => window.closeIncidentReportModal(),
    viewIncidentDetail: (btn) => {
      window.confirmModal({
        title: 'Incident Details',
        message: `${btn.dataset.description}\n\n— Reported by ${btn.dataset.admin}`,
        okLabel: 'Close',
      });
    },
  });
})();
