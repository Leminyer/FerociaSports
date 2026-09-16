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
      const list = document.getElementById('ir-player-list');
      list.innerHTML = (ctx.playerPool || []).map((p) => `
        <label style="display:flex;align-items:center;gap:9px;padding:6px 12px;cursor:pointer;border-bottom:1px solid #f4f5f8;">
          <input type="checkbox" class="ir-player-cb" value="${p.id}" style="width:15px;height:15px;accent-color:var(--blue);cursor:pointer;">
          <span style="font-family:'Inter',sans-serif;font-size:11.5px;font-weight:600;color:var(--text);">${esc(p.first_name)} ${esc(p.last_name)}</span>
        </label>`).join('')
        || '<div style="padding:12px;font-size:12px;font-weight:600;color:var(--text-muted);text-align:center;">No players on this court.</div>';

      document.getElementById('ir-player-all').checked = false;
      _irUpdatePlayerCount();
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

  /* ─── PLAYER CHECKBOXES ──────────────────────────────────────
     An incident can involve one player, several, or the whole court.
     "All players" is a master toggle over the same list rather than a
     separate option, so what is ticked always shows exactly who will be
     recorded — there is no hidden "all" state to reason about.

     The pool is the players who actually PLAYED on that court. No-shows
     are deliberately excluded: they were not there.
     ──────────────────────────────────────────────────────────── */

  const _irSelectedPlayers = () =>
    Array.from(document.querySelectorAll('.ir-player-cb:checked'))
      .map((cb) => parseInt(cb.value, 10))
      .filter(Number.isFinite);

  const _irUpdatePlayerCount = () => {
    const boxes = Array.from(document.querySelectorAll('.ir-player-cb'));
    const n = boxes.filter((cb) => cb.checked).length;
    const label = document.getElementById('ir-player-count');
    if (label) label.textContent = n ? `${n} selected` : '';
    // Keep the master toggle honest: ticked only when every player is.
    const all = document.getElementById('ir-player-all');
    if (all) all.checked = boxes.length > 0 && n === boxes.length;
  };

  // Delegated, so it survives the list being rebuilt on every open.
  document.addEventListener('change', (e) => {
    if (e.target.id === 'ir-player-all') {
      document.querySelectorAll('.ir-player-cb').forEach((cb) => { cb.checked = e.target.checked; });
      _irUpdatePlayerCount();
    } else if (e.target.classList && e.target.classList.contains('ir-player-cb')) {
      _irUpdatePlayerCount();
    }
  });

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
    // Dropdown mode now means checkboxes — one, several or all. Search
    // mode still resolves to a single player.
    const playerIds = _irCtx.playerSelectMode === 'dropdown'
      ? _irSelectedPlayers()
      : [parseInt(document.getElementById('ir-player-id').value, 10)].filter(Number.isFinite);
    const reason = document.getElementById('ir-reason').value;
    const otherReason = document.getElementById('ir-other-reason').value.trim();
    const description = document.getElementById('ir-description').value.trim();

    if (!court) { toast('Please select a court.', true); return; }
    if (!playerIds.length) { toast('Please select at least one player involved.', true); return; }
    if (!reason) { toast('Please select an incident reason.', true); return; }
    if (reason === 'Other' && !otherReason) { toast('Please specify the reason.', true); return; }
    if (description.length < 20) { toast('Description must be at least 20 characters.', true); return; }
    if (!AdminState.currentAdminId) { toast('Could not identify the current admin — try refreshing the page.', true); return; }

    const saveBtn = document.getElementById('ir-save-btn');
    const origHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = 'Saving...';

    try {
      /* One incident row, then one link row per player.

         The report is created first so its id exists to link against.
         player_id still carries the first player: the column is NOT NULL
         until the last migration step, and keeping it populated means the
         previous version of these functions still works if we have to roll
         back. incident_players is what the RPCs actually read. */
      await api('incident_reports', 'POST', {
        source_type: _irCtx.sourceType,
        ladder_id: _irCtx.sourceType === 'ladder' ? _irCtx.ladderId : null,
        tournament_id: _irCtx.sourceType === 'tournament' ? _irCtx.tournamentId : null,
        session_date: _irCtx.sourceType === 'ladder' ? _irCtx.sessionDate : null,
        session_time: _irCtx.sourceType === 'ladder' ? _irCtx.sessionTime : null,
        court,
        player_id: playerIds[0],
        incident_reason: reason,
        other_reason: reason === 'Other' ? otherReason : null,
        description,
        admin_id: AdminState.currentAdminId,
      });

      /* db.js's POST deliberately does not chain .select(), so the inserted
         row never comes back — the same behaviour that silently broke the
         CSV subscriber sync once. The id is fetched instead.

         Narrowed by court AND admin AND reason, then newest first: an admin
         can only submit this form once at a time, so the most recent row
         matching all three is the one just created. */
      const rows = await api(
        `incident_reports?court=eq.${encodeURIComponent(court)}` +
        `&admin_id=eq.${AdminState.currentAdminId}` +
        `&incident_reason=eq.${encodeURIComponent(reason)}` +
        `&select=id&order=created_at.desc&limit=1`);
      const incidentId = rows?.[0]?.id;

      if (incidentId) {
        // One link row per player involved.
        await api('incident_players', 'POST',
          playerIds.map((pid) => ({ incident_id: incidentId, player_id: pid })));
      } else {
        toast('Incident saved, but the players could not be linked. Check the report.', true);
      }

      // One audit entry per player, so each one keeps it in their history.
      if (window.logAuditAction) {
        const label = playerIds.length > 1
          ? `Incident reported: ${reason} (${playerIds.length} players involved)`
          : `Incident reported: ${reason}`;
        playerIds.forEach((pid) => window.logAuditAction(pid, 'incident_report_created', label));
      }
      const onSaved = _irCtx.onSaved;
      toast('Incident Report created successfully.');
      window.closeIncidentReportModal();
      if (typeof onSaved === 'function') onSaved();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = origHTML;
    }
  });

  // ── Shared list renderer — used by Ladder Sessions, Tournament Detail,
  //    and (read-only, no create) Player Profile's Admin tab. ───────────
  /**
   * Label for the ladder or tournament an incident came from.
   *
   * incident_reports.tournament_id and .ladder_id are ON DELETE SET NULL,
   * so deleting a tournament keeps the incident report but empties the
   * link — deliberately: an incident is a record worth keeping even once
   * the event is gone. The consequence is a row whose source_type still
   * says 'tournament' but that can no longer say WHICH tournament, and
   * the RPCs that join for the name return nothing for it.
   *
   * Without this the list printed an empty name or the literal
   * "undefined", which looks like a bug rather than what it is.
   */
  const incidentSourceLabel = (r) => {
    const name = (r.source_name || '').trim();
    if (name && name.toLowerCase() !== 'undefined' && name !== 'null') return name;
    return r.source_type === 'ladder' ? 'Deleted ladder' : 'Deleted tournament';
  };
  // Exposed so any other module rendering incidents uses the same wording.
  window.incidentSourceLabel = incidentSourceLabel;

  window.renderIncidentReportsList = (incidents, opts) => {
    opts = opts || {};
    if (!incidents.length) return '';
    /* Card with an orange left band rather than plain text under the
       header. The previous layout was easy to scroll past — an incident
       report is exactly the thing that must not be missed. */
    const rows = incidents.map((r) => {
      // player_names comes from the RPC as an array; player_name is the
      // same list joined, kept for callers not yet updated.
      const names = Array.isArray(r.player_names) && r.player_names.length
        ? r.player_names
        : (r.player_name ? String(r.player_name).split(', ') : []);
      const count = r.player_count || names.length;
      // Three names then "+N more": beyond that the line wraps and the
      // reason stops being the first thing read.
      const shown = names.slice(0, 3).map(esc).join(' · ')
        + (count > 3 ? ` <span style="color:var(--text-muted);">+${count - 3} more</span>` : '');

      const reason = r.incident_reason === 'Other' ? r.other_reason : r.incident_reason;

      return `
      <div style="display:flex;gap:0;background:white;border:1px solid rgba(242,96,36,0.18);border-left:3px solid var(--orange);border-radius:0 8px 8px 0;margin-bottom:7px;overflow:hidden;">
        <div style="flex:1;min-width:0;padding:10px 13px;">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:3px;">
            <span style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--orange);">${esc(reason)}</span>
            <span style="font-size:10px;font-weight:600;color:var(--text-muted);white-space:nowrap;">${fmtDate(r.created_at?.slice(0, 10))}</span>
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:3px;">${
            opts.showPlayer !== false
              ? shown
              : `${esc(incidentSourceLabel(r))} <span style="color:var(--text-muted);font-weight:600;">· ${r.source_type === 'ladder' ? 'Ladder' : 'Tournament'}</span>`
          }${count > 1 && opts.showPlayer !== false
              ? ` <span style="font-size:9px;font-weight:800;color:var(--orange);background:var(--orange-light);padding:1px 6px;border-radius:99px;text-transform:uppercase;">${count} players</span>`
              : ''}</div>
          <div style="font-size:11.5px;font-weight:500;color:var(--text-muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(r.description)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
            <span style="font-size:10px;font-weight:600;color:var(--text-light);">${esc(r.court || '')}${r.court ? ' · ' : ''}by ${esc(r.admin_name)}</span>
            <button type="button" data-action="viewIncidentDetail" data-description="${esc(r.description)}" data-admin="${esc(r.admin_name)}" data-players="${esc(names.join(', '))}" data-reason="${esc(reason)}"
              style="margin-left:auto;font-size:10px;font-weight:800;color:var(--blue);background:none;border:none;cursor:pointer;white-space:nowrap;padding:0;">View Details</button>
          </div>
        </div>
      </div>`;
    }).join('');

    return `
      <div style="display:flex;align-items:center;gap:6px;margin:12px 0 7px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--orange);">Incident Report${incidents.length !== 1 ? 's' : ''} (${incidents.length})</span>
      </div>
      ${rows}`;
  };

  Object.assign(window.CLICK_HANDLERS, {
    closeIncidentReportModal: () => window.closeIncidentReportModal(),
    viewIncidentDetail: (btn) => {
      // confirmModal renders with textContent and no white-space:pre-line,
      // so newlines collapse — this stays one flowing block.
      const who = btn.dataset.players ? `Players involved: ${btn.dataset.players}. ` : '';
      window.confirmModal({
        title: btn.dataset.reason || 'Incident Details',
        message: `${who}${btn.dataset.description} — Reported by ${btn.dataset.admin}`,
        okLabel: 'Close',
      });
    },
  });
})();
