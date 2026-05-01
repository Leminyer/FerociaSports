/* ============================================================
   FEROCIA SPORTS CENTER — MAIN APP (admin index.html)
   Depends on: config.js, db.js, assets.js, app.css, tournament.css
   Globals provided: api, escapeHtml/esc, fmtDate, sleep, todayISO,
                     toast, confirmModal, FEROCIA_CONFIG
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before app.js');
    return;
  }

  /* ─── STATE ────────────────────────────────────────────── */

  let allPlayers = [];
  let allLadders = [];
  let currentLadder = null;
  let ladderPlayers = [];
  let courtPlayers = [];
  let noShowPlayer = null;
  let noShowPenalty = -4;
  let gameCount = 0;
  let extraGameCount = 0;
  let extraGames = [];
  let modalLadderId = null;
  let currentTournamentId = null; // used by the read-only tournament selector

  /* ─── NAVIGATION ───────────────────────────────────────── */

  const goHome = () => {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.getElementById('page-home').classList.add('active');
    document.getElementById('subnav-programs').style.display = 'none';
    document.getElementById('subnav-management').style.display = 'none';
    document.getElementById('subnav-ladder-options').style.display = 'none';
    document.getElementById('subnav-tournament-options').style.display = 'none';
    document.getElementById('tab-home').classList.add('active');
  };

  const switchMainTab = (tab) => {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.getElementById('tab-home').classList.remove('active');

    const ladderOpts = document.getElementById('subnav-ladder-options');
    const tournOpts = document.getElementById('subnav-tournament-options');

    if (tab === 'programs') {
      document.getElementById('subnav-programs').style.display = 'flex';
      document.getElementById('subnav-management').style.display = 'none';
      if (ladderOpts) ladderOpts.style.display = 'none';
      if (tournOpts) tournOpts.style.display = 'none';
      document.getElementById('prog-tab-ladder').classList.remove('active');
      document.getElementById('prog-tab-tournament').classList.remove('active');
      document.getElementById('page-programs-home').classList.add('active');
    } else if (tab === 'management') {
      document.getElementById('subnav-programs').style.display = 'none';
      document.getElementById('subnav-management').style.display = 'flex';
      if (ladderOpts) ladderOpts.style.display = 'none';
      if (tournOpts) tournOpts.style.display = 'none';
      const activeBtn = document.querySelector('#subnav-management button.active');
      if (activeBtn) showPage(activeBtn.dataset.page, activeBtn);
      else showPage('players', document.querySelector('#subnav-management button'));
    }
  };

  const switchProgramTab = (tab) => {
    const ladderOpts = document.getElementById('subnav-ladder-options');
    const tournOpts = document.getElementById('subnav-tournament-options');
    document.getElementById('page-programs-home').classList.remove('active');
    document.getElementById('prog-tab-ladder').classList.toggle('active', tab === 'ladder');
    document.getElementById('prog-tab-tournament').classList.toggle('active', tab === 'tournament');
    ladderOpts.style.display = tab === 'ladder' ? 'flex' : 'none';
    tournOpts.style.display = tab === 'tournament' ? 'flex' : 'none';
    if (tab === 'ladder') {
      const standingsBtn = document.querySelector('#subnav-ladder-options button[data-page="ladder"]');
      loadLadderSelector().then(() => {
        if (currentLadder) showPage('ladder', standingsBtn);
        else document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
      });
    } else {
      loadTournamentSelector();
      const tvBtn = document.querySelector('#subnav-tournament-options button[data-page="tournament-view"]');
      showPage('tournament-view', tvBtn);
    }
  };

  const loadTournamentSelector = async () => {
    const sel = document.getElementById('tournament-selector');
    if (!sel) return;
    try {
      const tournaments = await api('tournaments?select=*&order=id.desc');
      sel.innerHTML =
        '<option value="">-- Select a tournament --</option>' +
        tournaments
          .map(
            (t) =>
              `<option value="${t.id}">${esc(t.name)}${t.status === 'completed' ? ' (completed)' : ''}</option>`,
          )
          .join('');
    } catch (e) {
      toast(`Error loading tournaments: ${e.message}`, true);
    }
  };

  const onTournamentChange = async () => {
    const tid = document.getElementById('tournament-selector').value;
    const el = document.getElementById('tournament-view-content');
    if (!tid) {
      el.innerHTML = '<div class="empty">Select a tournament to view details.</div>';
      return;
    }
    currentTournamentId = parseInt(tid, 10);
    await renderTournamentViewReadOnly();
  };

  const renderTournamentViewReadOnly = async () => {
    const el = document.getElementById('tournament-view-content');
    if (!currentTournamentId) {
      el.innerHTML = '<div class="empty">Select a tournament to view details.</div>';
      return;
    }
    el.innerHTML = '<div class="loading">Loading tournament...</div>';
    try {
      const [tArr, categories] = await Promise.all([
        api(`tournaments?id=eq.${currentTournamentId}&select=*`),
        api(`tournament_categories?tournament_id=eq.${currentTournamentId}&select=*&order=id`),
      ]);
      const t = tArr[0];
      if (!t) {
        el.innerHTML = '<div class="empty">Tournament not found.</div>';
        return;
      }
      const dateStr = t.date
        ? fmtDate(t.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : 'No date set';
      el.innerHTML = `
        <div class="card">
          <div class="text-bolder" style="font-size:18px;">${esc(t.name)}</div>
          <div class="text-muted-sm mt-4">${dateStr}</div>
          <div class="text-muted-13 mt-12">
            ${categories.length} categor${categories.length !== 1 ? 'ies' : 'y'}: ${categories.map((c) => esc(c.name)).join(' · ')}
          </div>
          <div class="bg-pale color-blue mt-16 text-bold" style="padding:14px;border-radius:var(--radius-sm);font-size:13px;">
            To manage this tournament go to <strong>Management → Tournaments</strong>
          </div>
        </div>`;
    } catch (e) {
      el.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
    }
  };

  const showPage = (name, btn) => {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document
      .querySelectorAll('.sub-nav:not([style*="display:none"]):not([style*="display: none"]) button')
      .forEach((b) => b.classList.remove('active'));
    document.getElementById(`page-${name}`).classList.add('active');
    if (btn) btn.classList.add('active');
    if (name === 'ladder') loadLadder();
    if (name === 'sessions') loadSessions();
    if (name === 'players') loadPlayers();
    if (name === 'entry') initEntry();
    if (name === 'ladders') loadLaddersPage();
    if (name === 'add-player') initAddPlayer();
    if (name === 'share') loadSharePage();
    if (name === 'promotions' && typeof loadPromotionsPage !== 'undefined') loadPromotionsPage();
    if (name === 't-tournaments' && typeof loadTournamentModule !== 'undefined') loadTournamentModule();
    // Management pages: ensure correct subnav is visible
    const mgmtPages = ['players', 'add-player', 'ladders', 't-tournaments', 'promotions', 'share'];
    if (mgmtPages.includes(name)) {
      document.getElementById('subnav-management').style.display = 'flex';
      document.getElementById('subnav-programs').style.display = 'none';
      document.getElementById('subnav-ladder-options').style.display = 'none';
      document.getElementById('subnav-tournament-options').style.display = 'none';
      document.getElementById('page-home').classList.remove('active');
      document.getElementById('page-programs-home').classList.remove('active');
      document.getElementById('tab-home').classList.remove('active');
    }
    if (name === 'tournament-view') {
      const el = document.getElementById('tournament-view-content');
      if (el && !currentTournamentId) {
        el.innerHTML = '<div class="empty">Select a tournament from the dropdown above.</div>';
      }
    }
  };

  /* ─── LADDER SELECTOR ──────────────────────────────────── */

  const loadLadderSelector = async () => {
    try {
      allLadders = await api('ladders?select=*&order=id.desc');
    } catch (e) {
      toast(`Error loading ladders: ${e.message}`, true);
      return;
    }
    const sel = document.getElementById('ladder-selector');
    if (!sel) return;
    if (!allLadders.length) {
      sel.innerHTML = '<option value="">-- No ladders yet --</option>';
      currentLadder = null;
      return;
    }
    sel.innerHTML =
      '<option value="">-- Select a ladder --</option>' +
      allLadders
        .map(
          (l) =>
            `<option value="${l.id}">${esc(l.name)}${l.status === 'closed' ? ' (closed)' : ''}</option>`,
        )
        .join('');
    sel.value = '';
    currentLadder = null;
  };

  const onLadderChange = async () => {
    const id = parseInt(document.getElementById('ladder-selector').value, 10);
    currentLadder = allLadders.find((l) => l.id === id) || null;
    updateLadderBanner();
    await loadLadderPlayers();
    document.getElementById('page-home').classList.remove('active');
    document.getElementById('page-programs-home').classList.remove('active');
    document.getElementById('tab-home').classList.remove('active');
    document.getElementById('subnav-programs').style.display = 'flex';
    document.getElementById('subnav-management').style.display = 'none';
    document.getElementById('prog-tab-ladder').classList.add('active');
    document.getElementById('prog-tab-tournament').classList.remove('active');
    document.getElementById('subnav-ladder-options').style.display = 'flex';
    document.getElementById('subnav-tournament-options').style.display = 'none';
    const standingsBtn = document.querySelector('#subnav-ladder-options button[data-page="ladder"]');
    showPage('ladder', standingsBtn);
  };

  const updateLadderBanner = () => {
    const ladderPages = ['ladder', 'sessions', 'entry'];
    const ladderNavBtns = document.querySelectorAll('#subnav-ladder-options button[data-page]');
    if (!currentLadder) {
      ladderNavBtns.forEach((b) => {
        if (ladderPages.includes(b.dataset.page)) b.disabled = true;
      });
      ladderPages.forEach((p) => {
        const el = document.getElementById(`page-${p}`);
        if (el) el.classList.add('page-disabled');
      });
      return;
    }
    ladderNavBtns.forEach((b) => (b.disabled = false));
    ladderPages.forEach((p) => {
      const el = document.getElementById(`page-${p}`);
      if (el) el.classList.remove('page-disabled');
    });
  };

  const loadLadderPlayers = async () => {
    if (!currentLadder) {
      ladderPlayers = [];
      return;
    }
    try {
      const rows = await api(
        `ladder_players?select=*,players(*)&ladder_id=eq.${currentLadder.id}`,
      );
      ladderPlayers = rows
        .filter((r) => r.players)
        .map((r) => ({ ...r.players, ladder_status: r.status || 'active' }));
    } catch (e) {
      toast(`Error loading ladder players: ${e.message}`, true);
      ladderPlayers = [];
    }
  };

  /* ─── LADDER MANAGEMENT PAGE ───────────────────────────── */

  const loadLaddersPage = async () => {
    try {
      allLadders = await api('ladders?select=*&order=id.desc');
    } catch (e) {
      document.getElementById('ladders-list').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
      return;
    }
    const el = document.getElementById('ladders-list');
    if (!allLadders.length) {
      el.innerHTML = '<div class="empty">No ladders yet. Create your first one!</div>';
      return;
    }
    el.innerHTML = allLadders
      .map((l) => {
        const dates =
          (l.start_date ? `Started: ${fmtDate(l.start_date)}` : 'No start date') +
          (l.end_date ? ` · Ends: ${fmtDate(l.end_date)}` : '');
        return `
          <div class="list-row-flex">
            <div>
              <div class="text-bold text-14">${esc(l.name)}</div>
              <div class="text-muted-12 mt-4">${dates}</div>
            </div>
            <div class="row-wrap">
              <span class="badge badge-${l.status === 'active' ? 'active' : 'inactive'}">${esc(l.status)}</span>
              <button class="btn btn-outline btn-sm" data-action="openLadderPlayers" data-lid="${l.id}" data-lname="${esc(l.name)}">Players</button>
              <button class="btn btn-outline btn-sm" data-action="openEditLadder" data-lid="${l.id}">Edit</button>
              <button class="btn btn-outline btn-sm" data-action="toggleLadderStatus" data-lid="${l.id}" data-lstatus="${esc(l.status)}">${l.status === 'active' ? 'Close' : 'Reopen'}</button>
              <button class="btn btn-danger btn-sm" data-action="deleteLadder" data-lid="${l.id}" data-lname="${esc(l.name)}">Delete</button>
            </div>
          </div>`;
      })
      .join('');
  };

  const createLadder = async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-ladder-name').value.trim();
    const start = document.getElementById('new-ladder-start').value || null;
    const end = document.getElementById('new-ladder-end').value || null;
    if (!name) {
      toast('Please enter a ladder name.', true);
      return;
    }
    try {
      await api('ladders', 'POST', { name, status: 'active', start_date: start, end_date: end });
      toast(`Ladder "${name}" created!`);
      document.getElementById('create-ladder-form').reset();
      await loadLadderSelector();
      loadLaddersPage();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  const toggleLadderStatus = async (id, current) => {
    const newStatus = current === 'active' ? 'closed' : 'active';
    try {
      await api(`ladders?id=eq.${id}`, 'PATCH', { status: newStatus });
      toast(`Ladder ${newStatus === 'closed' ? 'closed' : 'reopened'}!`);
      await loadLadderSelector();
      loadLaddersPage();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  const openEditLadder = (id) => {
    const l = allLadders.find((x) => x.id === id);
    if (!l) return;
    document.getElementById('edit-ladder-id').value = l.id;
    document.getElementById('edit-ladder-name').value = l.name;
    document.getElementById('edit-ladder-start').value = l.start_date || '';
    document.getElementById('edit-ladder-end').value = l.end_date || '';
    document.getElementById('edit-ladder-status').value = l.status || 'active';
    document.getElementById('edit-ladder-modal').classList.add('open');
  };

  const closeEditLadderModal = () =>
    document.getElementById('edit-ladder-modal').classList.remove('open');

  const saveEditLadder = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-ladder-id').value;
    const body = {
      name: document.getElementById('edit-ladder-name').value.trim(),
      start_date: document.getElementById('edit-ladder-start').value || null,
      end_date: document.getElementById('edit-ladder-end').value || null,
      status: document.getElementById('edit-ladder-status').value,
    };
    try {
      await api(`ladders?id=eq.${id}`, 'PATCH', body);
      toast('Ladder updated!');
      closeEditLadderModal();
      await loadLadderSelector();
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
      if (currentLadder && currentLadder.id === id) currentLadder = null;
      toast(`Ladder "${name}" deleted.`);
      await loadLadderSelector();
      loadLaddersPage();
      updateLadderBanner();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  /* ─── LADDER PLAYERS MODAL ─────────────────────────────── */

  const openLadderPlayers = async (ladderId, ladderName) => {
    modalLadderId = ladderId;
    document.getElementById('lp-modal-title').textContent = `Players — ${ladderName}`;
    document.getElementById('lp-modal').classList.add('open');
    const searchEl = document.getElementById('lp-search');
    if (searchEl) searchEl.value = '';
    await refreshLadderPlayersModal();
  };

  const refreshLadderPlayersModal = async () => {
    const [allP, enrolled] = await Promise.all([
      api('players?select=*&order=first_name'),
      api(`ladder_players?select=ladder_id,player_id,status&ladder_id=eq.${modalLadderId}`),
    ]);
    allPlayers = allP;
    const enrolledIds = enrolled.map((r) => Number(r.player_id));
    const activePlayers = allPlayers.filter((p) => p.status !== 'inactive');

    const listEl = document.getElementById('lp-enrolled');
    const allChecked = activePlayers.every((p) => enrolledIds.includes(Number(p.id)));
    listEl.dataset.enrolledIds = enrolledIds.join(',');

    const headerHtml = `
      <div class="lp-sticky-header">
        <input type="checkbox" id="lp-select-all" ${allChecked ? 'checked' : ''}
          style="width:16px;height:16px;cursor:pointer;" data-action="lpToggleAll">
        <label for="lp-select-all" class="text-bolder text-uppercase color-blue cursor-pointer" style="font-size:12px;letter-spacing:.5px;">Select all</label>
        <span class="text-bold color-blue" style="margin-left:auto;font-size:12px;">${enrolledIds.length} / ${activePlayers.length} enrolled</span>
      </div>`;

    const rowsHtml = activePlayers
      .map((p) => {
        const isEnrolled = enrolledIds.includes(Number(p.id));
        const enrolledRow = enrolled.find((r) => Number(r.player_id) === Number(p.id));
        const ladderStatus = enrolledRow && enrolledRow.status ? enrolledRow.status : 'active';
        const fullName = `${p.first_name} ${p.last_name}`;
        return `<div class="lp-row lp-player-row" data-name="${esc(fullName.toLowerCase())}">
          <input type="checkbox" id="lp-cb-${p.id}" ${isEnrolled ? 'checked' : ''}
            style="width:16px;height:16px;cursor:pointer;" data-pid="${p.id}">
          <label for="lp-cb-${p.id}" class="text-bold cursor-pointer flex-1" style="font-size:13px;">
            ${esc(fullName)}
            <span class="badge badge-${esc(p.status)}" style="margin-left:6px;">${esc(p.status)}</span>
          </label>
          ${
            isEnrolled
              ? `<select data-action="lpChangeStatus" data-pid="${p.id}"
                  class="lp-status-select ${ladderStatus === 'active' ? 'lp-status-active' : 'lp-status-sub'}">
                  <option value="active" ${ladderStatus === 'active' ? 'selected' : ''}>Active</option>
                  <option value="sub" ${ladderStatus === 'sub' ? 'selected' : ''}>Sub</option>
                </select>`
              : ''
          }
        </div>`;
      })
      .join('');

    listEl.innerHTML = headerHtml + rowsHtml;
  };

  const lpChangeStatus = async (sel) => {
    const pid = parseInt(sel.dataset.pid, 10);
    const newStatus = sel.value;
    sel.disabled = true;
    try {
      await api(
        `ladder_players?ladder_id=eq.${modalLadderId}&player_id=eq.${pid}`,
        'PATCH',
        { status: newStatus },
      );
      sel.classList.toggle('lp-status-active', newStatus === 'active');
      sel.classList.toggle('lp-status-sub', newStatus === 'sub');
      const p = ladderPlayers.find((x) => x.id === pid);
      if (p) p.ladder_status = newStatus;
      toast(`Status updated to ${newStatus}.`);
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    } finally {
      sel.disabled = false;
    }
  };

  const lpSaveChanges = async () => {
    const listEl = document.getElementById('lp-enrolled');
    const prevEnrolledIds = (listEl.dataset.enrolledIds || '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    const checkboxes = document.querySelectorAll('#lp-enrolled input[type="checkbox"][data-pid]');
    const nowCheckedIds = [...checkboxes]
      .filter((cb) => cb.checked)
      .map((cb) => parseInt(cb.dataset.pid, 10));

    const toAdd = nowCheckedIds.filter((id) => !prevEnrolledIds.includes(id));
    const toRemove = prevEnrolledIds.filter((id) => !nowCheckedIds.includes(id));

    if (!toAdd.length && !toRemove.length) {
      toast('No changes to save.');
      return;
    }
    const saveBtn = document.getElementById('lp-save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }
    try {
      if (toAdd.length) {
        await api(
          'ladder_players',
          'POST',
          toAdd.map((pid) => ({ ladder_id: parseInt(modalLadderId, 10), player_id: pid })),
        );
      }
      if (toRemove.length) {
        // Single bulk delete
        await api(
          `ladder_players?ladder_id=eq.${modalLadderId}&player_id=in.(${toRemove.join(',')})`,
          'DELETE',
        );
      }
      toast(`Saved! ${toAdd.length} added, ${toRemove.length} removed.`);
      await loadLadderPlayers();
      document.getElementById('lp-modal').classList.remove('open');
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
      }
    }
  };

  const lpToggleAll = (btn) => {
    const selectAll = btn.checked;
    document
      .querySelectorAll('#lp-enrolled input[type="checkbox"][data-pid]')
      .forEach((cb) => (cb.checked = selectAll));
  };

  const closeLpModal = () => document.getElementById('lp-modal').classList.remove('open');

  /* ─── LADDER STANDINGS ─────────────────────────────────── */

  const loadLadder = async () => {
    if (!currentLadder) {
      document.getElementById('ladder-stats').innerHTML = '';
      document.getElementById('ladder-table').innerHTML =
        '<div class="empty">Please select or create a ladder first.</div>';
      return;
    }
    try {
      if (!allPlayers.length) allPlayers = await api('players?select=*&order=id');
      const matches = await api(`matches?select=*&ladder_id=eq.${currentLadder.id}`);
      const pm = {};
      ladderPlayers.forEach((p) => (pm[p.id] = 0));
      matches.forEach((m) => {
        if (pm[m.player_id] !== undefined) pm[m.player_id] += m.points_earned || 0;
      });
      const ranked = [...ladderPlayers]
        .filter((p) => p.ladder_status === 'active')
        .sort((a, b) => (pm[b.id] || 0) - (pm[a.id] || 0));
      ranked.forEach((p, i) => {
        p._rank = i + 1;
        p._points = pm[p.id] || 0;
      });
      allPlayers._ranked = ranked;
      const sessions = [...new Set(matches.map((m) => m.session_date))];
      const uniqueGames = new Set(
        matches.map((m) => `${m.session_date}__${m.court_group}__${m.game_number}`),
      ).size;
      const leader = ranked[0] ? `${ranked[0].first_name} ${ranked[0].last_name}` : '-';
      document.getElementById('ladder-stats').innerHTML = `
        <div class="stat"><div class="stat-label">Players</div><div class="stat-value">${ladderPlayers.length}</div></div>
        <div class="stat"><div class="stat-label">Sessions</div><div class="stat-value">${sessions.length}</div></div>
        <div class="stat"><div class="stat-label">Games</div><div class="stat-value">${uniqueGames}</div></div>
        <div class="stat lime"><div class="stat-label">Leader</div><div class="stat-value">${esc(leader)}</div></div>`;
      renderLadder();
    } catch (e) {
      document.getElementById('ladder-table').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
    }
  };

  const renderLadder = () => {
    const filter = document.getElementById('gender-filter').value;
    const players = (allPlayers._ranked || []).filter((p) => filter === 'all' || p.gender === filter);
    if (!players.length) {
      document.getElementById('ladder-table').innerHTML =
        '<div class="empty">No players in this ladder yet.</div>';
      return;
    }
    const rows = players
      .map((p, i) => {
        const rc = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
        return `<tr>
          <td><span class="rank-badge ${rc}">${i + 1}</span></td>
          <td class="text-bold">${esc(p.first_name)} ${esc(p.last_name)}</td>
          <td class="text-muted-12">${esc(p.gender || '-')}</td>
          <td><span class="points-pill">${p._points} pts</span></td>
        </tr>`;
      })
      .join('');
    document.getElementById('ladder-table').innerHTML = `
      <table>
        <thead><tr><th>Rank</th><th>Player</th><th>Gender</th><th>Points</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  };

  /* ─── SESSIONS ─────────────────────────────────────────── */

  const loadSessions = async () => {
    if (!currentLadder) {
      document.getElementById('sessions-list').innerHTML =
        '<div class="empty">Please select a ladder first.</div>';
      return;
    }
    try {
      const matches = await api(
        `matches?select=*,players(first_name,last_name)&ladder_id=eq.${currentLadder.id}&order=session_date.desc,court_group,game_number`,
      );
      if (!matches.length) {
        document.getElementById('sessions-list').innerHTML =
          '<div class="empty">No sessions recorded yet.</div>';
        return;
      }

      // Group by court (date__court_group)
      const grouped = {};
      matches.forEach((m) => {
        const key = `${m.session_date}__${m.court_group}`;
        if (!grouped[key]) grouped[key] = { date: m.session_date, group: m.court_group, games: {} };
        if (!grouped[key].games[m.game_number]) grouped[key].games[m.game_number] = [];
        grouped[key].games[m.game_number].push(m);
      });

      // Group courts by date for the Print Roster button (one per date)
      const byDate = {};
      Object.values(grouped).forEach((s) => {
        if (!byDate[s.date]) byDate[s.date] = [];
        byDate[s.date].push(s);
      });

      let html = '';
      // Iterate date groups in desc order
      Object.keys(byDate).sort((a, b) => b.localeCompare(a)).forEach((date) => {
        const courts = byDate[date];
        const dateLabel = fmtDate(date, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

        // Check if all courts on this date have scores (all games have score_for not null)
        const allComplete = courts.every((s) =>
          Object.values(s.games).flat().every((m) => m.default_no_show || m.score_for !== null)
        );
        const anyPending = courts.some((s) =>
          Object.values(s.games).flat().some((m) => !m.default_no_show && m.score_for === null)
        );

        // Date header with Print Roster button
        html += `<div class="session-date-group">
          <div class="row-between mb-8" style="padding:8px 0;border-bottom:2px solid var(--blue-pale);margin-bottom:12px;">
            <div style="font-size:13px;font-weight:800;color:var(--blue);">📅 ${dateLabel}</div>
            <button class="btn btn-primary btn-sm" data-action="printRoster" data-date="${esc(date)}" data-ladderid="${currentLadder.id}" style="font-size:11px;font-weight:800;letter-spacing:.5px;display:flex;align-items:center;gap:6px;">
              📄 PRINT ROSTER
            </button>
          </div>`;

        courts.forEach((s) => {
          // Determine if this court has scores pending
          const courtGames = Object.values(s.games).flat();
          const courtPending = courtGames.some((m) => !m.default_no_show && m.score_for === null);
          const sessionMatchIds = courtGames.map((m) => m.id).join(',');

          html += `<div class="session-block">
            <div class="row-between mb-8">
              <div class="row gap-6 align-center">
                <div class="blue-tag">Court ${s.group}</div>
                ${courtPending ? '<span style="font-size:10px;font-weight:800;color:var(--orange);text-transform:uppercase;letter-spacing:.5px;padding:2px 8px;background:var(--orange-light);border-radius:99px;">⏳ Scores pending</span>' : ''}
              </div>
              <div class="row gap-6">
                <button class="btn btn-outline btn-sm" data-action="editSession" data-matchids="${sessionMatchIds}" data-date="${esc(s.date)}" data-court="${s.group}">Edit session</button>
                <button class="btn btn-danger btn-sm" data-action="deleteSession" data-matchids="${sessionMatchIds}" data-date="${esc(s.date)}" data-court="${s.group}">Delete session</button>
              </div>
            </div>`;

          Object.entries(s.games).forEach(([gnum, players]) => {
            const gameIds = players.map((p) => p.id).join(',');
            const gamePending = players.some((p) => !p.default_no_show && p.score_for === null);
            html += `<div class="game-row">
              <div class="row-between gap-6">
                <div class="row-wrap gap-6">
                  <span class="label-tag" style="margin-right:4px;">Game ${gnum}</span>`;
            players.forEach((p) => {
              const name = p.players ? `${p.players.first_name} ${p.players.last_name}` : 'Unknown';
              const score = p.score_for !== null ? `${p.score_for}-${p.score_against}` : '—';
              const pts = p.default_no_show ? '-1' : p.score_for !== null ? `+${p.points_earned}` : '—';
              const color = p.default_no_show
                ? 'var(--orange)'
                : p.score_for !== null
                  ? (p.is_sub ? 'var(--text-muted)' : 'var(--teal)')
                  : 'var(--text-muted)';
              const subTag = p.is_sub ? '<span class="sub-pill">SUB</span>' : '';
              html += `<span style="margin-right:10px;font-weight:500">${esc(name)}${subTag} <span style="color:${color};font-weight:700">${score}${p.score_for !== null || p.default_no_show ? '/' + pts + 'pts' : ''}</span></span>`;
            });
            html += `</div>
                <div class="row gap-6 flex-shrink-0">
                  <button class="btn btn-outline btn-sm" data-action="editGame" data-gameids="${gameIds}" data-gnum="${gnum}" data-date="${esc(s.date)}" data-court="${s.group}">Edit</button>
                </div>
              </div>
            </div>`;
          });
          html += '</div>'; // session-block
        });
        html += '</div>'; // session-date-group
      });

      document.getElementById('sessions-list').innerHTML = html;
    } catch (e) {
      document.getElementById('sessions-list').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
    }
  };

  const editSession = (btn) => {
    const ids = btn.dataset.matchids.split(',').filter(Boolean);
    const date = btn.dataset.date;
    const court = btn.dataset.court;
    document.getElementById('es-ids').value = ids.join(',');
    document.getElementById('es-date').value = date;
    document.getElementById('es-court').value = court;
    document.getElementById('es-orig-date').value = date;
    document.getElementById('es-orig-court').value = court;
    document.getElementById('edit-session-modal').classList.add('open');
  };

  const saveEditSession = async (e) => {
    e.preventDefault();
    const ids = document.getElementById('es-ids').value.split(',').filter(Boolean);
    const newDate = document.getElementById('es-date').value;
    const newCourt = document.getElementById('es-court').value;
    const origDate = document.getElementById('es-orig-date').value;
    const origCourt = document.getElementById('es-orig-court').value;

    if (!newDate || !newCourt) {
      toast('Please fill in both date and court number.', true);
      return;
    }
    if (newDate !== origDate || newCourt !== origCourt) {
      const existing = await api(
        `matches?session_date=eq.${newDate}&court_group=eq.${newCourt}&ladder_id=eq.${currentLadder.id}&limit=1`,
      );
      if (existing.length) {
        const d = fmtDate(newDate, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        toast(
          `A session already exists for Court ${newCourt} on ${d}. Please choose a different date or court.`,
          true,
        );
        return;
      }
    }

    const saveBtn = document.getElementById('es-save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }
    try {
      // Single bulk PATCH instead of N sequential ones
      await api(`matches?id=in.(${ids.join(',')})`, 'PATCH', {
        session_date: newDate,
        court_group: parseInt(newCourt, 10),
      });
      toast('Session updated!');
      document.getElementById('edit-session-modal').classList.remove('open');
      loadSessions();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save changes';
      }
    }
  };

  const deleteSession = async (btn) => {
    const ids = btn.dataset.matchids.split(',').filter(Boolean);
    const date = fmtDate(btn.dataset.date, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const court = btn.dataset.court;
    const ok = await confirmModal({
      title: 'Delete session?',
      message: `Delete entire session for ${date} — Court ${court}? This will remove all ${ids.length} game records. This cannot be undone.`,
      okLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      // Bulk delete
      await api(`matches?id=in.(${ids.join(',')})`, 'DELETE');
      toast(`Session deleted — ${ids.length} records removed.`);
      loadSessions();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  const editGame = async (btn) => {
    const ids = btn.dataset.gameids.split(',').filter(Boolean);
    const gnum = btn.dataset.gnum;
    const date = btn.dataset.date;
    const court = btn.dataset.court;
    const rows = await api(
      `matches?id=in.(${ids.join(',')})&select=*,players(first_name,last_name)`,
    );
    if (!rows.length) {
      toast('Could not load game data.', true);
      return;
    }
    const isVoided = rows[0].score_for === null;
    const modalBody = document.getElementById('edit-game-body');
    modalBody.innerHTML = `
      <div class="text-bold text-muted-13 mb-12 text-uppercase">
        Game ${esc(gnum)} — ${fmtDate(date)} — Court ${esc(court)}
      </div>
      <label class="row gap-8 cursor-pointer mb-16 bg-orange-light text-bold color-orange" style="padding:10px 14px;border-radius:var(--radius-sm);font-size:13px;">
        <input type="checkbox" id="eg-void-game" ${isVoided ? 'checked' : ''} data-action="toggleEditGameVoid"> Void this game (0 points for all players)
      </label>
      <div id="eg-scores-section" class="${isVoided ? 'opacity-04' : ''}">
        <div class="label-tag mb-10">Scores per player</div>
        ${rows
          .map(
            (r) => `
            <div style="padding:10px 0;border-bottom:0.5px solid var(--border);">
              <div class="text-bold mb-8" style="font-size:13px;">${r.players ? esc(r.players.first_name + ' ' + r.players.last_name) : 'Unknown'}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                <div class="form-group">
                  <label>Score for</label>
                  <input type="number" min="0" max="11" id="eg-sf-${r.id}" value="${r.score_for !== null ? r.score_for : ''}" placeholder="0" data-egrid="${r.id}" data-egtype="sf">
                </div>
                <div class="form-group">
                  <label>Score against</label>
                  <input type="number" min="0" max="11" id="eg-sa-${r.id}" value="${r.score_against !== null ? r.score_against : ''}" placeholder="0" data-egrid="${r.id}" data-egtype="sa">
                </div>
                <div class="form-group">
                  <label>Points earned <span class="color-teal" style="font-size:9px;">(auto)</span></label>
                  <input type="number" min="-1" max="4" id="eg-pts-${r.id}" value="${r.points_earned !== null ? r.points_earned : 0}" placeholder="0" style="background:var(--bg);" readonly>
                </div>
              </div>
            </div>`,
          )
          .join('')}
      </div>
      <input type="hidden" id="eg-ids" value="${ids.join(',')}">
    `;
    document.getElementById('edit-game-modal').classList.add('open');
  };

  const toggleEditGameVoid = () => {
    const isVoid = document.getElementById('eg-void-game').checked;
    const section = document.getElementById('eg-scores-section');
    section.classList.toggle('opacity-04', isVoid);
  };

  const saveEditGame = async (e) => {
    e.preventDefault();
    const ids = document.getElementById('eg-ids').value.split(',').filter(Boolean);
    const isVoid = document.getElementById('eg-void-game').checked;

    // Require score OR void — don't allow saving blanks when editing
    if (!isVoid) {
      const missingScore = ids.some((id) => {
        const sf = document.getElementById(`eg-sf-${id}`);
        const sa = document.getElementById(`eg-sa-${id}`);
        // Skip no-show rows (they never have scores)
        const ptsEl = document.getElementById(`eg-pts-${id}`);
        if (!sf) return false; // row not rendered = no-show row, skip
        return sf.value === '' || sa.value === '';
      });
      if (missingScore) {
        toast('Please enter scores for all players, or mark the game as void.', true);
        return;
      }
    }

    try {
      await Promise.all(
        ids.map((id) => {
          const sf = document.getElementById(`eg-sf-${id}`);
          const sa = document.getElementById(`eg-sa-${id}`);
          const pts = document.getElementById(`eg-pts-${id}`);
          const body = {
            score_for: isVoid ? null : sf && sf.value !== '' ? parseInt(sf.value, 10) : null,
            score_against: isVoid ? null : sa && sa.value !== '' ? parseInt(sa.value, 10) : null,
            points_earned: isVoid ? 0 : pts && pts.value !== '' ? parseInt(pts.value, 10) : 0,
          };
          return api(`matches?id=eq.${id}`, 'PATCH', body);
        }),
      );
      toast('Game updated successfully!');
      document.getElementById('edit-game-modal').classList.remove('open');
      loadSessions();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  /* ─── RECORD SESSION ───────────────────────────────────── */

  const calcPoints = (sf, sa) => {
    if (sf > sa) return 4;
    const d = sa - sf;
    if (d <= 2) return 3;
    if (d <= 4) return 2;
    if (d <= 8) return 1;
    return 0;
  };

  const initEntry = async () => {
    courtPlayers = [];
    noShowPlayer = null;
    noShowPenalty = -4;
    gameCount = 0;
    extraGameCount = 0;
    extraGames = [];
    document.getElementById('session-date').value = todayISO();
    document.getElementById('court-number').value = '';
    document.getElementById('court-players-list').innerHTML = '';
    document.getElementById('games-container').innerHTML = '';
    document.getElementById('games-setup-card').style.display = 'none';
    document.getElementById('save-btn-wrap').style.display = 'none';
    document.getElementById('player-search-entry').value = '';
    const psl = document.getElementById('player-dropdown-list');
    if (psl) psl.innerHTML = '';
    if (!currentLadder) {
      document.getElementById('entry-no-ladder').style.display = 'block';
      document.getElementById('entry-form').style.display = 'none';
    } else {
      document.getElementById('entry-no-ladder').style.display = 'none';
      document.getElementById('entry-form').style.display = 'block';
      if (!allPlayers.length) allPlayers = await api('players?select=*&order=first_name');
      if (!ladderPlayers.length) await loadLadderPlayers();
      renderPlayerDropdown('');
    }
  };

  const renderPlayerDropdown = (filter = '') => {
    const list = document.getElementById('player-dropdown-list');
    if (!list) return;
    const matches = ladderPlayers
      .filter((p) => !courtPlayers.find((cp) => cp.id === p.id))
      .filter(
        (p) =>
          !filter ||
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(filter.toLowerCase()),
      );
    if (!matches.length) {
      list.innerHTML = `<div class="text-muted-13 text-center" style="padding:12px 14px;">${filter ? 'No players found' : 'All players added'}</div>`;
      return;
    }
    list.innerHTML = matches
      .map(
        (p) => `
      <div data-action="addCourtPlayerBtn" data-pid="${p.id}"
        class="row-between text-bold cursor-pointer" style="padding:10px 14px;font-size:13px;border-bottom:0.5px solid var(--border);">
        <span>${esc(p.first_name)} ${esc(p.last_name)}</span>
        ${p.ladder_status === 'sub' ? '<span class="sub-pill">SUB</span>' : ''}
      </div>`,
      )
      .join('');
  };

  const searchPlayersEntry = () => {
    const q = document.getElementById('player-search-entry').value;
    renderPlayerDropdown(q);
  };

  const addCourtPlayer = (id) => {
    if (courtPlayers.length >= 6) {
      toast('Maximum 6 players per court.', true);
      return;
    }
    const p = ladderPlayers.find((x) => x.id === id);
    if (!p || courtPlayers.find((cp) => cp.id === id)) return;
    courtPlayers.push(p);
    document.getElementById('player-search-entry').value = '';
    renderPlayerDropdown('');
    renderCourtPlayers();
  };

  const removeCourtPlayer = (id) => {
    if (noShowPlayer && noShowPlayer.id === id) noShowPlayer = null;
    courtPlayers = courtPlayers.filter((p) => p.id !== id);
    renderPlayerDropdown(document.getElementById('player-search-entry')?.value || '');
    renderCourtPlayers();
    if (courtPlayers.filter((p) => !noShowPlayer || p.id !== noShowPlayer.id).length < 4) {
      document.getElementById('games-setup-card').style.display = 'none';
      document.getElementById('save-btn-wrap').style.display = 'none';
    }
  };

  const markNoShow = (pid) => {
    noShowPlayer = courtPlayers.find((p) => p.id === parseInt(pid, 10)) || null;
    noShowPenalty = -4;
    renderPlayerDropdown(document.getElementById('player-search-entry')?.value || '');
    renderCourtPlayers();
  };

  const cancelNoShow = () => {
    noShowPlayer = null;
    noShowPenalty = -4;
    renderCourtPlayers();
  };

  const renderCourtPlayers = () => {
    const el = document.getElementById('court-players-list');
    if (!courtPlayers.length) {
      el.innerHTML = '';
      return;
    }
    const playerChipsHtml = courtPlayers
      .map((p, i) => {
        const isNoShow = noShowPlayer && noShowPlayer.id === p.id;
        return `<div class="court-player ${isNoShow ? 'no-show' : ''}">
          <span class="court-num-badge ${isNoShow ? 'no-show' : ''}">${i + 1}</span>
          <span class="text-bold" style="font-size:13px;">${esc(p.first_name)} ${esc(p.last_name)}</span>
          ${
            isNoShow
              ? `<span style="font-size:9px;font-weight:800;background:var(--orange);color:white;padding:2px 6px;border-radius:99px;letter-spacing:.5px;">NO-SHOW</span>
                <button data-action="cancelNoShow" class="color-orange text-bold cursor-pointer" style="background:none;border:none;font-size:12px;padding:0 2px;">undo</button>`
              : `<button data-action="markNoShow" data-pid="${p.id}" class="text-muted-11 text-bold cursor-pointer" style="background:none;padding:2px 6px;border:0.5px solid var(--border);border-radius:99px;font-size:10px;">No-show</button>
                <button data-action="removeCourtPlayerBtn" data-pid="${p.id}" class="cursor-pointer text-muted-13" style="background:none;border:none;font-size:16px;line-height:1;padding:0 2px;">&times;</button>`
          }
        </div>`;
      })
      .join('');

    el.innerHTML = `<div class="row-wrap mb-10">${playerChipsHtml}</div>
      ${
        noShowPlayer
          ? `<div class="no-show-banner">
            <span class="text-bold color-orange" style="font-size:13px;">${esc(noShowPlayer.first_name)} ${esc(noShowPlayer.last_name)} did not show up.</span>
            <span class="text-muted-12">Assign penalty:</span>
            <label class="row gap-4 cursor-pointer text-bold color-orange" style="font-size:13px;">
              <input type="radio" name="noshow-penalty" id="ns-penalty" value="-4" ${noShowPenalty === -4 ? 'checked' : ''}> -4 pts (penalty)
            </label>
            <label class="row gap-4 cursor-pointer text-bold text-muted-13">
              <input type="radio" name="noshow-penalty" id="ns-excused" value="0" ${noShowPenalty === 0 ? 'checked' : ''}> 0 pts (excused)
            </label>
          </div>`
          : ''
      }`;

    const activePlayers = courtPlayers.filter((p) => !noShowPlayer || p.id !== noShowPlayer.id);
    if (activePlayers.length >= 4) buildGames(activePlayers);
    else {
      document.getElementById('games-setup-card').style.display = 'none';
      document.getElementById('save-btn-wrap').style.display = 'none';
    }
  };

  const getRoundRobinMatchups = (n) => {
    if (n === 4)
      return [
        { teamA: [0, 1], teamB: [2, 3], sit: null },
        { teamA: [0, 3], teamB: [1, 2], sit: null },
        { teamA: [1, 3], teamB: [0, 2], sit: null },
      ];
    if (n === 5)
      return [
        { teamA: [0, 1], teamB: [2, 3], sit: 4 },
        { teamA: [0, 4], teamB: [1, 2], sit: 3 },
        { teamA: [3, 4], teamB: [0, 2], sit: 1 },
        { teamA: [1, 3], teamB: [2, 4], sit: 0 },
        { teamA: [0, 3], teamB: [1, 4], sit: 2 },
      ];
    if (n === 6)
      return [
        { teamA: [0, 1], teamB: [2, 3], sit: [4, 5] },
        { teamA: [1, 5], teamB: [0, 4], sit: [2, 3] },
        { teamA: [3, 4], teamB: [2, 5], sit: [0, 1] },
        { teamA: [0, 2], teamB: [1, 4], sit: [3, 5] },
        { teamA: [3, 5], teamB: [1, 2], sit: [0, 4] },
        { teamA: [0, 3], teamB: [4, 5], sit: [1, 2] },
      ];
    return [];
  };

  const buildGames = (activePlayers) => {
    const players = activePlayers || courtPlayers;
    const matchups = getRoundRobinMatchups(players.length);
    gameCount = matchups.length;
    extraGameCount = 0;
    extraGames = [];
    const container = document.getElementById('games-container');
    container.innerHTML = '';
    matchups.forEach((m, i) => renderGameCard(i + 1, m, false, players));
    if (players.length === 4) {
      const playerOpts = players
        .map((p) => `<option value="${p.id}">${esc(p.first_name)} ${esc(p.last_name)}</option>`)
        .join('');
      const g4 = document.createElement('div');
      g4.id = 'game-card-4';
      g4.className = 'game-card-lime';
      g4.innerHTML = `
        <div class="game-card-header-lime">
          <span class="lime-tag" style="color:var(--lime-dark);">Game 4 — Closest scores</span>
          <label class="row gap-4 cursor-pointer text-bold text-uppercase" style="font-size:11px;color:var(--lime-dark);letter-spacing:.5px;">
            <input type="checkbox" id="void-4" data-action="toggleVoid" data-gamenum="4"> Void
          </label>
        </div>
        <div class="bg-bg text-muted-12" style="padding:10px 14px;">
          After the 3 games, match the 2 players with the closest total scores on each team.
        </div>
        <div id="game-body-4" class="game-card-body">
          <div class="vs-grid-top">
            <div class="team-pad-blue-l">
              <div class="blue-tag mb-8">Team A</div>
              <select id="extraA1-4" class="full-width mb-6" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${playerOpts}</select>
              <select id="extraA2-4" class="full-width mb-8" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${playerOpts}</select>
              <input type="number" min="0" max="11" placeholder="Score" id="scoreA-4" data-egame="4" data-eteam="A" class="full-width score-input">
            </div>
            <div class="vs-tag" style="padding-top:40px;">VS</div>
            <div class="team-pad-teal-l">
              <div class="label-tag mb-8" style="color:var(--teal);">Team B</div>
              <select id="extraB1-4" class="full-width mb-6" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${playerOpts}</select>
              <select id="extraB2-4" class="full-width mb-8" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${playerOpts}</select>
              <input type="number" min="0" max="11" placeholder="Score" id="scoreB-4" data-egame="4" data-eteam="B" class="full-width score-input">
            </div>
          </div>
          <div id="pts-preview-4" class="points-preview"></div>
          <input type="hidden" id="teamA-ids-4" value=""><input type="hidden" id="teamB-ids-4" value="">
        </div>`;
      container.appendChild(g4);
      gameCount = 3;
      extraGames = [4];
    }
    document.getElementById('games-setup-card').style.display = 'block';
    document.getElementById('save-btn-wrap').style.display = 'block';
  };

  const renderGameCard = (gameNum, matchup, isExtra, players) => {
    const activePl =
      players ||
      (noShowPlayer ? courtPlayers.filter((p) => p.id !== noShowPlayer.id) : courtPlayers);
    const container = document.getElementById('games-container');
    const div = document.createElement('div');
    div.id = `game-card-${gameNum}`;
    div.className = 'game-card';
    const tA = matchup ? matchup.teamA.map((i) => activePl[i]) : [];
    const tB = matchup ? matchup.teamB.map((i) => activePl[i]) : [];
    const sitRaw = matchup ? matchup.sit : null;
    const sitting =
      sitRaw === null
        ? null
        : Array.isArray(sitRaw)
          ? sitRaw.map((i) => activePl[i]).filter(Boolean)
          : [activePl[sitRaw]].filter(Boolean);
    const teamANames = tA.map((p) => `${p.first_name} ${p.last_name}`).join(' & ') || 'Team A';
    const teamBNames = tB.map((p) => `${p.first_name} ${p.last_name}`).join(' & ') || 'Team B';
    const teamAIds = tA.map((p) => p.id);
    const teamBIds = tB.map((p) => p.id);
    div.innerHTML = `
      <div class="game-card-header">
        <span class="lime-tag">Game ${gameNum}${isExtra ? ' (extra)' : ''}</span>
        <div class="row gap-12">
          ${
            sitting && sitting.length
              ? `<span style="font-size:11px;color:var(--blue-light);font-weight:500;">Sitting out: <strong style="color:white;">${sitting.map((p) => esc(p.first_name + ' ' + p.last_name)).join(', ')}</strong></span>`
              : ''
          }
          <label class="row gap-4 cursor-pointer text-bold text-uppercase" style="font-size:11px;color:var(--orange-light);letter-spacing:.5px;">
            <input type="checkbox" id="void-${gameNum}" data-action="toggleVoid" data-gamenum="${gameNum}"> Void
          </label>
          ${isExtra ? `<button class="btn btn-danger btn-sm" data-action="removeExtraGame" data-gamenum="${gameNum}">Remove</button>` : ''}
        </div>
      </div>
      <div id="game-body-${gameNum}" class="game-card-body">
        <div class="vs-grid">
          <div class="team-pad-blue">
            <div class="blue-tag mb-6">Team A</div>
            <div class="text-bold mb-10" style="font-size:13px;min-height:36px;">${esc(teamANames)}</div>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreA-${gameNum}" data-autoscore="${gameNum}" class="score-input">
          </div>
          <div class="vs-tag">VS</div>
          <div class="team-pad-teal">
            <div class="label-tag mb-6" style="color:var(--teal);">Team B</div>
            <div class="text-bold mb-10" style="font-size:13px;min-height:36px;">${esc(teamBNames)}</div>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreB-${gameNum}" data-autoscore="${gameNum}" class="score-input">
          </div>
        </div>
        <div id="pts-preview-${gameNum}" class="points-preview"></div>
      </div>
      <input type="hidden" id="teamA-ids-${gameNum}" value="${teamAIds.join(',')}">
      <input type="hidden" id="teamB-ids-${gameNum}" value="${teamBIds.join(',')}">`;
    container.appendChild(div);
  };

  const toggleVoid = (gameNum) => {
    const isVoided = document.getElementById(`void-${gameNum}`).checked;
    const body = document.getElementById(`game-body-${gameNum}`);
    if (isVoided) {
      body.classList.add('opacity-04');
      document.getElementById(`pts-preview-${gameNum}`).innerHTML =
        '<span class="color-orange text-bold">Game voided — 0 points for both teams</span>';
    } else {
      body.classList.remove('opacity-04');
      autoCalcGame(gameNum);
    }
  };

  const autoCalcGame = (gameNum) => {
    const sA = document.getElementById(`scoreA-${gameNum}`);
    const sB = document.getElementById(`scoreB-${gameNum}`);
    const preview = document.getElementById(`pts-preview-${gameNum}`);
    if (!sA || !sB || sA.value === '' || sB.value === '') {
      preview.textContent = '';
      return;
    }
    const a = parseInt(sA.value, 10);
    const b = parseInt(sB.value, 10);
    const ptA = calcPoints(a, b);
    const ptB = calcPoints(b, a);
    const tAIds = document.getElementById(`teamA-ids-${gameNum}`).value.split(',').filter(Boolean);
    const tBIds = document.getElementById(`teamB-ids-${gameNum}`).value.split(',').filter(Boolean);
    const tANames = tAIds
      .map((id) => allPlayers.find((p) => p.id == id))
      .filter(Boolean)
      .map((p) => p.first_name)
      .join(' & ');
    const tBNames = tBIds
      .map((id) => allPlayers.find((p) => p.id == id))
      .filter(Boolean)
      .map((p) => p.first_name)
      .join(' & ');
    const aColor = ptA > ptB ? 'var(--teal)' : 'var(--orange)';
    const bColor = ptB > ptA ? 'var(--teal)' : 'var(--orange)';
    preview.innerHTML = `<span style="color:${aColor};font-weight:700;">${esc(tANames || 'Team A')}: ${ptA > 0 ? '+' : ''}${ptA} pts</span> &nbsp;|&nbsp; <span style="color:${bColor};font-weight:700;">${esc(tBNames || 'Team B')}: ${ptB > 0 ? '+' : ''}${ptB} pts</span>`;
  };

  const autoCalcExtraGame = (gameNum) => {
    const sA = document.getElementById(`scoreA-${gameNum}`);
    const sB = document.getElementById(`scoreB-${gameNum}`);
    const preview = document.getElementById(`pts-preview-${gameNum}`);
    if (!sA || !sB || sA.value === '' || sB.value === '') {
      preview.textContent = '';
      return;
    }
    const a = parseInt(sA.value, 10);
    const b = parseInt(sB.value, 10);
    const ptA = calcPoints(a, b);
    const ptB = calcPoints(b, a);
    const aColor = ptA > ptB ? 'var(--teal)' : 'var(--orange)';
    const bColor = ptB > ptA ? 'var(--teal)' : 'var(--orange)';
    preview.innerHTML = `<span style="color:${aColor};font-weight:700;">Team A: ${ptA > 0 ? '+' : ''}${ptA} pts</span> &nbsp;|&nbsp; <span style="color:${bColor};font-weight:700;">Team B: ${ptB > 0 ? '+' : ''}${ptB} pts</span>`;
  };

  const addExtraGame = () => {
    extraGameCount++;
    const gameNum = 100 + extraGameCount;
    extraGames.push(gameNum);
    const container = document.getElementById('games-container');
    const players = courtPlayers.filter((p) => !noShowPlayer || p.id !== noShowPlayer.id);
    const playerOpts = players
      .map((p) => `<option value="${p.id}">${esc(p.first_name)} ${esc(p.last_name)}</option>`)
      .join('');
    const div = document.createElement('div');
    div.id = `game-card-${gameNum}`;
    div.className = 'game-card';
    div.innerHTML = `
      <div class="game-card-header">
        <span class="lime-tag">Extra game</span>
        <div class="row gap-8">
          <label class="row gap-4 cursor-pointer text-bold text-uppercase" style="font-size:11px;color:var(--orange-light);letter-spacing:.5px;">
            <input type="checkbox" id="void-${gameNum}" data-action="toggleVoid" data-gamenum="${gameNum}"> Void
          </label>
          <button class="btn btn-danger btn-sm" data-action="removeExtraGame" data-gamenum="${gameNum}">Remove</button>
        </div>
      </div>
      <div id="game-body-${gameNum}" class="game-card-body">
        <div class="vs-grid-top">
          <div class="team-pad-blue-l">
            <div class="blue-tag mb-8">Team A</div>
            <select id="extraA1-${gameNum}" class="full-width mb-6" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${playerOpts}</select>
            <select id="extraA2-${gameNum}" class="full-width mb-8" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${playerOpts}</select>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreA-${gameNum}" data-egame="${gameNum}" data-eteam="A" class="full-width score-input">
          </div>
          <div class="vs-tag" style="padding-top:36px;">VS</div>
          <div class="team-pad-teal-l">
            <div class="label-tag mb-8" style="color:var(--teal);">Team B</div>
            <select id="extraB1-${gameNum}" class="full-width mb-6" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${playerOpts}</select>
            <select id="extraB2-${gameNum}" class="full-width mb-8" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${playerOpts}</select>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreB-${gameNum}" data-egame="${gameNum}" data-eteam="B" class="full-width score-input">
          </div>
        </div>
        <div id="pts-preview-${gameNum}" class="points-preview"></div>
        <input type="hidden" id="teamA-ids-${gameNum}" value=""><input type="hidden" id="teamB-ids-${gameNum}" value="">
      </div>`;
    container.appendChild(div);
  };

  const removeExtraGame = (gameNum) => {
    document.getElementById(`game-card-${gameNum}`).remove();
    extraGames = extraGames.filter((g) => g !== gameNum);
  };

  const submitSession = async () => {
    if (!currentLadder) {
      toast('Please select a ladder first.', true);
      return;
    }
    const date = document.getElementById('session-date').value;
    const courtNum = document.getElementById('court-number').value;
    if (!date || !courtNum) {
      toast('Please fill in session date and court number.', true);
      return;
    }
    if (!courtPlayers.length) {
      toast('Please add players to the court.', true);
      return;
    }
    const rows = [];
    const extraGameMap = {};
    extraGames.forEach((g, i) => {
      extraGameMap[g] = gameCount + 1 + i;
    });
    const allGameNums = [...Array(gameCount).keys()].map((i) => i + 1).concat(extraGames);

    // Validate uniqueness
    const existing = await api(
      `matches?session_date=eq.${date}&court_group=eq.${courtNum}&ladder_id=eq.${currentLadder.id}&limit=1`,
    );
    if (existing.length) {
      const existingDate = fmtDate(date, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      toast(
        `A session for Court ${courtNum} on ${existingDate} already exists. Please edit the existing session or choose a different court/date.`,
        true,
      );
      return;
    }

    // Active player count
    const activePlayerCount = courtPlayers.filter(
      (p) => !noShowPlayer || p.id !== noShowPlayer.id,
    ).length;

    // ── Determine whether scores are present ─────────────────
    // If ANY game has a score entered, we require ALL games to have scores (existing behavior).
    // If NO game has any score, we save as roster-only (null scores, no points).
    const anyScoreEntered = allGameNums.some((gameNum) => {
      const isVoided = document.getElementById(`void-${gameNum}`)?.checked || false;
      if (isVoided) return true; // voided counts as "score provided"
      const sA = document.getElementById(`scoreA-${gameNum}`);
      return sA && sA.value !== '';
    });

    // Validate Game 4 player selection (4-active-players closest scores)
    // Only required when scores are being entered — in roster-only mode,
    // Game 4 players are determined during play so we skip this check.
    if (anyScoreEntered && activePlayerCount === 4) {
      const a1 = document.getElementById('extraA1-4')?.value;
      const a2 = document.getElementById('extraA2-4')?.value;
      const b1 = document.getElementById('extraB1-4')?.value;
      const b2 = document.getElementById('extraB2-4')?.value;
      const isVoided4 = document.getElementById('void-4')?.checked || false;
      if (!isVoided4 && (!a1 || !a2 || !b1 || !b2)) {
        toast('Game 4: Please select all 4 players or mark the game as void.', true);
        return;
      }
    }

    if (anyScoreEntered) {
      // ── SCORE MODE: validate all games have scores ──────────
      const missingScores = [];
      for (const gameNum of allGameNums) {
        const isVoided = document.getElementById(`void-${gameNum}`)?.checked || false;
        if (isVoided) continue;
        const sA = document.getElementById(`scoreA-${gameNum}`);
        const sB = document.getElementById(`scoreB-${gameNum}`);
        if (!sA || sA.value === '' || !sB || sB.value === '') missingScores.push(gameNum);
      }
      if (missingScores.length) {
        toast(
          `Please enter scores for Game${missingScores.length > 1 ? 's' : ''} ${missingScores.join(', ')} or mark ${missingScores.length > 1 ? 'them' : 'it'} as void.`,
          true,
        );
        return;
      }

      // Build rows WITH scores
      for (const gameNum of allGameNums) {
        const sA = document.getElementById(`scoreA-${gameNum}`);
        const sB = document.getElementById(`scoreB-${gameNum}`);
        if (!sA || sA.value === '') continue;
        const scoreA = parseInt(sA.value, 10);
        const scoreB = parseInt(sB?.value || 0, 10);
        const isVoided = document.getElementById(`void-${gameNum}`)?.checked || false;
        const ptA = isVoided ? 0 : calcPoints(scoreA, scoreB);
        const ptB = isVoided ? 0 : calcPoints(scoreB, scoreA);
        let tAIds, tBIds;
        const isExtraGame = gameNum > 100 || (gameNum === 4 && activePlayerCount === 4);
        if (isExtraGame) {
          tAIds = [
            document.getElementById(`extraA1-${gameNum}`)?.value,
            document.getElementById(`extraA2-${gameNum}`)?.value,
          ].filter(Boolean).map(Number);
          tBIds = [
            document.getElementById(`extraB1-${gameNum}`)?.value,
            document.getElementById(`extraB2-${gameNum}`)?.value,
          ].filter(Boolean).map(Number);
        } else {
          tAIds = document.getElementById(`teamA-ids-${gameNum}`)?.value.split(',').filter(Boolean).map(Number) || [];
          tBIds = document.getElementById(`teamB-ids-${gameNum}`)?.value.split(',').filter(Boolean).map(Number) || [];
        }
        tAIds.forEach((pid) => {
          if (!pid) return;
          const pA = ladderPlayers.find((p) => p.id === pid);
          const isSubA = pA?.ladder_status === 'sub';
          rows.push({
            session_date: date, court_group: parseInt(courtNum, 10), player_id: pid,
            game_number: extraGameMap[gameNum] || gameNum,
            score_for: isVoided ? null : scoreA, score_against: isVoided ? null : scoreB,
            points_earned: isSubA ? 0 : ptA, is_sub: isSubA,
            default_no_show: false, ladder_id: currentLadder.id,
          });
        });
        tBIds.forEach((pid) => {
          if (!pid) return;
          const pB = ladderPlayers.find((p) => p.id === pid);
          const isSubB = pB?.ladder_status === 'sub';
          rows.push({
            session_date: date, court_group: parseInt(courtNum, 10), player_id: pid,
            game_number: extraGameMap[gameNum] || gameNum,
            score_for: isVoided ? null : scoreB, score_against: isVoided ? null : scoreA,
            points_earned: isSubB ? 0 : ptB, is_sub: isSubB,
            default_no_show: false, ladder_id: currentLadder.id,
          });
        });
      }
    } else {
      // ── ROSTER-ONLY MODE: save players/matchups, no scores ──
      for (const gameNum of allGameNums) {
        let tAIds, tBIds;
        const isExtraGame = gameNum > 100 || (gameNum === 4 && activePlayerCount === 4);
        if (isExtraGame) {
          tAIds = [
            document.getElementById(`extraA1-${gameNum}`)?.value,
            document.getElementById(`extraA2-${gameNum}`)?.value,
          ].filter(Boolean).map(Number);
          tBIds = [
            document.getElementById(`extraB1-${gameNum}`)?.value,
            document.getElementById(`extraB2-${gameNum}`)?.value,
          ].filter(Boolean).map(Number);
        } else {
          tAIds = document.getElementById(`teamA-ids-${gameNum}`)?.value.split(',').filter(Boolean).map(Number) || [];
          tBIds = document.getElementById(`teamB-ids-${gameNum}`)?.value.split(',').filter(Boolean).map(Number) || [];
        }
        [...tAIds, ...tBIds].forEach((pid) => {
          if (!pid) return;
          const p = ladderPlayers.find((lp) => lp.id === pid);
          rows.push({
            session_date: date, court_group: parseInt(courtNum, 10), player_id: pid,
            game_number: extraGameMap[gameNum] || gameNum,
            score_for: null, score_against: null,
            points_earned: 0, is_sub: p?.ladder_status === 'sub',
            default_no_show: false, ladder_id: currentLadder.id,
          });
        });
      }
    }

    // No-show player always included regardless of mode
    if (noShowPlayer) {
      rows.push({
        session_date: date, court_group: parseInt(courtNum, 10), player_id: noShowPlayer.id,
        game_number: 1, score_for: null, score_against: null,
        points_earned: noShowPenalty, is_sub: noShowPlayer.ladder_status === 'sub',
        default_no_show: true, ladder_id: currentLadder.id,
      });
    }

    if (!rows.length) {
      toast('No players assigned to games yet.', true);
      return;
    }

    try {
      await api('matches', 'POST', rows);
      if (anyScoreEntered) {
        toast(`Session saved! ${rows.length} entries recorded.`);
      } else {
        toast(`Roster saved for Court ${courtNum}. Add scores later in the Sessions tab.`);
      }
      initEntry();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  /* ─── PRINT ROSTER ─────────────────────────────────────── */

  const printRoster = async (btn) => {
    const date = btn.dataset.date;
    const ladderId = parseInt(btn.dataset.ladderid, 10);
    if (!date || !ladderId) { toast('Missing date or ladder.', true); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Generating...';

    try {
      // Fetch all matches for this date + ladder, including player names
      const matches = await api(
        `matches?select=*,players(first_name,last_name)&ladder_id=eq.${ladderId}&session_date=eq.${date}&order=court_group,game_number,id`
      );
      if (!matches.length) { toast('No sessions found for this date.', true); return; }

      // Group by court
      const courts = {};
      matches.forEach((m) => {
        if (!courts[m.court_group]) courts[m.court_group] = { games: {} };
        if (!courts[m.court_group].games[m.game_number]) courts[m.court_group].games[m.game_number] = [];
        courts[m.court_group].games[m.game_number].push(m);
      });

      // Ladder info for header
      const ladderName = currentLadder?.name || 'Ladder';
      const scoringFormat = currentLadder?.scoring_format || '';
      const dateLabel = fmtDate(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // Build PDF using jsPDF
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

      const PW = 215.9; // letter width mm
      const PH = 279.4; // letter height mm
      const ML = 14;    // margin left
      const MR = 14;    // margin right
      const MT = 14;    // margin top
      const CW = PW - ML - MR; // content width

      const BLUE   = [23, 76, 204];
      const LIME   = [198, 242, 33];
      const DARK   = [13, 31, 74];
      const MUTED  = [107, 122, 153];
      const BORDER = [214, 223, 245];
      const WHITE  = [255, 255, 255];
      const ORANGE = [242, 96, 36];

      const courtNums = Object.keys(courts).map(Number).sort((a, b) => a - b);

      courtNums.forEach((courtNum, courtIdx) => {
        if (courtIdx > 0) doc.addPage();

        const court = courts[courtNum];
        const gameNums = Object.keys(court.games).map(Number).sort((a, b) => a - b);

        // Collect all unique players in this court (exclude duplicates from multi-game entries)
        const playerMap = {};
        gameNums.forEach((gn) => {
          court.games[gn].forEach((m) => {
            if (!m.default_no_show && m.players) {
              playerMap[m.player_id] = `${m.players.first_name} ${m.players.last_name}`;
            }
          });
        });
        // No-show player
        const noShowMatch = Object.values(court.games).flat().find((m) => m.default_no_show);
        const noShowName = noShowMatch?.players
          ? `${noShowMatch.players.first_name} ${noShowMatch.players.last_name}` : null;

        const playerList = Object.values(playerMap);
        const playerCount = playerList.length;
        const totalPlayers = noShowName ? playerCount + 1 : playerCount;

        let y = MT;

        // ── HEADER BAND ──────────────────────────────────────────
        doc.setFillColor(...BLUE);
        doc.rect(0, 0, PW, 22, 'F');
        // Lime accent stripe
        doc.setFillColor(...LIME);
        doc.rect(0, 22, PW, 1.2, 'F');

        // Ladder name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...WHITE);
        doc.text(ladderName, ML, 10);

        // Scoring format (right side)
        if (scoringFormat) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(scoringFormat, PW - MR, 10, { align: 'right' });
        }

        // Date and court
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Date: ${dateLabel}`, ML, 17);
        doc.setFont('helvetica', 'bold');
        doc.text(`Court: ${courtNum}`, PW - MR, 17, { align: 'right' });

        y = 30; // after header

        // ── TWO-COLUMN LAYOUT ─────────────────────────────────────
        // Left col: matchups | Right col: player list
        const COL_SPLIT = CW * 0.62; // 62% for games, 38% for players
        const leftW = ML + COL_SPLIT - 4;
        const rightX = ML + COL_SPLIT + 4;
        const rightW = PW - MR - rightX;

        // ── RIGHT COLUMN: PLAYERS LIST ────────────────────────────
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...MUTED);
        doc.text('PLAYERS', rightX, y);

        let ry = y + 6;
        const allPlayersForList = noShowName ? [...playerList, noShowName] : playerList;
        allPlayersForList.forEach((name, i) => {
          // Row background alternating
          if (i % 2 === 0) {
            doc.setFillColor(245, 247, 252);
            doc.rect(rightX - 1, ry - 4, rightW + 1, 7, 'F');
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...DARK);
          doc.text(`${i + 1}.`, rightX, ry);
          doc.setFont('helvetica', 'normal');
          const isNoShow = name === noShowName;
          if (isNoShow) doc.setTextColor(...ORANGE);
          doc.text(name + (isNoShow ? ' (No show)' : ''), rightX + 6, ry);
          doc.setTextColor(...DARK);
          ry += 7.5;
        });

        // ── LEFT COLUMN: GAMES ────────────────────────────────────
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...MUTED);
        doc.text('GAMES', ML, y);

        let gy = y + 6;
        const SCORE_BOX_W = 10;
        const SCORE_BOX_H = 7;
        const GAME_ROW_H = 14; // height per game row (two teams)

        gameNums.forEach((gn) => {
          const gamePlayers = court.games[gn].filter((m) => !m.default_no_show);

          const half = Math.ceil(gamePlayers.length / 2);
          const teamA = gamePlayers.slice(0, half);
          const teamB = gamePlayers.slice(half);

          const teamANames = teamA.map((m) => m.players ? `${m.players.first_name} ${m.players.last_name}` : '?');
          const teamBNames = teamB.map((m) => m.players ? `${m.players.first_name} ${m.players.last_name}` : '?');

          const gamePlayerIds = new Set(gamePlayers.map((m) => m.player_id));
          const sittingOut = Object.entries(playerMap)
            .filter(([pid]) => !gamePlayerIds.has(parseInt(pid, 10)))
            .map(([, name]) => name);

          // Game 4 for 4-player courts handled separately after the loop
          const isGame4 = gn === 4 && playerCount === 4;
          if (isGame4) return;

          // ── Layout matching paper format ───────────────────────
          // Left side: numbered player names stacked, "Vs" between teams
          // Right side: ONE tall box split by horizontal line (Team A score top, Team B score bottom)

          const NAME_COL_W = leftW - ML - 22;  // name area width
          const BOX_X = ML + NAME_COL_W + 2;   // score box x position
          const BOX_W = 18;                     // score box width
          const LINE_H = 7;                     // height per player name row
          const VS_H = 5;                       // height of VS row

          // Calculate total height for this game
          const teamACount = teamANames.length; // 1 or 2 players
          const teamBCount = teamBNames.length;
          const totalH = teamACount * LINE_H + VS_H + teamBCount * LINE_H + (sittingOut.length ? 6 : 0);
          const BOX_H = teamACount * LINE_H + VS_H + teamBCount * LINE_H;

          // Game number label
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text(`${gn}`, ML, gy + 4);

          // Score box — tall rectangle matching full game height, divided by horizontal line
          doc.setDrawColor(...DARK);
          doc.setLineWidth(0.5);
          doc.setFillColor(...WHITE);
          doc.rect(BOX_X, gy, BOX_W, BOX_H, 'FD');
          // Horizontal dividing line at midpoint (between team A and team B scores)
          const divY = gy + teamACount * LINE_H + VS_H / 2;
          doc.line(BOX_X, divY, BOX_X + BOX_W, divY);

          // Team A names
          let ly = gy;
          teamANames.forEach((name) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...DARK);
            doc.text(name, ML + 5, ly + 5, { maxWidth: NAME_COL_W - 6 });
            ly += LINE_H;
          });

          // VS
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(...MUTED);
          doc.text('Vs', ML + 5, ly + 4);
          ly += VS_H;

          // Team B names
          teamBNames.forEach((name) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...DARK);
            doc.text(name, ML + 5, ly + 5, { maxWidth: NAME_COL_W - 6 });
            ly += LINE_H;
          });

          // Sits out (5-player courts)
          if (sittingOut.length) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(6.5);
            doc.setTextColor(...ORANGE);
            doc.text(`Sits out: ${sittingOut.join(', ')}`, ML + 5, ly + 4);
            ly += 6;
          }

          gy += totalH + 3;

          // Thin separator line between games
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.2);
          doc.line(ML, gy, leftW, gy);
          gy += 3;
        });

        // ── GAME 4 CLOSEST SCORES — always rendered for 4-player courts ──
        if (playerCount === 4) {
          const game4InDB = gameNums.includes(4);

          const NAME_COL_W = leftW - ML - 22;
          const BOX_X = ML + NAME_COL_W + 2;
          const BOX_W = 18;
          const LINE_H = 7;
          const VS_H = 5;

          if (game4InDB) {
            // Render with actual saved players
            const g4Players = court.games[4].filter((m) => !m.default_no_show);
            const half = Math.ceil(g4Players.length / 2);
            const tA = g4Players.slice(0, half).map((m) => m.players ? `${m.players.first_name} ${m.players.last_name}` : '?');
            const tB = g4Players.slice(half).map((m) => m.players ? `${m.players.first_name} ${m.players.last_name}` : '?');
            const BOX_H = tA.length * LINE_H + VS_H + tB.length * LINE_H;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...MUTED);
            doc.text('4', ML, gy + 4);

            doc.setDrawColor(...DARK);
            doc.setLineWidth(0.5);
            doc.setFillColor(...WHITE);
            doc.rect(BOX_X, gy, BOX_W, BOX_H, 'FD');
            const divY = gy + tA.length * LINE_H + VS_H / 2;
            doc.line(BOX_X, divY, BOX_X + BOX_W, divY);

            let ly = gy;
            tA.forEach((name) => {
              doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
              doc.text(name, ML + 5, ly + 5, { maxWidth: NAME_COL_W - 6 });
              ly += LINE_H;
            });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
            doc.text('Vs', ML + 5, ly + 4);
            ly += VS_H;
            tB.forEach((name) => {
              doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...DARK);
              doc.text(name, ML + 5, ly + 5, { maxWidth: NAME_COL_W - 6 });
              ly += LINE_H;
            });
            gy += BOX_H + 3;

          } else {
            // Roster-only: 4 blank name lines + split box + note
            const BOX_H = LINE_H * 2 + VS_H + LINE_H * 2;

            // Game number
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...MUTED);
            doc.text('4', ML, gy + 4);

            // Score box
            doc.setDrawColor(...DARK);
            doc.setLineWidth(0.5);
            doc.setFillColor(...WHITE);
            doc.rect(BOX_X, gy, BOX_W, BOX_H, 'FD');
            const divY = gy + LINE_H * 2 + VS_H / 2;
            doc.line(BOX_X, divY, BOX_X + BOX_W, divY);

            // Blank name lines — Team A
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.3);
            let ly = gy;
            [1, 2].forEach((n) => {
              doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
              doc.text(`${n}.`, ML + 2, ly + 5);
              doc.line(ML + 8, ly + 5.5, BOX_X - 3, ly + 5.5);
              ly += LINE_H;
            });

            // VS
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
            doc.text('Vs', ML + 5, ly + 4);
            ly += VS_H;

            // Blank name lines — Team B
            [3, 4].forEach((n) => {
              doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
              doc.text(`${n}.`, ML + 2, ly + 5);
              doc.line(ML + 8, ly + 5.5, BOX_X - 3, ly + 5.5);
              ly += LINE_H;
            });

            gy += BOX_H + 4;

            // Note below
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7);
            doc.setTextColor(...MUTED);
            doc.text(
              '* 4th MATCH will be between the combination of players with the closest score after games 1, 2 & 3.',
              ML + 2, gy + 3,
              { maxWidth: leftW - ML - 2 }
            );
            gy += 10;
          }

          // Final separator
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.2);
          doc.line(ML, gy, leftW, gy);
        }

        // ── FOOTER ───────────────────────────────────────────────
        doc.setFillColor(...BLUE);
        doc.rect(0, PH - 10, PW, 10, 'F');
        doc.setFillColor(...LIME);
        doc.rect(0, PH - 10, PW, 0.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...WHITE);
        doc.text('Ferocia Sports Center  —  ferociasports.com', PW / 2, PH - 4, { align: 'center' });
      });

      // Download
      const fileName = `${ladderName.replace(/\s+/g, '_')}_Roster_${date}.pdf`;
      doc.save(fileName);
      toast(`✅ Roster downloaded: ${fileName}`);
    } catch (err) {
      toast(`Error generating PDF: ${err.message}`, true);
      console.error('[printRoster]', err);
    } finally {
      btn.disabled = false;
      btn.textContent = '📄 Print Roster';
    }
  };

  /* ─── PLAYERS ──────────────────────────────────────────── */

  const filterPlayers = () => {
    const q = document.getElementById('player-search').value.toLowerCase().trim();
    const statusFilter = document.getElementById('player-status-filter')?.value || 'all';
    let lastVisible = null;
    document.querySelectorAll('#players-table tbody tr').forEach((row) => {
      // The inline reason rows piggy-back the visibility of the player row above them.
      if (row.classList.contains('reason-row')) {
        row.style.display = lastVisible === '' ? '' : 'none';
        return;
      }
      const name = row.querySelector('td')?.textContent.toLowerCase() || '';
      const statusCell = row.querySelectorAll('td')[4]?.textContent.toLowerCase() || '';
      const nameMatch = name.includes(q);
      const statusMatch = statusFilter === 'all' || statusCell.includes(statusFilter);
      const display = nameMatch && statusMatch ? '' : 'none';
      row.style.display = display;
      lastVisible = display;
    });
  };

  const loadPlayers = async () => {
    try {
      // Fetch players + status history in parallel.
      // History query: only inactivation events (new_status='inactive') so we
      // can build "latest reason per player". Sorted desc so the first entry
      // we encounter for each player_id is the most recent.
      const [players, history] = await Promise.all([
        api('players?select=*&order=first_name'),
        api(
          'player_status_history?new_status=eq.inactive&select=player_id,reason,changed_at&order=changed_at.desc',
        ),
      ]);
      allPlayers = players;

      // Build "latest reason per player" map and "history count per player" map
      latestInactivationReasons = {};
      historyCountByPlayer = {};
      (history || []).forEach((h) => {
        if (!latestInactivationReasons[h.player_id]) {
          latestInactivationReasons[h.player_id] = {
            reason: h.reason,
            changed_at: h.changed_at,
          };
        }
        historyCountByPlayer[h.player_id] = (historyCountByPlayer[h.player_id] || 0) + 1;
      });

      if (!allPlayers.length) {
        document.getElementById('players-table').innerHTML =
          '<div class="empty">No players yet.</div>';
        return;
      }

      const rows = allPlayers
        .map((p) => {
          const isInactive = p.status === 'inactive';
          const recent = latestInactivationReasons[p.id];
          // Inline reason preview — only for inactive players that have a reason recorded
          const reasonRow =
            isInactive && recent && recent.reason
              ? `<tr class="reason-row">
                  <td colspan="7" style="padding:4px 12px 12px;border-bottom:0.5px solid var(--border);">
                    <div style="font-size:11px;color:var(--orange);font-weight:600;">
                      <span class="text-uppercase" style="letter-spacing:.5px;">Reason:</span>
                      <span style="font-style:italic;font-weight:500;color:var(--text-muted);">${esc(recent.reason)}</span>
                    </div>
                  </td>
                </tr>`
              : '';
          return `
            <tr>
              <td class="text-bold">${esc(p.first_name)} ${esc(p.last_name)}</td>
              <td class="text-muted-12">${esc(p.gender || '-')}</td>
              <td class="text-muted-12">${esc(p.email || '-')}</td>
              <td class="text-muted-12">${esc(p.phone || '-')}</td>
              <td><span class="badge badge-${esc(p.status)}">${esc(p.status)}</span></td>
              <td class="text-muted-12">${fmtDate(p.date_joined) || '-'}</td>
              <td><button class="btn btn-outline btn-sm" data-action="openEdit" data-pid="${p.id}">Edit</button></td>
            </tr>${reasonRow}`;
        })
        .join('');

      document.getElementById('players-count').textContent =
        `${allPlayers.length} player${allPlayers.length !== 1 ? 's' : ''}`;
      document.getElementById('players-table').innerHTML = `
        <table><thead><tr><th>Name</th><th>Gender</th><th>Email</th><th>Phone</th><th>Status</th><th>Joined</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    } catch (e) {
      document.getElementById('players-table').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
    }
  };

  const initAddPlayer = () => {
    document.getElementById('p-joined').value = todayISO();
  };

  const addPlayer = async (e) => {
    e.preventDefault();
    const body = {
      first_name: document.getElementById('p-first').value.trim(),
      last_name: document.getElementById('p-last').value.trim(),
      email: document.getElementById('p-email').value.trim() || null,
      phone: document.getElementById('p-phone').value.trim() || null,
      gender: document.getElementById('p-gender').value || null,
      status: document.getElementById('p-status').value,
      date_joined: document.getElementById('p-joined').value || null,
      current_rank: 999,
    };
    try {
      await api('players', 'POST', body);
      toast(`${body.first_name} ${body.last_name} added successfully!`);
      e.target.reset();
      document.getElementById('p-joined').value = todayISO();
      allPlayers = [];
    } catch (err) {
      toast(`Error: ${err.message}`, true);
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

  const openEdit = async (id) => {
    const p = allPlayers.find((x) => x.id === id);
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

  const closeModal = () => document.getElementById('edit-modal').classList.remove('open');

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

    const body = {
      first_name: document.getElementById('edit-first').value.trim(),
      last_name: document.getElementById('edit-last').value.trim(),
      email: document.getElementById('edit-email').value.trim() || null,
      phone: document.getElementById('edit-phone').value.trim() || null,
      gender: document.getElementById('edit-gender').value || null,
      status: newStatus,
    };

    try {
      await api(`players?id=eq.${id}`, 'PATCH', body);

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
      allPlayers = [];
      loadPlayers();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  /* ─── PLAYER STATUS HISTORY MODAL ──────────────────────── */

  const openPlayerHistory = async () => {
    const id = parseInt(document.getElementById('edit-id').value, 10);
    if (!id) return;
    const player = allPlayers.find((x) => x.id === id);
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

  /* ─── SHARE PAGE ───────────────────────────────────────── */

  const loadSharePage = async () => {
    // Load both ladders and tournaments in parallel
    let ladders = [], tournaments = [];
    try {
      [ladders, tournaments] = await Promise.all([
        api('ladders?select=*&order=id.desc'),
        api('tournaments?select=*&order=id.desc'),
      ]);
    } catch (e) {
      toast(`Error loading share data: ${e.message}`, true);
    }

    const baseLadderUrl =
      window.location.origin + window.location.pathname.replace('index.html', '') + 'players.html';
    const baseTourneyUrl =
      window.location.origin + window.location.pathname.replace('index.html', '') + 'tournament-results.html';

    const renderShareRow = (item, url, btnId, statusColor, statusLabel) => `
      <div class="list-row share-row" data-name="${esc(item.name).toLowerCase()}" data-url="${esc(url)}">
        <div class="row-between">
          <div>
            <div class="text-bold text-14">${esc(item.name)}</div>
            <div class="text-bold text-uppercase mt-4" style="font-size:11px;color:${statusColor};letter-spacing:.5px;">${statusLabel}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn btn-outline btn-sm" data-action="showShareQR" data-url="${esc(url)}"
              style="font-size:11px;">QR</button>
            <button class="btn btn-primary btn-sm" data-action="copyShareLink"
              data-url="${esc(url)}" data-btnid="${btnId}" id="${btnId}">Copy link</button>
          </div>
        </div>
        <div class="url-box">${esc(url)}</div>
      </div>`;

    // Render ladders list
    const ladderListEl = document.getElementById('share-ladder-list');
    if (!ladders.length) {
      ladderListEl.innerHTML = '<div class="empty">No ladders yet. Create one in the Ladders tab.</div>';
    } else {
      ladderListEl.innerHTML = ladders.map((l) => {
        const url = `${baseLadderUrl}?l=${btoa(String(l.id))}`;
        const statusColor = l.status === 'active' ? 'var(--teal)' : 'var(--text-muted)';
        return renderShareRow(l, url, `copy-ladder-${l.id}`, statusColor, l.status);
      }).join('');
    }

    // Render tournaments list
    const tourneyListEl = document.getElementById('share-tournament-list');
    if (!tournaments.length) {
      tourneyListEl.innerHTML = '<div class="empty">No tournaments yet. Create one in the Tournaments tab.</div>';
    } else {
      tourneyListEl.innerHTML = tournaments.map((t) => {
        const url = `${baseTourneyUrl}?t=${btoa(String(t.id))}`;
        const statusColor = t.status === 'active' ? 'var(--teal)' : t.status === 'completed' ? 'var(--blue)' : 'var(--text-muted)';
        return renderShareRow(t, url, `copy-tournament-${t.id}`, statusColor, t.status);
      }).join('');
    }

    // Wire up search inputs
    const wireSearch = (inputId, listId) => {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        document.querySelectorAll(`#${listId} .share-row`).forEach((row) => {
          const name = row.dataset.name || '';
          row.style.display = name.includes(q) ? '' : 'none';
        });
      });
    };
    wireSearch('share-search-ladders', 'share-ladder-list');
    wireSearch('share-search-tournaments', 'share-tournament-list');
  };

  const switchShareTab = (btn) => {
    const tab = btn.dataset.tab;
    // Update tab button styles
    document.querySelectorAll('.share-tab').forEach((b) => {
      const isActive = b.dataset.tab === tab;
      b.classList.toggle('active', isActive);
      b.style.color = isActive ? 'var(--blue)' : 'var(--text-muted)';
      b.style.borderBottomColor = isActive ? 'var(--lime)' : 'transparent';
    });
    // Show/hide panels
    document.getElementById('share-tab-ladders').style.display = tab === 'ladders' ? '' : 'none';
    document.getElementById('share-tab-tournaments').style.display = tab === 'tournaments' ? '' : 'none';
    // Hide QR panel when switching tabs
    document.getElementById('share-qr-panel').style.display = 'none';
  };

  const showShareQR = (btn) => {
    const url = btn.dataset.url;
    const panel = document.getElementById('share-qr-panel');
    const qrEl = document.getElementById('share-qr-code');
    const urlEl = document.getElementById('share-qr-url');
    // Clear old QR
    qrEl.innerHTML = '';
    urlEl.textContent = url;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // Generate QR
    new QRCode(qrEl, {
      text: url,
      width: 180,
      height: 180,
      colorDark: '#0d1f4a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
  };

  const copyShareLink = (url, btnId) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        const btn = document.getElementById(btnId);
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = 'Copied!';
          btn.style.background = 'var(--teal)';
          setTimeout(() => {
            btn.textContent = orig;
            btn.style.background = '';
          }, 2000);
        }
        toast('Link copied to clipboard!');
      })
      .catch(() => {
        toast('Could not copy. Please copy the link manually.', true);
      });
  };

  /* ─── EMAIL NOTIFICATIONS ──────────────────────────────── */

  const NOTIFY_TEMPLATES = {
    welcome: {
      subject: '🏓 Welcome to the {{ladder}} — Guidelines & Schedule',
      message: `I hope this message finds you well.

I'm excited to share that our upcoming Pickleball Ladder will officially begin on Saturday, April 18, 2026, with sessions taking place every Saturday from 1:30 PM to 3:00 PM for six consecutive weeks.

Saturday April, 18 2026 (1:30 pm to 3:00 pm)
Saturday April, 25 2026 (1:30 pm to 3:00 pm)
Saturday May, 2 2026 (1:30 pm to 3:00 pm)
Saturday May, 9 2026 (1:30 pm to 3:00 pm)
Saturday May, 16 2026 (1:30 pm to 3:00 pm)
Saturday May, 23 2026 (1:30 pm to 3:00 pm)

🏓 Ladder Structure Overview

Format: Players will be randomly organized into groups of 4 or 5 for the first week. Starting from week 2, players will be organized based on their performance and points earned.

Match Style: Round-robin format within each group. Players will partner with and against everyone in their group.

Scoring: Games are played to 11 points (WIN BY 1).

Ranking Updates: Player rankings will be updated weekly according to total points earned.

Co-ed Participation: All players are welcome, regardless of gender.

Attendance: If you are unable to attend on a given week, please notify the organizer by the app (TeamReach) or by texting or calling to 786-241-7035 (Leminyer Zapata).

🧮 New Ladder Scoring System

✅ Win a match: +4 points
🤝🏼 Lose by 1-2 points (11-10, 11-9): +3 points
🎯 Lose by 3-4 points (11-8, 11-7): +2 points
🎁 Lose by 5-8 points (11-6 to 11-3): +1 points
🚫 Lose by 9-11 points (11-2, 11-1, 11-0): 0 points
⚠️ Default / No-Show: –1 points per match (applies if the player does not notify the organizer at least 24 hours before the time the ladder starts).

This new system is designed to reward not just wins but also competitive performance and tight matches.

📋 Additional Guidelines

Court Etiquette: Please be respectful and avoid interrupting play on adjacent courts.

Punctuality: Matches start promptly at 1:30 PM. Late arrivals may result in forfeits. You can get to the park earlier (around 1:00 pm).

Sportsmanship: Great sportsmanship is expected from all. Let's keep it friendly, fun, and welcoming!

Disputes, questions or concerns: Any issues should be reported directly to the organizer immediately. His decision will be final.

Line Calls: Are made by the team on the side the ball lands. Let's be fair and respectful.

Warnings/Penalties: Use of profanity is not allowed. Throwing paddles, aggressive behavior, or any form of violence will not be tolerated. Any player who engages in these actions will receive a warning for the first offense; a second offense will result in a one-week suspension. If the behavior persists, the player will be removed from the ladder.

Bring Your Own Balls 🏓
Stay Hydrated! Don't forget your water bottle! 💧

Conduct Policy — Profanity & Unsportsmanlike Behavior

Profanity, verbal abuse, aggressive behavior, and throwing paddles or other equipment are strictly prohibited.

Penalties:
• First offense: Formal warning
• Second offense: Match forfeiture
• Further offenses: Removal from the ladder

If you have any questions please feel free to reach out.

I'm looking forward to an amazing season of friendly competition and good vibes on the courts! 🎾🔥`,
    },
    scores: {
      subject: '🏆 Scores Updated — {{ladder}}',
      message:
        'The scores for the {{ladder}} ladder have just been updated!\n\nCheck the latest standings and see where you stand on the leaderboard.',
    },
    reminder: {
      subject: '⏰ Session Reminder — {{ladder}}',
      message:
        "This is a friendly reminder that your next pickleball session for the {{ladder}} ladder is coming up soon.\n\nMake sure you're ready to play your best game!",
    },
    end: {
      subject: '🏆 End of {{ladder}} — Congratulations!',
      message:
        'The {{ladder}} ladder has officially come to an end!\n\nThank you for your participation and great sportsmanship. Check the final standings to see how you finished.',
    },
    custom: {
      subject: '',
      message: '',
    },
  };

  const setNotifyTemplate = (type) => {
    const t = NOTIFY_TEMPLATES[type];
    if (!t) return;
    const ladderName = currentLadder ? currentLadder.name : 'ladder';
    document.getElementById('notify-subject').value = t.subject.replaceAll('{{ladder}}', ladderName);
    document.getElementById('notify-message').value = t.message.replaceAll('{{ladder}}', ladderName);
  };

  const openNotifyPlayers = () => {
    if (!currentLadder) {
      toast('Please select a ladder first.', true);
      return;
    }
    const emailPlayers = ladderPlayers.filter((p) => p.email && p.ladder_status === 'active');
    document.getElementById('notify-recipient-count').innerHTML =
      `<span class="text-bold color-teal">${emailPlayers.length} active players with email</span> in <strong>${esc(currentLadder.name)}</strong> will receive this email.`;
    setNotifyTemplate('welcome');
    document.getElementById('notify-type').value = 'welcome';
    document.getElementById('notify-modal').classList.add('open');
  };

  // Send a single email with one retry on failure.
  // Returns true on success, false on permanent failure.
  async function sendOneEmail(serviceId, templateId, params) {
    try {
      await emailjs.send(serviceId, templateId, params);
      return true;
    } catch (err) {
      // Brief backoff, then one retry
      await sleep(CFG.EMAIL_RETRY_DELAY_MS);
      try {
        await emailjs.send(serviceId, templateId, params);
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  // Warn user before they navigate away mid-send
  let _emailInFlight = false;
  function beforeUnloadGuard(e) {
    if (_emailInFlight) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  }
  window.addEventListener('beforeunload', beforeUnloadGuard);

  const sendNotifications = async (e) => {
    e.preventDefault();
    if (!currentLadder) return;

    const subject = document.getElementById('notify-subject').value.trim();
    const message = document.getElementById('notify-message').value.trim();
    if (!subject || !message) {
      toast('Please fill in subject and message.', true);
      return;
    }
    const emailPlayers = ladderPlayers.filter((p) => p.email && p.ladder_status === 'active');
    if (!emailPlayers.length) {
      toast('No players to notify.', true);
      return;
    }

    const encoded = btoa(String(currentLadder.id));
    const baseUrl =
      window.location.origin + window.location.pathname.replace('index.html', '') + 'players.html';
    const leaderboardUrl = `${baseUrl}?l=${encoded}`;

    const sendBtn = document.getElementById('notify-send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    _emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    let sent = 0;
    const failedRecipients = [];

    for (const player of emailPlayers) {
      const ok = await sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.LADDER_NOTIFY, {
        player_name: `${player.first_name} ${player.last_name}`,
        player_email: player.email,
        subject,
        message,
        leaderboard_url: leaderboardUrl,
      });
      if (ok) {
        sent++;
      } else {
        failedRecipients.push(player.email);
      }
      sendBtn.textContent = `Sending... ${sent + failedRecipients.length}/${emailPlayers.length}`;
      // Throttle so we don't trip rate limits
      if (sent + failedRecipients.length < emailPlayers.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    _emailInFlight = false;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send emails';
    document.getElementById('notify-modal').classList.remove('open');

    if (!failedRecipients.length) {
      toast(`✅ ${sent} emails sent successfully!`);
    } else {
      const failedList = failedRecipients.slice(0, 3).join(', ');
      const more = failedRecipients.length > 3 ? ` (+${failedRecipients.length - 3} more)` : '';
      toast(`Sent ${sent}. Failed: ${failedList}${more}`, true);
    }
  };

  /* ─── TOURNAMENT NOTIFY ────────────────────────────────── */

  // Opens the tournament notify modal, pre-filled with a default subject/message.
  // tournamentId and tournamentName are passed from tournament.js via window.app.
  const openTournamentNotifyModal = async (tournamentId) => {
    if (!tournamentId) { toast('No tournament selected.', true); return; }

    // Fetch tournament name + all teams in parallel
    let tournament, categories = [], teams = [];
    try {
      [[tournament], categories] = await Promise.all([
        api(`tournaments?id=eq.${tournamentId}&select=id,name`),
        api(`tournament_categories?tournament_id=eq.${tournamentId}&select=id`),
      ]);
      if (!tournament) { toast('Tournament not found.', true); return; }
      if (!categories.length) { toast('No categories found for this tournament.', true); return; }
      const catIds = categories.map(c => c.id).join(',');
      teams = await api(
        `tournament_teams?category_id=in.(${catIds})&select=player1_id,player2_id,player3_id,player4_id`
      );
    } catch (err) {
      toast(`Error loading tournament data: ${err.message}`, true);
      return;
    }

    const tournamentName = tournament.name;

    // Collect all unique player IDs across all teams
    const playerIds = [...new Set(
      teams.flatMap(t => [t.player1_id, t.player2_id, t.player3_id, t.player4_id].filter(Boolean))
    )];

    if (!playerIds.length) { toast('No players found in this tournament.', true); return; }

    // Fetch player emails
    let players = [];
    try {
      players = await api(
        `players?id=in.(${playerIds.join(',')})&select=id,first_name,last_name,email&order=first_name`
      );
    } catch (err) {
      toast(`Error loading player emails: ${err.message}`, true);
      return;
    }

    const emailPlayers = players.filter(p => p.email);
    if (!emailPlayers.length) { toast('No players with email addresses found.', true); return; }

    document.getElementById('t-notify-recipient-count').innerHTML =
      `<span class="text-bold color-teal">${emailPlayers.length} player${emailPlayers.length !== 1 ? 's' : ''} with email</span> across all categories of <strong>${esc(tournamentName)}</strong> will receive this email.`;

    // Pre-fill default subject and message
    document.getElementById('t-notify-subject').value =
      `🏆 ${tournamentName} — Your Results Are Ready`;
    document.getElementById('t-notify-message').value =
      `Hi {{player_name}},\n\nThe results for ${tournamentName} are now available. Click the link below to view your standings, bracket results, and more.\n\nThank you for participating and congratulations to all players on a great tournament!\n\nFerocia Sports Center`;

    // Store on modal for use by sendTournamentNotify
    const modal = document.getElementById('tournament-notify-modal');
    modal._tournamentId = tournamentId;
    modal._tournamentName = tournamentName;
    modal._emailPlayers = emailPlayers;
    modal.classList.add('open');
  };

  const closeTournamentNotifyModal = () => {
    document.getElementById('tournament-notify-modal').classList.remove('open');
  };

  const sendTournamentNotify = async (e) => {
    e.preventDefault();
    const modal = document.getElementById('tournament-notify-modal');
    const { _tournamentId, _tournamentName, _emailPlayers } = modal;
    if (!_tournamentId || !_emailPlayers?.length) return;

    const subject = document.getElementById('t-notify-subject').value.trim();
    const message = document.getElementById('t-notify-message').value.trim();
    if (!subject || !message) { toast('Please fill in subject and message.', true); return; }

    // Build tournament results URL
    const baseTourneyUrl =
      window.location.origin + window.location.pathname.replace('index.html', '') + 'tournament-results.html';
    const resultsUrl = `${baseTourneyUrl}?t=${btoa(String(_tournamentId))}`;

    const sendBtn = document.getElementById('t-notify-send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    _emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    let sent = 0;
    const failedRecipients = [];

    for (const player of _emailPlayers) {
      const playerMsg = message.replace('{{player_name}}', `${player.first_name} ${player.last_name}`);
      const ok = await sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.LADDER_NOTIFY, {
        player_name: `${player.first_name} ${player.last_name}`,
        player_email: player.email,
        subject,
        message: playerMsg,
        leaderboard_url: resultsUrl,
      });
      if (ok) sent++;
      else failedRecipients.push(player.email);
      sendBtn.textContent = `Sending... ${sent + failedRecipients.length}/${_emailPlayers.length}`;
      if (sent + failedRecipients.length < _emailPlayers.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    _emailInFlight = false;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send emails';
    closeTournamentNotifyModal();

    if (!failedRecipients.length) {
      toast(`✅ ${sent} emails sent successfully!`);
    } else {
      const failedList = failedRecipients.slice(0, 3).join(', ');
      const more = failedRecipients.length > 3 ? ` (+${failedRecipients.length - 3} more)` : '';
      toast(`Sent ${sent}. Failed: ${failedList}${more}`, true);
    }
  };

  /* ─── PROMOTIONS ───────────────────────────────────────── */

  const loadPromotionsPage = async () => {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.getElementById('page-promotions').classList.add('active');
    document.getElementById('subnav-management').style.display = 'flex';
    document.getElementById('tab-home').classList.remove('active');
    document
      .querySelectorAll('#subnav-management button')
      .forEach((b) => b.classList.toggle('active', b.dataset.page === 'promotions'));
    await loadSubscribers();
  };

  const loadSubscribers = async () => {
    const filter = document.getElementById('sub-status-filter')?.value || 'all';
    const search = document.getElementById('sub-search')?.value.toLowerCase().trim() || '';
    let query = 'subscribers?select=*&order=subscribed_at.desc';
    if (filter !== 'all') query += `&status=eq.${filter}`;
    let subs = [];
    try {
      subs = await api(query);
    } catch (e) {
      document.getElementById('subscribers-table').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
      return;
    }
    const filtered = subs.filter((s) => {
      if (!search) return true;
      return `${s.first_name} ${s.last_name} ${s.email}`.toLowerCase().includes(search);
    });
    document.getElementById('sub-count').textContent = `${filtered.length}`;
    const statusColors = {
      active: 'var(--teal)',
      pending: 'var(--orange)',
      unsubscribed: 'var(--text-muted)',
    };
    document.getElementById('subscribers-table').innerHTML = filtered.length
      ? `<table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Skill</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>${filtered
            .map(
              (s) => `<tr>
                <td class="text-bold">${esc(s.first_name)} ${esc(s.last_name)}</td>
                <td style="font-size:12px;">${esc(s.email)}</td>
                <td style="font-size:12px;">${esc(s.phone || '—')}</td>
                <td style="font-size:12px;text-transform:capitalize;">${esc(s.skill_level || '—')}</td>
                <td><span class="text-bolder text-uppercase" style="font-size:10px;color:${statusColors[s.status] || 'var(--text-muted)'};">${esc(s.status)}</span></td>
                <td class="text-muted-12">${fmtDate(s.subscribed_at) || '—'}</td>
              </tr>`,
            )
            .join('')}</tbody>
        </table>`
      : '<div class="empty">No subscribers found.</div>';
  };

  const generateQR = () => {
    const baseUrl =
      window.location.origin + window.location.pathname.replace('index.html', '') + 'subscribe.html';
    document.getElementById('subscribe-url-display').textContent = baseUrl;
    document.getElementById('qr-container').style.display = 'block';
    const qrEl = document.getElementById('qr-code');
    qrEl.innerHTML = '';
    /* eslint-disable no-new, no-undef */
    new QRCode(qrEl, {
      text: baseUrl,
      width: 160,
      height: 160,
      colorDark: '#174CCC',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
    /* eslint-enable */
  };

  const openSendPromo = async () => {
    let subs = [];
    try {
      subs = await api('subscribers?status=eq.active&select=id');
    } catch (e) {
      toast(`Error: ${e.message}`, true);
      return;
    }
    document.getElementById('promo-recipient-count').innerHTML =
      `<span class="text-bold color-teal">${subs.length} active subscribers</span> will receive this email.`;
    document.getElementById('promo-subject').value = '';
    document.getElementById('promo-message').value = '';
    document.getElementById('promo-modal').classList.add('open');
  };

  const sendPromoEmail = async (e) => {
    e.preventDefault();
    const subject = document.getElementById('promo-subject').value.trim();
    const message = document.getElementById('promo-message').value.trim();
    if (!subject || !message) {
      toast('Please fill in subject and message.', true);
      return;
    }
    let subs = [];
    try {
      subs = await api('subscribers?status=eq.active&select=*');
    } catch (err) {
      toast(`Error: ${err.message}`, true);
      return;
    }
    if (!subs.length) {
      toast('No active subscribers to send to.', true);
      return;
    }

    const sendBtn = document.getElementById('promo-send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    _emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    const baseUrl = window.location.origin + window.location.pathname.replace('index.html', '');
    let sent = 0;
    const failedRecipients = [];

    for (const sub of subs) {
      const unsubUrl = `${baseUrl}unsubscribe.html?t=${sub.unsubscribe_token}`;
      const ok = await sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.PROMO, {
        player_name: `${sub.first_name} ${sub.last_name}`,
        player_email: sub.email,
        subject,
        message,
        unsubscribe_url: unsubUrl,
      });
      if (ok) sent++;
      else failedRecipients.push(sub.email);
      sendBtn.textContent = `Sending... ${sent + failedRecipients.length}/${subs.length}`;
      if (sent + failedRecipients.length < subs.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    _emailInFlight = false;
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send emails';
    document.getElementById('promo-modal').classList.remove('open');
    if (!failedRecipients.length) {
      toast(`✅ ${sent} promotional emails sent!`);
    } else {
      const failedList = failedRecipients.slice(0, 3).join(', ');
      const more = failedRecipients.length > 3 ? ` (+${failedRecipients.length - 3} more)` : '';
      toast(`Sent ${sent}. Failed: ${failedList}${more}`, true);
    }
  };

  /* ─── EVENT DELEGATION ─────────────────────────────────── */

  // Click handler — looks up the action handler for any [data-action] click
  const CLICK_HANDLERS = {
    // Navigation
    showPage: (btn) => showPage(btn.dataset.page, btn),
    switchTab: (btn) => switchMainTab(btn.dataset.tab),
    switchProgramTab: (btn) => switchProgramTab(btn.dataset.tab),
    goHome: () => goHome(),
    // Court / session entry
    addCourtPlayerBtn: (btn) => addCourtPlayer(parseInt(btn.dataset.pid, 10)),
    markNoShow: (btn) => markNoShow(btn.dataset.pid),
    cancelNoShow: () => cancelNoShow(),
    removeCourtPlayerBtn: (btn) => removeCourtPlayer(parseInt(btn.dataset.pid, 10)),
    addExtraGame: () => addExtraGame(),
    removeExtraGame: (btn) => removeExtraGame(parseInt(btn.dataset.gamenum, 10)),
    toggleVoid: (btn) => toggleVoid(parseInt(btn.dataset.gamenum, 10)),
    submitSession: () => submitSession(),
    // Sessions
    editGame: (btn) => editGame(btn),
    deleteSession: (btn) => deleteSession(btn),
    editSession: (btn) => editSession(btn),
    toggleEditGameVoid: () => toggleEditGameVoid(),
    // Ladders
    openLadderPlayers: (btn) =>
      openLadderPlayers(parseInt(btn.dataset.lid, 10), btn.dataset.lname),
    openEditLadder: (btn) => openEditLadder(parseInt(btn.dataset.lid, 10)),
    toggleLadderStatus: (btn) =>
      toggleLadderStatus(parseInt(btn.dataset.lid, 10), btn.dataset.lstatus),
    deleteLadder: (btn) => deleteLadder(parseInt(btn.dataset.lid, 10), btn.dataset.lname),
    // Ladder players modal
    lpToggleAll: (btn) => lpToggleAll(btn),
    lpSaveChanges: () => lpSaveChanges(),
    closeLpModal: () => closeLpModal(),
    // Players
    openEdit: (btn) => openEdit(parseInt(btn.dataset.pid, 10)),
    closeModal: () => closeModal(),
    openPlayerHistory: () => openPlayerHistory(),
    closePlayerHistory: () => closePlayerHistory(),
    // Modals
    closeEditLadderModal: () => closeEditLadderModal(),
    closeEditGameModal: () =>
      document.getElementById('edit-game-modal').classList.remove('open'),
    closeNotifyModal: () => document.getElementById('notify-modal').classList.remove('open'),
    closePromoModal: () => document.getElementById('promo-modal').classList.remove('open'),
    closeEditSessionModal: () =>
      document.getElementById('edit-session-modal').classList.remove('open'),
    // Notify / promo
    openNotifyPlayers: () => openNotifyPlayers(),
    openSendPromo: () => openSendPromo(),
    generateQR: () => generateQR(),
    // Share
    copyShareLink: (btn) => copyShareLink(btn.dataset.url, btn.dataset.btnid),
    // Auth
    signOut: async () => {
      const ok = await confirmModal({
        title: 'Sign out?',
        message: 'You will need to sign in again to access the admin area.',
        okLabel: 'Sign out',
      });
      if (ok) window.auth.signOut();
    },
    // Share Links
    switchShareTab: (btn) => switchShareTab(btn),
    showShareQR: (btn) => showShareQR(btn),
    // Tournament notify
    closeTournamentNotifyModal: () => closeTournamentNotifyModal(),
    // Print Roster
    printRoster: (btn) => printRoster(btn),
  };

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const handler = CLICK_HANDLERS[btn.dataset.action];
    if (handler) handler(btn);
  });

  // Change handler — for selects / radios that need a custom action
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.action === 'lpChangeStatus') {
      lpChangeStatus(el);
      return;
    }
    if (el.name === 'noshow-penalty') {
      noShowPenalty = parseInt(el.value, 10);
      return;
    }
    if (el.id === 'notify-type') {
      setNotifyTemplate(el.value);
      return;
    }
    if (el.id === 'gender-filter') {
      renderLadder();
      return;
    }
    if (el.id === 'edit-status') {
      // Toggle the inactivation-reason textarea when admin changes status in Edit modal
      updateReasonVisibility();
      // Hide any stale required-field error when user navigates back to active
      const errEl = document.getElementById('edit-reason-error');
      if (errEl) errEl.style.display = 'none';
      return;
    }
  });

  // Input handler — search + auto-calc previews
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'lp-search') {
      const q = el.value.toLowerCase();
      document.querySelectorAll('#lp-enrolled .lp-player-row').forEach((row) => {
        row.style.display = row.dataset.name.includes(q) ? '' : 'none';
      });
      return;
    }
    if (el.id === 'player-search-entry') {
      searchPlayersEntry();
      return;
    }
    // Edit-game modal: recompute points when scores change
    const rid = el.dataset.egrid;
    if (rid) {
      const sf = document.getElementById(`eg-sf-${rid}`);
      const sa = document.getElementById(`eg-sa-${rid}`);
      const pts = document.getElementById(`eg-pts-${rid}`);
      if (sf && sa && pts && sf.value !== '' && sa.value !== '') {
        pts.value = calcPoints(parseInt(sf.value, 10), parseInt(sa.value, 10));
      }
    }
    // When any score input changes, update save button label dynamically
    if (el.classList.contains('score-input')) {
      const anyScore = document.querySelectorAll('.score-input');
      const hasAnyScore = [...anyScore].some((inp) => inp.value !== '');
      const btn = document.getElementById('save-session-btn');
      const hint = document.getElementById('save-session-hint');
      if (btn) btn.textContent = hasAnyScore ? 'Save Session' : 'Save Roster';
      if (hint) hint.style.display = hasAnyScore ? 'none' : '';
    }
    // Extra game / game-4 score inputs
    const egame = el.dataset.egame;
    if (egame) {
      autoCalcExtraGame(parseInt(egame, 10));
    }
    // Round-robin auto-calc preview
    const ascore = el.dataset.autoscore;
    if (ascore) {
      autoCalcGame(parseInt(ascore, 10));
    }
  });

  /* ─── BOOT ─────────────────────────────────────────────── */

  document.getElementById('last-updated').textContent = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Default to home page on load
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('tab-home').classList.add('active');
  document.getElementById('subnav-programs').style.display = 'none';
  document.getElementById('subnav-management').style.display = 'none';
  document.getElementById('subnav-ladder-options').style.display = 'none';
  document.getElementById('subnav-tournament-options').style.display = 'none';
  document.getElementById('tab-home').dataset.action = 'goHome';

  // Form listeners — these only attach event handlers, no data fetched yet,
  // so safe to wire up before auth resolves.
  document.getElementById('create-ladder-form').addEventListener('submit', createLadder);
  document.getElementById('edit-game-form').addEventListener('submit', saveEditGame);
  document.getElementById('ladder-selector').addEventListener('change', onLadderChange);
  document.getElementById('tournament-selector')?.addEventListener('change', onTournamentChange);
  document.getElementById('edit-session-form').addEventListener('submit', saveEditSession);
  document.getElementById('notify-form').addEventListener('submit', sendNotifications);
  document.getElementById('promo-form').addEventListener('submit', sendPromoEmail);
  document.getElementById('t-notify-form').addEventListener('submit', sendTournamentNotify);
  document.getElementById('sub-status-filter')?.addEventListener('change', loadSubscribers);
  document.getElementById('sub-search')?.addEventListener('input', loadSubscribers);
  document.getElementById('player-status-filter')?.addEventListener('change', filterPlayers);
  document.getElementById('player-search')?.addEventListener('input', filterPlayers);
  document.querySelector('#edit-ladder-modal form')?.addEventListener('submit', saveEditLadder);
  document.querySelector('#edit-modal form')?.addEventListener('submit', saveEditPlayer);
  document.querySelector('#page-add-player form')?.addEventListener('submit', addPlayer);

  // Expose helpers that tournament.js (loaded right after this file) needs.
  // Done BEFORE requireAuth so tournament.js can read it synchronously.
  window.app = {
    api,
    toast,
    confirmModal,
    fmtDate,
    esc,
    escapeHtml,
    sleep,
    showPage,
    openTournamentNotifyModal,  // called by tournament.js notify button
  };

  // Track auth state so tournament.js can wait on it too
  window.app.authReady = new Promise((resolve) => {
    window.app._resolveAuthReady = resolve;
  });

  // Wait for auth before loading any data. requireAuth() shows the
  // login modal if not signed in; once signed in, our callback fires.
  window.auth.requireAuth(() => {
    // Show the sign-out button now that we're authenticated
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) signOutBtn.style.display = 'inline-block';

    // Kick off the data load
    loadLadderSelector();

    // Let tournament.js (and anything else waiting on auth) proceed
    if (window.app._resolveAuthReady) {
      window.app._resolveAuthReady();
      window.app._resolveAuthReady = null;
    }
  });
})();
