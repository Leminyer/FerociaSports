/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PLAYERS
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-players.js -> app.js

   Extracted from app.js's PLAYERS section — the largest single section
   in the app. Bundles several player-related features that were already
   grouped under one marker in the original file:
     - Player list/table (search, sort, filter)
     - Add Player form
     - Player Profile modal (performance stats, tournament history)
     - Match Hub (friendly match log — view/delete)
     - Log Match modal (record a friendly match)
     - CSV bulk player import
     - Edit Player modal

   Most of its internal functions were already window-scoped in the
   original code (mh*, lm*, import*, ppmTab, apUpdatePreview, etc.) —
   called from inline HTML this same file generates — kept as-is.
   Reads/writes AdminState.allPlayers.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  /* Age in whole years on today's date. Same arithmetic the player profile
     uses, kept identical so both agree.

     Grouped at the top with the other display formatters because the
     players table, the CSV preview and the profile all read through them.
     Position is not a correctness requirement — every call happens inside
     a function body, long after the module has finished loading — it just
     keeps the three formatters together instead of scattered. */
  const dobAge = (iso) => {
    if (!iso) return null;
    const b = new Date(iso + 'T00:00:00');
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() ||
       (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
    return age;
  };

  /* These two live up here for the same reason as dobAge: the players table
     and the CSV preview both render values through them, and that code runs
     above the sections where the rest of the date and rating helpers sit. */

  // YYYY-MM-DD (storage) → MM/DD/YYYY (display). Built by hand rather than
  // through Date, which would shift the day in western timezones.
  const dobDisplay = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso);
  };

  /** Always three decimals: 3.5 → "3.500". */
  const ratingDisplay = (v) =>
    (v === null || v === undefined || v === '') ? '' : Number(v).toFixed(3);

  /* ─── PLAYERS ──────────────────────────────────────────── */

  // ── Players page state ────────────────────────────────────────────────
  let _playersData      = [];   // full enriched player list
  let _playersFiltered  = [];   // after filter applied
  let _playersSorted    = { col: 'name', dir: 'asc' };
  let _playersShown     = 25;   // load-more page size

  const _renderPlayersTable = () => {
    const slice   = _playersFiltered.slice(0, _playersShown);
    const total   = _playersFiltered.length;
    const showing = slice.length;

    const editSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const sortArrow = (col) => {
      if (_playersSorted.col !== col) return '<span style="color:#d0d5e8;margin-left:6px;font-size:14px;font-weight:700;line-height:1;">↕</span>';
      return _playersSorted.dir === 'asc'
        ? '<span style="color:var(--blue);margin-left:6px;font-size:14px;font-weight:700;line-height:1;">↑</span>'
        : '<span style="color:var(--blue);margin-left:6px;font-size:14px;font-weight:700;line-height:1;">↓</span>';
    };

    const rows = slice.map(d => {
      const p       = d.player;
      const stats   = d.stats;
      const wr      = stats.played > 0 ? Math.round(stats.wins / stats.played * 100) : null;
      const wrColor = wr === null ? 'var(--text-muted)' : wr >= 70 ? 'var(--teal)' : wr >= 50 ? 'var(--blue)' : 'var(--orange)';
      const ind     = d.ind;
      const indHTML = ind
        ? `<div class="player-ind ${ind.cls}">${ind.icon} ${ind.label}<div class="player-ind-tip">${ind.tip}</div></div>`
        : '<span style="color:#d0d5e8;font-size:11px;">—</span>';
      const expandId = `pex-${p.id}`;

      return `<tr class="player-row" data-pid="${p.id}" data-expand="${expandId}">
          <td class="players-td">
            <div class="player-cell">
              <div class="player-av" style="background:${d.avColor};">${esc(d.initials)}</div>
              <div>
                <div style="font-size:13px;font-weight:700;color:var(--text);">${esc(p.first_name)} ${esc(p.last_name)}</div>
                <div style="font-size:11px;color:var(--text-muted);font-weight:600;">${esc(p.gender || '')}${p.date_joined ? ' · Joined ' + fmtDate(p.date_joined) : ''}</div>
              </div>
            </div>
          </td>
          <td class="players-td" style="text-align:center;">
            ${p.coach_rating !== null && p.coach_rating !== undefined
              ? `<span style="font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:var(--blue);line-height:1;display:block;">${Number(p.coach_rating).toFixed(3)}</span>`
              : `<span style="font-size:12px;font-weight:600;color:var(--text-muted);">—</span>`}
          </td>
          <td class="players-td" style="text-align:center;">
            ${(() => {
              const a = dobAge(p.date_of_birth);
              return a !== null
                ? `<span style="font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:var(--text);line-height:1;display:block;">${a}</span>
                   <span style="font-size:10px;font-weight:600;color:var(--text-muted);display:block;">years</span>`
                : `<span style="font-size:12px;font-weight:600;color:var(--text-muted);">—</span>`;
            })()}
          </td>
          <td class="players-td" style="text-align:center;">
            <span style="font-family:'Inter',sans-serif;font-size:20px;color:var(--text);line-height:1;display:block;">${stats.played}</span>
            <span style="font-size:10px;font-weight:600;color:var(--text-muted);display:block;">games</span>
          </td>
          <td class="players-td" style="text-align:center;">
            <span style="font-family:'Inter',sans-serif;font-size:20px;color:${wrColor};line-height:1;display:block;">${wr !== null ? wr + '%' : '—'}</span>
            <span style="font-size:10px;font-weight:600;color:var(--text-muted);display:block;">${stats.wins}W · ${stats.played - stats.wins}L</span>
          </td>
          <td class="players-td" style="text-align:center;">${indHTML}</td>
          <td class="players-td" style="text-align:center;">
            <span style="font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:var(--bg);color:var(--text-muted);">Free</span>
          </td>
          <td class="players-td" style="text-align:center;">${d.statusHTML}</td>
          <td class="players-td" style="text-align:center;">
            <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
              <button class="ppm-profile-btn" data-action="showPage" data-page="player-profile" data-pid="${p.id}" title="View profile">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
              <button class="sess-edit-btn" data-action="openEdit" data-pid="${p.id}" title="Edit player">${editSVG}</button>
            </div>
          </td>
        </tr>
        <tr id="${expandId}" class="player-expand-row" style="display:none;">
          <td colspan="9">
            <div class="player-expand-panel">
              <div class="player-expand-field">
                <div class="player-expand-label">Email</div>
                ${p.email ? `<div class="player-expand-value">${esc(p.email)}</div>` : `<div class="player-expand-empty">Not registered</div>`}
              </div>
              <div class="player-expand-div"></div>
              <div class="player-expand-field">
                <div class="player-expand-label">Phone</div>
                ${p.phone ? `<div class="player-expand-value">${esc(FerociaPhone.format(p.country_code, p.phone))}</div>` : `<div class="player-expand-empty">Not registered</div>`}
              </div>
              <div class="player-expand-div"></div>
              <div class="player-expand-field">
                <div class="player-expand-label">Date of Birth</div>
                ${p.date_of_birth
                  ? `<div class="player-expand-value">${esc(dobDisplay(p.date_of_birth))}${
                       dobAge(p.date_of_birth) !== null ? ` (${dobAge(p.date_of_birth)})` : ''}</div>`
                  : `<div class="player-expand-empty">Not registered</div>`}
              </div>
              <div class="player-expand-div"></div>
              <div class="player-expand-field">
                <div class="player-expand-label">Date Joined</div>
                <div class="player-expand-value">${fmtDate(p.date_joined) || '—'}</div>
              </div>
              <div class="player-expand-div"></div>
              <div class="player-expand-field">
                <div class="player-expand-label">Games Played</div>
                <div class="player-expand-value" style="color:var(--blue);">${stats.played}</div>
              </div>
              ${latestInactivationReasons[p.id] ? `
              <div class="player-expand-div"></div>
              <div class="player-expand-field">
                <div class="player-expand-label">Inactivation Reason</div>
                <div class="player-expand-value" style="color:var(--orange);font-style:italic;">${esc(latestInactivationReasons[p.id].reason || '—')}</div>
              </div>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

    const loadMoreBtn = showing < total
      ? `<div style="padding:16px 20px;border-top:0.5px solid #e0e7f5;display:flex;align-items:center;justify-content:space-between;">
           <span style="font-size:11px;font-weight:600;color:var(--text-muted);">Showing ${showing} of ${total} players</span>
           <button id="players-load-more" style="font-size:10px;font-weight:700;padding:7px 18px;border-radius:99px;border:0.5px solid #c5d6f5;background:white;color:var(--blue);cursor:pointer;">
             Load ${Math.min(25, total - showing)} more
           </button>
         </div>`
      : `<div style="padding:12px 20px;border-top:0.5px solid #e0e7f5;">
           <span style="font-size:11px;font-weight:600;color:var(--text-muted);">Showing all ${total} players</span>
         </div>`;

    document.getElementById('players-table').innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th class="players-th sortable-th" data-sort="name" style="cursor:pointer;">Player ${sortArrow('name')}</th>
            <th class="players-th sortable-th" data-sort="rating" style="text-align:center;cursor:pointer;">Rating ${sortArrow('rating')}</th>
            <th class="players-th sortable-th" data-sort="age" style="text-align:center;cursor:pointer;">Age ${sortArrow('age')}</th>
            <th class="players-th sortable-th" data-sort="played" style="text-align:center;cursor:pointer;">Games Played ${sortArrow('played')}</th>
            <th class="players-th sortable-th" data-sort="wr" style="text-align:center;cursor:pointer;">Win Rate ${sortArrow('wr')}</th>
            <th class="players-th sortable-th" data-sort="ind" style="text-align:center;cursor:pointer;">Player Tags ${sortArrow('ind')}</th>
            <th class="players-th" style="text-align:center;">Membership</th>
            <th class="players-th sortable-th" data-sort="status" style="text-align:center;cursor:pointer;">Status ${sortArrow('status')}</th>
            <th class="players-th" style="text-align:center;width:44px;"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${loadMoreBtn}`;

    // Sort headers
    document.querySelectorAll('.sortable-th').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (_playersSorted.col === col) {
          _playersSorted.dir = _playersSorted.dir === 'asc' ? 'desc' : 'asc';
        } else {
          _playersSorted.col = col;
          _playersSorted.dir = 'asc';
        }
        _applySortAndRender();
      });
    });

    // Row click to expand (not edit button)
    document.querySelectorAll('#players-table tbody tr.player-row').forEach(row => {
      row.addEventListener('click', () => {
        const expandId = row.dataset.expand;
        const exRow = document.getElementById(expandId);
        if (exRow) exRow.style.display = exRow.style.display === 'none' ? 'table-row' : 'none';
      });
    });

    // Load more
    const lmBtn = document.getElementById('players-load-more');
    if (lmBtn) {
      lmBtn.addEventListener('click', () => {
        _playersShown += 25;
        _renderPlayersTable();
      });
    }
  };

  const _applySortAndRender = () => {
    const { col, dir } = _playersSorted;
    const mult = dir === 'asc' ? 1 : -1;
    _playersFiltered = [..._playersFiltered].sort((a, b) => {
      switch (col) {
        case 'name':   return mult * (`${a.player.first_name} ${a.player.last_name}`).localeCompare(`${b.player.first_name} ${b.player.last_name}`);
        case 'played': return mult * ((a.stats.played || 0) - (b.stats.played || 0));
        // Players with no rating or no date of birth sort to the BOTTOM in
        // both directions. Treating a missing value as 0 would rank an
        // unrated player as the weakest, which is not what a null means.
        case 'rating': {
          const ra = a.player.coach_rating != null ? Number(a.player.coach_rating) : null;
          const rb = b.player.coach_rating != null ? Number(b.player.coach_rating) : null;
          if (ra === null && rb === null) return 0;
          if (ra === null) return 1;
          if (rb === null) return -1;
          return mult * (ra - rb);
        }
        case 'age': {
          const aa = dobAge(a.player.date_of_birth);
          const ab = dobAge(b.player.date_of_birth);
          if (aa === null && ab === null) return 0;
          if (aa === null) return 1;
          if (ab === null) return -1;
          return mult * (aa - ab);
        }
        case 'wr': {
          const wa = a.stats.played > 0 ? a.stats.wins / a.stats.played : -1;
          const wb = b.stats.played > 0 ? b.stats.wins / b.stats.played : -1;
          return mult * (wa - wb);
        }
        case 'ind':    return mult * ((a.ind?.label || '').localeCompare(b.ind?.label || ''));
        case 'status': return mult * (a.statusText.localeCompare(b.statusText));
        default:       return 0;
      }
    });
    _renderPlayersTable();
  };

  const filterPlayers = () => {
    const q           = document.getElementById('player-search').value.toLowerCase().trim();
    const statusFilter = document.getElementById('player-status-filter')?.value || 'all';
    _playersShown = 25; // reset to first page on filter change
    _playersFiltered = _playersData.filter(d => {
      const p = d.player;
      // Include the bare digits so a search for "5613026946" matches a row
      // displayed as "+1 (561) 302-6946", and vice versa.
      const nameMatch = (`${p.first_name} ${p.last_name} ${p.email || ''} ${p.phone || ''} ${FerociaPhone.searchable(p.country_code, p.phone)}`).toLowerCase().includes(q);
      let statusMatch = true;
      switch (statusFilter) {
        case 'active':     statusMatch = p.status === 'active'; break;
        case 'inactive':   statusMatch = p.status === 'inactive'; break;
        case 'ladder':     statusMatch = d.statusText === 'In Ladder'; break;
        case 'tournament': statusMatch = d.statusText === 'Tournament'; break;
        case 'new':        statusMatch = d.ind?.label === 'New Player' || d.ind?.label === 'Rising Star'; break;
        case 'hot':        statusMatch = d.ind?.label === 'Hot Player'; break;
        default:           statusMatch = true;
      }
      return nameMatch && statusMatch;
    });
    _applySortAndRender();
  };

  const loadPlayers = async () => {
    try {
      const [players, history, matches, _plLadderPlayers, activeLadders, tournamentTeams] = await Promise.all([
        api('players?select=*&order=first_name'),
        api('player_status_history?new_status=eq.inactive&select=player_id,reason,changed_at&order=changed_at.desc'),
        api('matches?select=player_id,score_for,score_against,points_earned,session_date,default_no_show&order=session_date.desc').catch(() => []),
        api('ladder_players?select=player_id,ladder_id').catch(() => []),
        api('ladders?status=eq.active&select=id').catch(() => []),
        api('tournament_teams?select=player1_id,player2_id,player3_id,player4_id').catch(() => []),
      ]);
      AdminState.allPlayers = players;

      // Build inactivation reason map
      latestInactivationReasons = {};
      historyCountByPlayer = {};
      (history || []).forEach((h) => {
        if (!latestInactivationReasons[h.player_id]) {
          latestInactivationReasons[h.player_id] = { reason: h.reason, changed_at: h.changed_at };
        }
        historyCountByPlayer[h.player_id] = (historyCountByPlayer[h.player_id] || 0) + 1;
      });

      // Build per-player match stats
      const matchStats = {};
      (matches || []).forEach(m => {
        if (m.default_no_show) return;
        if (!matchStats[m.player_id]) matchStats[m.player_id] = { played: 0, wins: 0 };
        if (m.score_for !== null && m.score_against !== null) {
          matchStats[m.player_id].played++;
          if (m.score_for > m.score_against) matchStats[m.player_id].wins++;
        }
      });

      // Active ladder IDs set for cross-reference
      const activeLadderIds = new Set((activeLadders || []).map(l => l.id));
      const inLadder = new Set(
        (_plLadderPlayers || [])
          .filter(lp => activeLadderIds.has(lp.ladder_id))
          .map(lp => lp.player_id)
      );

      // Tournament: player1_id..player4_id columns
      const inTournament = new Set();
      (tournamentTeams || []).forEach(tt => {
        [tt.player1_id, tt.player2_id, tt.player3_id, tt.player4_id].forEach(id => {
          if (id) inTournament.add(id);
        });
      });

      // Stat cards
      const total   = players.length;
      const active  = players.filter(p => p.status === 'active').length;
      const inLadderCount     = players.filter(p => inLadder.has(p.id)).length;
      const inTournamentCount = players.filter(p => inTournament.has(p.id)).length;
      const now = new Date();
      const newThisMonth = players.filter(p => {
        if (!p.date_joined) return false;
        const d = new Date(p.date_joined + 'T00:00:00');
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
      const setEl   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('players-total',    total);
      setEl('players-active',   active);
      setEl('players-inactive', inLadderCount);
      setEl('players-male',     inTournamentCount);
      setEl('players-female',   newThisMonth);
      setEl('players-ladder-pct',     total ? `${Math.round(inLadderCount/total*100)}% of roster` : '');
      setEl('players-male-pct',       total ? `${Math.round(inTournamentCount/total*100)}% of roster` : '');
      setEl('players-female-pct',     now.toLocaleDateString('en-US', { month: 'long' }));
      setEl('players-count',    `${total} player${total !== 1 ? 's' : ''}`);

      if (!players.length) {
        document.getElementById('players-table').innerHTML = '<div class="empty" style="padding:20px;">No players yet.</div>';
        return;
      }

      // Avatar colors
      const avColors = ['var(--blue)','var(--teal)','var(--orange)','#7c3aed','#0891b2','#d97706','#16a34a','#dc2626','#7c3aed','#0e7490'];
      const getAvColor = (id) => avColors[id % avColors.length];

      // SVG icons for indicators
      const svg_fire  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
      const svg_crown = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
      const svg_bolt  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
      const svg_star  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
      const svg_new   = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
      const svg_clock = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
      const svg_slip  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;

      // Pre-compute rank list for Top 10 / Rising Star
      const ranked = AdminState.allPlayers
        .filter(x => (matchStats[x.id]?.played || 0) >= 5)
        .sort((a, b) => {
          const wa = matchStats[a.id] ? matchStats[a.id].wins / matchStats[a.id].played : 0;
          const wb = matchStats[b.id] ? matchStats[b.id].wins / matchStats[b.id].played : 0;
          return wb - wa;
        });

      const computeIndicator = (p, s) => {
        const wr = s.played > 0 ? s.wins / s.played : 0;
        const joined = p.date_joined ? new Date(p.date_joined) : null;
        const daysSince = joined ? Math.floor((Date.now() - joined) / 86400000) : 999;
        const rankIdx = ranked.findIndex(x => x.id === p.id);
        const isTop10    = rankIdx >= 0 && rankIdx < 10;
        const isTop25pct = rankIdx >= 0 && rankIdx < Math.ceil(ranked.length * 0.25);
        if (s.played >= 3 && wr >= 0.75) return { cls:'ind-fire',  icon:svg_fire,  label:'Hot Player',  tip:'Win rate above 75%' };
        if (isTop10 && s.played >= 5)    return { cls:'ind-crown', icon:svg_crown, label:'Top 10',      tip:'Ranked in the top 10 players' };
        if (s.played >= 30)              return { cls:'ind-bolt',  icon:svg_bolt,  label:'Most Active', tip:'30+ games played this season' };
        if (daysSince <= 60 && isTop25pct) return { cls:'ind-star', icon:svg_star, label:'Rising Star', tip:'New player in top 25% by win rate' };
        if (daysSince <= 60)             return { cls:'ind-new',   icon:svg_new,   label:'New Player',  tip:'Joined within the last 60 days' };
        if (s.played >= 10 && wr >= 0.55 && wr < 0.75) return { cls:'ind-clock', icon:svg_clock, label:'Consistent', tip:'Stable performance over multiple sessions' };
        if (s.played >= 5 && wr < 0.35) return { cls:'ind-slip',  icon:svg_slip,  label:'Slipping',    tip:'Win rate below 35%' };
        return null;
      };

      const getStatusText = (p) => {
        if (inLadder.has(p.id))     return 'In Ladder';
        if (inTournament.has(p.id)) return 'Tournament';
        if (p.status === 'active')  return 'Active';
        return 'Inactive';
      };
      const getStatusHTML = (text) => {
        switch (text) {
          case 'In Ladder':   return '<span class="pill pill-ladder">In Ladder</span>';
          case 'Tournament':  return '<span class="pill pill-tourney">Tournament</span>';
          case 'Active':      return '<span class="pill pill-active">Active</span>';
          default:            return '<span class="pill pill-inactive">Inactive</span>';
        }
      };

      // Build enriched data array
      _playersData = players.map((p, idx) => {
        const stats = matchStats[p.id] || { played: 0, wins: 0 };
        const ind = computeIndicator(p, stats);
        const statusText = getStatusText(p);
        return {
          player:     p,
          stats,
          ind,
          statusText,
          statusHTML: getStatusHTML(statusText),
          initials:   `${p.first_name?.[0]||''}${p.last_name?.[0]||''}`.toUpperCase(),
          avColor:    getAvColor(p.id || idx),
        };
      });

      _playersFiltered = [..._playersData];
      _playersShown    = 25;
      _renderPlayersTable();

    } catch (e) {
      document.getElementById('players-table').innerHTML =
        `<div class="empty" style="padding:20px;">Error: ${esc(e.message)}</div>`;
    }
  };


  // ── Add Player: avatar color helper ──────────────────────────────────
  const _apColors = ['var(--blue)','var(--teal)','var(--orange)','#7c3aed','#0891b2','#d97706'];
  const _apColor  = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return _apColors[Math.abs(h) % _apColors.length];
  };
  const _apFmt = (d) => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  // ── Live preview update ──────────────────────────────────────────────
  window.apUpdatePreview = () => {
    const fn     = (document.getElementById('p-first')?.value || '').trim();
    const ln     = (document.getElementById('p-last')?.value || '').trim();
    const gender = document.getElementById('p-gender')?.value || '';
    const skill  = document.getElementById('p-skill')?.value || '';
    const email  = (document.getElementById('p-email')?.value || '').trim();
    // Preview only — show the number the way the admin sees it, dial code
    // included, even though the two parts are stored separately.
    const ph     = FerociaPhone.getValue('p-phone-field');
    const phone  = ph.phone ? `${ph.country_code} ${ph.phone}` : '';
    // Shown as MM/DD/YYYY with the age, matching how the player profile
    // presents it — so what the admin previews is what they will see later.
    const dobVal = document.getElementById('p-dob')?.value || '';
    const dobTxt = dobVal
      ? `${dobDisplay(dobVal)}${dobAge(dobVal) !== null ? ` (${dobAge(dobVal)})` : ''}`
      : '';
    const locTxt = FerociaLocation.formatLocation(
      FerociaLocation.normalizeCity(document.getElementById('p-city')?.value),
      document.getElementById('p-state')?.value);
    const ratingVal = document.getElementById('p-coach-rating')?.value || '';
    const ratingTxt = ratingVal ? ratingDisplay(ratingVal) : '';
    const status = document.getElementById('p-status')?.value || 'active';
    const joined = document.getElementById('p-joined')?.value || '';
    const fullName = [fn, ln].filter(Boolean).join(' ');
    const initials = [(fn[0]||''), (ln[0]||'')].join('').toUpperCase() || '?';
    const avColor  = fullName ? _apColor(fullName) : '#d0d5e8';
    const body = document.getElementById('ap-preview-body');
    if (!body) return;
    if (!fn && !ln) {
      body.innerHTML = `<div style="text-align:center;padding:20px 0;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--bg);border:2px dashed #d0d5e8;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d0d5e8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <div style="font-size:12px;font-weight:600;color:#d0d5e8;">Fill in the form to see<br>the player preview</div>
      </div>`;
      return;
    }
    const statusPill = status === 'active'
      ? `<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:#d4f5ed;color:#085041;">Active Player</span>`
      : `<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:#f4f5f8;color:var(--text-muted);">Inactive</span>`;
    const skillPill = skill
      ? `<span style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:#e8f0ff;color:var(--blue);">${esc(skill)}</span>`
      : '';
    const row = (iconSVG, label, val, emptyText) => `
      <div class="ap-preview-row">
        <div class="ap-preview-icon">${iconSVG}</div>
        <div class="ap-preview-lbl">${label}</div>
        ${val ? `<div class="ap-preview-val">${val}</div>` : `<div class="ap-preview-empty">${emptyText}</div>`}
      </div>`;
    const calI   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const starI  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    const pinI   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
    const mailI  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
    const phoneI = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 1.21l3 .01a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>`;
    const genI   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
    const gameI  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
    body.innerHTML = `
      <div class="ap-preview-avatar" style="background:${avColor};">${esc(initials)}</div>
      <div class="ap-preview-name">${esc(fullName)}</div>
      <div class="ap-preview-pills">${statusPill}${skillPill}</div>
      <div class="ap-preview-divider"></div>
      ${row(genI,   'Gender',  gender ? esc(gender) : '', 'Not set')}
      ${row(mailI,  'Email',   email  ? esc(email)  : '', 'Not provided')}
      ${row(phoneI, 'Phone',   phone  ? esc(phone)  : '', 'Not provided')}
      ${row(calI,   'Born',    dobTxt ? esc(dobTxt) : '', 'Not set')}
      ${row(starI,  'Rating',  ratingTxt ? esc(ratingTxt) : '', 'Not set')}
      ${row(pinI,   'Location', locTxt ? esc(locTxt) : '', 'Not set')}
      ${row(calI,   'Joined',  joined ? _apFmt(joined) : '', 'Not set')}
      ${row(gameI,  'Games',   '0', '')}
      <div class="ap-preview-divider"></div>
      <div style="text-align:center;font-size:10px;font-weight:600;color:#d0d5e8;">Profile not yet saved</div>`;
  };

  // ── Duplicate check (fires as user types) ────────────────────────────
  let _apDupTimer = null;
  window.apCheckDuplicate = () => {
    clearTimeout(_apDupTimer);
    _apDupTimer = setTimeout(async () => {
      const fn = (document.getElementById('p-first')?.value || '').trim();
      const ln = (document.getElementById('p-last')?.value || '').trim();
      const warn    = document.getElementById('p-dup-warn');
      const dupName = document.getElementById('p-dup-name');
      if (!warn) return;
      if (fn.length < 2 || ln.length < 2) { warn.style.display = 'none'; return; }
      try {
        const dupes = await api(
          `players?first_name=ilike.${encodeURIComponent(fn)}&last_name=ilike.${encodeURIComponent(ln)}&select=id,first_name,last_name&limit=1`
        );
        if (dupes.length) {
          warn.style.display = 'flex';
          if (dupName) dupName.textContent = `${esc(dupes[0].first_name)} ${esc(dupes[0].last_name)}`;
        } else {
          warn.style.display = 'none';
        }
      } catch(_) { warn.style.display = 'none'; }
    }, 600);
  };

  /* ─── DATE OF BIRTH ──────────────────────────────────────────
     players.date_of_birth is a real `date` column, so what gets stored
     is a day, not a string. YYYY-MM-DD is simply how PostgreSQL and
     <input type="date"> exchange that value — the admin never sees it.
     Everything shown on screen goes through dobDisplay() and comes out
     as MM/DD/YYYY.

     The column also matters beyond the admin: find_player_match() uses
     the date of birth to confirm a player's identity in the mobile
     app's account-claim flow. A wrong date there means a real person
     fails verification, which is why the checks below are strict about
     impossible values and merely cautious about unusual ones.
     ──────────────────────────────────────────────────────────── */

  const DOB_MIN_AGE      = 5;    // below this → rejected
  const DOB_MAX_AGE      = 100;  // above this → rejected
  const DOB_WARN_MIN_AGE = 10;   // below this → confirm
  const DOB_WARN_MAX_AGE = 90;   // above this → confirm

  // The oldest and youngest dates the field will accept, as YYYY-MM-DD.
  // Used for the <input type="date"> min/max so the browser greys out
  // the impossible range before any validation runs.
  const dobBound = (yearsAgo) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsAgo);
    return d.toISOString().split('T')[0];
  };

  /**
   * Accepts MM/DD/YYYY (the CSV template's format) and YYYY-MM-DD
   * (what Excel sometimes writes when it reformats a date column).
   * The two are told apart by shape, so there is no ambiguity.
   *
   * A European 25/12/1980 fails on its own: month 25 does not exist.
   * That is the right outcome — rejecting it is safer than guessing.
   *
   * @returns {string|null} YYYY-MM-DD, or null when unparseable.
   */
  const dobParse = (raw) => {
    const v = String(raw ?? '').trim();
    if (!v) return null;

    let y, mo, d;
    let m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);   // MM/DD/YYYY
    if (m) { mo = +m[1]; d = +m[2]; y = +m[3]; }
    else {
      m = v.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);      // YYYY-MM-DD
      if (!m) return null;
      y = +m[1]; mo = +m[2]; d = +m[3];
    }

    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;

    // Round-trip through Date to reject days that do not exist in that
    // month — 02/30/1985 parses as numbers but is not a real day.
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;

    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  };

  /**
   * @param {string?} iso  YYYY-MM-DD, or empty.
   * @param {object?} opts { required: true }
   * @returns {{ok:boolean, error?:string, warn?:string}}
   *   `error` blocks the save. `warn` asks the admin to confirm — an
   *   8-year-old is unusual but possible, while a mistyped year is not.
   */
  const dobCheck = (iso, opts) => {
    const required = !!(opts && opts.required);
    if (!iso) {
      return required
        ? { ok: false, error: 'Date of birth is required.' }
        : { ok: true };
    }
    const age = dobAge(iso);
    if (age === null) return { ok: false, error: 'That date of birth is not valid.' };
    if (age < 0)      return { ok: false, error: 'Date of birth cannot be in the future.' };
    if (age < DOB_MIN_AGE)
      return { ok: false, error: `That date gives an age of ${age}. Please check the year.` };
    if (age > DOB_MAX_AGE)
      return { ok: false, error: `That date gives an age of ${age}. Please check the year.` };
    if (age < DOB_WARN_MIN_AGE || age > DOB_WARN_MAX_AGE)
      return { ok: true, warn: `That date of birth makes this player ${age} years old.` };
    return { ok: true };
  };

  /* ─── COACH RATING ───────────────────────────────────────────
     A coach's estimate of a player's level, distinct from skill_level
     (which the player declares about themselves).

     Stored as numeric(4,3) with a database CHECK of 1 to 8 inclusive.
     Nullable on purpose — all 279 existing players have none, so the
     rule lives in the app: required when creating a player and in the
     CSV, optional when editing. Blocking every edit until someone
     tracks down a rating would push admins to invent numbers, and an
     invented rating is worse than a missing one because it looks real.
     ──────────────────────────────────────────────────────────── */

  const RATING_MIN = 1;
  const RATING_MAX = 8;

  /**
   * @param {string|number|null} raw
   * @param {object?} opts { required: true }
   * @returns {{ok:boolean, value:number|null, error?:string}}
   */
  const ratingCheck = (raw, opts) => {
    const required = !!(opts && opts.required);
    const v = String(raw ?? '').trim();
    if (!v) {
      return required
        ? { ok: false, value: null, error: 'Coach rating is required.' }
        : { ok: true, value: null };
    }
    const n = Number(v);
    if (!Number.isFinite(n)) {
      return { ok: false, value: null, error: `"${v}" is not a valid rating.` };
    }
    if (n < RATING_MIN || n > RATING_MAX) {
      return { ok: false, value: null,
               error: `Coach rating must be between ${RATING_MIN} and ${RATING_MAX} (you entered ${n}).` };
    }
    // Round to three decimals before sending: the column is numeric(4,3)
    // and would round anyway — doing it here means what the admin sees
    // saved is exactly what was stored.
    return { ok: true, value: Number(n.toFixed(3)) };
  };

  /* ─── SHARED SUBSCRIBER HELPERS ─────────────────────────────────────────
     Used by BOTH the Add Player form and the CSV bulk import, which used
     to each carry their own copy of this logic — and had already drifted
     apart (the import saved fewer columns, and its insert never actually
     ran because it depended on a return value db.js does not provide).

     THE WRITE PATH IS THE admin_ensure_subscriber RPC, not a direct table
     write. Three reasons this has to happen server-side:

       1. unsubscribe_token — every subscriber needs one or their unsubscribe
          link lands on "Invalid Link". Generating it in the browser would
          work, but it belongs next to the same generation the public signup
          flow (subscribe_signup) already does, so there is one definition of
          what a valid token looks like instead of two that can drift.
       2. Atomicity — check-then-insert across two round trips can race with
          another admin doing the same thing. Inside the function it is one
          statement against one snapshot.
       3. Authorization — the function verifies the caller is an active admin.
          Players signing in through the mobile app are `authenticated` too,
          so table-level grants alone would not be enough.

     MATCHING RULE (enforced inside the RPC, mirrored here for the preview) —
     a subscriber is "the same person" only when email AND first name AND
     last name all match, case-insensitively. Matching on email alone would
     be wrong: FEROCIA legitimately has different people sharing one email
     (e.g. a parent and their child), and email-only matching would
     permanently lock the second person out of the mailing list.
     ──────────────────────────────────────────────────────────────────── */

  /* Normalises a name the same way the database does, so the browser and
     the server never disagree about who is "the same person".
     Mirrors public.normalize_name_for_matching():
         lower → strip accents → collapse whitespace → trim

     NFD splits an accented letter into base + combining mark, and the
     regex then removes the marks: "Rodríguez" → "rodriguez". Without
     this, registering as "Rodríguez" when "Rodriguez" already existed
     created a second subscriber who received every campaign twice. */
  const _normName = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  // True when a subscriber row refers to the same person as the given details.
  // Mirrors the RPC's matching rule. Used ONLY to predict the outcome in the
  // CSV preview — the RPC itself is what actually decides at import time.
  const _sameSubscriber = (row, firstName, lastName, email) =>
    (row.email || '').trim().toLowerCase() === email.trim().toLowerCase() &&
    _normName(row.first_name) === _normName(firstName) &&
    _normName(row.last_name)  === _normName(lastName);

  /* Levenshtein distance, capped for speed. Only ever runs on names, so
     the strings are short and the cost is irrelevant. */
  const _editDistance = (a, b) => {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[n];
  };

  /* Is this probably the SAME person typed slightly differently, rather
     than a family member sharing an inbox?
     
     Exact matches are already caught by the dedup, so this only sees
     names that differ. Two signals, tuned against the real data:

       · Same first name, different last  → "Luciana Garcia" vs
         "Luciana SK Garcia". A relative would not share a first name.
       · Same last name, and the first names are one a prefix of the
         other or within 2 edits → "Yonayli"/"Yonaylin" (1 edit),
         "Chris"/"Christopher" (prefix).

     Checked against every shared-email pair on file: it flags the real
     variants and stays quiet for the genuine families — Sammy/Salome
     Mosquera (4 edits), Dirk/Dean Hall (3), William/Aiden Romanelli,
     Andy/Henry Thomson. Zak/Jack Shimony (2 edits) is the one false
     positive, which is why this warns instead of blocking. */
  const _looksLikeSamePerson = (aFirst, aLast, bFirst, bLast) => {
    const f1 = _normName(aFirst), l1 = _normName(aLast);
    const f2 = _normName(bFirst), l2 = _normName(bLast);
    if (f1 === f2 && l1 === l2) return false;   // handled by the dedup
    if (f1 === f2) return true;                 // same first name
    if (l1 === l2) {
      if (f1.startsWith(f2) || f2.startsWith(f1)) return true;
      if (_editDistance(f1, f2) <= 2) return true;
    }
    return false;
  };

  /**
   * Creates this person's subscriber record, or reactivates it if they
   * previously unsubscribed. Delegates to the admin_ensure_subscriber RPC.
   *
   * Never throws. By the time this runs the player has already been saved —
   * that is the operation that mattered — so a subscriber failure must not
   * surface as an error. It is logged and reported in the summary instead.
   *
   * @param {object}   opts
   * @param {string}   opts.firstName
   * @param {string}   opts.lastName
   * @param {string}   opts.email       Required — no email, no subscriber.
   * @param {string?}  opts.phone
   * @param {string?}  opts.gender
   * @param {string?}  opts.skillLevel
   * @returns {Promise<'created'|'reactivated'|'skipped'|'failed'>}
   */
  const ensureSubscriber = async ({ firstName, lastName, email, phone, countryCode, gender, skillLevel }) => {
    if (!email) return 'skipped';
    try {
      const { data, error } = await supabase.rpc('admin_ensure_subscriber', {
        p_first:        firstName,
        p_last:         lastName,
        p_email:        email,
        p_phone:        phone       || null,
        p_country_code: countryCode || null,
        p_gender:       gender      || null,
        p_skill:        skillLevel  || null,
      });
      if (error) throw new Error(error.message);
      // The function returns { action: 'created' | 'reactivated' | 'skipped' }.
      return data?.action || 'skipped';
    } catch (err) {
      console.warn('[ensureSubscriber] could not subscribe', email, '—', err.message);
      return 'failed';
    }
  };

  const initAddPlayer = () => {
    const form = document.getElementById('add-player-form');
    if (form) form.reset();

    // Mount the phone field fresh. form.reset() cannot clear it — the
    // component keeps its own state and renders its own markup — so it is
    // remounted empty every time the page is opened.
    FerociaPhone.mount({
      container:  'p-phone-field',
      inputClass: 'ap-input',
      required:   true,
      onChange:   apUpdatePreview,
    });

    // Bound the calendar itself, so the browser greys out the years that
    // would be rejected anyway. Cheaper than letting the admin pick a
    // date and only then telling them it is wrong.
    // Populate the state dropdown and the city datalist once per page open.
    const stateEl = document.getElementById('p-state');
    if (stateEl) stateEl.innerHTML = FerociaLocation.stateOptions('');
    const editStateEl = document.getElementById('edit-state');
    if (editStateEl && !editStateEl.options.length) editStateEl.innerHTML = FerociaLocation.stateOptions('');
    FerociaLocation.loadCitySuggestions('city-suggestions', api);

    const cityEl = document.getElementById('p-city');
    if (cityEl) cityEl.value = '';

    const dobEl = document.getElementById('p-dob');
    if (dobEl) {
      dobEl.min = dobBound(DOB_MAX_AGE);
      dobEl.max = dobBound(DOB_MIN_AGE);
      dobEl.value = '';
    }

    document.getElementById('p-joined').value = todayISO();
    // Hide dup warning on reset
    const warn = document.getElementById('p-dup-warn');
    if (warn) warn.style.display = 'none';
    // Reset preview to empty state
    apUpdatePreview();
  };

  const addPlayer = async (e) => {
    e.preventDefault();
    const firstName = document.getElementById('p-first').value.trim();
    const lastName  = document.getElementById('p-last').value.trim();
    const email     = document.getElementById('p-email').value.trim();

    if (!firstName || !lastName) {
      toast('First name and last name are required.', true);
      return;
    }

    // Phone is required (approved decision). With the US selected the
    // component also enforces exactly 10 digits. validate() paints the
    // hint under the field as well as returning the error.
    const _phoneCheck = FerociaPhone.validate('p-phone-field', { required: true });
    if (!_phoneCheck.ok) {
      toast(_phoneCheck.error, true);
      return;
    }
    // { country_code: '+1', phone: '5613026946' } — or both null when empty.
    const _phone = FerociaPhone.getValue('p-phone-field');

    // Date of birth is required here and in the CSV, but NOT in Edit
    // Player: all 279 existing players have it empty, and blocking every
    // edit until someone tracks down a birthday would push admins to
    // invent dates — worse than a null, because an invented date looks
    // valid and breaks identity verification in the claim flow.
    const _rating = ratingCheck(document.getElementById('p-coach-rating')?.value, { required: true });
    if (!_rating.ok) { toast(_rating.error, true); return; }

    const _city  = FerociaLocation.validateCity(document.getElementById('p-city')?.value, { required: true });
    if (!_city.ok) { toast(_city.error, true); return; }
    const _state = FerociaLocation.validateState(document.getElementById('p-state')?.value, { required: true });
    if (!_state.ok) { toast(_state.error, true); return; }

    const _dob = document.getElementById('p-dob')?.value || '';
    const _dobCheck = dobCheck(_dob, { required: true });
    if (!_dobCheck.ok) { toast(_dobCheck.error, true); return; }
    if (_dobCheck.warn) {
      const okDob = await confirmModal({
        title: 'Check the date of birth',
        message: `${_dobCheck.warn} Please confirm the year is correct before saving.`,
        okLabel: 'Yes, that is correct',
        cancelLabel: 'Let me fix it',
      });
      if (!okDob) return;
    }

    const saveBtn = document.getElementById('add-player-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Saving...'; }

    try {
      // Same-name check on submit. This is a WARNING, not a block: a real
      // sports club has genuine namesakes, and hard-blocking them left the
      // admin with no way to add the second person at all.
      //
      // The ilike filter is only a wide pre-filter — PostgREST treats %, _
      // and * as wildcards, which can only ever return MORE candidates,
      // never fewer, so nothing is missed. The exact comparison below is
      // what actually decides.
      const candidates = await api(
        `players?last_name=ilike.${encodeURIComponent(lastName)}` +
        `&select=id,first_name,last_name,email&limit=50`
      );
      const namesakes = candidates.filter(p =>
        _normName(p.first_name) === _normName(firstName) &&
        _normName(p.last_name)  === _normName(lastName)
      );

      if (namesakes.length) {
        const emails = namesakes
          .map(p => p.email || 'no email on file')
          .join(', ');
        // NOTE: confirmModal() renders `message` with textContent and no
        // white-space:pre-line, so newlines would collapse into spaces.
        // Keep this as one flowing sentence rather than a formatted block.
        const proceed = await confirmModal({
          title: 'A player with this name already exists',
          message:
            `${namesakes.length} player${namesakes.length !== 1 ? 's' : ''} named ` +
            `${firstName} ${lastName} ${namesakes.length !== 1 ? 'are' : 'is'} already ` +
            `in the system (${emails}). ` +
            `If this is the same person, cancel and edit the existing record instead. ` +
            `If it is a different person who happens to share the name, continue.`,
          okLabel: 'Add anyway',
          cancelLabel: 'Cancel',
        });
        if (!proceed) return;
      }

      // Same email already on the mailing list under a SIMILAR name?
      // A typo of one letter used to create a second subscriber silently,
      // and that person then received every campaign twice. This is a
      // warning, not a block: families legitimately share one inbox.
      if (email) {
        const sameEmailSubs = await api(
          `subscribers?email=ilike.${encodeURIComponent(email)}` +
          `&select=first_name,last_name,email&limit=25`
        );
        const lookalikes = (sameEmailSubs || [])
          .filter(sub => (sub.email || '').trim().toLowerCase() === email.toLowerCase())
          .filter(sub => _looksLikeSamePerson(sub.first_name, sub.last_name, firstName, lastName));

        if (lookalikes.length) {
          const names = lookalikes.map(x => `${x.first_name} ${x.last_name}`).join(', ');
          const proceedEmail = await confirmModal({
            title: 'This email is already on the mailing list',
            message:
              `${email} is already registered for ${names}. ` +
              `That name is very close to "${firstName} ${lastName}", so this may be ` +
              `the same person entered twice — which would send them every campaign ` +
              `twice. If it is a family member sharing the inbox, continue.`,
            okLabel: 'Different person — continue',
            cancelLabel: 'Cancel',
          });
          if (!proceedEmail) return;
        }
      }

      const body = {
        first_name: firstName,
        last_name:  lastName,
        email:      email || null,
        phone:         _phone.phone,
        country_code:  _phone.country_code,
        date_of_birth: _dob || null,
        coach_rating:  _rating.value,
        // Stored normalised: accents stripped, symbols dropped, title cased.
        city:          _city.value  || null,
        state:         _state.value || null,
        // Stamped only when a rating is actually set, so the date always
        // refers to a real assessment rather than any save.
        coach_rating_updated_at: _rating.value !== null ? new Date().toISOString() : null,
        gender:     document.getElementById('p-gender').value || null,
        skill_level:document.getElementById('p-skill').value || null,
        status:     document.getElementById('p-status').value,
        date_joined:document.getElementById('p-joined').value || null,
        current_rank: 999,
      };

      await api('players', 'POST', body);

      // Auto-subscribe. Shared with the CSV import — see ensureSubscriber above.
      const subResult = await ensureSubscriber({
        firstName,
        lastName,
        email,
        phone:      body.phone,
        countryCode: body.country_code,
        gender:     body.gender,
        skillLevel: body.skill_level,
      });

      const subNote = subResult === 'created'     ? ' Added to subscribers.'
                    : subResult === 'reactivated' ? ' Subscription reactivated.'
                    : subResult === 'failed'      ? ' (Could not update subscribers — check the console.)'
                    : '';
      toast(`${body.first_name} ${body.last_name} added successfully!${subNote}`);
      const form = document.getElementById('add-player-form');
      if (form) form.reset();
      document.getElementById('p-joined').value = todayISO();
      const warn = document.getElementById('p-dup-warn');
      if (warn) warn.style.display = 'none';
      apUpdatePreview();
      AdminState.allPlayers = [];
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Create Player Profile';
      }
    }
  };

  // Cache of "most recent inactivation reason per player_id" — populated by loadPlayers()
  // Used both for the inline preview under inactive players, and for prefilling the
  // edit modal when opening an already-inactive player.
  let latestInactivationReasons = {}; // { [player_id]: { reason, changed_at } }
  let historyCountByPlayer = {};       // { [player_id]: number } — for the View History button label

  // Toggle the inactivation-reason textarea based on the dropdown's value.
  const updateReasonVisibility = () => {
    const status = document.getElementById('edit-status').value;
    const wrap = document.getElementById('edit-reason-group');
    if (!wrap) return;
    wrap.style.display = status === 'inactive' ? '' : 'none';
  };

  // Old Player Profile Modal (openPlayerProfile/closePlayerProfile/ppmTab)
  // removed — fully superseded by the Player Profile page
  // (admin-player-profile.js). Confirmed safe: same 4 RPCs, no remaining
  // references anywhere in the codebase.

  let _mhTypeFilter = 'all';
  let _mhFilter = 'all';
  let _mhMatches = [];
  const MH_TYPE_LABELS = { singles: 'Singles', mens: "Men's Doubles", womens: "Women's Doubles", mixed: 'Mixed Doubles', coed: 'Co-ed' };

  // Loads/refreshes the Match Hub page: fetches all friendly matches,
  // computes the 5 summary cards, and renders the table (mhRenderTable
  // reads from _mhMatches directly, so it doesn't need the data passed in).
  const loadMatchHub = async () => {
    // The matches table below resolves player names via AdminState.allPlayers
    // (see pName() in mhRenderTable) — without this, every row would show
    // "—" instead of real names if this page loads before anything else
    // has populated that list.
    if (!AdminState.allPlayers || !AdminState.allPlayers.length) {
      try { AdminState.allPlayers = await api('players?select=*&order=first_name'); } catch (_) {}
    }

    const tableEl = document.getElementById('mh-table-body');
    if (tableEl) tableEl.innerHTML = '<div class="loading">Loading matches...</div>';
    try {
      _mhMatches = await api('friendly_matches?select=*&order=match_date.desc');
    } catch (e) {
      if (tableEl) tableEl.innerHTML = `<div class="empty">Error loading matches: ${esc(e.message)}</div>`;
      return;
    }

    const total = _mhMatches.length;
    const now = new Date();
    const thisMonth = _mhMatches.filter((m) => {
      const d = new Date(m.match_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const uniquePlayers = new Set();
    _mhMatches.forEach((m) => {
      [m.team_a_p1_id, m.team_a_p2_id, m.team_b_p1_id, m.team_b_p2_id].forEach((id) => { if (id) uniquePlayers.add(id); });
    });
    const pending = _mhMatches.filter((m) => m.status === 'pending').length;
    const dnaPoints = _mhMatches.filter((m) => m.use_dna).length;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('mh-total', total);
    setEl('mh-month', thisMonth);
    setEl('mh-month-lbl', now.toLocaleDateString('en-US', { month: 'long' }));
    setEl('mh-players', uniquePlayers.size);
    setEl('mh-pending', pending);
    setEl('mh-dna', dnaPoints);

    mhRenderTable();
  };

  window.mhFilterDdl = () => {
    _mhFilter     = document.getElementById('mh-purpose-ddl')?.value || 'all';
    _mhTypeFilter = document.getElementById('mh-type-ddl')?.value   || 'all';
    mhRenderTable();
  };

  const mhRenderTable = () => {
    const container = document.getElementById('mh-table-body');
    if (!container) return;
    let filtered = _mhFilter === 'all'
      ? _mhMatches
      : _mhFilter === 'pending'
        ? _mhMatches.filter(m => m.status === 'pending')
        : _mhMatches.filter(m => m.purpose === _mhFilter);
    if (_mhTypeFilter !== 'all') {
      filtered = filtered.filter(m => m.match_type === _mhTypeFilter);
    }

    if (!filtered.length) {
      container.innerHTML = '<div class="empty" style="padding:24px;">No matches found.</div>';
      return;
    }

    const purposeClass = { Friendly:'mh-b-friendly', Training:'mh-b-training', Challenge:'mh-b-challenge', 'Rating Observation':'mh-b-rating' };
    const usageBadges = (m) => {
      const b = [];
      if (m.use_dna)     b.push('<span class="mh-badge mh-b-dna">DNA</span>');
      if (m.use_rating)  b.push('<span class="mh-badge mh-b-training">Rating</span>');
      if (m.use_private) b.push('<span class="mh-badge" style="background:var(--bg);color:var(--text-muted);">Private</span>');
      return b.join(' ') || '—';
    };

    const pName = (id) => {
      const p = AdminState.allPlayers.find(x => x.id === id);
      return p ? `${p.first_name} ${p.last_name}` : '—';
    };

    const rows = filtered.map(m => {
      const isPending = m.status === 'pending';
      const g1 = (m.game1_score_a !== null && m.game1_score_b !== null) ? `${m.game1_score_a}–${m.game1_score_b}` : '';
      const g2 = (m.game2_score_a !== null && m.game2_score_b !== null) ? `${m.game2_score_a}–${m.game2_score_b}` : '';
      const g3 = (m.game3_score_a !== null && m.game3_score_b !== null) ? `${m.game3_score_a}–${m.game3_score_b}` : '';
      const scoreStr = [g1,g2,g3].filter(Boolean).join(', ') || '—';
      const teamAStr = [pName(m.team_a_p1_id), pName(m.team_a_p2_id)].filter(p=>p!=='—').join(' / ');
      const teamBStr = [pName(m.team_b_p1_id), pName(m.team_b_p2_id)].filter(p=>p!=='—').join(' / ');
      const winner = m.winner_team === 'A' ? teamAStr : m.winner_team === 'B' ? teamBStr : '—';
      return `<tr>
        <td style="color:var(--text-muted);white-space:nowrap;">${fmtDate(m.match_date)}</td>
        <td>${esc(MH_TYPE_LABELS[m.match_type] || m.match_type)}</td>
        <td style="font-size:11px;">${esc(teamAStr)}<br><span style="color:var(--text-muted);">vs ${esc(teamBStr)}</span></td>
        <td style="font-weight:800;">${scoreStr}</td>
        <td style="font-size:11px;color:var(--blue);font-weight:700;">${esc(winner)}</td>
        <td><span class="mh-badge ${purposeClass[m.purpose]||''}">${esc(m.purpose||'—')}</span></td>
        <td>${usageBadges(m)}</td>
        <td><span class="mh-badge ${isPending?'mh-b-pending':'mh-b-complete'}">${isPending?'Pending':'Complete'}</span></td>
        <td style="white-space:nowrap;">
          ${isPending
            ? `<button class="mh-action" style="color:var(--orange);border-color:var(--orange);" onclick="mhEnterScore(${m.id})">Enter Score</button>`
            : `<button class="mh-action" onclick="mhViewMatch(${m.id})">View</button>`
          }
          <button class="mh-action" style="color:#e53935;border-color:#fca5a5;margin-left:4px;" onclick="mhDeleteMatch(${m.id})">Delete</button>
        </td>
      </tr>`;
    }).join('');

    container.innerHTML = `<table class="mh-table">
      <thead><tr>
        <th>Date</th><th>Match Type</th><th>Players</th><th>Score</th>
        <th>Winner</th><th>Purpose</th><th>Data Usage</th><th>Status</th><th>Actions</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  };

  window.mhDeleteMatch = async (id) => {
    document.getElementById('t-modal-title').textContent = 'Delete Match';
    document.getElementById('t-modal-body').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:8px 0 20px;">
        <div style="width:52px;height:52px;border-radius:14px;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </div>
        <div style="font-size:15px;font-weight:800;color:var(--text);margin-bottom:6px;">Delete this match?</div>
        <div style="font-size:13px;font-weight:600;color:var(--text-muted);line-height:1.6;">This will permanently remove the match and all its data. This action cannot be undone.</div>
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button onclick="mhConfirmDelete(${id})" style="padding:9px 22px;border:none;border-radius:99px;background:#e53935;color:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Delete Match</button>
      </div>`;
    const xBtn = document.getElementById('t-modal-close-x');
    if (xBtn) xBtn.style.display = 'flex';
    openTModal();
  };

  window.mhConfirmDelete = async (id) => {
    closeTModal();
    try {
      await api(`friendly_matches?id=eq.${id}`, 'DELETE');
      toast('Match deleted.');
      loadMatchHub();
    } catch(e) { toast('Error deleting match: ' + e.message, true); }
  };

  window.closeViewMatchModal = () => {
    document.getElementById('view-match-modal').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.mhViewMatch = async (id) => {
    const m = _mhMatches.find(x => x.id === id);
    if (!m) return;
    // Ensure players are loaded
    if (!AdminState.allPlayers.length) {
      try { AdminState.allPlayers = await api('players?select=*&order=first_name'); } catch(_) {}
    }
    const getPlayer = (pid) => AdminState.allPlayers.find(x => Number(x.id) === Number(pid));
    const pName     = (pid) => { const p = getPlayer(pid); return p ? `${p.first_name} ${p.last_name}` : null; };
    const initials  = (pid) => { const p = getPlayer(pid); return p ? (p.first_name[0]||'') + (p.last_name[0]||'') : '?'; };

    // All players on each team
    const teamAIds = [m.team_a_p1_id, m.team_a_p2_id].filter(Boolean);
    const teamBIds = [m.team_b_p1_id, m.team_b_p2_id].filter(Boolean);
    const teamANames = teamAIds.map(pName).filter(Boolean);
    const teamBNames = teamBIds.map(pName).filter(Boolean);
    const isWinA = m.winner_team === 'A';

    // Score totals across games
    const games = [
      [m.game1_score_a, m.game1_score_b],
      [m.game2_score_a, m.game2_score_b],
      [m.game3_score_a, m.game3_score_b],
    ].filter(([a,b]) => a !== null && b !== null);
    const totalA = games.reduce((s,[a])=>s+a,0);
    const totalB = games.reduce((s,[,b])=>s+b,0);

    // Score display — for singles/doubles show per-game or total
    const scoreDisplay = games.length > 0
      ? `${isWinA ? totalA : totalB} - ${isWinA ? totalB : totalA}`
      : '— - —';
    const finalScoreStr = games.map(([a,b])=>`${a}–${b}`).join(', ');

    // Match type pill SVG
    const typeSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    const trophySVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
    const infoSVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    const targetSVG= `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    const barSVG   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7B2FBE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
    const trendSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
    const peopleSVG= `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    const shieldSVG= `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7B2FBE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const handSVG  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
    const calSVG   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const courtSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`;

    // Avatar helper
    const avatar = (pid, bgColor, textColor) => {
      const ini = initials(pid);
      return `<div style="width:44px;height:44px;border-radius:50%;background:${bgColor};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${textColor};flex-shrink:0;">${ini}</div>`;
    };

    // Data usage label
    const usageItems = [m.use_dna?'DNA':null, m.use_rating?'Rating':null, m.use_private?'Private':null].filter(Boolean);
    const usageLabel = usageItems.length ? usageItems.join(' + ') : 'Not Reported';

    // Purpose badge colors
    const purposeColor = { Friendly:'var(--teal)', Training:'var(--blue)', Challenge:'var(--orange)', 'Rating Observation':'#7B2FBE' }[m.purpose] || 'var(--text-muted)';
    const purposeBgCol = { Friendly:'rgba(36,188,150,0.1)', Training:'#e8f0ff', Challenge:'rgba(242,96,36,0.08)', 'Rating Observation':'rgba(123,47,190,0.08)' }[m.purpose] || 'var(--bg)';

    // Winner/loser result text
    const winnerName = teamANames.length ? (isWinA ? teamANames.join(' & ') : teamBNames.join(' & ')) : '—';
    const loserName  = teamANames.length ? (isWinA ? teamBNames.join(' & ') : teamANames.join(' & ')) : '—';

    // Build competition impact HTML outside template to avoid nested backtick parsing issues
    const winIds  = isWinA ? teamAIds : teamBIds;
    const loseIds = isWinA ? teamBIds : teamAIds;

    const playerRow = (pid, isWin) => {
      const ini  = initials(pid);
      const name = esc(pName(pid) || '—');
      const bg   = isWin ? 'rgba(36,188,150,0.15)' : 'var(--bg)';
      const clr  = isWin ? '#085041' : 'var(--text-muted)';
      const pts  = isWin
        ? '<span style="font-size:11px;font-weight:700;color:var(--teal);">+1 Win</span>'
        : '<span style="font-size:11px;font-weight:700;color:var(--orange);">+1 Loss</span>';
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
        + '<div style="width:36px;height:36px;border-radius:50%;background:' + bg + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:' + clr + ';flex-shrink:0;">' + ini + '</div>'
        + '<div><div style="font-size:12px;font-weight:800;color:var(--text);">' + name + '</div>' + pts + '</div>'
        + '</div>';
    };
    const impactHTML = '<div style="background:white;border-radius:10px;border:0.5px solid #e0e7f5;overflow:hidden;">'
      + '<div style="display:flex;align-items:center;gap:6px;padding:12px 14px;border-bottom:0.5px solid #e0e7f5;">'
      + trendSVG
      + '<span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--text);">Competition Impact</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;">'
      + '<div style="padding:14px;border-right:0.5px solid #e0e7f5;">' + winIds.map(pid => playerRow(pid, true)).join('') + '</div>'
      + '<div style="padding:14px;">' + loseIds.map(pid => playerRow(pid, false)).join('') + '</div>'
      + '</div></div>';


    document.getElementById('vm-title').textContent = fmtDate(m.match_date) + ' • ' + (m.purpose || 'Friendly Match');

    document.getElementById('vm-body').innerHTML = `
      <!-- Match type pill -->
      <div style="margin-bottom:16px;">
        <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:99px;background:#e8f0ff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--blue);">
          ${typeSVG} ${esc(MH_TYPE_LABELS[m.match_type]||m.match_type)}
        </span>
      </div>

      <!-- Score row — equal height cards, names per line, Team A/B labels -->
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:stretch;margin-bottom:16px;">
        <!-- Team A card -->
        <div style="background:${isWinA?'rgba(36,188,150,0.04)':'white'};border-radius:12px;padding:16px;border:1px solid ${isWinA?'rgba(36,188,150,0.3)':'#e0e7f5'};display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            ${m.match_type !== 'singles' ? '<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px;">Team A</div>' : ''}
            <div style="display:flex;align-items:center;gap:10px;">
              ${avatar(teamAIds[0], '#e8f0ff', 'var(--blue)')}
              <div>
                ${teamANames.map(n=>`<div style="font-size:13px;font-weight:800;color:var(--text);line-height:1.3;">${esc(n)}</div>`).join('')}
              </div>
            </div>
          </div>
          ${isWinA ? `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:99px;background:rgba(36,188,150,0.12);font-size:10px;font-weight:800;color:var(--teal);">${trophySVG} MATCH WINNER</div>` : ''}
        </div>

        <!-- Score center -->
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 0;">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:6px;">
            <span style="font-size:52px;font-weight:900;color:${isWinA?'var(--teal)':'var(--text)'};line-height:1;font-family:'Inter',sans-serif;">${games.length?games[0][0]:'—'}</span>
            <span style="font-size:24px;font-weight:800;color:#b0bbd6;">-</span>
            <span style="font-size:52px;font-weight:900;color:${!isWinA?'var(--teal)':'var(--text)'};line-height:1;font-family:'Inter',sans-serif;">${games.length?games[0][1]:'—'}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;">
            <div style="height:1px;width:28px;background:#e0e7f5;"></div>
            <span style="font-size:10px;font-weight:800;color:#b0bbd6;letter-spacing:1px;">VS</span>
            <div style="height:1px;width:28px;background:#e0e7f5;"></div>
          </div>
        </div>

        <!-- Team B card -->
        <div style="background:${!isWinA?'rgba(36,188,150,0.04)':'white'};border-radius:12px;padding:16px;border:1px solid ${!isWinA?'rgba(36,188,150,0.3)':'#e0e7f5'};display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            ${m.match_type !== 'singles' ? '<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px;">Team B</div>' : ''}
            <div style="display:flex;align-items:center;gap:10px;">
              ${avatar(teamBIds[0], !isWinA?'rgba(36,188,150,0.15)':'#e8f0ff', !isWinA?'#085041':'var(--blue)')}
              <div>
                ${teamBNames.map(n=>`<div style="font-size:13px;font-weight:800;color:var(--text);line-height:1.3;">${esc(n)}</div>`).join('')}
              </div>
            </div>
          </div>
          ${!isWinA ? `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:99px;background:rgba(36,188,150,0.12);font-size:10px;font-weight:800;color:var(--teal);">${trophySVG} MATCH WINNER</div>` : ''}
        </div>
      </div>

      <!-- Result banner -->
      <div style="background:rgba(36,188,150,0.06);border-radius:10px;border:0.5px solid rgba(36,188,150,0.2);padding:14px 16px;display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(36,188,150,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${trophySVG}
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--teal);margin-bottom:3px;">Result</div>
          <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:2px;">${esc(winnerName)} defeated ${esc(loserName)}</div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);">Final Score: ${finalScoreStr || scoreDisplay}</div>
        </div>
      </div>

      <!-- Info row: 3 columns -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
        <!-- Match Information -->
        <div style="background:white;border-radius:10px;border:0.5px solid #e0e7f5;padding:14px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
            ${infoSVG}
            <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--text);">Match Information</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--text-muted);">${peopleSVG} Format</span>
              <span style="font-size:11px;font-weight:700;color:var(--text);">${esc(MH_TYPE_LABELS[m.match_type]||m.match_type)}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--text-muted);">${calSVG} Date</span>
              <span style="font-size:11px;font-weight:700;color:var(--text);">${fmtDate(m.match_date)}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--text-muted);">${courtSVG} Court</span>
              <span style="font-size:11px;font-weight:700;color:var(--text);">${m.court ? esc(m.court) : '—'}</span>
            </div>
          </div>
        </div>

        <!-- Purpose -->
        <div style="background:white;border-radius:10px;border:0.5px solid #e0e7f5;padding:14px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
            ${targetSVG}
            <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--text);">Purpose</span>
          </div>
          <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;background:${purposeBgCol};font-size:11px;font-weight:700;color:${purposeColor};">
            ${handSVG} ${esc(m.purpose||'Friendly')}
          </span>
        </div>

        <!-- Data Usage -->
        <div style="background:white;border-radius:10px;border:0.5px solid #e0e7f5;padding:14px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
            ${barSVG}
            <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:var(--text);">Data Usage</span>
          </div>
          <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;background:rgba(123,47,190,0.08);font-size:11px;font-weight:700;color:#7B2FBE;">
            ${shieldSVG} ${esc(usageLabel)}
          </span>
        </div>
      </div>

      <!-- Competition Impact — built outside template to avoid nested backtick issues -->
      ${impactHTML}
      ${m.notes ? `<div style="background:#f8f9ff;border-radius:10px;padding:12px 14px;border:0.5px solid #e0e7f5;margin-bottom:14px;"><div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:5px;">Notes</div><div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.6;">${esc(m.notes)}</div></div>` : ''}
    `;

    document.getElementById('view-match-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    // Scroll body to top after render
    const vmBody = document.getElementById('vm-body');
    if (vmBody) vmBody.scrollTop = 0;
  };

  window.mhEnterScore = (id) => { toast('Enter score — coming soon!'); };

  // ── Log Match Modal ───────────────────────────────────────────────────
  // State for the modal — was missing its declaration entirely (same
  // class of bug as the loadMatchHub incident: assigned but never
  // declared, which throws "not defined" in strict mode the moment the
  // modal opens).
  let _lmType = 'singles';
  let _lmGameCount = 1;
  const LM_SEL_IDS = ['lm-a-p1', 'lm-a-p2', 'lm-b-p1', 'lm-b-p2']; // confirmed against the actual <select> ids in admin.html

  window.openLogMatchModal = async () => {
    // Ensure the players list is loaded — loadMatchHub() only fetches
    // past friendly matches, not the players list, so if this modal is
    // opened without having visited a page that loads AdminState.allPlayers
    // first (e.g. navigating straight to Match Hub), the dropdowns would
    // show nothing but "Select player..." with no real names.
    if (!AdminState.allPlayers || !AdminState.allPlayers.length) {
      try { AdminState.allPlayers = await api('players?select=*&order=first_name'); } catch (e) { toast(`Error loading players: ${e.message}`, true); }
    }

    // ── Full form reset ───────────────────────────────────────────────
    // Date — always reset to today
    const d = document.getElementById('lm-date');
    if (d) d.value = new Date().toISOString().split('T')[0];
    const t = document.getElementById('lm-time');
    if (t) t.value = '';

    // Reset match type to Singles
    _lmType = 'singles';
    document.querySelectorAll('.lm-pill').forEach(p => p.classList.remove('lm-on'));
    const firstPill = document.querySelector('.lm-pill');
    if (firstPill) firstPill.classList.add('lm-on');
    // Hide P2 dropdowns for singles
    ['lm-a-p2-wrap','lm-b-p2-wrap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.opacity = '0.4'; }
    });
    ['lm-a-p2','lm-b-p2'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) { sel.value = ''; sel.disabled = true; }
    });

    // Reset scores
    ['lm-g1a','lm-g1b','lm-g2a','lm-g2b','lm-g3a','lm-g3b'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // Reset game rows
    _lmGameCount = 1;
    document.getElementById('lm-g2-row').style.display = 'none';
    document.getElementById('lm-g3-row').style.display = 'none';
    document.getElementById('lm-add-game-btn').style.display = 'inline-flex';

    // Reset purpose to Friendly
    document.querySelectorAll('.lm-purpose').forEach(c => {
      c.classList.remove('lm-on');
      const icon = c.querySelector('.lm-purpose-icon');
      if (icon) { icon.style.background = 'var(--bg)'; }
      const svg = icon?.querySelector('svg');
      if (svg) svg.setAttribute('stroke','var(--text-muted)');
    });
    const firstPurpose = document.querySelector('.lm-purpose');
    if (firstPurpose) {
      firstPurpose.classList.add('lm-on');
      const icon = firstPurpose.querySelector('.lm-purpose-icon');
      if (icon) { icon.style.background = 'var(--blue)'; }
      const svg = icon?.querySelector('svg');
      if (svg) svg.setAttribute('stroke','white');
    }
    const purposeHid = document.getElementById('lm-purpose-val');
    if (purposeHid) purposeHid.value = 'Friendly';

    // Reset data usage — DNA on, others off
    document.querySelectorAll('.lm-data-row').forEach((row, i) => {
      const chk = row.querySelector('.lm-chk');
      if (i === 0) {
        row.classList.add('lm-on');
        if (chk) { chk.style.background='var(--blue)'; chk.style.borderColor='var(--blue)'; chk.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; }
      } else {
        row.classList.remove('lm-on');
        if (chk) { chk.style.background='white'; chk.style.borderColor='#e0e7f5'; chk.innerHTML=''; }
      }
    });
    document.getElementById('lm-use-dna').value     = 'true';
    document.getElementById('lm-use-rating').value  = 'false';
    document.getElementById('lm-use-private').value = 'false';

    // Reset notes
    const notes = document.getElementById('lm-notes');
    if (notes) notes.value = '';
    const court = document.getElementById('lm-court');
    if (court) court.value = '';

    // Clear all player selects before repopulating (prevents stale values restoring)
    LM_SEL_IDS.forEach(id => {
      const hidden = document.getElementById(id);
      const search = document.getElementById(`${id}-search`);
      if (hidden) hidden.value = '';
      if (search) search.value = '';
    });
    lmResetFields();

    // Open modal
    document.getElementById('log-match-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    lmUpdatePreview();
  };

  window.closeLogMatchModal = () => {
    document.getElementById('log-match-modal').classList.remove('open');
    document.body.style.overflow = '';
  };

  // Renamed from lmPopulateSelects — there's no <select> to populate
  // anymore (search-as-you-type replaced it), but this still needs to
  // handle disabling Player 2 for singles and clearing stale values
  // when the match type changes.
  const lmResetFields = () => {
    const isP2 = (id) => id === 'lm-a-p2' || id === 'lm-b-p2';
    LM_SEL_IDS.forEach(id => {
      const search = document.getElementById(`${id}-search`);
      const hidden = document.getElementById(id);
      if (!search) return;
      if (_lmType === 'singles' && isP2(id)) {
        search.disabled = true;
        search.value = '';
        if (hidden) hidden.value = '';
      } else {
        search.disabled = false;
      }
    });
  };

  // Player search — filters AdminState.allPlayers by name, active
  // status, the gender rule for the current match type, and excludes
  // whoever is already picked in one of the other 3 fields (so the same
  // player can't be selected twice in one match).
  window.lmSearchInput = (baseId) => {
    const search = document.getElementById(`${baseId}-search`);
    const hidden = document.getElementById(baseId);
    const resultsEl = document.getElementById(`${baseId}-results`);
    if (!search || !resultsEl) return;
    hidden.value = ''; // typing invalidates whatever was previously picked

    let gFilter = null;
    if (_lmType === 'mens')   gFilter = 'Male';
    if (_lmType === 'womens') gFilter = 'Female';
    // Mixed doubles doesn't restrict the dropdown itself — both genders
    // are valid candidates for any slot; the 1M+1F-per-team rule is
    // enforced on save (see lmSaveMatch).

    const selectedElsewhere = new Set(
      LM_SEL_IDS.filter(id => id !== baseId)
        .map(id => document.getElementById(id)?.value)
        .filter(Boolean)
    );

    const query = search.value.trim().toLowerCase();
    const matches = (AdminState.allPlayers || [])
      .filter(p => p.status === 'active')
      .filter(p => !gFilter || p.gender === gFilter)
      .filter(p => !selectedElsewhere.has(String(p.id)))
      .filter(p => !query || `${p.first_name} ${p.last_name}`.toLowerCase().includes(query))
      .sort((a, b) => a.first_name.localeCompare(b.first_name))
      .slice(0, 8);

    resultsEl.innerHTML = matches.length
      ? matches.map(p => `<div class="lm-player-result-row" data-id="${p.id}" data-name="${esc(p.first_name)} ${esc(p.last_name)}">${esc(p.first_name)} ${esc(p.last_name)}</div>`).join('')
      : '<div class="lm-player-result-empty">No players found</div>';
    resultsEl.style.display = 'block';

    resultsEl.querySelectorAll('.lm-player-result-row').forEach(row => {
      row.addEventListener('mouseenter', () => { row.style.background = '#f4f7ff'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'white'; });
      row.addEventListener('click', () => {
        search.value = row.dataset.name;
        hidden.value = row.dataset.id;
        resultsEl.style.display = 'none';
        lmUpdatePreview();
      });
    });
  };

  // Close any open results dropdown when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (e.target.closest('.lm-pfield')) return;
    document.querySelectorAll('.lm-player-results').forEach(el => { el.style.display = 'none'; });
  });

  window.lmSetType = (btn, type) => {
    document.querySelectorAll('.lm-pill').forEach(p => p.classList.remove('lm-on'));
    btn.classList.add('lm-on');
    _lmType = type;
    const isDoubles = type !== 'singles';
    ['lm-a-p2-wrap','lm-b-p2-wrap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.opacity = isDoubles ? '1' : '0.4';
    });
    // Repopulate with gender filter + disable P2 for singles
    lmResetFields();
    lmUpdatePreview();
  };

  window.lmAddGame = () => {
    if (_lmGameCount >= 3) return;
    _lmGameCount++;
    document.getElementById(`lm-g${_lmGameCount}-row`).style.display = 'grid';
    if (_lmGameCount >= 3) document.getElementById('lm-add-game-btn').style.display = 'none';
  };

  window.lmSelectPurpose = (card, value) => {
    document.querySelectorAll('.lm-purpose').forEach(c => {
      c.classList.remove('lm-on');
      const icon = c.querySelector('.lm-purpose-icon');
      if (icon) { icon.style.background = 'var(--bg)'; }
      const svg = icon?.querySelector('svg');
      if (svg) svg.setAttribute('stroke','var(--text-muted)');
    });
    card.classList.add('lm-on');
    const icon = card.querySelector('.lm-purpose-icon');
    if (icon) { icon.style.background = 'var(--blue)'; }
    const svg = icon?.querySelector('svg');
    if (svg) svg.setAttribute('stroke','white');
    const hid = document.getElementById('lm-purpose-val');
    if (hid) hid.value = value;
    lmUpdatePreview();
  };

  window.lmToggleData = (row, field) => {
    const isOn = row.classList.toggle('lm-on');
    const chk  = row.querySelector('.lm-chk');
    if (chk) {
      chk.style.background   = isOn ? 'var(--blue)' : 'white';
      chk.style.borderColor  = isOn ? 'var(--blue)' : '#e0e7f5';
      chk.innerHTML = isOn
        ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : '';
    }
    const hid = document.getElementById(`lm-use-${field}`);
    if (hid) hid.value = isOn ? 'true' : 'false';
    lmUpdatePreview();
  };

  const lmUpdatePreview = () => {
    const typeLabel = MH_TYPE_LABELS[_lmType] || _lmType;
    const purpose   = document.getElementById('lm-purpose-val')?.value || 'Friendly';
    const date      = document.getElementById('lm-date')?.value || '';
    const usageParts = [];
    if (document.getElementById('lm-use-dna')?.value === 'true')     usageParts.push('Player DNA');
    if (document.getElementById('lm-use-rating')?.value === 'true')  usageParts.push('Rating');
    if (document.getElementById('lm-use-private')?.value === 'true') usageParts.push('Private');
    const usage = usageParts.length ? usageParts.join(' + ') : 'None';
    const textEl = document.getElementById('lm-preview-text');
    const subEl  = document.getElementById('lm-preview-sub');
    if (textEl) textEl.textContent = `${typeLabel} · ${date ? fmtDate(date) : '—'} · ${purpose}`;
    if (subEl)  subEl.textContent  = `Data: ${usage} · Saving will lock the match record`;
  };

  window.lmSaveMatch = async () => {
    const ap1 = document.getElementById('lm-a-p1')?.value;
    const ap2 = document.getElementById('lm-a-p2')?.value;
    const bp1 = document.getElementById('lm-b-p1')?.value;
    const bp2 = document.getElementById('lm-b-p2')?.value;
    const date = document.getElementById('lm-date')?.value;
    if (!ap1 || !bp1) { toast('Please select at least Player 1 for each team.', true); return; }
    if (!date)         { toast('Please select a match date.', true); return; }
    const g1a = document.getElementById('lm-g1a')?.value;
    const g1b = document.getElementById('lm-g1b')?.value;
    if (!g1a || !g1b)  { toast('Please enter Game 1 scores.', true); return; }

    // Mixed doubles validation — each team needs 1M + 1F
    if (_lmType === 'mixed') {
      const getGender = (pid) => AdminState.allPlayers.find(p => String(p.id) === String(pid))?.gender;
      const gA1 = getGender(ap1), gA2 = getGender(ap2);
      const gB1 = getGender(bp1), gB2 = getGender(bp2);
      if (!ap2 || !bp2) { toast('Mixed doubles requires 2 players per team.', true); return; }
      const teamAValid = (gA1 === 'Male' && gA2 === 'Female') || (gA1 === 'Female' && gA2 === 'Male');
      const teamBValid = (gB1 === 'Male' && gB2 === 'Female') || (gB1 === 'Female' && gB2 === 'Male');
      if (!teamAValid) { toast('Team A must have one Male and one Female player.', true); return; }
      if (!teamBValid) { toast('Team B must have one Male and one Female player.', true); return; }
    }

    // Co-ed — a doubles format like Mixed, but with NO gender
    // restriction on team composition at all (e.g. two women vs a
    // man and a woman is valid). Only requires 2 players per team.
    if (_lmType === 'coed') {
      if (!ap2 || !bp2) { toast('Co-ed requires 2 players per team.', true); return; }
    }

    const body = {
      match_type:   _lmType,
      match_date:   date,
      match_time:   document.getElementById('lm-time')?.value || null,
      court:        document.getElementById('lm-court')?.value?.trim() || null,
      team_a_p1_id: parseInt(ap1),
      team_a_p2_id: document.getElementById('lm-a-p2')?.value ? parseInt(document.getElementById('lm-a-p2').value) : null,
      team_b_p1_id: parseInt(bp1),
      team_b_p2_id: document.getElementById('lm-b-p2')?.value ? parseInt(document.getElementById('lm-b-p2').value) : null,
      game1_score_a: parseInt(g1a), game1_score_b: parseInt(g1b),
      game2_score_a: document.getElementById('lm-g2a')?.value ? parseInt(document.getElementById('lm-g2a').value) : null,
      game2_score_b: document.getElementById('lm-g2b')?.value ? parseInt(document.getElementById('lm-g2b').value) : null,
      game3_score_a: document.getElementById('lm-g3a')?.value ? parseInt(document.getElementById('lm-g3a').value) : null,
      game3_score_b: document.getElementById('lm-g3b')?.value ? parseInt(document.getElementById('lm-g3b').value) : null,
      winner_team:  (() => {
        // Count games won per team
        const games = [
          [parseInt(g1a)||0, parseInt(g1b)||0],
          [parseInt(document.getElementById('lm-g2a')?.value)||0, parseInt(document.getElementById('lm-g2b')?.value)||0],
          [parseInt(document.getElementById('lm-g3a')?.value)||0, parseInt(document.getElementById('lm-g3b')?.value)||0],
        ].filter(([a,b]) => a > 0 || b > 0);
        const wA = games.filter(([a,b]) => a > b).length;
        const wB = games.filter(([a,b]) => b > a).length;
        return wA >= wB ? 'A' : 'B';
      })(),
      purpose:      document.getElementById('lm-purpose-val')?.value || 'Friendly',
      use_dna:      document.getElementById('lm-use-dna')?.value === 'true',
      use_rating:   document.getElementById('lm-use-rating')?.value === 'true',
      use_private:  document.getElementById('lm-use-private')?.value === 'true',
      notes:        document.getElementById('lm-notes')?.value || null,
      status:       'completed',
    };

    try {
      await api('friendly_matches', 'POST', body);
      toast('Match logged successfully!');
      closeLogMatchModal();
      loadMatchHub();
    } catch(e) {
      toast('Error saving match: ' + e.message, true);
    }
  };

  // ── BULK PLAYER IMPORT ────────────────────────────────────────────────────

  let _importRows = []; // parsed and validated rows
  // Subscriber rows fetched once per file, used ONLY to predict in the
  // preview what will happen to each row's subscription (create / skip /
  // reactivate). The actual decision at import time is made server-side by
  // the admin_ensure_subscriber RPC, which is authoritative — this is a
  // best-effort hint so the admin can see the reactivations before
  // committing, not the thing that drives the write.
  let _importSubs = [];

  // ── Download CSV template ──────────────────────────────────────────────
  window.importDownloadTemplate = () => {
    // date_of_birth uses MM/DD/YYYY in the template. The importer also
    // accepts YYYY-MM-DD, because Excel sometimes rewrites a date column
    // into that shape when the file is saved.
    const csv = 'first_name,last_name,email,phone,gender,date_of_birth,coach_rating,city,state\n'
              + 'John,Smith,john@email.com,561-555-1234,Male,03/15/1985,3.500,Boca Raton,FL\n'
              + 'Jane,Doe,jane@email.com,954-555-5678,Female,11/02/1990,4.250,Delray Beach,FL';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'players_import_template.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Drag & drop handlers ───────────────────────────────────────────────
  window.importDragOver = (e) => { e.preventDefault(); document.getElementById('import-drop-zone')?.classList.add('drag-over'); };
  window.importDragLeave = () => { document.getElementById('import-drop-zone')?.classList.remove('drag-over'); };
  window.importDrop = (e) => {
    e.preventDefault();
    document.getElementById('import-drop-zone')?.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) importHandleFile(file);
  };

  // ── Reset import state ─────────────────────────────────────────────────
  window.importReset = () => {
    _importRows = [];
    _importSubs = [];
    document.getElementById('import-preview-area').style.display = 'none';
    document.getElementById('import-file-input').value = '';
  };

  // ── Parse and validate CSV ─────────────────────────────────────────────
  window.importHandleFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) { toast('Please upload a CSV file.', true); return; }

    // Always re-fetch the player list used for the duplicate check, into a
    // LOCAL array. Two separate reasons for this shape:
    //
    // 1. FRESHNESS — this used to reuse AdminState.allPlayers whenever it
    //    was non-empty. That array is a long-lived cache and goes stale in
    //    normal use (a player added via the Add Player form, or deleted in
    //    the database, is not reflected until something clears it), which
    //    produced both false duplicates that blocked legitimate imports and
    //    missed duplicates that created a second copy of an existing person.
    //
    // 2. ISOLATION — this query selects only three columns, so its rows do
    //    NOT carry id, gender, status, etc. Writing them into the shared
    //    AdminState.allPlayers would hand truncated rows to every other
    //    module that reads it: Sessions and Match Hub look players up by
    //    .id, Log Match reads .gender, Status History looks up by .id. Those
    //    would all silently fail to find anyone. Keeping this local means
    //    the shared cache is never degraded.
    let importPlayers = [];
    try {
      importPlayers = await api('players?select=first_name,last_name,email&order=id');
    } catch (err) {
      // Fall back to the shared cache rather than an empty list: stale data
      // is still a better duplicate check than none, which would pass every
      // row through as new.
      console.warn('[import] could not refresh players, falling back to cached list:', err.message);
      importPlayers = AdminState.allPlayers || [];
    }

    // Fetch subscribers ONCE for this file. The preview needs them to show
    // whether each row will create, skip, or reactivate a subscription, and
    // importConfirm() reuses the same array — so a 200-row CSV costs one
    // request here rather than 200 lookups during the import.
    try {
      _importSubs = await api('subscribers?select=id,first_name,last_name,email,status');
    } catch (err) {
      // Non-fatal: the player import itself does not depend on this. Rows
      // will simply show an unknown subscription outcome, and each one will
      // fall back to its own lookup at import time.
      console.warn('[import] could not preload subscribers —', err.message);
      _importSubs = [];
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast('CSV file is empty or has no data rows.', true); return; }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g,''));
    const colIdx = {
      city:          headers.indexOf('city'),
      state:         headers.indexOf('state'),
      coach_rating:  headers.indexOf('coach_rating'),
      date_of_birth: headers.indexOf('date_of_birth'),
      first_name: headers.indexOf('first_name'),
      last_name:  headers.indexOf('last_name'),
      email:      headers.indexOf('email'),
      phone:      headers.indexOf('phone'),
      gender:     headers.indexOf('gender'),
    };

    if (colIdx.first_name < 0 || colIdx.last_name < 0 || colIdx.email < 0) {
      toast('CSV must have columns: first_name, last_name, email', true);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Tracks people already seen EARLIER IN THIS SAME FILE, so a CSV that
    // lists the same person twice imports them once instead of twice. Keyed
    // on the same three fields used everywhere else (name + email).
    const seenInFile = new Set();
    const fileKey = (r) =>
      `${_normName(r.first_name)}|${_normName(r.last_name)}|${r.email.toLowerCase()}`;

    _importRows = lines.slice(1).map((line, i) => {
      // Handle quoted CSV fields
      const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(',');
      const get = (idx) => idx >= 0 ? (cols[idx] || '').replace(/^"|"$/g, '').trim() : '';

      const row = {
        rowNum:     i + 2,
        first_name: get(colIdx.first_name),
        last_name:  get(colIdx.last_name),
        email:      get(colIdx.email),
        phone:      get(colIdx.phone),
        city_raw:   get(colIdx.city),
        state_raw:  get(colIdx.state),
        city:       null,
        state:      null,
        rating_raw: get(colIdx.coach_rating),
        rating:     null,   // rellenado por ratingCheck() más abajo
        dob_raw:    get(colIdx.date_of_birth),
        dob:        null,   // rellenado por dobParse() más abajo
        gender:     get(colIdx.gender),
        date_joined: today,
        status:     'active',
        // new        -> will be imported
        // duplicate  -> this player already exists in the database
        // dupfile    -> this person appears earlier in THIS file
        // error      -> failed validation
        _state:     'new',
        // What will happen to this person's subscription if the row imports:
        // 'create' | 'skip' (already subscribed) | 'reactivate' (was unsubscribed)
        _subState:  'create',
        _errors:    [],
      };

      // Validate required fields
      if (!row.first_name) row._errors.push('Missing first name');
      if (!row.last_name)  row._errors.push('Missing last name');
      if (!row.email)      row._errors.push('Missing email');
      else if (!emailRegex.test(row.email)) row._errors.push('Invalid email format');

      // Phone is required (approved decision). Every number on file is a
      // US number, so the CSV — which carries no country column and always
      // assumes +1 — must contain exactly 10 digits. A row with 9 or 11 is
      // a typing error, not a foreign number.
      const _rowDigits = FerociaPhone.normalize(row.phone);
      if (!_rowDigits)                 row._errors.push('Missing phone');
      else if (_rowDigits.length !== 10)
        row._errors.push(`Phone must be 10 digits (has ${_rowDigits.length})`);

      // Date of birth is required in the CSV (approved decision).
      // dobParse() accepts MM/DD/YYYY and YYYY-MM-DD and rejects days
      // that do not exist, so 02/30/1985 fails here rather than silently
      // becoming March 2nd.
      // City and state are required in the CSV (approved decision).
      const _cc = FerociaLocation.validateCity(row.city_raw, { required: true });
      if (!_cc.ok) row._errors.push(_cc.error);
      else row.city = _cc.value;

      const _sc = FerociaLocation.validateState(row.state_raw, { required: true });
      if (!_sc.ok) row._errors.push(_sc.error);
      else row.state = _sc.value;

      // Required in the CSV (approved decision).
      const _rc = ratingCheck(row.rating_raw, { required: true });
      if (!_rc.ok) row._errors.push(_rc.error);
      else row.rating = _rc.value;

      if (!row.dob_raw) row._errors.push('Missing date of birth');
      else {
        row.dob = dobParse(row.dob_raw);
        if (!row.dob) {
          row._errors.push(`Invalid date of birth "${row.dob_raw}" — use MM/DD/YYYY`);
        } else {
          const c = dobCheck(row.dob, { required: true });
          // Only hard errors stop a row. The "unusual age" warning has no
          // one to ask during a bulk import, so it is not applied here —
          // the age bounds already reject the impossible values.
          if (!c.ok) row._errors.push(c.error);
        }
      }
      if (row.gender && !['male','female'].includes(row.gender.toLowerCase())) {
        row._errors.push('Gender must be Male or Female');
      } else if (row.gender) {
        // Normalize capitalization
        row.gender = row.gender.charAt(0).toUpperCase() + row.gender.slice(1).toLowerCase();
      }

      if (row._errors.length) { row._state = 'error'; return row; }

      // Dedup check against the database: all 3 must match (case-insensitive).
      // Uses the freshly-fetched local list, not the shared cache — see the
      // comment where importPlayers is loaded.
      const isDup = importPlayers.some(p =>
        _normName(p.first_name) === _normName(row.first_name) &&
        _normName(p.last_name)  === _normName(row.last_name)  &&
        (p.email || '').toLowerCase() === row.email.toLowerCase()
      );
      if (isDup) { row._state = 'duplicate'; return row; }

      // Dedup check against EARLIER ROWS OF THIS FILE. Without this, a CSV
      // that lists the same person twice created two identical players —
      // neither row is a duplicate of the database, so both passed.
      const key = fileKey(row);
      if (seenInFile.has(key)) { row._state = 'dupfile'; return row; }
      seenInFile.add(key);

      // Work out what will happen to this person's subscription, so the
      // preview can show it before the admin commits.
      const existingSub = _importSubs.find(s => _sameSubscriber(s, row.first_name, row.last_name, row.email));
      row._subState = !existingSub ? 'create'
                    : existingSub.status === 'unsubscribed' ? 'reactivate'
                    : 'skip';

      return row;
    }).filter(r => r.first_name || r.last_name || r.email); // skip completely empty rows

    importRenderPreview();
  };

  // ── Render preview table ───────────────────────────────────────────────
  const importRenderPreview = () => {
    const newRows    = _importRows.filter(r => r._state === 'new');
    const dupRows    = _importRows.filter(r => r._state === 'duplicate');
    const dupFileRows= _importRows.filter(r => r._state === 'dupfile');
    const errRows    = _importRows.filter(r => r._state === 'error');
    const reactRows  = newRows.filter(r => r._subState === 'reactivate');

    // Summary cards. The reactivation card only appears when there is
    // something to reactivate — it is the one outcome that reverses a
    // choice the subscriber made themselves, so it must not be buried.
    document.getElementById('import-summary').innerHTML = `
      <div class="import-sum-card" style="background:rgba(36,188,150,0.04);border-color:rgba(36,188,150,0.2);">
        <div class="import-sum-val" style="color:var(--teal);">${newRows.length}</div>
        <div class="import-sum-lbl">Ready to Import</div>
      </div>
      <div class="import-sum-card" style="background:#fff8e6;border-color:#f5d78e;">
        <div class="import-sum-val" style="color:#9a6200;">${dupRows.length + dupFileRows.length}</div>
        <div class="import-sum-lbl">Duplicates (skipped)</div>
      </div>
      <div class="import-sum-card" style="background:#fee2e2;border-color:#fca5a5;">
        <div class="import-sum-val" style="color:#e53935;">${errRows.length}</div>
        <div class="import-sum-lbl">Errors (skipped)</div>
      </div>
      ${reactRows.length ? `
      <div class="import-sum-card" style="background:rgba(23,76,204,0.04);border-color:rgba(23,76,204,0.25);">
        <div class="import-sum-val" style="color:var(--blue);">${reactRows.length}</div>
        <div class="import-sum-lbl">Subscriptions Reactivated</div>
      </div>` : ''}`;

    // Table rows — show all, color-coded
    document.getElementById('import-table-body').innerHTML = _importRows.map(r => {
      const badge = r._state === 'new'
        ? '<span class="import-badge import-b-new">✓ New</span>'
        : r._state === 'duplicate'
          ? '<span class="import-badge import-b-dup" title="This player already exists in the database">⚠ Duplicate</span>'
          : r._state === 'dupfile'
            ? '<span class="import-badge import-b-dup" title="This person appears earlier in this same CSV file">⚠ Repeated in file</span>'
            : `<span class="import-badge import-b-err" title="${esc(r._errors.join(', '))}">✕ Error</span>`;

      // Reactivation flag — shown next to the main badge so the admin sees,
      // BEFORE confirming, that importing this row will put someone who
      // unsubscribed back onto the mailing list.
      const subBadge = (r._state === 'new' && r._subState === 'reactivate')
        ? '<span class="import-badge" title="This person previously unsubscribed. Importing this row will reactivate their subscription." style="background:rgba(23,76,204,0.08);color:var(--blue);border:0.5px solid rgba(23,76,204,0.3);margin-left:4px;">↻ Reactivate</span>'
        : '';

      const rowStyle = r._state === 'error' ? 'background:#fff8f8;'
                     : (r._state === 'duplicate' || r._state === 'dupfile') ? 'background:#fffdf0;'
                     : '';
      return `<tr style="${rowStyle}">
        <td style="color:var(--text-muted);">${r.rowNum}</td>
        <td>${esc(r.first_name)}</td>
        <td>${esc(r.last_name)}</td>
        <td>${esc(r.email)}</td>
        <td>${r.phone ? esc(FerociaPhone.format(FerociaPhone.normalize(r.phone).length === 10 ? '+1' : null, r.phone)) : '—'}</td>
        <td>${esc(r.gender||'—')}</td>
        <td>${r.dob ? esc(dobDisplay(r.dob)) : (r.dob_raw ? `<span style="color:#e53935;">${esc(r.dob_raw)}</span>` : '—')}</td>
        <td>${r.rating !== null ? esc(ratingDisplay(r.rating)) : (r.rating_raw ? `<span style="color:#e53935;">${esc(r.rating_raw)}</span>` : '—')}</td>
        <td>${(r.city && r.state) ? esc(FerociaLocation.formatLocation(r.city, r.state))
              : ((r.city_raw || r.state_raw) ? `<span style="color:#e53935;">${esc([r.city_raw, r.state_raw].filter(Boolean).join(', '))}</span>` : '—')}</td>
        <td style="white-space:nowrap;">${badge}${subBadge}</td>
      </tr>`;
    }).join('');

    // Update confirm button label
    const label = document.getElementById('import-confirm-label');
    if (label) label.textContent = `Import ${newRows.length} Player${newRows.length !== 1 ? 's' : ''}`;
    const btn = document.getElementById('import-confirm-btn');
    if (btn) {
      btn.style.opacity = newRows.length ? '1' : '0.4';
      btn.style.pointerEvents = newRows.length ? 'auto' : 'none';
    }

    document.getElementById('import-preview-area').style.display = 'block';
  };

  // ── Execute import ─────────────────────────────────────────────────────
  window.importConfirm = async () => {
    const toInsert = _importRows.filter(r => r._state === 'new');
    if (!toInsert.length) return;

    const btn = document.getElementById('import-confirm-btn');
    if (btn) { btn.style.opacity = '0.5'; btn.style.pointerEvents = 'none'; }

    let successCount = 0;
    let failCount    = 0;
    let subCreated   = 0;
    let subReactivated = 0;
    let subFailed    = 0;

    for (const row of toInsert) {
      try {
        const playerBody = {
          first_name:  row.first_name,
          last_name:   row.last_name,
          email:       row.email,
          // Digits only, dial code assumed +1 (approved: the CSV template has
          // no country column, and 99.7% of records on file are US numbers).
          // A number that is not 10 digits is left with no dial code rather
          // than mislabelled, so it can be found and fixed later.
          date_of_birth: row.dob,
          coach_rating:  row.rating,
          city:          row.city  || null,
          state:         row.state || null,
          coach_rating_updated_at: row.rating !== null ? new Date().toISOString() : null,
          phone:        FerociaPhone.normalize(row.phone) || null,
          country_code: FerociaPhone.normalize(row.phone).length === 10 ? '+1' : null,
          gender:      row.gender || null,
          date_joined: row.date_joined,
          status:      'active',
        };

        // db.js's POST deliberately does not chain .select(), so it never
        // returns the inserted row. The previous code destructured that
        // (always empty) result and gated the subscriber insert on it —
        // which meant the subscriber insert NEVER ran, silently. Reaching
        // the next line without an exception is what tells us the player
        // was created.
        await api('players', 'POST', playerBody);
        successCount++;

        // Sync to subscribers. The RPC does its own authoritative dedup
        // server-side, so no pre-fetched list is passed here — _importSubs
        // exists only to predict the outcome in the preview.
        const subResult = await ensureSubscriber({
          firstName:  row.first_name,
          lastName:   row.last_name,
          email:      row.email,
          phone:       FerociaPhone.normalize(row.phone) || null,
          countryCode: FerociaPhone.normalize(row.phone).length === 10 ? '+1' : null,
          gender:     row.gender,
        });
        if (subResult === 'created')          subCreated++;
        else if (subResult === 'reactivated') subReactivated++;
        else if (subResult === 'failed')      subFailed++;
      } catch(e) {
        failCount++;
        console.warn(`[import] row ${row.rowNum} failed —`, e.message);
      }
    }

    // Reload players cache
    try { AdminState.allPlayers = await api('players?select=*&order=first_name'); } catch(_) {}

    // Report what actually happened on BOTH tables. The old message only
    // mentioned players, so a silent subscriber failure was invisible.
    const parts = [`✓ ${successCount} player${successCount !== 1 ? 's' : ''} imported`];
    if (failCount)       parts.push(`${failCount} failed`);
    if (subCreated)      parts.push(`${subCreated} added to subscribers`);
    if (subReactivated)  parts.push(`${subReactivated} subscription${subReactivated !== 1 ? 's' : ''} reactivated`);
    if (subFailed)       parts.push(`${subFailed} subscriber sync${subFailed !== 1 ? 's' : ''} failed`);
    toast(parts.join(' · '), failCount > 0 || subFailed > 0);
    importReset();
    if (typeof loadPlayers === 'function') loadPlayers();
  };

  const openEdit = async (id) => {
    let p = AdminState.allPlayers.find((x) => x.id === id);
    if (!p) {
      // Not in the cached list yet (e.g. opened from a page that didn't
      // load the full Players array first) — fetch it directly instead
      // of silently doing nothing.
      try {
        const rows = await api(`players?id=eq.${id}&select=*`);
        p = rows[0];
      } catch (e) { /* fall through to the toast below */ }
    }
    if (!p) { toast('Could not load this player — try refreshing the page.', true); return; }
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-original-status').value = p.status || 'active';
    document.getElementById('edit-first').value = p.first_name;
    document.getElementById('edit-last').value = p.last_name;
    document.getElementById('edit-email').value = p.email || '';
    // Tolerates both formats on purpose. Until the data migration runs,
    // phone still holds free text like "(561) 302-6946"; the component
    // strips it down to digits either way, so this works before and after.
    FerociaPhone.mount({
      container:  'edit-phone-field',
      required:   true,
      value:      { country_code: p.country_code, phone: p.phone },
    });

    // Optional in Edit Player for now (approved). The bounds still apply
    // so a typo cannot be picked from the calendar.
    const editStateSel = document.getElementById('edit-state');
    if (editStateSel) editStateSel.innerHTML = FerociaLocation.stateOptions(p.state || '');
    const editCityEl = document.getElementById('edit-city');
    if (editCityEl) editCityEl.value = p.city || '';
    FerociaLocation.loadCitySuggestions('city-suggestions', api);

    const editSkill = document.getElementById('edit-skill');
    if (editSkill) editSkill.value = p.skill_level || '';

    const editRating = document.getElementById('edit-coach-rating');
    if (editRating) editRating.value = p.coach_rating !== null && p.coach_rating !== undefined
      ? ratingDisplay(p.coach_rating) : '';

    const editDob = document.getElementById('edit-dob');
    if (editDob) {
      editDob.min   = dobBound(DOB_MAX_AGE);
      editDob.max   = dobBound(DOB_MIN_AGE);
      editDob.value = p.date_of_birth || '';
    }
    document.getElementById('edit-gender').value = p.gender || '';
    document.getElementById('edit-status').value = p.status || 'active';

    // Reset reason field state
    const reasonEl = document.getElementById('edit-reason');
    const errEl = document.getElementById('edit-reason-error');
    if (reasonEl) reasonEl.value = '';
    if (errEl) errEl.style.display = 'none';

    // Prefill the reason textarea with the most recent stored reason
    // when the player is currently inactive (so admin can see/edit it).
    if ((p.status || 'active') === 'inactive') {
      const recent = latestInactivationReasons[p.id];
      if (recent && reasonEl) reasonEl.value = recent.reason || '';
    }

    // Show/hide reason wrap based on current status
    updateReasonVisibility();

    // History link — show button + count if there is any history at all
    const histWrap = document.getElementById('edit-history-link-wrap');
    const histCountEl = document.getElementById('edit-history-count');
    const count = historyCountByPlayer[p.id] || 0;
    if (histWrap) histWrap.style.display = count > 0 ? '' : 'none';
    if (histCountEl) histCountEl.textContent = String(count);

    document.getElementById('edit-modal').classList.add('open');
  };

  window.closeModal = () => document.getElementById('edit-modal').classList.remove('open');

  const saveEditPlayer = async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('edit-id').value, 10);
    const originalStatus = document.getElementById('edit-original-status').value;
    const newStatus = document.getElementById('edit-status').value;
    const reasonInputEl = document.getElementById('edit-reason');
    const reasonErrEl = document.getElementById('edit-reason-error');
    const reasonInput = (reasonInputEl?.value || '').trim();

    // Decide whether we need a new history entry, and whether reason is required:
    //   - status changed to 'inactive'   → history required, reason required
    //   - status was already 'inactive' AND reason text changed → history (reason edit), reason required (cannot blank it)
    //   - status changed FROM inactive → active → no history, no reason needed
    //   - everything else → no history, no reason needed
    const becomingInactive = newStatus === 'inactive' && originalStatus !== 'inactive';
    const stayingInactive = newStatus === 'inactive' && originalStatus === 'inactive';
    const previousReason = (latestInactivationReasons[id]?.reason || '').trim();
    const reasonChangedWhileInactive = stayingInactive && reasonInput !== previousReason;
    const needsHistoryRow = becomingInactive || reasonChangedWhileInactive;
    const reasonRequired = newStatus === 'inactive' && (becomingInactive || reasonChangedWhileInactive);

    if (reasonRequired && !reasonInput) {
      if (reasonErrEl) reasonErrEl.style.display = 'block';
      reasonInputEl?.focus();
      return;
    }
    if (reasonErrEl) reasonErrEl.style.display = 'none';

    // Email is required
    const editEmail = document.getElementById('edit-email').value.trim();
    if (!editEmail) {
      toast('Email address is required.', true);
      document.getElementById('edit-email').focus();
      return;
    }

    const _editCheck = FerociaPhone.validate('edit-phone-field', { required: true });
    if (!_editCheck.ok) {
      toast(_editCheck.error, true);
      return;
    }
    const _editPhone = FerociaPhone.getValue('edit-phone-field');

    // Optional here (approved): 279 players have no rating yet, and making
    // it mandatory would block every unrelated edit.
    const _editRating = ratingCheck(document.getElementById('edit-coach-rating')?.value, { required: false });
    if (!_editRating.ok) { toast(_editRating.error, true); return; }
    // The rating this player had before the edit, read from the cache that
    // openEdit() populated. Used below to stamp the date only on a real
    // change. Falls back to null when the player is not cached, which makes
    // the comparison treat it as new — a harmless extra timestamp.
    const _origPlayerRow = AdminState.allPlayers.find(x => x.id === id);
    const _origRating = (_origPlayerRow?.coach_rating === null || _origPlayerRow?.coach_rating === undefined)
      ? null : Number(_origPlayerRow.coach_rating);

    // Optional here (approved): 42 players have no city yet, and making it
    // mandatory would block every unrelated edit.
    const _editCity  = FerociaLocation.validateCity(document.getElementById('edit-city')?.value, { required: false });
    if (!_editCity.ok) { toast(_editCity.error, true); return; }
    const _editState = FerociaLocation.validateState(document.getElementById('edit-state')?.value, { required: false });
    if (!_editState.ok) { toast(_editState.error, true); return; }

    const _editDob = document.getElementById('edit-dob')?.value || '';
    const _editDobCheck = dobCheck(_editDob, { required: false });
    if (!_editDobCheck.ok) { toast(_editDobCheck.error, true); return; }
    if (_editDobCheck.warn) {
      const okDob = await confirmModal({
        title: 'Check the date of birth',
        message: `${_editDobCheck.warn} Please confirm the year is correct before saving.`,
        okLabel: 'Yes, that is correct',
        cancelLabel: 'Let me fix it',
      });
      if (!okDob) return;
    }

    const body = {
      first_name: document.getElementById('edit-first').value.trim(),
      last_name: document.getElementById('edit-last').value.trim(),
      email: editEmail,
      phone:         _editPhone.phone,
      country_code:  _editPhone.country_code,
      date_of_birth: _editDob || null,
      coach_rating:  _editRating.value,
      city:          _editCity.value  || null,
      state:         _editState.value || null,
      skill_level:   document.getElementById('edit-skill')?.value || null,
      // Only re-stamp when the value actually CHANGED. Touching it on every
      // save would make the date mean "last edited", not "last assessed" —
      // and then it would tell you nothing about how current the rating is.
      ...(_editRating.value !== _origRating
            ? { coach_rating_updated_at: _editRating.value !== null ? new Date().toISOString() : null }
            : {}),
      gender: document.getElementById('edit-gender').value || null,
      status: newStatus,
    };

    try {
      // Capture original values from cache BEFORE updating
      const _origPlayer = AdminState.allPlayers.find(p => p.id === id);
      const _origFirst  = (_origPlayer?.first_name || '').trim();
      const _origLast   = (_origPlayer?.last_name  || '').trim();
      const _origEmail  = (_origPlayer?.email      || '').trim();

      await api(`players?id=eq.${id}`, 'PATCH', body);
      window.logAuditAction(id, 'player_edited', 'Edited player information');

      // Sync this person's subscriber record so a name/email change here
      // does not leave the mailing list pointing at the old details.
      //
      // The lookup uses ilike ONLY as a wide pre-filter. PostgREST treats
      // %, _ and * as wildcards, and underscores are common in real email
      // addresses (john_smith@…). The previous version took the first ilike
      // match and UPDATED it, which meant editing a player whose email
      // contained "_" could overwrite a DIFFERENT person's subscriber row.
      // Wildcards can only ever widen the candidate set, never narrow it,
      // so the exact comparison below is what decides which row is touched.
      //
      // This also handles the shared-email case correctly: a parent and
      // child on one address have separate subscriber rows, and matching on
      // all three fields picks the right one.
      try {
        if (!_origFirst || !_origLast || !_origEmail) {
          // Nothing reliable to match on — skip rather than guess. Happens
          // when the player was not in the cache (see _origPlayer above).
          console.warn('[saveEditPlayer] original details unavailable — skipping subscriber sync');
        } else {
          const { data: candidates, error: findErr } = await supabase
            .from('subscribers')
            .select('id,first_name,last_name,email')
            .ilike('email', _origEmail)
            .limit(25);
          if (findErr) throw new Error(findErr.message);

          // _sameSubscriber now normalises accents too, so editing a
          // player whose subscriber row spells the name with a tilde
          // finds it instead of silently skipping the sync.
          const match = (candidates || []).find(s =>
            _sameSubscriber(s, _origFirst, _origLast, _origEmail)
          );

          if (match) {
            const { error: updErr } = await supabase
              .from('subscribers')
              .update({
                first_name:   body.first_name,
                last_name:    body.last_name,
                email:        body.email,
                // Phone was NOT synced here before — editing a player's
                // number left the subscriber holding the old one forever.
                // players is the source of truth, so it overwrites.
                phone:        body.phone,
                country_code: body.country_code,
              })
              .eq('id', match.id);
            if (updErr) throw new Error(updErr.message);
          }
        }
      } catch (e) {
        // Non-critical: the player edit itself already succeeded, so this
        // must not surface as a failure. Logged rather than swallowed —
        // the old empty catch made a recurring sync failure invisible.
        console.warn('[saveEditPlayer] subscriber sync failed:', e.message);
      }

      // Record history if needed. We do this AFTER the player update so
      // we don't end up with an orphan history row if the update fails.
      if (needsHistoryRow) {
        const session = await window.auth.getSession();
        const changedBy = session?.user?.id || null;
        await api('player_status_history', 'POST', {
          player_id: id,
          old_status: originalStatus,
          new_status: newStatus,
          reason: reasonInput,
          changed_by: changedBy,
        });
      }

      toast('Player updated!');
      closeModal();
      // Force a reload so the inline reason preview reflects the new value
      AdminState.allPlayers = [];
      loadPlayers();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };


  // Own these three forms' listeners directly (DOM is already parsed by
  // the time this script runs, same as every other listener).
  document.getElementById('add-player-form')?.addEventListener('submit', addPlayer);
  document.getElementById('edit-player-form')?.addEventListener('submit', saveEditPlayer);
  document.getElementById('player-status-filter')?.addEventListener('change', filterPlayers);
  document.getElementById('player-search')?.addEventListener('input', filterPlayers);

  // ── Expose / register with the shared infrastructure ──────────────────
  window.loadPlayers            = loadPlayers;            // called from the page router
  window.initAddPlayer          = initAddPlayer;           // called from the page router
  window.loadMatchHub           = loadMatchHub;            // called from the page router
  window.updateReasonVisibility = updateReasonVisibility;  // called from app.js's generic input listener
  window.openEdit                = openEdit;               // called directly from admin-player-profile.js's "More" menu

  Object.assign(window.CLICK_HANDLERS, {
    openEdit:           (btn) => openEdit(parseInt(btn.dataset.pid, 10)),
    // openPlayerProfile is registered by admin-player-profile.js (opens the
    // Player Profile page). The old modal version has been removed.
    closeModal:         () => closeModal(),
  });
})();
