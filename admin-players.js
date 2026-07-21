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
          <td colspan="7">
            <div class="player-expand-panel">
              <div class="player-expand-field">
                <div class="player-expand-label">Email</div>
                ${p.email ? `<div class="player-expand-value">${esc(p.email)}</div>` : `<div class="player-expand-empty">Not registered</div>`}
              </div>
              <div class="player-expand-div"></div>
              <div class="player-expand-field">
                <div class="player-expand-label">Phone</div>
                ${p.phone ? `<div class="player-expand-value">${esc(p.phone)}</div>` : `<div class="player-expand-empty">Not registered</div>`}
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
      const nameMatch = (`${p.first_name} ${p.last_name} ${p.email || ''} ${p.phone || ''}`).toLowerCase().includes(q);
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
    const phone  = (document.getElementById('p-phone')?.value || '').trim();
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

  const initAddPlayer = () => {
    const form = document.getElementById('add-player-form');
    if (form) form.reset();
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

    const saveBtn = document.getElementById('add-player-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Saving...'; }

    try {
      // Hard duplicate check on submit (by name + email if provided)
      let dupQuery = `players?first_name=ilike.${encodeURIComponent(firstName)}&last_name=ilike.${encodeURIComponent(lastName)}&select=id&limit=1`;
      const duplicate = await api(dupQuery);
      if (duplicate.length) {
        toast(`A player named ${firstName} ${lastName} already exists in the system.`, true);
        return;
      }

      const body = {
        first_name: firstName,
        last_name:  lastName,
        email:      email || null,
        phone:      document.getElementById('p-phone').value.trim() || null,
        gender:     document.getElementById('p-gender').value || null,
        skill_level:document.getElementById('p-skill').value || null,
        status:     document.getElementById('p-status').value,
        date_joined:document.getElementById('p-joined').value || null,
        current_rank: 999,
      };

      await api('players', 'POST', body);

      // Auto-subscribe: save to subscribers table if email provided and not already subscribed
      if (email) {
        try {
          const existingSub = await api(`subscribers?email=ilike.${encodeURIComponent(email)}&first_name=ilike.${encodeURIComponent(firstName)}&last_name=ilike.${encodeURIComponent(lastName)}&select=id&limit=1`);
          if (!existingSub.length) {
            await api('subscribers', 'POST', {
              first_name:    firstName,
              last_name:     lastName,
              email:         email,
              phone:         body.phone || null,
              skill_level:   body.skill_level || null,
              status:        'active',
              subscribed_at: new Date().toISOString(),
            });
          }
        } catch (_) {
          // Non-critical — player was saved, subscriber insert failed silently
        }
      }

      toast(`${body.first_name} ${body.last_name} added successfully!`);
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
  window.openLogMatchModal = () => {
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
      const sel = document.getElementById(id);
      if (sel) sel.value = '';
    });
    lmPopulateSelects();

    // Open modal
    document.getElementById('log-match-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
    lmUpdatePreview();
  };

  window.closeLogMatchModal = () => {
    document.getElementById('log-match-modal').classList.remove('open');
    document.body.style.overflow = '';
  };

  const lmPopulateSelects = () => {
    // Gender filter based on match type
    const genderFilter = (selId) => {
      if (_lmType === 'mens')   return 'Male';
      if (_lmType === 'womens') return 'Female';
      if (_lmType === 'mixed') {
        // P1 slots: no restriction; P2 slots: opposite of P1
        return null; // all players, mixed validation on save
      }
      return null; // singles — all players
    };

    const isP2 = (id) => id === 'lm-a-p2' || id === 'lm-b-p2';

    LM_SEL_IDS.forEach(selId => {
      const sel = document.getElementById(selId);
      if (!sel) return;
      const curVal = sel.value;

      // Disable P2 fields for singles
      if (_lmType === 'singles' && isP2(selId)) {
        sel.disabled = true;
        sel.value = '';
        return;
      } else {
        sel.disabled = false;
      }

      // Determine gender filter for this select
      let gFilter = null;
      if (_lmType === 'mens')   gFilter = 'Male';
      if (_lmType === 'womens') gFilter = 'Female';

      sel.innerHTML = '<option value="">Select player...</option>';
      (AdminState.allPlayers || [])
        .filter(p => p.status === 'active' && (!gFilter || p.gender === gFilter))
        .sort((a,b) => a.first_name.localeCompare(b.first_name))
        .forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.first_name} ${p.last_name}`;
          sel.appendChild(opt);
        });
      // Restore previous value only if still valid
      if (curVal && sel.querySelector(`option[value="${curVal}"]`)) sel.value = curVal;
    });
    lmSyncSelects();
  };

  window.lmSyncSelects = () => {
    const selected = {};
    LM_SEL_IDS.forEach(id => {
      const val = document.getElementById(id)?.value;
      if (val) selected[val] = id;
    });
    LM_SEL_IDS.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const curVal = sel.value;
      Array.from(sel.options).forEach(opt => {
        if (!opt.value) return;
        const takenBy = selected[opt.value];
        opt.disabled  = takenBy && takenBy !== id;
        opt.textContent = opt.disabled
          ? (AdminState.allPlayers.find(p => p.id == opt.value)?.first_name || opt.value) + ' (selected)'
          : (AdminState.allPlayers.find(p => String(p.id) === opt.value)
              ? `${AdminState.allPlayers.find(p => String(p.id) === opt.value).first_name} ${AdminState.allPlayers.find(p => String(p.id) === opt.value).last_name}`
              : opt.textContent.replace(' (selected)',''));
      });
      sel.value = curVal;
    });
    lmUpdatePreview();
  };

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
    lmPopulateSelects();
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

    // Fix 5: Mixed doubles validation — each team needs 1M + 1F
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

  // ── Download CSV template ──────────────────────────────────────────────
  window.importDownloadTemplate = () => {
    const csv = 'first_name,last_name,email,phone,gender\nJohn,Smith,john@email.com,561-555-1234,Male\nJane,Doe,jane@email.com,954-555-5678,Female';
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
    document.getElementById('import-preview-area').style.display = 'none';
    document.getElementById('import-file-input').value = '';
  };

  // ── Parse and validate CSV ─────────────────────────────────────────────
  window.importHandleFile = async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv')) { toast('Please upload a CSV file.', true); return; }

    // Ensure players are loaded for dedup check
    if (!AdminState.allPlayers.length) {
      try { AdminState.allPlayers = await api('players?select=first_name,last_name,email&order=id'); } catch(_) {}
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast('CSV file is empty or has no data rows.', true); return; }

    // Parse header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g,''));
    const colIdx = {
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
        gender:     get(colIdx.gender),
        date_joined: today,
        status:     'active',
        _state:     'new', // new | duplicate | error
        _errors:    [],
      };

      // Validate required fields
      if (!row.first_name) row._errors.push('Missing first name');
      if (!row.last_name)  row._errors.push('Missing last name');
      if (!row.email)      row._errors.push('Missing email');
      else if (!emailRegex.test(row.email)) row._errors.push('Invalid email format');
      if (row.gender && !['male','female'].includes(row.gender.toLowerCase())) {
        row._errors.push('Gender must be Male or Female');
      } else if (row.gender) {
        // Normalize capitalization
        row.gender = row.gender.charAt(0).toUpperCase() + row.gender.slice(1).toLowerCase();
      }

      if (row._errors.length) { row._state = 'error'; return row; }

      // Dedup check: all 3 must match (case-insensitive)
      const isDup = AdminState.allPlayers.some(p =>
        p.first_name?.toLowerCase() === row.first_name.toLowerCase() &&
        p.last_name?.toLowerCase()  === row.last_name.toLowerCase()  &&
        p.email?.toLowerCase()      === row.email.toLowerCase()
      );
      if (isDup) { row._state = 'duplicate'; return row; }

      return row;
    }).filter(r => r.first_name || r.last_name || r.email); // skip completely empty rows

    importRenderPreview();
  };

  // ── Render preview table ───────────────────────────────────────────────
  const importRenderPreview = () => {
    const newRows  = _importRows.filter(r => r._state === 'new');
    const dupRows  = _importRows.filter(r => r._state === 'duplicate');
    const errRows  = _importRows.filter(r => r._state === 'error');

    // Summary cards
    document.getElementById('import-summary').innerHTML = `
      <div class="import-sum-card" style="background:rgba(36,188,150,0.04);border-color:rgba(36,188,150,0.2);">
        <div class="import-sum-val" style="color:var(--teal);">${newRows.length}</div>
        <div class="import-sum-lbl">Ready to Import</div>
      </div>
      <div class="import-sum-card" style="background:#fff8e6;border-color:#f5d78e;">
        <div class="import-sum-val" style="color:#9a6200;">${dupRows.length}</div>
        <div class="import-sum-lbl">Duplicates (skipped)</div>
      </div>
      <div class="import-sum-card" style="background:#fee2e2;border-color:#fca5a5;">
        <div class="import-sum-val" style="color:#e53935;">${errRows.length}</div>
        <div class="import-sum-lbl">Errors (skipped)</div>
      </div>`;

    // Table rows — show all, color-coded
    document.getElementById('import-table-body').innerHTML = _importRows.map(r => {
      const badge = r._state === 'new'
        ? '<span class="import-badge import-b-new">✓ New</span>'
        : r._state === 'duplicate'
          ? '<span class="import-badge import-b-dup">⚠ Duplicate</span>'
          : `<span class="import-badge import-b-err" title="${esc(r._errors.join(', '))}">✕ Error</span>`;
      const rowStyle = r._state === 'error' ? 'background:#fff8f8;' : r._state === 'duplicate' ? 'background:#fffdf0;' : '';
      return `<tr style="${rowStyle}">
        <td style="color:var(--text-muted);">${r.rowNum}</td>
        <td>${esc(r.first_name)}</td>
        <td>${esc(r.last_name)}</td>
        <td>${esc(r.email)}</td>
        <td>${esc(r.phone||'—')}</td>
        <td>${esc(r.gender||'—')}</td>
        <td>${badge}</td>
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

    for (const row of toInsert) {
      try {
        const playerBody = {
          first_name:  row.first_name,
          last_name:   row.last_name,
          email:       row.email,
          phone:       row.phone || null,
          gender:      row.gender || null,
          date_joined: row.date_joined,
          status:      'active',
        };
        const [newPlayer] = await api('players', 'POST', playerBody);

        // Sync to subscribers
        if (newPlayer?.id) {
          try {
            await api('subscribers', 'POST', {
              first_name: row.first_name,
              last_name:  row.last_name,
              email:      row.email,
              status:     'active',
            });
          } catch(_) {}
        }
        successCount++;
      } catch(e) {
        failCount++;
      }
    }

    // Reload players cache
    try { AdminState.allPlayers = await api('players?select=*&order=first_name'); } catch(_) {}

    toast(`✓ ${successCount} player${successCount !== 1 ? 's' : ''} imported successfully${failCount ? ` · ${failCount} failed` : ''}.`);
    importReset();
    if (typeof loadPlayers === 'function') loadPlayers();
  };

  const openEdit = async (id) => {
    const p = AdminState.allPlayers.find((x) => x.id === id);
    if (!p) return;
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-original-status').value = p.status || 'active';
    document.getElementById('edit-first').value = p.first_name;
    document.getElementById('edit-last').value = p.last_name;
    document.getElementById('edit-email').value = p.email || '';
    document.getElementById('edit-phone').value = p.phone || '';
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

    const body = {
      first_name: document.getElementById('edit-first').value.trim(),
      last_name: document.getElementById('edit-last').value.trim(),
      email: editEmail,
      phone: document.getElementById('edit-phone').value.trim() || null,
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

      // Sync subscriber record if exists — match by original name + email
      try {
        const { data: matchingSubs } = await supabase
          .from('subscribers')
          .select('id')
          .ilike('first_name', _origFirst)
          .ilike('last_name',  _origLast)
          .ilike('email',      _origEmail)
          .limit(1);
        if (matchingSubs && matchingSubs.length) {
          await supabase
            .from('subscribers')
            .update({ first_name: body.first_name, last_name: body.last_name, email: body.email })
            .eq('id', matchingSubs[0].id);
        }
      } catch(_e) {}

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
