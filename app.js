/* ============================================================
   FEROCIA SPORTS CENTER — MAIN APP (admin index.html)
   Depends on: config.js, db.js, assets.js, app.css, tournament.css
   Globals provided: api, escapeHtml/esc, fmtDate, sleep, todayISO,
                     toast, confirmModal, FEROCIA_CONFIG
   ============================================================ */

// ── Ladder type selector (global — called from inline onclick) ────────────
window.selectLadderType = (type) => {
  const rp       = document.getElementById('ltype-rp');
  const ftc      = document.getElementById('ltype-ftc');
  const rpCheck  = document.getElementById('ltype-rp-check');
  const ftcCheck = document.getElementById('ltype-ftc-check');
  const inp      = document.getElementById('new-ladder-type');
  if (!rp || !ftc || !inp) return;
  inp.value = type;

  const selectedStyle = (el) => {
    el.style.border          = '1.5px solid #174CCC';
    el.style.background      = 'linear-gradient(135deg,rgba(23,76,204,0.03),rgba(23,76,204,0.06))';
    el.style.boxShadow       = '0 0 0 4px rgba(23,76,204,0.1),0 4px 16px rgba(23,76,204,0.12)';
    el.style.transform       = 'scale(1.01)';
  };
  const defaultStyle = (el) => {
    el.style.border          = '1.5px solid #e0e7f5';
    el.style.background      = 'white';
    el.style.boxShadow       = 'none';
    el.style.transform       = 'scale(1)';
  };

  if (type === 'rotating_partner') {
    selectedStyle(rp);  defaultStyle(ftc);
    if (rpCheck)  rpCheck.style.display  = 'flex';
    if (ftcCheck) ftcCheck.style.display = 'none';
  } else {
    selectedStyle(ftc); defaultStyle(rp);
    if (ftcCheck) ftcCheck.style.display = 'flex';
    if (rpCheck)  rpCheck.style.display  = 'none';
  }
};

(function () {
  'use strict';

  // Format HH:MM (24h) to h:MM AM/PM (12h)
  const fmtTime12 = (time24) => {
    if (!time24) return '';
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const m = (mStr || '00').slice(0, 2);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

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
  let subPlayers = new Set(); // player IDs marked as sub for this specific session
  let gameCount = 0;
  let extraGameCount = 0;
  let extraGames = [];
  let modalLadderId = null;
  let currentTournamentId = null; // used by the read-only tournament selector

  /* ─── SIDEBAR NAVIGATION ───────────────────────────────── */

  // Set active state on sidebar + bottom nav items
  window.sbSetActive = (pageOrKey) => {
    // Clear all sidebar item active states
    document.querySelectorAll('.sb-item, .sb-sub-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bn-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.more-drawer-item').forEach(el => el.classList.remove('active'));

    // Activate sidebar item by id (sb-<key>) and bottom nav (bn-<key>)
    const maps = {
      'home':         ['sb-home',        'bn-home'],
      'ladder':           ['sb-standings',    'bn-ladder'],
      'sessions':         ['sb-sessions',    'bn-ladder'],
      'entry':            ['sb-entry',       'bn-ladder'],
      'ftc-standings':    ['sb-ftc-standings','bn-ladder'],
      'ftc-teams':        ['sb-ftc-teams',   'bn-ladder'],
      'ftc-schedule':     ['sb-ftc-schedule','bn-ladder'],
      'ftc-playoffs':     ['sb-ftc-playoffs','bn-ladder'],
      'tournament-view': ['sb-tournament', 'bn-tournament'],
      'players':      ['sb-players',     'bn-players'],
      'add-player':   ['sb-add-player',  null],
      'ladders':      ['sb-ladders',     null],
      't-tournaments':['sb-t-tournaments', null],
      'events':       ['sb-events',      null],
      'orders':       ['sb-orders',      null],
      'promotions':   ['sb-promotions',  null],
      'share':        ['sb-share',       null],
      'match-hub':    ['sb-match-hub',   null],
    };
    const ids = maps[pageOrKey] || [];
    ids.forEach(id => { if (id) { const el = document.getElementById(id); if (el) el.classList.add('active'); } });

    // Bottom nav: pages in "more" drawer activate the ⋯ button
    const morePages = ['add-player','ladders','t-tournaments','events','orders','promotions','share','match-hub'];
    if (morePages.includes(pageOrKey)) {
      document.getElementById('bn-more')?.classList.add('active');
      const mdEl = document.getElementById(`md-${pageOrKey}`);
      if (mdEl) mdEl.classList.add('active');
    }

    // Show/hide ladder sub-items and select
    const isLadderPage = ['ladder','sessions','entry','ftc-standings','ftc-teams','ftc-schedule','ftc-playoffs'].includes(pageOrKey);
    const ladderWrap = document.getElementById('sb-ladder-select-wrap');
    if (ladderWrap) ladderWrap.style.display = isLadderPage ? 'block' : 'none';
    ['sb-standings','sb-sessions','sb-entry','sb-ftc-standings','sb-ftc-teams','sb-ftc-schedule','sb-ftc-playoffs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none'; // reset all first
    });
    if (isLadderPage && currentLadder) {
      const isFTC = currentLadder.ladder_type === 'ftc';
      if (isFTC) {
        ['sb-ftc-standings','sb-ftc-teams','sb-ftc-schedule','sb-ftc-playoffs'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'flex';
        });
      } else {
        ['sb-standings','sb-sessions','sb-entry'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'flex';
        });
      }
    }

    // Show/hide tournament select
    const isTournPage = ['tournament-view'].includes(pageOrKey);
    const tournWrap = document.getElementById('sb-tourn-select-wrap');
    if (tournWrap) tournWrap.style.display = isTournPage ? 'block' : 'none';
  };

  const sbCloseMore = () => {
    document.getElementById('more-drawer')?.classList.remove('open');
    document.getElementById('drawer-backdrop')?.classList.remove('open');
  };

  const loadDashboard = async () => {
    const liveBadge = document.getElementById('dash-live-badge');
    if (liveBadge) liveBadge.style.display = 'inline-block';

    try {
      const [players, ladders, tournaments, ordersPaid, subs, pendingMatches, pendingSubs] = await Promise.all([
        api('players?status=eq.active&select=id&order=id.desc'),
        api('ladders?status=eq.active&select=id,name'),
        api('tournaments?status=eq.active&select=id,name').catch(() => []),
        api('orders?status=eq.paid&select=id').catch(() => []),
        api('subscribers?status=eq.active&select=id').catch(() => []),
        api('matches?score_for=is.null&default_no_show=is.false&select=id,ladder_id').catch(() => []),
        api('subscribers?status=eq.pending&select=id').catch(() => []),
      ]);

      // ── KPI values ─────────────────────────────────────────
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('dash-active-players',    players.length);
      set('dash-open-ladders',      ladders.length);
      set('dash-open-tournaments',  tournaments.length);
      set('dash-pending-orders',    ordersPaid.length);
      set('dash-subscribers',       subs.length);

      // Subscribers card dynamic context line
      const subsCtx = document.getElementById('dash-subs-ctx');
      if (subsCtx) {
        subsCtx.textContent = pendingSubs.length
          ? `${pendingSubs.length} pending confirmation`
          : `${subs.length} active`;
      }

      // ── Operations Center ──────────────────────────────────
      const opsEl  = document.getElementById('dash-ops-list');
      const opsBdg = document.getElementById('dash-ops-badge');
      if (opsEl) {
        const items = [];

        // Pending orders
        if (ordersPaid.length) {
          items.push({
            strip: 'red',
            icon: `<svg viewBox="0 0 24 24" style="stroke:#e53935;"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
            title: `Orders Awaiting Fulfillment`,
            ctx:   'Paid — not yet shipped',
            metric: `${ordersPaid.length} order${ordersPaid.length !== 1 ? 's' : ''} pending`,
            pill:  'Action Needed',
            pillClass: 'red',
            btnLabel: 'Review Orders',
            btnClass: 'ops-btn-red',
            page: 'orders',
          });
        }

        // Pending score reports
        if (pendingMatches.length) {
          // Find the ladder with the most pending matches to pre-select
          const pmLadderCounts = {};
          pendingMatches.forEach(m => { if (m.ladder_id) pmLadderCounts[m.ladder_id] = (pmLadderCounts[m.ladder_id] || 0) + 1; });
          const topLadderId = Object.keys(pmLadderCounts).sort((a,b) => pmLadderCounts[b] - pmLadderCounts[a])[0] || '';
          items.push({
            strip: 'orange',
            icon: `<svg viewBox="0 0 24 24" style="stroke:#F26024;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
            title: `Matches Awaiting Scores`,
            ctx:   'Sessions without results recorded',
            metric: `${pendingMatches.length} match${pendingMatches.length !== 1 ? 'es' : ''} pending`,
            pill:  'Scores Due',
            pillClass: 'orange',
            btnLabel: 'View Sessions',
            btnClass: 'ops-btn-orange',
            page: 'sessions',
            ladderId: topLadderId,
          });
        }

        // Pending subscriber confirmations
        if (pendingSubs.length) {
          items.push({
            strip: 'blue',
            icon: `<svg viewBox="0 0 24 24" style="stroke:#174CCC;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
            title: `Subscribers Pending Confirmation`,
            ctx:   'Awaiting email verification',
            metric: `${pendingSubs.length} subscriber${pendingSubs.length !== 1 ? 's' : ''} pending`,
            pill:  'Pending',
            pillClass: 'blue',
            btnLabel: 'Send Reminder',
            btnClass: 'ops-btn-blue',
            page: 'promotions',
          });
        }

        if (!items.length) {
          opsEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;font-weight:600;">
            All clear — no action needed today.
          </div>`;
        } else {
          opsEl.innerHTML = items.map(item => `
            <div class="ops-row">
              <div class="ops-strip ${item.strip}"></div>
              <div class="ops-row-icon">${item.icon}</div>
              <div class="ops-row-body">
                <div class="ops-row-title">${item.title}</div>
                <div class="ops-row-ctx">${item.ctx}</div>
                <div class="ops-row-metric">${item.metric}</div>
              </div>
              <div class="ops-row-actions">
                <span class="ops-pill ${item.pillClass}">${item.pill}</span>
                <button class="${item.btnClass}" data-action="showPage" data-page="${item.page}" ${item.ladderId ? `data-ladderid="${item.ladderId}"` : ''}>${item.btnLabel}</button>
              </div>
            </div>`).join('');
        }

        if (opsBdg) {
          opsBdg.textContent = items.length
            ? `${items.length} item${items.length !== 1 ? 's' : ''}`
            : 'All clear';
        }
      }

      // ── Active Ladders & Tournaments ───────────────────────
      const programsEl = document.getElementById('dash-programs-list');
      if (programsEl) {
        const rows = [];
        ladders.forEach(l => rows.push({
          name: l.name, type: 'Ladder', page: 'ladders',
          btnLabel: 'View Ladder →', barColor: '#9CE3FF', countColor: '#174CCC', countLabel: 'Active',
        }));
        tournaments.forEach(t => rows.push({
          name: t.name, type: 'Tournament', page: 't-tournaments',
          btnLabel: 'View Tournament →', barColor: '#C6F221', countColor: '#5a6e00', countLabel: 'Open',
        }));

        if (!rows.length) {
          programsEl.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;font-weight:600;">
            No active ladders or tournaments.
          </div>`;
        } else {
          programsEl.innerHTML = rows.slice(0, 6).map(r => `
            <div class="prog-row">
              <div class="prog-top">
                <div class="prog-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(r.name)}</div>
                <button class="btn btn-outline btn-sm" data-action="showPage" data-page="${r.page}"
                  style="font-size:10px;flex-shrink:0;margin-left:12px;">${r.btnLabel}</button>
              </div>
              <div class="prog-meta">${r.type} · Active</div>
              <div class="prog-bar-row">
                <div class="prog-bar-bg">
                  <div class="prog-bar-fill" style="width:70%;background:${r.barColor};"></div>
                </div>
                <div class="prog-count" style="color:${r.countColor};">${r.countLabel}</div>
              </div>
            </div>`).join('');
        }
      }

      // ── Upcoming Events ────────────────────────────────────
      const eventsEl = document.getElementById('dash-events-list');
      if (eventsEl) {
        const today = new Date().toISOString().split('T')[0];
        let events = [];
        try { events = await api(`events?event_date=gte.${today}&select=id,title,event_date&order=event_date.asc&limit=4`); } catch(_) {}

        if (!events.length) {
          eventsEl.innerHTML = `
            <div class="ev-empty">
              <div class="ev-empty-ico">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <div class="ev-empty-title">No upcoming events</div>
              <div class="ev-empty-rec">Create an event to maintain player engagement.</div>
              <button class="ev-empty-btn" data-action="showPage" data-page="events">+ Create Event</button>
            </div>`;
        } else {
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          eventsEl.innerHTML = events.map(ev => {
            const d   = new Date(ev.event_date + 'T00:00:00');
            const day = d.getDate();
            const mon = months[d.getMonth()];
            return `
              <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:0.5px solid var(--border);">
                <div style="width:36px;height:36px;background:var(--blue-pale);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;">
                  <div style="font-size:14px;font-weight:800;color:var(--blue);line-height:1;">${day}</div>
                  <div style="font-size:9px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.5px;">${mon}</div>
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(ev.title)}</div>
                  <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-top:2px;">${ev.event_date}</div>
                </div>
              </div>`;
          }).join('');
          const lastEv = eventsEl.querySelector('div[style*="border-bottom"]:last-child');
          if (lastEv) lastEv.style.borderBottom = 'none';
        }
      }

    } catch (e) {
      console.error('[Dashboard] Error:', e);
    }
  };

  const goHome = () => {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    document.getElementById('page-home').classList.add('active');
    sbSetActive('home');
    sbCloseMore();
    currentLadder = null;
    const sel = document.getElementById('ladder-selector');
    if (sel) sel.value = '';
    loadDashboard();
  };

  const sbShowLadder = () => {
    sbCloseMore();
    if (currentLadder) {
      showPage('ladder', document.getElementById('sb-standings'));
    } else {
      loadLadderSelector().then(() => {
        document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
        sbSetActive('ladder');
      });
    }
    // Always show the sub-items
    const wrap = document.getElementById('sb-ladder-select-wrap');
    if (wrap) wrap.style.display = 'block';
    (() => {
      const isFTC = currentLadder?.ladder_type === 'ftc';
      ['sb-standings','sb-sessions','sb-entry','sb-ftc-standings','sb-ftc-teams','sb-ftc-schedule','sb-ftc-playoffs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      if (isFTC) {
        ['sb-ftc-standings','sb-ftc-teams','sb-ftc-schedule','sb-ftc-playoffs'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'flex';
        });
      } else {
        ['sb-standings','sb-sessions','sb-entry'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = 'flex';
        });
      }
    })();
    document.getElementById('sb-ladder')?.classList.add('active');
    document.getElementById('bn-ladder')?.classList.add('active');
  };

  const sbShowTournament = () => {
    sbCloseMore();
    loadTournamentSelector();
    showPage('tournament-view', document.getElementById('sb-tournament'));
    const wrap = document.getElementById('sb-tourn-select-wrap');
    if (wrap) wrap.style.display = 'block';
  };

  const sbToggleMore = () => {
    const drawer = document.getElementById('more-drawer');
    const backdrop = document.getElementById('drawer-backdrop');
    const isOpen = drawer?.classList.contains('open');
    if (isOpen) {
      sbCloseMore();
    } else {
      drawer?.classList.add('open');
      backdrop?.classList.add('open');
    }
  };

  window.loadTournamentSelector = async () => {
    const sel = document.getElementById('tournament-selector');
    if (!sel) return;
    try {
      const tournaments = await api('tournaments?status=eq.active&select=*&order=id.desc');
      sel.innerHTML =
        '<option value="">-- Select a tournament --</option>' +
        tournaments
          .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
          .join('');
    } catch (e) {
      toast(`Error loading tournaments: ${e.message}`, true);
    }
  };

  const onTournamentChange = async () => {
    const tid = document.getElementById('tournament-selector').value;
    if (!tid) return;
    currentTournamentId = parseInt(tid, 10);

    // Switch page DOM without calling showPage() to avoid activating the Management sidebar item
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-t-tournaments');
    if (pageEl) pageEl.classList.add('active');

    // Keep Tournament Hub (sb-tournament) highlighted, not Management → Tournament
    sbSetActive('tournament-view');

    // Load tournament module (skip list render — we go straight to detail)
    // then await openTournament so DOM is fully ready before loadCategory runs
    if (typeof loadTournamentModule !== 'undefined') {
      await loadTournamentModule(true);
    }
    if (typeof openTournament !== 'undefined') {
      await openTournament(currentTournamentId);
    }
  };


  const showPage = (name, btn) => {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${name}`);
    if (pageEl) pageEl.classList.add('active');
    sbSetActive(name);
    sbCloseMore();
    if (name === 'ladder') loadLadder();
    if (name === 'sessions') {
      // If called with a specific ladder id (e.g. from dashboard ops center), pre-select it
      const ladderId = btn && btn.dataset && btn.dataset.ladderid ? parseInt(btn.dataset.ladderid, 10) : null;
      if (ladderId && allLadders.length) {
        const found = allLadders.find(l => l.id === ladderId);
        if (found) {
          currentLadder = found;
          const sel = document.getElementById('ladder-selector');
          if (sel) sel.value = ladderId;
          updateLadderBanner();
        }
      }
      loadSessions();
    }
    if (name === 'players') loadPlayers();
    if (name === 'entry') initEntry();
    if (name === 'ladders') loadLaddersPage();
    if (name === 'ftc-standings') loadFtcStandings();
    if (name === 'ftc-teams') loadFtcTeams();
    if (name === 'ftc-schedule') loadFtcSchedule();
    if (name === 'ftc-playoffs') loadFtcPlayoffs();
    if (name === 'add-player') initAddPlayer();
    if (name === 'share') loadSharePage();
    if (name === 'orders') loadOrdersPage();
    if (name === 'events') loadEventsPage();
    if (name === 'promotions' && typeof loadPromotionsPage !== 'undefined') loadPromotionsPage();
    if (name === 'match-hub') loadMatchHub();
    if (name === 't-tournaments' && typeof loadTournamentModule !== 'undefined') loadTournamentModule();
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
      allLadders = await api('ladders?select=*&status=neq.closed&order=id.desc');
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
            `<option value="${l.id}">${esc(l.name)}</option>`,
        )
        .join('');

    // Show blank selection — user must pick a ladder
    sel.value = '';
    currentLadder = null;
  };

  const onLadderChange = async () => {
    const id = parseInt(document.getElementById('ladder-selector').value, 10);
    currentLadder = allLadders.find((l) => l.id === id) || null;
    updateLadderBanner();
    await loadLadderPlayers();
    if (currentLadder?.ladder_type === 'ftc') {
      showPage('ftc-standings', document.getElementById('sb-ftc-standings'));
    } else {
      showPage('ladder', document.getElementById('sb-standings'));
    }
  };

  const updateLadderBanner = () => {
    const ladderPages    = ['ladder', 'sessions', 'entry'];
    const ftcPages       = ['ftc-standings', 'ftc-teams', 'ftc-schedule', 'ftc-playoffs'];
    const allLadderPages = [...ladderPages, ...ftcPages];
    const ladderNavBtns  = document.querySelectorAll('#sb-standings, #sb-sessions, #sb-entry, #sb-ftc-teams, #sb-ftc-schedule, #sb-ftc-playoffs');
    if (!currentLadder) {
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

  // ── Ladder ops page state ─────────────────────────────────────────────
  let _lopFilter = 'all';

  const _renderLadderCards = async () => {
    const el = document.getElementById('ladders-list');
    if (!el) return;

    let filtered = allLadders.filter(l => {
      if (_lopFilter === 'active') return l.status === 'active';
      if (_lopFilter === 'closed') return l.status !== 'active';
      return true;
    });

    if (!filtered.length) {
      el.innerHTML = `<div class="empty" style="padding:20px;text-align:center;background:white;border-radius:10px;">No ladders found.</div>`;
      return;
    }

    // Fetch matches + ladder_players for intelligence
    let matchStats = {}, ladderPlayers = [], pendingAll = [];
    try {
      const [matches, lp, pending] = await Promise.all([
        api('matches?select=ladder_id,player_id,score_for,session_date,points_earned,players(first_name,last_name)&order=session_date.desc').catch(() => []),
        api('ladder_players?select=ladder_id,player_id').catch(() => []),
        api('matches?score_for=is.null&default_no_show=is.false&select=ladder_id').catch(() => []),
      ]);
      // Per-ladder stats
      matches.forEach(m => {
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
      ladderPlayers = lp;
      pendingAll = pending;
    } catch(_) {}

    // Compute player counts per ladder
    const playersByLadder = {};
    ladderPlayers.forEach(lp => {
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
    const ladder = allLadders.find(l => String(l.id) === String(ladderId));
    if (!ladder) return;
    currentLadder = ladder;
    const sel = document.getElementById('ladder-selector');
    if (sel) sel.value = ladderId;
    updateLadderBanner();
    await loadLadderPlayers(); // ensure ladderPlayers is populated

    // Rotating Partner tabs
    if (tab === 'players') {
      showPage('ladder', document.getElementById('sb-standings'));
      await loadLadder();
    } else if (tab === 'sessions') {
      showPage('sessions', document.getElementById('sb-sessions'));
    } else if (tab === 'standings') {
      showPage('ladder', document.getElementById('sb-standings'));
      await loadLadder();
    // FTC tabs
    } else if (tab === 'ftc-standings') {
      showPage('ftc-standings', document.getElementById('sb-ftc-standings'));
    } else if (tab === 'ftc-teams') {
      showPage('ftc-teams', document.getElementById('sb-ftc-teams'));
    } else if (tab === 'ftc-schedule') {
      showPage('ftc-schedule', document.getElementById('sb-ftc-schedule'));
    } else if (tab === 'ftc-playoffs') {
      showPage('ftc-playoffs', document.getElementById('sb-ftc-playoffs'));
    }
  };

  const loadLaddersPage = async () => {
    try {
      const [ladders, ladderPlayers, pending] = await Promise.all([
        api('ladders?select=*&order=id.desc'),
        api('ladder_players?select=ladder_id,player_id').catch(() => []),
        api('matches?score_for=is.null&default_no_show=is.false&select=ladder_id').catch(() => []),
      ]);
      allLadders = ladders;

      // Stat cards
      const active  = ladders.filter(l => l.status === 'active').length;
      const closed  = ladders.filter(l => l.status !== 'active').length;
      // Unique players in active ladders
      const activeLadderIds = new Set(ladders.filter(l => l.status === 'active').map(l => l.id));
      const activePlayers   = new Set(ladderPlayers.filter(lp => activeLadderIds.has(lp.ladder_id)).map(lp => lp.player_id)).size;
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
      await loadLadderSelector();
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
      await loadLadderSelector();
      loadLaddersPage();
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  const openEditLadder = (id) => {
    const l = allLadders.find((x) => x.id === id);
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
      if (currentLadder && currentLadder.id === id) {
        currentLadder = null;
      }
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
    const modal = document.getElementById('lp-modal');
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
    const searchEl = document.getElementById('lp-search');
    // Reset gender filter to 'all' on open
    _lpGenderFilter = 'all';
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
      api(`ladder_players?select=ladder_id,player_id,status&ladder_id=eq.${modalLadderId}`),
    ]);
    allPlayers = allP;
    const enrolledIds  = enrolled.map((r) => Number(r.player_id));
    const activePlayers = allPlayers.filter((p) => p.status !== 'inactive');
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
            ladder_id: parseInt(modalLadderId, 10),
            player_id: pid,
            status:    getSegStatus(pid),
          }))
        );
      }

      // 2. Remove de-enrolled players
      if (toRemove.length) {
        await api(
          `ladder_players?ladder_id=eq.${modalLadderId}&player_id=in.(${toRemove.join(',')})`,
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
          `ladder_players?ladder_id=eq.${modalLadderId}&player_id=eq.${pid}`,
          'PATCH',
          { status }
        );
      }

      const changes = toAdd.length + toRemove.length;
      toast(changes > 0
        ? `Participants updated! ${toAdd.length} added, ${toRemove.length} removed.`
        : 'Participant statuses saved successfully.'
      );
      await loadLadderPlayers();
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
      const pm   = {}; // points
      const wm   = {}; // wins
      const lm   = {}; // losses
      const pfm  = {}; // pts for
      const pam  = {}; // pts against
      ladderPlayers.forEach((p) => { pm[p.id] = 0; wm[p.id] = 0; lm[p.id] = 0; pfm[p.id] = 0; pam[p.id] = 0; });
      matches.forEach((m) => {
        if (pm[m.player_id] === undefined) return;
        pm[m.player_id] += m.points_earned || 0;
        if (m.default_no_show || m.score_for === null) return;
        pfm[m.player_id] += m.score_for || 0;
        pam[m.player_id] += m.score_against || 0;
        if (m.points_earned === 4) wm[m.player_id]++;
        else if (m.points_earned !== undefined && m.points_earned < 4) lm[m.player_id]++;
      });
      const ranked = [...ladderPlayers]
        .filter((p) => p.ladder_status === 'active')
        .sort((a, b) =>
          ((pm[b.id] || 0) - (pm[a.id] || 0)) ||           // 1. Total points
          ((wm[b.id] || 0) - (wm[a.id] || 0)) ||           // 2. Wins
          (((pfm[b.id]||0)-(pam[b.id]||0)) - ((pfm[a.id]||0)-(pam[a.id]||0))) // 3. Diff
        );
      ranked.forEach((p, i) => {
        p._rank   = i + 1;
        p._points = pm[p.id]  || 0;
        p._wins   = wm[p.id]  || 0;
        p._losses = lm[p.id]  || 0;
        p._ptsFor = pfm[p.id] || 0;
        p._diff   = (pfm[p.id] || 0) - (pam[p.id] || 0);
      });
      allPlayers._ranked = ranked;
      const sessions = [...new Set(matches.map((m) => m.session_date))];
      const uniqueGames = new Set(
        matches.map((m) => `${m.session_date}__${m.court_group}__${m.game_number}`),
      ).size;
      const leader = ranked[0] ? `${ranked[0].first_name} ${ranked[0].last_name}` : '-';
      // Show ladder title
      const titleEl = document.getElementById('ladder-title');
      if (titleEl) {
        titleEl.textContent = currentLadder.name;
        titleEl.style.display = 'block';
      }
      // Stats cards with colored borders + rich leader card
      const leaderP = ranked[0];
      const leaderName = leaderP ? `${leaderP.first_name} ${leaderP.last_name}` : '-';
      const leaderPts  = leaderP ? leaderP._points : 0;
      document.getElementById('ladder-stats').innerHTML = `
        <div class="stat stat-blue">
          <div class="stat-label">Players</div>
          <div class="stat-value">${ladderPlayers.length}</div>
          <div class="stat-ctx ctx-blue">Active this season</div>
        </div>
        <div class="stat stat-green">
          <div class="stat-label">Sessions</div>
          <div class="stat-value">${sessions.length}</div>
          <div class="stat-ctx ctx-green">Recorded</div>
        </div>
        <div class="stat stat-lime">
          <div class="stat-label">Games</div>
          <div class="stat-value">${uniqueGames}</div>
          <div class="stat-ctx ctx-lime">Total played</div>
        </div>
        <div class="stat stat-gold">
          <div class="stat-label">Leader</div>
          <div class="stat-leader-name">${esc(leaderName)}</div>
          <div class="stat-leader-pts">${leaderPts} PTS</div>
          <div class="stat-leader-week">↑ Season leader</div>
          <div class="stat-leader-streak">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F26024" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Top of the ladder
          </div>
        </div>`;
      // Momentum Watch block
      renderMomentumWatch(ranked, matches);
      renderLadder();
    } catch (e) {
      document.getElementById('ladder-table').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
    }
  };

  const renderMomentumWatch = (ranked, matches) => {
    const el = document.getElementById('momentum-watch');
    if (!el || !ranked.length) return;
    // Hottest: most points in last session
    const sessions = [...new Set(matches.map(m => m.session_date))].sort().reverse();
    const lastSession = sessions[0];
    const lastMatches = lastSession ? matches.filter(m => m.session_date === lastSession) : [];
    const recentPts = {};
    lastMatches.forEach(m => { recentPts[m.player_id] = (recentPts[m.player_id] || 0) + (m.points_earned || 0); });
    const hottest = ranked.slice().sort((a,b) => (recentPts[b.id]||0) - (recentPts[a.id]||0))[0];
    // Biggest climber: highest points in last session
    const climber = ranked.slice().sort((a,b) => (recentPts[b.id]||0) - (recentPts[a.id]||0))[1] || ranked[0];
    // Most consistent: most games played
    const gameCounts = {};
    matches.forEach(m => { gameCounts[m.player_id] = (gameCounts[m.player_id] || 0) + 1; });
    const consistent = ranked.slice().sort((a,b) => (gameCounts[b.id]||0) - (gameCounts[a.id]||0))[0];
    const hottestName  = hottest  ? `${esc(hottest.first_name)} ${esc(hottest.last_name)}`  : '-';
    const climberName  = climber  ? `${esc(climber.first_name)} ${esc(climber.last_name)}`  : '-';
    const consistName  = consistent ? `${esc(consistent.first_name)} ${esc(consistent.last_name)}` : '-';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '20px';
    el.style.flexWrap = 'wrap';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text-muted);flex-shrink:0;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Momentum Watch
      </div>
      <div class="mom-divider"></div>
      <div class="mom-item">
        <div class="mom-icon" style="background:var(--orange-light);">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <div><div class="mom-text">${hottestName}</div><div class="mom-sub">Hottest Player</div></div>
      </div>
      <div class="mom-divider"></div>
      <div class="mom-item">
        <div class="mom-icon" style="background:var(--teal-light);">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        </div>
        <div><div class="mom-text">${climberName}</div><div class="mom-sub">Biggest Climber</div></div>
      </div>
      <div class="mom-divider"></div>
      <div class="mom-item">
        <div class="mom-icon" style="background:var(--blue-pale);">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div><div class="mom-text">${consistName}</div><div class="mom-sub">Most Consistent</div></div>
      </div>`;
  };

  const getInitials = (first, last) =>
    ((first || '')[0] || '').toUpperCase() + ((last || '')[0] || '').toUpperCase();

  const renderLadderPodium = (players, label, isFirst) => {
    const medals = ['gold', 'silver', 'bronze'];
    const top    = players.slice(0, 3);
    const order  = top.length === 1 ? [0] : top.length === 2 ? [1, 0] : [1, 0, 2];
    const icon   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d1f4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
    return `
      <div class="podium-half">
        <div class="podium-eyebrow">${icon} Top ${label}</div>
        <div class="podium">
          ${order.map((idx) => {
            if (idx >= top.length) return '';
            const p      = top[idx];
            const medal  = medals[idx];
            const isGold = idx === 0;
            return `
              <div class="podium-slot">
                <div class="podium-avatar ${medal}${isGold ? ' podium-avatar gold-first' : ''}">
                  ${esc(getInitials(p.first_name, p.last_name))}
                  ${isGold ? `<span class="podium-crown">👑</span>` : ''}
                </div>
                <div class="podium-name">${esc(p.first_name)} ${esc(p.last_name)}</div>
                <div class="podium-pts">${p._points} PTS</div>
                <div class="podium-bar ${medal}">${isGold ? '🥇' : idx === 1 ? '🥈' : '🥉'}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  };

  const renderLadder = () => {
    const filter   = document.getElementById('gender-filter').value;
    const all      = allPlayers._ranked || [];
    const men      = all.filter((p) => p.gender === 'Male');
    const women    = all.filter((p) => p.gender === 'Female');
    const filtered = all.filter((p) => filter === 'all' || p.gender === filter);

    if (!filtered.length) {
      document.getElementById('ladder-table').innerHTML =
        '<div class="empty">No players in this ladder yet.</div>';
      return;
    }

    // Build podium row — side by side when all, full width when filtered
    let podiumHTML = '';
    const showMen   = (filter === 'all' || filter === 'Male')   && men.length;
    const showWomen = (filter === 'all' || filter === 'Female') && women.length;
    const isSingle  = (showMen && !showWomen) || (!showMen && showWomen);
    if (showMen || showWomen) {
      podiumHTML = `<div class="podium-row${isSingle ? ' single' : ''}">`;
      if (showMen)   podiumHTML += renderLadderPodium(men,   'Men',   true);
      if (showWomen) podiumHTML += renderLadderPodium(women, 'Women', false);
      podiumHTML += `</div>`;
    }

    // Table rows with Trend column
    const rows = filtered.map((p, i) => {
      const rankClass = i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';
      // Simple trend: top 3 = up arrow, others neutral
      let trendHTML = '';
      if (i === 0) {
        trendHTML = `<div class="trend-fire"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F26024" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Season leader</div>`;
      } else if (p._points > 0) {
        trendHTML = `<div class="trend-up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>${p._points} pts earned</div>`;
      } else {
        trendHTML = `<div class="trend-neu">—</div>`;
      }
      return `<tr>
        <td><span class="rank-num ${rankClass}">${i + 1}</span></td>
        <td>
          <div class="player-cell">
            <div class="player-initials ${rankClass}">${esc(getInitials(p.first_name, p.last_name))}</div>
            <div>
              <div class="player-name">${esc(p.first_name)} ${esc(p.last_name)}</div>
              <div class="player-sub">${esc(p.gender || '')}</div>
            </div>
          </div>
        </td>
        <td style="text-align:right;padding-right:16px;"><span class="points-display">${p._points}</span><span style="font-size:11px;color:var(--text-muted);font-weight:600;margin-left:2px;">pts</span></td>
        <td style="text-align:center;font-size:13px;font-weight:800;color:${p._diff > 0 ? '#24BC96' : p._diff < 0 ? '#F26024' : '#6b7a99'};">${p._diff > 0 ? '+' : ''}${p._diff}</td>
        <td style="text-align:center;font-size:13px;font-weight:700;color:#24BC96;">${p._wins}</td>
        <td style="text-align:center;font-size:13px;font-weight:700;color:#F26024;">${p._losses}</td>
        <td style="width:160px;">${trendHTML}</td>
      </tr>`;
    }).join('');

    const tableHTML = `
      <table>
        <thead>
          <tr>
            <th style="width:48px;">Rank</th>
            <th>Player</th>
            <th style="text-align:right;width:90px;">Points</th>
            <th style="text-align:center;width:70px;">Diff</th>
            <th style="text-align:center;width:60px;">Wins</th>
            <th style="text-align:center;width:60px;">Losses</th>
            <th style="text-align:center;width:160px;">Trend</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    document.getElementById('ladder-table').innerHTML = podiumHTML + `<div style="padding:0 4px;">${tableHTML}</div>`;
  };

  /* ─── PRINT STANDINGS ──────────────────────────────────── */

  const printStandings = async () => {
    const players = allPlayers._ranked;
    if (!players || !players.length) {
      toast('No standings to print. Load a ladder first.', true);
      return;
    }

    const btn = document.querySelector('[data-action="printStandings"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating...'; }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

      const PW = 215.9;
      const PH = 279.4;
      const ML = 20;
      const MR = 20;
      const CW = PW - ML - MR;

      const BLUE   = [23,  76,  204];
      const LIME   = [198, 242, 33];
      const DARK   = [13,  31,  74];
      const MUTED  = [107, 122, 153];
      const WHITE  = [255, 255, 255];
      const GOLD   = [255, 215, 0];
      const SILVER = [192, 192, 192];
      const BRONZE = [205, 127, 50];
      const ORANGE = [242, 96,  36];

      // Title: "Standings Update — April 30, 2026"
      const today = new Date();
      const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const ladderName = currentLadder?.name || 'Ladder';

      // ── HEADER ───────────────────────────────────────────────
      doc.setFillColor(...BLUE);
      doc.rect(0, 0, PW, 22, 'F');
      doc.setFillColor(...LIME);
      doc.rect(0, 22, PW, 1.2, 'F');

      // Ladder name — full width, top line
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...WHITE);
      doc.text(ladderName, ML, 11, { maxWidth: CW });

      // Second line: SEASON STANDINGS (left) + date (right) — same baseline
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...LIME);
      doc.text('SEASON STANDINGS', ML, 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...LIME);
      doc.text(`Standings Update — ${dateStr}`, PW - MR, 18, { align: 'right' });

      // ── TABLE ────────────────────────────────────────────────
      let y = 28;

      // Column definitions matching the image
      const COL = {
        rank:   { x: ML,          w: 14,  label: 'Rank',   align: 'center' },
        player: { x: ML + 14,     w: 110, label: 'Player', align: 'left'   },
        gender: { x: ML + 124,    w: 22,  label: 'Gender', align: 'center' },
        points: { x: ML + 146,    w: CW - 146, label: 'Points', align: 'center' },
      };

      // Page break threshold — stop before footer
      const PAGE_BOTTOM = PH - 14;
      const ROW_H = 6.2;

      // Helper: draw footer on current page, add new page, draw continuation header, return new y
      const addPageBreak = () => {
        // Footer on current page
        doc.setFillColor(...BLUE);
        doc.rect(0, PH - 10, PW, 10, 'F');
        doc.setFillColor(...LIME);
        doc.rect(0, PH - 10, PW, 0.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...WHITE);
        doc.text('Ferocia Sports Center  —  ferociasports.com', PW / 2, PH - 4, { align: 'center' });

        doc.addPage();

        // Continuation header (smaller than first page)
        doc.setFillColor(...BLUE);
        doc.rect(0, 0, PW, 14, 'F');
        doc.setFillColor(...LIME);
        doc.rect(0, 14, PW, 1.0, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...WHITE);
        doc.text(ladderName, ML, 9, { maxWidth: CW * 0.7 });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...LIME);
        doc.text('(continued)', PW - MR, 9, { align: 'right' });

        let ny = 20;

        // Repeat table column headers
        doc.setFillColor(...BLUE);
        doc.rect(ML, ny, CW, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...WHITE);
        Object.values(COL).forEach(({ x, w, label, align }) => {
          const tx = align === 'center' ? x + w / 2 : x + 2;
          doc.text(label, tx, ny + 5, { align });
        });
        ny += 7;
        return ny;
      };

      // Draw table header
      doc.setFillColor(...BLUE);
      doc.rect(ML, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      Object.values(COL).forEach(({ x, w, label, align }) => {
        const tx = align === 'center' ? x + w / 2 : x + 2;
        doc.text(label, tx, y + 5, { align });
      });
      y += 7;

      // Active players
      players.forEach((p, i) => {
        // Page break check
        if (y + ROW_H > PAGE_BOTTOM) y = addPageBreak();

        if (i % 2 === 0) {
          doc.setFillColor(245, 247, 252);
        } else {
          doc.setFillColor(...WHITE);
        }
        doc.rect(ML, y, CW, ROW_H, 'F');

        const rank = i + 1;
        const rankColor = rank === 1 ? GOLD : rank === 2 ? SILVER : rank === 3 ? BRONZE : DARK;

        // Rank badge
        const cx = COL.rank.x + COL.rank.w / 2;
        const cy = y + ROW_H / 2;
        if (rank <= 3) {
          doc.setFillColor(...rankColor);
          doc.circle(cx, cy, 2.8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...WHITE);
        } else {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...MUTED);
        }
        doc.text(`${rank}`, cx, cy + 1, { align: 'center' });

        // Player name
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...DARK);
        doc.text(`${p.first_name} ${p.last_name}`, COL.player.x + 2, y + ROW_H / 2 + 1.2);

        // Gender
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        const gender = p.gender === 'Male' ? 'M' : p.gender === 'Female' ? 'F' : '-';
        doc.text(gender, COL.gender.x + COL.gender.w / 2, y + ROW_H / 2 + 1.2, { align: 'center' });

        // Points
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...BLUE);
        doc.text(`${p._points} pts`, COL.points.x + COL.points.w / 2, y + ROW_H / 2 + 1.2, { align: 'center' });

        // Row border
        doc.setDrawColor(220, 228, 245);
        doc.setLineWidth(0.15);
        doc.line(ML, y + ROW_H, ML + CW, y + ROW_H);

        y += ROW_H;
      });

      // ── SUBS SECTION ─────────────────────────────────────────
      const subs = ladderPlayers.filter(p => p.ladder_status === 'sub');
      if (subs.length) {
        // Page break check before subs header
        if (y + 6.5 + ROW_H > PAGE_BOTTOM) y = addPageBreak();

        y += 3;
        doc.setFillColor(...MUTED);
        doc.rect(ML, y, CW, 6.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...WHITE);
        doc.text('Subs', ML + CW / 2, y + 4.5, { align: 'center' });
        y += 6.5;

        subs.forEach((p, i) => {
          // Page break check
          if (y + ROW_H > PAGE_BOTTOM) y = addPageBreak();

          if (i % 2 === 0) {
            doc.setFillColor(248, 248, 248);
            doc.rect(ML, y, CW, ROW_H, 'F');
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(...DARK);
          doc.text(`${p.first_name} ${p.last_name}`, COL.player.x + 2, y + ROW_H / 2 + 1.2);
          const gender = p.gender === 'Male' ? 'M' : p.gender === 'Female' ? 'F' : '-';
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text(gender, COL.gender.x + COL.gender.w / 2, y + ROW_H / 2 + 1.2, { align: 'center' });
          doc.setDrawColor(220, 228, 245);
          doc.setLineWidth(0.15);
          doc.line(ML, y + ROW_H, ML + CW, y + ROW_H);
          y += ROW_H;
        });
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

      // Download
      const safeDate = dateStr.replace(/,?\s+/g, '_');
      const fileName = `${ladderName.replace(/\s+/g, '_')}_Standings_${safeDate}.pdf`;
      doc.save(fileName);
      toast(`✅ Standings downloaded: ${fileName}`);
    } catch (err) {
      toast(`Error generating PDF: ${err.message}`, true);
      console.error('[printStandings]', err);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📄 Print Standings'; }
    }
  };

  /* ─── SESSIONS ─────────────────────────────────────────── */

  window.toggleNoShowPenalty = async (matchId, currentPts) => {
    const newPts = currentPts < 0 ? 0 : -4;
    try {
      await api(`matches?id=eq.${matchId}`, 'PATCH', { points_earned: newPts });
      toast(`Penalty updated to ${newPts} pts`);
      loadSessions();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  const loadSessions = async () => {
    if (!currentLadder) {
      document.getElementById('sessions-list').innerHTML =
        '<div class="empty">Please select a ladder first.</div>';
      return;
    }

    // Set ladder title
    const titleEl = document.getElementById('sessions-ladder-title');
    if (titleEl) { titleEl.textContent = currentLadder.name; titleEl.style.display = 'block'; }

    try {
      const matches = await api(
        `matches?select=*,players(first_name,last_name)&ladder_id=eq.${currentLadder.id}&order=session_date.desc,court_group,game_number,id`,
      );
      if (!matches.length) {
        document.getElementById('sessions-list').innerHTML =
          '<div class="empty">No sessions recorded yet.</div>';
        return;
      }

      // Deduplicate matches — keep only the latest row per player+game+court+date
      const deduped = {};
      matches.forEach((m) => {
        const dedupeKey = `${m.session_date}__${m.court_group}__${m.game_number}__${m.player_id}`;
        if (!deduped[dedupeKey] || m.id > deduped[dedupeKey].id) {
          deduped[dedupeKey] = m;
        }
      });
      const dedupedMatches = Object.values(deduped);

      // Group by court (date__time__court_group)
      const grouped = {};
      dedupedMatches.forEach((m) => {
        const time = m.session_time || '00:00';
        const key = `${m.session_date}__${time}__${m.court_group}`;
        if (!grouped[key]) grouped[key] = { date: m.session_date, time, group: m.court_group, games: {}, noShow: [] };
        if (m.default_no_show) {
          grouped[key].noShow.push(m);
        } else {
          if (!grouped[key].games[m.game_number]) grouped[key].games[m.game_number] = [];
          grouped[key].games[m.game_number].push(m);
        }
      });

      // Group by date → time → courts
      const byDate = {};
      Object.values(grouped).forEach((s) => {
        if (!byDate[s.date]) byDate[s.date] = {};
        if (!byDate[s.date][s.time]) byDate[s.date][s.time] = [];
        byDate[s.date][s.time].push(s);
      });

      const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

      // Helper: group 4 match rows into 2 teams by score_for value
      const buildTeams = (players) => {
        // Always exclude no-show players from team splitting
        const activePlayers = players.filter(p => !p.default_no_show);
        const allPending = activePlayers.every(p => p.score_for === null);
        if (allPending) {
          // No scores yet — split by roster order: first 2 = Team A, last 2 = Team B
          return [activePlayers.slice(0, 2), activePlayers.slice(2)];
        }
        const teamMap = {};
        activePlayers.forEach((p) => {
          const key = p.score_for !== null ? String(p.score_for) : 'pending';
          if (!teamMap[key]) teamMap[key] = [];
          teamMap[key].push(p);
        });
        const keys = Object.keys(teamMap);
        // Sort: higher score first = team A (winner)
        const sorted = keys.sort((a, b) => {
          const na = parseFloat(a), nb = parseFloat(b);
          if (isNaN(na) || isNaN(nb)) return 0;
          return nb - na;
        });
        return [teamMap[sorted[0]] || [], teamMap[sorted[1]] || []];
      };

      // Helper: compute per-date session summary
      const computeSummary = (courts, allMatches) => {
        const dateMatches = allMatches.filter(m =>
          courts.some(c => c.date === m.session_date && c.group === m.court_group)
        );
        // Total games
        const gameKeys = new Set(dateMatches.map(m => `${m.session_date}__${m.court_group}__${m.game_number}`));
        const totalGames = gameKeys.size;
        const totalCourts = courts.length;
        // MVP — player with most points_earned this session
        const ptsByPlayer = {};
        const nameByPlayer = {};
        dateMatches.forEach(m => {
          if (m.score_for !== null && !m.default_no_show) {
            ptsByPlayer[m.player_id] = (ptsByPlayer[m.player_id] || 0) + (m.points_earned || 0);
            if (m.players) nameByPlayer[m.player_id] = `${m.players.first_name} ${m.players.last_name}`;
          }
        });
        const mvpId = Object.keys(ptsByPlayer).sort((a,b) => ptsByPlayer[b] - ptsByPlayer[a])[0];
        const mvpName = mvpId ? (nameByPlayer[mvpId] || 'Unknown') : '—';
        const mvpPts  = mvpId ? ptsByPlayer[mvpId] : 0;
        // Closest match — smallest score diff
        const scoredGames = [];
        gameKeys.forEach(key => {
          const gMatches = dateMatches.filter(m =>
            `${m.session_date}__${m.court_group}__${m.game_number}` === key && m.score_for !== null
          );
          if (gMatches.length >= 2) {
            const scores = [...new Set(gMatches.map(m => m.score_for))].sort((a,b) => b-a);
            if (scores.length === 2) {
              const diff = scores[0] - scores[1];
              const parts = key.split('__');
              scoredGames.push({ diff, score: `${scores[0]}–${scores[1]}`, court: parts[1], game: parts[2] });
            }
          }
        });
        scoredGames.sort((a,b) => a.diff - b.diff);
        const closest  = scoredGames[0]  || null;
        const biggest  = scoredGames[scoredGames.length - 1] || null;
        // Court highlight — court with smallest avg score diff (most competitive)
        const courtDiffs = {};
        const courtCounts = {};
        scoredGames.forEach(g => {
          courtDiffs[g.court]  = (courtDiffs[g.court]  || 0) + g.diff;
          courtCounts[g.court] = (courtCounts[g.court] || 0) + 1;
        });
        const bestCourt = Object.keys(courtDiffs).sort((a,b) =>
          (courtDiffs[a]/courtCounts[a]) - (courtDiffs[b]/courtCounts[b])
        )[0];
        return { totalGames, totalCourts, mvpName, mvpPts, closest, biggest, bestCourt };
      };

      // SVG icons (inline, match sidebar style)
      const calSVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
      const calSm   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
      const plrSm   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
      const subSm   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
      const gameSm  = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M8.56 13.9l-1.56 6.1 5-3 5 3-1.56-6.1"/></svg>`;
      const editSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      const dnlSVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

      let html = '';

      sortedDates.forEach((date, dateIdx) => {
        const timeSlots = byDate[date];
        const allCourts = Object.values(timeSlots).flat();
        const isFirst = dateIdx === 0;
        const groupId = `sdg-${date.replace(/-/g, '')}`;

        // Date label
        const d = new Date(date + 'T00:00:00');
        const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
        const dateFormatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const dateLabel = `${weekday} Session — ${dateFormatted}`;

        // Per-date stats across all time slots
        const allDateMatches = allCourts.flatMap(c => Object.values(c.games).flat());
        const courtCount    = allCourts.length;
        const totalGames    = new Set(allDateMatches.map(m => `${m.court_group}__${m.game_number}`)).size;
        const uniquePlayers = new Set(allDateMatches.map(m => m.player_id)).size;
        const subCount      = allDateMatches.filter(m => m.is_sub).length;
        const pendingGames  = allCourts.reduce((total, s) =>
          total + Object.keys(s.games).filter(gnum =>
            s.games[gnum].some(m => !m.default_no_show && m.score_for === null)
          ).length, 0);

        const sum = computeSummary(allCourts, matches);

        html += `<div class="session-date-group" id="${groupId}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
            <div class="session-date-header ${isFirst ? 'open' : ''}"
                 data-action="toggleSessionGroup" data-groupid="${groupId}"
                 style="display:flex;align-items:center;gap:12px;flex:1;
                        padding:12px 16px;border-radius:8px;cursor:pointer;
                        background:#e8f0ff;border:0.5px solid #c5d6f5;user-select:none;">
              <span class="sdg-chevron ${isFirst ? 'sdg-chevron-open' : ''}"
                    style="font-size:11px;font-weight:800;color:#174CCC;">▼</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:800;color:#174CCC;display:flex;align-items:center;gap:8px;">
                  ${calSVG} ${esc(dateLabel)}
                  ${pendingGames ? `<span style="font-size:9px;font-weight:800;color:var(--orange);background:var(--orange-light);padding:2px 7px;border-radius:99px;text-transform:uppercase;letter-spacing:.5px;">⏳ ${pendingGames} pending</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:14px;margin-top:4px;">
                  <span style="font-size:11px;font-weight:600;color:#6b7a99;display:flex;align-items:center;gap:4px;">${calSm} ${courtCount} Court${courtCount !== 1 ? 's' : ''}</span>
                  <span style="font-size:11px;font-weight:600;color:#6b7a99;display:flex;align-items:center;gap:4px;">${gameSm} ${totalGames} Games</span>
                  <span style="font-size:11px;font-weight:600;color:#6b7a99;display:flex;align-items:center;gap:4px;">${plrSm} ${uniquePlayers} Players</span>
                  <span style="font-size:11px;font-weight:600;color:#6b7a99;display:flex;align-items:center;gap:4px;">${subSm} ${subCount} Subs</span>
                </div>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" data-action="printRoster"
                    data-date="${esc(date)}" data-ladderid="${currentLadder.id}"
                    style="font-size:10px;font-weight:700;flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:6px;border-radius:99px;">
              ${dnlSVG} Export Roster
            </button>
          </div>`;

        html += `<div class="session-date-body" style="display:${isFirst ? 'block' : 'none'};margin-bottom:8px;">`;

        html += `<div class="sess-summary-row">
          <div class="sess-sum-card sc-blue">
            <div class="sess-sum-label">Total Games</div>
            <div class="sess-sum-val">${sum.totalGames}</div>
            <div class="sess-sum-ctx scc-blue">${sum.totalCourts} court${sum.totalCourts !== 1 ? 's' : ''}</div>
          </div>
          <div class="sess-sum-card sc-gold">
            <div class="sess-sum-label">MVP</div>
            <div class="sess-sum-val-text">${esc(sum.mvpName)}</div>
            <div class="sess-sum-ctx scc-gold">+${sum.mvpPts} pts this session</div>
          </div>
          <div class="sess-sum-card sc-teal">
            <div class="sess-sum-label">Closest Match</div>
            <div class="sess-sum-val">${sum.closest ? sum.closest.score : '—'}</div>
            <div class="sess-sum-ctx scc-green">${sum.closest ? `Court ${sum.closest.court}, Game ${sum.closest.game}` : 'No scores yet'}</div>
          </div>
          <div class="sess-sum-card sc-orange">
            <div class="sess-sum-label">Biggest Win</div>
            <div class="sess-sum-val">${sum.biggest ? sum.biggest.score : '—'}</div>
            <div class="sess-sum-ctx scc-orange">${sum.biggest ? `Court ${sum.biggest.court}, Game ${sum.biggest.game}` : 'No scores yet'}</div>
          </div>
          <div class="sess-sum-card sc-blue">
            <div class="sess-sum-label">Court Highlight</div>
            <div class="sess-sum-val-text">${sum.bestCourt ? `Court ${sum.bestCourt}` : '—'}</div>
            <div class="sess-sum-ctx scc-blue">Most competitive</div>
          </div>
        </div>`;

        // Time slot blocks — sorted by time ascending
        const sortedTimes = Object.keys(timeSlots).sort();
        sortedTimes.forEach((time) => {
          const timeCourts = timeSlots[time];
          html += `<div style="margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#f4f6fc;border-radius:6px;margin-bottom:6px;border-left:3px solid #174CCC;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style="font-size:11px;font-weight:800;color:#174CCC;">${fmtTime12(time)}</span>
            </div>`;

          // Court blocks inside this time slot
          timeCourts.forEach((s) => {
          const courtGames   = Object.values(s.games).flat();
          const courtPending = courtGames.some(m => !m.default_no_show && m.score_for === null);
          // Include no-show row IDs so deleting a session removes them too
          const allCourtRows    = [...courtGames, ...(s.noShow || [])];
          const sessionMatchIds = allCourtRows.map(m => m.id).join(',');

          // Build no-show banner HTML for court level display
          const noShowBannerHtml = s.noShow && s.noShow.length ? s.noShow.map(ns => {
            const name = ns.players ? `${esc(ns.players.first_name)} ${esc(ns.players.last_name)}` : 'Unknown';
            const pts  = ns.points_earned;
            const isPenalty = pts < 0;
            return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:7px 12px;background:var(--orange-light);border:1px solid rgba(242,96,36,0.2);border-radius:8px;flex-wrap:wrap;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style="font-size:12px;font-weight:800;color:var(--orange);">No-show: ${name}</span>
              <span style="font-size:11px;font-weight:700;color:var(--orange);">${pts} pts</span>
              <button onclick="toggleNoShowPenalty(${ns.id}, ${pts})"
                style="margin-left:auto;padding:3px 10px;border:1px solid rgba(242,96,36,0.3);border-radius:99px;background:white;color:var(--orange);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;cursor:pointer;">
                Change to ${isPenalty ? '0 pts (excused)' : '-4 pts (penalty)'}
              </button>
            </div>`;
          }).join('') : '';

          html += `<div class="court-block">
            <div class="court-block-hdr">
              <span class="court-block-label">Court ${s.group}${courtPending ? ' <span style="font-size:9px;font-weight:800;color:var(--orange);background:var(--orange-light);padding:1px 6px;border-radius:99px;text-transform:uppercase;margin-left:6px;">Pending</span>' : ''}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="sess-edit-btn" data-action="editSession" data-matchids="${sessionMatchIds}" data-date="${esc(s.date)}" data-court="${s.group}" data-time="${esc(s.time||'')}" title="Edit session">${editSVG}</button>
                <button class="sess-edit-btn" data-action="deleteSession" data-matchids="${sessionMatchIds}" data-date="${esc(s.date)}" data-court="${s.group}" data-time="${esc(s.time||'')}" title="Delete session" style="border-color:rgba(229,57,53,0.3);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
              </div>
            </div>
            ${noShowBannerHtml}`;

          // Game rows — team-based layout
          Object.entries(s.games).forEach(([gnum, players]) => {
            const gameIds = players.map(p => p.id).join(',');
            const [teamA, teamB] = buildTeams(players);
            const isPending = players.some(p => p.score_for === null && !p.default_no_show);

            const renderTeam = (team, isWinner) => {
              if (!team || !team.length) return '';
              const p0 = team[0];
              const score = p0.default_no_show ? '-1' : p0.score_for !== null ? String(p0.score_for) : '—';
              const regularPts = team.filter(p => !p.is_sub).map(p => p.points_earned || 0);
              const teamPts    = regularPts.length ? Math.max(...regularPts) : (p0.points_earned || 0);
              const pts        = p0.default_no_show ? '-1 pt' : p0.score_for !== null ? `+${teamPts} pts` : 'pending';
              const isPend = p0.score_for === null && !p0.default_no_show;

              let blockClass = 'sess-team-block ';
              let scoreClass = 'sess-score-num ';
              let ptsClass   = 'sess-score-pts ';
              let nameClass  = 'sess-team-names';
              if (isPend) {
                blockClass += 'sess-team-pending';
                scoreClass += 'sess-score-pending';
                ptsClass   += 'sess-pts-pending';
                nameClass  += ' pending';
              } else if (isWinner) {
                blockClass += 'sess-team-win';
                scoreClass += 'sess-score-win';
                ptsClass   += 'sess-pts-win';
              } else {
                blockClass += 'sess-team-lose';
                scoreClass += 'sess-score-lose';
                ptsClass   += 'sess-pts-lose';
                nameClass  += ' lose';
              }

              const names = team.map(p => {
                const name = p.players ? `${esc(p.players.first_name)} ${esc(p.players.last_name)}` : 'Unknown';
                const sub  = p.is_sub ? '<span class="sub-pill-blue">SUB</span>' : '';
                return name + sub;
              }).join('<br>');

              return `<div class="${blockClass}">
                <div class="${nameClass}">${names}</div>
                <div class="sess-team-score">
                  <span class="${scoreClass}">${score}</span>
                  <span class="${ptsClass}">${pts}</span>
                </div>
              </div>`;
            };

            // Determine winner (higher score_for)
            const scoreA = teamA[0] ? teamA[0].score_for : null;
            const scoreB = teamB[0] ? teamB[0].score_for : null;
            const aWins  = scoreA !== null && scoreB !== null && scoreA > scoreB;
            const bWins  = scoreA !== null && scoreB !== null && scoreB > scoreA;

            html += `<div class="sess-game-row">
              <span class="sess-game-label">Game ${gnum}</span>
              <div class="sess-game-body">
                ${renderTeam(teamA, aWins)}
                <div class="sess-vs"><div class="sess-vs-line"></div><span>VS</span><div class="sess-vs-line"></div></div>
                ${renderTeam(teamB, bWins)}
              </div>
              <button class="sess-edit-btn" data-action="editGame" data-gameids="${gameIds}" data-gnum="${gnum}" data-date="${esc(s.date)}" data-court="${s.group}" title="Edit game">${editSVG}</button>
            </div>`;
          });

          html += '</div>'; // court-block
          }); // end timeCourts.forEach
          html += '</div>'; // time-slot div
        }); // end sortedTimes.forEach

        html += '</div>'; // session-date-body
        html += '</div>'; // session-date-group
      }); // end sortedDates

      document.getElementById('sessions-list').innerHTML = html;
    } catch (e) {
      document.getElementById('sessions-list').innerHTML =
        `<div class="empty">Error: ${esc(e.message)}</div>`;
    }
  };

  // Accordion toggle — one date open at a time
  const toggleSessionGroup = (btn) => {
    const groupId = btn.dataset.groupid;
    const clickedGroup = document.getElementById(groupId);
    if (!clickedGroup) return;

    const clickedBody    = clickedGroup.querySelector('.session-date-body');
    const clickedHeader  = clickedGroup.querySelector('.session-date-header');
    const clickedChevron = clickedGroup.querySelector('.sdg-chevron');
    const isOpen = clickedHeader.classList.contains('open');

    // Close ALL groups first
    document.querySelectorAll('.session-date-group').forEach((g) => {
      g.querySelector('.session-date-body').style.display = 'none';
      g.querySelector('.session-date-header').classList.remove('open');
      const ch = g.querySelector('.sdg-chevron');
      ch.classList.remove('sdg-chevron-open');
      ch.style.transform = '';
    });

    // If the clicked one was closed, open it
    if (!isOpen) {
      clickedBody.style.display = 'block';
      clickedHeader.classList.add('open');
      clickedChevron.classList.add('sdg-chevron-open');
      clickedChevron.style.transform = 'rotate(90deg)';
    }
  };

  const editSession = (btn) => {
    const ids   = btn.dataset.matchids.split(',').filter(Boolean);
    const date  = btn.dataset.date;
    const court = btn.dataset.court;
    const time  = btn.dataset.time || '';
    document.getElementById('es-ids').value       = ids.join(',');
    document.getElementById('es-date').value      = date;
    document.getElementById('es-time').value      = time;
    document.getElementById('es-court').value     = court;
    document.getElementById('es-orig-date').value = date;
    document.getElementById('es-orig-court').value= court;
    document.getElementById('es-orig-time').value = time;
    document.getElementById('edit-session-modal').classList.add('open');
  };

  const saveEditSession = async (e) => {
    e.preventDefault();
    const ids = document.getElementById('es-ids').value.split(',').filter(Boolean);
    const newDate  = document.getElementById('es-date').value;
    const newTime  = document.getElementById('es-time').value;
    const newCourt = document.getElementById('es-court').value;
    const origDate = document.getElementById('es-orig-date').value;
    const origTime = document.getElementById('es-orig-time').value;
    const origCourt= document.getElementById('es-orig-court').value;

    if (!newDate || !newTime || !newCourt) {
      toast('Please fill in date, time, and court number.', true);
      return;
    }
    if (newDate !== origDate || newTime !== origTime || newCourt !== origCourt) {
      const existing = await api(
        `matches?session_date=eq.${newDate}&session_time=eq.${newTime}&court_group=eq.${newCourt}&ladder_id=eq.${currentLadder.id}&limit=1`,
      );
      if (existing.length) {
        const d = fmtDate(newDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        toast(
          `A session already exists for Court ${newCourt} on ${d} at ${fmtTime12(newTime)}. Please choose a different date, time, or court.`,
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
        session_time: newTime,
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
    if (!rows.length) { toast('Could not load game data.', true); return; }
    const isVoided = rows[0].score_for === null;
    const modalBody = document.getElementById('edit-game-body');

    // Group rows into 2 teams by score_for (or index split if unscored)
    const scored = rows.filter(r => r.score_for !== null);
    let teamA = [], teamB = [];
    if (scored.length) {
      const scores = [...new Set(scored.map(r => r.score_for))].sort((a,b) => b-a);
      teamA = rows.filter(r => r.score_for === scores[0] || (scores.length === 1 && rows.indexOf(r) < 2));
      teamB = rows.filter(r => !teamA.includes(r));
    } else {
      teamA = rows.slice(0, 2);
      teamB = rows.slice(2);
    }
    // Ensure teamA has higher score (winner on left)
    if (teamA[0] && teamB[0] && teamA[0].score_for !== null && teamB[0].score_for !== null) {
      if (teamA[0].score_for < teamB[0].score_for) { [teamA, teamB] = [teamB, teamA]; }
    }

    const isSubRow = (r) => r.is_sub || ladderPlayers.find(p => p.id === r.player_id)?.ladder_status === 'sub';
    const teamANames = teamA.map(r => {
      const name = r.players ? `${esc(r.players.first_name)} ${esc(r.players.last_name)}` : 'Unknown';
      return isSubRow(r) ? `${name} <span style="font-size:10px;font-weight:700;color:#6b7a99;background:#f0f2f8;padding:1px 6px;border-radius:99px;vertical-align:middle;">Sub</span>` : name;
    }).join('<br>');
    const teamBNames = teamB.map(r => {
      const name = r.players ? `${esc(r.players.first_name)} ${esc(r.players.last_name)}` : 'Unknown';
      return isSubRow(r) ? `${name} <span style="font-size:10px;font-weight:700;color:#6b7a99;background:#f0f2f8;padding:1px 6px;border-radius:99px;vertical-align:middle;">Sub</span>` : name;
    }).join('<br>');
    const teamAScore = teamA[0] ? (teamA[0].score_for !== null ? teamA[0].score_for : '') : '';
    const teamBScore = teamB[0] ? (teamB[0].score_for !== null ? teamB[0].score_for : '') : '';
    const teamAAgainst = teamA[0] ? (teamA[0].score_against !== null ? teamA[0].score_against : '') : '';
    const teamBAgainst = teamB[0] ? (teamB[0].score_against !== null ? teamB[0].score_against : '') : '';
    const teamAIds = teamA.map(r => r.id).join(',');
    const teamBIds = teamB.map(r => r.id).join(',');

    modalBody.innerHTML = `
      <div style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#0d1f4a;margin-bottom:14px;">
        Game ${esc(gnum)} — ${fmtDate(date)} — Court ${esc(court)}
      </div>
      <label class="void-toggle-wrap" style="margin-bottom:16px;">
        <input type="checkbox" id="eg-void-game" ${isVoided ? 'checked' : ''} data-action="toggleEditGameVoid">
        <div class="void-toggle-track"></div>
        <span class="void-toggle-label">Void this game (0 points for all players)</span>
      </label>
      <div id="eg-scores-section" class="${isVoided ? 'opacity-04' : ''}">
        <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:start;">
          <div style="background:#e8f0ff;border-radius:8px;padding:14px;">
            <div style="font-size:12px;font-weight:800;color:#0d1f4a;margin-bottom:8px;line-height:1.8;">
              ${teamA.map(r => {
                const name = r.players ? `${esc(r.players.first_name)} ${esc(r.players.last_name)}` : 'Unknown';
                const sub  = isSubRow(r);
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span>${name}${sub ? ` <span style="font-size:10px;font-weight:700;color:#6b7a99;background:#f0f2f8;padding:1px 6px;border-radius:99px;">Sub</span>` : ''}</span>
                  <span id="eg-inline-pts-${r.id}" style="font-size:11px;font-weight:700;color:#6b7a99;white-space:nowrap;"></span>
                </div>`;
              }).join('')}
            </div>
            <div class="form-group" style="margin-bottom:6px;">
              <label style="font-size:10px;">Score</label>
              <input type="number" min="0" max="11" id="eg-sf-teamA" value="${teamAScore}" placeholder="0" data-egteam="A">
            </div>
            <div style="font-size:10px;font-weight:600;color:var(--text-muted);">Points: <span id="eg-pts-teamA-display">auto</span></div>
            <input type="hidden" id="eg-ids-teamA" value="${teamAIds}">
            <input type="hidden" id="eg-sub-ids-teamA" value="${teamA.filter(r => { const lp = ladderPlayers.find(p => p.id === r.player_id); return r.is_sub || lp?.ladder_status === 'sub'; }).map(r=>r.id).join(',')}">
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding-top:32px;color:rgba(23,76,204,0.3);font-size:10px;font-weight:800;">
            <div style="width:1px;height:20px;background:rgba(23,76,204,0.15);"></div>
            VS
            <div style="width:1px;height:20px;background:rgba(23,76,204,0.15);"></div>
          </div>
          <div style="background:#e8f5f1;border-radius:8px;padding:14px;">
            <div style="font-size:12px;font-weight:800;color:#0d1f4a;margin-bottom:8px;line-height:1.8;">
              ${teamB.map(r => {
                const name = r.players ? `${esc(r.players.first_name)} ${esc(r.players.last_name)}` : 'Unknown';
                const sub  = isSubRow(r);
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <span>${name}${sub ? ` <span style="font-size:10px;font-weight:700;color:#6b7a99;background:#f0f2f8;padding:1px 6px;border-radius:99px;">Sub</span>` : ''}</span>
                  <span id="eg-inline-pts-${r.id}" style="font-size:11px;font-weight:700;color:#6b7a99;white-space:nowrap;"></span>
                </div>`;
              }).join('')}
            </div>
            <div class="form-group" style="margin-bottom:6px;">
              <label style="font-size:10px;">Score</label>
              <input type="number" min="0" max="11" id="eg-sf-teamB" value="${teamBScore}" placeholder="0" data-egteam="B">
            </div>
            <div style="font-size:10px;font-weight:600;color:var(--text-muted);">Points: <span id="eg-pts-teamB-display">auto</span></div>
            <input type="hidden" id="eg-ids-teamB" value="${teamBIds}">
            <input type="hidden" id="eg-sub-ids-teamB" value="${teamB.filter(r => { const lp = ladderPlayers.find(p => p.id === r.player_id); return r.is_sub || lp?.ladder_status === 'sub'; }).map(r=>r.id).join(',')}">
          </div>
        </div>
      </div>
      <input type="hidden" id="eg-ids" value="${ids.join(',')}">
    `;

    // Auto-calc points preview when scores change
    const calcDisplay = () => {
      const sfA = parseInt(document.getElementById('eg-sf-teamA').value, 10);
      const sfB = parseInt(document.getElementById('eg-sf-teamB').value, 10);
      if (isNaN(sfA) || isNaN(sfB)) return;
      const ptA = calcPoints(sfA, sfB);
      const ptB = calcPoints(sfB, sfA);
      const subIdsA = (document.getElementById('eg-sub-ids-teamA')?.value || '').split(',').filter(Boolean);
      const subIdsB = (document.getElementById('eg-sub-ids-teamB')?.value || '').split(',').filter(Boolean);

      // Update Team A player lines with inline points
      teamA.forEach(r => {
        const elId = `eg-inline-pts-${r.id}`;
        const el   = document.getElementById(elId);
        if (!el) return;
        const sub  = subIdsA.includes(String(r.id));
        el.textContent = sub ? '0 pts' : `${ptA > 0 ? '+' : ''}${ptA} pts`;
        el.style.color = sub ? '#6b7a99' : '#174CCC';
      });
      // Update Team B player lines with inline points
      teamB.forEach(r => {
        const elId = `eg-inline-pts-${r.id}`;
        const el   = document.getElementById(elId);
        if (!el) return;
        const sub  = subIdsB.includes(String(r.id));
        el.textContent = sub ? '0 pts' : `${ptB > 0 ? '+' : ''}${ptB} pts`;
        el.style.color = sub ? '#6b7a99' : '#174CCC';
      });
      // Legacy displays
      document.getElementById('eg-pts-teamA-display').textContent = '+' + ptA;
      document.getElementById('eg-pts-teamB-display').textContent = '+' + ptB;
    };
    document.getElementById('eg-sf-teamA').addEventListener('input', calcDisplay);
    document.getElementById('eg-sf-teamB').addEventListener('input', calcDisplay);
    calcDisplay();

    document.getElementById('edit-game-modal').classList.add('open');
  };

  const toggleEditGameVoid = () => {
    const isVoid = document.getElementById('eg-void-game').checked;
    const section = document.getElementById('eg-scores-section');
    section.classList.toggle('opacity-04', isVoid);
  };

  const saveEditGame = async (e) => {
    e.preventDefault();
    const isVoid = document.getElementById('eg-void-game').checked;

    // Read team-based inputs
    const sfAEl = document.getElementById('eg-sf-teamA');
    const sfBEl = document.getElementById('eg-sf-teamB');
    const teamAIds = (document.getElementById('eg-ids-teamA')?.value || '').split(',').filter(Boolean);
    const teamBIds = (document.getElementById('eg-ids-teamB')?.value || '').split(',').filter(Boolean);

    if (!isVoid) {
      if (!sfAEl || !sfBEl || sfAEl.value === '' || sfBEl.value === '') {
        toast('Please enter scores for both teams, or mark the game as void.', true);
        return;
      }
    }

    const sfA = sfAEl ? parseInt(sfAEl.value, 10) : null;
    const sfB = sfBEl ? parseInt(sfBEl.value, 10) : null;
    const ptsA = (!isVoid && !isNaN(sfA) && !isNaN(sfB)) ? calcPoints(sfA, sfB) : 0;
    const ptsB = (!isVoid && !isNaN(sfA) && !isNaN(sfB)) ? calcPoints(sfB, sfA) : 0;

    // Read sub IDs — subs always get 0 points
    const subIdsA = (document.getElementById('eg-sub-ids-teamA')?.value || '').split(',').filter(Boolean);
    const subIdsB = (document.getElementById('eg-sub-ids-teamB')?.value || '').split(',').filter(Boolean);

    try {
      const updates = [];
      teamAIds.forEach(id => {
        const isSub = subIdsA.includes(String(id));
        updates.push(api(`matches?id=eq.${id}`, 'PATCH', {
          score_for:     isVoid ? null : sfA,
          score_against: isVoid ? null : sfB,
          points_earned: isVoid ? 0 : isSub ? 0 : ptsA,
        }));
      });
      teamBIds.forEach(id => {
        const isSub = subIdsB.includes(String(id));
        updates.push(api(`matches?id=eq.${id}`, 'PATCH', {
          score_for:     isVoid ? null : sfB,
          score_against: isVoid ? null : sfA,
          points_earned: isVoid ? 0 : isSub ? 0 : ptsB,
        }));
      });
      await Promise.all(updates);
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
    // Show ladder name as big title above points reference
    const titleEl = document.getElementById('entry-ladder-title');
    if (titleEl) {
      if (currentLadder && currentLadder.name) {
        titleEl.textContent = currentLadder.name;
        titleEl.style.display = 'block';
      } else {
        titleEl.style.display = 'none';
      }
    }
    courtPlayers = [];
    noShowPlayer = null;
    noShowPenalty = -4;
    subPlayers = new Set();
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
    // Auto-activate sub if player is registered as sub in this ladder
    if (p.ladder_status === 'sub') subPlayers.add(id);
    document.getElementById('player-search-entry').value = '';
    renderPlayerDropdown('');
    renderCourtPlayers();
  };

  const removeCourtPlayer = (id) => {
    if (noShowPlayer && noShowPlayer.id === id) noShowPlayer = null;
    subPlayers.delete(id);
    courtPlayers = courtPlayers.filter((p) => p.id !== id);
    renderPlayerDropdown(document.getElementById('player-search-entry')?.value || '');
    renderCourtPlayers();
    if (courtPlayers.filter((p) => !noShowPlayer || p.id !== noShowPlayer.id).length < 4) {
      document.getElementById('games-setup-card').style.display = 'none';
      document.getElementById('save-btn-wrap').style.display = 'none';
    }
  };

  const markNoShow = (pid) => {
    const id = parseInt(pid, 10);
    subPlayers.delete(id); // can't be both sub and no-show
    noShowPlayer = courtPlayers.find((p) => p.id === id) || null;
    noShowPenalty = -4;
    renderPlayerDropdown(document.getElementById('player-search-entry')?.value || '');
    renderCourtPlayers();
  };

  const markSub = (pid) => {
    const id = parseInt(pid, 10);
    // Can't be both sub and no-show
    if (noShowPlayer && noShowPlayer.id === id) { noShowPlayer = null; noShowPenalty = -4; }
    subPlayers.add(id);
    renderCourtPlayers();
  };

  const unmarkSub = (pid) => {
    subPlayers.delete(parseInt(pid, 10));
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
        const isSub    = subPlayers.has(p.id);
        const chipBg   = isNoShow ? 'no-show' : isSub ? 'sub-chip' : '';
        const badgeBg  = isNoShow ? 'no-show' : isSub ? 'sub-badge' : '';

        // Sub pill styles
        const subActiveStyle  = 'background:rgba(36,188,150,0.15);border:1px solid #24BC96;color:#24BC96;';
        const subDefaultStyle = 'background:none;border:0.5px solid var(--border);color:var(--text-muted);';
        const subStyle = isSub ? subActiveStyle : subDefaultStyle;
        const subAction = isSub ? 'unmarkSub' : 'markSub';
        const subLabel  = isSub ? 'Sub ✓' : 'Sub';

        // No-show pill styles
        const nsActiveStyle  = 'background:rgba(242,96,36,0.12);border:1px solid rgba(242,96,36,0.4);color:var(--orange);';
        const nsDefaultStyle = 'background:none;border:0.5px solid var(--border);color:var(--text-muted);';

        return `<div class="court-player ${chipBg}" style="${isSub ? 'background:rgba(36,188,150,0.06);border-color:rgba(36,188,150,0.3);' : ''}">
          <span class="court-num-badge ${badgeBg}" style="${isSub ? 'background:#24BC96;' : ''}">${i + 1}</span>
          <span class="text-bold" style="font-size:13px;">${esc(p.first_name)} ${esc(p.last_name)}</span>
          <div style="display:flex;gap:5px;margin-left:auto;align-items:center;">
            ${isNoShow
              ? `<span style="font-size:9px;font-weight:800;background:var(--orange);color:white;padding:2px 6px;border-radius:99px;letter-spacing:.5px;">NO-SHOW</span>
                 <button data-action="cancelNoShow" class="color-orange text-bold cursor-pointer" style="background:none;border:none;font-size:12px;padding:0 2px;">undo</button>`
              : `<button data-action="${subAction}" data-pid="${p.id}"
                  style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;cursor:pointer;${subStyle}">${subLabel}</button>
                 <button data-action="markNoShow" data-pid="${p.id}"
                  style="padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;cursor:pointer;${nsDefaultStyle}">No-show</button>
                 <button data-action="removeCourtPlayerBtn" data-pid="${p.id}" class="cursor-pointer text-muted-13" style="background:none;border:none;font-size:16px;line-height:1;padding:0 2px;">&times;</button>`
            }
          </div>
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
          <label class="void-toggle-wrap">
            <input type="checkbox" id="void-4" data-action="toggleVoid" data-gamenum="4">
            <div class="void-toggle-track"></div>
            <span class="void-toggle-label" style="color:var(--lime-dark);">Void</span>
          </label>
        </div>
        <div class="bg-bg text-muted-12" style="padding:10px 14px;">
          After the 3 games, match the 2 players with the closest total scores on each team.
        </div>
        <div id="game-body-4" class="game-card-body">
          <div class="vs-grid-top" style="align-items:center;">
            <div class="team-pad-blue-l" style="text-align:center;">
              <div class="blue-tag mb-8">Team A</div>
              <select id="extraA1-4" class="full-width mb-6" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${playerOpts}</select>
              <select id="extraA2-4" class="full-width mb-8" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${playerOpts}</select>
              <input type="number" min="0" max="11" placeholder="Score" id="scoreA-4" data-egame="4" data-eteam="A" class="full-width score-input">
            </div>
            <div class="vs-tag"><span>VS</span></div>
            <div class="team-pad-teal-l" style="text-align:center;">
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
              ? `<span style="font-size:11px;color:#174CCC;font-weight:500;">Sitting out: <strong style="color:#174CCC;font-weight:800;">${sitting.map((p) => esc(p.first_name + ' ' + p.last_name)).join(', ')}</strong></span>`
              : ''
          }
          <label class="void-toggle-wrap">
            <input type="checkbox" id="void-${gameNum}" data-action="toggleVoid" data-gamenum="${gameNum}">
            <div class="void-toggle-track"></div>
            <span class="void-toggle-label">Void</span>
          </label>
          ${isExtra ? `<button class="btn btn-danger btn-sm" data-action="removeExtraGame" data-gamenum="${gameNum}">Remove</button>` : ''}
        </div>
      </div>
      <div id="game-body-${gameNum}" class="game-card-body">
        <div class="vs-grid">
          <div class="team-pad-blue">
            <div class="blue-tag mb-6">Team A</div>
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px;line-height:1.8;">
              ${tA.map(p => {
                const sub = subPlayers.has(p.id);
                const pts = document.getElementById ? '' : '';
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                  <span>${esc(p.first_name + ' ' + p.last_name)}${sub ? ` <span style="font-size:9px;font-weight:700;color:#6b7a99;background:#f0f2f8;padding:1px 5px;border-radius:99px;">Sub</span>` : ''}</span>
                  <span id="rc-pts-${gameNum}-a-${p.id}" style="font-size:10px;font-weight:700;color:#6b7a99;white-space:nowrap;"></span>
                </div>`;
              }).join('')}
            </div>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreA-${gameNum}" data-autoscore="${gameNum}" class="score-input">
          </div>
          <div class="vs-tag"><span>VS</span></div>
          <div class="team-pad-teal">
            <div class="label-tag mb-6" style="color:var(--teal);">Team B</div>
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:10px;line-height:1.8;">
              ${tB.map(p => {
                const sub = subPlayers.has(p.id);
                return `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                  <span>${esc(p.first_name + ' ' + p.last_name)}${sub ? ` <span style="font-size:9px;font-weight:700;color:#6b7a99;background:#f0f2f8;padding:1px 5px;border-radius:99px;">Sub</span>` : ''}</span>
                  <span id="rc-pts-${gameNum}-b-${p.id}" style="font-size:10px;font-weight:700;color:#6b7a99;white-space:nowrap;"></span>
                </div>`;
              }).join('')}
            </div>
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
    const preview = document.getElementById(`pts-preview-${gameNum}`);
    if (isVoided) {
      body.classList.add('opacity-04');
      if (preview) preview.innerHTML =
        '<span class="color-orange text-bold">Game voided — 0 points for both teams</span>';
    } else {
      body.classList.remove('opacity-04');
      if (preview) preview.innerHTML = '';
      autoCalcGame(gameNum);
    }
  };

  const autoCalcGame = (gameNum) => {
    const sA = document.getElementById(`scoreA-${gameNum}`);
    const sB = document.getElementById(`scoreB-${gameNum}`);
    const preview = document.getElementById(`pts-preview-${gameNum}`);
    if (!sA || !sB || sA.value === '' || sB.value === '' || sA.value === '--' || sB.value === '--') {
      if (preview) preview.textContent = '';
      return;
    }
    const a = parseInt(sA.value, 10);
    const b = parseInt(sB.value, 10);
    if (isNaN(a) || isNaN(b)) { if (preview) preview.textContent = ''; return; }
    const ptA = calcPoints(a, b);
    const ptB = calcPoints(b, a);
    const tAIds = document.getElementById(`teamA-ids-${gameNum}`).value.split(',').filter(Boolean);
    const tBIds = document.getElementById(`teamB-ids-${gameNum}`).value.split(',').filter(Boolean);

    // Check sub status per player and build per-player preview
    const isSub = (id) => subPlayers.has(Number(id));
    const playerLabel = (id, pts) => {
      const p = allPlayers.find(x => x.id == id);
      const name = p ? p.first_name : `#${id}`;
      const sub  = isSub(id);
      const clr  = sub ? 'var(--text-muted)' : pts > 0 ? 'var(--teal)' : 'var(--orange)';
      const ptsStr = sub ? '0 pts (sub)' : `${pts > 0 ? '+' : ''}${pts} pts`;
      return `<span style="color:${clr};font-weight:700;">${esc(name)}: ${ptsStr}</span>`;
    };

    // Update inline pts spans inside game card player rows
    tAIds.forEach(id => {
      const el  = document.getElementById(`rc-pts-${gameNum}-a-${id}`);
      if (!el) return;
      const sub = isSub(id);
      el.textContent = sub ? '0 pts' : `${ptA > 0 ? '+' : ''}${ptA} pts`;
      el.style.color  = sub ? '#6b7a99' : '#174CCC';
    });
    tBIds.forEach(id => {
      const el  = document.getElementById(`rc-pts-${gameNum}-b-${id}`);
      if (!el) return;
      const sub = isSub(id);
      el.textContent = sub ? '0 pts' : `${ptB > 0 ? '+' : ''}${ptB} pts`;
      el.style.color  = sub ? '#6b7a99' : '#174CCC';
    });
    // Keep summary preview for overall display
    const teamAParts = tAIds.map(id => playerLabel(id, ptA));
    const teamBParts = tBIds.map(id => playerLabel(id, ptB));
    preview.innerHTML = [...teamAParts, ...teamBParts].join(' &nbsp;|&nbsp; ');
  };

  const autoCalcExtraGame = (gameNum) => {
    const sA = document.getElementById(`scoreA-${gameNum}`);
    const sB = document.getElementById(`scoreB-${gameNum}`);
    const preview = document.getElementById(`pts-preview-${gameNum}`);
    if (!sA || !sB || sA.value === '' || sB.value === '' || sA.value === '--' || sB.value === '--') {
      if (preview) preview.textContent = '';
      return;
    }
    const a = parseInt(sA.value, 10);
    const b = parseInt(sB.value, 10);
    if (isNaN(a) || isNaN(b)) { if (preview) preview.textContent = ''; return; }
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
          <label class="void-toggle-wrap">
            <input type="checkbox" id="void-${gameNum}" data-action="toggleVoid" data-gamenum="${gameNum}">
            <div class="void-toggle-track"></div>
            <span class="void-toggle-label">Void</span>
          </label>
          <button class="btn btn-danger btn-sm" data-action="removeExtraGame" data-gamenum="${gameNum}">Remove</button>
        </div>
      </div>
      <div id="game-body-${gameNum}" class="game-card-body">
        <div class="vs-grid-top" style="align-items:center;">
          <div class="team-pad-blue-l" style="text-align:center;">
            <div class="blue-tag mb-8">Team A</div>
            <select id="extraA1-${gameNum}" class="full-width mb-6" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 1</option>${playerOpts}</select>
            <select id="extraA2-${gameNum}" class="full-width mb-8" style="font-size:12px;font-family:Montserrat,sans-serif;"><option value="">Player 2</option>${playerOpts}</select>
            <input type="number" min="0" max="11" placeholder="Score" id="scoreA-${gameNum}" data-egame="${gameNum}" data-eteam="A" class="full-width score-input">
          </div>
          <div class="vs-tag"><span>VS</span></div>
          <div class="team-pad-teal-l" style="text-align:center;">
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
    const date      = document.getElementById('session-date').value;
    const sessionTm = document.getElementById('session-time').value;
    const courtNum  = document.getElementById('court-number').value;
    if (!date || !sessionTm || !courtNum) {
      toast('Please fill in session date, time, and court number.', true);
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

    // Validate uniqueness: date + time + court must be unique
    const existing = await api(
      `matches?session_date=eq.${date}&session_time=eq.${sessionTm}&court_group=eq.${courtNum}&ladder_id=eq.${currentLadder.id}&limit=1`,
    );
    if (existing.length) {
      const existingDate = fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      toast(
        `A session for Court ${courtNum} on ${existingDate} at ${fmtTime12(sessionTm)} already exists. Please choose a different date, time, or court.`,
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
          const isSubA = pA?.ladder_status === 'sub' || subPlayers.has(pA?.id);
          rows.push({
            session_date: date, session_time: sessionTm, court_group: parseInt(courtNum, 10), player_id: pid,
            game_number: extraGameMap[gameNum] || gameNum,
            score_for: isVoided ? null : scoreA, score_against: isVoided ? null : scoreB,
            points_earned: isSubA ? 0 : ptA, is_sub: isSubA,
            default_no_show: false, ladder_id: currentLadder.id,
          });
        });
        tBIds.forEach((pid) => {
          if (!pid) return;
          const pB = ladderPlayers.find((p) => p.id === pid);
          const isSubB = pB?.ladder_status === 'sub' || subPlayers.has(pB?.id);
          rows.push({
            session_date: date, session_time: sessionTm, court_group: parseInt(courtNum, 10), player_id: pid,
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
            session_date: date, session_time: sessionTm, court_group: parseInt(courtNum, 10), player_id: pid,
            game_number: extraGameMap[gameNum] || gameNum,
            score_for: null, score_against: null,
            points_earned: 0, is_sub: p?.ladder_status === 'sub' || subPlayers.has(p?.id),
            default_no_show: false, ladder_id: currentLadder.id,
          });
        });
      }
    }

    // No-show player always included regardless of mode
    if (noShowPlayer) {
      rows.push({
        session_date: date, session_time: sessionTm, court_group: parseInt(courtNum, 10), player_id: noShowPlayer.id,
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
        `matches?select=*,players(first_name,last_name)&ladder_id=eq.${ladderId}&session_date=eq.${date}&order=session_time,court_group,game_number,id`
      );
      if (!matches.length) { toast('No sessions found for this date.', true); return; }

      // Group by time → court
      const byTime = {};
      matches.forEach((m) => {
        const t = m.session_time || '00:00';
        if (!byTime[t]) byTime[t] = {};
        if (!byTime[t][m.court_group]) byTime[t][m.court_group] = { games: {}, noShow: [] };
        if (m.default_no_show) {
          byTime[t][m.court_group].noShow.push(m);
        } else {
          if (!byTime[t][m.court_group].games[m.game_number]) byTime[t][m.court_group].games[m.game_number] = [];
          byTime[t][m.court_group].games[m.game_number].push(m);
        }
      });
      const sortedPdfTimes = Object.keys(byTime).sort();

      // Ladder info for header
      const ladderName = currentLadder?.name || 'Ladder';
      const scoringFormat = currentLadder?.scoring_format || '';
      const dateLabel = fmtDate(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      // ── PRE-GENERATE SUBSCRIBE QR as canvas (once, reused for all courts) ──────
      // QRCode.js renders to a hidden canvas; jsPDF reads it as an image.
      const subscribeUrl = 'https://ferociasports.com/subscribe.html';
      const qrCanvas = await new Promise((resolve) => {
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
        document.body.appendChild(container);
        const qr = new QRCode(container, {
          text: subscribeUrl,
          width: 128, height: 128,
          colorDark: '#0d1f4a',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H,
        });
        // QRCode.js renders synchronously into an img then canvas
        setTimeout(() => {
          const canvas = container.querySelector('canvas');
          resolve(canvas);
          document.body.removeChild(container);
        }, 100);
      });
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

      // Build flat list: grouped by time slot, courts sorted numerically within each slot
      const courtNums = sortedPdfTimes.flatMap(t =>
        Object.keys(byTime[t]).map(Number).sort((a,b) => a-b).map(cn => ({ time: t, courtNum: cn, data: byTime[t][cn] }))
      );

      // ══════════════════════════════════════════════════════
      // SUMMARY PAGE — page 1: all courts with player list
      // ══════════════════════════════════════════════════════

      // ── Header ────────────────────────────────────────────
      doc.setFillColor(...BLUE);
      doc.rect(0, 0, PW, 22, 'F');
      doc.setFillColor(...LIME);
      doc.rect(0, 22, PW, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...WHITE);
      doc.text(ladderName, ML, 10, { maxWidth: CW * 0.65 });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(dateLabel, PW - MR, 10, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...LIME);
      doc.text('COURT ASSIGNMENTS', ML, 19);

      // ── Two-column grid ────────────────────────────────────
      const SUM_PAGE_BOTTOM = PH - 12;
      const COL_W  = (CW - 8) / 2;   // width of each column (8mm gap between)
      const COL1_X = ML;
      const COL2_X = ML + COL_W + 8;

      const COURT_HDR_H = 7;          // blue court header bar height
      const ROW_H_SUM   = 6;          // player name row height
      const COURT_GAP   = 5;          // vertical gap between courts

      // Split courts into two halves: left column first half, right column second half
      // This ensures reading top-to-bottom left then right gives sequential court order
      const half = Math.ceil(courtNums.length / 2);
      const leftCourts  = courtNums.slice(0, half);
      const rightCourts = courtNums.slice(half);
      const orderedCourts = [];
      const maxLen = Math.max(leftCourts.length, rightCourts.length);
      // Interleave so we can use single forEach with col tracking
      // Actually just concatenate: draw all left first, then all right
      // We'll handle this by tracking which column we're in via index
      let col = 0;                    // 0 = left column, 1 = right column
      let yL  = 28;                   // y cursor for left column
      let yR  = 28;                   // y cursor for right column
      const splitCourts = [...leftCourts.map(c => ({...c, col:0})), ...rightCourts.map(c => ({...c, col:1}))];

      // Helper: draw one court block in the summary, returns new y after drawing
      const drawSummaryCourtBlock = (courtNum, time, playerNames, noShowName, startX, startY) => {
        const totalRows = playerNames.length + (noShowName ? 1 : 0);
        const blockH    = COURT_HDR_H + totalRows * ROW_H_SUM;

        // Court header band
        doc.setFillColor(...BLUE);
        doc.rect(startX, startY, COL_W, COURT_HDR_H, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...WHITE);
        doc.text(`Court ${courtNum} · ${fmtTime12(time)}`, startX + COL_W / 2, startY + 5, { align: 'center' });

        // Player rows
        let ry = startY + COURT_HDR_H;
        playerNames.forEach((name, i) => {
          if (i % 2 === 0) {
            doc.setFillColor(245, 247, 252);
            doc.rect(startX, ry, COL_W, ROW_H_SUM, 'F');
          } else {
            doc.setFillColor(...WHITE);
            doc.rect(startX, ry, COL_W, ROW_H_SUM, 'F');
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(...DARK);
          doc.text(name, startX + 3, ry + 4.2);
          ry += ROW_H_SUM;
        });

        // No-show player (if any)
        if (noShowName) {
          doc.setFillColor(255, 245, 240);
          doc.rect(startX, ry, COL_W, ROW_H_SUM, 'F');
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(...ORANGE);
          doc.text(`${noShowName} (No show)`, startX + 3, ry + 4.2);
          ry += ROW_H_SUM;
        }

        // Border around the whole block
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.4);
        doc.rect(startX, startY, COL_W, blockH, 'S');

        return startY + blockH;
      };

      splitCourts.forEach(({ time, courtNum, data: court, col: fixedCol }) => {
        const gameNums = Object.keys(court.games).map(Number).sort((a, b) => a - b);

        // Collect unique active players for this court
        const pMap = {};
        gameNums.forEach((gn) => {
          court.games[gn].forEach((m) => {
            if (!m.default_no_show && m.players) {
              pMap[m.player_id] = `${m.players.first_name} ${m.players.last_name}`;
            }
          });
        });
        const playerNames = Object.values(pMap);
        const noShowMatch = court.noShow && court.noShow.length ? court.noShow[0] : null;
        const noShowName  = noShowMatch?.players
          ? `${noShowMatch.players.first_name} ${noShowMatch.players.last_name}` : null;

        const totalRows = playerNames.length + (noShowName ? 1 : 0);
        const blockH    = COURT_HDR_H + totalRows * ROW_H_SUM + COURT_GAP;

        // Use pre-assigned column: left half first, then right half
        const useLeft = fixedCol === 0;
        const startX  = useLeft ? COL1_X : COL2_X;
        const startY  = useLeft ? yL     : yR;

        // Check if block fits on current page — if not, add a new summary page
        if (startY + blockH > SUM_PAGE_BOTTOM) {
          // Add footer to current summary page
          doc.setFillColor(...BLUE);
          doc.rect(0, PH - 10, PW, 10, 'F');
          doc.setFillColor(...LIME);
          doc.rect(0, PH - 10, PW, 0.8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...WHITE);
          doc.text('Ferocia Sports Center  —  ferociasports.com', PW / 2, PH - 4, { align: 'center' });

          doc.addPage();
          // Continuation header
          doc.setFillColor(...BLUE);
          doc.rect(0, 0, PW, 14, 'F');
          doc.setFillColor(...LIME);
          doc.rect(0, 14, PW, 1.0, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(...WHITE);
          doc.text(`${ladderName} — Court Assignments (continued)`, ML, 9, { maxWidth: CW });
          yL = 20; yR = 20;
        }

        const newY = drawSummaryCourtBlock(courtNum, time, playerNames, noShowName,
          useLeft ? COL1_X : COL2_X,
          useLeft ? yL     : yR);

        if (useLeft) yL = newY + COURT_GAP;
        else         yR = newY + COURT_GAP;
      });

      // Footer on last summary page
      doc.setFillColor(...BLUE);
      doc.rect(0, PH - 10, PW, 10, 'F');
      doc.setFillColor(...LIME);
      doc.rect(0, PH - 10, PW, 0.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...WHITE);
      doc.text('Ferocia Sports Center  —  ferociasports.com', PW / 2, PH - 4, { align: 'center' });

      // ══════════════════════════════════════════════════════
      // INDIVIDUAL COURT PAGES — one per court
      // ══════════════════════════════════════════════════════
      courtNums.forEach(({ time, courtNum, data: court }, courtIdx) => {
        doc.addPage(); // every court starts on a new page (summary is already page 1)

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
        // No-show player from noShow array
        const noShowMatch = court.noShow && court.noShow.length ? court.noShow[0] : null;
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
        doc.text(`Court: ${courtNum}  ·  ${fmtTime12(time)}`, PW - MR, 17, { align: 'right' });

        y = 30; // after header

        // ── PRE-CALCULATE CONTENT HEIGHT TO ENSURE ONE PAGE PER COURT ──
        // We measure how tall all the content will be, then derive a scale factor
        // so everything fits between y=30 (below header) and PH-12 (above footer).
        const AVAILABLE_H = PH - 30 - 12 - 29; // header=30, footer=12, subscribe panel=29

        // Estimate total content height at scale=1
        const LINE_H_BASE  = 7;
        const VS_H_BASE    = 5;
        const SEP_H_BASE   = 6;   // separator between games
        const LABEL_H_BASE = 6;   // "GAMES" / "PLAYERS" label row
        const NOTE_H_BASE  = 12;  // game 4 note text

        let estimatedH = LABEL_H_BASE;
        const gameNumsForEst = Object.keys(court.games).map(Number).sort((a,b)=>a-b);
        gameNumsForEst.forEach((gn) => {
          if (gn === 4 && playerCount === 4) return; // handled separately
          const gp = court.games[gn].filter(m => !m.default_no_show);
          const half = Math.ceil(gp.length / 2);
          const tACount = half;
          const tBCount = gp.length - half;
          const hasSitOut = Object.keys(playerMap).length > gp.length;
          estimatedH += tACount * LINE_H_BASE + VS_H_BASE + tBCount * LINE_H_BASE + (hasSitOut ? 6 : 0) + SEP_H_BASE;
        });
        if (playerCount === 4) {
          estimatedH += LINE_H_BASE * 2 + VS_H_BASE + LINE_H_BASE * 2 + SEP_H_BASE + NOTE_H_BASE;
        }

        // Scale: shrink if content is taller than available space, keep 1.0 if it fits
        const scale = Math.min(1.0, AVAILABLE_H / estimatedH);

        // Scaled measurements — all drawing uses these
        const LINE_H  = LINE_H_BASE  * scale;
        const VS_H    = VS_H_BASE    * scale;
        const SEP_H   = SEP_H_BASE   * scale;

        // ── TWO-COLUMN LAYOUT ─────────────────────────────────────
        const COL_SPLIT = CW * 0.62;
        const leftW  = ML + COL_SPLIT - 4;
        const rightX = ML + COL_SPLIT + 4;
        const rightW = PW - MR - rightX;

        // ── RIGHT COLUMN: PLAYERS LIST ────────────────────────────
        doc.setFontSize(8.5 * scale);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...MUTED);
        doc.text('PLAYERS', rightX, y);

        let ry = y + 6 * scale;
        const allPlayersForList = noShowName ? [...playerList, noShowName] : playerList;
        allPlayersForList.forEach((name, i) => {
          if (i % 2 === 0) {
            doc.setFillColor(245, 247, 252);
            doc.rect(rightX - 1, ry - 4 * scale, rightW + 1, 7 * scale, 'F');
          }
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8 * scale);
          doc.setTextColor(...DARK);
          doc.text(`${i + 1}.`, rightX, ry);
          doc.setFont('helvetica', 'normal');
          const isNoShow = name === noShowName;
          if (isNoShow) doc.setTextColor(...ORANGE);
          doc.text(name + (isNoShow ? ' (No show)' : ''), rightX + 6, ry);
          doc.setTextColor(...DARK);
          ry += 7.5 * scale;
        });

        // ── LEFT COLUMN: GAMES ────────────────────────────────────
        doc.setFontSize(8.5 * scale);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...MUTED);
        doc.text('GAMES', ML, y);

        let gy = y + 6 * scale;
        const NAME_COL_W = leftW - ML - 22;
        const BOX_X      = ML + NAME_COL_W + 2;
        const BOX_W      = 18;

        // ── GAME LOOP ─────────────────────────────────────────────
        gameNums.forEach((gn) => {
          const gamePlayers = court.games[gn].filter((m) => !m.default_no_show);
          // Split into teams using same logic as sessions page:
          // group by score_for value (same score = same team); pending = slice(0,2)/slice(2,4)
          const pdfBuildTeams = (players) => {
            const allPending = players.every(p => p.score_for === null);
            if (allPending) return [players.slice(0, 2), players.slice(2)];
            const teamMap = {};
            players.forEach(p => {
              const k = p.score_for !== null ? String(p.score_for) : 'pending';
              if (!teamMap[k]) teamMap[k] = [];
              teamMap[k].push(p);
            });
            const sorted = Object.keys(teamMap).sort((a,b) => parseFloat(b) - parseFloat(a));
            return [teamMap[sorted[0]]||[], teamMap[sorted[1]]||[]];
          };
          const [teamAPlayers, teamBPlayers] = pdfBuildTeams(gamePlayers);
          const teamANames = teamAPlayers.map((m) => m.players ? `${m.players.first_name} ${m.players.last_name}` : '?');
          const teamBNames = teamBPlayers.map((m) => m.players ? `${m.players.first_name} ${m.players.last_name}` : '?');
          const gamePlayerIds = new Set(gamePlayers.map((m) => m.player_id));
          const sittingOut = Object.entries(playerMap)
            .filter(([pid]) => !gamePlayerIds.has(parseInt(pid, 10)))
            .map(([, name]) => name);

          if (gn === 4 && playerCount === 4) return; // handled after loop

          const tACount = teamANames.length;
          const tBCount = teamBNames.length;
          const BOX_H  = tACount * LINE_H + VS_H + tBCount * LINE_H;
          const totalH = BOX_H + (sittingOut.length ? 6 * scale : 0);

          // Game number
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5 * scale);
          doc.setTextColor(...MUTED);
          doc.text(`${gn}`, ML, gy + 4 * scale);

          // Score box — tall, split by horizontal line
          doc.setDrawColor(...DARK);
          doc.setLineWidth(0.5);
          doc.setFillColor(...WHITE);
          doc.rect(BOX_X, gy, BOX_W, BOX_H, 'FD');
          const divY = gy + tACount * LINE_H + VS_H / 2;
          doc.line(BOX_X, divY, BOX_X + BOX_W, divY);

          // Team A names
          let ly = gy;
          teamANames.forEach((name) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5 * scale);
            doc.setTextColor(...DARK);
            doc.text(name, ML + 5, ly + 5 * scale, { maxWidth: NAME_COL_W - 6 });
            ly += LINE_H;
          });

          // Vs
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7 * scale);
          doc.setTextColor(...MUTED);
          doc.text('Vs', ML + 5, ly + 4 * scale);
          ly += VS_H;

          // Team B names
          teamBNames.forEach((name) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5 * scale);
            doc.setTextColor(...DARK);
            doc.text(name, ML + 5, ly + 5 * scale, { maxWidth: NAME_COL_W - 6 });
            ly += LINE_H;
          });

          // Sits out
          if (sittingOut.length) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(6.5 * scale);
            doc.setTextColor(...ORANGE);
            doc.text(`Sits out: ${sittingOut.join(', ')}`, ML + 5, ly + 4 * scale);
          }

          gy += totalH + SEP_H / 2;
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.2);
          doc.line(ML, gy, leftW, gy);
          gy += SEP_H / 2;
        });

        // ── GAME 4 CLOSEST SCORES — always rendered for 4-player courts ──
        if (playerCount === 4) {
          const game4InDB = gameNums.includes(4);

          if (game4InDB) {
            // Render with actual saved players
            const g4Players = court.games[4].filter((m) => !m.default_no_show);
            const half = Math.ceil(g4Players.length / 2);
            const tA = g4Players.slice(0, half).map((m) => m.players ? `${m.players.first_name} ${m.players.last_name}` : '?');
            const tB = g4Players.slice(half).map((m) => m.players ? `${m.players.first_name} ${m.players.last_name}` : '?');
            const BOX_H = tA.length * LINE_H + VS_H + tB.length * LINE_H;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5 * scale);
            doc.setTextColor(...MUTED);
            doc.text('4', ML, gy + 4 * scale);

            doc.setDrawColor(...DARK);
            doc.setLineWidth(0.5);
            doc.setFillColor(...WHITE);
            doc.rect(BOX_X, gy, BOX_W, BOX_H, 'FD');
            const divY4 = gy + tA.length * LINE_H + VS_H / 2;
            doc.line(BOX_X, divY4, BOX_X + BOX_W, divY4);

            let ly = gy;
            tA.forEach((name) => {
              doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5 * scale); doc.setTextColor(...DARK);
              doc.text(name, ML + 5, ly + 5 * scale, { maxWidth: NAME_COL_W - 6 });
              ly += LINE_H;
            });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7 * scale); doc.setTextColor(...MUTED);
            doc.text('Vs', ML + 5, ly + 4 * scale);
            ly += VS_H;
            tB.forEach((name) => {
              doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5 * scale); doc.setTextColor(...DARK);
              doc.text(name, ML + 5, ly + 5 * scale, { maxWidth: NAME_COL_W - 6 });
              ly += LINE_H;
            });
            gy += BOX_H + SEP_H;

          } else {
            // Roster-only: blank name lines + split box + bold note
            const BOX_H = LINE_H * 2 + VS_H + LINE_H * 2;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5 * scale);
            doc.setTextColor(...MUTED);
            doc.text('4', ML, gy + 4 * scale);

            doc.setDrawColor(...DARK);
            doc.setLineWidth(0.5);
            doc.setFillColor(...WHITE);
            doc.rect(BOX_X, gy, BOX_W, BOX_H, 'FD');
            const divY4 = gy + LINE_H * 2 + VS_H / 2;
            doc.line(BOX_X, divY4, BOX_X + BOX_W, divY4);

            // Blank name lines — Team A
            doc.setDrawColor(...BORDER);
            doc.setLineWidth(0.3);
            let ly = gy;
            [1, 2].forEach((n) => {
              doc.setFont('helvetica', 'normal'); doc.setFontSize(7 * scale); doc.setTextColor(...MUTED);
              doc.text(`${n}.`, ML + 2, ly + 5 * scale);
              doc.line(ML + 8, ly + 5.5 * scale, BOX_X - 3, ly + 5.5 * scale);
              ly += LINE_H;
            });

            // Vs
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7 * scale); doc.setTextColor(...MUTED);
            doc.text('Vs', ML + 5, ly + 4 * scale);
            ly += VS_H;

            // Blank name lines — Team B
            [3, 4].forEach((n) => {
              doc.setFont('helvetica', 'normal'); doc.setFontSize(7 * scale); doc.setTextColor(...MUTED);
              doc.text(`${n}.`, ML + 2, ly + 5 * scale);
              doc.line(ML + 8, ly + 5.5 * scale, BOX_X - 3, ly + 5.5 * scale);
              ly += LINE_H;
            });

            gy += BOX_H + SEP_H;

            // Note — bold, larger, blue — clearly visible, no emoji (jsPDF Helvetica doesn't support them)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5 * scale);
            doc.setTextColor(...BLUE);
            doc.text(
              '*** 4th MATCH: determined by the combination of players with the CLOSEST score after games 1, 2 & 3. ***',
              ML + 2, gy + 4 * scale,
              { maxWidth: leftW - ML - 2 }
            );
            gy += 12 * scale;
          }

          // Final separator
          doc.setDrawColor(...BORDER);
          doc.setLineWidth(0.2);
          doc.line(ML, gy, leftW, gy);
        }

        // ── SUBSCRIBE PANEL — below court content, above footer ──
        const PANEL_Y    = PH - 10 - 28;  // 28mm panel above 10mm footer
        const PANEL_H    = 26;
        const QR_SIZE    = 20;             // QR square size in mm
        const QR_X       = ML;
        const QR_Y       = PANEL_Y + (PANEL_H - QR_SIZE) / 2;
        const TEXT_X     = ML + QR_SIZE + 5;

        // Lime separator line above panel
        doc.setDrawColor(...LIME);
        doc.setLineWidth(1.0);
        doc.line(0, PANEL_Y - 1, PW, PANEL_Y - 1);

        // Light background for the panel
        doc.setFillColor(248, 252, 235); // very light lime tint
        doc.rect(0, PANEL_Y, PW, PANEL_H, 'F');

        // QR code
        if (qrCanvas) {
          try {
            doc.addImage(qrCanvas, 'PNG', QR_X, QR_Y, QR_SIZE, QR_SIZE);
          } catch (_) { /* skip QR if canvas failed */ }
        }

        // Invite text
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...BLUE);
        doc.text('Join the Ferocia Sports community!', TEXT_X, PANEL_Y + 8);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...DARK);
        doc.text(
          'Scan to get ladder results, tournament news and\nevent invites before anyone else.',
          TEXT_X, PANEL_Y + 14,
        );

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text('ferociasports.com/subscribe.html', TEXT_X, PANEL_Y + 23);

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

  // ── Players page state ────────────────────────────────────────────────
  let _playersData      = [];   // full enriched player list
  let _playersFiltered  = [];   // after filter applied
  let _playersSorted    = { col: 'name', dir: 'asc' };
  let _playersShown     = 25;   // load-more page size

  const _renderPlayersTable = () => {
    const slice   = _playersFiltered.slice(0, _playersShown);
    const total   = _playersFiltered.length;
    const showing = slice.length;

    const editSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    const sortArrow = (col) => {
      if (_playersSorted.col !== col) return '<span style="color:#d0d5e8;margin-left:6px;font-size:14px;font-weight:700;line-height:1;">↕</span>';
      return _playersSorted.dir === 'asc'
        ? '<span style="color:#174CCC;margin-left:6px;font-size:14px;font-weight:700;line-height:1;">↑</span>'
        : '<span style="color:#174CCC;margin-left:6px;font-size:14px;font-weight:700;line-height:1;">↓</span>';
    };

    const rows = slice.map(d => {
      const p       = d.player;
      const stats   = d.stats;
      const wr      = stats.played > 0 ? Math.round(stats.wins / stats.played * 100) : null;
      const wrColor = wr === null ? '#6b7a99' : wr >= 70 ? '#24BC96' : wr >= 50 ? '#174CCC' : '#F26024';
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
                <div style="font-size:13px;font-weight:700;color:#0d1f4a;">${esc(p.first_name)} ${esc(p.last_name)}</div>
                <div style="font-size:11px;color:#6b7a99;font-weight:600;">${esc(p.gender || '')}${p.date_joined ? ' · Joined ' + fmtDate(p.date_joined) : ''}</div>
              </div>
            </div>
          </td>
          <td class="players-td" style="text-align:center;">
            <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:#0d1f4a;line-height:1;display:block;">${stats.played}</span>
            <span style="font-size:10px;font-weight:600;color:#6b7a99;display:block;">games</span>
          </td>
          <td class="players-td" style="text-align:center;">
            <span style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:${wrColor};line-height:1;display:block;">${wr !== null ? wr + '%' : '—'}</span>
            <span style="font-size:10px;font-weight:600;color:#6b7a99;display:block;">${stats.wins}W · ${stats.played - stats.wins}L</span>
          </td>
          <td class="players-td" style="text-align:center;">${indHTML}</td>
          <td class="players-td" style="text-align:center;">${d.statusHTML}</td>
          <td class="players-td" style="text-align:center;">
            <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
              <button class="ppm-profile-btn" data-action="openPlayerProfile" data-pid="${p.id}" title="View profile">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
              <button class="sess-edit-btn" data-action="openEdit" data-pid="${p.id}" title="Edit player">${editSVG}</button>
            </div>
          </td>
        </tr>
        <tr id="${expandId}" class="player-expand-row" style="display:none;">
          <td colspan="6">
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
                <div class="player-expand-value" style="color:#174CCC;">${stats.played}</div>
              </div>
              ${latestInactivationReasons[p.id] ? `
              <div class="player-expand-div"></div>
              <div class="player-expand-field">
                <div class="player-expand-label">Inactivation Reason</div>
                <div class="player-expand-value" style="color:#F26024;font-style:italic;">${esc(latestInactivationReasons[p.id].reason || '—')}</div>
              </div>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

    const loadMoreBtn = showing < total
      ? `<div style="padding:16px 20px;border-top:0.5px solid #e0e7f5;display:flex;align-items:center;justify-content:space-between;">
           <span style="font-size:11px;font-weight:600;color:#6b7a99;">Showing ${showing} of ${total} players</span>
           <button id="players-load-more" style="font-size:10px;font-weight:700;padding:7px 18px;border-radius:99px;border:0.5px solid #c5d6f5;background:white;color:#174CCC;cursor:pointer;">
             Load ${Math.min(25, total - showing)} more
           </button>
         </div>`
      : `<div style="padding:12px 20px;border-top:0.5px solid #e0e7f5;">
           <span style="font-size:11px;font-weight:600;color:#6b7a99;">Showing all ${total} players</span>
         </div>`;

    document.getElementById('players-table').innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th class="players-th sortable-th" data-sort="name" style="cursor:pointer;">Player ${sortArrow('name')}</th>
            <th class="players-th sortable-th" data-sort="played" style="text-align:center;cursor:pointer;">Games Played ${sortArrow('played')}</th>
            <th class="players-th sortable-th" data-sort="wr" style="text-align:center;cursor:pointer;">Win Rate ${sortArrow('wr')}</th>
            <th class="players-th sortable-th" data-sort="ind" style="text-align:center;cursor:pointer;">Indicator ${sortArrow('ind')}</th>
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
      const [players, history, matches, ladderPlayers, activeLadders, tournamentTeams] = await Promise.all([
        api('players?select=*&order=first_name'),
        api('player_status_history?new_status=eq.inactive&select=player_id,reason,changed_at&order=changed_at.desc'),
        api('matches?select=player_id,score_for,score_against,points_earned,session_date,default_no_show&order=session_date.desc').catch(() => []),
        api('ladder_players?select=player_id,ladder_id').catch(() => []),
        api('ladders?status=eq.active&select=id').catch(() => []),
        api('tournament_teams?select=player1_id,player2_id,player3_id,player4_id').catch(() => []),
      ]);
      allPlayers = players;

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
        (ladderPlayers || [])
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
      const inactive= players.filter(p => p.status === 'inactive').length;
      const male    = players.filter(p => p.gender === 'Male').length;
      const female  = players.filter(p => p.gender === 'Female').length;
      const setEl   = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('players-total',    total);
      setEl('players-active',   active);
      setEl('players-inactive', inactive);
      setEl('players-male',     male);
      setEl('players-female',   female);
      setEl('players-male-pct',   total ? `${Math.round(male/total*100)}% of roster` : '');
      setEl('players-female-pct', total ? `${Math.round(female/total*100)}% of roster` : '');
      setEl('players-count',    `${total} player${total !== 1 ? 's' : ''}`);

      if (!players.length) {
        document.getElementById('players-table').innerHTML = '<div class="empty" style="padding:20px;">No players yet.</div>';
        return;
      }

      // Avatar colors
      const avColors = ['#174CCC','#24BC96','#F26024','#7c3aed','#0891b2','#d97706','#16a34a','#dc2626','#7c3aed','#0e7490'];
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
      const ranked = allPlayers
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
  const _apColors = ['#174CCC','#24BC96','#F26024','#7c3aed','#0891b2','#d97706'];
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
        <div style="width:64px;height:64px;border-radius:50%;background:#f0f2f8;border:2px dashed #d0d5e8;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d0d5e8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        </div>
        <div style="font-size:12px;font-weight:600;color:#d0d5e8;">Fill in the form to see<br>the player preview</div>
      </div>`;
      return;
    }
    const statusPill = status === 'active'
      ? `<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:#d4f5ed;color:#085041;">Active Player</span>`
      : `<span style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:#f4f5f8;color:#6b7a99;">Inactive</span>`;
    const skillPill = skill
      ? `<span style="font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:3px 10px;border-radius:99px;background:#e8f0ff;color:#174CCC;">${esc(skill)}</span>`
      : '';
    const row = (iconSVG, label, val, emptyText) => `
      <div class="ap-preview-row">
        <div class="ap-preview-icon">${iconSVG}</div>
        <div class="ap-preview-lbl">${label}</div>
        ${val ? `<div class="ap-preview-val">${val}</div>` : `<div class="ap-preview-empty">${emptyText}</div>`}
      </div>`;
    const calI   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const mailI  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`;
    const phoneI = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 1.21l3 .01a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02z"/></svg>`;
    const genI   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
    const gameI  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
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
      allPlayers = [];
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

  // ── PLAYER PROFILE MODAL ─────────────────────────────────────────────────

  window.closePlayerProfile = () => {
    document.getElementById('player-profile-modal').classList.remove('open');
    document.body.style.overflow = '';
  };

  window.openPlayerProfile = async (id) => {
    const modal = document.getElementById('player-profile-modal');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('ppm-body').innerHTML = '<div class="loading" style="padding:40px;">Loading player profile...</div>';

    // ── Fetch player + all data fresh ────────────────────────────────────
    let p = (allPlayers || []).find(x => x.id === id);
    if (!p) {
      const rows = await api(`players?id=eq.${id}&select=*`).catch(() => []);
      p = rows[0];
    }
    if (!p) { document.getElementById('ppm-body').innerHTML = '<div class="loading">Player not found.</div>'; return; }

    // ── Header ────────────────────────────────────────────────────────────
    const initials = ((p.first_name||'')[0]||'').toUpperCase() + ((p.last_name||'')[0]||'').toUpperCase();
    const avColors = ['#174CCC','#F26024','#24BC96','#9a6e00','#7B2FBE','#C04A0E'];
    const avColor  = avColors[id % avColors.length];
    const avEl = document.getElementById('ppm-av');
    avEl.textContent = initials;
    avEl.style.background = avColor;
    document.getElementById('ppm-name').textContent = `${p.first_name} ${p.last_name}`;
    const isActive = p.status === 'active';
    document.getElementById('ppm-status-pill').className = isActive ? 'ppm-active' : 'ppm-inactive';
    document.getElementById('ppm-status-pill').innerHTML = isActive ? '🟢 Active' : '⚪ Inactive';
    document.getElementById('ppm-footer-info').textContent = `Player ID #${p.id}${p.date_joined ? ' · Joined ' + fmtDate(p.date_joined) : ''}`;

    // ── Fetch all data fresh ──────────────────────────────────────────────
    const rpc = async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) { console.warn(`[rpc] ${fn}:`, error.message); return []; }
      return data || [];
    };
    const [allMatches, ladderPlayerRows, allLadders,
      myTournTeams, myTournaments, myTournCategories, allBracketMatches
    ] = await Promise.all([
      api(`matches?player_id=eq.${id}&select=*&order=session_date.desc`).catch(() => []),
      api(`ladder_players?player_id=eq.${id}&select=*`).catch(() => []),
      api(`ladders?select=id,name`).catch(() => []),
      rpc('get_player_tournament_teams',       { p_player_id: id }),
      rpc('get_player_tournaments',             { p_player_id: id }),
      rpc('get_player_tournament_categories',   { p_player_id: id }),
      rpc('get_player_bracket_matches',         { p_player_id: id }),
    ]);

    // ── Ladder stats ──────────────────────────────────────────────────────
    const ladderMatches = allMatches.filter(m => !m.default_no_show && m.score_for !== null && m.score_against !== null);
    const ladderWins    = ladderMatches.filter(m => m.score_for > m.score_against).length;
    const ladderLosses  = ladderMatches.length - ladderWins;
    const ladderPlayed  = ladderMatches.length;

    // ── Ladder seasons ────────────────────────────────────────────────────
    const ladderIds = [...new Set(ladderPlayerRows.map(lp => lp.ladder_id))];
    const myLadders = allLadders.filter(l => ladderIds.includes(l.id));

    // ── Tournament data — all from RPCs, no client-side filtering needed ──
    const myTeamIds = (myTournTeams || []).map(tt => tt.id);

    // ── Tournament bracket stats ──────────────────────────────────────────
    const myBracketMatches = (allBracketMatches || []).filter(bm => bm.status === 'completed');
    const tournWins   = myBracketMatches.filter(bm => myTeamIds.includes(bm.winner_id)).length;
    const tournLosses = myBracketMatches.length - tournWins;

    // ── Overall combined stats ────────────────────────────────────────────
    const totalWins   = ladderWins + tournWins;
    const totalLosses = ladderLosses + tournLosses;
    const totalPlayed = ladderPlayed + myBracketMatches.length;
    const winPct      = totalPlayed > 0 ? Math.round(totalWins / totalPlayed * 100) : 0;

    // Quick stats for header
    const ppmSVG = (d) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const genderSVG  = ppmSVG('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
    const calSVG     = ppmSVG('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>');
    const tournSVG   = ppmSVG('<path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/>');
    const ladderSVG  = ppmSVG('<rect x="2" y="7" width="20" height="14" rx="2"/><polyline points="16 3 12 7 8 3"/>');
    document.getElementById('ppm-qs').innerHTML = [
      p.gender ? `<span class="ppm-q">${genderSVG} <b>${esc(p.gender)}</b></span>` : '',
      p.date_joined ? `<span class="ppm-q">${calSVG} Joined <b>${fmtDate(p.date_joined)}</b></span>` : '',
      (myTournaments||[]).length ? `<span class="ppm-q">${tournSVG} <b>${(myTournaments||[]).length}</b> Tournament${(myTournaments||[]).length!==1?'s':''}</span>` : '',
      (myLadders||[]).length ? `<span class="ppm-q">${ladderSVG} <b>${myLadders.length}</b> Ladder${myLadders.length!==1?'s':''}</span>` : '',
    ].join('');

    // ── Streak & last 10 ─────────────────────────────────────────────────
    const orderedResults = ladderMatches.map(m => m.score_for > m.score_against ? 'W' : 'L');
    let streak = 0, streakType = '';
    if (orderedResults.length) {
      streakType = orderedResults[0];
      for (let i = 0; i < orderedResults.length; i++) {
        if (orderedResults[i] === streakType) streak++;
        else break;
      }
    }
    const last10 = orderedResults.slice(0, 10); // from ladderMatches ordered newest first
    const last10W = last10.filter(r => r==='W').length;
    const last10L = last10.length - last10W;

    // ── Tournament history ────────────────────────────────────────────────
    const finishLabel = (bm) => {
      if (!bm) return '';
      if (bm.round_name === 'Final') {
        const won = bm.winner_id && myTeamIds.includes(bm.winner_id);
        return won ? '<span class="ppm-hbadge ppm-hb-gold">🥇 Champion</span>' : '<span class="ppm-hbadge ppm-hb-blue">🥈 Runner Up</span>';
      }
      if (bm.round_name?.toLowerCase().includes('semi')) return '<span class="ppm-hbadge ppm-hb-gray">Semifinalist</span>';
      return '<span class="ppm-hbadge ppm-hb-gray">Participant</span>';
    };

    const tournHistHTML = (myTournaments||[]).length
      ? (myTournaments||[]).map(t => {
          const tCatIds = (myTournCategories||[]).filter(c => c.tournament_id === t.id).map(c => c.id);
          const lastBm  = (allBracketMatches||[]).filter(bm =>
            tCatIds.includes(bm.category_id) &&
            (myTeamIds.includes(bm.team_a_id) || myTeamIds.includes(bm.team_b_id)) &&
            bm.status === 'completed'
          ).slice(-1)[0];
          return `<div class="ppm-hist-row">
            <div>
              <div class="ppm-hist-name">${esc(t.name)}</div>
              <div class="ppm-hist-sub">${t.date ? fmtDate(t.date) : ''}</div>
            </div>
            ${finishLabel(lastBm) || '<span class="ppm-hbadge ppm-hb-gray">Participant</span>'}
          </div>`;
        }).join('')
      : '<div style="padding:16px;font-size:12px;font-weight:600;color:#6b7a99;">No tournament history yet.</div>';

    // ── Ladder history ────────────────────────────────────────────────────
    const ladderHistHTML = (myLadders||[]).length
      ? myLadders.map(l => {
          const lp   = ladderPlayerRows.find(r => r.ladder_id === l.id);
          const stat = lp?.status === 'sub' ? '<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;background:#f0f2f8;color:#6b7a99;">Sub</span>'
                     : lp?.status === 'active' ? '<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(36,188,150,0.12);color:#085041;">Active</span>'
                     : '<span style="font-size:11px;font-weight:600;color:#6b7a99;">Enrolled</span>';
          return `<div class="ppm-hist-row">
            <div>
              <div class="ppm-hist-name">${esc(l.name)}</div>
            </div>
            ${stat}
          </div>`;
        }).join('')
      : '<div style="padding:16px;font-size:12px;font-weight:600;color:#6b7a99;">No ladder history yet.</div>';

    // ── Achievements ──────────────────────────────────────────────────────
    const badges = [];
    if ((myBracketMatches||[]).some(bm =>
      bm.round_name === 'Final' && myTeamIds.includes(bm.winner_id)
    )) badges.push({ icon:'🏆', label:'Champion', bg:'rgba(246,166,35,0.08)', border:'rgba(246,166,35,0.3)', color:'#9a6200' });

    if (streak >= 5 && streakType === 'W') badges.push({ icon:'🔥', label:`${streak} Win Streak`, bg:'rgba(242,96,36,0.06)', border:'rgba(242,96,36,0.2)', color:'#F26024' });
    else if (streak >= 3 && streakType === 'W') badges.push({ icon:'🔥', label:`${streak} Win Streak`, bg:'rgba(242,96,36,0.06)', border:'rgba(242,96,36,0.2)', color:'#F26024' });

    if ((myBracketMatches||[]).some(bm =>
      bm.round_name === 'Final' && !myTeamIds.includes(bm.winner_id)
    )) badges.push({ icon:'🥈', label:'Runner Up', bg:'#e8f0ff', border:'#c5d6f5', color:'#174CCC' });

    if (winPct >= 70 && (ladderPlayed + myBracketMatches.length) >= 10) badges.push({ icon:'⚡', label:'Top Performer', bg:'rgba(36,188,150,0.08)', border:'rgba(36,188,150,0.25)', color:'#085041' });
    if (myLadders.length >= 3) badges.push({ icon:'🎯', label:'Ladder Veteran', bg:'#f8f9ff', border:'#e0e7f5', color:'#6b7a99' });
    if (myTournaments.length >= 5) badges.push({ icon:'👑', label:'Season Regular', bg:'rgba(123,47,190,0.07)', border:'rgba(123,47,190,0.2)', color:'#7B2FBE' });

    const badgesHTML = badges.length
      ? badges.map(b => `<span class="ppm-bdg" style="background:${b.bg};border-color:${b.border};color:${b.color};">${b.icon} ${b.label}</span>`).join('')
      : '<span style="font-size:12px;font-weight:600;color:#6b7a99;">No achievements yet — keep playing!</span>';

    // ── Activity timeline ─────────────────────────────────────────────────
    const fmtShort = (d) => { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', {month:'short', day:'numeric'}); };
    const recent8 = ladderMatches.slice(0, 8);
    let opponentMap = {}; // matchId -> "Name & Name"

    if (recent8.length) {
      try {
        // Fetch all sibling rows in same game slots (different player)
        const uniqDates   = [...new Set(recent8.map(m => m.session_date))];
        const uniqLadders = [...new Set(recent8.map(m => m.ladder_id))];
        const siblings = await api(
          `matches?player_id=neq.${id}&session_date=in.(${uniqDates.join(',')})&ladder_id=in.(${uniqLadders.join(',')})&select=id,player_id,session_date,court_group,game_number,ladder_id,score_for,score_against`
        );

        // Fetch player names for all unique player_ids in siblings
        const sibPlayerIds = [...new Set(siblings.map(s => s.player_id).filter(Boolean))];
        let playerNameMap = {};
        if (sibPlayerIds.length) {
          const playerRows = await api(`players?id=in.(${sibPlayerIds.join(',')})&select=id,first_name,last_name`);
          playerRows.forEach(p => { playerNameMap[p.id] = `${p.first_name} ${p.last_name}`; });
        }

        // For each of our matches, find opponents:
        // Opponents have same slot but OPPOSITE score (their score_for = our score_against)
        recent8.forEach(m => {
          const slotSibs = siblings.filter(s =>
            s.session_date === m.session_date &&
            s.court_group  === m.court_group  &&
            s.game_number  === m.game_number  &&
            s.ladder_id    === m.ladder_id
          );
          // Opponents: their score_for equals our score_against
          const opponents = slotSibs.filter(s => s.score_for === m.score_against);
          if (opponents.length) {
            opponentMap[m.id] = opponents.map(s => playerNameMap[s.player_id] || `#${s.player_id}`).join(' & ');
          } else {
            // Fallback: just use all siblings if score matching fails
            const names = slotSibs.slice(0,2).map(s => playerNameMap[s.player_id] || `#${s.player_id}`);
            if (names.length) opponentMap[m.id] = names.join(' & ');
          }
        });
      } catch(e) {}
    }

    const timelineHTML = recent8.map(m => {
      const won = m.score_for > m.score_against;
      const dotColor = won ? '#24BC96' : '#F26024';
      const oppName  = opponentMap[m.id] || 'Opponent';
      const scoreStr = won
        ? `<span style="color:#24BC96;font-weight:800;">${m.score_for}–${m.score_against}</span>`
        : `<span style="color:#F26024;font-weight:800;">${m.score_for}–${m.score_against}</span>`;
      return `<div class="ppm-tl-item">
        <div class="ppm-tl-date">${fmtShort(m.session_date)}</div>
        <div class="ppm-tl-dot" style="background:${dotColor};"></div>
        <div>
          <div class="ppm-tl-text">${won?'Won':'Lost'} vs ${esc(oppName)} ${scoreStr}</div>
          <div class="ppm-tl-ctx">Ladder match</div>
        </div>
      </div>`;
    }).join('') || '<div style="padding:8px 0;font-size:12px;font-weight:600;color:#6b7a99;">No activity yet.</div>';

    // ── Best Finish + Podium Finishes ────────────────────────────────────
    const bm3rd       = (myBracketMatches||[]).filter(bm => bm.round_name === '3rd Place');
    const finalsPlayed = (myBracketMatches||[]).filter(bm => bm.round_name === 'Final');
    const semisPlayed  = (myBracketMatches||[]).filter(bm => bm.round_name === 'Semifinals');
    const isChampion   = finalsPlayed.some(bm => myTeamIds.includes(bm.winner_id));
    const isRunnerUp   = finalsPlayed.some(bm => !myTeamIds.includes(bm.winner_id));
    const is3rdPlace   = bm3rd.some(bm => myTeamIds.includes(bm.winner_id));
    const isSemi       = semisPlayed.length > 0 || bm3rd.some(bm => !myTeamIds.includes(bm.winner_id));
    const hasAny       = (myBracketMatches||[]).length > 0;
    const bestFinishIcon  = isChampion ? '🥇' : isRunnerUp ? '🥈' : is3rdPlace ? '🥉' : isSemi ? '🏅' : hasAny ? '🎽' : '—';
    const bestFinishLabel = isChampion ? 'Champion' : isRunnerUp ? 'Runner Up' : is3rdPlace ? '3rd Place' : isSemi ? 'Semifinalist' : hasAny ? 'Participant' : '—';

    // Podium = distinct tournaments where player finished 1st, 2nd or 3rd
    const catToTournMap = {};
    (myTournCategories||[]).forEach(c => { catToTournMap[c.id] = c.tournament_id; });
    const podiumMatches = [
      ...finalsPlayed,                                      // 1st and 2nd place
      ...bm3rd.filter(bm => myTeamIds.includes(bm.winner_id)), // 3rd place wins only
    ];
    const podiumTournIds = [...new Set(
      podiumMatches.map(bm => catToTournMap[bm.category_id]).filter(Boolean)
    )];
    const podiumCount = podiumTournIds.length;

    // ── Section header helper ─────────────────────────────────────────────
    const secHdr = (icon, title) => `<div class="ppm-sec-hdr">${icon}<span class="ppm-sec-title">${title}</span></div>`;
    const ppmSecSVG = (d) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const trophySVG = ppmSecSVG('<path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/>');
    const boltSVG   = ppmSecSVG('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>');
    const barSVG    = ppmSecSVG('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>');
    const clockSVG  = ppmSecSVG('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
    const screenSVG = ppmSecSVG('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>');
    const medalSVG  = ppmSecSVG('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>');
    const starSVG   = ppmSecSVG('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>');
    const snowSVG   = ppmSecSVG('<line x1="12" y1="2" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/>');

    // ── Render all sections ───────────────────────────────────────────────
    const streakBoxClass = streakType === 'W' ? 'ppm-streak-win' : 'ppm-streak-loss';
    const fireSVG    = ppmSecSVG('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>');
    const streakIcon = streakType === 'W' ? fireSVG : snowSVG;
    const streakText = streak > 0
      ? (streakType === 'W' ? `${streak} Match Win Streak` : `${streak} Consecutive Loss${streak>1?'es':''}`)
      : 'No active streak';

    document.getElementById('ppm-body').innerHTML = `
      <!-- S2: Snapshot -->
      <div class="ppm-sec">
        ${secHdr(screenSVG, 'Competition Snapshot')}
        <div class="ppm-sec-body">
          <div class="ppm-snap-grid">
            <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:#174CCC;">${(myTournaments||[]).length}</div><div class="ppm-snap-lbl">Tournaments</div></div>
            <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:#174CCC;">${myLadders.length}</div><div class="ppm-snap-lbl">Ladder Seasons</div></div>
            <div class="ppm-snap-card"><div class="ppm-snap-val">${ladderPlayed + myBracketMatches.length}</div><div class="ppm-snap-lbl">Matches Played</div></div>
            <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:#24BC96;">${winPct}%</div><div class="ppm-snap-lbl">Win %</div></div>
            <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:#24BC96;">${totalWins}</div><div class="ppm-snap-lbl">Total Wins</div></div>
            <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:#F26024;">${totalLosses}</div><div class="ppm-snap-lbl">Total Losses</div></div>
          </div>
        </div>
      </div>

      <!-- S3: Momentum -->
      <div class="ppm-sec">
        ${secHdr(boltSVG, 'Momentum')}
        <div class="ppm-sec-body">
          <div class="ppm-streak-lbl">Current Streak</div>
          <div class="ppm-streak-box ${streakBoxClass}">
            <span style="font-size:26px;line-height:1;">${streakIcon}</span>
            <div>
              <div style="font-size:15px;font-weight:800;color:#0d1f4a;">${streakText}</div>
            </div>
          </div>
          <div class="ppm-streak-lbl">Last 10 Matches</div>
          <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
            ${last10.map(r => `<span class="${r==='W'?'ppm-pill-w':'ppm-pill-l'}">${r}</span>`).join('')}
            ${last10.length ? `<span style="font-size:11px;font-weight:800;color:${last10W>=last10L?'#24BC96':'#F26024'};margin-left:10px;">${last10W}W ${last10L}L</span>` : '<span style="font-size:11px;color:#6b7a99;font-weight:600;">No matches yet</span>'}
          </div>
        </div>
      </div>

      <!-- S4: Competition History -->
      <div class="ppm-sec">
        ${secHdr(trophySVG, 'Competition History')}
        <div class="ppm-itabs">
          <button class="ppm-itab ppm-on" onclick="ppmTab(this,'ppm-hist-t')">Tournaments</button>
          <button class="ppm-itab" onclick="ppmTab(this,'ppm-hist-l')">Ladders</button>
        </div>
        <div id="ppm-hist-t">${tournHistHTML}</div>
        <div id="ppm-hist-l" style="display:none;">${ladderHistHTML}</div>
      </div>

      <!-- S5: Career Statistics -->
      <div class="ppm-sec">
        ${secHdr(barSVG, 'Career Statistics')}
        <div class="ppm-sec-body">
          <div class="ppm-career-grid">
            <div class="ppm-career-card">
              <div class="ppm-career-lbl">Tournament Record</div>
              <div class="ppm-career-val">${myBracketMatches.length ? tournWins + 'W – ' + tournLosses + 'L' : '—'}</div>
              ${myBracketMatches.length ? `<div class="ppm-career-sub" style="color:${tournWins/myBracketMatches.length>=0.5?'#24BC96':'#F26024'};">${Math.round(tournWins/myBracketMatches.length*100)}% win rate</div>` : ''}
            </div>
            <div class="ppm-career-card">
              <div class="ppm-career-lbl">Ladder Record</div>
              <div class="ppm-career-val">${ladderPlayed ? ladderWins + 'W – ' + ladderLosses + 'L' : '—'}</div>
              ${ladderPlayed ? `<div class="ppm-career-sub" style="color:${ladderWins/ladderPlayed>=0.5?'#174CCC':'#F26024'};">${Math.round(ladderWins/ladderPlayed*100)}% win rate</div>` : ''}
            </div>
            <div class="ppm-career-card">
              <div class="ppm-career-lbl">Overall Record</div>
              <div class="ppm-career-val">${totalWins}W – ${totalLosses}L</div>
              <div class="ppm-career-sub" style="color:${winPct>=50?'#24BC96':'#F26024'};font-size:14px;font-weight:800;">${winPct}%</div>
            </div>
            <div class="ppm-career-card">
              <div class="ppm-career-lbl">Points Earned</div>
              <div class="ppm-career-val" style="color:#174CCC;">${ladderMatches.reduce((s,m)=>s+(m.points_earned||0),0)}</div>
            </div>
            <div class="ppm-career-card">
              <div class="ppm-career-lbl">Best Finish</div>
              <div class="ppm-career-val" style="font-size:26px;">${bestFinishIcon}</div>
              <div class="ppm-career-sub">${bestFinishLabel}</div>
            </div>
            <div class="ppm-career-card">
              <div class="ppm-career-lbl">Podium Finishes</div>
              <div class="ppm-career-val" style="color:#F6A623;">${podiumCount}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- S6: Achievements -->
      <div class="ppm-sec">
        ${secHdr(medalSVG, 'Achievements')}
        <div class="ppm-sec-body">
          <div style="display:flex;flex-wrap:wrap;">${badgesHTML}</div>
        </div>
      </div>

      <!-- S7: Recent Activity -->
      <div class="ppm-sec">
        ${secHdr(clockSVG, 'Recent Activity')}
        <div class="ppm-sec-body" style="padding:8px 16px;">
          <div>${timelineHTML}</div>
        </div>
      </div>
    `;
  };

  window.ppmTab = (btn, showId) => {
    btn.closest('.ppm-sec').querySelectorAll('.ppm-itab').forEach(t => t.classList.remove('ppm-on'));
    btn.classList.add('ppm-on');
    ['ppm-hist-t','ppm-hist-l'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = el.id === showId ? 'block' : 'none';
    });
  };

  // ── MATCH HUB ─────────────────────────────────────────────────────────────

  let _mhMatches = [];
  let _mhFilter  = 'all';
  let _lmGameCount = 1;
  let _lmType = 'singles';

  const LM_SEL_IDS = ['lm-a-p1','lm-a-p2','lm-b-p1','lm-b-p2'];

  const MH_TYPE_LABELS = {
    singles: 'Singles', mens: "Men's Doubles",
    womens: "Women's Doubles", mixed: 'Mixed Doubles'
  };

  // ── Load Match Hub page ───────────────────────────────────────────────
  const loadMatchHub = async () => {
    // Ensure players are loaded for name rendering
    if (!allPlayers.length) {
      try { allPlayers = await api('players?select=*&order=first_name'); } catch(_) {}
    }
    _mhMatches = await api('friendly_matches?select=*&order=match_date.desc').catch(() => []);
    mhRenderCards();
    mhRenderTable();
  };

  const mhRenderCards = () => {
    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();
    const total   = _mhMatches.length;
    const thisMonth = _mhMatches.filter(m => {
      const d = new Date(m.match_date);
      return d.getMonth() === month && d.getFullYear() === year;
    }).length;
    const pending  = _mhMatches.filter(m => m.status === 'pending').length;
    const dnaCount = _mhMatches.filter(m => m.use_dna).length;
    // Active players: unique player IDs across all matches
    const pids = new Set();
    _mhMatches.forEach(m => {
      [m.team_a_p1_id,m.team_a_p2_id,m.team_b_p1_id,m.team_b_p2_id].filter(Boolean).forEach(id => pids.add(id));
    });
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('mh-total',   total);
    el('mh-month',   thisMonth);
    el('mh-month-lbl', monthNames[month] + ' ' + year);
    el('mh-players', pids.size);
    el('mh-pending', pending);
    el('mh-dna',     dnaCount);

  };

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
      if (m.use_private) b.push('<span class="mh-badge" style="background:#f0f2f8;color:#6b7a99;">Private</span>');
      return b.join(' ') || '—';
    };

    const pName = (id) => {
      const p = allPlayers.find(x => x.id === id);
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
        <td style="color:#6b7a99;white-space:nowrap;">${fmtDate(m.match_date)}</td>
        <td>${esc(MH_TYPE_LABELS[m.match_type] || m.match_type)}</td>
        <td style="font-size:11px;">${esc(teamAStr)}<br><span style="color:#6b7a99;">vs ${esc(teamBStr)}</span></td>
        <td style="font-weight:800;">${scoreStr}</td>
        <td style="font-size:11px;color:#174CCC;font-weight:700;">${esc(winner)}</td>
        <td><span class="mh-badge ${purposeClass[m.purpose]||''}">${esc(m.purpose||'—')}</span></td>
        <td>${usageBadges(m)}</td>
        <td><span class="mh-badge ${isPending?'mh-b-pending':'mh-b-complete'}">${isPending?'Pending':'Complete'}</span></td>
        <td style="white-space:nowrap;">
          ${isPending
            ? `<button class="mh-action" style="color:#F26024;border-color:#F26024;" onclick="mhEnterScore(${m.id})">Enter Score</button>`
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
        <div style="font-size:15px;font-weight:800;color:#0d1f4a;margin-bottom:6px;">Delete this match?</div>
        <div style="font-size:13px;font-weight:600;color:#6b7a99;line-height:1.6;">This will permanently remove the match and all its data. This action cannot be undone.</div>
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button onclick="mhConfirmDelete(${id})" style="padding:9px 22px;border:none;border-radius:99px;background:#e53935;color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Delete Match</button>
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
    if (!allPlayers.length) {
      try { allPlayers = await api('players?select=*&order=first_name'); } catch(_) {}
    }
    const getPlayer = (pid) => allPlayers.find(x => Number(x.id) === Number(pid));
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
    const typeSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    const trophySVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
    const infoSVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    const targetSVG= `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
    const barSVG   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7B2FBE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
    const trendSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`;
    const peopleSVG= `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
    const shieldSVG= `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7B2FBE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const handSVG  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
    const calSVG   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const courtSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>`;

    // Avatar helper
    const avatar = (pid, bgColor, textColor) => {
      const ini = initials(pid);
      return `<div style="width:44px;height:44px;border-radius:50%;background:${bgColor};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${textColor};flex-shrink:0;">${ini}</div>`;
    };

    // Data usage label
    const usageItems = [m.use_dna?'DNA':null, m.use_rating?'Rating':null, m.use_private?'Private':null].filter(Boolean);
    const usageLabel = usageItems.length ? usageItems.join(' + ') : 'Not Reported';

    // Purpose badge colors
    const purposeColor = { Friendly:'#24BC96', Training:'#174CCC', Challenge:'#F26024', 'Rating Observation':'#7B2FBE' }[m.purpose] || '#6b7a99';
    const purposeBgCol = { Friendly:'rgba(36,188,150,0.1)', Training:'#e8f0ff', Challenge:'rgba(242,96,36,0.08)', 'Rating Observation':'rgba(123,47,190,0.08)' }[m.purpose] || '#f0f2f8';

    // Winner/loser result text
    const winnerName = teamANames.length ? (isWinA ? teamANames.join(' & ') : teamBNames.join(' & ')) : '—';
    const loserName  = teamANames.length ? (isWinA ? teamBNames.join(' & ') : teamANames.join(' & ')) : '—';

    // Build competition impact HTML outside template to avoid nested backtick parsing issues
    const winIds  = isWinA ? teamAIds : teamBIds;
    const loseIds = isWinA ? teamBIds : teamAIds;

    const playerRow = (pid, isWin) => {
      const ini  = initials(pid);
      const name = esc(pName(pid) || '—');
      const bg   = isWin ? 'rgba(36,188,150,0.15)' : '#f0f2f8';
      const clr  = isWin ? '#085041' : '#6b7a99';
      const pts  = isWin
        ? '<span style="font-size:11px;font-weight:700;color:#24BC96;">+1 Win</span>'
        : '<span style="font-size:11px;font-weight:700;color:#F26024;">+1 Loss</span>';
      return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
        + '<div style="width:36px;height:36px;border-radius:50%;background:' + bg + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:' + clr + ';flex-shrink:0;">' + ini + '</div>'
        + '<div><div style="font-size:12px;font-weight:800;color:#0d1f4a;">' + name + '</div>' + pts + '</div>'
        + '</div>';
    };
    const impactHTML = '<div style="background:white;border-radius:10px;border:0.5px solid #e0e7f5;overflow:hidden;">'
      + '<div style="display:flex;align-items:center;gap:6px;padding:12px 14px;border-bottom:0.5px solid #e0e7f5;">'
      + trendSVG
      + '<span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#0d1f4a;">Competition Impact</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;">'
      + '<div style="padding:14px;border-right:0.5px solid #e0e7f5;">' + winIds.map(pid => playerRow(pid, true)).join('') + '</div>'
      + '<div style="padding:14px;">' + loseIds.map(pid => playerRow(pid, false)).join('') + '</div>'
      + '</div></div>';


    document.getElementById('vm-title').textContent = fmtDate(m.match_date) + ' • ' + (m.purpose || 'Friendly Match');

    document.getElementById('vm-body').innerHTML = `
      <!-- Match type pill -->
      <div style="margin-bottom:16px;">
        <span style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:99px;background:#e8f0ff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#174CCC;">
          ${typeSVG} ${esc(MH_TYPE_LABELS[m.match_type]||m.match_type)}
        </span>
      </div>

      <!-- Score row — equal height cards, names per line, Team A/B labels -->
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:stretch;margin-bottom:16px;">
        <!-- Team A card -->
        <div style="background:${isWinA?'rgba(36,188,150,0.04)':'white'};border-radius:12px;padding:16px;border:1px solid ${isWinA?'rgba(36,188,150,0.3)':'#e0e7f5'};display:flex;flex-direction:column;justify-content:space-between;">
          <div>
            ${m.match_type !== 'singles' ? '<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#6b7a99;margin-bottom:8px;">Team A</div>' : ''}
            <div style="display:flex;align-items:center;gap:10px;">
              ${avatar(teamAIds[0], '#e8f0ff', '#174CCC')}
              <div>
                ${teamANames.map(n=>`<div style="font-size:13px;font-weight:800;color:#0d1f4a;line-height:1.3;">${esc(n)}</div>`).join('')}
              </div>
            </div>
          </div>
          ${isWinA ? `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:99px;background:rgba(36,188,150,0.12);font-size:10px;font-weight:800;color:#24BC96;">${trophySVG} MATCH WINNER</div>` : ''}
        </div>

        <!-- Score center -->
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 0;">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:6px;">
            <span style="font-size:52px;font-weight:900;color:${isWinA?'#24BC96':'#0d1f4a'};line-height:1;font-family:'Bebas Neue',sans-serif;">${games.length?games[0][0]:'—'}</span>
            <span style="font-size:24px;font-weight:800;color:#b0bbd6;">-</span>
            <span style="font-size:52px;font-weight:900;color:${!isWinA?'#24BC96':'#0d1f4a'};line-height:1;font-family:'Bebas Neue',sans-serif;">${games.length?games[0][1]:'—'}</span>
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
            ${m.match_type !== 'singles' ? '<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#6b7a99;margin-bottom:8px;">Team B</div>' : ''}
            <div style="display:flex;align-items:center;gap:10px;">
              ${avatar(teamBIds[0], !isWinA?'rgba(36,188,150,0.15)':'#e8f0ff', !isWinA?'#085041':'#174CCC')}
              <div>
                ${teamBNames.map(n=>`<div style="font-size:13px;font-weight:800;color:#0d1f4a;line-height:1.3;">${esc(n)}</div>`).join('')}
              </div>
            </div>
          </div>
          ${!isWinA ? `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:99px;background:rgba(36,188,150,0.12);font-size:10px;font-weight:800;color:#24BC96;">${trophySVG} MATCH WINNER</div>` : ''}
        </div>
      </div>

      <!-- Result banner -->
      <div style="background:rgba(36,188,150,0.06);border-radius:10px;border:0.5px solid rgba(36,188,150,0.2);padding:14px 16px;display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
        <div style="width:36px;height:36px;border-radius:50%;background:rgba(36,188,150,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          ${trophySVG}
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#24BC96;margin-bottom:3px;">Result</div>
          <div style="font-size:13px;font-weight:800;color:#0d1f4a;margin-bottom:2px;">${esc(winnerName)} defeated ${esc(loserName)}</div>
          <div style="font-size:11px;font-weight:600;color:#6b7a99;">Final Score: ${finalScoreStr || scoreDisplay}</div>
        </div>
      </div>

      <!-- Info row: 3 columns -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
        <!-- Match Information -->
        <div style="background:white;border-radius:10px;border:0.5px solid #e0e7f5;padding:14px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
            ${infoSVG}
            <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#0d1f4a;">Match Information</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#6b7a99;">${peopleSVG} Format</span>
              <span style="font-size:11px;font-weight:700;color:#0d1f4a;">${esc(MH_TYPE_LABELS[m.match_type]||m.match_type)}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#6b7a99;">${calSVG} Date</span>
              <span style="font-size:11px;font-weight:700;color:#0d1f4a;">${fmtDate(m.match_date)}</span>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#6b7a99;">${courtSVG} Court</span>
              <span style="font-size:11px;font-weight:700;color:#0d1f4a;">${m.court ? esc(m.court) : '—'}</span>
            </div>
          </div>
        </div>

        <!-- Purpose -->
        <div style="background:white;border-radius:10px;border:0.5px solid #e0e7f5;padding:14px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
            ${targetSVG}
            <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#0d1f4a;">Purpose</span>
          </div>
          <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;background:${purposeBgCol};font-size:11px;font-weight:700;color:${purposeColor};">
            ${handSVG} ${esc(m.purpose||'Friendly')}
          </span>
        </div>

        <!-- Data Usage -->
        <div style="background:white;border-radius:10px;border:0.5px solid #e0e7f5;padding:14px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;">
            ${barSVG}
            <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#0d1f4a;">Data Usage</span>
          </div>
          <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;background:rgba(123,47,190,0.08);font-size:11px;font-weight:700;color:#7B2FBE;">
            ${shieldSVG} ${esc(usageLabel)}
          </span>
        </div>
      </div>

      <!-- Competition Impact — built outside template to avoid nested backtick issues -->
      ${impactHTML}
      ${m.notes ? `<div style="background:#f8f9ff;border-radius:10px;padding:12px 14px;border:0.5px solid #e0e7f5;margin-bottom:14px;"><div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7a99;margin-bottom:5px;">Notes</div><div style="font-size:12px;font-weight:600;color:#0d1f4a;line-height:1.6;">${esc(m.notes)}</div></div>` : ''}
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
      if (icon) { icon.style.background = '#f0f2f8'; }
      const svg = icon?.querySelector('svg');
      if (svg) svg.setAttribute('stroke','#6b7a99');
    });
    const firstPurpose = document.querySelector('.lm-purpose');
    if (firstPurpose) {
      firstPurpose.classList.add('lm-on');
      const icon = firstPurpose.querySelector('.lm-purpose-icon');
      if (icon) { icon.style.background = '#174CCC'; }
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
        if (chk) { chk.style.background='#174CCC'; chk.style.borderColor='#174CCC'; chk.innerHTML='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; }
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
      (allPlayers || [])
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
          ? (allPlayers.find(p => p.id == opt.value)?.first_name || opt.value) + ' (selected)'
          : (allPlayers.find(p => String(p.id) === opt.value)
              ? `${allPlayers.find(p => String(p.id) === opt.value).first_name} ${allPlayers.find(p => String(p.id) === opt.value).last_name}`
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
      if (icon) { icon.style.background = '#f0f2f8'; }
      const svg = icon?.querySelector('svg');
      if (svg) svg.setAttribute('stroke','#6b7a99');
    });
    card.classList.add('lm-on');
    const icon = card.querySelector('.lm-purpose-icon');
    if (icon) { icon.style.background = '#174CCC'; }
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
      chk.style.background   = isOn ? '#174CCC' : 'white';
      chk.style.borderColor  = isOn ? '#174CCC' : '#e0e7f5';
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
      const getGender = (pid) => allPlayers.find(p => String(p.id) === String(pid))?.gender;
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
    if (!allPlayers.length) {
      try { allPlayers = await api('players?select=first_name,last_name,email&order=id'); } catch(_) {}
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
      const isDup = allPlayers.some(p =>
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
        <div class="import-sum-val" style="color:#24BC96;">${newRows.length}</div>
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
        <td style="color:#6b7a99;">${r.rowNum}</td>
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
    try { allPlayers = await api('players?select=*&order=first_name'); } catch(_) {}

    toast(`✓ ${successCount} player${successCount !== 1 ? 's' : ''} imported successfully${failCount ? ` · ${failCount} failed` : ''}.`);
    importReset();
    if (typeof loadPlayers === 'function') loadPlayers();
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
      const _origPlayer = allPlayers.find(p => p.id === id);
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

  // ── Share page state ──────────────────────────────────────────────────
  let _shareData = { ladders: [], tournaments: [], visits: [] };
  let _shareCurrentTab = 'ladders';

  // ── Relative time helper ───────────────────────────────────────────────
  const _relTime = (iso) => {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)  return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 172800) return 'yesterday';
    return `${Math.floor(diff/86400)}d ago`;
  };

  // ── Populate stat cards ────────────────────────────────────────────────
  const _populateShareStats = () => {
    const { ladders, tournaments, visits } = _shareData;
    const all = [...ladders, ...tournaments];

    // Most Viewed — ladder/tournament with most visit rows
    const visitsByItem = {};
    visits.forEach(v => {
      const key = v.ladder_id ? `l_${v.ladder_id}` : v.tournament_id ? `t_${v.tournament_id}` : null;
      if (key) visitsByItem[key] = (visitsByItem[key] || 0) + 1;
    });
    let mostViewedName = '—';
    if (Object.keys(visitsByItem).length) {
      const topKey = Object.keys(visitsByItem).sort((a,b) => visitsByItem[b] - visitsByItem[a])[0];
      const [type, id] = topKey.split('_');
      const found = type === 'l'
        ? ladders.find(l => String(l.id) === id)
        : tournaments.find(t => String(t.id) === id);
      if (found) mostViewedName = found.name;
    } else if (all.length) {
      // Fallback: first active ladder/tournament
      const active = all.find(x => x.status === 'active');
      if (active) mostViewedName = active.name;
    }

    // Last Shared — most recently copied (use updated_at or start_date as proxy)
    let lastSharedName = '—', lastSharedTime = '—';
    if (ladders.length) {
      const sorted = [...ladders].sort((a,b) => {
        const da = a.updated_at || a.start_date || '';
        const db = b.updated_at || b.start_date || '';
        return db.localeCompare(da);
      });
      lastSharedName = sorted[0].name;
      lastSharedTime = _relTime(sorted[0].updated_at || sorted[0].start_date);
    }

    // Total Visits — all time, plus this week for context
    const weekAgo = Date.now() - 7 * 86400000;
    const weekVisits = visits.filter(v => new Date(v.visited_at) > weekAgo).length;
    const totalVisits = visits.length;

    // Active links
    const activeLadders = ladders.filter(l => l.status === 'active').length;
    const activeTourneys = tournaments.filter(t => t.status === 'active').length;

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('share-stat-most-viewed',       mostViewedName);
    setEl('share-stat-last-shared',       lastSharedName);
    setEl('share-stat-last-shared-time',  lastSharedTime);
    setEl('share-stat-visits',            totalVisits || '—');
    setEl('share-stat-links',             activeLadders + activeTourneys);
    setEl('share-stat-links-sub',         `${activeLadders} ladder${activeLadders !== 1 ? 's' : ''} · ${activeTourneys} tournament${activeTourneys !== 1 ? 's' : ''}`);
  };

  // ── Render share cards ─────────────────────────────────────────────────
  const _renderShareCards = () => {
    const tab    = _shareCurrentTab;
    const items  = tab === 'ladders' ? _shareData.ladders : _shareData.tournaments;
    const visits = _shareData.visits;
    const q      = (document.getElementById('share-search-current')?.value || '').toLowerCase().trim();
    const filter = document.getElementById('share-status-filter')?.value || 'all';

    const baseLadderUrl = window.location.origin + window.location.pathname.replace('admin.html', '') + 'players.html';
    const baseTourneyUrl= window.location.origin + window.location.pathname.replace('admin.html', '') + 'tournament-results.html';

    // Build visit maps with namespaced keys to avoid ladder/tournament ID collisions
    // e.g. ladder 5 → "l_5", tournament 5 → "t_5"
    const visitsByItem = {};
    visits.forEach(v => {
      const key = v.ladder_id ? `l_${Number(v.ladder_id)}` : v.tournament_id ? `t_${Number(v.tournament_id)}` : null;
      if (key) visitsByItem[key] = (visitsByItem[key] || 0) + 1;
    });
    const weekAgo = Date.now() - 7 * 86400000;
    const recentByItem = {};
    visits.filter(v => new Date(v.visited_at) > weekAgo).forEach(v => {
      const key = v.ladder_id ? `l_${Number(v.ladder_id)}` : v.tournament_id ? `t_${Number(v.tournament_id)}` : null;
      if (key) recentByItem[key] = (recentByItem[key] || 0) + 1;
    });
    const maxVisits = Math.max(...Object.values(visitsByItem), 0);

    const copyIcon   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const eyeIcon    = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const shareIcon  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
    const linkIcon   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#b0bbd6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
    const plrIcon    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`;
    const clkIcon    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const visIcon    = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const hotIcon    = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    const sharedfIcon= `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`;

    let filtered = items.filter(item => {
      const nameMatch = item.name.toLowerCase().includes(q);
      let statusMatch = true;
      if (filter === 'active')   statusMatch = item.status === 'active';
      if (filter === 'archived') statusMatch = item.status !== 'active';
      if (filter === 'recent') {
        const d = item.updated_at || item.start_date || '';
        statusMatch = d ? (Date.now() - new Date(d)) < 7 * 86400000 : false;
      }
      return nameMatch && statusMatch;
    });

    const listEl = tab === 'ladders'
      ? document.getElementById('share-ladder-list')
      : document.getElementById('share-tournament-list');
    if (!listEl) return;

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty" style="padding:20px;text-align:center;background:white;border-radius:10px;">No ${tab} found.</div>`;
      return;
    }

    listEl.innerHTML = filtered.map(item => {
      const url     = tab === 'ladders'
        ? `${baseLadderUrl}?l=${btoa(String(item.id))}`
        : `${baseTourneyUrl}?t=${btoa(String(item.id))}`;
      const btnId   = `copy-${tab}-${item.id}`;
      const isActive = item.status === 'active';
      const isClosed = !isActive;
      const visitCount = visitsByItem[tab === 'ladders' ? `l_${Number(item.id)}` : `t_${Number(item.id)}`] || 0;
      const isHot   = visitCount > 0 && visitCount === maxVisits && maxVisits > 0 && Object.keys(visitsByItem).length > 0;
      const dateStr = item.end_date || item.start_date || '';
      const updatedStr = dateStr ? _relTime(dateStr) : '—';

      // Player count from ladder_players (not available here, skip to —)
      const pillClass = isActive ? 'pill-active' : 'pill-closed';
      const pillLabel = isActive ? 'Active' : (item.status || 'Closed');
      const typeLabel = tab === 'ladders' ? 'Ladder' : 'Tournament';

      const intelHTML = [
        isHot ? `<span class="share-card-intel share-intel-hot">${hotIcon} Most Viewed</span>` : '',
      ].filter(Boolean).join('');

      return `<div class="share-card" data-name="${esc(item.name).toLowerCase()}" data-status="${esc(item.status || '')}">
        <div class="share-card-inner">
          <div class="share-card-left">
            <div class="share-card-name">${esc(item.name)}</div>
            <div class="share-card-meta">
              <span class="pill ${pillClass}">${esc(pillLabel)}</span>
              <span class="pill" style="background:#e8f0ff;color:#174CCC;">${typeLabel}</span>
            </div>
            <div class="share-card-stats">
              <span class="share-card-stat">${clkIcon} Updated ${esc(updatedStr)}</span>
              <span class="share-card-stat" style="${visitCount ? 'color:#174CCC;' : ''}">${visIcon} ${visitCount || '—'} visits</span>
            </div>
            ${intelHTML ? `<div style="display:flex;gap:6px;flex-wrap:wrap;">${intelHTML}</div>` : ''}
          </div>
          <div class="share-card-right">
            <button class="share-card-btn primary" data-action="copyShareLink"
              data-url="${esc(url)}" data-btnid="${btnId}" id="${btnId}">${copyIcon} Copy Link</button>
            <a href="${esc(url)}" target="_blank" rel="noopener" class="share-card-btn preview"
              style="text-decoration:none;" onclick="_recordShareVisit('${esc(url)}')">${eyeIcon} Preview Page</a>
            <button class="share-card-btn" data-action="showShareQR" data-url="${esc(url)}">${shareIcon} Share</button>
          </div>
        </div>
        <div class="share-card-url">${linkIcon}<span class="share-card-url-text">${esc(url)}</span></div>
      </div>`;
    }).join('');
  };

  const loadSharePage = async () => {
    let _visitsTableExists = false;
    try {
      const [ladders, tournaments] = await Promise.all([
        api('ladders?select=*&order=id.desc'),
        api('tournaments?select=*&order=id.desc'),
      ]);
      // Try visits table separately so we can detect if it exists
      let visits = [];
      try {
        visits = await api('link_visits?select=ladder_id,tournament_id,visited_at&order=visited_at.desc');
        _visitsTableExists = true;
      } catch(_) {
        _visitsTableExists = false;
      }
      _shareData = { ladders, tournaments, visits: visits || [] };
    } catch (e) {
      toast(`Error loading share data: ${e.message}`, true);
    }
    // Show/hide visit tracking note
    const noteEl = document.getElementById('share-visits-note');
    if (noteEl) {
      noteEl.style.display = _visitsTableExists ? 'none' : 'flex';
    }
    _populateShareStats();
    _renderShareCards();

    // Wire search + filter (once only)
    const searchEl = document.getElementById('share-search-current');
    const filterEl = document.getElementById('share-status-filter');
    if (searchEl && !searchEl._wired) {
      searchEl._wired = true;
      searchEl.addEventListener('input', _renderShareCards);
    }
    if (filterEl && !filterEl._wired) {
      filterEl._wired = true;
      filterEl.addEventListener('change', _renderShareCards);
    }
  };

  const switchShareTab = (btn) => {
    const tab = btn.dataset.tab;
    _shareCurrentTab = tab;
    document.querySelectorAll('.share-tab').forEach((b) => {
      const isActive = b.dataset.tab === tab;
      b.classList.toggle('active', isActive);
      b.style.color = isActive ? '#174CCC' : '#6b7a99';
      b.style.borderBottomColor = isActive ? '#C6F221' : 'transparent';
    });
    // Reset search placeholder
    const searchEl = document.getElementById('share-search-current');
    if (searchEl) searchEl.placeholder = `Search ${tab}...`;
    // Show/hide tab content
    document.getElementById('share-tab-ladders').style.display  = tab === 'ladders'     ? '' : 'none';
    document.getElementById('share-tab-tournaments').style.display = tab === 'tournaments' ? '' : 'none';
    // QR now shown in modal — nothing to hide here
    _renderShareCards();
  };

  const showShareQR = (btn) => {
    const url  = btn.dataset.url;
    // Find the card name from closest ancestor
    const card = btn.closest('.share-card');
    const name = card ? (card.querySelector('.share-card-name')?.textContent || '') : '';

    const modal   = document.getElementById('share-qr-modal');
    const qrEl    = document.getElementById('share-qr-modal-code');
    const urlEl   = document.getElementById('share-qr-modal-url');
    const nameEl  = document.getElementById('share-qr-modal-name');
    const copyBtn = document.getElementById('share-qr-modal-copy');
    const closeBtn= document.getElementById('share-qr-modal-close');
    if (!modal || !qrEl) return;

    // Populate
    if (nameEl) nameEl.textContent = name;
    if (urlEl)  urlEl.textContent  = url;

    // Clear old QR and generate fresh
    qrEl.innerHTML = '';
    new QRCode(qrEl, {
      text: url,
      width: 200,
      height: 200,
      colorDark: '#0d1f4a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });

    // Track this share action
    _recordShareVisit(url);

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Copy button inside modal
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(url).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.style.color = '#24BC96';
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = '#174CCC'; }, 2000);
        });
      };
    }

    // Close handlers
    const closeModal = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    };
    if (closeBtn) closeBtn.onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  };

  const copyShareLink = (url, btnId) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        const btn = document.getElementById(btnId);
        if (btn) {
          const origHTML = btn.innerHTML;
          btn.innerHTML = '✓ Copied!';
          btn.style.background = '#24BC96';
          setTimeout(() => {
            btn.innerHTML = origHTML;
            btn.style.background = '';
          }, 2000);
        }
        toast('Link copied to clipboard!');
        // Track the share action
        _recordShareVisit(url);
      })
      .catch(() => {
        toast('Could not copy. Please copy the link manually.', true);
      });
  };

  // Record a visit/share event in link_visits table — exposed on window for inline onclick
  const _recordShareVisit = async (url) => {
    try {
      // Parse ladder_id or tournament_id from URL
      const urlObj = new URL(url);
      const lParam = urlObj.searchParams.get('l');
      const tParam = urlObj.searchParams.get('t');
      const ladder_id     = lParam ? parseInt(atob(lParam), 10) : null;
      const tournament_id = tParam ? parseInt(atob(tParam), 10) : null;
      if (!ladder_id && !tournament_id) return;
      await api('link_visits', 'POST', {
        ladder_id:      ladder_id     || null,
        tournament_id:  tournament_id || null,
        visited_at:     new Date().toISOString(),
        visitor_token:  Math.random().toString(36).slice(2),
      });
    } catch(_) { /* silent fail if table doesn't exist yet */ }
  };
  window._recordShareVisit = _recordShareVisit; // expose for inline onclick handlers

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
    const totalPlayers = ladderPlayers.length;

    // Subtitle: "N ladder players will receive this update."
    document.getElementById('notify-recipient-count').textContent =
      `${emailPlayers.length} ladder player${emailPlayers.length !== 1 ? 's' : ''} will receive this update.`;

    // Section 1: Ladder context
    document.getElementById('notify-ladder-name').textContent = currentLadder.name;
    document.getElementById('notify-context-pills').innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#174CCC;background:#e8f0ff;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${totalPlayers} Player${totalPlayers !== 1 ? 's' : ''}
      </span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#085041;background:#d4f5ed;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#085041" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        ${emailPlayers.length} with Email
      </span>`;

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

    // Add admin as last recipient to receive a copy and verify delivery
    const allRecipients = [
      ...emailPlayers,
      { first_name: 'Ferocia', last_name: 'Admin', email: CFG.ADMIN_EMAIL },
    ];

    const encoded = btoa(String(currentLadder.id));
    const baseUrl =
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'players.html';
    const leaderboardUrl = `${baseUrl}?l=${encoded}`;

    const sendBtn = document.getElementById('notify-send-btn');
    const sendBtnOrigText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = 'Sending...';
    _emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    let sent = 0;
    const failedRecipients = [];

    for (const player of allRecipients) {
      const ok = await sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.LADDER_NOTIFY, {
        player_name: `${player.first_name} ${player.last_name}`,
        player_email: player.email,
        email_title: 'Pickleball Ladder',
        subject,
        message,
        leaderboard_url: leaderboardUrl,
      });
      if (ok) {
        sent++;
      } else {
        failedRecipients.push(player.email);
      }
      sendBtn.textContent = `Sending... ${sent + failedRecipients.length}/${allRecipients.length}`;
      if (sent + failedRecipients.length < allRecipients.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    _emailInFlight = false;

    // Show completion state before closing
    if (!failedRecipients.length) {
      sendBtn.style.background = 'linear-gradient(180deg,#2ab87a,#1d9e68)';
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sent ${sent} emails!`;
    } else {
      sendBtn.style.background = 'linear-gradient(180deg,#F26024,#d44e10)';
      sendBtn.innerHTML = `⚠ Sent ${sent}, ${failedRecipients.length} failed`;
    }

    await sleep(2000);
    sendBtn.disabled = false;
    sendBtn.innerHTML = sendBtnOrigText;
    sendBtn.style.background = '';
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

    // Subtitle: "N tournament players across all divisions will receive this update."
    document.getElementById('t-notify-recipient-count').textContent =
      `${emailPlayers.length} tournament player${emailPlayers.length !== 1 ? 's' : ''} across all divisions will receive this update.`;

    // Section 1: Tournament context
    document.getElementById('t-notify-tournament-name').textContent = tournamentName;
    const catCount = categories.length;
    document.getElementById('t-notify-context-pills').innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#174CCC;background:#e8f0ff;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
        ${catCount} Division${catCount !== 1 ? 's' : ''}
      </span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#174CCC;background:#e8f0ff;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${emailPlayers.length} Player${emailPlayers.length !== 1 ? 's' : ''}
      </span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#085041;background:#d4f5ed;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#085041" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Results Ready
      </span>`;

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
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'tournament-results.html';
    const resultsUrl = `${baseTourneyUrl}?t=${btoa(String(_tournamentId))}`;

    const sendBtn = document.getElementById('t-notify-send-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    _emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    let sent = 0;
    const failedRecipients = [];

    // Add admin as last recipient to receive a copy and verify delivery
    const allTourneyRecipients = [
      ..._emailPlayers,
      { first_name: 'Ferocia', last_name: 'Admin', email: CFG.ADMIN_EMAIL },
    ];

    for (const player of allTourneyRecipients) {
      const playerMsg = message.replace('{{player_name}}', `${player.first_name} ${player.last_name}`);
      const ok = await sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.LADDER_NOTIFY, {
        player_name: `${player.first_name} ${player.last_name}`,
        player_email: player.email,
        email_title: _tournamentName,
        subject,
        message: playerMsg,
        leaderboard_url: resultsUrl,
      });
      if (ok) sent++;
      else failedRecipients.push(player.email);
      sendBtn.textContent = `Sending... ${sent + failedRecipients.length}/${allTourneyRecipients.length}`;
      if (sent + failedRecipients.length < allTourneyRecipients.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    _emailInFlight = false;

    // Show completion state before closing
    if (!failedRecipients.length) {
      sendBtn.style.background = 'linear-gradient(180deg,#2ab87a,#1d9e68)';
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sent ${sent} emails!`;
    } else {
      sendBtn.style.background = 'linear-gradient(180deg,#F26024,#d44e10)';
      sendBtn.innerHTML = `⚠ Sent ${sent}, ${failedRecipients.length} failed`;
    }

    await sleep(2000);
    sendBtn.disabled = false;
    sendBtn.innerHTML = sendBtnOrigText;
    sendBtn.style.background = '';
    closeTournamentNotifyModal();

    if (!failedRecipients.length) {
      toast(`✅ ${sent} emails sent successfully!`);
    } else {
      const failedList = failedRecipients.slice(0, 3).join(', ');
      const more = failedRecipients.length > 3 ? ` (+${failedRecipients.length - 3} more)` : '';
      toast(`Sent ${sent}. Failed: ${failedList}${more}`, true);
    }
  };

  /* ─── ORDERS ────────────────────────────────────────────── */

  const loadOrdersPage = async () => {
    const el     = document.getElementById('orders-list');
    const countEl= document.getElementById('orders-count');
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading orders...</div>';

    try {
      const statusFilter = document.getElementById('orders-status-filter')?.value;
      let endpoint = 'orders?select=*&order=created_at.desc';
      if (statusFilter) endpoint += `&status=eq.${statusFilter}`;

      const orders = await api(endpoint);
      if (countEl) countEl.textContent = orders.length;

      if (!orders.length) {
        el.innerHTML = '<div class="empty">No orders yet.</div>';
        return;
      }

      el.innerHTML = orders.map((o) => {
        const date    = fmtDate(o.created_at.split('T')[0], { month:'short', day:'numeric', year:'numeric' });
        const total   = '$' + ((o.amount_total || 0) / 100).toFixed(2);
        const ship    = o.shipping_address
          ? `${o.shipping_address.city || ''}, ${o.shipping_address.state || ''}`
          : 'Pickup';
        const items   = Array.isArray(o.line_items)
          ? o.line_items.map(i => `${i.name} ×${i.quantity}`).join(', ')
          : '—';
        const statusColor = o.status === 'fulfilled'
          ? 'var(--teal)' : o.status === 'paid'
          ? 'var(--blue)' : 'var(--orange)';

        return `<div class="list-row">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
            <div style="flex:1;min-width:0;">
              <div class="text-bold text-14">${esc(o.customer_name || 'Unknown')}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${esc(o.customer_email)}</div>
              <div style="font-size:12px;font-weight:500;color:var(--text-muted);margin-top:4px;">${esc(items)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">📍 ${esc(ship)} · 📅 ${date}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
              <div style="font-size:16px;font-weight:800;color:var(--blue);">${total}</div>
              <span style="font-size:11px;font-weight:800;color:${statusColor};text-transform:uppercase;letter-spacing:.5px;">${o.status}</span>
              ${o.status === 'paid' ? `<button class="btn btn-outline btn-sm" data-action="markFulfilled" data-orderid="${o.id}">Mark Fulfilled</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      el.innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`;
    }
  };

  const markFulfilled = async (btn) => {
    const id = parseInt(btn.dataset.orderid, 10);
    try {
      await api(`orders?id=eq.${id}`, 'PATCH', { status: 'fulfilled' });
      toast('Order marked as fulfilled.');
      await loadOrdersPage();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  /* ─── EVENTS ────────────────────────────────────────────── */

  const STORAGE_URL = `${CFG.SUPABASE_URL}/storage/v1/object/public/event-flyers`;

  const loadEventsPage = async () => {
    // Wire file input to styled label + preview
    const flyerInput = document.getElementById('event-flyer');
    if (flyerInput && !flyerInput._wired) {
      flyerInput._wired = true;
      // Click on label triggers file input
      const label = document.getElementById('ev-flyer-label');
      if (label) label.addEventListener('click', (e) => { e.preventDefault(); flyerInput.click(); });
      flyerInput.addEventListener('change', () => {
        const file    = flyerInput.files[0];
        const preview = document.getElementById('event-flyer-preview');
        const img     = document.getElementById('event-flyer-img');
        const labelTxt= document.getElementById('ev-flyer-label-text');
        if (file) {
          img.src = URL.createObjectURL(file);
          preview.style.display = '';
          if (labelTxt) labelTxt.textContent = file.name;
        } else {
          preview.style.display = 'none';
          if (labelTxt) labelTxt.textContent = 'Click to upload flyer — 800×1000px recommended, max 5MB';
        }
      });
    }
    await renderEventsList();
  };

  const renderEventsList = async () => {
    const el = document.getElementById('events-list');
    if (!el) return;
    try {
      const events = await api('events?select=*&order=event_date.asc');
      // Update count badge
      const badge = document.getElementById('events-count-badge');
      if (badge) badge.textContent = events.length || '';

      if (!events.length) {
        el.innerHTML = `<div style="text-align:center;padding:24px 16px;">
          <div style="width:38px;height:38px;border-radius:50%;background:#e8f0ff;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div style="font-size:13px;font-weight:700;color:#0d1f4a;margin-bottom:4px;">No upcoming events</div>
          <div style="font-size:11px;font-weight:600;color:#6b7a99;">Create your first event using the form.</div>
        </div>`;
        return;
      }

      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const editSVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      const delSVG   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
      const linkSVG  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;

      el.innerHTML = events.map((ev) => {
        const d      = new Date(ev.event_date + 'T00:00:00');
        const day    = d.getDate();
        const mon    = months[d.getMonth()];
        const isPast = d < new Date(new Date().toDateString());
        const pillClass = isPast ? 'ev-pill-past' : 'ev-pill-upcoming';
        const pillLabel = isPast ? 'Past' : 'Upcoming';

        const flyerHTML = ev.flyer_url
          ? `<img src="${esc(ev.flyer_url)}" class="ev-card-flyer" alt="${esc(ev.title)} flyer">`
          : `<div class="ev-card-flyer-placeholder">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c5d6f5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
             </div>`;

        const linkBtn = ev.registration_url
          ? `<a href="${esc(ev.registration_url)}" target="_blank" rel="noopener" class="sess-edit-btn" style="background:#e8f0ff;border-color:#c5d6f5;display:flex;align-items:center;justify-content:center;" title="Registration link">${linkSVG}</a>`
          : '';

        return `<div class="ev-card">
          ${flyerHTML}
          <div class="ev-card-body">
            <div class="ev-date-block">
              <div class="ev-date-badge">
                <div class="ev-date-day">${day}</div>
                <div class="ev-date-mon">${mon}</div>
              </div>
              <div class="ev-card-title">${esc(ev.title)}</div>
            </div>
            ${ev.description ? `<div class="ev-card-desc">${esc(ev.description)}</div>` : ''}
            <div class="ev-card-actions">
              <span class="ev-status-pill ${pillClass}">${pillLabel}</span>
              ${linkBtn}
              <button class="sess-edit-btn" data-action="openEditEventModal"
                data-evid="${ev.id}"
                data-evtitle="${esc(ev.title)}"
                data-evdate="${esc(ev.event_date)}"
                data-evdesc="${esc(ev.description || '')}"
                data-evreg="${esc(ev.registration_url || '')}"
                data-evflyer="${esc(ev.flyer_url || '')}"
                data-evtime="${esc(ev.event_time || '')}"
                data-evtype="${esc(ev.event_type || '')}"
                data-evend="${esc(ev.end_date || '')}"
                title="Edit event">${editSVG}</button>
              <button class="sess-edit-btn" data-action="deleteEvent"
                data-evid="${ev.id}"
                data-evflyer="${esc(ev.flyer_url || '')}"
                title="Delete event"
                style="border-color:rgba(229,57,53,0.3);">${delSVG}</button>
            </div>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      el.innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`;
    }
  };

  const createEvent = async (e) => {
    e.preventDefault();
    const title     = document.getElementById('event-title').value.trim();
    const date      = document.getElementById('event-date').value;
    const eventType = document.getElementById('event-type').value;
    const endDate   = document.getElementById('event-end-date').value;
    const desc      = document.getElementById('event-description').value.trim();
    const regUrl    = document.getElementById('event-reg-url').value.trim();
    const file      = document.getElementById('event-flyer').files[0];

    if (!title || !date) { toast('Title and date are required.', true); return; }
    if (!eventType)      { toast('Please select an event type.', true); return; }
    if (eventType === 'ladder' && !endDate) { toast('End date is required for ladder events.', true); return; }
    if (file && file.size > 5 * 1024 * 1024) { toast('Flyer must be under 5MB.', true); return; }

    const btn = document.getElementById('create-event-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      let flyer_url = null;

      if (file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `${Date.now()}_${title.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}.${ext}`;
        const uploadRes = await fetch(
          `${CFG.SUPABASE_URL}/storage/v1/object/event-flyers/${fileName}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${(await window.supabase.auth.getSession()).data.session.access_token}`,
              'Content-Type': file.type,
              'x-upsert': 'false',
            },
            body: file,
          }
        );
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error(err.message || `Upload failed: ${uploadRes.status}`);
        }
        flyer_url = `${STORAGE_URL}/${fileName}`;
      }

      await api('events', 'POST', {
        title,
        event_date: date,
        end_date: (eventType === 'ladder' && endDate) ? endDate : null,
        event_type: eventType,
        description: desc || null,
        registration_url: regUrl || null,
        flyer_url,
      });
      toast(`Event "${title}" created!`);
      document.getElementById('create-event-form').reset();
      document.getElementById('event-end-date-wrap').style.display = 'none';
      document.getElementById('event-flyer-preview').style.display = 'none';
      const lbl = document.getElementById('ev-flyer-label-text');
      if (lbl) lbl.textContent = 'Click to upload flyer — 800×1000px recommended, max 5MB';
      await renderEventsList();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Create Event';
    }
  };

  const deleteEvent = async (btn) => {
    const id = parseInt(btn.dataset.evid, 10);
    const flyerUrl = btn.dataset.evflyer;
    const ok = await confirmModal({
      title: 'Delete event?',
      message: 'This will permanently delete the event and its flyer.',
      okLabel: 'Delete',
    });
    if (!ok) return;
    try {
      // Delete flyer from storage if it exists
      if (flyerUrl) {
        const fileName = flyerUrl.split('/event-flyers/')[1];
        if (fileName) {
          const session = await window.supabase.auth.getSession();
          await fetch(
            `${CFG.SUPABASE_URL}/storage/v1/object/event-flyers/${fileName}`,
            {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${session.data.session.access_token}` },
            }
          );
        }
      }
      await api(`events?id=eq.${id}`, 'DELETE');
      toast('Event deleted.');
      await renderEventsList();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  const openEditEventModal = (btn) => {
    document.getElementById('edit-event-id').value        = btn.dataset.evid;
    document.getElementById('edit-event-title').value     = btn.dataset.evtitle;
    document.getElementById('edit-event-date').value      = btn.dataset.evdate;
    const timeEl = document.getElementById('edit-event-time');
    if (timeEl) timeEl.value = btn.dataset.evtime || '';
    document.getElementById('edit-event-description').value = btn.dataset.evdesc;
    document.getElementById('edit-event-reg-url').value   = btn.dataset.evreg;
    document.getElementById('edit-event-old-flyer').value = btn.dataset.evflyer;
    const editTypeEl = document.getElementById('edit-event-type');
    if (editTypeEl) editTypeEl.value = btn.dataset.evtype || '';
    const editEndWrap = document.getElementById('edit-event-end-date-wrap');
    const editEndEl   = document.getElementById('edit-event-end-date');
    if (editEndWrap && editEndEl) {
      editEndWrap.style.display = btn.dataset.evtype === 'ladder' ? 'block' : 'none';
      editEndEl.value = btn.dataset.evend || '';
    }

    // Wire styled file label to hidden input (once only)
    const editFlyerInput   = document.getElementById('edit-event-flyer');
    const editFlyerLabel   = document.getElementById('edit-ev-flyer-label');
    const editFlyerLabelTxt= document.getElementById('edit-ev-flyer-label-text');
    if (editFlyerInput && editFlyerLabel && !editFlyerInput._editWired) {
      editFlyerInput._editWired = true;
      editFlyerLabel.addEventListener('click', (e) => { e.preventDefault(); editFlyerInput.click(); });
      editFlyerInput.addEventListener('change', () => {
        if (editFlyerLabelTxt) editFlyerLabelTxt.textContent = editFlyerInput.files[0]
          ? editFlyerInput.files[0].name
          : 'Click to upload a new flyer — JPG or PNG, max 5MB';
      });
    }
    if (editFlyerInput) editFlyerInput.value = '';
    if (editFlyerLabelTxt) editFlyerLabelTxt.textContent = 'Click to upload a new flyer — JPG or PNG, max 5MB';

    // Show current flyer preview if exists
    const flyerEl  = document.getElementById('edit-event-current-flyer');
    const flyerImg = document.getElementById('edit-event-flyer-img');
    if (btn.dataset.evflyer) {
      flyerImg.src = btn.dataset.evflyer;
      flyerEl.style.display = 'block';
    } else {
      flyerEl.style.display = 'none';
    }
    // Reset file input
    document.getElementById('edit-event-flyer').value = '';
    // Show modal
    const modal = document.getElementById('edit-event-modal');
    modal.style.display = 'flex';
  };

  window.toggleEventEndDate = (wrapId, type) => {
    const wrap = document.getElementById(wrapId);
    const inp  = wrap ? wrap.querySelector('input[type="date"]') : null;
    if (!wrap) return;
    const show = type === 'ladder';
    wrap.style.display = show ? 'block' : 'none';
    if (inp) inp.required = show;
    if (!show && inp) inp.value = '';
  };

  const closeEditEventModal = () => {
    document.getElementById('edit-event-modal').style.display = 'none';
  };

  const editEvent = async (e) => {
    e.preventDefault();
    const id        = parseInt(document.getElementById('edit-event-id').value, 10);
    const title     = document.getElementById('edit-event-title').value.trim();
    const date      = document.getElementById('edit-event-date').value;
    const eventType = document.getElementById('edit-event-type').value;
    const endDate   = document.getElementById('edit-event-end-date').value;
    const desc      = document.getElementById('edit-event-description').value.trim();
    const regUrl    = document.getElementById('edit-event-reg-url').value.trim();
    const file      = document.getElementById('edit-event-flyer').files[0];
    const oldFlyer  = document.getElementById('edit-event-old-flyer').value;

    if (!title || !date)  { toast('Title and date are required.', true); return; }
    if (!eventType)       { toast('Please select an event type.', true); return; }
    if (eventType === 'ladder' && !endDate) { toast('End date is required for ladder events.', true); return; }
    if (file && file.size > 5 * 1024 * 1024) { toast('Flyer must be under 5MB.', true); return; }

    const btn = document.getElementById('edit-event-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      let flyer_url = oldFlyer || null;

      if (file) {
        // Delete old flyer from storage if it exists
        if (oldFlyer) {
          const oldFileName = oldFlyer.split('/event-flyers/')[1];
          if (oldFileName) {
            const session = await window.supabase.auth.getSession();
            await fetch(
              `${CFG.SUPABASE_URL}/storage/v1/object/event-flyers/${oldFileName}`,
              {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.data.session.access_token}` },
              }
            ).catch(() => {}); // non-critical
          }
        }
        // Upload new flyer
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `${Date.now()}_${title.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}.${ext}`;
        const uploadRes = await fetch(
          `${CFG.SUPABASE_URL}/storage/v1/object/event-flyers/${fileName}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${(await window.supabase.auth.getSession()).data.session.access_token}`,
              'Content-Type': file.type,
              'x-upsert': 'false',
            },
            body: file,
          }
        );
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          throw new Error(err.message || `Upload failed: ${uploadRes.status}`);
        }
        flyer_url = `${STORAGE_URL}/${fileName}`;
      }

      await api(`events?id=eq.${id}`, 'PATCH', {
        title,
        event_date: date,
        end_date: (eventType === 'ladder' && endDate) ? endDate : null,
        event_type: eventType,
        description: desc || null,
        registration_url: regUrl || null,
        flyer_url,
      });

      toast(`Event "${title}" updated!`);
      closeEditEventModal();
      await renderEventsList();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save Changes';
    }
  };

  /* ─── PROMOTIONS ───────────────────────────────────────── */

  // ── Promotions page state ─────────────────────────────────────────────
  let _allSubs       = [];
  let _subsShown     = 25;

  const _renderSubsTable = () => {
    const search = (document.getElementById('sub-search')?.value || '').toLowerCase().trim();
    const filter = document.getElementById('sub-status-filter')?.value || 'all';
    const filtered = _allSubs.filter(s => {
      const nameMatch = `${s.first_name} ${s.last_name} ${s.email} ${s.phone || ''}`.toLowerCase().includes(search);
      const statusMatch = filter === 'all' || s.status === filter;
      return nameMatch && statusMatch;
    });
    const slice   = filtered.slice(0, _subsShown);
    const total   = filtered.length;

    const avColors = ['#174CCC','#24BC96','#F26024','#7c3aed','#0891b2','#d97706'];
    const getAv = (s) => {
      const str = `${s.first_name}${s.last_name}`;
      let h = 0; for (let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);
      return avColors[Math.abs(h) % avColors.length];
    };
    const pillCSS = (status) => {
      if (status === 'active')       return 'background:rgba(36,188,150,0.12);color:#085041;';
      if (status === 'pending')      return 'background:rgba(242,96,36,0.12);color:#7a3d00;';
      return 'background:rgba(107,122,153,0.12);color:#6b7a99;';
    };
    const tableHTML = slice.length ? `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0d1f4a;padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Subscriber</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0d1f4a;padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Email</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0d1f4a;padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Phone</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0d1f4a;padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Skill</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0d1f4a;padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Status</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0d1f4a;padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Joined</th>
          </tr>
        </thead>
        <tbody>
          ${slice.map(s => {
            const initials = `${s.first_name?.[0]||''}${s.last_name?.[0]||''}`.toUpperCase();
            return `<tr style="cursor:default;" onmouseover="this.querySelectorAll('td').forEach(t=>t.style.background='rgba(23,76,204,0.025)')" onmouseout="this.querySelectorAll('td').forEach(t=>t.style.background='')">
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;vertical-align:middle;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:30px;height:30px;border-radius:50%;background:${getAv(s)};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;flex-shrink:0;">${esc(initials)}</div>
                  <div style="font-size:13px;font-weight:700;color:#0d1f4a;">${esc(s.first_name)} ${esc(s.last_name)}</div>
                </div>
              </td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:#6b7a99;">${esc(s.email || '—')}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:#6b7a99;">${esc(s.phone || '—')}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:#6b7a99;text-transform:capitalize;">${esc(s.skill_level || '—')}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;">
                <span style="font-size:9px;font-weight:800;padding:3px 9px;border-radius:99px;letter-spacing:.5px;text-transform:uppercase;${pillCSS(s.status)}">${esc(s.status || '—')}</span>
              </td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:11px;color:#6b7a99;">${fmtDate(s.subscribed_at) || '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : `<div class="empty" style="padding:20px;">No subscribers found.</div>`;

    document.getElementById('subscribers-table').innerHTML = tableHTML;

    // Load more row
    const lmRow = document.getElementById('sub-load-more-row');
    const lmInfo = document.getElementById('sub-results-info');
    const lmBtn  = document.getElementById('sub-load-more-btn');
    if (lmRow) {
      lmRow.style.display = 'flex';
      if (lmInfo) lmInfo.textContent = `Showing ${Math.min(_subsShown, total)} of ${total} subscribers`;
      if (lmBtn) {
        if (slice.length < total) {
          lmBtn.style.display = '';
          lmBtn.textContent = `Load ${Math.min(25, total - slice.length)} more`;
          lmBtn.onclick = () => { _subsShown += 25; _renderSubsTable(); };
        } else {
          lmBtn.style.display = 'none';
        }
      }
    }
  };

  const loadPromotionsPage = async () => {
    await loadSubscribers();
    // Auto-generate QR code on page load
    generateQR();
  };

  const loadSubscribers = async () => {
    _subsShown = 25;
    let subs = [];
    try {
      subs = await api('subscribers?select=*&order=subscribed_at.desc');
    } catch (e) {
      document.getElementById('subscribers-table').innerHTML =
        `<div class="empty" style="padding:20px;">Error: ${esc(e.message)}</div>`;
      return;
    }
    _allSubs = subs;

    // Stat cards
    const countActive  = subs.filter(s => s.status === 'active').length;
    const countPending = subs.filter(s => s.status === 'pending').length;
    const countUnsub   = subs.filter(s => s.status === 'unsubscribed').length;
    const countTotal   = subs.length;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('promo-stat-active',  countActive);
    setEl('promo-stat-pending', countPending);
    setEl('promo-stat-total',   countTotal);
    setEl('promo-stat-unsub',   countUnsub);

    // Trend: count subscribers joined this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonth = subs.filter(s => s.subscribed_at && s.subscribed_at >= monthStart).length;
    const growthPct = countTotal > 0 ? Math.round((newThisMonth / countTotal) * 100) : 0;

    // Update ctx lines with real trend data
    const ctxActive = document.getElementById('promo-ctx-active');
    if (ctxActive) ctxActive.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +${newThisMonth} this month`;
    const ctxPending = document.getElementById('promo-ctx-pending');
    if (ctxPending) ctxPending.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F26024" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Awaiting email verification`;
    const ctxTotal = document.getElementById('promo-ctx-total');
    if (ctxTotal) ctxTotal.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +${growthPct}% growth`;

    // Growth badge on QR card
    const badge = document.getElementById('promo-growth-badge');
    if (badge) badge.textContent = `+${newThisMonth} subscriber${newThisMonth !== 1 ? 's' : ''} this month`;

    // Pending label on action card
    const pendLabel = document.getElementById('promo-pending-label');
    if (pendLabel) pendLabel.textContent = `${countPending} subscriber${countPending !== 1 ? 's' : ''} awaiting confirmation.`;

    // Legacy compat
    const elA = document.getElementById('sub-count-active');
    const elP = document.getElementById('sub-count-pending');
    const elU = document.getElementById('sub-count-unsub');
    if (elA) elA.textContent = countActive + ' Active';
    if (elP) elP.textContent = countPending + ' Pending';
    if (elU) elU.textContent = countUnsub + ' Unsubscribed';

    // Wire copy URL button
    const copyBtn = document.getElementById('promo-copy-url-btn');
    if (copyBtn && !copyBtn._wired) {
      copyBtn._wired = true;
      copyBtn.addEventListener('click', () => {
        const url = document.getElementById('subscribe-url-display')?.textContent || '';
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.style.color = '#24BC96';
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = '#C6F221'; }, 2000);
        });
      });
    }

    _renderSubsTable();
  };

  const generateQR = () => {
    const baseUrl =
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'subscribe.html';
    // Populate URL strip in new QR card
    const urlDisplay = document.getElementById('subscribe-url-display');
    if (urlDisplay) urlDisplay.textContent = baseUrl;
    const qrEl = document.getElementById('qr-code');
    if (!qrEl) return;
    qrEl.innerHTML = '';
    /* eslint-disable no-new, no-undef */
    new QRCode(qrEl, {
      text: baseUrl,
      width: 150,
      height: 150,
      colorDark: '#0d1f4a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
    /* eslint-enable */
  };

  // ── Helper: relative time ───────────────────────────────────────────────
  const _relTimePromo = (iso) => {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 172800) return 'Yesterday';
    return `${Math.floor(diff/86400)} days ago`;
  };

  const openSendPromo = async () => {
    const modal = document.getElementById('promo-modal');
    if (!modal) return;

    // Reset composer
    const editor = document.getElementById('promo-message');
    if (editor) editor.innerHTML = '';
    const subjectEl = document.getElementById('promo-subject');
    if (subjectEl) subjectEl.value = '';

    // Reset type pills to Tournament
    document.querySelectorAll('.promo-type-pill').forEach(p => p.classList.remove('active'));
    const firstPill = document.querySelector('.promo-type-pill');
    if (firstPill) firstPill.classList.add('active');
    const typeInput = document.getElementById('promo-campaign-type');
    if (typeInput) typeInput.value = 'Tournament';
    const selTypeEl = document.getElementById('promo-selected-type');
    if (selTypeEl) selTypeEl.textContent = 'Tournament';
    // Reset event selector + flyer fields
    const evSel = document.getElementById('promo-event-select');
    if (evSel) evSel.innerHTML = '<option value="">Loading...</option>';
    const flyerInp = document.getElementById('promo-event-flyer-url');
    if (flyerInp) flyerInp.value = '';
    const otherFlyerInp = document.getElementById('promo-other-flyer-url');
    if (otherFlyerInp) otherFlyerInp.value = '';

    // Wire type pill clicks — show/hide event selector or flyer URL field
    const updateCampaignTypeUI = (type) => {
      const evWrap    = document.getElementById('promo-event-selector-wrap');
      const otherWrap = document.getElementById('promo-other-flyer-wrap');
      if (evWrap)    evWrap.style.display    = (type === 'Tournament' || type === 'Ladder') ? 'block' : 'none';
      if (otherWrap) otherWrap.style.display = type === 'Other' ? 'block' : 'none';
      // Repopulate event dropdown for selected type
      if (type === 'Tournament' || type === 'Ladder') populateCampaignEventDropdown(type);
    };
    document.querySelectorAll('.promo-type-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.promo-type-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        if (typeInput) typeInput.value = pill.dataset.type;
        if (selTypeEl) selTypeEl.textContent = pill.dataset.type;
        updateCampaignTypeUI(pill.dataset.type);
      };
    });
    // Trigger for initial state (Tournament selected by default)
    updateCampaignTypeUI('Tournament');

    // Wire character counter
    if (editor) {
      editor.addEventListener('input', () => {
        const len = editor.innerText.length;
        const el1 = document.getElementById('promo-char-count');
        const el2 = document.getElementById('promo-char-count2');
        if (el1) el1.textContent = `${len} / 2000`;
        if (el2) el2.textContent = `${len} / 2000`;
      });
    }

    // Wire link button
    window.promptInsertLink = () => {
      const url = prompt('Enter URL:');
      if (url) document.execCommand('createLink', false, url);
    };
    window.toggleEmojiPicker = (e) => {
      e.stopPropagation();
      const picker = document.getElementById('emoji-picker');
      if (!picker) return;
      const isOpen = picker.style.display === 'grid';
      picker.style.display = isOpen ? 'none' : 'grid';
      if (!isOpen) {
        // Close when clicking outside
        const close = (ev) => {
          if (!picker.contains(ev.target) && ev.target.id !== 'emoji-picker-btn') {
            picker.style.display = 'none';
            document.removeEventListener('click', close);
          }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
      }
    };
    window.insertFixedEmoji = (emoji) => {
      const editor = document.getElementById('promo-message');
      if (!editor) return;
      editor.focus();
      document.execCommand('insertText', false, emoji);
      // Close picker after selection
      const picker = document.getElementById('emoji-picker');
      if (picker) picker.style.display = 'none';
    };

    // Load audience + last campaign in parallel
    try {
      const [subs, campaigns] = await Promise.all([
        api('subscribers?status=eq.active&select=id'),
        api('campaigns?select=*&order=sent_at.desc&limit=1').catch(() => []),
      ]);

      const count = subs.length;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('promo-audience-count', count);

      const recipEl = document.getElementById('promo-recipient-count');
      if (recipEl) recipEl.innerHTML = `<span style="font-weight:800;color:#24BC96;">${count} active subscriber${count !== 1 ? 's' : ''}</span> will receive this campaign.`;

      const last = campaigns?.[0] || null;
      setEl('promo-last-sent', last ? _relTimePromo(last.sent_at) : 'No campaigns yet');
      setEl('promo-last-type', last ? last.campaign_type || 'General' : '');

    } catch (e) {
      const recipEl = document.getElementById('promo-recipient-count');
      if (recipEl) recipEl.textContent = 'Could not load audience data.';
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  const populateCampaignEventDropdown = async (type) => {
    const sel      = document.getElementById('promo-event-select');
    const flyerInp = document.getElementById('promo-event-flyer-url');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading...</option>';
    if (flyerInp) flyerInp.value = '';
    try {
      const today  = new Date().toISOString().slice(0, 10);
      const dbType = type.toLowerCase(); // 'tournament' or 'ladder'
      const events = await api(`events?event_type=eq.${dbType}&event_date=gte.${today}&select=id,title,event_date,flyer_url&order=event_date.asc`);
      if (!events.length) {
        sel.innerHTML = `<option value="">No upcoming ${type.toLowerCase()} events</option>`;
        return;
      }
      sel.innerHTML = '<option value="">Select an event...</option>'
        + events.map(ev => {
            const d = new Date(ev.event_date + 'T00:00:00');
            const label = `${ev.title} — ${d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}`;
            return `<option value="${ev.id}" data-title="${ev.title.replace(/"/g,'&quot;')}" data-flyer="${ev.flyer_url || ''}">${label}</option>`;
          }).join('');
      // Wire selection → auto-fill subject + store flyer URL
      sel.onchange = () => {
        const opt = sel.options[sel.selectedIndex];
        const subjectEl = document.getElementById('promo-subject');
        if (opt.value && subjectEl) {
          const emoji = type === 'Tournament' ? '🏆' : '🏓';
          subjectEl.value = `${emoji} ${opt.dataset.title} — Don't Miss It!`;
        }
        if (flyerInp) flyerInp.value = opt.dataset.flyer || '';
      };
    } catch (err) {
      sel.innerHTML = '<option value="">Error loading events</option>';
    }
  };

  const sendTestPromoEmail = async () => {
    if (_emailInFlight) { toast('Please wait for the current send to finish.', true); return; }

    const subject = document.getElementById('promo-subject').value.trim();
    const editor  = document.getElementById('promo-message');
    const message = editor ? editor.innerText.trim() : '';
    const campaignType = document.getElementById('promo-campaign-type')?.value || 'Other';

    // Resolve flyer URL same as real send
    let promoFlyerUrl = '';
    if (campaignType === 'Tournament' || campaignType === 'Ladder') {
      const sel = document.getElementById('promo-event-select');
      if (!sel || !sel.value) { toast('Please select an event first.', true); return; }
      promoFlyerUrl = document.getElementById('promo-event-flyer-url')?.value || '';
    } else if (campaignType === 'Other') {
      promoFlyerUrl = document.getElementById('promo-other-flyer-url')?.value.trim() || '';
    }

    if (!subject || !message) {
      toast('Please fill in the subject and message before sending a test.', true);
      return;
    }

    const testBtn = document.getElementById('promo-test-btn');
    const origHTML = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = 'Sending test...';

    try {
      emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
      const ok = await sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.PROMO, {
        player_name:     'Ferocia Admin',
        player_email:    CFG.ADMIN_EMAIL,
        subject:         `[TEST] ${subject}`,
        message:         message,
        unsubscribe_url: '#',
        flyer_url:       promoFlyerUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      });
      if (ok) {
        toast(`✅ Test email sent to ${CFG.ADMIN_EMAIL}`);
      } else {
        toast('Test email failed. Check your EmailJS config.', true);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      testBtn.disabled = false;
      testBtn.innerHTML = origHTML;
    }
  };

  const sendPromoEmail = async (e) => {
    e.preventDefault();
    const subject = document.getElementById('promo-subject').value.trim();
    const editor  = document.getElementById('promo-message');
    const message = editor ? editor.innerText.trim() : '';
    const campaignType = document.getElementById('promo-campaign-type')?.value || 'Other';

    // Resolve flyer URL: from event selector or from Other flyer URL input
    let promoFlyerUrl = '';
    if (campaignType === 'Tournament' || campaignType === 'Ladder') {
      const sel = document.getElementById('promo-event-select');
      if (sel && sel.value) {
        promoFlyerUrl = document.getElementById('promo-event-flyer-url')?.value || '';
      } else {
        toast('Please select an event.', true); return;
      }
    } else if (campaignType === 'Other') {
      promoFlyerUrl = document.getElementById('promo-other-flyer-url')?.value.trim() || '';
    }

    if (!subject || !message) {
      toast('Please fill in the subject and message.', true);
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
    sendBtn.innerHTML = 'Sending...';
    _emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', '');
    let sent = 0;
    const failedRecipients = [];

    // Admin copy always last
    const allPromoRecipients = [
      ...subs,
      { first_name: 'Ferocia', last_name: 'Admin', email: CFG.ADMIN_EMAIL, unsubscribe_token: null },
    ];

    for (const sub of allPromoRecipients) {
      const unsubUrl = sub.unsubscribe_token
        ? `${baseUrl}unsubscribe.html?t=${sub.unsubscribe_token}`
        : `${baseUrl}unsubscribe.html`;
      // Replace {first_name} with real name
      const personalizedMsg = message.replace(/\{first_name\}/g, sub.first_name || 'Player');
      const ok = await sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.PROMO, {
        player_name:     `${sub.first_name} ${sub.last_name}`,
        player_email:    sub.email,
        subject,
        message:         personalizedMsg,
        unsubscribe_url: unsubUrl,
        flyer_url:       promoFlyerUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      });
      if (ok) sent++;
      else failedRecipients.push(sub.email);
      sendBtn.innerHTML = `Sending... ${sent + failedRecipients.length}/${allPromoRecipients.length}`;
      if (sent + failedRecipients.length < allPromoRecipients.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    // Record campaign in DB
    try {
      await api('campaigns', 'POST', {
        subject,
        message,
        campaign_type: campaignType,
        sent_at:       new Date().toISOString(),
        sent_count:    sent,
        failed_count:  failedRecipients.length,
      });
    } catch(_) { /* non-critical — don't block on this */ }

    _emailInFlight = false;
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Launch Campaign';

    // Close modal
    const modal = document.getElementById('promo-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }

    if (!failedRecipients.length) {
      toast(`✅ Campaign launched! ${sent} emails sent.`);
    } else {
      const failedList = failedRecipients.slice(0, 3).join(', ');
      const more = failedRecipients.length > 3 ? ` (+${failedRecipients.length - 3} more)` : '';
      toast(`Sent ${sent}. Failed: ${failedList}${more}`, true);
    }
  };

  /* ─── EVENT DELEGATION ─────────────────────────────────── */

  /* ─── FTC LADDER — PHASE 5: STANDINGS & STATS ─────────────── */

  window.ftcStdTab = (e, tab) => {
    document.getElementById('ftc-std-team-tab').style.display   = tab === 'team'   ? 'block' : 'none';
    document.getElementById('ftc-std-player-tab').style.display = tab === 'player' ? 'block' : 'none';
    const tabs = document.querySelectorAll('#page-ftc-standings .lop-tab');
    tabs.forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
  };

  const loadFtcStandings = async () => {
    if (!currentLadder) return;

    // Set page title
    const titleEl = document.getElementById('ftc-standings-title');
    if (titleEl) { titleEl.textContent = currentLadder.name || ''; titleEl.style.display = 'block'; }

    // Ensure teams + matches + players loaded
    if (!ftcTeams.length) {
      try { ftcTeams = await api(`ftc_ladder_teams?ladder_id=eq.${currentLadder.id}&select=*&order=id`); } catch(e) {}
    }
    if (!ftcMatches.length) {
      try { ftcMatches = await api(`ftc_ladder_matches?ladder_id=eq.${currentLadder.id}&select=*&order=schedule_id,match_type`); } catch(e) {}
    }
    if (!ladderPlayers.length) { try { await loadLadderPlayers(); } catch(e) {} }

    const completedMatches = ftcMatches.filter(m => m.status === 'completed' && !m.is_tiebreaker);
    const completedSchedule = ftcSchedule.filter(s => !s.is_bye);
    const weeksComplete = ftcSchedule.length
      ? [...new Set(ftcSchedule.filter(s => s.status === 'completed').map(s => s.week_number))].length
      : 0;
    const totalWeeks = [...new Set(ftcSchedule.map(s => s.week_number))].length;

    // ── Compute team stats ────────────────────────────────────────────────
    const teamStats = {};
    ftcTeams.forEach(t => {
      teamStats[t.id] = { team: t, pts: 0, wins: 0, losses: 0, played: 0,
        ptsFor: 0, ptsAgainst: 0,
        byType: { mens:{w:0,l:0}, womens:{w:0,l:0}, mixed1:{w:0,l:0}, mixed2:{w:0,l:0} },
        form: [] };
    });

    completedMatches.forEach(m => {
      const aWins = m.score_a > m.score_b;
      const bWins = m.score_b > m.score_a;
      if (teamStats[m.team_a_id]) {
        teamStats[m.team_a_id].pts      += m.league_pts_a || 0;
        teamStats[m.team_a_id].ptsFor   += m.score_a || 0;
        teamStats[m.team_a_id].ptsAgainst += m.score_b || 0;
        teamStats[m.team_a_id].played++;
        if (aWins) teamStats[m.team_a_id].wins++;   else teamStats[m.team_a_id].losses++;
        if (m.match_type && teamStats[m.team_a_id].byType[m.match_type]) {
          if (aWins) teamStats[m.team_a_id].byType[m.match_type].w++;
          else       teamStats[m.team_a_id].byType[m.match_type].l++;
        }
      }
      if (teamStats[m.team_b_id]) {
        teamStats[m.team_b_id].pts      += m.league_pts_b || 0;
        teamStats[m.team_b_id].ptsFor   += m.score_b || 0;
        teamStats[m.team_b_id].ptsAgainst += m.score_a || 0;
        teamStats[m.team_b_id].played++;
        if (bWins) teamStats[m.team_b_id].wins++;   else teamStats[m.team_b_id].losses++;
        if (m.match_type && teamStats[m.team_b_id].byType[m.match_type]) {
          if (bWins) teamStats[m.team_b_id].byType[m.match_type].w++;
          else       teamStats[m.team_b_id].byType[m.match_type].l++;
        }
      }
    });

    // Build form (last 5 matchup results per team)
    const schedByWeek = {};
    ftcSchedule.filter(s => !s.is_bye && s.status === 'completed').forEach(s => {
      if (!schedByWeek[s.id]) schedByWeek[s.id] = s;
    });
    Object.values(schedByWeek).forEach(s => {
      const matchesForSched = completedMatches.filter(m => m.schedule_id === s.id);
      const winsA = matchesForSched.filter(m => m.winner_team_id === s.team_a_id).length;
      const winsB = matchesForSched.filter(m => m.winner_team_id === s.team_b_id).length;
      if (teamStats[s.team_a_id]) teamStats[s.team_a_id].form.push(winsA > winsB ? 'W' : 'L');
      if (teamStats[s.team_b_id]) teamStats[s.team_b_id].form.push(winsB > winsA ? 'W' : 'L');
    });

    // Rank teams by pts desc, then wins, then diff
    const ranked = Object.values(teamStats).sort((a,b) =>
      (b.pts - a.pts) || (b.wins - a.wins) || ((b.ptsFor-b.ptsAgainst)-(a.ptsFor-a.ptsAgainst))
    );

    // ── Compute player stats ──────────────────────────────────────────────
    const playerStats = {};
    const pName = (id) => {
      if (!id) return null;
      const p = ladderPlayers.find(x => x.id === id);
      return p ? { id: p.id, name: `${p.first_name} ${p.last_name}`, initials: (p.first_name[0]||'') + (p.last_name[0]||'') } : null;
    };

    const ensurePlayer = (pid, teamId) => {
      if (!pid) return;
      if (!playerStats[pid]) {
        const info = pName(pid);
        const team = ftcTeams.find(t => t.id === teamId);
        playerStats[pid] = {
          id: pid, name: info?.name || `#${pid}`, initials: info?.initials || '?',
          teamName: team?.name || '—', teamId,
          played: 0, wins: 0, losses: 0, pts: 0,
          byType: { mens:{w:0,l:0}, womens:{w:0,l:0}, mixed1:{w:0,l:0}, mixed2:{w:0,l:0} },
          history: []
        };
      }
    };

    completedMatches.forEach(m => {
      const aWins = m.score_a > m.score_b;
      const type  = m.match_type;
      // Team A players
      [m.team_a_p1_id, m.team_a_p2_id].filter(Boolean).forEach(pid => {
        ensurePlayer(pid, m.team_a_id);
        const ps = playerStats[pid];
        ps.played++; ps.pts += m.league_pts_a || 0;
        if (aWins) ps.wins++; else ps.losses++;
        if (type && ps.byType[type]) { if (aWins) ps.byType[type].w++; else ps.byType[type].l++; }
        const partner = pid === m.team_a_p1_id ? m.team_a_p2_id : m.team_a_p1_id;
        ps.history.push({
          week: ftcSchedule.find(s => s.id === m.schedule_id)?.week_number || '?',
          type, partnerId: partner,
          opp1: m.team_b_p1_id, opp2: m.team_b_p2_id,
          scoreA: m.score_a, scoreB: m.score_b, won: aWins, pts: m.league_pts_a
        });
      });
      // Team B players
      [m.team_b_p1_id, m.team_b_p2_id].filter(Boolean).forEach(pid => {
        ensurePlayer(pid, m.team_b_id);
        const ps = playerStats[pid];
        ps.played++; ps.pts += m.league_pts_b || 0;
        if (!aWins) ps.wins++; else ps.losses++;
        if (type && ps.byType[type]) { if (!aWins) ps.byType[type].w++; else ps.byType[type].l++; }
        const partner = pid === m.team_b_p1_id ? m.team_b_p2_id : m.team_b_p1_id;
        ps.history.push({
          week: ftcSchedule.find(s => s.id === m.schedule_id)?.week_number || '?',
          type, partnerId: partner,
          opp1: m.team_a_p1_id, opp2: m.team_a_p2_id,
          scoreA: m.score_b, scoreB: m.score_a, won: !aWins, pts: m.league_pts_b
        });
      });
    });

    const rankedPlayers = Object.values(playerStats).sort((a,b) => (b.pts - a.pts) || (b.wins - a.wins));

    // ── Render stat cards ─────────────────────────────────────────────────
    const leaderTeam = ranked[0];
    document.getElementById('ftc-std-stats').innerHTML = `
      <div class="stat stat-blue">
        <div class="stat-label">Teams</div>
        <div class="stat-value">${ftcTeams.length}</div>
        <div class="stat-ctx ctx-blue">Registered this season</div>
      </div>
      <div class="stat stat-green">
        <div class="stat-label">Matches Played</div>
        <div class="stat-value">${completedMatches.length}</div>
        <div class="stat-ctx ctx-green">Across all matchups</div>
      </div>
      <div class="stat stat-lime">
        <div class="stat-label">Weeks Complete</div>
        <div class="stat-value">${weeksComplete}/${totalWeeks}</div>
        <div class="stat-ctx">Regular season</div>
      </div>
      <div class="stat stat-gold">
        <div class="stat-label">Leader</div>
        <div class="stat-leader-name">${esc(leaderTeam?.team?.name || '—')}</div>
        <div class="stat-leader-pts">${leaderTeam?.pts || 0} PTS</div>
        <div class="stat-leader-week">↑ Season leader</div>
        <div class="stat-leader-streak">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#F26024" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Top of the ladder
        </div>
      </div>`;

    // ── Render podium ─────────────────────────────────────────────────────
    const medals  = ['gold','silver','bronze'];
    const top3    = ranked.slice(0,3);
    const order   = top3.length === 1 ? [0] : top3.length === 2 ? [1,0] : [1,0,2];
    const podiumHTML = (teams, eyebrow) => {
      return `<div class="podium-half">
        <div class="podium-eyebrow">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d1f4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
          ${eyebrow}
        </div>
        <div class="podium">
          ${order.map(idx => {
            if (idx >= teams.length) return '';
            const item   = teams[idx];
            const medal  = medals[idx];
            const isGold = idx === 0;
            const initials = (item.name||'').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
            return `<div class="podium-slot">
              <div class="podium-avatar ${medal}${isGold?' podium-avatar gold-first':''}" style="${isGold?'width:62px;height:62px;':''}">${esc(initials)}${isGold?'<span class="podium-crown">👑</span>':''}</div>
              <div class="podium-name">${esc(item.name)}</div>
              <div class="podium-pts">${item.pts} pts</div>
              <div class="podium-bar ${medal}">${isGold?'🥇':idx===1?'🥈':'🥉'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    };

    const top3Players = rankedPlayers.slice(0,3).map(p => ({ name: p.name, pts: p.pts }));
    const top3Teams   = top3.map(t => ({ name: t.team.name, pts: t.pts }));
    const orderP      = top3Players.length===1?[0]:top3Players.length===2?[1,0]:[1,0,2];

    document.getElementById('ftc-std-podium').innerHTML = `
      <div class="podium-row">
        ${podiumHTML(top3Teams, 'Team Standings')}
        <div class="podium-half" style="border-left:0.5px solid #e0e7f5;">
          <div class="podium-eyebrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d1f4a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Top Player Performers
          </div>
          <div class="podium">
            ${orderP.map(idx => {
              if (idx >= top3Players.length) return '';
              const item   = top3Players[idx];
              const medal  = medals[idx];
              const isGold = idx === 0;
              const initials = (item.name||'').split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase();
              return `<div class="podium-slot">
                <div class="podium-avatar ${medal}${isGold?' podium-avatar gold-first':''}" style="${isGold?'width:62px;height:62px;':''}">${esc(initials)}${isGold?'<span class="podium-crown">👑</span>':''}</div>
                <div class="podium-name">${esc(item.name.split(' ')[0])} ${esc((item.name.split(' ')[1]||'')[0]||'')}.</div>
                <div class="podium-pts">${item.pts} pts</div>
                <div class="podium-bar ${medal}">${isGold?'🥇':idx===1?'🥈':'🥉'}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;

    // ── Helper: type pill ─────────────────────────────────────────────────
    const typePill = (type, stat) => {
      if (!stat || (stat.w + stat.l) === 0) return '<span style="color:#b0bbd6;font-size:10px;">—</span>';
      const colors = { mens:'#174CCC', womens:'#F26024', mixed1:'#24BC96', mixed2:'#9a6e00' };
      const bg     = { mens:'#e8f0ff', womens:'rgba(242,96,36,0.1)', mixed1:'rgba(36,188,150,0.1)', mixed2:'rgba(154,110,0,0.1)' };
      const color  = colors[type] || '#6b7a99';
      const bgc    = bg[type] || '#f0f2f8';
      return `<span style="display:inline-flex;padding:2px 7px;border-radius:99px;font-size:9px;font-weight:700;background:${bgc};color:${color};">${stat.w}W ${stat.l}L</span>`;
    };

    // ── Render team standings table ───────────────────────────────────────
    const rankBadge = (i) => {
      const styles = ['background:linear-gradient(135deg,#f6d365,#fda085)', 'background:#C0C0C0;color:#444', 'background:#CD7F32'];
      const bg = styles[i] || 'background:#e0e7f5;color:#6b7a99';
      return `<span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;${bg}">${i+1}</span>`;
    };

    const formDots = (form) => form.slice(-5).map(r =>
      `<span style="width:12px;height:12px;border-radius:50%;display:inline-block;background:${r==='W'?'#24BC96':'#F26024'};"></span>`
    ).join('');

    document.getElementById('ftc-std-team-table').innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f9ff;border-bottom:0.5px solid #e0e7f5;">
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px 8px 8px 16px;text-align:left;width:40px;">#</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:left;">Team</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Pts</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">W</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">L</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Diff</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Men's DB</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Women's DB</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Mixed #1</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Mixed #2</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Played</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:left;min-width:80px;">Form</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map((ts,i) => {
            const diff = ts.ptsFor - ts.ptsAgainst;
            const diffStr = diff > 0 ? `+${diff}` : String(diff);
            const diffColor = diff > 0 ? '#24BC96' : diff < 0 ? '#F26024' : '#6b7a99';
            return `<tr style="border-bottom:0.5px solid #f4f5f8;">
              <td style="padding:10px 8px 10px 16px;">${rankBadge(i)}</td>
              <td style="padding:10px 8px;font-size:13px;font-weight:800;color:#0d1f4a;">${esc(ts.team.name)}</td>
              <td style="padding:10px 8px;text-align:center;"><span style="font-size:14px;font-weight:800;color:#174CCC;">${ts.pts}</span></td>
              <td style="padding:10px 8px;text-align:center;font-weight:700;color:#24BC96;">${ts.wins}</td>
              <td style="padding:10px 8px;text-align:center;font-weight:700;color:#F26024;">${ts.losses}</td>
              <td style="padding:10px 8px;text-align:center;font-weight:700;color:${diffColor};">${diffStr}</td>
              <td style="padding:10px 8px;text-align:center;">${typePill('mens',ts.byType.mens)}</td>
              <td style="padding:10px 8px;text-align:center;">${typePill('womens',ts.byType.womens)}</td>
              <td style="padding:10px 8px;text-align:center;">${typePill('mixed1',ts.byType.mixed1)}</td>
              <td style="padding:10px 8px;text-align:center;">${typePill('mixed2',ts.byType.mixed2)}</td>
              <td style="padding:10px 8px;text-align:center;font-weight:600;color:#6b7a99;">${ts.played}</td>
              <td style="padding:10px 8px;"><div style="display:flex;gap:3px;">${formDots(ts.form)}</div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    // ── Render player stats table ─────────────────────────────────────────
    const colors = ['#174CCC','#F26024','#24BC96','#9a6e00','#7B2FBE','#C04A0E'];
    document.getElementById('ftc-std-player-table').innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f9ff;border-bottom:0.5px solid #e0e7f5;">
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px 8px 8px 16px;text-align:left;">Player</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Played</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">W</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">L</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Win %</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Pts</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Men's DB</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Women's DB</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Mixed #1</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Mixed #2</th>
          </tr>
        </thead>
        <tbody>
          ${rankedPlayers.map((ps, pi) => {
            const winPct = ps.played ? Math.round(ps.wins / ps.played * 100) : 0;
            const avatarColor = colors[pi % colors.length];
            const pNameShort = (id) => { const p = ladderPlayers.find(x => x.id === id); return p ? `${p.first_name[0]}. ${p.last_name}` : '—'; };
            const typeLabels = { mens:'MD', womens:'WD', mixed1:'MX1', mixed2:'MX2' };
            const typeBg     = { mens:'#e8f0ff', womens:'rgba(242,96,36,0.1)', mixed1:'rgba(36,188,150,0.1)', mixed2:'rgba(154,110,0,0.1)' };
            const typeClr    = { mens:'#174CCC', womens:'#F26024', mixed1:'#24BC96', mixed2:'#9a6e00' };
            const historyRows = ps.history.map(h => `
              <tr>
                <td style="font-size:11px;padding:5px 8px;border-bottom:0.5px solid #f0f2f8;">Wk ${h.week}</td>
                <td style="padding:5px 8px;border-bottom:0.5px solid #f0f2f8;"><span style="font-size:8px;font-weight:800;padding:2px 5px;border-radius:4px;background:${typeBg[h.type]||'#f0f2f8'};color:${typeClr[h.type]||'#6b7a99'};">${typeLabels[h.type]||h.type}</span></td>
                <td style="font-size:11px;padding:5px 8px;border-bottom:0.5px solid #f0f2f8;color:#6b7a99;">${pNameShort(h.partnerId)}</td>
                <td style="font-size:11px;padding:5px 8px;border-bottom:0.5px solid #f0f2f8;color:#6b7a99;">${pNameShort(h.opp1)} / ${pNameShort(h.opp2)}</td>
                <td style="font-size:11px;font-weight:800;padding:5px 8px;border-bottom:0.5px solid #f0f2f8;text-align:center;color:${h.won?'#24BC96':'#F26024'};">${h.scoreA}–${h.scoreB}</td>
                <td style="padding:5px 8px;border-bottom:0.5px solid #f0f2f8;text-align:center;"><span style="display:inline-flex;padding:2px 7px;border-radius:99px;font-size:9px;font-weight:700;background:${h.won?'rgba(36,188,150,0.12)':'rgba(242,96,36,0.08)'};color:${h.won?'#085041':'#F26024'};">${h.won?'W':'L'}</span></td>
                <td style="font-size:11px;font-weight:700;padding:5px 8px;border-bottom:0.5px solid #f0f2f8;text-align:center;color:${h.won?'#24BC96':'#F26024'};">+${h.pts}</td>
              </tr>`).join('');
            return `<tr style="border-bottom:0.5px solid #f4f5f8;cursor:pointer;" onclick="ftcTogglePlayerRow(${ps.id})">
              <td style="padding:10px 8px 10px 16px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="width:28px;height:28px;border-radius:50%;background:${avatarColor};display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;flex-shrink:0;">${esc(ps.initials)}</div>
                  <div>
                    <div style="font-size:12px;font-weight:800;color:#0d1f4a;">${esc(ps.name)}</div>
                    <div style="font-size:9px;font-weight:600;color:#6b7a99;">${esc(ps.teamName)}</div>
                  </div>
                </div>
              </td>
              <td style="padding:10px 8px;text-align:center;font-weight:700;">${ps.played}</td>
              <td style="padding:10px 8px;text-align:center;font-weight:700;color:#24BC96;">${ps.wins}</td>
              <td style="padding:10px 8px;text-align:center;font-weight:700;color:#F26024;">${ps.losses}</td>
              <td style="padding:10px 8px;text-align:center;">
                <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
                  <span style="font-weight:800;font-size:12px;color:${winPct>=50?'#24BC96':'#F26024'};">${winPct}%</span>
                  <div style="height:5px;border-radius:99px;background:#e0e7f5;width:60px;overflow:hidden;"><div style="height:100%;border-radius:99px;background:${winPct>=50?'#24BC96':'#F26024'};width:${winPct}%;"></div></div>
                </div>
              </td>
              <td style="padding:10px 8px;text-align:center;"><span style="font-size:14px;font-weight:800;color:#174CCC;">${ps.pts}</span></td>
              <td style="padding:10px 8px;text-align:center;">${typePill('mens',ps.byType.mens)}</td>
              <td style="padding:10px 8px;text-align:center;">${typePill('womens',ps.byType.womens)}</td>
              <td style="padding:10px 8px;text-align:center;">${typePill('mixed1',ps.byType.mixed1)}</td>
              <td style="padding:10px 8px;text-align:center;">${typePill('mixed2',ps.byType.mixed2)}</td>
            </tr>
            <tr id="ftc-player-row-${ps.id}" style="display:none;">
              <td colspan="10" style="padding:0;background:#f8f9ff;">
                <div style="padding:12px 16px;">
                  <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#174CCC;margin-bottom:8px;">${esc(ps.name)} — Match History</div>
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><th style="background:transparent;font-size:9px;color:#6b7a99;padding:4px 8px;border-bottom:0.5px solid #e0e7f5;text-align:left;">Week</th><th style="background:transparent;font-size:9px;color:#6b7a99;padding:4px 8px;border-bottom:0.5px solid #e0e7f5;">Type</th><th style="background:transparent;font-size:9px;color:#6b7a99;padding:4px 8px;border-bottom:0.5px solid #e0e7f5;">Partner</th><th style="background:transparent;font-size:9px;color:#6b7a99;padding:4px 8px;border-bottom:0.5px solid #e0e7f5;">vs Opponents</th><th style="background:transparent;font-size:9px;color:#6b7a99;padding:4px 8px;border-bottom:0.5px solid #e0e7f5;text-align:center;">Score</th><th style="background:transparent;font-size:9px;color:#6b7a99;padding:4px 8px;border-bottom:0.5px solid #e0e7f5;text-align:center;">Result</th><th style="background:transparent;font-size:9px;color:#6b7a99;padding:4px 8px;border-bottom:0.5px solid #e0e7f5;text-align:center;">Pts</th></tr>
                    ${historyRows}
                  </table>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  };

  window.ftcTogglePlayerRow = (pid) => {
    const row = document.getElementById(`ftc-player-row-${pid}`);
    if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
  };

  /* ─── FTC LADDER — PLAYOFFS ───────────────────────────────── */
  // ── Playoff state ────────────────────────────────────────────────────────
  let ftcPlayoffBracket  = null; // { format:'top4'|'top6', rounds:[...], champion:null }
  let ftcPlayoffMatches  = [];   // playoff ftc_ladder_matches rows
  let ftcPlayoffSchedule = [];   // playoff ftc_ladder_schedule rows (one per matchup)
  let _ftcPlayoffScoresModalScheduleId = null; // currently open playoff scores modal
  // Debug exposure
  window._dbg = { get ftcPlayoffSchedule(){ return ftcPlayoffSchedule; }, get ftcPlayoffMatches(){ return ftcPlayoffMatches; }, get ftcTeams(){ return ftcTeams; } };

  const loadFtcPlayoffs = async () => {
    if (!currentLadder) return;
    const el = document.getElementById('ftc-playoffs-title');
    if (el) { el.textContent = currentLadder.name || ''; el.style.display = 'block'; }

    // Ensure base data loaded
    if (!ftcTeams.length) {
      try { ftcTeams = await api(`ftc_ladder_teams?ladder_id=eq.${currentLadder.id}&select=*&order=id`); } catch(e) {}
    }
    if (!ftcMatches.length) {
      try { ftcMatches = await api(`ftc_ladder_matches?ladder_id=eq.${currentLadder.id}&select=*&order=schedule_id,match_type`); } catch(e) {}
    }
    if (!ladderPlayers.length) { try { await loadLadderPlayers(); } catch(e) {} }

    // Load playoff schedule + matches
    try {
      ftcPlayoffSchedule = await api(`ftc_ladder_schedule?ladder_id=eq.${currentLadder.id}&is_playoff=eq.true&order=playoff_round,id`);
    } catch(e) { ftcPlayoffSchedule = []; }
    try {
      const psIds = ftcPlayoffSchedule.map(s => s.id);
      ftcPlayoffMatches = psIds.length
        ? await api(`ftc_ladder_matches?schedule_id=in.(${psIds.join(',')})&select=*&order=schedule_id,match_type`)
        : [];
    } catch(e) { ftcPlayoffMatches = []; }

    renderFtcPlayoffPage();
  };

  // ── Render the full playoffs page ─────────────────────────────────────────
  const renderFtcPlayoffPage = () => {
    const hasSchedule = ftcPlayoffSchedule.length > 0;
    renderFtcPlayoffSteps(hasSchedule);
    if (!hasSchedule) {
      renderFtcPlayoffSetup();
      document.getElementById('ftc-playoff-bracket').innerHTML = '';
      document.getElementById('ftc-playoff-champion').style.display = 'none';
    } else {
      document.getElementById('ftc-playoff-setup').innerHTML = '';
      renderFtcBracket();
      renderFtcChampion();
    }
  };

  // ── Step indicator ────────────────────────────────────────────────────────
  const renderFtcPlayoffSteps = (hasBracket) => {
    const el = document.getElementById('ftc-playoff-steps');
    if (!el) return;
    const steps = [
      { label: 'Regular Season', done: true },
      { label: 'Setup', done: hasBracket },
      { label: 'Bracket', done: false, active: hasBracket },
      { label: 'Champion', done: false },
    ];
    el.innerHTML = steps.map((s, i) => {
      const cls = s.done ? 'background:#e8f0ff;color:#174CCC;' : s.active ? 'background:#174CCC;color:white;' : 'background:#f0f2f8;color:#6b7a99;';
      const icon = s.done ? '✓ ' : `${i+1} `;
      const line = i < steps.length-1 ? '<div style="flex:1;height:1px;background:#e0e7f5;max-width:24px;"></div>' : '';
      return `<div style="display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:99px;font-size:11px;font-weight:700;${cls}">${icon}${s.label}</div>${line}`;
    }).join('');
  };

  // ── Setup section — seeding table + settings ──────────────────────────────
  const renderFtcPlayoffSetup = () => {
    const el = document.getElementById('ftc-playoff-setup');
    if (!el) return;

    // Compute standings from regular season matches
    const completedMatches = ftcMatches.filter(m => m.status === 'completed' && !m.is_tiebreaker);
    const teamStats = {};
    ftcTeams.forEach(t => { teamStats[t.id] = { team:t, pts:0, wins:0, losses:0, ptsFor:0, ptsAgainst:0 }; });
    completedMatches.forEach(m => {
      const aW = m.score_a > m.score_b;
      if (teamStats[m.team_a_id]) { teamStats[m.team_a_id].pts += m.league_pts_a||0; teamStats[m.team_a_id].ptsFor += m.score_a||0; teamStats[m.team_a_id].ptsAgainst += m.score_b||0; if (aW) teamStats[m.team_a_id].wins++; else teamStats[m.team_a_id].losses++; }
      if (teamStats[m.team_b_id]) { teamStats[m.team_b_id].pts += m.league_pts_b||0; teamStats[m.team_b_id].ptsFor += m.score_b||0; teamStats[m.team_b_id].ptsAgainst += m.score_a||0; if (!aW) teamStats[m.team_b_id].wins++; else teamStats[m.team_b_id].losses++; }
    });
    const ranked = Object.values(teamStats).sort((a,b) => (b.pts-a.pts)||(b.wins-a.wins)||((b.ptsFor-b.ptsAgainst)-(a.ptsFor-a.ptsAgainst)));
    const rankBadgeStyle = ['background:linear-gradient(135deg,#f6d365,#fda085)','background:#C0C0C0;color:#444','background:#CD7F32','background:#174CCC'];

    const rows = ranked.map((ts,i) => {
      const diff = ts.ptsFor - ts.ptsAgainst;
      const inTop = i < 4; // default top 4
      return `<tr>
        <td style="padding:8px 8px 8px 16px;"><span style="width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;${rankBadgeStyle[i]||'background:#e0e7f5;color:#6b7a99;'}">${i+1}</span></td>
        <td style="font-size:13px;font-weight:800;color:${inTop?'#0d1f4a':'#b0bbd6'};">${esc(ts.team.name)}</td>
        <td style="text-align:center;font-weight:700;color:#174CCC;">${ts.pts}</td>
        <td style="text-align:center;font-weight:700;color:#24BC96;">${ts.wins}</td>
        <td style="text-align:center;font-weight:700;color:#F26024;">${ts.losses}</td>
        <td style="text-align:center;font-weight:700;color:${diff>=0?'#24BC96':'#F26024'};">${diff>=0?'+':''}${diff}</td>
        <td style="text-align:center;" id="ftc-po-incl-${i}">
          <span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:99px;${inTop?'background:rgba(36,188,150,0.12);color:#085041;':'background:#f0f2f8;color:#b0bbd6;'}">${inTop?'✓ In':'Out'}</span>
        </td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="card" style="margin-bottom:14px;">
        <div style="font-size:14px;font-weight:800;color:#0d1f4a;margin-bottom:4px;">Playoff Settings</div>
        <div style="font-size:11px;font-weight:600;color:#6b7a99;margin-bottom:14px;">Configure bracket before generating.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div>
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7a99;margin-bottom:6px;">Teams advancing</div>
            <select id="ftc-po-format" style="font-size:12px;font-weight:700;color:#0d1f4a;padding:8px 12px;border:0.5px solid #174CCC;border-radius:8px;background:white;width:100%;" onchange="ftcUpdatePlayoffFormat()">
              <option value="top4">Top 4 teams (Semi → Final)</option>
              <option value="top6">Top 6 teams (QF → Semi → Final)</option>
              <option value="top8">Top 8 teams (QF → Semi → Final)</option>
            </select>
          </div>
          <div>
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7a99;margin-bottom:6px;">Bracket format</div>
            <select id="ftc-po-bracket-type" style="font-size:12px;font-weight:700;color:#0d1f4a;padding:8px 12px;border:0.5px solid #174CCC;border-radius:8px;background:white;width:100%;">
              <option value="single">Single elimination</option>
              <option value="double">Double elimination</option>
            </select>
          </div>
        </div>
        <div style="background:#f0f4ff;border-radius:8px;padding:10px 14px;border-left:3px solid #174CCC;font-size:11px;font-weight:600;color:#174CCC;margin-bottom:14px;">
          Seeding auto-calculated from standings (pts → wins → diff). Toggle teams in/out below.
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f8f9ff;border-bottom:0.5px solid #e0e7f5;">
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px 8px 8px 16px;width:40px;">#</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;">Team</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Pts</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">W</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">L</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;">Diff</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:8px;text-align:center;width:80px;">Include</th>
          </tr></thead>
          <tbody id="ftc-po-seed-body">${rows}</tbody>
        </table>
        <div style="display:flex;justify-content:flex-end;margin-top:14px;">
          <button onclick="ftcGeneratePlayoffBracket()" style="display:inline-flex;align-items:center;gap:6px;padding:8px 20px;border:none;border-radius:99px;background:#174CCC;color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Generate Bracket
          </button>
        </div>
      </div>`;
  };

  // Update include badges when format changes
  window.ftcUpdatePlayoffFormat = () => {
    const format = document.getElementById('ftc-po-format')?.value || 'top4';
    const n = format === 'top8' ? 8 : format === 'top6' ? 6 : 4;
    const rows = document.querySelectorAll('#ftc-po-seed-body tr');
    rows.forEach((row, i) => {
      const cell = row.querySelector(`[id^="ftc-po-incl-"]`);
      if (!cell) return;
      const inTop = i < n;
      cell.innerHTML = `<span style="font-size:9px;font-weight:800;padding:2px 8px;border-radius:99px;${inTop?'background:rgba(36,188,150,0.12);color:#085041;':'background:#f0f2f8;color:#b0bbd6;'}">${inTop?'✓ In':'Out'}</span>`;
      const teamNm = row.querySelector('td:nth-child(2)');
      if (teamNm) teamNm.style.color = inTop ? '#0d1f4a' : '#b0bbd6';
    });
  };

  // ── Generate bracket: create schedule + match rows in DB ─────────────────
  window.ftcGeneratePlayoffBracket = async () => {
    if (!currentLadder) return;
    const format = document.getElementById('ftc-po-format')?.value || 'top4';
    const n = format === 'top8' ? 8 : format === 'top6' ? 6 : 4;

    // Compute seeded teams (reuse standings logic)
    const completedMatches = ftcMatches.filter(m => m.status === 'completed' && !m.is_tiebreaker);
    const teamStats = {};
    ftcTeams.forEach(t => { teamStats[t.id] = { team:t, pts:0, wins:0, losses:0, ptsFor:0, ptsAgainst:0 }; });
    completedMatches.forEach(m => {
      const aW = m.score_a > m.score_b;
      if (teamStats[m.team_a_id]) { teamStats[m.team_a_id].pts+=m.league_pts_a||0; teamStats[m.team_a_id].ptsFor+=m.score_a||0; teamStats[m.team_a_id].ptsAgainst+=m.score_b||0; if(aW)teamStats[m.team_a_id].wins++;else teamStats[m.team_a_id].losses++; }
      if (teamStats[m.team_b_id]) { teamStats[m.team_b_id].pts+=m.league_pts_b||0; teamStats[m.team_b_id].ptsFor+=m.score_b||0; teamStats[m.team_b_id].ptsAgainst+=m.score_a||0; if(!aW)teamStats[m.team_b_id].wins++;else teamStats[m.team_b_id].losses++; }
    });
    const seeded = Object.values(teamStats).sort((a,b)=>(b.pts-a.pts)||(b.wins-a.wins)||((b.ptsFor-b.ptsAgainst)-(a.ptsFor-a.ptsAgainst))).slice(0,n).map(ts=>ts.team);

    // Build matchup schedule rows
    // Top4: SF1=(1v4), SF2=(2v3), F=(winnersof)
    // Top6: QF1=(3v6), QF2=(4v5), SF1=(1vQF1), SF2=(2vQF2), F
    let scheduleRows = [];
    if (format === 'top4') {
      scheduleRows = [
        { playoff_round:'semifinal', playoff_match_num:1, team_a_id:seeded[0]?.id, team_b_id:seeded[3]?.id, seed_a:1, seed_b:4 },
        { playoff_round:'semifinal', playoff_match_num:2, team_a_id:seeded[1]?.id, team_b_id:seeded[2]?.id, seed_a:2, seed_b:3 },
        { playoff_round:'final',     playoff_match_num:1, team_a_id:null, team_b_id:null, seed_a:null, seed_b:null },
      ];
    } else if (format === 'top6') {
      scheduleRows = [
        { playoff_round:'quarterfinal', playoff_match_num:1, team_a_id:seeded[2]?.id, team_b_id:seeded[5]?.id, seed_a:3, seed_b:6 },
        { playoff_round:'quarterfinal', playoff_match_num:2, team_a_id:seeded[3]?.id, team_b_id:seeded[4]?.id, seed_a:4, seed_b:5 },
        { playoff_round:'semifinal',    playoff_match_num:1, team_a_id:seeded[0]?.id, team_b_id:null, seed_a:1, seed_b:null },
        { playoff_round:'semifinal',    playoff_match_num:2, team_a_id:seeded[1]?.id, team_b_id:null, seed_a:2, seed_b:null },
        { playoff_round:'final',        playoff_match_num:1, team_a_id:null, team_b_id:null, seed_a:null, seed_b:null },
      ];
    } else {
      // top8: 1v8, 2v7, 3v6, 4v5 in QFs; SF and Final placeholders (TBD after QF results)
      scheduleRows = [
        { playoff_round:'quarterfinal', playoff_match_num:1, team_a_id:seeded[0]?.id, team_b_id:seeded[7]?.id, seed_a:1, seed_b:8 },
        { playoff_round:'quarterfinal', playoff_match_num:2, team_a_id:seeded[1]?.id, team_b_id:seeded[6]?.id, seed_a:2, seed_b:7 },
        { playoff_round:'quarterfinal', playoff_match_num:3, team_a_id:seeded[2]?.id, team_b_id:seeded[5]?.id, seed_a:3, seed_b:6 },
        { playoff_round:'quarterfinal', playoff_match_num:4, team_a_id:seeded[3]?.id, team_b_id:seeded[4]?.id, seed_a:4, seed_b:5 },
        { playoff_round:'semifinal',    playoff_match_num:1, team_a_id:null, team_b_id:null, seed_a:null, seed_b:null },
        { playoff_round:'semifinal',    playoff_match_num:2, team_a_id:null, team_b_id:null, seed_a:null, seed_b:null },
        { playoff_round:'final',        playoff_match_num:1, team_a_id:null, team_b_id:null, seed_a:null, seed_b:null },
      ];
    }

    try {
      const matchTypes = ['mens','womens','mixed1','mixed2'];

      // Step 1: Insert all schedule rows at once
      await api('ftc_ladder_schedule', 'POST', scheduleRows.map(r => ({
        ladder_id:   currentLadder.id,
        week_number: 99,
        is_playoff:  true,
        status:      'scheduled',
        ...r,
      })));

      // Step 2: Reload schedule from DB to get real IDs
      ftcPlayoffSchedule = await api(`ftc_ladder_schedule?ladder_id=eq.${currentLadder.id}&is_playoff=eq.true&order=playoff_round,id`);

      // Step 3: Insert match rows for matchups where both teams are known
      const matchRows = [];
      for (const s of ftcPlayoffSchedule.filter(s => s.team_a_id && s.team_b_id)) {
        const tA = ftcTeams.find(t => t.id === s.team_a_id);
        const tB = ftcTeams.find(t => t.id === s.team_b_id);
        for (const mt of matchTypes) {
          matchRows.push({
            schedule_id:  s.id,
            ladder_id:    currentLadder.id,
            match_type:   mt,
            team_a_id:    s.team_a_id,
            team_b_id:    s.team_b_id,
            team_a_p1_id: mt==='mens'?tA?.m1_id:mt==='womens'?tA?.f1_id:mt==='mixed1'?tA?.mixed1_ma_id:tA?.mixed2_ma_id,
            team_a_p2_id: mt==='mens'?tA?.m2_id:mt==='womens'?tA?.f2_id:mt==='mixed1'?tA?.mixed1_fa_id:tA?.mixed2_fa_id,
            team_b_p1_id: mt==='mens'?tB?.m1_id:mt==='womens'?tB?.f1_id:mt==='mixed1'?tB?.mixed1_ma_id:tB?.mixed2_ma_id,
            team_b_p2_id: mt==='mens'?tB?.m2_id:mt==='womens'?tB?.f2_id:mt==='mixed1'?tB?.mixed1_fa_id:tB?.mixed2_fa_id,
            status:       'scheduled',
          });
        }
      }
      if (matchRows.length) await api('ftc_ladder_matches', 'POST', matchRows);

      // Step 4: Reload matches from DB and render
      const psIds = ftcPlayoffSchedule.map(s => s.id);
      ftcPlayoffMatches = psIds.length
        ? await api(`ftc_ladder_matches?schedule_id=in.(${psIds.join(',')})&select=*&order=schedule_id,match_type`)
        : [];

      toast('Playoff bracket generated!');
      renderFtcPlayoffPage();
    } catch(err) {
      toast(`Error generating bracket: ${err.message}`, true);
      console.error('Playoff generate error:', err);
    }
  };

  // ── Render the bracket ────────────────────────────────────────────────────
  const renderFtcBracket = () => {
    const el = document.getElementById('ftc-playoff-bracket');
    if (!el || !ftcPlayoffSchedule.length) return;

    const tName = (id) => { if (!id) return null; const t = ftcTeams.find(x => x.id === id); return t ? esc(t.name) : `#${id}`; };
    const roundLabel = { quarterfinal:'Quarterfinals', semifinal:'Semifinals', final:'Final' };
    const rounds = ['quarterfinal','semifinal','final'].filter(r => ftcPlayoffSchedule.some(s => s.playoff_round === r));

    const renderMatchCard = (sched) => {
      const matches = ftcPlayoffMatches.filter(m => m.schedule_id === sched.id && !m.is_tiebreaker);
      const winsA = matches.filter(m => m.status==='completed' && m.winner_team_id===sched.team_a_id).length;
      const winsB = matches.filter(m => m.status==='completed' && m.winner_team_id===sched.team_b_id).length;
      const done  = sched.status === 'completed';
      const hasBothTeams = sched.team_a_id && sched.team_b_id;
      const nmA = tName(sched.team_a_id) || (sched.seed_a ? `Winner SF${sched.seed_a>2?sched.seed_a-2:sched.seed_a}` : 'TBD');
      const nmB = tName(sched.team_b_id) || (sched.seed_b ? `Winner SF${sched.seed_b>2?sched.seed_b-2:sched.seed_b}` : 'TBD');
      const winAStyle = done && winsA > winsB ? 'background:rgba(36,188,150,0.06);border-left:3px solid #24BC96;' : '';
      const winBStyle = done && winsB > winsA ? 'background:rgba(36,188,150,0.06);border-left:3px solid #24BC96;' : '';
      const isFinal   = sched.playoff_round === 'final';
      const clickable = hasBothTeams;
      const onclick   = clickable ? `ftcOpenPlayoffScoresModal(${sched.id})` : '';

      return `<div style="border:${isFinal?'1.5px solid #174CCC':'0.5px solid #e0e7f5'};border-radius:8px;overflow:hidden;${clickable?'cursor:pointer;':'opacity:.6;'}transition:box-shadow .15s;" ${clickable?`onclick="${onclick}" onmouseover="this.style.boxShadow='0 2px 12px rgba(23,76,204,0.12)'" onmouseout="this.style.boxShadow='none'"`:''}  >
        ${isFinal?`<div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#174CCC;padding:4px 10px;background:#e8f0ff;text-align:center;display:flex;align-items:center;justify-content:center;gap:5px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg> Championship</div>`:''}
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:0.5px solid #f4f5f8;background:white;${winAStyle}">
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="font-size:9px;font-weight:800;color:#b0bbd6;width:14px;">${sched.seed_a||''}</span>
            <span style="font-size:12px;font-weight:800;color:${sched.team_a_id?'#0d1f4a':'#b0bbd6'};">${nmA}</span>
          </div>
          <span style="font-size:13px;font-weight:800;color:${done&&winsA>winsB?'#24BC96':'#6b7a99'};">${hasBothTeams?winsA:'—'}</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:${sched.team_b_id?'white':'#fafbff'};${winBStyle}">
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="font-size:9px;font-weight:800;color:#b0bbd6;width:14px;">${sched.seed_b||''}</span>
            <span style="font-size:12px;font-weight:800;color:${sched.team_b_id?'#0d1f4a':'#b0bbd6'};">${nmB}</span>
          </div>
          <span style="font-size:13px;font-weight:800;color:${done&&winsB>winsA?'#24BC96':'#6b7a99'};">${hasBothTeams?winsB:'—'}</span>
        </div>
        <div style="font-size:9px;font-weight:700;text-align:center;padding:3px;background:#f8f9ff;color:${done?'#24BC96':clickable?'#174CCC':'#b0bbd6'};">
          ${done?'✓ Complete':clickable?'Click to enter scores':'Awaiting previous round'}
        </div>
      </div>`;
    };

    const champion = ftcPlayoffSchedule.find(s => s.playoff_round==='final' && s.status==='completed');
    const champTeamId = champion ? (ftcPlayoffMatches.filter(m=>m.schedule_id===champion.id&&m.status==='completed').reduce((acc,m)=>{ if(m.winner_team_id===champion.team_a_id)acc.a++; else acc.b++; return acc; },{a:0,b:0})) : null;

    let bracketHtml = `<div class="card" style="margin-bottom:14px;">
      <div style="font-size:14px;font-weight:800;color:#0d1f4a;margin-bottom:4px;">Playoff Bracket — ${rounds.includes('quarterfinal')?(seededCount>=8?'Top 8':'Top 6'):'Top 4'}</div>
      <div style="font-size:11px;font-weight:600;color:#6b7a99;margin-bottom:16px;">Click any matchup to enter or edit scores. Same 4-game format (MD, WD, MX1, MX2).</div>
      <div style="display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding-bottom:8px;">`;

    rounds.forEach((round, ri) => {
      const roundSchedules = ftcPlayoffSchedule.filter(s => s.playoff_round === round);
      bracketHtml += `<div style="min-width:180px;flex-shrink:0;">
        <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7a99;text-align:center;margin-bottom:10px;">${roundLabel[round]||round}</div>
        <div style="display:flex;flex-direction:column;gap:${round==='final'?'0':'20px'};">
          ${roundSchedules.map(s => renderMatchCard(s)).join('')}
        </div>
      </div>`;
      // Connector between rounds
      if (ri < rounds.length - 1) {
        bracketHtml += `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:32px;flex-shrink:0;padding-top:32px;">
          <div style="width:16px;height:1px;background:#e0e7f5;"></div>
        </div>`;
      }
    });

    // Champion slot
    const champFinal = ftcPlayoffSchedule.find(s => s.playoff_round==='final');
    const champId = champFinal?.status==='completed' ? (ftcPlayoffMatches.filter(m=>m.schedule_id===champFinal.id&&!m.is_tiebreaker).reduce((a,m)=>{ if(m.winner_team_id===champFinal.team_a_id)a.wA++; else a.wB++; return a; },{wA:0,wB:0})) : null;
    const champTeam = champId && champFinal ? (champId.wA > champId.wB ? ftcTeams.find(t=>t.id===champFinal.team_a_id) : ftcTeams.find(t=>t.id===champFinal.team_b_id)) : null;

    bracketHtml += `<div style="display:flex;align-items:center;width:32px;flex-shrink:0;"><div style="height:1px;width:32px;background:#e0e7f5;"></div></div>
      <div style="min-width:120px;flex-shrink:0;text-align:center;padding-top:32px;">
        <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#6b7a99;margin-bottom:10px;">Champion</div>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="${champTeam?'#174CCC':'#b0bbd6'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:6px;"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
        <div style="font-size:13px;font-weight:800;color:${champTeam?'#0d1f4a':'#b0bbd6'};">${champTeam?esc(champTeam.name):'TBD'}</div>
        <div style="font-size:9px;font-weight:600;color:#b0bbd6;margin-top:2px;">${champTeam?'Season Champion':'Awaiting Final'}</div>
      </div>`;

    bracketHtml += `</div></div>`;
    el.innerHTML = bracketHtml;
  };

  // ── Render champion card ──────────────────────────────────────────────────
  const renderFtcChampion = () => {
    const champFinal = ftcPlayoffSchedule.find(s => s.playoff_round==='final' && s.status==='completed');
    const el = document.getElementById('ftc-playoff-champion');
    if (!el) return;
    if (!champFinal) { el.style.display='none'; return; }
    const results = ftcPlayoffMatches.filter(m=>m.schedule_id===champFinal.id&&!m.is_tiebreaker);
    const wA = results.filter(m=>m.winner_team_id===champFinal.team_a_id).length;
    const wB = results.filter(m=>m.winner_team_id===champFinal.team_b_id).length;
    const champTeam = wA>wB ? ftcTeams.find(t=>t.id===champFinal.team_a_id) : ftcTeams.find(t=>t.id===champFinal.team_b_id);
    const runnerUp  = wA>wB ? ftcTeams.find(t=>t.id===champFinal.team_b_id) : ftcTeams.find(t=>t.id===champFinal.team_a_id);
    const champWins = Math.max(wA,wB); const runnerWins = Math.min(wA,wB);
    const allPoMatches = ftcPlayoffMatches.filter(m=>!m.is_tiebreaker&&m.status==='completed');
    const champPoWins  = allPoMatches.filter(m=>m.winner_team_id===champTeam?.id).length;
    const champPoSeed  = ftcPlayoffSchedule.find(s=>s.team_a_id===champTeam?.id||s.team_b_id===champTeam?.id);
    const seed = champPoSeed?.team_a_id===champTeam?.id ? champPoSeed.seed_a : champPoSeed?.seed_b;
    el.style.display='block';
    el.innerHTML=`<div class="card" style="text-align:center;padding:32px;border:1.5px solid #174CCC;background:linear-gradient(180deg,#f0f4ff,white);">
      <div style="display:flex;justify-content:center;margin-bottom:12px;">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
      </div>
      <div style="font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:1px;color:#0d1f4a;margin-bottom:4px;">${esc(champTeam?.name||'Champion')}</div>
      <div style="font-size:13px;font-weight:700;color:#174CCC;margin-bottom:2px;">${esc(currentLadder?.name||'')} Champions</div>
      <div style="font-size:11px;font-weight:600;color:#6b7a99;margin-bottom:20px;">Defeated ${esc(runnerUp?.name||'Runner-up')} ${champWins}–${runnerWins} in the Championship</div>
      <div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;">
        <div style="background:white;border:0.5px solid #e0e7f5;border-radius:10px;padding:12px 20px;min-width:90px;">
          <div style="font-size:22px;font-weight:800;color:#174CCC;">${champWins}–${runnerWins}</div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:3px;">Final Score</div>
        </div>
        <div style="background:white;border:0.5px solid #e0e7f5;border-radius:10px;padding:12px 20px;min-width:90px;">
          <div style="font-size:22px;font-weight:800;color:#24BC96;">${champPoWins}</div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:3px;">Playoff Wins</div>
        </div>
        <div style="background:white;border:0.5px solid #e0e7f5;border-radius:10px;padding:12px 20px;min-width:90px;">
          <div style="font-size:22px;font-weight:800;color:#F6A623;">${seed?`#${seed}`:'—'}</div>
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6b7a99;margin-top:3px;">Regular Season Seed</div>
        </div>
      </div>
    </div>`;
  };

  // ── Playoff Match Scores Modal ────────────────────────────────────────────
  window.ftcOpenPlayoffScoresModal = (scheduleId) => {
    _ftcPlayoffScoresModalScheduleId = scheduleId;
    const sched = ftcPlayoffSchedule.find(s => parseInt(s.id,10) === parseInt(scheduleId,10));
    if (!sched) return;
    const tA = ftcTeams.find(t => t.id === sched.team_a_id);
    const tB = ftcTeams.find(t => t.id === sched.team_b_id);
    const roundLabels = { quarterfinal:'Quarterfinal', semifinal:'Semifinal', final:'Championship Final' };
    document.getElementById('ftc-psm-subtitle').textContent =
      `${esc(tA?.name||'—')} vs ${esc(tB?.name||'—')} · ${roundLabels[sched.playoff_round]||sched.playoff_round}`;
    document.getElementById('ftc-psm-hdr-a').textContent = `Team ${tA?.name||'A'}`;
    document.getElementById('ftc-psm-hdr-b').textContent = `Team ${tB?.name||'B'}`;
    document.getElementById('ftc-playoff-scores-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    ftcRefreshPlayoffMatchModal(scheduleId);
  };

  window.ftcClosePlayoffScoresModal = () => {
    document.getElementById('ftc-playoff-scores-modal').style.display = 'none';
    _ftcPlayoffScoresModalScheduleId = null;
    document.body.style.overflow = '';
  };

  window.ftcRefreshPlayoffMatchModal = (scheduleId) => {
    if (!scheduleId) scheduleId = _ftcPlayoffScoresModalScheduleId;
    if (!scheduleId) return;
    const sidNum = parseInt(scheduleId, 10);
    const sched  = ftcPlayoffSchedule.find(s => parseInt(s.id,10) === sidNum);
    if (!sched) return;
    const tA = ftcTeams.find(t => t.id === sched.team_a_id);
    const tB = ftcTeams.find(t => t.id === sched.team_b_id);
    const sid = parseInt(scheduleId, 10);
    const matches = ftcPlayoffMatches.filter(m => parseInt(m.schedule_id,10) === sid && !m.is_tiebreaker);
    const winsA   = matches.filter(m => m.status==='completed' && m.winner_team_id===sched.team_a_id).length;
    const winsB   = matches.filter(m => m.status==='completed' && m.winner_team_id===sched.team_b_id).length;

    // Update column headers with team names
    const hdrA = document.getElementById('ftc-psm-hdr-a');
    const hdrB = document.getElementById('ftc-psm-hdr-b');
    if (hdrA) hdrA.textContent = `Team ${tA?.name||'A'}`;
    if (hdrB) hdrB.textContent = `Team ${tB?.name||'B'}`;

    // Match type config
    const typeOrder = ['mens','womens','mixed1','mixed2'];
    const typeLabels  = { mens:"Men's Doubles", womens:"Women's Doubles", mixed1:'Mixed #1', mixed2:'Mixed #2' };
    const typeBadgeBg = { mens:'#EEF2FF', womens:'#FFF0EC', mixed1:'#EDFAF6', mixed2:'#F3EEFF' };
    const typeBadgeClr= { mens:'#174CCC', womens:'#E8501A', mixed1:'#0D9E73', mixed2:'#7B35D9' };

    const pName = (id) => {
      if (!id) return null;
      const p = ladderPlayers.find(x => x.id === id);
      return p ? `${p.first_name} ${p.last_name}` : null;
    };

    // Build score input box HTML
    const scoreBox = (val, inputId) => {
      const display = val !== null && val !== undefined ? String(val) : '--';
      return `<div style="display:flex;flex-direction:column;align-items:center;">
        <div style="display:flex;align-items:center;border:1.5px solid #e0e7f5;border-radius:8px;overflow:hidden;background:white;">
          <input id="${inputId}" type="number" min="0" max="99" value="${val!==null&&val!==undefined?val:''}" placeholder="--"
            style="width:48px;height:36px;border:none;outline:none;text-align:center;font-family:'Montserrat',sans-serif;font-size:18px;font-weight:700;color:#0d1f4a;background:transparent;padding:0;"
            oninput="ftcPsmScoreChange('${inputId}')">
          <div style="display:flex;flex-direction:column;border-left:1px solid #e0e7f5;">
            <button onclick="ftcPsmIncrement('${inputId}',1)" style="width:20px;height:18px;border:none;background:white;cursor:pointer;font-size:9px;color:#6b7a99;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #e0e7f5;">▲</button>
            <button onclick="ftcPsmIncrement('${inputId}',-1)" style="width:20px;height:18px;border:none;background:white;cursor:pointer;font-size:9px;color:#6b7a99;display:flex;align-items:center;justify-content:center;">▼</button>
          </div>
        </div>
      </div>`;
    };

    // Render each row
    const rowsHtml = typeOrder.map((mt, idx) => {
      const m = matches.find(x => x.match_type === mt);
      const num = idx + 1;
      const scored = m && m.score_a !== null && m.score_b !== null;
      const aWins  = scored && m.score_a > m.score_b;
      const bWins  = scored && m.score_b > m.score_a;
      const winnerName = aWins ? (tA?.name||'Team A') : bWins ? (tB?.name||'Team B') : null;
      const p1A = pName(m?.team_a_p1_id); const p2A = pName(m?.team_a_p2_id);
      const p1B = pName(m?.team_b_p1_id); const p2B = pName(m?.team_b_p2_id);
      const idA = `psm-score-${m?.id||mt}-a`;
      const idB = `psm-score-${m?.id||mt}-b`;

      return `<div style="display:grid;grid-template-columns:160px 1fr 220px 1fr 150px;align-items:center;padding:16px 16px;border-bottom:1px solid #e0e7f5;" data-match-id="${m?.id||''}" data-mt="${mt}">
        <!-- Match number + type badge -->
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:12px;font-weight:800;color:#6b7a99;min-width:16px;">${num}</span>
          <span style="font-size:10px;font-weight:700;padding:4px 10px;border-radius:99px;background:${typeBadgeBg[mt]};color:${typeBadgeClr[mt]};text-transform:uppercase;letter-spacing:.3px;">${typeLabels[mt]}</span>
        </div>
        <!-- Team A players -->
        <div>
          <div style="font-size:13px;font-weight:700;color:#0d1f4a;line-height:1.5;">${p1A||'TBD'}<br>${p2A||'TBD'}</div>
          <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span style="font-size:10px;font-weight:600;color:#6b7a99;">${esc(tA?.name||'Team A')}</span>
          </div>
        </div>
        <!-- Score inputs + winner -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:5px;">
          <div style="display:flex;align-items:center;gap:8px;">
            ${scoreBox(m?.score_a??null, idA)}
            <span style="font-size:11px;font-weight:600;color:#9aa5b8;">vs</span>
            ${scoreBox(m?.score_b??null, idB)}
          </div>
          ${winnerName
            ? `<div style="display:flex;align-items:center;gap:4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style="font-size:11px;font-weight:600;color:#24BC96;">${esc(winnerName)} wins</span>
               </div>`
            : `<div style="display:flex;align-items:center;gap:4px;opacity:.5;">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span style="font-size:10px;color:#6b7a99;">Not played yet</span>
               </div>`}
        </div>
        <!-- Team B players -->
        <div>
          <div style="font-size:13px;font-weight:700;color:#0d1f4a;line-height:1.5;">${p1B||'TBD'}<br>${p2B||'TBD'}</div>
          <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span style="font-size:10px;font-weight:600;color:#6b7a99;">${esc(tB?.name||'Team B')}</span>
          </div>
        </div>
        <!-- Actions -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
          <button onclick="ftcPsmSaveScore('${m?.id||''}','${mt}',${sidNum})"
            style="display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border:none;border-radius:8px;background:#174CCC;color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Save Score
          </button>
          <button onclick="ftcPsmClearScore('${m?.id||''}','${mt}',${sidNum})"
            style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:none;background:transparent;color:#6b7a99;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;cursor:pointer;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            Clear
          </button>
        </div>
      </div>`;
    }).join('');

    // Tiebreaker row (row 5)
    const tbMatch = ftcPlayoffMatches.find(m => parseInt(m.schedule_id,10) === sid && m.is_tiebreaker);
    const need22  = winsA === 2 && winsB === 2;
    const tbIdA   = `psm-score-tb-a`;
    const tbIdB   = `psm-score-tb-b`;
    const tbScored = tbMatch && tbMatch.score_a !== null;
    const tbWinnerName = tbScored ? (tbMatch.score_a>tbMatch.score_b ? tA?.name : tB?.name) : null;

    const tieRow = `<div style="display:grid;grid-template-columns:160px 1fr 220px 1fr 150px;align-items:center;padding:16px 16px;background:${need22?'white':'#fafbff'};" data-mt="tiebreaker">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:12px;font-weight:800;color:#6b7a99;min-width:16px;">5</span>
        <div>
          <span style="font-size:9px;font-weight:800;padding:4px 10px;border-radius:99px;border:1px solid #7B35D9;color:#7B35D9;text-transform:uppercase;letter-spacing:.3px;display:inline-block;">Tie-Breaker</span>
          <div style="font-size:9px;font-weight:600;color:#9aa5b8;margin-top:2px;">(If Needed)</div>
        </div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:${need22?'#0d1f4a':'#b0bbd6'};line-height:1.5;">TBD<br>&nbsp;</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span style="font-size:10px;font-weight:600;color:#6b7a99;">${esc(tA?.name||'Team A')}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:5px;">
        <div style="display:flex;align-items:center;gap:8px;">
          ${scoreBox(tbScored?tbMatch.score_a:null, tbIdA)}
          <span style="font-size:11px;font-weight:600;color:#9aa5b8;">vs</span>
          ${scoreBox(tbScored?tbMatch.score_b:null, tbIdB)}
        </div>
        ${tbWinnerName
          ? `<div style="display:flex;align-items:center;gap:4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#24BC96" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style="font-size:11px;font-weight:600;color:#24BC96;">${esc(tbWinnerName)} wins</span>
             </div>`
          : `<div style="display:flex;align-items:center;gap:4px;opacity:.5;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span style="font-size:10px;color:#6b7a99;">Not played yet</span>
             </div>`}
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:${need22?'#0d1f4a':'#b0bbd6'};line-height:1.5;">TBD<br>&nbsp;</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:4px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span style="font-size:10px;font-weight:600;color:#6b7a99;">${esc(tB?.name||'Team B')}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
        <button onclick="${need22?`ftcPsmSaveTiebreaker(${sidNum},${sched.team_a_id},${sched.team_b_id})`:'void(0)'}"
          style="display:inline-flex;align-items:center;gap:5px;padding:8px 16px;border:none;border-radius:8px;background:${need22?'#174CCC':'#e0e7f5'};color:${need22?'white':'#b0bbd6'};font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:${need22?'pointer':'not-allowed'};white-space:nowrap;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Save Score
        </button>
        ${tbScored?`<button onclick="ftcPsmClearScore('${tbMatch.id}','tiebreaker',${sidNum})" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:none;background:transparent;color:#6b7a99;font-family:'Montserrat',sans-serif;font-size:11px;font-weight:600;cursor:pointer;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>Clear</button>`:''}
      </div>
    </div>`;

    const rowsEl = document.getElementById('ftc-psm-rows');
    if (rowsEl) rowsEl.innerHTML = rowsHtml + tieRow;
  };


  // ── Playoff score modal helper functions ─────────────────────────────────
  window.ftcPsmIncrement = (inputId, delta) => {
    const el = document.getElementById(inputId);
    if (!el) return;
    const cur = parseInt(el.value, 10) || 0;
    el.value = Math.max(0, cur + delta);
    ftcPsmScoreChange(inputId);
  };

  window.ftcPsmScoreChange = (inputId) => {
    // Auto-show winner text — handled by ftcRefreshPlayoffMatchModal after save
    // Nothing needed here; just keeps input live
  };

  window.ftcPsmSaveScore = async (matchId, mt, scheduleId) => {
    const idA = `psm-score-${matchId||mt}-a`;
    const idB = `psm-score-${matchId||mt}-b`;
    const scoreA = parseInt(document.getElementById(idA)?.value, 10);
    const scoreB = parseInt(document.getElementById(idB)?.value, 10);
    if (isNaN(scoreA) || isNaN(scoreB)) { toast('Enter scores for both teams.', true); return; }
    if (scoreA === scoreB) { toast('Scores cannot be equal — use tiebreaker.', true); return; }
    const m = ftcPlayoffMatches.find(x => String(x.id) === String(matchId));
    if (!m) { toast('Match not found.', true); return; }
    const aWins = scoreA > scoreB;
    const pts   = ftcLeaguePts(scoreA, scoreB);
    try {
      await api(`ftc_ladder_matches?id=eq.${m.id}`, 'PATCH', {
        score_a: scoreA, score_b: scoreB,
        league_pts_a: pts.a, league_pts_b: pts.b,
        winner_team_id: aWins ? m.team_a_id : m.team_b_id,
        status: 'completed',
      });
      // Update local state
      const idx = ftcPlayoffMatches.findIndex(x => x.id === m.id);
      if (idx >= 0) Object.assign(ftcPlayoffMatches[idx], {
        score_a: scoreA, score_b: scoreB,
        league_pts_a: pts.a, league_pts_b: pts.b,
        winner_team_id: aWins ? m.team_a_id : m.team_b_id,
        status: 'completed',
      });
      toast('Score saved!');
      ftcRefreshPlayoffMatchModal(scheduleId);
      await ftcCheckAndUpdatePlayoffMatchupStatus(scheduleId);
      renderFtcBracket();
    } catch(err) { toast(`Error: ${err.message}`, true); }
  };

  window.ftcPsmClearScore = async (matchId, mt, scheduleId) => {
    const m = ftcPlayoffMatches.find(x => String(x.id) === String(matchId));
    if (!m) return;
    try {
      await api(`ftc_ladder_matches?id=eq.${m.id}`, 'PATCH', {
        score_a: null, score_b: null,
        league_pts_a: 0, league_pts_b: 0,
        winner_team_id: null, status: 'scheduled',
      });
      const idx = ftcPlayoffMatches.findIndex(x => x.id === m.id);
      if (idx >= 0) Object.assign(ftcPlayoffMatches[idx], {
        score_a: null, score_b: null, league_pts_a: 0, league_pts_b: 0,
        winner_team_id: null, status: 'scheduled',
      });
      toast('Score cleared.');
      ftcRefreshPlayoffMatchModal(scheduleId);
      renderFtcBracket();
    } catch(err) { toast(`Error: ${err.message}`, true); }
  };

  window.ftcPsmSaveTiebreaker = async (scheduleId, teamAId, teamBId) => {
    const scoreA = parseInt(document.getElementById('psm-score-tb-a')?.value, 10);
    const scoreB = parseInt(document.getElementById('psm-score-tb-b')?.value, 10);
    if (isNaN(scoreA) || isNaN(scoreB)) { toast('Enter tiebreaker scores.', true); return; }
    if (scoreA === scoreB) { toast('Tiebreaker cannot end in a tie.', true); return; }
    const sched = ftcPlayoffSchedule.find(s => parseInt(s.id,10) === parseInt(scheduleId,10));
    if (!sched) return;
    const winnerId = scoreA > scoreB ? teamAId : teamBId;
    const tieType  = document.getElementById('ftc-tie-type')?.value || 'dreambreaker';
    try {
      await api('ftc_ladder_matches', 'POST', {
        schedule_id: scheduleId, ladder_id: currentLadder.id,
        match_type: 'tiebreaker', team_a_id: teamAId, team_b_id: teamBId,
        score_a: scoreA, score_b: scoreB,
        league_pts_a: ftcLeaguePts(scoreA,scoreB).a, league_pts_b: ftcLeaguePts(scoreA,scoreB).b,
        winner_team_id: winnerId, tiebreaker_type: tieType,
        is_tiebreaker: true, status: 'completed',
      });
      // Reload matches
      const psIds = ftcPlayoffSchedule.map(s => s.id);
      ftcPlayoffMatches = psIds.length
        ? await api(`ftc_ladder_matches?schedule_id=in.(${psIds.join(',')})&select=*&order=schedule_id,match_type`)
        : [];
      // Mark schedule complete
      await api(`ftc_ladder_schedule?id=eq.${scheduleId}`, 'PATCH', { status:'completed' });
      const si = ftcPlayoffSchedule.findIndex(s => parseInt(s.id,10)===parseInt(scheduleId,10));
      if (si >= 0) ftcPlayoffSchedule[si].status = 'completed';
      await ftcAdvancePlayoffWinner(sched, winnerId, scoreA>scoreB?sched.seed_a:sched.seed_b);
      toast('Tiebreaker saved!');
      ftcRefreshPlayoffMatchModal(scheduleId);
      renderFtcBracket();
    } catch(err) { toast(`Error: ${err.message}`, true); }
  };

  // ── Check playoff matchup status and advance bracket ─────────────────────
  const ftcCheckAndUpdatePlayoffMatchupStatus = async (scheduleId) => {
    const sched = ftcPlayoffSchedule.find(s => s.id === scheduleId);
    if (!sched) return;
    const slotMatches = ftcPlayoffMatches.filter(m => m.schedule_id === scheduleId && !m.is_tiebreaker);
    if (slotMatches.length < 4 || !slotMatches.every(m => m.status === 'completed')) return;
    const winsA = slotMatches.filter(m => m.winner_team_id === sched.team_a_id).length;
    const winsB = slotMatches.filter(m => m.winner_team_id === sched.team_b_id).length;
    if (winsA === 2 && winsB === 2) {
      setTimeout(() => ftcOpenTiebreakerModal(scheduleId, sched.team_a_id, sched.team_b_id), 300);
      return;
    }
    const winnerId = winsA > winsB ? sched.team_a_id : sched.team_b_id;
    const winnerSeed = winsA > winsB ? sched.seed_a : sched.seed_b;
    try {
      await api(`ftc_ladder_schedule?id=eq.${scheduleId}`, 'PATCH', { status:'completed' });
      const si = ftcPlayoffSchedule.findIndex(s => s.id === scheduleId);
      if (si >= 0) ftcPlayoffSchedule[si].status = 'completed';
      // Advance winner to next round
      await ftcAdvancePlayoffWinner(sched, winnerId, winnerSeed);
    } catch(e) { toast(`Error: ${e.message}`, true); }
  };

  const ftcAdvancePlayoffWinner = async (completedSched, winnerId, winnerSeed) => {
    const round = completedSched.playoff_round;
    const matchNum = completedSched.playoff_match_num;
    let nextRound = null, teamSlot = null;
    if (round === 'quarterfinal') { nextRound = 'semifinal'; teamSlot = matchNum === 1 ? 'b' : 'b'; }
    else if (round === 'semifinal') { nextRound = 'final'; teamSlot = matchNum === 1 ? 'a' : 'b'; }
    if (!nextRound) return;
    const nextSched = ftcPlayoffSchedule.find(s => s.playoff_round === nextRound &&
      (nextRound === 'final' ? (teamSlot === 'a' ? !s.team_a_id : !s.team_b_id) : s.playoff_match_num === matchNum));
    if (!nextSched) return;
    const patch = teamSlot === 'a'
      ? { team_a_id: winnerId, seed_a: winnerSeed }
      : { team_b_id: winnerId, seed_b: winnerSeed };
    await api(`ftc_ladder_schedule?id=eq.${nextSched.id}`, 'PATCH', patch);
    const ni = ftcPlayoffSchedule.findIndex(s => s.id === nextSched.id);
    if (ni >= 0) Object.assign(ftcPlayoffSchedule[ni], patch);
    // Create match rows for next round if both teams now known
    const updated = ftcPlayoffSchedule.find(s => s.id === nextSched.id);
    if (updated?.team_a_id && updated?.team_b_id) {
      const typeOrder = ['mens','womens','mixed1','mixed2'];
      const tA = ftcTeams.find(t => t.id === updated.team_a_id);
      const tB = ftcTeams.find(t => t.id === updated.team_b_id);
      const newMatches = typeOrder.map(mt => ({
        schedule_id: updated.id, ladder_id: currentLadder.id, match_type: mt,
        team_a_id: updated.team_a_id, team_b_id: updated.team_b_id,
        team_a_p1_id: mt==='mens'?tA?.m1_id:mt==='womens'?tA?.f1_id:mt==='mixed1'?tA?.mixed1_ma_id:tA?.mixed2_ma_id,
        team_a_p2_id: mt==='mens'?tA?.m2_id:mt==='womens'?tA?.f2_id:mt==='mixed1'?tA?.mixed1_fa_id:tA?.mixed2_fa_id,
        team_b_p1_id: mt==='mens'?tB?.m1_id:mt==='womens'?tB?.f1_id:mt==='mixed1'?tB?.mixed1_ma_id:tB?.mixed2_ma_id,
        team_b_p2_id: mt==='mens'?tB?.m2_id:mt==='womens'?tB?.f2_id:mt==='mixed1'?tB?.mixed1_fa_id:tB?.mixed2_fa_id,
        status: 'scheduled',
      }));
      const created = await api('ftc_ladder_matches', 'POST', newMatches);
      const arr = Array.isArray(created) ? created : [created];
      ftcPlayoffMatches.push(...arr);
    }
  };

  /* ─── FTC LADDER — PHASE 3: SCHEDULE GENERATION ─────────── */

  let ftcSchedule = []; // loaded schedule rows from DB
  let ftcMatches  = []; // loaded individual matches (ftc_ladder_matches)

  // ── Round-robin schedule algorithm (circle method) ────────────────────
  // Returns array of rounds, each round is array of {teamA, teamB} or {teamA, bye:true}
  const ftcGenerateRoundRobin = (teams, totalWeeks) => {
    const n = teams.length;
    if (n < 2) return [];

    // For odd number of teams, add a dummy bye team
    const list = n % 2 === 0 ? [...teams] : [...teams, null];
    const size  = list.length;
    const rounds = [];

    for (let r = 0; r < size - 1; r++) {
      const round = [];
      for (let i = 0; i < size / 2; i++) {
        const home = list[i];
        const away = list[size - 1 - i];
        if (home === null || away === null) {
          // bye — the non-null team sits out
          const realTeam = home !== null ? home : away;
          round.push({ teamA: realTeam, teamB: null, bye: true });
        } else {
          round.push({ teamA: home, teamB: away, bye: false });
        }
      }
      rounds.push(round);
      // Rotate all except first element
      const last = list.splice(size - 1, 1)[0];
      list.splice(1, 0, last);
    }

    // If totalWeeks > rounds.length, repeat the schedule
    const result = [];
    let weekNum = 1;
    while (result.length < totalWeeks) {
      const round = rounds[result.length % rounds.length];
      result.push({ week: weekNum++, matchups: round });
    }
    return result.slice(0, totalWeeks);
  };

  // ── Get the next occurrence of a weekday from a start date ───────────
  const ftcNextWeekday = (startDateStr, targetDay) => {
    const d = new Date(startDateStr + 'T00:00:00');
    const current = d.getDay();
    const diff = (targetDay - current + 7) % 7;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  };

  // ── Add weeks to a date ───────────────────────────────────────────────
  const ftcAddWeeks = (dateStr, weeks) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + weeks * 7);
    return d.toISOString().slice(0, 10);
  };

  // ── Format date for display ───────────────────────────────────────────
  const ftcFmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  };

  // ── Load schedule page ────────────────────────────────────────────────
  // Team color palette for shields
  const FTC_TEAM_COLORS = ['#174CCC','#F26024','#24BC96','#9a6e00','#7B2FBE','#C04A0E','#085041','#B91C1C'];
  const FTC_COURT_COLORS = ['#174CCC','#24BC96','#F26024','#9a6e00','#7B2FBE'];

  const ftcTeamInitials = (name) => {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0,2).toUpperCase();
  };

  const ftcTeamColor = (teamId) => {
    const idx = ftcTeams.findIndex(t => t.id === teamId);
    return FTC_TEAM_COLORS[idx >= 0 ? idx % FTC_TEAM_COLORS.length : 0];
  };

  // Auto-set day of week when start date is picked
  window.ftcAutoSetDay = (dateStr) => {
    if (!dateStr) return;
    const d = new Date(dateStr + 'T00:00:00');
    const dayEl = document.getElementById('ftc-sch-day');
    if (dayEl) dayEl.value = String(d.getDay()); // 0=Sun … 6=Sat
    ftcUpdateSchStats();
  };

  window.ftcUpdateSchStats = () => {
    const n = ftcTeams.length;
    const weeks = document.getElementById('ftc-sch-weeks')?.value || '6';
    const court = document.getElementById('ftc-sch-court')?.value?.trim() || '—';
    const teamsEl = document.getElementById('ftc-sch-stat-teams');
    const teamsSubEl = document.getElementById('ftc-sch-stat-teams-sub');
    const weeksEl = document.getElementById('ftc-sch-stat-weeks');
    const courtsEl = document.getElementById('ftc-sch-stat-courts');
    if (teamsEl) teamsEl.textContent = n;
    if (teamsSubEl) teamsSubEl.textContent = n % 2 === 0 ? 'All teams play each week' : '1 team gets a bye each week';
    if (weeksEl) weeksEl.textContent = `${weeks} weeks`;
    if (courtsEl) courtsEl.textContent = court || '—';
    const countEl = document.getElementById('ftc-sch-team-count');
    if (countEl) {
      if (n < 2) {
        countEl.innerHTML = '⚠ Register at least 2 teams before generating a schedule.';
        countEl.style.color = 'var(--orange)';
      } else {
        countEl.innerHTML = `${n} teams registered &nbsp;•&nbsp; ${n%2===0?'All teams play each week':'1 team gets a bye each week'} &nbsp;•&nbsp; Matches are automatically balanced`;
        countEl.style.color = '#174CCC';
      }
    }
  };

  const loadFtcSchedule = async () => {
    if (!currentLadder) return;
    // Set page title (Bebas Neue, same as RP ladder pages)
    const schTitleEl = document.getElementById('ftc-schedule-title');
    if (schTitleEl) {
      schTitleEl.textContent = currentLadder.name || '';
      schTitleEl.style.display = 'block';
    }
    // Reset preview card — hide it on every fresh load
    const previewCard = document.getElementById('ftc-sch-preview-card');
    const previewWeeks = document.getElementById('ftc-preview-weeks');
    if (previewCard)  previewCard.style.display = 'none';
    if (previewWeeks) previewWeeks.innerHTML = '';
    // Ensure ftcTeams is loaded — may be empty if navigating directly to Schedule tab
    if (!ftcTeams.length) {
      try {
        ftcTeams = await api(
          `ftc_ladder_teams?ladder_id=eq.${currentLadder.id}&select=*&order=id`
        );
      } catch (e) { /* non-fatal */ }
    }
    // Pre-fill start date from ladder start_date, then auto-set day of week
    const startEl = document.getElementById('ftc-sch-start-date');
    if (startEl && !startEl.value && currentLadder.start_date) {
      startEl.value = currentLadder.start_date;
    }
    // Always sync day of week to whatever start date is set
    if (startEl && startEl.value) {
      ftcAutoSetDay(startEl.value);
    }
    ftcUpdateSchStats();
    const el = document.getElementById('ftc-schedule-list');
    el.style.display = '';
    el.innerHTML = '<div class="loading">Loading schedule...</div>';
    try {
      ftcSchedule = await api(
        `ftc_ladder_schedule?ladder_id=eq.${currentLadder.id}&select=*&order=week_number,id`
      );
      // Also fetch all individual matches for this ladder
      ftcMatches = await api(
        `ftc_ladder_matches?ladder_id=eq.${currentLadder.id}&select=*&order=schedule_id,match_type`
      );
      // Toggle delete/generate/preview buttons based on whether schedule exists
      const _delBtn  = document.getElementById('ftc-delete-schedule-btn');
      const _genBtn  = document.getElementById('ftc-generate-schedule-btn');
      const _prevBtn = document.querySelector('button[onclick="ftcPreviewSchedule()"]');
      if (ftcSchedule.length > 0) {
        if (_delBtn)  _delBtn.style.display  = 'inline-flex';
        if (_genBtn)  _genBtn.style.display  = 'none';
        if (_prevBtn) _prevBtn.style.display = 'none';
      } else {
        if (_delBtn)  _delBtn.style.display  = 'none';
        if (_genBtn)  _genBtn.style.display  = 'inline-flex';
        if (_prevBtn) _prevBtn.style.display = 'inline-flex';
      }
      renderFtcSchedule();
    } catch (err) {
      el.innerHTML = `<div class="error">Error: ${esc(err.message)}</div>`;
    }
  };

  // ── Preview schedule — table layout per week (accordion) ──────────────
  window.ftcPreviewSchedule = () => {
    if (ftcTeams.length < 2) {
      toast('Register at least 2 teams before generating a schedule.', true);
      return;
    }
    const weeks     = parseInt(document.getElementById('ftc-sch-weeks')?.value || '6', 10);
    const startDate = document.getElementById('ftc-sch-start-date')?.value;
    const targetDay = parseInt(document.getElementById('ftc-sch-day')?.value || '6', 10);
    if (!startDate) { toast('Please select a start date.', true); return; }

    ftcUpdateSchStats();
    const firstMatchDate = ftcNextWeekday(startDate, targetDay);
    const rounds         = ftcGenerateRoundRobin(ftcTeams, weeks);

    const courtStr = document.getElementById('ftc-sch-court')?.value?.trim() || '';
    const courts   = courtStr ? courtStr.split(',').map(c => c.trim()).filter(Boolean) : [];

    // Update preview card header
    const titleTxt = document.getElementById('ftc-preview-title-txt');
    if (titleTxt) titleTxt.textContent = 'SEASON PREVIEW';

    // Court legend
    const legendEl = document.getElementById('ftc-preview-legend');
    if (legendEl) {
      legendEl.innerHTML = courts.map((c, i) =>
        `<div class="ftc-legend-item"><span class="ftc-ldot" style="background:${FTC_COURT_COLORS[i%FTC_COURT_COLORS.length]};"></span>Court ${esc(c)}</div>`
      ).join('');
    }

    const tName = (t) => t ? esc(t.name || `Team ${ftcTeams.indexOf(t)+1}`) : '—';

    let weeksHtml = `<div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;padding:20px 24px;box-shadow:0 1px 4px rgba(23,76,204,0.06);">
      <div style="font-size:16px;font-weight:800;color:#0d1f4a;margin-bottom:4px;">Season Preview</div>
      <div style="font-size:11px;font-weight:600;color:#6b7a99;margin-bottom:16px;">Review your season schedule. Click any week to see matchups.</div>`;

    rounds.forEach((round, i) => {
      const date    = ftcAddWeeks(firstMatchDate, i);
      const dateStr = ftcFmtDate(date);
      const isFirst = i === 0;
      const matchups = round.matchups.filter(m => !m.bye);
      const byes     = round.matchups.filter(m => m.bye);
      const byeText  = byes.length ? byes.map(b => tName(b.teamA)).join(', ') : null;
      // "Complete by" = date of next week
      const completeByDate = ftcFmtDate(ftcAddWeeks(firstMatchDate, i + 1));

      weeksHtml += `<div style="border:0.5px solid #e0e7f5;border-radius:10px;margin-bottom:8px;background:white;">
        <!-- Week header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;background:white;"
          onclick="ftcPrvToggleWeek(${round.week})">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:22px;height:22px;border-radius:50%;background:#174CCC;color:white;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${round.week}</span>
            <div>
              <div style="font-size:12px;font-weight:800;color:#0d1f4a;display:flex;align-items:center;gap:6px;">
                Week ${round.week}
                <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;background:#e8f0ff;color:#174CCC;">Scheduled</span>
                ${byeText ? `<span style="font-size:9px;font-weight:700;color:#F26024;">BYE: ${byeText}</span>` : ''}
              </div>
              <div style="font-size:10px;font-weight:600;color:#6b7a99;margin-top:1px;">${dateStr} &nbsp;·&nbsp; ${matchups.length} matchup${matchups.length!==1?'s':''}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:600;color:#24BC96;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Complete by ${completeByDate}
            </div>
            <span id="ftc-prv-chevron-${round.week}" style="font-size:11px;color:#6b7a99;transition:transform .2s;display:inline-block;transform:${isFirst?'rotate(180deg)':'rotate(0deg)'};">▼</span>
          </div>
        </div>

        <!-- Week body -->
        <div id="ftc-prv-week-${round.week}" style="display:${isFirst?'block':'none'};">
          <!-- Table header -->
          <div style="display:grid;grid-template-columns:minmax(180px,1fr) 85px 110px 160px 110px;gap:16px;padding:6px 16px;background:#f8f9ff;border-top:0.5px solid #e0e7f5;border-bottom:0.5px solid #e0e7f5;">
            <div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;">Matchup</div>
            <div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;">Time</div>
            <div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;">Courts</div>
            <div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;">Matches</div>
            <div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;">Status</div>
          </div>
          <!-- Matchup rows -->
          ${matchups.map((m, mi) => {
            const c1idx  = mi * (courts.length >= 2 ? 2 : 1);
            const c2idx  = c1idx + 1;
            const court1 = courts[c1idx] || courts[c1idx % Math.max(courts.length,1)] || '—';
            const court2 = courts.length >= 2 ? (courts[c2idx] || courts[c2idx % courts.length] || '—') : null;
            const courtDisplay = court2 ? `${court1} – ${court2}` : court1;
            const time   = document.getElementById('ftc-sch-time')?.value || '';
            const timeDisplay = time ? fmtTime12(time) : '—';

            return `<div style="display:grid;grid-template-columns:minmax(180px,1fr) 85px 110px 160px 110px;gap:16px;padding:10px 16px;border-bottom:0.5px solid #f4f5f8;align-items:center;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:13px;font-weight:800;color:#0d1f4a;">${tName(m.teamA)}</span>
                <span style="font-size:9px;font-weight:700;color:#b0bbd6;background:#f0f2f8;padding:2px 6px;border-radius:99px;">vs</span>
                <span style="font-size:13px;font-weight:800;color:#0d1f4a;">${tName(m.teamB)}</span>
              </div>
              <div style="font-size:11px;font-weight:600;color:#6b7a99;">${timeDisplay}</div>
              <div style="font-size:11px;font-weight:600;color:#6b7a99;">${courtDisplay}</div>
              <div style="display:flex;align-items:center;gap:5px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                <span style="font-size:11px;font-weight:700;color:#6b7a99;">4</span>
                <span style="font-size:10px;font-weight:600;color:#b0bbd6;">MD, WD, MX1, MX2</span>
              </div>
              <div><span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:99px;background:#e8f0ff;color:#174CCC;">Scheduled</span></div>
            </div>`;
          }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    });

    weeksHtml += '</div>'; // close white card
    const weeksEl = document.getElementById('ftc-preview-weeks');
    if (weeksEl) weeksEl.innerHTML = weeksHtml;

    const card = document.getElementById('ftc-sch-preview-card');
    if (card) card.style.display = 'block';

    const schedEl = document.getElementById('ftc-schedule-list');
    if (schedEl) schedEl.style.display = 'none';
  };

  window.ftcPrvToggleWeek = (week) => {
    const body = document.getElementById(`ftc-prv-week-${week}`);
    const chev = document.getElementById(`ftc-prv-chevron-${week}`);
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    // Collapse all other open preview weeks first
    if (!isOpen) {
      document.querySelectorAll('[id^="ftc-prv-week-"]').forEach(el => {
        if (el.id !== `ftc-prv-week-${week}` && el.style.display !== 'none') {
          el.style.display = 'none';
          const wn = el.id.replace('ftc-prv-week-', '');
          const c = document.getElementById(`ftc-prv-chevron-${wn}`);
          if (c) c.style.transform = 'rotate(0deg)';
        }
      });
    }
    body.style.display = isOpen ? 'none' : 'block';
    if (chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  };
  // ── Create matches for existing schedule (no matches yet) ───────────────
  window.ftcGenerateMatchesForSchedule = async () => {
    if (!currentLadder || !ftcTeams.length) return;
    try {
      const scheduleRows = await api(
        `ftc_ladder_schedule?ladder_id=eq.${currentLadder.id}&select=id,team_a_id,team_b_id,is_bye,court&order=week_number,id`
      );
      const matchTypes = ['mens','womens','mixed1','mixed2'];
      const matchRows  = [];
      scheduleRows.filter(s => !s.is_bye).forEach(s => {
        const tA = ftcTeams.find(t => t.id === s.team_a_id);
        const tB = ftcTeams.find(t => t.id === s.team_b_id);
        if (!tA || !tB) return;
        const courtParts = s.court ? s.court.split(',').map(c => c.trim()) : [];
        const court1 = courtParts[0] || null;
        const court2 = courtParts[1] || court1;
        const assignments = {
          mens:   { ap1: tA.m1_id,       ap2: tA.m2_id,       bp1: tB.m1_id,       bp2: tB.m2_id,       court: court1 },
          womens: { ap1: tA.f1_id,        ap2: tA.f2_id,        bp1: tB.f1_id,        bp2: tB.f2_id,        court: court2 },
          mixed1: { ap1: tA.mixed1_ma_id, ap2: tA.mixed1_fa_id, bp1: tB.mixed1_ma_id, bp2: tB.mixed1_fa_id, court: court1 },
          mixed2: { ap1: tA.mixed2_ma_id, ap2: tA.mixed2_fa_id, bp1: tB.mixed2_ma_id, bp2: tB.mixed2_fa_id, court: court2 },
        };
        matchTypes.forEach(type => {
          const a = assignments[type];
          matchRows.push({
            schedule_id: s.id, ladder_id: currentLadder.id, match_type: type,
            team_a_id: s.team_a_id, team_b_id: s.team_b_id,
            team_a_p1_id: a.ap1||null, team_a_p2_id: a.ap2||null,
            team_b_p1_id: a.bp1||null, team_b_p2_id: a.bp2||null,
            court: a.court, status: 'pending',
          });
        });
      });
      if (matchRows.length) {
        await api('ftc_ladder_matches', 'POST', matchRows);
        toast(`${matchRows.length} individual matches created!`);
        await loadFtcSchedule();
      } else {
        toast('No matchups found to create matches for.', true);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  // ── Generate and save schedule to DB ─────────────────────────────────
  // ── Delete existing schedule ─────────────────────────────────────────
  window.ftcDeleteSchedule = async () => {
    const ok = await confirmModal({
      title:   'Delete schedule?',
      message: 'This will permanently delete the schedule and all individual match lineups. Match scores already recorded will also be lost. This cannot be undone.',
      confirm: 'Delete Schedule',
      danger:  true,
    });
    if (!ok) return;
    try {
      await api(`ftc_ladder_matches?ladder_id=eq.${currentLadder.id}`, 'DELETE');
      await api(`ftc_ladder_schedule?ladder_id=eq.${currentLadder.id}`, 'DELETE');
      ftcSchedule = [];
      ftcMatches  = [];
      toast('Schedule deleted. You can now generate a new one.');
      await loadFtcSchedule();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  window.ftcGenerateSchedule = async () => {
    if (ftcTeams.length < 2) {
      toast('Register at least 2 teams before generating a schedule.', true);
      return;
    }
    const weeks     = parseInt(document.getElementById('ftc-sch-weeks')?.value || '6', 10);
    const startDate = document.getElementById('ftc-sch-start-date')?.value;
    const targetDay = parseInt(document.getElementById('ftc-sch-day')?.value || '6', 10);
    const time      = document.getElementById('ftc-sch-time')?.value || null;
    const court     = document.getElementById('ftc-sch-court')?.value.trim() || null;
    if (!startDate) { toast('Please select a start date.', true); return; }

    // Block if schedule already exists — must delete manually to start over
    if (ftcSchedule.length > 0) {
      toast('A schedule already exists for this ladder. To start over, delete the existing schedule first.', true);
      return;
    }

    const firstMatchDate = ftcNextWeekday(startDate, targetDay);
    const rounds = ftcGenerateRoundRobin(ftcTeams, weeks);

    // Validate: no team should get a bye more than once across ALL weeks
    const byeCounts = {};
    rounds.forEach(round => {
      round.matchups.filter(m => m.bye).forEach(m => {
        const tid = m.teamA?.id;
        if (tid) byeCounts[tid] = (byeCounts[tid] || 0) + 1;
      });
    });
    const doubleBye = Object.entries(byeCounts).find(([,c]) => c > 1);
    if (doubleBye) {
      const team = ftcTeams.find(t => String(t.id) === doubleBye[0]);
      toast(`Schedule error: ${team?.name || 'A team'} was assigned a bye more than once. Please check team count and weeks.`, true);
      return;
    }

    const rows = [];
    rounds.forEach((round, i) => {
      const matchDate = ftcAddWeeks(firstMatchDate, i);
      round.matchups.forEach(m => {
        rows.push({
          ladder_id:   currentLadder.id,
          week_number: round.week,
          match_date:  matchDate,
          match_time:  time,
          court:       court,
          team_a_id:   m.teamA?.id || null,
          team_b_id:   m.bye ? null : (m.teamB?.id || null),
          is_bye:      m.bye,
          status:      'scheduled',
        });
      });
    });

    try {
      // Save schedule rows
      const savedSchedule = await api('ftc_ladder_schedule', 'POST', rows);

      // Fetch saved rows to get their IDs (Supabase returns inserted rows)
      const scheduleIds = await api(
        `ftc_ladder_schedule?ladder_id=eq.${currentLadder.id}&order=week_number,id&select=id,team_a_id,team_b_id,is_bye,court`
      );

      // Build ftc_ladder_matches (4 per non-bye matchup)
      const matchTypes = ['mens','womens','mixed1','mixed2'];
      const matchRows  = [];

      scheduleIds.filter(s => !s.is_bye).forEach(s => {
        const tA = ftcTeams.find(t => t.id === s.team_a_id);
        const tB = ftcTeams.find(t => t.id === s.team_b_id);
        if (!tA || !tB) return;

        // Determine courts from schedule court field (e.g. "19, 20")
        const courtParts = s.court ? s.court.split(',').map(c => c.trim()) : [];
        const court1 = courtParts[0] || null;
        const court2 = courtParts[1] || court1; // fall back to court1 if only one

        // Player assignments per match type
        const assignments = {
          mens:   { ap1: tA.m1_id,          ap2: tA.m2_id,          bp1: tB.m1_id,          bp2: tB.m2_id,          court: court1 },
          womens: { ap1: tA.f1_id,           ap2: tA.f2_id,           bp1: tB.f1_id,           bp2: tB.f2_id,           court: court2 },
          mixed1: { ap1: tA.mixed1_ma_id,     ap2: tA.mixed1_fa_id,    bp1: tB.mixed1_ma_id,    bp2: tB.mixed1_fa_id,    court: court1 },
          mixed2: { ap1: tA.mixed2_ma_id,     ap2: tA.mixed2_fa_id,    bp1: tB.mixed2_ma_id,    bp2: tB.mixed2_fa_id,    court: court2 },
        };

        matchTypes.forEach(type => {
          const a = assignments[type];
          matchRows.push({
            schedule_id:    s.id,
            ladder_id:      currentLadder.id,
            match_type:     type,
            team_a_id:      s.team_a_id,
            team_b_id:      s.team_b_id,
            team_a_p1_id:   a.ap1 || null,
            team_a_p2_id:   a.ap2 || null,
            team_b_p1_id:   a.bp1 || null,
            team_b_p2_id:   a.bp2 || null,
            court:          a.court,
            status:         'pending',
          });
        });
      });

      if (matchRows.length) {
        await api('ftc_ladder_matches', 'POST', matchRows);
      }

      const nonBye = scheduleIds.filter(s => !s.is_bye).length;
      toast(`Schedule generated — ${weeks} weeks, ${nonBye} matchups, ${matchRows.length} matches created!`);
      await loadFtcSchedule();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  // Match type display labels
  const FTC_MATCH_LABELS = {
    mens:   { label: "Men's Doubles",   abbr: 'MD',  color: '#174CCC', bg: '#e8f0ff' },
    womens: { label: "Women's Doubles", abbr: 'WD',  color: '#F26024', bg: 'rgba(242,96,36,0.08)' },
    mixed1: { label: 'Mixed #1',        abbr: 'MX1', color: '#24BC96', bg: 'rgba(36,188,150,0.08)' },
    mixed2: { label: 'Mixed #2',        abbr: 'MX2', color: '#9a6e00', bg: 'rgba(154,110,0,0.08)'  },
  };

  // ── Render schedule list — table layout per week (smart accordion) ───────
  const renderFtcSchedule = () => {
    const el = document.getElementById('ftc-schedule-list');
    if (!ftcSchedule.length) {
      el.innerHTML = `<div class="card" style="padding:40px 24px;text-align:center;">
        <div style="margin-bottom:14px;">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#b0bbd6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div style="font-size:14px;font-weight:800;color:#0d1f4a;margin-bottom:6px;">No schedule saved yet</div>
        <div style="font-size:11px;font-weight:600;color:#6b7a99;line-height:1.6;">Adjust your settings above and click "Generate &amp; Save"<br>to create and save your season schedule.</div>
      </div>`;
      return;
    }

    // Group by week — exclude playoff rows (week 99 / is_playoff)
    const byWeek = {};
    ftcSchedule.filter(s => !s.is_playoff && s.week_number !== 99).forEach(s => {
      if (!byWeek[s.week_number]) byWeek[s.week_number] = [];
      byWeek[s.week_number].push(s);
    });

    // Index matches by schedule_id
    const matchesBySchedule = {};
    ftcMatches.forEach(m => {
      if (!matchesBySchedule[m.schedule_id]) matchesBySchedule[m.schedule_id] = [];
      matchesBySchedule[m.schedule_id].push(m);
    });

    // If schedule exists but NO individual matches exist at all
    const nonByeSchedule = ftcSchedule.filter(s => !s.is_bye);
    const totalMatchRows  = nonByeSchedule.reduce((sum, s) => sum + (matchesBySchedule[s.id]?.length || 0), 0);
    if (nonByeSchedule.length > 0 && totalMatchRows === 0) {
      const totalWeeks = Object.keys(byWeek).length;
      el.innerHTML = `<div class="card" style="padding:28px 24px;text-align:center;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;margin-bottom:12px;opacity:0.4;"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div style="font-size:13px;font-weight:800;color:#0d1f4a;margin-bottom:6px;">Schedule ready — matches not yet created</div>
        <div style="font-size:11px;font-weight:600;color:#6b7a99;margin-bottom:16px;line-height:1.6;">
          ${totalWeeks} week${totalWeeks!==1?'s':''} scheduled. Click below to create the individual match lineups.
        </div>
        <button onclick="ftcGenerateMatchesForSchedule()" style="padding:9px 22px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3,#174CCC);color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          Create Match Lineups
        </button>
      </div>`;
      return;
    }

    const pName = (id) => {
      if (!id) return '<span style="color:#b0bbd6;">TBD</span>';
      const p = ladderPlayers.find(x => x.id === id);
      return p ? `${esc(p.first_name)} ${esc(p.last_name)}` : `Player #${id}`;
    };
    const teamName = (id) => {
      if (!id) return '<span style="color:#b0bbd6;">TBD</span>';
      const t = ftcTeams.find(x => x.id === id);
      return t ? esc(t.name || `Team ${ftcTeams.indexOf(t)+1}`) : `Team #${id}`;
    };

    const totalWeeks = Object.keys(byWeek).length;
    const completed  = ftcSchedule.filter(s => s.status === 'completed').length;

    // Determine current week = first week with at least one non-completed non-bye matchup
    const sortedWeekNums = Object.keys(byWeek).map(Number).sort((a,b) => a-b);
    let currentWeek = sortedWeekNums[0];
    for (const wn of sortedWeekNums) {
      const hasIncomplete = byWeek[wn].some(s => !s.is_bye && s.status !== 'completed');
      if (hasIncomplete) { currentWeek = wn; break; }
    }

    let html = `<div style="background:white;border:0.5px solid #e0e7f5;border-radius:12px;padding:20px 24px;box-shadow:0 1px 4px rgba(23,76,204,0.06);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="font-size:16px;font-weight:800;color:#0d1f4a;">Season Schedule</div>
        <div style="font-size:11px;font-weight:700;color:#6b7a99;">${totalWeeks} week${totalWeeks!==1?'s':''} · ${nonByeSchedule.length} matchups · ${completed} completed</div>
      </div>
      <div style="font-size:11px;font-weight:600;color:#6b7a99;margin-bottom:16px;">Review your season schedule. Click any week to see matchups.</div>`;

    sortedWeekNums.forEach(weekNum => {
      const matchups    = byWeek[weekNum];
      const isOpen      = weekNum === currentWeek;
      const firstDate   = matchups[0]?.match_date;
      const allDone     = matchups.every(m => m.status === 'completed');
      const anyDone     = matchups.some(m => m.status === 'completed');
      const nonByeCount = matchups.filter(m => !m.is_bye).length;

      // "Complete by" = date of next week's matchup (7 days later)
      const completeByDate = firstDate
        ? ftcFmtDate(ftcAddWeeks(firstDate, 1))
        : '—';

      const statusPill = allDone
        ? `<span class="ftc-status-pill ftc-status-completed">Complete</span>`
        : anyDone
          ? `<span class="ftc-status-pill" style="background:rgba(242,96,36,0.1);color:#F26024;">In Progress</span>`
          : `<span class="ftc-status-pill ftc-status-scheduled">Scheduled</span>`;

      const weekColor = allDone ? '#24BC96' : anyDone ? '#F26024' : '#174CCC';

      // BYE in this week
      const byeRow = matchups.find(m => m.is_bye);
      const byeText = byeRow
        ? `<span style="display:inline-flex;align-items:center;gap:6px;margin-left:10px;padding:3px 10px 3px 5px;background:rgba(242,96,36,0.08);border-radius:99px;">
            <span style="font-size:9px;font-weight:800;padding:2px 7px;border-radius:99px;background:#F26024;color:white;letter-spacing:.3px;">BYE / REST</span>
            <span style="font-size:10px;font-weight:700;color:#F26024;">${teamName(byeRow.team_a_id)} sits out this week</span>
           </span>`
        : '';

      html += `<div style="border:0.5px solid #e0e7f5;border-radius:10px;margin-bottom:8px;background:white;">

        <!-- Week header -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;position:relative;background:#f8f9ff;border-radius:10px 10px 0 0;"
          onclick="ftcToggleWeek(${weekNum})">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="width:22px;height:22px;border-radius:50%;background:${weekColor};color:white;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${weekNum}</span>
            <div>
              <div style="font-size:12px;font-weight:800;color:#0d1f4a;display:flex;align-items:center;gap:6px;">
                Week ${weekNum} &nbsp;${statusPill}
              </div>
              <div style="font-size:10px;font-weight:600;color:#6b7a99;margin-top:1px;">
                ${firstDate ? ftcFmtDate(firstDate) : 'No date set'} &nbsp;·&nbsp; ${nonByeCount} matchup${nonByeCount!==1?'s':''}
              </div>
            </div>
          </div>
          ${byeText ? `<div style="position:absolute;left:50%;transform:translateX(-50%);pointer-events:none;display:flex;align-items:center;">${byeText}</div>` : ''}
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:600;color:#24BC96;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Complete by ${completeByDate}
            </div>
            <span id="ftc-wk-chev-${weekNum}" style="font-size:11px;color:#6b7a99;transition:transform .2s;display:inline-block;transform:${isOpen?'rotate(180deg)':'rotate(0deg)'};">▼</span>
          </div>
        </div>

        <!-- Week body -->
        <div id="ftc-week-body-${weekNum}" style="display:${isOpen?'block':'none'};">
          <!-- Table using <table> for guaranteed column alignment -->
          <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
            <colgroup>
              <col style="width:220px;">
              <col style="width:90px;">
              <col style="width:100px;">
              <col style="width:160px;">
              <col style="width:110px;">
              <col style="width:160px;">
            </colgroup>
            <thead>
              <tr style="background:white;">
                <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:7px 16px;text-align:left;">Matchup</th>
                <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:7px 0;text-align:left;">Time</th>
                <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:7px 0;text-align:left;">Courts</th>
                <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:7px 0;text-align:left;">Matches</th>
                <th style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#6b7a99;padding:7px 0;text-align:left;">Status</th>
                <th style="padding:7px 16px;text-align:right;"></th>
              </tr>
            </thead>
            <tbody>
          ${matchups.filter(m => !m.is_bye).map(s => {
            const subMatches    = matchesBySchedule[s.id] || [];
            const courtParts    = s.court ? s.court.split(',').map(c => c.trim()) : [];
            const courtDisplay  = courtParts.length >= 2 ? `${courtParts[0]} – ${courtParts[1]}` : (courtParts[0] || '—');
            const timeDisplay   = s.match_time ? fmtTime12(s.match_time) : '—';
            const rowStatus     = s.status === 'completed' ? 'ftc-status-completed' : 'ftc-status-scheduled';
            const regularMatches = subMatches.filter(m => !m.is_tiebreaker);
            const completedCount = regularMatches.filter(m => m.status === 'completed').length;
            const matchCount     = regularMatches.length || 4;
            const matchProgress  = `${completedCount}/${matchCount}`;
            const progressColor  = completedCount === matchCount ? '#24BC96' : completedCount > 0 ? '#F26024' : '#6b7a99';
            const expandId      = `ftc-match-expand-${s.id}`;
            const chevId        = `ftc-match-chev-${s.id}`;

            // Build expandable match detail rows — extracted from template to avoid IIFE-in-template parse issues
            const buildMatchDetailHtml = (subMatches, courtParts) => {
              const c1 = courtParts[0] || null;
              const c2 = courtParts[1] || null;
              const useTwoCourts = !!c2;
              const typeOrder = ['mens','womens','mixed1','mixed2'];
              const c1Matches = subMatches.filter(m => ['mens','mixed1'].includes(m.match_type));
              const c2Matches = subMatches.filter(m => ['womens','mixed2'].includes(m.match_type));

              // ── Match counter shared across courts ───────────────────
              let matchCounter = 0;

              const renderMatchDetailRow = (m) => {
                matchCounter++;
                const gameNum = matchCounter;
                const info    = FTC_MATCH_LABELS[m.match_type] || { label: m.match_type, color:'#6b7a99' };
                const scored  = m.score_a !== null && m.score_b !== null;
                const aWins   = scored && m.score_a > m.score_b;
                const bWins   = scored && m.score_b > m.score_a;
                const scoreA  = scored ? String(m.score_a) : '—';
                const scoreB  = scored ? String(m.score_b) : '—';
                const ptsA    = scored ? '+' + m.league_pts_a + ' pts' : '';
                const ptsB    = scored ? '+' + m.league_pts_b + ' pts' : '';
                // Fix 4: winner bg green, loser bg gray
                const bgA     = 'transparent';
                const bgB     = 'transparent';
                const nameA   = (scored && bWins) ? '#b0bbd6' : '#0d1f4a';
                const nameB   = (scored && aWins) ? '#b0bbd6' : '#0d1f4a';
                const sclrA   = aWins ? '#24BC96' : '#b0bbd6';
                const sclrB   = bWins ? '#24BC96' : '#b0bbd6';

                return (
                  '<tr style="border-bottom:0.5px solid #f0f2f8;background:#f8f9ff;">' +
                  // Fix 3: number + label on same line
                  '<td style="padding:10px 0 10px 12px;vertical-align:middle;white-space:nowrap;">' +
                    '<div style="display:flex;align-items:baseline;gap:5px;">' +
                      '<span style="font-size:11px;font-weight:800;color:#6b7a99;">' + gameNum + '</span>' +
                      '<div>' +
                        '<div style="font-size:11px;font-weight:700;color:#0d1f4a;">' + info.label + '</div>' +
                        '<div style="font-size:9px;font-weight:700;color:#b0bbd6;">' + (info.abbr||'') + '</div>' +
                      '</div>' +
                    '</div>' +
                  '</td>' +
                  // Fix 6: Team A — no box, just players + sub button
                  '<td style="padding:10px 8px 10px 16px;vertical-align:middle;text-align:right;">' +
                    '<div style="font-size:12px;font-weight:700;color:' + nameA + ';line-height:1.5;margin-bottom:5px;">' + pName(m.team_a_p1_id) + '<br>' + pName(m.team_a_p2_id) + (m.forfeit_team_id === m.team_a_id ? ' <span style="font-size:9px;font-weight:800;background:rgba(242,96,36,0.1);color:#F26024;padding:1px 5px;border-radius:4px;vertical-align:middle;">FF</span>' : '') + '</div>' +
                    '<div style="display:flex;justify-content:flex-end;"><button class="ftc-edit-mini" onclick="event.stopPropagation();ftcOpenMatchEditTeam(' + m.id + ',\'A\')" style="font-size:9px;padding:2px 8px;">Sub Team A</button></div>' +
                  '</td>' +
                  // Score center
                  '<td style="padding:10px 8px;vertical-align:middle;text-align:center;">' +
                    '<div style="display:flex;align-items:center;justify-content:center;gap:8px;">' +
                      '<div style="font-size:20px;font-weight:800;color:' + sclrA + ';">' + scoreA + '</div>' +
                      '<span style="font-size:10px;font-weight:700;color:#b0bbd6;">vs</span>' +
                      '<div style="font-size:20px;font-weight:800;color:' + sclrB + ';">' + scoreB + '</div>' +
                    '</div>' +
                    (scored
                      ? (ptsA ? '<div style="font-size:9px;color:#6b7a99;margin-top:2px;">' + ptsA + ' / ' + ptsB + '</div>' : '')
                      : '<button class="ftc-edit-mini" onclick="event.stopPropagation();ftcOpenScoreModal(' + m.id + ')" style="margin-top:4px;border:1px solid #174CCC;color:#174CCC;background:white;font-size:10px;">Report Score</button>') +
                  '</td>' +
                  // Fix 6: Team B — no box, just players + sub button
                  '<td style="padding:10px 8px;vertical-align:middle;">' +
                    '<div style="font-size:12px;font-weight:700;color:' + nameB + ';line-height:1.5;margin-bottom:5px;">' + pName(m.team_b_p1_id) + '<br>' + pName(m.team_b_p2_id) + (m.forfeit_team_id === m.team_b_id ? ' <span style="font-size:9px;font-weight:800;background:rgba(242,96,36,0.1);color:#F26024;padding:1px 5px;border-radius:4px;vertical-align:middle;">FF</span>' : '') + '</div>' +
                    '<button class="ftc-edit-mini" onclick="event.stopPropagation();ftcOpenMatchEditTeam(' + m.id + ',\'B\')" style="font-size:9px;padding:2px 8px;">Sub Team B</button>' +
                  '</td>' +
                  // Status
                  '<td style="padding:10px 8px;vertical-align:middle;text-align:center;white-space:nowrap;">' +
                    '<span class="ftc-status-pill ' + (scored ? 'ftc-status-completed' : 'ftc-status-scheduled') + '">' + (scored ? 'Complete' : 'Scheduled') + '</span>' +
                  '</td>' +
                  // Actions
                  '<td style="padding:10px 8px;vertical-align:middle;text-align:center;white-space:nowrap;">' +
                    (scored ? '<button class="ftc-edit-mini" onclick="event.stopPropagation();ftcOpenScoreModal(' + m.id + ')" title="Edit score"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' : '') +
                  '</td>' +
                  '</tr>'
                );
              };

              const renderCourtBlock = (courtLabel, courtColor, matches, teamAName, teamBName) => {
                return (
                  // Fix 4: gray box with rounded corners per court
                  '<div style="border:0.5px solid #e0e7f5;border-radius:10px;margin:8px 12px;overflow:hidden;background:white;">' +
                  '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">' +
                  '<colgroup>' +
                    '<col style="width:130px;">' +
                    '<col style="width:280px;">' +
                    '<col style="width:200px;">' +
                    '<col style="width:280px;">' +
                    '<col style="width:100px;">' +
                    '<col style="width:80px;">' +
                  '</colgroup>' +
                  '<thead>' +
                  // Fix 2: white bg, no separator line below team names row
                  '<tr style="background:white;">' +
                    '<th style="padding:8px 0 8px 12px;text-align:left;">' +
                      '<div style="display:flex;align-items:center;gap:5px;">' +
                        '<span style="width:8px;height:8px;border-radius:50%;background:' + courtColor + ';display:inline-block;"></span>' +
                        '<span style="font-size:10px;font-weight:800;color:' + courtColor + ';text-transform:uppercase;letter-spacing:.5px;">Court ' + courtLabel + '</span>' +
                      '</div>' +
                    '</th>' +
                    // Fix 5: Remove (Home) and (Away)
                    '<th style="font-size:9px;font-weight:800;color:#6b7a99;padding:8px 8px 8px 16px;text-align:right;text-transform:uppercase;letter-spacing:.4px;">Team ' + esc(teamAName) + '</th>' +
                    '<th style="font-size:9px;font-weight:800;color:#6b7a99;padding:8px;text-align:center;text-transform:uppercase;letter-spacing:.4px;">Score</th>' +
                    '<th style="font-size:9px;font-weight:800;color:#6b7a99;padding:8px;text-align:left;text-transform:uppercase;letter-spacing:.4px;">Team ' + esc(teamBName) + '</th>' +
                    '<th style="font-size:9px;font-weight:800;color:#6b7a99;padding:8px;text-align:center;text-transform:uppercase;letter-spacing:.4px;">Status</th>' +
                    '<th style="font-size:9px;font-weight:800;color:#6b7a99;padding:8px;text-align:center;text-transform:uppercase;letter-spacing:.4px;">Actions</th>' +
                  '</tr>' +
                  
                  '</thead>' +
                  '<tbody>' +
                  matches.map(m => renderMatchDetailRow(m)).join('') +
                  '</tbody>' +
                  '</table>' +
                  '</div>'
                );
              };

              // Get team names for column headers
              const tAn = ftcTeams.find(t => t.id === (subMatches[0]?.team_a_id))?.name || 'Team A';
              const tBn = ftcTeams.find(t => t.id === (subMatches[0]?.team_b_id))?.name || 'Team B';
              if (!useTwoCourts) {
                const ordered = typeOrder.map(t => subMatches.find(m => m.match_type === t)).filter(Boolean);
                return renderCourtBlock(c1 || '—', '#174CCC', ordered, tAn, tBn);
              }
              return renderCourtBlock(c1, '#174CCC', c1Matches, tAn, tBn) +
                     renderCourtBlock(c2, '#24BC96', c2Matches, tAn, tBn);
            }
            // Season schedule — no tiebreaker (tiebreaker is playoff only)
            const regularSubMatches = subMatches.filter(m => !m.is_tiebreaker);

            const matchDetailHtml = subMatches.length > 0
              ? '<div id="' + expandId + '" style="display:none;border-top:0.5px solid #e0e7f5;background:white;">' +
                buildMatchDetailHtml(regularSubMatches, courtParts) +
                '</div>'
              : '';

            return `<tr style="cursor:${subMatches.length?'pointer':'default'};"
                onclick="${subMatches.length?`ftcToggleMatchExpand('${s.id}')`:''}">
                <td style="padding:11px 16px;vertical-align:middle;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:13px;font-weight:800;color:#0d1f4a;">${teamName(s.team_a_id)}</span>
                    <span style="font-size:9px;font-weight:700;color:#b0bbd6;background:#f0f2f8;padding:2px 6px;border-radius:99px;">vs</span>
                    <span style="font-size:13px;font-weight:800;color:#0d1f4a;">${teamName(s.team_b_id)}</span>
                  </div>
                </td>
                <td style="font-size:11px;font-weight:600;color:#6b7a99;padding:11px 0;vertical-align:middle;">${timeDisplay}</td>
                <td style="font-size:11px;font-weight:600;color:#6b7a99;padding:11px 0;vertical-align:middle;">${courtDisplay}</td>
                <td style="padding:11px 0;vertical-align:middle;">
                  <div style="display:flex;align-items:center;gap:5px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7a99" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span style="font-size:11px;font-weight:700;color:${progressColor};">${matchProgress}</span>
                    <span style="font-size:10px;font-weight:600;color:#b0bbd6;">MD, WD, MX1, MX2</span>
                  </div>
                </td>
                <td style="padding:11px 0;vertical-align:middle;">
                  <span class="ftc-status-pill ${rowStatus}">${s.status}</span>
                </td>
                <td style="padding:11px 16px;text-align:right;vertical-align:middle;white-space:nowrap;">
                  ${subMatches.length ? `<span id="${chevId}" style="font-size:10px;color:#6b7a99;display:inline-block;transform:rotate(0deg);transition:transform .15s;margin-right:6px;">▼</span>` : ''}
                  <button class="ftc-edit-mini" onclick="event.stopPropagation();ftcOpenOverrideModal(${s.id},'${s.match_date||''}','${s.match_time||''}','${esc(s.court||'')}')">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit Matchup
                  </button>
                </td>
              </tr>
              ${matchDetailHtml ? `<tr><td colspan="6" style="padding:0;">${matchDetailHtml}</td></tr>` : ''}`;
          }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    });

    html += '</div>'; // close white card

    // Capture currently open state before replacing DOM
    const openWeeks    = [...document.querySelectorAll('[id^="ftc-week-body-"]')]
      .filter(e => e.style.display !== 'none').map(e => e.id.replace('ftc-week-body-',''));
    const openMatchups = [...document.querySelectorAll('[id^="ftc-match-expand-"]')]
      .filter(e => e.style.display !== 'none').map(e => e.id.replace('ftc-match-expand-',''));

    el.innerHTML = html;

    // Restore open state
    openWeeks.forEach(wn => {
      const wb = document.getElementById(`ftc-week-body-${wn}`);
      const wc = document.getElementById(`ftc-wk-chev-${wn}`);
      if (wb) wb.style.display = 'block';
      if (wc) wc.style.transform = 'rotate(180deg)';
    });
    openMatchups.forEach(sid => {
      const mb = document.getElementById(`ftc-match-expand-${sid}`);
      const mc = document.getElementById(`ftc-match-chev-${sid}`);
      if (mb) mb.style.display = 'block';
      if (mc) mc.style.transform = 'rotate(180deg)';
    });
  };

  window.ftcToggleMatchExpand = (schedId) => {
    const body = document.getElementById(`ftc-match-expand-${schedId}`);
    const chev = document.getElementById(`ftc-match-chev-${schedId}`);
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    // Collapse all other open matchup details first
    if (!isOpen) {
      document.querySelectorAll('[id^="ftc-match-expand-"]').forEach(el => {
        if (el.id !== `ftc-match-expand-${schedId}` && el.style.display !== 'none') {
          el.style.display = 'none';
          const sid = el.id.replace('ftc-match-expand-', '');
          const c = document.getElementById(`ftc-match-chev-${sid}`);
          if (c) c.style.transform = 'rotate(0deg)';
        }
      });
    }
    body.style.display = isOpen ? 'none' : 'block';
    if (chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  };
  window.ftcToggleWeek = (week) => {
    const body = document.getElementById(`ftc-week-body-${week}`);
    const chev = document.getElementById(`ftc-wk-chev-${week}`);
    if (!body) return;
    const isOpen = body.style.display !== 'none';
    // Collapse all other open weeks first
    if (!isOpen) {
      document.querySelectorAll('[id^="ftc-week-body-"]').forEach(el => {
        if (el.id !== `ftc-week-body-${week}` && el.style.display !== 'none') {
          el.style.display = 'none';
          const wn = el.id.replace('ftc-week-body-', '');
          const c = document.getElementById(`ftc-wk-chev-${wn}`);
          if (c) c.style.transform = 'rotate(0deg)';
        }
      });
    }
    body.style.display = isOpen ? 'none' : 'block';
    if (chev) chev.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  };

  // ── Phase 4: Score Recording ─────────────────────────────────────────

  // Helper: compute league pts from score (win=2, lose=1)
  const ftcLeaguePts = (scoreA, scoreB) => {
    if (scoreA === null || scoreB === null) return { a: 0, b: 0 };
    const calcPts = (sf, sa) => {
      if (sf > sa) return 4;
      const d = sa - sf;
      if (d <= 2) return 3;
      if (d <= 4) return 2;
      if (d <= 8) return 1;
      return 0;
    };
    return { a: calcPts(scoreA, scoreB), b: calcPts(scoreB, scoreA) };
  };

  // Helper: player name from id
  const ftcPName = (id) => {
    if (!id) return 'TBD';
    const p = ladderPlayers.find(x => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : `#${id}`;
  };

  // Update score boxes styling + winner banner
  window.ftcScoreUpdate = () => {
    const a = parseInt(document.getElementById('ftc-score-input-a')?.value, 10);
    const b = parseInt(document.getElementById('ftc-score-input-b')?.value, 10);
    const boxA = document.getElementById('ftc-score-box-a');
    const boxB = document.getElementById('ftc-score-box-b');
    const banner = document.getElementById('ftc-score-banner');
    const bannerText = document.getElementById('ftc-score-banner-text');
    const nameA = document.getElementById('ftc-score-team-a-name')?.textContent || 'Team A';
    const nameB = document.getElementById('ftc-score-team-b-name')?.textContent || 'Team B';
    if (!isNaN(a) && !isNaN(b) && (a !== b)) {
      const winA = a > b;
      if (boxA) boxA.style.border = winA ? '1.5px solid #24BC96' : '1.5px solid #e0e7f5';
      if (boxB) boxB.style.border = !winA ? '1.5px solid #24BC96' : '1.5px solid #e0e7f5';
      if (boxA) boxA.style.background = winA ? 'rgba(36,188,150,0.04)' : 'white';
      if (boxB) boxB.style.background = !winA ? 'rgba(36,188,150,0.04)' : 'white';
      const winner = winA ? nameA : nameB;
      const pts = ftcLeaguePts(a, b);
      const winnerPts = winA ? pts.a : pts.b;
      if (banner) banner.style.display = 'flex';
      if (bannerText) bannerText.textContent = `${winner} wins · ${a} – ${b} · +${winnerPts} league pts`;
    } else {
      if (boxA) { boxA.style.border = '1.5px solid #e0e7f5'; boxA.style.background = 'white'; }
      if (boxB) { boxB.style.border = '1.5px solid #e0e7f5'; boxB.style.background = 'white'; }
      if (banner) banner.style.display = 'none';
    }
  };

  // Forfeit toggle handling
  const FTC_FORFEIT_ACTIVE   = 'background:rgba(242,96,36,0.1);color:#F26024;border:0.5px solid #F26024;';
  const FTC_FORFEIT_INACTIVE = 'background:#f0f2f8;color:#6b7a99;border:0.5px solid transparent;';
  let ftcForfeitState = { a: false, b: false };

  window.ftcForfeit = (side) => {
    const btnA = document.getElementById('ftc-forfeit-a');
    const btnB = document.getElementById('ftc-forfeit-b');
    const inA  = document.getElementById('ftc-score-input-a');
    const inB  = document.getElementById('ftc-score-input-b');

    // Toggle the clicked side
    ftcForfeitState[side] = !ftcForfeitState[side];
    // Deactivate the other side
    const other = side === 'a' ? 'b' : 'a';
    ftcForfeitState[other] = false;

    // Apply visual state — set each property individually to ensure override
    const applyForfeitStyle = (btn, active) => {
      if (!btn) return;
      btn.style.background = active ? 'rgba(242,96,36,0.1)' : '#f0f2f8';
      btn.style.color       = active ? '#F26024'             : '#6b7a99';
      btn.style.border      = active ? '0.5px solid #F26024' : '0.5px solid transparent';
    };
    applyForfeitStyle(btnA, ftcForfeitState.a);
    applyForfeitStyle(btnB, ftcForfeitState.b);

    // Set scores based on active forfeit
    if (ftcForfeitState.a) {
      if (inA) inA.value = '0';
      if (inB) inB.value = '11';
    } else if (ftcForfeitState.b) {
      if (inA) inA.value = '11';
      if (inB) inB.value = '0';
    } else {
      // Both deactivated — clear scores
      if (inA) inA.value = '';
      if (inB) inB.value = '';
    }
    ftcScoreUpdate();
  };

  // Open score modal
  window.ftcOpenScoreModal = (matchId, callerContext) => {
    // Reset forfeit state on modal open
    ftcForfeitState = { a: false, b: false };
    const btnA = document.getElementById('ftc-forfeit-a');
    const btnB = document.getElementById('ftc-forfeit-b');
    if (btnA) { btnA.style.background='#f0f2f8'; btnA.style.color='#6b7a99'; btnA.style.border='0.5px solid transparent'; }
    if (btnB) { btnB.style.background='#f0f2f8'; btnB.style.color='#6b7a99'; btnB.style.border='0.5px solid transparent'; }
    window._ftcScoreCallerContext = callerContext || 'schedule';
    const m = ftcMatches.find(x => x.id === matchId);
    if (!m) return;
    const tA   = ftcTeams.find(t => t.id === m.team_a_id);
    const tB   = ftcTeams.find(t => t.id === m.team_b_id);
    const info = FTC_MATCH_LABELS[m.match_type] || { label: m.match_type };
    const schedRow = ftcSchedule.find(s => s.id === m.schedule_id);
    const courtLabel = schedRow?.court ? `Court ${schedRow.court.split(',')[0]?.trim()}` : '';

    document.getElementById('ftc-score-match-id').value = matchId;
    document.getElementById('ftc-score-subtitle').textContent =
      `${esc(tA?.name||'Team A')} vs ${esc(tB?.name||'Team B')} · ${courtLabel} · ${info.label}`;
    document.getElementById('ftc-score-team-a-name').textContent = tA?.name || 'Team A';
    document.getElementById('ftc-score-team-b-name').textContent = tB?.name || 'Team B';
    document.getElementById('ftc-score-team-a-players').textContent =
      `${ftcPName(m.team_a_p1_id)} · ${ftcPName(m.team_a_p2_id)}`;
    document.getElementById('ftc-score-team-b-players').textContent =
      `${ftcPName(m.team_b_p1_id)} · ${ftcPName(m.team_b_p2_id)}`;

    // Pre-fill existing scores
    document.getElementById('ftc-score-input-a').value = m.score_a ?? '';
    document.getElementById('ftc-score-input-b').value = m.score_b ?? '';

    // Reset box borders
    document.getElementById('ftc-score-box-a').style.border = '1.5px solid #e0e7f5';
    document.getElementById('ftc-score-box-b').style.border = '1.5px solid #e0e7f5';
    document.getElementById('ftc-score-box-a').style.background = 'white';
    document.getElementById('ftc-score-box-b').style.background = 'white';
    document.getElementById('ftc-score-banner').style.display = 'none';

    ftcScoreUpdate();
    document.getElementById('ftc-score-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.ftcCloseScoreModal = () => {
    document.getElementById('ftc-score-modal').style.display = 'none';
    document.body.style.overflow = '';
  };

  // Save score
  window.ftcSaveScore = async () => {
    const matchId = parseInt(document.getElementById('ftc-score-match-id').value, 10);
    const scoreA  = parseInt(document.getElementById('ftc-score-input-a').value, 10);
    const scoreB  = parseInt(document.getElementById('ftc-score-input-b').value, 10);
    if (isNaN(scoreA) || isNaN(scoreB)) { toast('Please enter scores for both teams.', true); return; }
    if (scoreA === scoreB) { toast('Scores cannot be equal — use tiebreaker for ties.', true); return; }

    const m = ftcMatches.find(x => x.id === matchId);
    if (!m) return;
    const pts = ftcLeaguePts(scoreA, scoreB);
    const winnerId  = scoreA > scoreB ? m.team_a_id : m.team_b_id;
    const forfeitId = ftcForfeitState.a ? m.team_a_id : ftcForfeitState.b ? m.team_b_id : null;

    const saveBtn = document.getElementById('ftc-score-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
    try {
      await api(`ftc_ladder_matches?id=eq.${matchId}`, 'PATCH', {
        score_a:          scoreA,
        score_b:          scoreB,
        league_pts_a:     pts.a,
        league_pts_b:     pts.b,
        winner_team_id:   winnerId,
        forfeit_team_id:  forfeitId,
        status:           'completed',
      });
      // Update local state
      m.score_a = scoreA; m.score_b = scoreB;
      m.league_pts_a = pts.a; m.league_pts_b = pts.b;
      m.winner_team_id = winnerId; m.forfeit_team_id = forfeitId; m.status = 'completed';
      // Update ftcMatches array
      const idx = ftcMatches.findIndex(x => x.id === matchId);
      if (idx >= 0) ftcMatches[idx] = { ...ftcMatches[idx], ...m };

      toast('Score recorded!');
      ftcCloseScoreModal();

      const ctx = window._ftcScoreCallerContext || 'schedule';
      if (ctx === 'playoff') {
        // Refresh playoff match scores modal + bracket without closing playoff modal
        ftcRefreshPlayoffMatchModal(m.schedule_id);
        await ftcCheckAndUpdatePlayoffMatchupStatus(m.schedule_id);
        renderFtcBracket();
      } else {
        // Regular season flow
        await ftcCheckAndUpdateMatchupStatus(m.schedule_id);
        renderFtcSchedule();
      }
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save Result'; }
    }
  };

  // Check if all matches in a schedule slot are done and update status
  const ftcCheckAndUpdateMatchupStatus = async (scheduleId) => {
    const slotMatches = ftcMatches.filter(m => m.schedule_id === scheduleId && !m.is_tiebreaker);
    const allDone = slotMatches.length === 4 && slotMatches.every(m => m.status === 'completed');
    if (allDone) {
      // Count wins per team
      const winsA = slotMatches.filter(m => m.winner_team_id === m.team_a_id).length;
      const winsB = slotMatches.filter(m => m.winner_team_id === m.team_b_id).length;
      if (winsA === 2 && winsB === 2) {
        // 2-2 tie — prompt tiebreaker
        const sched = ftcSchedule.find(s => s.id === scheduleId);
        if (sched) setTimeout(() => ftcOpenTiebreakerModal(scheduleId, sched.team_a_id, sched.team_b_id), 300);
        return;
      }
      // Update schedule row status to completed
      await api(`ftc_ladder_schedule?id=eq.${scheduleId}`, 'PATCH', { status: 'completed' });
      const si = ftcSchedule.findIndex(s => s.id === scheduleId);
      if (si >= 0) ftcSchedule[si].status = 'completed';
    }
  };

  // Tiebreaker modal
  window.ftcOpenTiebreakerModal = (scheduleId, teamAId, teamBId) => {
    const tA = ftcTeams.find(t => t.id === teamAId);
    const tB = ftcTeams.find(t => t.id === teamBId);
    document.getElementById('ftc-tie-schedule-id').value = scheduleId;
    document.getElementById('ftc-tie-subtitle').textContent =
      `${esc(tA?.name||'Team A')} vs ${esc(tB?.name||'Team B')} · 2 – 2 tie`;
    document.getElementById('ftc-tie-team-a').textContent = tA?.name || 'Team A';
    document.getElementById('ftc-tie-team-b').textContent = tB?.name || 'Team B';
    document.getElementById('ftc-tie-input-a').value = '';
    document.getElementById('ftc-tie-input-b').value = '';
    document.getElementById('ftc-tie-box-a').style.border = '1.5px solid #e0e7f5';
    document.getElementById('ftc-tie-box-b').style.border = '1.5px solid #e0e7f5';
    document.getElementById('ftc-tie-banner').style.display = 'none';
    document.getElementById('ftc-tiebreaker-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.ftcCloseTiebreakerModal = () => {
    document.getElementById('ftc-tiebreaker-modal').style.display = 'none';
    document.body.style.overflow = '';
  };

  window.ftcTieUpdate = () => {
    const a = parseInt(document.getElementById('ftc-tie-input-a')?.value, 10);
    const b = parseInt(document.getElementById('ftc-tie-input-b')?.value, 10);
    const boxA = document.getElementById('ftc-tie-box-a');
    const boxB = document.getElementById('ftc-tie-box-b');
    const banner = document.getElementById('ftc-tie-banner');
    const bannerText = document.getElementById('ftc-tie-banner-text');
    const nameA = document.getElementById('ftc-tie-team-a')?.textContent || 'Team A';
    const nameB = document.getElementById('ftc-tie-team-b')?.textContent || 'Team B';
    if (!isNaN(a) && !isNaN(b) && a !== b) {
      const winA = a > b;
      if (boxA) { boxA.style.border = winA ? '1.5px solid #24BC96' : '1.5px solid #e0e7f5'; }
      if (boxB) { boxB.style.border = !winA ? '1.5px solid #24BC96' : '1.5px solid #e0e7f5'; }
      if (banner) banner.style.display = 'flex';
      if (bannerText) bannerText.textContent = `${winA ? nameA : nameB} wins tiebreaker · ${a} – ${b}`;
    } else {
      if (boxA) boxA.style.border = '1.5px solid #e0e7f5';
      if (boxB) boxB.style.border = '1.5px solid #e0e7f5';
      if (banner) banner.style.display = 'none';
    }
  };

  window.ftcSaveTiebreaker = async () => {
    const scheduleId = parseInt(document.getElementById('ftc-tie-schedule-id').value, 10);
    const scoreA = parseInt(document.getElementById('ftc-tie-input-a').value, 10);
    const scoreB = parseInt(document.getElementById('ftc-tie-input-b').value, 10);
    const tieType = document.getElementById('ftc-tie-type').value;
    if (isNaN(scoreA) || isNaN(scoreB)) { toast('Please enter scores for both teams.', true); return; }
    if (scoreA === scoreB) { toast('Tiebreaker cannot end in a tie.', true); return; }
    const sched = ftcSchedule.find(s => s.id === scheduleId);
    if (!sched) return;
    const winnerId = scoreA > scoreB ? sched.team_a_id : sched.team_b_id;
    try {
      // Create a tiebreaker match row
      await api('ftc_ladder_matches', 'POST', [{
        schedule_id:     scheduleId,
        ladder_id:       currentLadder.id,
        match_type:      'tiebreaker',
        team_a_id:       sched.team_a_id,
        team_b_id:       sched.team_b_id,
        score_a:         scoreA,
        score_b:         scoreB,
        league_pts_a:    scoreA > scoreB ? 2 : 1,
        league_pts_b:    scoreB > scoreA ? 2 : 1,
        winner_team_id:  winnerId,
        tiebreaker_type: tieType,
        is_tiebreaker:   true,
        status:          'completed',
      }]);
      // Update schedule status
      await api(`ftc_ladder_schedule?id=eq.${scheduleId}`, 'PATCH', { status: 'completed' });
      const si = ftcSchedule.findIndex(s => s.id === scheduleId);
      if (si >= 0) ftcSchedule[si].status = 'completed';
      // Refresh
      ftcMatches = await api(`ftc_ladder_matches?ladder_id=eq.${currentLadder.id}&select=*&order=schedule_id,match_type`);
      toast('Tiebreaker recorded!');
      ftcCloseTiebreakerModal();
      const tieCtx = window._ftcScoreCallerContext || 'schedule';
      if (tieCtx === 'playoff') {
        ftcRefreshPlayoffMatchModal(scheduleId);
        renderFtcBracket();
      } else {
        renderFtcSchedule();
      }
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  // ── Override modal ────────────────────────────────────────────────────
  window.ftcOpenOverrideModal = (id, date, time, court) => {
    document.getElementById('ftc-override-id').value    = id;
    document.getElementById('ftc-override-date').value  = date;
    document.getElementById('ftc-override-time').value  = time;
    document.getElementById('ftc-override-court').value = court;
    document.getElementById('ftc-override-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.ftcCloseOverrideModal = () => {
    document.getElementById('ftc-override-modal').style.display = 'none';
    document.body.style.overflow = '';
  };

  window.ftcSaveOverride = async () => {
    const id    = document.getElementById('ftc-override-id').value;
    const date  = document.getElementById('ftc-override-date').value;
    const time  = document.getElementById('ftc-override-time').value;
    const court = document.getElementById('ftc-override-court').value.trim();
    try {
      await api(`ftc_ladder_schedule?id=eq.${id}`, 'PATCH', {
        match_date: date || null,
        match_time: time || null,
        court:      court || null,
      });
      toast('Matchup updated.');
      ftcCloseOverrideModal();
      await loadFtcSchedule();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  // ── Individual match edit (player sub toggle) ────────────────────────
  // Open match edit filtered to one team's slots only
  window.ftcOpenMatchEditTeam = (matchId, team) => {
    // Temporarily filter: show only slots for the specified team (A or B)
    const m = ftcMatches.find(x => x.id === matchId);
    if (!m) return;
    const tA = ftcTeams.find(t => t.id === m.team_a_id);
    const tB = ftcTeams.find(t => t.id === m.team_b_id);
    const info = FTC_MATCH_LABELS[m.match_type] || { label: m.match_type, color:'#174CCC' };
    const pName = (id) => {
      if (!id) return 'TBD';
      const p = ladderPlayers.find(x => x.id === id);
      return p ? `${p.first_name} ${p.last_name}` : `#${id}`;
    };
    const allSlots = [
      { label: `${esc(tA?.name||'Team A')} — Player 1`, pid: m.team_a_p1_id, subId: ftcGetSub(tA, m.match_type, 1), field: 'team_a_p1_id', team: 'A', slot: 1 },
      { label: `${esc(tA?.name||'Team A')} — Player 2`, pid: m.team_a_p2_id, subId: ftcGetSub(tA, m.match_type, 2), field: 'team_a_p2_id', team: 'A', slot: 2 },
      { label: `${esc(tB?.name||'Team B')} — Player 1`, pid: m.team_b_p1_id, subId: ftcGetSub(tB, m.match_type, 1), field: 'team_b_p1_id', team: 'B', slot: 1 },
      { label: `${esc(tB?.name||'Team B')} — Player 2`, pid: m.team_b_p2_id, subId: ftcGetSub(tB, m.match_type, 2), field: 'team_b_p2_id', team: 'B', slot: 2 },
    ];
    // Filter to the requested team
    const slots = allSlots.filter(s => s.team === team);
    const titleEl = document.getElementById('ftc-match-edit-title');
    if (titleEl) titleEl.textContent = `${info.label} — Sub ${team === 'A' ? esc(tA?.name||'Team A') : esc(tB?.name||'Team B')}`;
    const idEl = document.getElementById('ftc-match-edit-id');
    if (idEl) idEl.value = matchId;
    const bodyEl = document.getElementById('ftc-match-edit-body');
    if (bodyEl) {
      bodyEl.innerHTML = slots.map((s, i) => {
        const isSub = s.subId && s.pid === s.subId;
        const subName = s.subId ? pName(s.subId) : null;
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid #f4f5f8;">
          <div>
            <div style="font-size:10px;font-weight:700;color:#6b7a99;margin-bottom:2px;">${s.label}</div>
            <div style="font-size:13px;font-weight:800;color:#0d1f4a;" id="ftc-me-name-${i}">${pName(s.pid)}</div>
            ${subName ? `<div style="font-size:10px;font-weight:600;color:#24BC96;margin-top:1px;">Sub available: ${subName}</div>` : '<div style="font-size:10px;font-weight:600;color:#b0bbd6;margin-top:1px;">No sub available</div>'}
          </div>
          ${subName ? `<div style="display:flex;align-items:center;gap:8px;">
            <button id="ftc-me-toggle-${i}"
              data-mid="${matchId}" data-field="${s.field}" data-regular="${isSub ? ftcGetRegular(s.team==='A'?tA:tB, m.match_type, s.slot) : s.pid}" data-sub="${s.subId}" data-issub="${isSub}"
              onclick="ftcToggleSub(${i})"
              style="padding:5px 12px;border-radius:99px;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;cursor:pointer;border:none;background:${isSub ? '#174CCC' : '#e0e7f5'};color:${isSub ? 'white' : '#6b7a99'};">
              ${isSub ? 'Undo Sub' : 'Use Sub'}
            </button>
          </div>` : ''}
        </div>`;
      }).join('');
    }
    document.getElementById('ftc-match-edit-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.ftcOpenMatchEdit = (matchId) => {
    const m = ftcMatches.find(x => x.id === matchId);
    if (!m) return;
    const tA = ftcTeams.find(t => t.id === m.team_a_id);
    const tB = ftcTeams.find(t => t.id === m.team_b_id);
    const info = FTC_MATCH_LABELS[m.match_type] || { label: m.match_type, color:'#174CCC' };
    const pName = (id) => {
      if (!id) return 'TBD';
      const p = ladderPlayers.find(x => x.id === id);
      return p ? `${p.first_name} ${p.last_name}` : `#${id}`;
    };

    // Determine which subs are available per team per slot
    const slots = [
      { label: `${esc(tA?.name||'Team A')} — Player 1`, pid: m.team_a_p1_id, subId: ftcGetSub(tA, m.match_type, 1), field: 'team_a_p1_id', team: 'A', slot: 1 },
      { label: `${esc(tA?.name||'Team A')} — Player 2`, pid: m.team_a_p2_id, subId: ftcGetSub(tA, m.match_type, 2), field: 'team_a_p2_id', team: 'A', slot: 2 },
      { label: `${esc(tB?.name||'Team B')} — Player 1`, pid: m.team_b_p1_id, subId: ftcGetSub(tB, m.match_type, 1), field: 'team_b_p1_id', team: 'B', slot: 1 },
      { label: `${esc(tB?.name||'Team B')} — Player 2`, pid: m.team_b_p2_id, subId: ftcGetSub(tB, m.match_type, 2), field: 'team_b_p2_id', team: 'B', slot: 2 },
    ];

    const titleEl = document.getElementById('ftc-match-edit-title');
    if (titleEl) titleEl.textContent = `${info.label} — Edit Players`;

    const idEl = document.getElementById('ftc-match-edit-id');
    if (idEl) idEl.value = matchId;

    const bodyEl = document.getElementById('ftc-match-edit-body');
    if (bodyEl) {
      bodyEl.innerHTML = slots.map((s, i) => {
        const isSub = s.subId && s.pid === s.subId;
        const regularName = pName(isSub ? ftcGetRegular(s.team==='A'?tA:tB, m.match_type, s.slot) : s.pid);
        const subName     = s.subId ? pName(s.subId) : null;
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:0.5px solid #f4f5f8;">
          <div>
            <div style="font-size:10px;font-weight:700;color:#6b7a99;margin-bottom:2px;">${s.label}</div>
            <div style="font-size:13px;font-weight:800;color:#0d1f4a;" id="ftc-me-name-${i}">${pName(s.pid)}</div>
            ${subName ? `<div style="font-size:10px;font-weight:600;color:#24BC96;margin-top:1px;">Sub available: ${subName}</div>` : '<div style="font-size:10px;font-weight:600;color:#b0bbd6;margin-top:1px;">No sub available</div>'}
          </div>
          ${subName ? `<div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;font-weight:600;color:#6b7a99;">${isSub ? 'Using sub' : 'Regular'}</span>
            <button id="ftc-me-toggle-${i}"
              data-mid="${matchId}" data-field="${s.field}" data-regular="${isSub ? ftcGetRegular(s.team==='A'?tA:tB, m.match_type, s.slot) : s.pid}" data-sub="${s.subId}" data-issub="${isSub}"
              onclick="ftcToggleSub(${i})"
              style="padding:5px 12px;border-radius:99px;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;cursor:pointer;border:none;background:${isSub ? '#174CCC' : '#e0e7f5'};color:${isSub ? 'white' : '#6b7a99'};">
              ${isSub ? 'Undo Sub' : 'Use Sub'}
            </button>
          </div>` : ''}
        </div>`;
      }).join('');
    }

    document.getElementById('ftc-match-edit-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  // Get the sub player ID for a given team, match type, and slot (1 or 2)
  const ftcGetSub = (team, matchType, slot) => {
    if (!team) return null;
    // For men's/mixed man slot → m_sub_id; for women's/mixed woman slot → f_sub_id
    if (matchType === 'mens') return slot === 1 ? team.m_sub_id : team.m_sub_id;
    if (matchType === 'womens') return slot === 1 ? team.f_sub_id : team.f_sub_id;
    if (matchType === 'mixed1' || matchType === 'mixed2') {
      // slot 1 = man, slot 2 = woman
      return slot === 1 ? team.m_sub_id : team.f_sub_id;
    }
    return null;
  };

  // Get the regular (non-sub) player ID for a given slot
  const ftcGetRegular = (team, matchType, slot) => {
    if (!team) return null;
    if (matchType === 'mens')   return slot === 1 ? team.m1_id : team.m2_id;
    if (matchType === 'womens') return slot === 1 ? team.f1_id : team.f2_id;
    if (matchType === 'mixed1') return slot === 1 ? team.mixed1_ma_id : team.mixed1_fa_id;
    if (matchType === 'mixed2') return slot === 1 ? team.mixed2_ma_id : team.mixed2_fa_id;
    return null;
  };

  window.ftcToggleSub = (slotIdx) => {
    const btn     = document.getElementById(`ftc-me-toggle-${slotIdx}`);
    const nameEl  = document.getElementById(`ftc-me-name-${slotIdx}`);
    if (!btn || !nameEl) return;
    const isSub   = btn.dataset.issub === 'true';
    const regular = parseInt(btn.dataset.regular, 10);
    const sub     = parseInt(btn.dataset.sub, 10);
    const newVal  = isSub ? regular : sub;
    // Update local ftcMatches
    const matchId = parseInt(btn.dataset.mid, 10);
    const field   = btn.dataset.field;
    const match   = ftcMatches.find(x => x.id === matchId);
    if (match) match[field] = newVal;
    // Update UI
    const pName = (id) => {
      const p = ladderPlayers.find(x => x.id === id);
      return p ? `${p.first_name} ${p.last_name}` : `#${id}`;
    };
    nameEl.textContent = pName(newVal);
    btn.dataset.issub  = String(!isSub);
    btn.style.background = !isSub ? '#174CCC' : '#e0e7f5';
    btn.style.color      = !isSub ? 'white'   : '#6b7a99';
    btn.textContent      = !isSub ? 'Undo Sub' : 'Use Sub';
  };

  window.ftcSaveMatchEdit = async () => {
    const matchId = parseInt(document.getElementById('ftc-match-edit-id').value, 10);
    const m = ftcMatches.find(x => x.id === matchId);
    if (!m) return;
    const saveBtn = document.getElementById('ftc-match-edit-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
    try {
      await api(`ftc_ladder_matches?id=eq.${matchId}`, 'PATCH', {
        team_a_p1_id: m.team_a_p1_id,
        team_a_p2_id: m.team_a_p2_id,
        team_b_p1_id: m.team_b_p1_id,
        team_b_p2_id: m.team_b_p2_id,
      });
      toast('Match players updated.');
      document.getElementById('ftc-match-edit-modal').style.display = 'none';
      document.body.style.overflow = '';
      ftcMatches = await api(`ftc_ladder_matches?ladder_id=eq.${currentLadder.id}&select=*&order=schedule_id,match_type`);
      renderFtcSchedule();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
  };

  window.ftcCloseMatchEdit = () => {
    document.getElementById('ftc-match-edit-modal').style.display = 'none';
    document.body.style.overflow = '';
  };

  /* ─── FTC LADDER — PHASE 2: TEAM REGISTRATION ────────────── */

  let ftcTeams = []; // all teams for currentLadder

  // ── Load and render teams page ──────────────────────────────────────────
  const loadFtcTeams = async () => {
    if (!currentLadder) return;
    // Set page title (Bebas Neue, same as RP ladder pages)
    const teamsTitleEl = document.getElementById('ftc-teams-title');
    if (teamsTitleEl) {
      teamsTitleEl.textContent = currentLadder.name || '';
      teamsTitleEl.style.display = 'block';
    }
    // Update hero
    const heroTitle = document.getElementById('ftc-hero-title');
    const heroSub   = document.getElementById('ftc-hero-sub');
    const heroTag   = document.getElementById('ftc-hero-tagline');
    if (heroTitle) heroTitle.textContent = currentLadder.name || 'Ferocia Team Challenge';
    if (heroSub) {
      const start = currentLadder.start_date
        ? new Date(currentLadder.start_date + 'T00:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'})
        : 'Season Dates TBD';
      heroSub.textContent = `Season 1 • ${start}`;
    }
    if (heroTag) heroTag.innerHTML = `🔥 ${esc(currentLadder.name || 'Ferocia Team Challenge')} &nbsp;•&nbsp; Playoffs Included`;
    const el = document.getElementById('ftc-teams-list');
    el.innerHTML = '<div class="loading">Loading teams...</div>';
    try {
      ftcTeams = await api(
        `ftc_ladder_teams?ladder_id=eq.${currentLadder.id}&select=*&order=id`
      );
      const statEl = document.getElementById('ftc-stat-teams');
      if (statEl) statEl.textContent = ftcTeams.length;
      // Show search only when at least 1 team exists
      const searchWrap = document.getElementById('ftc-search-wrap');
      if (searchWrap) searchWrap.style.display = ftcTeams.length > 0 ? 'block' : 'none';
      renderFtcTeams();
    } catch (err) {
      el.innerHTML = `<div class="error">Error: ${esc(err.message)}</div>`;
    }
  };

  const renderFtcTeams = (filterStr = '') => {
    const el = document.getElementById('ftc-teams-list');
    let teams = ftcTeams;
    if (filterStr) {
      const q = filterStr.toLowerCase();
      teams = ftcTeams.filter(t => {
        const nameMatch = (t.name || '').toLowerCase().includes(q);
        const capPlayer = t.captain_player_id ? ladderPlayers.find(x => x.id === t.captain_player_id) : null;
        const capMatch  = capPlayer ? `${capPlayer.first_name} ${capPlayer.last_name}`.toLowerCase().includes(q) : false;
        const playerIds = [t.m1_id,t.m2_id,t.f1_id,t.f2_id,t.m_sub_id,t.f_sub_id].filter(Boolean);
        const playerMatch = playerIds.some(pid => {
          const p = ladderPlayers.find(x => x.id === pid);
          return p && `${p.first_name} ${p.last_name}`.toLowerCase().includes(q);
        });
        return nameMatch || capMatch || playerMatch;
      });
    }

    if (!teams.length && !filterStr) {
      el.innerHTML = `<div class="ftc-empty">
        <div class="ftc-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.4;"><circle cx="12" cy="8" r="5"/><path d="M8.56 13.9l-1.56 6.1 5-3 5 3-1.56-6.1"/></svg>
        </div>
        <div class="ftc-empty-title">Ready to build the competition?</div>
        <div class="ftc-empty-sub">Register the first team and start the season.<br>Teams will appear here once registered.</div>
        <button class="ftc-register-btn" onclick="ftcOpenRegisterModal()" style="margin:0 auto;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          Register First Team
        </button>
      </div>`;
      return;
    }
    if (!teams.length) {
      el.innerHTML = '<div class="ftc-empty" style="padding:32px;"><div class="ftc-empty-title">No teams match your search.</div></div>';
      return;
    }

    const playerName = (id) => {
      if (!id) return null;
      const p = ladderPlayers.find(x => x.id === id);
      return p ? `${esc(p.first_name)} ${esc(p.last_name)}` : null;
    };

    const cards = teams.map((t, i) => {
      const label = t.name ? esc(t.name) : `Team ${i + 1}`;
      const initial = (t.name || `T${i+1}`)[0].toUpperCase();
      const capPlayer = t.captain_player_id ? ladderPlayers.find(x => x.id === t.captain_player_id) : null;
      const capName = capPlayer ? `${esc(capPlayer.first_name)} ${esc(capPlayer.last_name)}` : null;
      const playerCount = [t.m1_id,t.m2_id,t.f1_id,t.f2_id,t.m_sub_id,t.f_sub_id].filter(Boolean).length;

      return `<div class="ftc-team-card">
        <div class="ftc-card-header">
          <div class="ftc-card-avatar">${initial}</div>
          <div style="flex:1;min-width:0;">
            <div class="ftc-card-name">${label}</div>
            ${capName ? `<div class="ftc-card-captain">⭐ ${capName}</div>` : '<div class="ftc-card-captain" style="color:#b0bbd6;">No captain assigned</div>'}
          </div>
        </div>
        <div class="ftc-card-body">
          <div class="ftc-card-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${playerCount} Player${playerCount!==1?'s':''}
          </div>
          <div class="ftc-card-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            0–0 Record
          </div>
          ${t.mixed1_ma_id ? `<div class="ftc-card-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            Mixed pairs assigned
          </div>` : ''}
        </div>
        <div class="ftc-card-actions">
          <button class="ftc-card-btn" onclick="ftcOpenViewModal(${t.id})">View</button>
          <button class="ftc-card-btn" onclick="ftcOpenEditModal(${t.id})">Edit</button>
          <button class="ftc-card-btn danger" onclick="ftcDeleteTeam(${t.id}, '${label}')">Delete</button>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `<div style="font-size:11px;font-weight:700;color:#6b7a99;margin-bottom:12px;">${teams.length} team${teams.length!==1?'s':''} registered</div>
      <div class="ftc-teams-grid">${cards}</div>`;
  };

  window.ftcFilterTeams = (val) => renderFtcTeams(val);
  // ── Populate player dropdowns with cross-exclusion ─────────────────────
  // ── Single source of truth for all FTC dropdowns ──────────────────────────
  // editTeamId: the team being edited (null for new). Excludes other-team players.
  // Reads current form selections to cross-exclude within the form.
  const ftcBuildDropdowns = (editTeamId = null, initialVals = null) => {
    // Players used in OTHER teams
    const usedInOtherTeams = new Set(
      ftcTeams
        .filter(t => t.id !== editTeamId)
        .flatMap(t => [t.m1_id, t.m2_id, t.f1_id, t.f2_id, t.m_sub_id, t.f_sub_id].filter(Boolean))
        .map(String)
    );
    const avail = ladderPlayers.filter(p => !usedInOtherTeams.has(String(p.id)));
    const men   = avail.filter(p => p.gender === 'Male');
    const women = avail.filter(p => p.gender === 'Female');

    // Use explicit initial values if provided (edit mode), else read from DOM
    const gv = (id) => document.getElementById(id)?.value || '';
    const iv = (key, id) => initialVals ? (String(initialVals[key] || '')) : gv(id);
    const m1v = iv('m1', 'ftc-m1'), m2v = iv('m2', 'ftc-m2');
    const f1v = iv('f1', 'ftc-f1'), f2v = iv('f2', 'ftc-f2');
    const m1mCur = iv('mix1m', 'ftc-mixed1-m'), m2mCur = iv('mix2m', 'ftc-mixed2-m');
    const m1fCur = iv('mix1f', 'ftc-mixed1-f'), m2fCur = iv('mix2f', 'ftc-mixed2-f');
    const msubv  = iv('msub', 'ftc-msub'),       fsubv  = iv('fsub', 'ftc-fsub');

    const opt = (p, sel) => `<option value="${p.id}"${String(p.id)===String(sel)?' selected':''}>${esc(p.first_name)} ${esc(p.last_name)}</option>`;

    // Starter dropdowns — each excludes the OTHER starter of same gender
    const m1el = document.getElementById('ftc-m1');
    const m2el = document.getElementById('ftc-m2');
    const f1el = document.getElementById('ftc-f1');
    const f2el = document.getElementById('ftc-f2');
    if (m1el) m1el.innerHTML = `<option value="">Select male player...</option>`   + men.filter(p => !m2v || String(p.id) !== m2v).map(p => opt(p, m1v)).join('');
    if (m2el) m2el.innerHTML = `<option value="">Select male player...</option>`   + men.filter(p => !m1v || String(p.id) !== m1v).map(p => opt(p, m2v)).join('');
    if (f1el) f1el.innerHTML = `<option value="">Select female player...</option>` + women.filter(p => !f2v || String(p.id) !== f2v).map(p => opt(p, f1v)).join('');
    if (f2el) f2el.innerHTML = `<option value="">Select female player...</option>` + women.filter(p => !f1v || String(p.id) !== f1v).map(p => opt(p, f2v)).join('');

    // Sub dropdowns — exclude both starters of same gender
    const msubEl = document.getElementById('ftc-msub');
    const fsubEl = document.getElementById('ftc-fsub');
    if (msubEl) msubEl.innerHTML = `<option value="">None</option>` + men.filter(p => String(p.id) !== m1v && String(p.id) !== m2v).map(p => opt(p, msubv)).join('');
    if (fsubEl) fsubEl.innerHTML = `<option value="">None</option>` + women.filter(p => String(p.id) !== f1v && String(p.id) !== f2v).map(p => opt(p, fsubv)).join('');

    // Mixed doubles — only starters are eligible, cross-excluded between pairs
    const starterMen   = men.filter(p => m1v && m2v ? (String(p.id)===m1v||String(p.id)===m2v) : (String(p.id)===m1v||String(p.id)===m2v));
    const starterWomen = women.filter(p => f1v && f2v ? (String(p.id)===f1v||String(p.id)===f2v) : (String(p.id)===f1v||String(p.id)===f2v));
    const mix1mEl = document.getElementById('ftc-mixed1-m');
    const mix2mEl = document.getElementById('ftc-mixed2-m');
    const mix1fEl = document.getElementById('ftc-mixed1-f');
    const mix2fEl = document.getElementById('ftc-mixed2-f');
    if (mix1mEl) mix1mEl.innerHTML = `<option value="">Select man...</option>`    + starterMen.filter(p => !m2mCur || String(p.id) !== m2mCur).map(p => opt(p, m1mCur)).join('');
    if (mix2mEl) mix2mEl.innerHTML = `<option value="">Select man...</option>`    + starterMen.filter(p => !m1mCur || String(p.id) !== m1mCur).map(p => opt(p, m2mCur)).join('');
    if (mix1fEl) mix1fEl.innerHTML = `<option value="">Select woman...</option>`  + starterWomen.filter(p => !m2fCur || String(p.id) !== m2fCur).map(p => opt(p, m1fCur)).join('');
    if (mix2fEl) mix2fEl.innerHTML = `<option value="">Select woman...</option>`  + starterWomen.filter(p => !m1fCur || String(p.id) !== m1fCur).map(p => opt(p, m2fCur)).join('');

    ftcUpdateCaptainUI();
  };

  // Legacy wrappers so existing callers still work
  const ftcPopulateDropdowns = (editTeamId = null) => ftcBuildDropdowns(editTeamId);
  window.ftcRefreshStarterDropdowns = () => {
    const editTeamId = parseInt(document.getElementById('ftc-team-id')?.value || '0', 10) || null;
    ftcBuildDropdowns(editTeamId);
  };

  // ── Update mixed doubles dropdowns based on starter selections ──────────
  // Update captain radio pill styles + labels from dropdown selections
  window.ftcUpdateCaptainUI = () => {
    const slotMap = { m1:'ftc-m1', m2:'ftc-m2', f1:'ftc-f1', f2:'ftc-f2' };
    const labelMap = { m1:'Man 1', m2:'Man 2', f1:'Woman 1', f2:'Woman 2' };
    Object.entries(slotMap).forEach(([slot, selId]) => {
      const sel   = document.getElementById(selId);
      const label = document.getElementById(`ftc-cap-${slot}-label`);
      if (!label) return;
      const val = sel?.value;
      if (val) {
        const p = ladderPlayers.find(x => String(x.id) === String(val));
        label.textContent = p ? `${p.first_name} ${p.last_name}` : labelMap[slot];
      } else {
        label.textContent = labelMap[slot];
      }
    });
    // Update pill active styles
    const selected = document.querySelector('input[name="ftc-captain"]:checked')?.value || '';
    ['none','m1','m2','f1','f2'].forEach(slot => {
      const wrap = document.getElementById(`ftc-cap-${slot}-wrap`);
      if (!wrap) return;
      const isActive = selected === slot || (slot === 'none' && selected === '');
      wrap.classList.toggle('selected', isActive);
    });
  };

  // ftcUpdateMixedOptions: delegates to ftcBuildDropdowns (preserves all selections)
  window.ftcUpdateMixedOptions = () => {
    const editTeamId = parseInt(document.getElementById('ftc-team-id')?.value || '0', 10) || null;
    ftcBuildDropdowns(editTeamId);
  };

  // ── Wizard navigation ──────────────────────────────────────────────────
  let ftcCurrentStep = 1;
  const FTC_TOTAL_STEPS = 6;

  const ftcGoToStep = (step) => {
    ftcCurrentStep = step;
    // Show/hide panels
    for (let i = 1; i <= FTC_TOTAL_STEPS; i++) {
      const panel = document.getElementById(`ftc-panel-${i}`);
      if (panel) panel.classList.toggle('active', i === step);
    }
    // Update sidebar step states
    for (let i = 1; i <= FTC_TOTAL_STEPS; i++) {
      const num   = document.getElementById(`ftc-stepnum-${i}`);
      const label = document.getElementById(`ftc-steplabel-${i}`);
      if (!num || !label) continue;
      if (i < step) {
        num.className   = 'ftc-step-num done';
        num.innerHTML   = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        label.className = 'ftc-step-label done';
      } else if (i === step) {
        num.className   = 'ftc-step-num active';
        num.textContent = i;
        label.className = 'ftc-step-label active';
      } else {
        num.className   = 'ftc-step-num';
        num.textContent = i;
        label.className = 'ftc-step-label';
      }
    }
    // Show/hide nav buttons
    const backBtn = document.getElementById('ftc-btn-back');
    const nextBtn = document.getElementById('ftc-btn-next');
    const saveBtn = document.getElementById('ftc-btn-save');
    if (backBtn) backBtn.style.display = step > 1 ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = step < FTC_TOTAL_STEPS ? 'inline-flex' : 'none';
    if (saveBtn) saveBtn.style.display = step === FTC_TOTAL_STEPS ? 'inline-flex' : 'none';
    // Build review on step 6
    if (step === FTC_TOTAL_STEPS) ftcBuildReview();
  };

  window.ftcWizardNext = () => {
    // Validate current step before advancing
    if (ftcCurrentStep === 2) {
      if (!document.getElementById('ftc-m1')?.value ||
          !document.getElementById('ftc-m2')?.value ||
          !document.getElementById('ftc-f1')?.value ||
          !document.getElementById('ftc-f2')?.value) {
        toast('Please select all 4 starters before continuing.', true);
        return;
      }
      const ids = ['ftc-m1','ftc-m2','ftc-f1','ftc-f2'].map(id => document.getElementById(id).value);
      if (new Set(ids).size < 4) {
        toast('Each starter slot must be a different player.', true);
        return;
      }
    }
    if (ftcCurrentStep === 5) {
      const m1m = document.getElementById('ftc-mixed1-m')?.value;
      const m1f = document.getElementById('ftc-mixed1-f')?.value;
      const m2m = document.getElementById('ftc-mixed2-m')?.value;
      const m2f = document.getElementById('ftc-mixed2-f')?.value;
      const mixedErr = ftcValidateMixed(m1m, m1f, m2m, m2f);
      if (mixedErr) {
        const valEl = document.getElementById('ftc-mixed-validation');
        if (valEl) { valEl.textContent = mixedErr; valEl.style.display = 'block'; }
        return;
      }
      const valEl = document.getElementById('ftc-mixed-validation');
      if (valEl) valEl.style.display = 'none';
    }
    if (ftcCurrentStep < FTC_TOTAL_STEPS) ftcGoToStep(ftcCurrentStep + 1);
  };

  window.ftcWizardBack = () => {
    if (ftcCurrentStep > 1) ftcGoToStep(ftcCurrentStep - 1);
  };

  const ftcBuildReview = () => {
    const el = document.getElementById('ftc-review-content');
    if (!el) return;
    const pName = (id) => {
      if (!id) return '—';
      const p = ladderPlayers.find(x => String(x.id) === String(id) || x.id === id);
      return p ? `${p.first_name} ${p.last_name}` : '—';
    };
    const slot = document.querySelector('input[name="ftc-captain"]:checked')?.value || '';
    const slotToSel = { m1:'ftc-m1', m2:'ftc-m2', f1:'ftc-f1', f2:'ftc-f2' };
    const capPid = slot && slotToSel[slot] ? document.getElementById(slotToSel[slot])?.value : null;
    const capName = capPid ? pName(capPid) : 'None';

    el.innerHTML = `
      <div class="ftc-review-section">
        <div class="ftc-review-label">Team Identity</div>
        <div class="ftc-review-row"><span class="ftc-review-key">Team Name</span><span class="ftc-review-val">${document.getElementById('ftc-team-name')?.value || '—'}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Captain</span><span class="ftc-review-val">${capName}</span></div>
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Starters</div>
        <div class="ftc-review-row"><span class="ftc-review-key">Man 1</span><span class="ftc-review-val">${pName(document.getElementById('ftc-m1')?.value)}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Man 2</span><span class="ftc-review-val">${pName(document.getElementById('ftc-m2')?.value)}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Woman 1</span><span class="ftc-review-val">${pName(document.getElementById('ftc-f1')?.value)}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Woman 2</span><span class="ftc-review-val">${pName(document.getElementById('ftc-f2')?.value)}</span></div>
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Substitutes</div>
        <div class="ftc-review-row"><span class="ftc-review-key">Male Sub</span><span class="ftc-review-val">${pName(document.getElementById('ftc-msub')?.value) || 'None'}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Female Sub</span><span class="ftc-review-val">${pName(document.getElementById('ftc-fsub')?.value) || 'None'}</span></div>
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Mixed Doubles</div>
        <div class="ftc-review-row"><span class="ftc-review-key">Mixed #1</span><span class="ftc-review-val">${pName(document.getElementById('ftc-mixed1-m')?.value)} + ${pName(document.getElementById('ftc-mixed1-f')?.value)}</span></div>
        <div class="ftc-review-row"><span class="ftc-review-key">Mixed #2</span><span class="ftc-review-val">${pName(document.getElementById('ftc-mixed2-m')?.value)} + ${pName(document.getElementById('ftc-mixed2-f')?.value)}</span></div>
      </div>`;
  };

  // ── Open register modal ─────────────────────────────────────────────────
  window.ftcOpenRegisterModal = () => {
    document.getElementById('ftc-team-id').value   = '';
    document.getElementById('ftc-team-name').value = '';
    document.getElementById('ftc-modal-title').textContent    = 'Register Team';
    document.getElementById('ftc-modal-subtitle').textContent = 'Create your team and assign your players.';
    ['ftc-m1','ftc-m2','ftc-f1','ftc-f2','ftc-msub','ftc-fsub',
     'ftc-mixed1-m','ftc-mixed1-f','ftc-mixed2-m','ftc-mixed2-f'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const noneRadio = document.getElementById('ftc-cap-none');
    if (noneRadio) noneRadio.checked = true;
    const valEl = document.getElementById('ftc-mixed-validation');
    if (valEl) valEl.style.display = 'none';
    ftcPopulateDropdowns();
    ftcUpdateCaptainUI();
    ftcGoToStep(1);
    document.getElementById('ftc-team-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  // ── Open edit modal ─────────────────────────────────────────────────────
  window.ftcOpenViewModal = (teamId) => {
    const t = ftcTeams.find(x => x.id === teamId);
    if (!t) return;
    const pName = (id) => {
      if (!id) return '<span style="color:#b0bbd6;">—</span>';
      const p = ladderPlayers.find(x => x.id === id);
      return p ? `${esc(p.first_name)} ${esc(p.last_name)}` : '—';
    };
    const capPlayer = t.captain_player_id ? ladderPlayers.find(x => x.id === t.captain_player_id) : null;
    const teamLabel = t.name || 'Unnamed Team';
    const row = (label, val) => `
      <div class="ftc-review-row">
        <span class="ftc-review-key">${label}</span>
        <span class="ftc-review-val">${val}</span>
      </div>`;

    const el = document.getElementById('ftc-view-content');
    const titleEl = document.getElementById('ftc-view-title');
    if (titleEl) titleEl.textContent = teamLabel;
    if (el) el.innerHTML = `
      <div class="ftc-review-section">
        <div class="ftc-review-label">Team Identity</div>
        ${row('Team Name', teamLabel)}
        ${row('Captain', capPlayer ? `⭐ ${esc(capPlayer.first_name)} ${esc(capPlayer.last_name)}` : '<span style="color:#b0bbd6;">None assigned</span>')}
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Starters</div>
        ${row('Man 1', pName(t.m1_id))}
        ${row('Man 2', pName(t.m2_id))}
        ${row('Woman 1', pName(t.f1_id))}
        ${row('Woman 2', pName(t.f2_id))}
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Substitutes</div>
        ${row('Male Sub', pName(t.m_sub_id))}
        ${row('Female Sub', pName(t.f_sub_id))}
      </div>
      <div class="ftc-review-section">
        <div class="ftc-review-label">Mixed Doubles</div>
        ${row('Mixed #1', t.mixed1_ma_id ? `${pName(t.mixed1_ma_id)} + ${pName(t.mixed1_fa_id)}` : '<span style="color:#b0bbd6;">Not assigned</span>')}
        ${row('Mixed #2', t.mixed2_ma_id ? `${pName(t.mixed2_ma_id)} + ${pName(t.mixed2_fa_id)}` : '<span style="color:#b0bbd6;">Not assigned</span>')}
      </div>`;
    document.getElementById('ftc-view-edit-id').value = teamId;
    document.getElementById('ftc-view-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  window.ftcCloseViewModal = () => {
    document.getElementById('ftc-view-modal').style.display = 'none';
    document.body.style.overflow = '';
  };

  window.ftcViewToEdit = () => {
    const teamId = parseInt(document.getElementById('ftc-view-edit-id').value, 10);
    ftcCloseViewModal();
    ftcOpenEditModal(teamId);
  };

  window.ftcOpenEditModal = (teamId) => {
    const t = ftcTeams.find(x => x.id === teamId);
    if (!t) return;
    document.getElementById('ftc-team-id').value      = t.id;
    document.getElementById('ftc-team-name').value    = t.name || '';
    // captain is now set via radio group below
    document.getElementById('ftc-modal-title').textContent    = 'Edit Team';
    document.getElementById('ftc-modal-subtitle').textContent = 'Update team details. Past matches are not affected.';
    // Pass initial values directly so ftcBuildDropdowns renders options with correct selected state
    ftcBuildDropdowns(t.id, {
      m1:    t.m1_id,         m2:    t.m2_id,
      f1:    t.f1_id,         f2:    t.f2_id,
      msub:  t.m_sub_id,      fsub:  t.f_sub_id,
      mix1m: t.mixed1_ma_id,  mix1f: t.mixed1_fa_id,
      mix2m: t.mixed2_ma_id,  mix2f: t.mixed2_fa_id,
    });
    // Set captain radio
    const slotMap = { m1: t.m1_id, m2: t.m2_id, f1: t.f1_id, f2: t.f2_id };
    const capId = t.captain_player_id;
    let capSlot = '';
    if (capId) {
      Object.entries(slotMap).forEach(([slot, pid]) => {
        if (String(pid) === String(capId)) capSlot = slot;
      });
    }
    const capRadio = document.getElementById(capSlot ? `ftc-cap-${capSlot}` : 'ftc-cap-none');
    if (capRadio) capRadio.checked = true;
    ftcUpdateCaptainUI();
    const valEl = document.getElementById('ftc-mixed-validation');
    if (valEl) valEl.style.display = 'none';
    ftcGoToStep(1);
    document.getElementById('ftc-team-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  // ── Close modal ─────────────────────────────────────────────────────────
  window.ftcCloseModal = () => {
    document.getElementById('ftc-team-modal').style.display = 'none';
    document.body.style.overflow = '';
  };

  // ── Validate mixed doubles pairs ────────────────────────────────────────
  const ftcValidateMixed = (m1m, m1f, m2m, m2f) => {
    if (!m1m || !m1f || !m2m || !m2f) return null; // incomplete — skip
    if (m1m === m2m && m1f === m2f) {
      return 'The same mixed doubles pair cannot play both Mixed #1 and Mixed #2. Please assign different player combinations.';
    }
    return null;
  };

  // ── Save team (create or update) ────────────────────────────────────────
  window.ftcSaveTeam = async () => {
    const teamId  = document.getElementById('ftc-team-id').value;
    const isEdit  = !!teamId;

    const gv = (id) => document.getElementById(id)?.value || null;

    // Validate required starters
    if (!gv('ftc-m1') || !gv('ftc-m2') || !gv('ftc-f1') || !gv('ftc-f2')) {
      toast('Please assign all 4 starters (Man 1, Man 2, Woman 1, Woman 2).', true);
      return;
    }

    // Validate no duplicate starter
    const starterIds = [gv('ftc-m1'), gv('ftc-m2'), gv('ftc-f1'), gv('ftc-f2')];
    if (new Set(starterIds).size < 4) {
      toast('Each starter slot must be a different player.', true);
      return;
    }

    // Mixed doubles validation (also checked on step nav)
    const m1m = gv('ftc-mixed1-m'), m1f = gv('ftc-mixed1-f');
    const m2m = gv('ftc-mixed2-m'), m2f = gv('ftc-mixed2-f');
    const mixedErr = ftcValidateMixed(m1m, m1f, m2m, m2f);
    if (mixedErr) { toast(mixedErr, true); return; }

    const body = {
      ladder_id:    currentLadder.id,
      name:              document.getElementById('ftc-team-name').value.trim() || null,
      captain_player_id: (() => {
        const slot = document.querySelector('input[name="ftc-captain"]:checked')?.value;
        if (!slot) return null;
        const slotToField = { m1:'ftc-m1', m2:'ftc-m2', f1:'ftc-f1', f2:'ftc-f2' };
        const pid = document.getElementById(slotToField[slot])?.value;
        return pid ? parseInt(pid, 10) : null;
      })(),
      m1_id:        parseInt(gv('ftc-m1'), 10),
      m2_id:        parseInt(gv('ftc-m2'), 10),
      f1_id:        parseInt(gv('ftc-f1'), 10),
      f2_id:        parseInt(gv('ftc-f2'), 10),
      m_sub_id:     gv('ftc-msub')    ? parseInt(gv('ftc-msub'), 10)    : null,
      f_sub_id:     gv('ftc-fsub')    ? parseInt(gv('ftc-fsub'), 10)    : null,
      mixed1_ma_id: m1m ? parseInt(m1m, 10) : null,
      mixed1_fa_id: m1f ? parseInt(m1f, 10) : null,
      mixed2_ma_id: m2m ? parseInt(m2m, 10) : null,
      mixed2_fa_id: m2f ? parseInt(m2f, 10) : null,
    };

    const btn = document.getElementById('ftc-btn-save');
    const origHTML = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      if (isEdit) {
        await api(`ftc_ladder_teams?id=eq.${teamId}`, 'PATCH', body);
        toast('Team updated successfully!');
      } else {
        await api('ftc_ladder_teams', 'POST', body);
        toast('Team registered successfully!');
      }
      ftcCloseModal();
      await loadFtcTeams();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
  };

  // ── Delete team ─────────────────────────────────────────────────────────
  window.ftcDeleteTeam = async (teamId, teamLabel) => {
    const ok = await confirmModal({
      title:   'Delete team?',
      message: `Remove "${teamLabel}" from this ladder? This cannot be undone.`,
      confirm: 'Delete Team',
      danger:  true,
    });
    if (!ok) return;
    try {
      await api(`ftc_ladder_teams?id=eq.${teamId}`, 'DELETE');
      toast('Team deleted.');
      await loadFtcTeams();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  // Click handler — looks up the action handler for any [data-action] click
  const CLICK_HANDLERS = {
    // Navigation
    showPage: (btn) => showPage(btn.dataset.page, btn),
    goHome: () => goHome(),
    sbGoHome: () => goHome(),
    sbShowLadder: () => sbShowLadder(),
    sbShowTournament: () => sbShowTournament(),
    sbToggleMore: () => sbToggleMore(),
    // Court / session entry
    addCourtPlayerBtn: (btn) => addCourtPlayer(parseInt(btn.dataset.pid, 10)),
    markNoShow:  (btn) => markNoShow(btn.dataset.pid),
    cancelNoShow: () => cancelNoShow(),
    markSub:     (btn) => markSub(btn.dataset.pid),
    unmarkSub:   (btn) => unmarkSub(btn.dataset.pid),
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
    openPlayerProfile: (btn) => openPlayerProfile(parseInt(btn.dataset.pid, 10)),
    closeModal: () => closeModal(),
    openPlayerHistory: () => openPlayerHistory(),
    closePlayerHistory: () => closePlayerHistory(),
    // Modals
    closeEditLadderModal: () => closeEditLadderModal(),
    closeEditGameModal: () =>
      document.getElementById('edit-game-modal').classList.remove('open'),
    closeNotifyModal: () => document.getElementById('notify-modal').classList.remove('open'),
    closePromoModal: () => {
      const modal = document.getElementById('promo-modal');
      if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
    },
    closeEditSessionModal: () =>
      document.getElementById('edit-session-modal').classList.remove('open'),
    // Notify / promo
    openNotifyPlayers: () => openNotifyPlayers(),
    openSendPromo: () => openSendPromo(),
    sendPendingReminder: async () => {
      try {
        const pending = await api(
          'subscribers?status=eq.pending&select=first_name,last_name,email,confirm_token'
        );
        if (!pending.length) {
          toast('No pending subscribers to remind.', true);
          return;
        }

        // Confirm with admin before sending
        const confirmed = await confirmModal({
          title: 'Send Confirmation Reminders',
          message: `Send a confirmation email reminder to ${pending.length} pending subscriber${pending.length !== 1 ? 's' : ''}? Each will receive a link to confirm their subscription.`,
          okLabel: 'Send Reminders',
        });
        if (!confirmed) return;

        const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', '');
        emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });

        let sent = 0;
        const failed = [];

        for (const sub of pending) {
          const confirmUrl = sub.confirm_token
            ? `${baseUrl}confirm.html?t=${sub.confirm_token}`
            : `${baseUrl}confirm.html`;

          const ok = await sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.CONFIRM, {
            player_name:  `${sub.first_name} ${sub.last_name}`,
            player_email: sub.email,
            subject:      '⏰ Reminder: Please confirm your Ferocia Sports subscription',
            confirm_url:  confirmUrl,
          });

          if (ok) sent++;
          else failed.push(sub.email);

          if (sent + failed.length < pending.length) {
            await sleep(CFG.EMAIL_THROTTLE_MS);
          }
        }

        if (!failed.length) {
          toast(`✅ Confirmation reminder sent to ${sent} subscriber${sent !== 1 ? 's' : ''}!`);
        } else {
          toast(`Sent ${sent} reminders. ${failed.length} failed: ${failed.join(', ')}`, true);
        }
        // Refresh page data
        await loadSubscribers();
      } catch(e) {
        toast(`Error: ${e.message}`, true);
      }
    },
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
    // Orders management
    markFulfilled: (btn) => markFulfilled(btn),
    // Events management
    deleteEvent: (btn) => deleteEvent(btn),
    openEditEventModal: (btn) => openEditEventModal(btn),
    closeEditEventModal: () => closeEditEventModal(),
    // Print Roster
    printRoster: (btn) => printRoster(btn),
    // Print Standings
    printStandings: () => printStandings(),
    // Session accordion
    toggleSessionGroup: (btn) => toggleSessionGroup(btn),
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
  // ── Ladder Participants gender filter ─────────────────────────────────
  let _lpGenderFilter = 'all'; // 'all' | 'male' | 'female'

  window.lpGenderFilter = (gender) => {
    _lpGenderFilter = gender;
    // Update pill styles
    ['all','male','female'].forEach(g => {
      const btn = document.getElementById(`lp-filter-${g}`);
      if (!btn) return;
      const active = g === gender;
      btn.style.background   = active ? '#174CCC' : 'white';
      btn.style.borderColor  = active ? '#174CCC' : '#e0e7f5';
      btn.style.color        = active ? 'white'   : '#6b7a99';
    });
    lpApplyFilters();
  };

  window.lpApplyFilters = () => {
    const q = (document.getElementById('lp-search')?.value || '').toLowerCase();
    document.querySelectorAll('#lp-enrolled .lp-player-row-new').forEach((row) => {
      const nameMatch   = row.dataset.name?.includes(q) ?? true;
      const genderMatch = _lpGenderFilter === 'all' || row.dataset.gender === _lpGenderFilter;
      row.style.display = (nameMatch && genderMatch) ? '' : 'none';
    });
  };

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'lp-search') {
      lpApplyFilters();
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
  // Sidebar initialized — set home as active on boot
  sbSetActive('home');
  // Hide ladder sub-items until a ladder is selected
  ['sb-standings','sb-sessions','sb-entry','sb-ftc-standings','sb-ftc-teams','sb-ftc-schedule','sb-ftc-playoffs'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Form listeners — these only attach event handlers, no data fetched yet,
  // so safe to wire up before auth resolves.
  document.getElementById('create-ladder-form').addEventListener('submit', createLadder);
  document.getElementById('edit-game-form').addEventListener('submit', saveEditGame);
  document.getElementById('ladder-selector').addEventListener('change', onLadderChange);
  document.getElementById('tournament-selector')?.addEventListener('change', onTournamentChange);
  document.getElementById('edit-session-form').addEventListener('submit', saveEditSession);
  document.getElementById('notify-form').addEventListener('submit', sendNotifications);
  document.getElementById('create-event-form')?.addEventListener('submit', createEvent);
  document.getElementById('edit-event-form')?.addEventListener('submit', editEvent);
  document.getElementById('promo-form').addEventListener('submit', sendPromoEmail);
  document.getElementById('t-notify-form').addEventListener('submit', sendTournamentNotify);
  document.getElementById('sub-status-filter')?.addEventListener('change', () => { _subsShown = 25; _renderSubsTable(); });
  document.getElementById('sub-search')?.addEventListener('input', () => { _subsShown = 25; _renderSubsTable(); });
  document.getElementById('player-status-filter')?.addEventListener('change', filterPlayers);
  document.getElementById('player-search')?.addEventListener('input', filterPlayers);
  document.querySelector('#edit-ladder-modal form')?.addEventListener('submit', saveEditLadder);
  document.getElementById('edit-player-form')?.addEventListener('submit', saveEditPlayer);
  document.getElementById('add-player-form')?.addEventListener('submit', addPlayer);

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
    sendTestPromoEmail,
  };
  // Also expose directly on window for legacy references in tournament.js
  window.api          = api;
  window.esc          = esc;
  window.fmtDate      = fmtDate;
  window.confirmModal = confirmModal;
  window.toast        = toast;

  // Track auth state so tournament.js can wait on it too
  window.app.authReady = new Promise((resolve) => {
    window.app._resolveAuthReady = resolve;
  });

  // Wait for auth before loading any data. requireAuth() shows the
  // login modal if not signed in; once signed in, our callback fires.
  window.auth.requireAuth(() => {
    // Show the sign-out button now that we're authenticated
    const signOutBtn = document.getElementById('sign-out-btn');
    if (signOutBtn) signOutBtn.style.display = 'flex';

    // Kick off the data load — dashboard first since it's the home page
    loadDashboard();
    loadLadderSelector();

    // Let tournament.js (and anything else waiting on auth) proceed
    if (window.app._resolveAuthReady) {
      window.app._resolveAuthReady();
      window.app._resolveAuthReady = null;
    }
  });
})();
