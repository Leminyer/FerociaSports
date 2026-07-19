/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: LADDER MANAGEMENT & LADDER PLAYERS MODAL
   Depends on: config.js, db.js, admin-state.js, admin-ladder-selector.js
   Load order: admin-state.js -> admin-ladder-selector.js ->
               admin-ladder-management.js -> app.js

   Extracted from app.js's LADDER MANAGEMENT PAGE + LADDER PLAYERS MODAL
   sections — the ladders list/create/edit/delete admin page, and the
   modal for managing which players belong to a given ladder.

   lopTab / lpRowClick / lpToggleAllNew / lpSegClick were already
   window-scoped in the original code (called from inline HTML built by
   this same file) — kept as-is.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  /* ─── LADDER MANAGEMENT PAGE ───────────────────────────── */

  // ── Ladder ops page state ─────────────────────────────────────────────
  let _lopFilter = 'all';

  const _renderLadderCards = async () => {
    const el = document.getElementById('ladders-list');
    if (!el) return;

    let filtered = AdminState.allLadders.filter(l => {
      if (_lopFilter === 'active') return l.status === 'active';
      if (_lopFilter === 'closed') return l.status !== 'active';
      return true;
    });

    if (!filtered.length) {
      el.innerHTML = `<div class="empty" style="padding:20px;text-align:center;background:white;border-radius:10px;">No ladders found.</div>`;
      return;
    }

    // Fetch matches + ladder_players for intelligence
    let matchStats = {}, _cardLadderPlayers = [], pendingAll = [];
    try {
      const [matches, lp, pending] = await Promise.all([
        api('matches?select=id,ladder_id,player_id,score_for,session_date,points_earned,court_group,game_number,players(first_name,last_name)&order=session_date.desc').catch(() => []),
        api('ladder_players?select=ladder_id,player_id').catch(() => []),
        api('matches?score_for=is.null&default_no_show=is.false&select=ladder_id').catch(() => []),
      ]);
      // Per-ladder stats
      window.dedupeMatches(matches).forEach(m => {
        if (!matchStats[m.ladder_id]) matchStats[m.ladder_id] = { games: 0, sessions: new Set(), pts: {}, names: {} };
        const s = matchStats[m.ladder_id];
        s.games++;
        if (m.session_date) s.sessions.add(m.session_date);
        if (m.score_for !== null && m.points_earned) {
          s.pts[m.player_id] = (s.pts[m.player_id] || 0) + m.points_earned;
        }
        // Store player name
        if (m.players && m.player_id) {
          s.names[m.player_id] = `${m.players.first_name} ${m.players.last_name}`;
        }
      });
      _cardLadderPlayers = lp;
      pendingAll = pending;
    } catch(_) {}

    // Compute player counts per ladder
    const playersByLadder = {};
    _cardLadderPlayers.forEach(lp => {
      playersByLadder[lp.ladder_id] = (playersByLadder[lp.ladder_id] || new Set()).add(lp.player_id);
    });

    // Compute pending per ladder
    const pendingByLadder = {};
    pendingAll.forEach(m => {
      pendingByLadder[m.ladder_id] = (pendingByLadder[m.ladder_id] || 0) + 1;
    });

    // Week progress helper
    const weekProgress = (l) => {
      if (!l.start_date || !l.end_date) return null;
      const start = new Date(l.start_date + 'T00:00:00');
      const end   = new Date(l.end_date   + 'T00:00:00');
      const now   = new Date();
      const total = Math.round((end - start) / 604800000);
      const done  = Math.max(0, Math.round((now - start) / 604800000));
      const pct   = Math.min(100, Math.round((done / (total || 1)) * 100));
      return { done: Math.min(done, total), total: total || 1, pct };
    };

    // Next session day helper (based on end_date weekday as proxy)
    const nextSessionStr = (l) => {
      if (!l.start_date) return null;
      const d = new Date(l.start_date + 'T00:00:00');
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return `Next: ${days[d.getDay()]} session`;
    };

    // SVG icons
    const calSVG  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const clkSVG  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const plrsSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    const editSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const closSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`;
    const reopSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
    const trshSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
    const boltSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F26024" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    const crwnSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a5e00" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
    const trendSVG= `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
    const ovSVG   = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    const plrSVG  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
    const sessSVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const stndSVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M8.56 13.9l-1.56 6.1 5-3 5 3-1.56-6.1"/></svg>`;

    el.innerHTML = filtered.map(l => {
      const isActive  = l.status === 'active';
      const isClosed  = !isActive;
      const stats     = matchStats[l.id] || { games: 0, sessions: new Set(), pts: {} };
      const players   = playersByLadder[l.id] ? playersByLadder[l.id].size : 0;
      const sessions  = stats.sessions.size;
      const games     = stats.games;
      const prog      = weekProgress(l);
      const dateStr   = [
        l.start_date ? fmtDate(l.start_date) : null,
        l.end_date   ? fmtDate(l.end_date)   : null,
      ].filter(Boolean).join(' → ');

      // Top scorer
      const topPid = Object.keys(stats.pts).sort((a,b) => stats.pts[b] - stats.pts[a])[0];
      const topPts = topPid ? stats.pts[topPid] : 0;

      // Recent sessions (last 30 days)
      const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 30);
      const recentSessions = [...stats.sessions].filter(d => new Date(d) >= monthAgo).length;

      // Disabled attr for closed ladders
      const dis = isClosed ? 'disabled' : '';

      return `<div class="lop-card" id="lop-card-${l.id}">
        <!-- Tabs at top -->
        <div class="lop-tabs">
          <button class="lop-tab active" onclick="lopTab(event,'${l.id}','overview')">${ovSVG} Overview</button>
          ${l.ladder_type === 'ftc' ? `
            <button class="lop-tab" onclick="lopTab(event,'${l.id}','ftc-standings')">${stndSVG} Standings</button>
            <button class="lop-tab" onclick="lopTab(event,'${l.id}','ftc-teams')">${plrSVG} Teams</button>
            <button class="lop-tab" onclick="lopTab(event,'${l.id}','ftc-schedule')">${sessSVG} Schedule</button>
            <button class="lop-tab" onclick="lopTab(event,'${l.id}','ftc-playoffs')">${stndSVG} Playoffs</button>
          ` : l.ladder_type === 'rotating_partner' ? `
            <button class="lop-tab" onclick="lopTab(event,'${l.id}','players')">${plrSVG} Players</button>
            <button class="lop-tab" onclick="lopTab(event,'${l.id}','sessions')">${sessSVG} Sessions</button>
            <button class="lop-tab" onclick="lopTab(event,'${l.id}','standings')">${stndSVG} Standings</button>
          ` : ''}
        </div>
        <!-- Card body -->
        <div class="lop-body">
          <!-- LEFT -->
          <div class="lop-left">
            <div class="lop-name">${esc(l.name)}</div>
            <div style="margin-bottom:4px;">
              ${l.ladder_type === 'ftc'
                ? `<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;background:rgba(198,242,33,0.15);color:#3B6D11;border:0.5px solid rgba(198,242,33,0.4);padding:2px 8px;border-radius:99px;">🏆 Ferocia Team Challenge</span>`
                : `<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;background:#e8f0ff;color:#174CCC;border:0.5px solid #c5d6f5;padding:2px 8px;border-radius:99px;">🔄 Rotating Partner</span>`
              }
            </div>
            <div class="lop-status-row">
              <span class="${isActive ? 'lop-active-pill' : 'lop-closed-pill'}">${isActive ? 'Season Active' : 'Closed'}</span>
              ${isActive && l.start_date ? `<span class="lop-next">${clkSVG} ${nextSessionStr(l) || 'Active'}</span>` : ''}
            </div>
            ${dateStr ? `<div class="lop-dates">${calSVG} ${esc(dateStr)}</div>` : ''}
            <div class="lop-stats-row">
              <div><div class="lop-stat-val">${players}</div><div class="lop-stat-lbl">Players</div></div>
              <div><div class="lop-stat-val">${games}</div><div class="lop-stat-lbl">Games</div></div>
              <div><div class="lop-stat-val">${sessions}</div><div class="lop-stat-lbl">Sessions</div></div>
            </div>
            <div style="margin-top:8px;">
              <div class="lop-progress-lbl">
                <span>Season Progress</span>
                <span class="wk">${prog ? `Week ${prog.done} of ${prog.total}` : 'No dates set'}</span>
              </div>
              <div class="lop-bar"><div class="lop-fill" style="width:${prog ? prog.pct : 0}%;"></div></div>
            </div>
          </div>
          <!-- CENTER: Intelligence -->
          <div class="lop-center">
            <div class="lop-intel-title">Competitive Intelligence</div>
            <div class="lop-intel-item">
              <div class="lop-intel-icon" style="background:#fde8d8;">${boltSVG}</div>
              <div>
                <div class="lop-intel-text">${recentSessions} session${recentSessions !== 1 ? 's' : ''} this month</div>
                <div class="lop-intel-sub">${recentSessions > 0 ? 'Ladder is active' : 'No recent activity'}</div>
              </div>
            </div>
            <div class="lop-intel-item">
              <div class="lop-intel-icon" style="background:rgba(198,242,33,0.2);">${crwnSVG}</div>
              <div>
                <div class="lop-intel-text">${topPts > 0 ? esc(stats.names[topPid] || 'Unknown') : 'No scores yet'}</div>
                <div class="lop-intel-sub">${topPts > 0 ? `+${topPts} pts · Season leader` : 'Record first session'}</div>
              </div>
            </div>
            <div class="lop-intel-item">
              <div class="lop-intel-icon" style="background:#d4f5ed;">${trendSVG}</div>
              <div>
                <div class="lop-intel-text">${players} player${players !== 1 ? 's' : ''} enrolled</div>
                <div class="lop-intel-sub">${games} total games played</div>
              </div>
            </div>
          </div>
          <!-- RIGHT: Actions — disabled when closed -->
          <div class="lop-right">
            <div class="lop-action-title">Actions</div>
            <button class="lop-btn" data-action="openLadderPlayers" data-lid="${l.id}" data-lname="${esc(l.name)}" ${dis}>${plrsSVG} Manage Players</button>
            <button class="lop-btn" data-action="openEditLadder" data-lid="${l.id}" ${dis}>${editSVG} Edit Ladder</button>
            <button class="lop-btn warn" data-action="toggleLadderStatus" data-lid="${l.id}" data-lstatus="${esc(l.status)}" ${dis}>${isActive ? closSVG + ' Close Ladder' : reopSVG + ' Reopen Ladder'}</button>
            <button class="lop-btn danger" data-action="deleteLadder" data-lid="${l.id}" data-lname="${esc(l.name)}">${trshSVG} Delete</button>
          </div>
        </div>
      </div>`;
    }).join('');
  };

  // Quick access tab handler
  window.lopTab = async (e, ladderId, tab) => {
    // Update tab styles for this card
    const card = document.getElementById(`lop-card-${ladderId}`);
    if (!card) return;
    card.querySelectorAll('.lop-tab').forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');

    if (tab === 'overview') return; // already showing overview inline

    // Set this ladder as the current one and select it in the sidebar dropdown
    const ladder = AdminState.allLadders.find(l => String(l.id) === String(ladderId));
    if (!ladder) return;
    AdminState.currentLadder = ladder;
    const sel = document.getElementById('ladder-selector');
    if (sel) sel.value = ladderId;
    window.updateLadderBanner();
    await window.loadLadderPlayers(); // ensure AdminState.ladderPlayers is populated

    // Rotating Partner tabs
    if (tab === 'players') {
      window.showPage('ladder', document.getElementById('sb-standings'));
      await window.loadLadder();
    } else if (tab === 'sessions') {
      window.showPage('sessions', document.getElementById('sb-sessions'));
    } else if (tab === 'standings') {
      window.showPage('ladder', document.getElementById('sb-standings'));
      await window.loadLadder();
    // FTC tabs
    } else if (tab === 'ftc-standings') {
      window.showPage('ftc-standings', document.getElementById('sb-ftc-standings'));
    } else if (tab === 'ftc-teams') {
      window.showPage('ftc-teams', document.getElementById('sb-ftc-teams'));
    } else if (tab === 'ftc-schedule') {
      window.showPage('ftc-schedule', document.getElementById('sb-ftc-schedule'));
    } else if (tab === 'ftc-playoffs') {
      window.showPage('ftc-playoffs', document.getElementById('sb-ftc-playoffs'));
    }
  };

  const loadLaddersPage = async () => {
    try {
      const [ladders, _llpRows, pending] = await Promise.all([
        api('ladders?select=*&order=id.desc'),
        api('ladder_players?select=ladder_id,player_id').catch(() => []),
        api('matches?score_for=is.null&default_no_show=is.false&select=ladder_id').catch(() => []),
      ]);
      AdminState.allLadders = ladders;

      // Stat cards
      const active  = ladders.filter(l => l.status === 'active').length;
      const closed  = ladders.filter(l => l.status !== 'active').length;
      // Unique players in active ladders
      const activeLadderIds = new Set(ladders.filter(l => l.status === 'active').map(l => l.id));
      const activePlayers   = new Set(_llpRows.filter(lp => activeLadderIds.has(lp.ladder_id)).map(lp => lp.player_id)).size;
      const pendingCount    = pending.length;

      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('lop-active',  active);
      setEl('lop-closed',  closed);
      setEl('lop-players', activePlayers);
      setEl('lop-pending', pendingCount || '—');

    } catch (e) {
      document.getElementById('ladders-list').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
      return;
    }

    // Wire filter dropdown
    const filterSel = document.getElementById('ladder-status-filter');
    if (filterSel && !filterSel._wired) {
      filterSel._wired = true;
      filterSel.addEventListener('change', () => {
        _lopFilter = filterSel.value;
        _renderLadderCards();
      });
    }

    await _renderLadderCards();
  };

  const createLadder = async (e) => {
    e.preventDefault();
    const name       = document.getElementById('new-ladder-name').value.trim();
    const start      = document.getElementById('new-ladder-start').value || null;
    const end        = document.getElementById('new-ladder-end').value   || null;
    const ladderType = document.getElementById('new-ladder-type')?.value || 'rotating_partner';
    if (!name) {
      toast('Please enter a ladder name.', true);
      return;
    }
    try {
      await api('ladders', 'POST', { name, status: 'active', start_date: start, end_date: end, ladder_type: ladderType });
      toast(`Ladder "${name}" created!`);
      document.getElementById('create-ladder-form').reset();
      // Reset type selector back to default
      selectLadderType('rotating_partner');
      await window.loadLadderSelector();
      await loadLaddersPage();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  const toggleLadderStatus = async (id, current) => {
    const newStatus = current === 'active' ? 'closed' : 'active';
    try {
      await api(`ladders?id=eq.${id}`, 'PATCH', { status: newStatus });
      toast(`Ladder ${newStatus === 'closed' ? 'closed' : 'reopened'}!`);
      await window.loadLadderSelector();
      loadLaddersPage();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  const openEditLadder = (id) => {
    const l = AdminState.allLadders.find((x) => x.id === id);
    if (!l) return;
    document.getElementById('edit-ladder-id').value    = l.id;
    document.getElementById('edit-ladder-name').value  = l.name;
    document.getElementById('edit-ladder-start').value = l.start_date || '';
    document.getElementById('edit-ladder-end').value   = l.end_date   || '';
    // Show ladder type as read-only badge
    const typeEl  = document.getElementById('edit-ladder-type');
    const badgeEl = document.getElementById('edit-ladder-type-badge');
    const typeLabel = l.ladder_type === 'ftc' ? '🏆 Ferocia Team Challenge Ladder' : '🔄 Rotating Partner Ladder';
    if (typeEl)  typeEl.value       = l.ladder_type || 'rotating_partner';
    if (badgeEl) badgeEl.textContent = typeLabel;
    const modal = document.getElementById('edit-ladder-modal');
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  };

  const closeEditLadderModal = () => {
    const modal = document.getElementById('edit-ladder-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  };

  const saveEditLadder = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-ladder-id').value;
    const body = {
      name:       document.getElementById('edit-ladder-name').value.trim(),
      start_date: document.getElementById('edit-ladder-start').value || null,
      end_date:   document.getElementById('edit-ladder-end').value   || null,
    };
    try {
      await api(`ladders?id=eq.${id}`, 'PATCH', body);
      toast('Ladder updated successfully!');
      closeEditLadderModal();
      await window.loadLadderSelector();
      loadLaddersPage();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  const deleteLadder = async (id, name) => {
    const ok = await confirmModal({
      title: 'Delete ladder?',
      message: `Delete ladder "${name}"? This will also delete all sessions and match records linked to it. This cannot be undone.`,
      okLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      // Bulk deletes — one call each table instead of N per ID
      await api(`matches?ladder_id=eq.${id}`, 'DELETE');
      await api(`ladder_players?ladder_id=eq.${id}`, 'DELETE');
      await api(`ladders?id=eq.${id}`, 'DELETE');
      if (AdminState.currentLadder && AdminState.currentLadder.id === id) {
        AdminState.currentLadder = null;
      }
      toast(`Ladder "${name}" deleted.`);
      await window.loadLadderSelector();
      loadLaddersPage();
      window.updateLadderBanner();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  /* ─── LADDER PLAYERS MODAL ─────────────────────────────── */

  const openLadderPlayers = async (ladderId, ladderName) => {
    AdminState.modalLadderId = ladderId;
    const modal = document.getElementById('lp-modal');
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
    const searchEl = document.getElementById('lp-search');
    // Reset gender filter to 'all' on open
    AdminState.lpGenderFilter = 'all';
    ['all','male','female'].forEach(g => {
      const btn = document.getElementById(`lp-filter-${g}`);
      if (!btn) return;
      const active = g === 'all';
      btn.style.background  = active ? '#174CCC' : 'white';
      btn.style.borderColor = active ? '#174CCC' : '#e0e7f5';
      btn.style.color       = active ? 'white'   : '#6b7a99';
    });
    if (searchEl) {
      searchEl.value = '';
      if (!searchEl._lpWired) {
        searchEl._lpWired = true;
        searchEl.addEventListener('input', () => {
          const q = searchEl.value.toLowerCase();
          document.querySelectorAll('.lp-player-row-new').forEach(row => {
            row.style.display = row.dataset.name.includes(q) ? '' : 'none';
          });
        });
      }
    }
    await refreshLadderPlayersModal();
  };

  // Avatar color from name
  const _lpAvColor = (name) => {
    const colors = ['#174CCC','#24BC96','#F26024','#7c3aed','#0891b2','#d97706','#16a34a','#db2777'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  };

  const refreshLadderPlayersModal = async () => {
    const [allP, enrolled] = await Promise.all([
      api('players?select=*&order=first_name'),
      api(`ladder_players?select=ladder_id,player_id,status&ladder_id=eq.${AdminState.modalLadderId}`),
    ]);
    AdminState.allPlayers = allP;
    const enrolledIds  = enrolled.map((r) => Number(r.player_id));
    const activePlayers = AdminState.allPlayers.filter((p) => p.status !== 'inactive');
    const subCount     = enrolled.filter(r => r.status === 'sub').length;

    const listEl = document.getElementById('lp-enrolled');
    listEl.dataset.enrolledIds = enrolledIds.join(',');

    // Update summary pill
    const summaryEl = document.getElementById('lp-summary-text');
    if (summaryEl) summaryEl.textContent = `${enrolledIds.length} enrolled • ${subCount} subs`;

    // Select-all row
    const allChecked = activePlayers.every((p) => enrolledIds.includes(Number(p.id)));
    const checkSVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    const headerHtml = `<div class="lp-select-all-row">
      <div class="lp-cb-box ${allChecked ? 'lp-cb-checked' : ''}" id="lp-cb-all-box" onclick="lpToggleAllNew(this)" style="cursor:pointer;">
        ${allChecked ? checkSVG : ''}
      </div>
      <span style="font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#174CCC;cursor:pointer;flex:1;" onclick="lpToggleAllNew(document.getElementById('lp-cb-all-box'))">Select All</span>
      <span style="font-size:11px;font-weight:700;color:#6b7a99;">${enrolledIds.length} of ${activePlayers.length} enrolled</span>
    </div>`;

    const rowsHtml = activePlayers.map((p) => {
      const isEnrolled   = enrolledIds.includes(Number(p.id));
      const enrolledRow  = enrolled.find((r) => Number(r.player_id) === Number(p.id));
      const ladderStatus = enrolledRow?.status || 'active';
      const fullName     = `${p.first_name} ${p.last_name}`;
      const initials     = `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
      const avColor      = _lpAvColor(fullName);
      const checkSVG     = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

      const segToggle = isEnrolled ? `
        <div class="lp-seg" data-pid="${p.id}">
          <button type="button" class="lp-seg-btn ${ladderStatus === 'active' ? 'lp-seg-active' : ''}"
            onclick="lpSegClick(this,'active',${p.id})">Active</button>
          <button type="button" class="lp-seg-btn ${ladderStatus === 'sub' ? 'lp-seg-sub' : ''}"
            onclick="lpSegClick(this,'sub',${p.id})">Sub</button>
        </div>` : '';

      const gender = (p.gender || '').toLowerCase(); // 'male' or 'female'
      return `<div class="lp-player-row-new ${isEnrolled ? 'lp-selected' : ''}"
          data-name="${esc(fullName.toLowerCase())}" data-pid="${p.id}" data-gender="${esc(gender)}"
          onclick="lpRowClick(event,${p.id})">
        <div class="lp-cb-box ${isEnrolled ? 'lp-cb-checked' : ''}" data-pid="${p.id}" style="pointer-events:none;">
          ${isEnrolled ? checkSVG : ''}
        </div>
        <div class="lp-av" style="background:${avColor};">${esc(initials)}</div>
        <div class="lp-pname ${isEnrolled ? '' : 'lp-unenrolled'}">${esc(fullName)}</div>
        ${segToggle}
      </div>`;
    }).join('');

    listEl.innerHTML = headerHtml + rowsHtml;
  };

  // Toggle single row on click (but not if clicking seg button)
  window.lpRowClick = (e, pid) => {
    if (e.target.closest('.lp-seg')) return; // ignore seg clicks
    const row = e.currentTarget;
    const cb  = row.querySelector('.lp-cb-box');
    const isChecked = cb.classList.contains('lp-cb-checked');
    const checkSVG  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    if (isChecked) {
      cb.classList.remove('lp-cb-checked');
      cb.innerHTML = '';
      row.classList.remove('lp-selected');
      // Remove seg toggle
      const seg = row.querySelector('.lp-seg');
      if (seg) seg.remove();
    } else {
      cb.classList.add('lp-cb-checked');
      cb.innerHTML = checkSVG;
      row.classList.add('lp-selected');
      // Add seg toggle (default active)
      const pname = row.querySelector('.lp-pname');
      if (pname) pname.classList.remove('lp-unenrolled');
      const seg = document.createElement('div');
      seg.className = 'lp-seg';
      seg.dataset.pid = pid;
      seg.innerHTML = `<button type="button" class="lp-seg-btn lp-seg-active" onclick="lpSegClick(this,'active',${pid})">Active</button><button type="button" class="lp-seg-btn" onclick="lpSegClick(this,'sub',${pid})">Sub</button>`;
      row.appendChild(seg);
    }
  };

  // Toggle All
  window.lpToggleAllNew = (boxEl) => {
    const isChecked = boxEl.classList.contains('lp-cb-checked');
    const checkSVG  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    if (isChecked) {
      // Deselect all
      boxEl.classList.remove('lp-cb-checked');
      boxEl.innerHTML = '';
      document.querySelectorAll('.lp-player-row-new').forEach(row => {
        row.classList.remove('lp-selected');
        const cb = row.querySelector('.lp-cb-box');
        if (cb) { cb.classList.remove('lp-cb-checked'); cb.innerHTML = ''; }
        const seg = row.querySelector('.lp-seg');
        if (seg) seg.remove();
        const pname = row.querySelector('.lp-pname');
        if (pname) pname.classList.add('lp-unenrolled');
      });
    } else {
      // Select all
      boxEl.classList.add('lp-cb-checked');
      boxEl.innerHTML = checkSVG;
      document.querySelectorAll('.lp-player-row-new').forEach(row => {
        const pid = row.dataset.pid;
        if (!row.classList.contains('lp-selected')) {
          row.classList.add('lp-selected');
          const cb = row.querySelector('.lp-cb-box');
          if (cb) { cb.classList.add('lp-cb-checked'); cb.innerHTML = checkSVG; }
          const pname = row.querySelector('.lp-pname');
          if (pname) pname.classList.remove('lp-unenrolled');
          if (!row.querySelector('.lp-seg')) {
            const seg = document.createElement('div');
            seg.className = 'lp-seg';
            seg.dataset.pid = pid;
            seg.innerHTML = `<button type="button" class="lp-seg-btn lp-seg-active" onclick="lpSegClick(this,'active',${pid})">Active</button><button type="button" class="lp-seg-btn" onclick="lpSegClick(this,'sub',${pid})">Sub</button>`;
            row.appendChild(seg);
          }
        }
      });
    }
  };

  // Segmented status pill click
  window.lpSegClick = (btn, newStatus, pid) => {
    // UI only — no DB save. Status is saved when Update Participants is clicked.
    const seg = btn.closest('.lp-seg');
    if (!seg) return;
    seg.querySelectorAll('.lp-seg-btn').forEach(b => {
      b.classList.remove('lp-seg-active', 'lp-seg-sub');
    });
    btn.classList.add(newStatus === 'active' ? 'lp-seg-active' : 'lp-seg-sub');
  };;

  const lpChangeStatus = async (sel) => { /* now handled by lpSegClick */ };

  const lpSaveChanges = async () => {
    const listEl = document.getElementById('lp-enrolled');
    const prevEnrolledIds = (listEl.dataset.enrolledIds || '')
      .split(',').filter(Boolean).map(Number);

    // Read currently selected rows (new UI — use lp-selected class)
    const nowCheckedIds = [...document.querySelectorAll('.lp-player-row-new.lp-selected')]
      .map(row => parseInt(row.dataset.pid, 10)).filter(Boolean);

    const toAdd    = nowCheckedIds.filter(id => !prevEnrolledIds.includes(id));
    const toRemove = prevEnrolledIds.filter(id => !nowCheckedIds.includes(id));

    // Still proceed even if only status changed (no enrollment changes)
    // Only bail if nothing at all is selected
    if (!nowCheckedIds.length && !prevEnrolledIds.length) {
      toast('No participants selected.');
      return;
    }
    const saveBtn = document.getElementById('lp-save-btn');
    const origHTML = saveBtn?.innerHTML;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Saving...'; }

    // Helper: read seg pill status from row
    const getSegStatus = (pid) => {
      const row = document.querySelector(`.lp-player-row-new[data-pid="${pid}"]`);
      if (!row) return 'active';
      return row.querySelector('.lp-seg-btn.lp-seg-sub') ? 'sub' : 'active';
    };

    try {
      // 1. Add newly enrolled players with their chosen status
      if (toAdd.length) {
        await api('ladder_players', 'POST',
          toAdd.map(pid => ({
            ladder_id: parseInt(AdminState.modalLadderId, 10),
            player_id: pid,
            status:    getSegStatus(pid),
          }))
        );
      }

      // 2. Remove de-enrolled players
      if (toRemove.length) {
        await api(
          `ladder_players?ladder_id=eq.${AdminState.modalLadderId}&player_id=in.(${toRemove.join(',')})`,
          'DELETE'
        );
      }

      // 3. Update status for players that stayed enrolled but changed status
      const stayedIds = nowCheckedIds.filter(id => prevEnrolledIds.includes(id));
      const statusUpdates = stayedIds.map(pid => ({
        pid,
        status: getSegStatus(pid),
      }));
      for (const { pid, status } of statusUpdates) {
        await api(
          `ladder_players?ladder_id=eq.${AdminState.modalLadderId}&player_id=eq.${pid}`,
          'PATCH',
          { status }
        );
      }

      const changes = toAdd.length + toRemove.length;
      toast(changes > 0
        ? `Participants updated! ${toAdd.length} added, ${toRemove.length} removed.`
        : 'Participant statuses saved successfully.'
      );
      await window.loadLadderPlayers();
      closeLpModal();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = origHTML; }
    }
  };

  const lpToggleAll = (btn) => { /* replaced by lpToggleAllNew */ };

  const closeLpModal = () => {
    const modal = document.getElementById('lp-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  };


  // Own these two forms' submit listeners directly (DOM is already parsed
  // by the time this script runs, same as every other listener).
  document.getElementById('create-ladder-form')?.addEventListener('submit', createLadder);
  document.querySelector('#edit-ladder-modal form')?.addEventListener('submit', saveEditLadder);

  // ── Expose / register with the shared infrastructure ──────────────────
  window.loadLaddersPage = loadLaddersPage; // called from the page router
  window.lpChangeStatus  = lpChangeStatus;  // legacy stub, called from app.js's generic click listener

  Object.assign(window.CLICK_HANDLERS, {
    openLadderPlayers:   (btn) => openLadderPlayers(parseInt(btn.dataset.lid, 10), btn.dataset.lname),
    openEditLadder:       (btn) => openEditLadder(parseInt(btn.dataset.lid, 10)),
    toggleLadderStatus:   (btn) => toggleLadderStatus(parseInt(btn.dataset.lid, 10), btn.dataset.lstatus),
    deleteLadder:         (btn) => deleteLadder(parseInt(btn.dataset.lid, 10), btn.dataset.lname),
    closeEditLadderModal: () => closeEditLadderModal(),
    lpToggleAll:          (btn) => lpToggleAll(btn),
    lpSaveChanges:        () => lpSaveChanges(),
    closeLpModal:         () => closeLpModal(),
  });
})();
