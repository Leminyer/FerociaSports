/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: SESSIONS & RECORD SESSION
   Depends on: config.js, db.js, admin-state.js, admin-ladder-selector.js
   Load order: admin-state.js -> admin-ladder-selector.js ->
               admin-sessions.js -> app.js

   Extracted from app.js's SESSIONS + RECORD SESSION sections — the
   ladder session viewing/editing flow (loadSessions, editGame,
   deleteSession...) and the "record a new session" entry form
   (initEntry, addCourtPlayer, submitSession...).

   Reads/writes AdminState.currentLadder / .ladderPlayers / .courtPlayers /
   .noShowPlayer / .noShowPenalty / .subPlayers / .gameCount /
   .extraGameCount / .extraGames, all populated/owned elsewhere
   (admin-ladder-selector.js sets currentLadder/ladderPlayers; this file
   owns the rest, used only during session entry).

   dedupeMatches() is also used by loadLaddersPage(), which stays in
   app.js — exposed on window here for that reason.
   loadSessions/initEntry/calcPoints/searchPlayersEntry/autoCalcGame/
   autoCalcExtraGame are exposed on window because they're called
   directly (not through data-action) from app.js's page router and
   generic input listener.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

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

  // ─── SHARED: dedupe raw match rows ───────────────────────
  // Defensive fix for legacy duplicate rows in `matches` (the same player+
  // game+court+date inserted more than once — e.g. from a double-click on
  // "Save Roster" before the double-submit guard below existed). Keeps only
  // the row with the highest id per player+game+court+date. Every place that
  // aggregates matches for standings, rosters, or reports should read
  // through this so a duplicate row can never inflate points/wins/games in
  // one place while looking correct in another.
  const dedupeMatches = (matches) => {
    const deduped = {};
    matches.forEach((m) => {
      const key = `${m.session_date}__${m.court_group}__${m.game_number}__${m.player_id}`;
      if (!deduped[key] || m.id > deduped[key].id) deduped[key] = m;
    });
    return Object.values(deduped);
  };

  const loadSessions = async () => {
    if (!AdminState.currentLadder) {
      document.getElementById('sessions-list').innerHTML =
        '<div class="empty">Please select a ladder first.</div>';
      return;
    }

    // Set ladder title
    const titleEl = document.getElementById('sessions-ladder-title');
    if (titleEl) { titleEl.textContent = AdminState.currentLadder.name; titleEl.style.display = 'block'; }

    try {
      // ── Shared RPC — same source of truth the public players.html uses ──
      // Already deduped and team-paired server-side, so no local buildTeams() is needed here.
      const { data: courtsData, error: sessErr } =
        await supabase.rpc('get_ladder_sessions', { p_ladder_id: AdminState.currentLadder.id });
      if (sessErr) throw new Error(sessErr.message);
      const courts = courtsData || [];
      if (!courts.length) {
        document.getElementById('sessions-list').innerHTML =
          '<div class="empty">No sessions recorded yet.</div>';
        return;
      }

      // Group by date → time → courts (each court already carries deduped, paired games)
      const byDate = {};
      courts.forEach((s) => {
        const time = s.session_time || '00:00';
        if (!byDate[s.session_date]) byDate[s.session_date] = {};
        if (!byDate[s.session_date][time]) byDate[s.session_date][time] = [];
        byDate[s.session_date][time].push(s);
      });

      const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

      // Helper: compute per-date session summary from already-paired games
      const computeSummary = (dateCourts) => {
        const allGames = dateCourts.flatMap((c) => (c.games || []).map((g) => ({ ...g, court: c.court_group })));
        const totalGames = allGames.length;
        const totalCourts = dateCourts.length;
        // MVP — player with most points_earned this date
        const ptsByPlayer = {};
        const nameByPlayer = {};
        allGames.forEach((g) => {
          [...(g.team_a || []), ...(g.team_b || [])].forEach((row) => {
            if (row.score_for !== null) {
              ptsByPlayer[row.player_id] = (ptsByPlayer[row.player_id] || 0) + (row.points_earned || 0);
              nameByPlayer[row.player_id] = `${row.first_name} ${row.last_name}`;
            }
          });
        });
        const mvpId = Object.keys(ptsByPlayer).sort((a, b) => ptsByPlayer[b] - ptsByPlayer[a])[0];
        const mvpName = mvpId ? (nameByPlayer[mvpId] || 'Unknown') : '—';
        const mvpPts  = mvpId ? ptsByPlayer[mvpId] : 0;
        // Closest / biggest — games with both teams scored
        const scoredGames = allGames
          .filter((g) => g.team_a?.[0]?.score_for != null && g.team_b?.[0]?.score_for != null)
          .map((g) => {
            const scores = [g.team_a[0].score_for, g.team_b[0].score_for].sort((a, b) => b - a);
            return { diff: scores[0] - scores[1], score: `${scores[0]}–${scores[1]}`, court: g.court, game: g.game_number };
          });
        scoredGames.sort((a, b) => a.diff - b.diff);
        const closest = scoredGames[0] || null;
        const biggest = scoredGames[scoredGames.length - 1] || null;
        // Court highlight — court with smallest avg score diff (most competitive)
        const courtDiffs = {};
        const courtCounts = {};
        scoredGames.forEach((g) => {
          courtDiffs[g.court]  = (courtDiffs[g.court]  || 0) + g.diff;
          courtCounts[g.court] = (courtCounts[g.court] || 0) + 1;
        });
        const bestCourt = Object.keys(courtDiffs).sort((a, b) =>
          (courtDiffs[a] / courtCounts[a]) - (courtDiffs[b] / courtCounts[b]),
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
        const allDateRows = allCourts.flatMap((c) => (c.games || []).flatMap((g) => [...(g.team_a || []), ...(g.team_b || [])]));
        const courtCount    = allCourts.length;
        const totalGames    = allCourts.reduce((n, c) => n + (c.games || []).length, 0);
        const uniquePlayers = new Set(allDateRows.map((r) => r.player_id)).size;
        const subCount      = allDateRows.filter((r) => r.is_sub).length;
        const pendingGames  = allCourts.reduce((n, c) => n + (c.games || []).filter((g) => g.status === 'pending').length, 0);

        const sum = computeSummary(allCourts);

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
                    data-date="${esc(date)}" data-ladderid="${AdminState.currentLadder.id}"
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
              <span style="font-size:11px;font-weight:800;color:#174CCC;">${window.fmtTime12(time)}</span>
            </div>`;

          // Court blocks inside this time slot
          timeCourts.forEach((s) => {
          const courtGames   = s.games || [];
          const courtPending = courtGames.some((g) => g.status === 'pending');
          // Include no-show row ids so deleting/editing a session covers them too
          const allCourtMatchIds = [
            ...courtGames.flatMap((g) => [...(g.team_a || []), ...(g.team_b || [])].map((r) => r.match_id)),
            ...(s.no_shows || []).map((r) => r.match_id),
          ];
          const sessionMatchIds = allCourtMatchIds.join(',');

          // Build no-show banner HTML for court level display
          const noShowBannerHtml = (s.no_shows || []).map((ns) => {
            const name = `${esc(ns.first_name)} ${esc(ns.last_name)}`;
            const pts  = ns.points_earned;
            const isPenalty = pts < 0;
            return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:7px 12px;background:var(--orange-light);border:1px solid rgba(242,96,36,0.2);border-radius:8px;flex-wrap:wrap;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style="font-size:12px;font-weight:800;color:var(--orange);">No-show: ${name}</span>
              <span style="font-size:11px;font-weight:700;color:var(--orange);">${pts} pts</span>
              <button onclick="toggleNoShowPenalty(${ns.match_id}, ${pts})"
                style="margin-left:auto;padding:3px 10px;border:1px solid rgba(242,96,36,0.3);border-radius:99px;background:white;color:var(--orange);font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;cursor:pointer;">
                Change to ${isPenalty ? '0 pts (excused)' : '-4 pts (penalty)'}
              </button>
            </div>`;
          }).join('');

          html += `<div class="court-block">
            <div class="court-block-hdr">
              <span class="court-block-label">Court ${s.court_group}${courtPending ? ' <span style="font-size:9px;font-weight:800;color:var(--orange);background:var(--orange-light);padding:1px 6px;border-radius:99px;text-transform:uppercase;margin-left:6px;">Pending</span>' : ''}</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <button class="sess-edit-btn" data-action="editSession" data-matchids="${sessionMatchIds}" data-date="${esc(s.session_date)}" data-court="${s.court_group}" data-time="${esc(s.session_time || '')}" title="Edit session">${editSVG}</button>
                <button class="sess-edit-btn" data-action="deleteSession" data-matchids="${sessionMatchIds}" data-date="${esc(s.session_date)}" data-court="${s.court_group}" data-time="${esc(s.session_time || '')}" title="Delete session" style="border-color:rgba(229,57,53,0.3);"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e53935" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
              </div>
            </div>
            ${noShowBannerHtml}`;

          // Game rows — teams already paired by the RPC
          courtGames.forEach((g) => {
            const gameIds = [...(g.team_a || []), ...(g.team_b || [])].map((r) => r.match_id).join(',');

            const renderTeam = (team, isWinner) => {
              if (!team || !team.length) return '';
              const p0 = team[0];
              const score = p0.score_for !== null ? String(p0.score_for) : '—';
              const regularPts = team.filter((p) => !p.is_sub).map((p) => p.points_earned || 0);
              const teamPts    = regularPts.length ? Math.max(...regularPts) : (p0.points_earned || 0);
              const pts        = p0.score_for !== null ? `+${teamPts} pts` : 'pending';
              const isPend = p0.score_for === null;

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

              const names = team.map((p) => {
                const name = `${esc(p.first_name)} ${esc(p.last_name)}`;
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
            const scoreA = g.team_a?.[0] ? g.team_a[0].score_for : null;
            const scoreB = g.team_b?.[0] ? g.team_b[0].score_for : null;
            const aWins  = scoreA !== null && scoreB !== null && scoreA > scoreB;
            const bWins  = scoreA !== null && scoreB !== null && scoreB > scoreA;

            html += `<div class="sess-game-row">
              <span class="sess-game-label">Game ${g.game_number}</span>
              <div class="sess-game-body">
                ${renderTeam(g.team_a, aWins)}
                <div class="sess-vs"><div class="sess-vs-line"></div><span>VS</span><div class="sess-vs-line"></div></div>
                ${renderTeam(g.team_b, bWins)}
              </div>
              <button class="sess-edit-btn" data-action="editGame" data-gameids="${gameIds}" data-gnum="${g.game_number}" data-date="${esc(s.session_date)}" data-court="${s.court_group}" title="Edit game">${editSVG}</button>
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
        `matches?session_date=eq.${newDate}&session_time=eq.${newTime}&court_group=eq.${newCourt}&ladder_id=eq.${AdminState.currentLadder.id}&limit=1`,
      );
      if (existing.length) {
        const d = fmtDate(newDate, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        toast(
          `A session already exists for Court ${newCourt} on ${d} at ${window.fmtTime12(newTime)}. Please choose a different date, time, or court.`,
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

    const isSubRow = (r) => r.is_sub || AdminState.ladderPlayers.find(p => p.id === r.player_id)?.ladder_status === 'sub';
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
            <input type="hidden" id="eg-sub-ids-teamA" value="${teamA.filter(r => { const lp = AdminState.ladderPlayers.find(p => p.id === r.player_id); return r.is_sub || lp?.ladder_status === 'sub'; }).map(r=>r.id).join(',')}">
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
            <input type="hidden" id="eg-sub-ids-teamB" value="${teamB.filter(r => { const lp = AdminState.ladderPlayers.find(p => p.id === r.player_id); return r.is_sub || lp?.ladder_status === 'sub'; }).map(r=>r.id).join(',')}">
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
      if (AdminState.currentLadder && AdminState.currentLadder.name) {
        titleEl.textContent = AdminState.currentLadder.name;
        titleEl.style.display = 'block';
      } else {
        titleEl.style.display = 'none';
      }
    }
    AdminState.courtPlayers = [];
    AdminState.noShowPlayer = null;
    AdminState.noShowPenalty = -4;
    AdminState.subPlayers = new Set();
    AdminState.gameCount = 0;
    AdminState.extraGameCount = 0;
    AdminState.extraGames = [];
    document.getElementById('session-date').value = todayISO();
    document.getElementById('court-number').value = '';
    document.getElementById('court-players-list').innerHTML = '';
    document.getElementById('games-container').innerHTML = '';
    document.getElementById('games-setup-card').style.display = 'none';
    document.getElementById('save-btn-wrap').style.display = 'none';
    document.getElementById('player-search-entry').value = '';
    const psl = document.getElementById('player-dropdown-list');
    if (psl) psl.innerHTML = '';
    if (!AdminState.currentLadder) {
      document.getElementById('entry-no-ladder').style.display = 'block';
      document.getElementById('entry-form').style.display = 'none';
    } else {
      document.getElementById('entry-no-ladder').style.display = 'none';
      document.getElementById('entry-form').style.display = 'block';
      if (!AdminState.allPlayers.length) AdminState.allPlayers = await api('players?select=*&order=first_name');
      if (!AdminState.ladderPlayers.length) await window.loadLadderPlayers();
      renderPlayerDropdown('');
    }
  };

  const renderPlayerDropdown = (filter = '') => {
    const list = document.getElementById('player-dropdown-list');
    if (!list) return;
    const matches = AdminState.ladderPlayers
      .filter((p) => !AdminState.courtPlayers.find((cp) => cp.id === p.id))
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
    if (AdminState.courtPlayers.length >= 6) {
      toast('Maximum 6 players per court.', true);
      return;
    }
    const p = AdminState.ladderPlayers.find((x) => x.id === id);
    if (!p || AdminState.courtPlayers.find((cp) => cp.id === id)) return;
    AdminState.courtPlayers.push(p);
    // Auto-activate sub if player is registered as sub in this ladder
    if (p.ladder_status === 'sub') AdminState.subPlayers.add(id);
    document.getElementById('player-search-entry').value = '';
    renderPlayerDropdown('');
    renderCourtPlayers();
  };

  const removeCourtPlayer = (id) => {
    if (AdminState.noShowPlayer && AdminState.noShowPlayer.id === id) AdminState.noShowPlayer = null;
    AdminState.subPlayers.delete(id);
    AdminState.courtPlayers = AdminState.courtPlayers.filter((p) => p.id !== id);
    renderPlayerDropdown(document.getElementById('player-search-entry')?.value || '');
    renderCourtPlayers();
    if (AdminState.courtPlayers.filter((p) => !AdminState.noShowPlayer || p.id !== AdminState.noShowPlayer.id).length < 4) {
      document.getElementById('games-setup-card').style.display = 'none';
      document.getElementById('save-btn-wrap').style.display = 'none';
    }
  };

  const markNoShow = (pid) => {
    const id = parseInt(pid, 10);
    AdminState.subPlayers.delete(id); // can't be both sub and no-show
    AdminState.noShowPlayer = AdminState.courtPlayers.find((p) => p.id === id) || null;
    AdminState.noShowPenalty = -4;
    renderPlayerDropdown(document.getElementById('player-search-entry')?.value || '');
    renderCourtPlayers();
  };

  const markSub = (pid) => {
    const id = parseInt(pid, 10);
    // Can't be both sub and no-show
    if (AdminState.noShowPlayer && AdminState.noShowPlayer.id === id) { AdminState.noShowPlayer = null; AdminState.noShowPenalty = -4; }
    AdminState.subPlayers.add(id);
    renderCourtPlayers();
  };

  const unmarkSub = (pid) => {
    AdminState.subPlayers.delete(parseInt(pid, 10));
    renderCourtPlayers();
  };

  const cancelNoShow = () => {
    AdminState.noShowPlayer = null;
    AdminState.noShowPenalty = -4;
    renderCourtPlayers();
  };

  const renderCourtPlayers = () => {
    const el = document.getElementById('court-players-list');
    if (!AdminState.courtPlayers.length) {
      el.innerHTML = '';
      return;
    }
    const playerChipsHtml = AdminState.courtPlayers
      .map((p, i) => {
        const isNoShow = AdminState.noShowPlayer && AdminState.noShowPlayer.id === p.id;
        const isSub    = AdminState.subPlayers.has(p.id);
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
        AdminState.noShowPlayer
          ? `<div class="no-show-banner">
            <span class="text-bold color-orange" style="font-size:13px;">${esc(AdminState.noShowPlayer.first_name)} ${esc(AdminState.noShowPlayer.last_name)} did not show up.</span>
            <span class="text-muted-12">Assign penalty:</span>
            <label class="row gap-4 cursor-pointer text-bold color-orange" style="font-size:13px;">
              <input type="radio" name="noshow-penalty" id="ns-penalty" value="-4" ${AdminState.noShowPenalty === -4 ? 'checked' : ''}> -4 pts (penalty)
            </label>
            <label class="row gap-4 cursor-pointer text-bold text-muted-13">
              <input type="radio" name="noshow-penalty" id="ns-excused" value="0" ${AdminState.noShowPenalty === 0 ? 'checked' : ''}> 0 pts (excused)
            </label>
          </div>`
          : ''
      }`;

    const activePlayers = AdminState.courtPlayers.filter((p) => !AdminState.noShowPlayer || p.id !== AdminState.noShowPlayer.id);
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
    const players = activePlayers || AdminState.courtPlayers;
    const matchups = getRoundRobinMatchups(players.length);
    AdminState.gameCount = matchups.length;
    AdminState.extraGameCount = 0;
    AdminState.extraGames = [];
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
      AdminState.gameCount = 3;
      AdminState.extraGames = [4];
    }
    document.getElementById('games-setup-card').style.display = 'block';
    document.getElementById('save-btn-wrap').style.display = 'block';
  };

  const renderGameCard = (gameNum, matchup, isExtra, players) => {
    const activePl =
      players ||
      (AdminState.noShowPlayer ? AdminState.courtPlayers.filter((p) => p.id !== AdminState.noShowPlayer.id) : AdminState.courtPlayers);
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
                const sub = AdminState.subPlayers.has(p.id);
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
                const sub = AdminState.subPlayers.has(p.id);
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
    const isSub = (id) => AdminState.subPlayers.has(Number(id));
    const playerLabel = (id, pts) => {
      const p = AdminState.allPlayers.find(x => x.id == id);
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
    AdminState.extraGameCount++;
    const gameNum = 100 + AdminState.extraGameCount;
    AdminState.extraGames.push(gameNum);
    const container = document.getElementById('games-container');
    const players = AdminState.courtPlayers.filter((p) => !AdminState.noShowPlayer || p.id !== AdminState.noShowPlayer.id);
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
    AdminState.extraGames = AdminState.extraGames.filter((g) => g !== gameNum);
  };

  const submitSession = async () => {
    // Guard against double-submit (rapid double-click / double-tap). The
    // "does a session already exist" check and the insert below are two
    // separate awaited steps, so without this guard two near-simultaneous
    // clicks could both pass the check before either had inserted —
    // creating duplicate match rows. Disabling synchronously here, before
    // any await, closes that race: a disabled <button> does not dispatch a
    // second click event at all.
    const saveBtn = document.getElementById('save-session-btn');
    if (saveBtn && saveBtn.disabled) return;
    if (saveBtn) saveBtn.disabled = true;
    try {
    if (!AdminState.currentLadder) {
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
    if (!AdminState.courtPlayers.length) {
      toast('Please add players to the court.', true);
      return;
    }
    const rows = [];
    const extraGameMap = {};
    AdminState.extraGames.forEach((g, i) => {
      extraGameMap[g] = AdminState.gameCount + 1 + i;
    });
    const allGameNums = [...Array(AdminState.gameCount).keys()].map((i) => i + 1).concat(AdminState.extraGames);

    // Validate uniqueness: date + time + court must be unique
    const existing = await api(
      `matches?session_date=eq.${date}&session_time=eq.${sessionTm}&court_group=eq.${courtNum}&ladder_id=eq.${AdminState.currentLadder.id}&limit=1`,
    );
    if (existing.length) {
      const existingDate = fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      toast(
        `A session for Court ${courtNum} on ${existingDate} at ${window.fmtTime12(sessionTm)} already exists. Please choose a different date, time, or court.`,
        true,
      );
      return;
    }

    // Active player count
    const activePlayerCount = AdminState.courtPlayers.filter(
      (p) => !AdminState.noShowPlayer || p.id !== AdminState.noShowPlayer.id,
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
          const pA = AdminState.ladderPlayers.find((p) => p.id === pid);
          const isSubA = pA?.ladder_status === 'sub' || AdminState.subPlayers.has(pA?.id);
          rows.push({
            session_date: date, session_time: sessionTm, court_group: parseInt(courtNum, 10), player_id: pid,
            game_number: extraGameMap[gameNum] || gameNum,
            score_for: isVoided ? null : scoreA, score_against: isVoided ? null : scoreB,
            points_earned: isSubA ? 0 : ptA, is_sub: isSubA,
            default_no_show: false, ladder_id: AdminState.currentLadder.id,
          });
        });
        tBIds.forEach((pid) => {
          if (!pid) return;
          const pB = AdminState.ladderPlayers.find((p) => p.id === pid);
          const isSubB = pB?.ladder_status === 'sub' || AdminState.subPlayers.has(pB?.id);
          rows.push({
            session_date: date, session_time: sessionTm, court_group: parseInt(courtNum, 10), player_id: pid,
            game_number: extraGameMap[gameNum] || gameNum,
            score_for: isVoided ? null : scoreB, score_against: isVoided ? null : scoreA,
            points_earned: isSubB ? 0 : ptB, is_sub: isSubB,
            default_no_show: false, ladder_id: AdminState.currentLadder.id,
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
          const p = AdminState.ladderPlayers.find((lp) => lp.id === pid);
          rows.push({
            session_date: date, session_time: sessionTm, court_group: parseInt(courtNum, 10), player_id: pid,
            game_number: extraGameMap[gameNum] || gameNum,
            score_for: null, score_against: null,
            points_earned: 0, is_sub: p?.ladder_status === 'sub' || AdminState.subPlayers.has(p?.id),
            default_no_show: false, ladder_id: AdminState.currentLadder.id,
          });
        });
      }
    }

    // No-show player always included regardless of mode
    if (AdminState.noShowPlayer) {
      rows.push({
        session_date: date, session_time: sessionTm, court_group: parseInt(courtNum, 10), player_id: AdminState.noShowPlayer.id,
        game_number: 1, score_for: null, score_against: null,
        points_earned: AdminState.noShowPenalty, is_sub: AdminState.noShowPlayer.ladder_status === 'sub',
        default_no_show: true, ladder_id: AdminState.currentLadder.id,
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
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  };


  // ── Expose / register with the shared infrastructure ──────────────────
  window.dedupeMatches       = dedupeMatches;       // used by loadLaddersPage (stays in app.js)
  window.loadSessions        = loadSessions;        // called from the page router
  window.initEntry           = initEntry;           // called from the page router
  window.calcPoints          = calcPoints;          // called from the generic input listener
  window.searchPlayersEntry  = searchPlayersEntry;   // called from the generic input listener
  window.autoCalcGame        = autoCalcGame;         // called from the generic input listener
  window.autoCalcExtraGame   = autoCalcExtraGame;    // called from the generic input listener

  Object.assign(window.CLICK_HANDLERS, {
    toggleSessionGroup:   (btn) => toggleSessionGroup(btn),
    editSession:          (btn) => editSession(btn),
    deleteSession:        (btn) => deleteSession(btn),
    editGame:              (btn) => editGame(btn),
    toggleEditGameVoid:    () => toggleEditGameVoid(),
    addCourtPlayerBtn:     (btn) => addCourtPlayer(parseInt(btn.dataset.pid, 10)),
    removeCourtPlayerBtn:  (btn) => removeCourtPlayer(parseInt(btn.dataset.pid, 10)),
    markNoShow:            (btn) => markNoShow(btn.dataset.pid),
    markSub:               (btn) => markSub(btn.dataset.pid),
    unmarkSub:             (btn) => unmarkSub(btn.dataset.pid),
    cancelNoShow:          () => cancelNoShow(),
    toggleVoid:            (btn) => toggleVoid(parseInt(btn.dataset.gamenum, 10)),
    addExtraGame:          () => addExtraGame(),
    removeExtraGame:       (btn) => removeExtraGame(parseInt(btn.dataset.gamenum, 10)),
    submitSession:         () => submitSession(),
  });

  // Own these two forms' submit listeners directly (DOM is already parsed
  // by the time this script runs, same as every other listener).
  document.getElementById('edit-session-form')?.addEventListener('submit', saveEditSession);
  document.getElementById('edit-game-form')?.addEventListener('submit', saveEditGame);
})();
