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

  // Local alias for the shared state object (admin-state.js). Same object
  // as window.AdminState — not a copy — so writes here are immediately
  // visible to any extracted admin-*.js module, and vice versa.
  const AdminState = window.AdminState;

  /* ─── STATE ────────────────────────────────────────────── */
  // All former closure state (allPlayers, allLadders, currentLadder,
  // ladderPlayers, courtPlayers, noShowPlayer, noShowPenalty, subPlayers,
  // gameCount, extraGameCount, extraGames, modalLadderId,
  // currentTournamentId) now lives on the shared AdminState object
  // (admin-state.js), with its initial values set there. Everything below
  // reads/writes them as AdminState.courtPlayers, etc.

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
    if (isLadderPage && AdminState.currentLadder) {
      const isFTC = AdminState.currentLadder.ladder_type === 'ftc';
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
    AdminState.currentLadder = null;
    const sel = document.getElementById('ladder-selector');
    if (sel) sel.value = '';
    loadDashboard();
  };

  const sbShowLadder = () => {
    sbCloseMore();
    if (AdminState.currentLadder) {
      showPage('ladder', document.getElementById('sb-standings'));
    } else {
      window.loadLadderSelector().then(() => {
        document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
        sbSetActive('ladder');
      });
    }
    // Always show the sub-items
    const wrap = document.getElementById('sb-ladder-select-wrap');
    if (wrap) wrap.style.display = 'block';
    (() => {
      const isFTC = AdminState.currentLadder?.ladder_type === 'ftc';
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
    AdminState.currentTournamentId = parseInt(tid, 10);

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
      await openTournament(AdminState.currentTournamentId);
    }
  };


  const showPage = (name, btn) => {
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${name}`);
    if (pageEl) pageEl.classList.add('active');
    sbSetActive(name);
    sbCloseMore();
    if (name === 'ladder') window.loadLadder();
    if (name === 'sessions') {
      // If called with a specific ladder id (e.g. from dashboard ops center), pre-select it
      const ladderId = btn && btn.dataset && btn.dataset.ladderid ? parseInt(btn.dataset.ladderid, 10) : null;
      if (ladderId && AdminState.allLadders.length) {
        const found = AdminState.allLadders.find(l => l.id === ladderId);
        if (found) {
          AdminState.currentLadder = found;
          const sel = document.getElementById('ladder-selector');
          if (sel) sel.value = ladderId;
          window.updateLadderBanner();
        }
      }
      window.loadSessions();
    }
    if (name === 'players') window.loadPlayers();
    if (name === 'entry') window.initEntry();
    if (name === 'ladders') window.loadLaddersPage();
    if (name === 'ftc-standings') window.loadFtcStandings();
    if (name === 'ftc-teams') window.loadFtcTeams();
    if (name === 'ftc-schedule') window.loadFtcSchedule();
    if (name === 'ftc-playoffs') window.loadFtcPlayoffs();
    if (name === 'add-player') window.initAddPlayer();
    if (name === 'share') window.AdminPageLoaders.share?.();
    if (name === 'orders') window.AdminPageLoaders.orders?.();
    if (name === 'events') loadEventsPage();
    if (name === 'promotions' && typeof window.loadPromotionsPage !== 'undefined') window.loadPromotionsPage();
    if (name === 'match-hub') window.loadMatchHub();
    if (name === 't-tournaments' && typeof loadTournamentModule !== 'undefined') loadTournamentModule();
    if (name === 'tournament-view') {
      const el = document.getElementById('tournament-view-content');
      if (el && !AdminState.currentTournamentId) {
        el.innerHTML = '<div class="empty">Select a tournament from the dropdown above.</div>';
      }
    }
  };

  /* ─── LADDER SELECTOR ──────────────────────────────────── */
  /* Extracted to admin-ladder-selector.js (Phase 4 of the app.js
     modularization). loadLadderSelector/onLadderChange/updateLadderBanner/
     loadLadderPlayers now live there, exposed on window since they're
     called directly (not through data-action) from many places below. */

  /* ─── LADDER MANAGEMENT PAGE & LADDER PLAYERS MODAL ─────── */
  /* Extracted to admin-ladder-management.js. */

  /* ─── LADDER STANDINGS ─────────────────────────────────── */
  /* Extracted to admin-ladder-standings.js. loadLadder/renderMomentumWatch/
     getInitials/renderLadderPodium/renderLadder/printStandings now live
     there (loadLadder/renderLadder exposed on window). */

  /* ─── SESSIONS & RECORD SESSION & PRINT ROSTER ──────────── */
  /* Extracted to admin-sessions.js and admin-print-roster.js. */

  /* ─── PLAYERS ──────────────────────────────────────────── */
  /* Extracted to admin-players.js. */

  /* ─── PLAYER STATUS HISTORY MODAL ──────────────────────── */
  /* Extracted to admin-player-status-history.js. openPlayerHistory/
     closePlayerHistory now live there. */

  /* ─── SHARE PAGE ───────────────────────────────────────── */
  /* Extracted to admin-share.js (Phase 3 of the app.js modularization).
     loadSharePage/switchShareTab/showShareQR/copyShareLink/_recordShareVisit
     now live there. */

  /* ─── EMAIL NOTIFICATIONS ──────────────────────────────── */
  /* Extracted to admin-email-notifications.js. NOTIFY_TEMPLATES/
     setNotifyTemplate/openNotifyPlayers/sendNotifications now live there. */

  /* ─── TOURNAMENT NOTIFY ────────────────────────────────── */
  /* Extracted to admin-tournament-notify.js (Phase 3 of the app.js
     modularization). openTournamentNotifyModal/closeTournamentNotifyModal/
     sendTournamentNotify now live there. */

  /* ─── ORDERS ────────────────────────────────────────────── */
  /* Extracted to admin-orders.js (Phase 1 of the app.js modularization).
     loadOrdersPage/markFulfilled now live there, registered into
     window.AdminPageLoaders / window.CLICK_HANDLERS. */

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
  /* Extracted to admin-promotions.js. */

  /* ─── EVENT DELEGATION ─────────────────────────────────── */

  /* ─── FTC LADDER ─────────────────────────────────────────  */
  /* Extracted to admin-ftc-standings.js, admin-ftc-playoffs-schedule.js,
     and admin-ftc-teams.js. */

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
  // create-ladder-form's submit listener is now wired by admin-ladder-management.js itself
  // edit-game-form's and edit-session-form's submit listeners are now wired by admin-sessions.js itself
  // ladder-selector's change listener is now wired by admin-ladder-selector.js itself
  document.getElementById('tournament-selector')?.addEventListener('change', onTournamentChange);
  // notify-form's submit listener is now wired by admin-email-notifications.js itself
  document.getElementById('create-event-form')?.addEventListener('submit', createEvent);
  document.getElementById('edit-event-form')?.addEventListener('submit', editEvent);
  // promo-form's, sub-status-filter's, and sub-search's listeners are now wired by admin-promotions.js itself
  // t-notify-form's submit listener is now wired by admin-tournament-notify.js itself
  // edit-ladder-modal form's submit listener is now wired by admin-ladder-management.js itself
  // add-player-form's, edit-player-form's, player-status-filter's, and player-search's
  // listeners are now wired by admin-players.js itself

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
    openTournamentNotifyModal: window.openTournamentNotifyModal,  // set by admin-tournament-notify.js; called by tournament.js notify button
    sendTestPromoEmail: window.sendTestPromoEmail, // set by admin-promotions.js
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
    window.loadLadderSelector();

    // Let tournament.js (and anything else waiting on auth) proceed
    if (window.app._resolveAuthReady) {
      window.app._resolveAuthReady();
      window.app._resolveAuthReady = null;
    }
  });
})();
