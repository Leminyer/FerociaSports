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
      const grouped = {};
      matches.forEach((m) => {
        const key = `${m.session_date}__${m.court_group}`;
        if (!grouped[key]) grouped[key] = { date: m.session_date, group: m.court_group, games: {} };
        if (!grouped[key].games[m.game_number]) grouped[key].games[m.game_number] = [];
        grouped[key].games[m.game_number].push(m);
      });
      let html = '';
      Object.values(grouped).forEach((s) => {
        const date = fmtDate(s.date, {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
        const sessionMatchIds = Object.values(s.games)
          .flat()
          .map((m) => m.id)
          .join(',');
        html += `<div class="session-block">
          <div class="row-between mb-8">
            <div class="blue-tag">${date} — Court ${s.group}</div>
            <div class="row gap-6">
              <button class="btn btn-outline btn-sm" data-action="editSession" data-matchids="${sessionMatchIds}" data-date="${esc(s.date)}" data-court="${s.group}">Edit session</button>
              <button class="btn btn-danger btn-sm" data-action="deleteSession" data-matchids="${sessionMatchIds}" data-date="${esc(s.date)}" data-court="${s.group}">Delete session</button>
            </div>
          </div>`;
        Object.entries(s.games).forEach(([gnum, players]) => {
          const gameIds = players.map((p) => p.id).join(',');
          html += `<div class="game-row">
            <div class="row-between gap-6">
              <div class="row-wrap gap-6">
                <span class="label-tag" style="margin-right:4px;">Game ${gnum}</span>`;
          players.forEach((p) => {
            const name = p.players ? `${p.players.first_name} ${p.players.last_name}` : 'Unknown';
            const score = p.score_for !== null ? `${p.score_for}-${p.score_against}` : '-';
            const pts = p.default_no_show ? '-1' : `+${p.points_earned}`;
            const color = p.default_no_show
              ? 'var(--orange)'
              : p.is_sub
                ? 'var(--text-muted)'
                : 'var(--teal)';
            const subTag = p.is_sub ? '<span class="sub-pill">SUB</span>' : '';
            html += `<span style="margin-right:10px;font-weight:500">${esc(name)}${subTag} <span style="color:${color};font-weight:700">${score}/${pts}pts</span></span>`;
          });
          html += `</div>
              <div class="row gap-6 flex-shrink-0">
                <button class="btn btn-outline btn-sm" data-action="editGame" data-gameids="${gameIds}" data-gnum="${gnum}" data-date="${esc(s.date)}" data-court="${s.group}">Edit</button>
              </div>
            </div>
          </div>`;
        });
        html += '</div>';
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
    try {
      // Build per-id PATCHes; we still need separate calls because each row has unique values
      // But we run them in parallel.
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

    // Validate game 4 (4-player closest scores) has all players selected
    if (courtPlayers.length === 4) {
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

    // Validate scores
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
      const isExtraGame = gameNum > 100 || (gameNum === 4 && courtPlayers.length === 4);
      if (isExtraGame) {
        tAIds = [
          document.getElementById(`extraA1-${gameNum}`)?.value,
          document.getElementById(`extraA2-${gameNum}`)?.value,
        ]
          .filter(Boolean)
          .map(Number);
        tBIds = [
          document.getElementById(`extraB1-${gameNum}`)?.value,
          document.getElementById(`extraB2-${gameNum}`)?.value,
        ]
          .filter(Boolean)
          .map(Number);
      } else {
        tAIds =
          document.getElementById(`teamA-ids-${gameNum}`)?.value.split(',').filter(Boolean).map(Number) ||
          [];
        tBIds =
          document.getElementById(`teamB-ids-${gameNum}`)?.value.split(',').filter(Boolean).map(Number) ||
          [];
      }
      tAIds.forEach((pid) => {
        if (!pid) return;
        const pA = ladderPlayers.find((p) => p.id === pid);
        const isSubA = pA?.ladder_status === 'sub';
        rows.push({
          session_date: date,
          court_group: parseInt(courtNum, 10),
          player_id: pid,
          game_number: extraGameMap[gameNum] || gameNum,
          score_for: isVoided ? null : scoreA,
          score_against: isVoided ? null : scoreB,
          points_earned: isSubA ? 0 : ptA,
          is_sub: isSubA,
          default_no_show: false,
          ladder_id: currentLadder.id,
        });
      });
      tBIds.forEach((pid) => {
        if (!pid) return;
        const pB = ladderPlayers.find((p) => p.id === pid);
        const isSubB = pB?.ladder_status === 'sub';
        rows.push({
          session_date: date,
          court_group: parseInt(courtNum, 10),
          player_id: pid,
          game_number: extraGameMap[gameNum] || gameNum,
          score_for: isVoided ? null : scoreB,
          score_against: isVoided ? null : scoreA,
          points_earned: isSubB ? 0 : ptB,
          is_sub: isSubB,
          default_no_show: false,
          ladder_id: currentLadder.id,
        });
      });
    }
    if (noShowPlayer) {
      rows.push({
        session_date: date,
        court_group: parseInt(courtNum, 10),
        player_id: noShowPlayer.id,
        game_number: 1,
        score_for: null,
        score_against: null,
        points_earned: noShowPenalty,
        is_sub: noShowPlayer.ladder_status === 'sub',
        default_no_show: true,
        ladder_id: currentLadder.id,
      });
    }
    if (!rows.length) {
      toast('No scores entered yet.', true);
      return;
    }
    try {
      // Single batch insert — atomic on the server
      await api('matches', 'POST', rows);
      toast(`Session saved! ${rows.length} entries recorded.`);
      initEntry();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  /* ─── PLAYERS ──────────────────────────────────────────── */

  const filterPlayers = () => {
    const q = document.getElementById('player-search').value.toLowerCase().trim();
    const statusFilter = document.getElementById('player-status-filter')?.value || 'all';
    document.querySelectorAll('#players-table tbody tr').forEach((row) => {
      const name = row.querySelector('td')?.textContent.toLowerCase() || '';
      const statusCell = row.querySelectorAll('td')[4]?.textContent.toLowerCase() || '';
      const nameMatch = name.includes(q);
      const statusMatch = statusFilter === 'all' || statusCell.includes(statusFilter);
      row.style.display = nameMatch && statusMatch ? '' : 'none';
    });
  };

  const loadPlayers = async () => {
    try {
      allPlayers = await api('players?select=*&order=first_name');
      if (!allPlayers.length) {
        document.getElementById('players-table').innerHTML =
          '<div class="empty">No players yet.</div>';
        return;
      }
      const rows = allPlayers
        .map(
          (p) => `
        <tr>
          <td class="text-bold">${esc(p.first_name)} ${esc(p.last_name)}</td>
          <td class="text-muted-12">${esc(p.gender || '-')}</td>
          <td class="text-muted-12">${esc(p.email || '-')}</td>
          <td class="text-muted-12">${esc(p.phone || '-')}</td>
          <td><span class="badge badge-${esc(p.status)}">${esc(p.status)}</span></td>
          <td class="text-muted-12">${fmtDate(p.date_joined) || '-'}</td>
          <td><button class="btn btn-outline btn-sm" data-action="openEdit" data-pid="${p.id}">Edit</button></td>
        </tr>`,
        )
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

  const openEdit = (id) => {
    const p = allPlayers.find((x) => x.id === id);
    if (!p) return;
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-first').value = p.first_name;
    document.getElementById('edit-last').value = p.last_name;
    document.getElementById('edit-email').value = p.email || '';
    document.getElementById('edit-phone').value = p.phone || '';
    document.getElementById('edit-gender').value = p.gender || '';
    document.getElementById('edit-status').value = p.status || 'active';
    document.getElementById('edit-modal').classList.add('open');
  };

  const closeModal = () => document.getElementById('edit-modal').classList.remove('open');

  const saveEditPlayer = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const body = {
      first_name: document.getElementById('edit-first').value.trim(),
      last_name: document.getElementById('edit-last').value.trim(),
      email: document.getElementById('edit-email').value.trim() || null,
      phone: document.getElementById('edit-phone').value.trim() || null,
      gender: document.getElementById('edit-gender').value || null,
      status: document.getElementById('edit-status').value,
    };
    try {
      await api(`players?id=eq.${id}`, 'PATCH', body);
      toast('Player updated!');
      closeModal();
      loadPlayers();
      allPlayers = [];
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  /* ─── SHARE PAGE ───────────────────────────────────────── */

  const loadSharePage = async () => {
    let ladders = [];
    try {
      ladders = await api('ladders?select=*&order=id.desc');
    } catch (e) {
      document.getElementById('share-ladder-list').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
      return;
    }
    const el = document.getElementById('share-ladder-list');
    if (!ladders.length) {
      el.innerHTML = '<div class="empty">No ladders yet. Create one in the Ladders tab.</div>';
      return;
    }
    const baseUrl =
      window.location.origin + window.location.pathname.replace('index.html', '') + 'players.html';
    el.innerHTML = ladders
      .map((l) => {
        const encoded = btoa(String(l.id));
        const url = `${baseUrl}?l=${encoded}`;
        const statusColor = l.status === 'active' ? 'var(--teal)' : 'var(--text-muted)';
        return `<div class="list-row">
          <div class="row-between">
            <div>
              <div class="text-bold text-14">${esc(l.name)}</div>
              <div class="text-bold text-uppercase mt-4" style="font-size:11px;color:${statusColor};letter-spacing:.5px;">${esc(l.status)}</div>
            </div>
            <button class="btn btn-primary btn-sm" data-action="copyShareLink" data-url="${esc(url)}" data-btnid="copy-btn-${l.id}" id="copy-btn-${l.id}">Copy link</button>
          </div>
          <div class="url-box">${esc(url)}</div>
        </div>`;
      })
      .join('');
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
