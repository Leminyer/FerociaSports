/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PLAYER PROFILE (full page)
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-player-profile.js -> app.js

   Replaces the old player-profile MODAL (which lived in
   admin-players.js / #player-profile-modal) with a full page, matching
   the design team's mockup: breadcrumb, header, tab navigation
   (Overview | Competition | DNA | Reliability | Membership | History |
   Admin Notes), and a search box to jump between players without
   leaving the page.

   SCOPE OF THIS DELIVERY — only "Overview" has a finished design from
   the founder's team, so only it is built with real content. The other
   6 tabs render a "Coming Soon" placeholder until designs arrive.

   HONEST DATA NOTES (flagged and approved as temporary/estimated):
     - No player photos — initials avatar only (matches the rest of
       the admin).
     - "Avg Opponent Level" has no real backing data yet (no rating
       system) — shows "—" until one exists.
     - date_of_birth / location / email_verified / phone_verified are
       real columns on `players` now, but nothing in the admin writes
       to them yet (planned for the future Player DNA module) — they
       show blank/"Unverified" for every player until then.
     - "Next Activity" — ladders have no structured recurring-schedule
       field (just a session_time on past sessions), so the next date
       shown is an ESTIMATE (last session's date + 7 days), labeled as
       such rather than presented as a confirmed schedule.

   The old modal (#player-profile-modal and its logic in
   admin-players.js) is left in place for now, unused — cleanup is a
   follow-up once this page is confirmed to fully replace it.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;
  const CFG = window.FEROCIA_CONFIG;

  // Current player's fully-computed data, kept around so tab-switching
  // doesn't require a re-fetch.
  let _ppCurrent = null;

  // ── Small shared helpers ────────────────────────────────────────────────
  const ppSVG = (d, color = 'var(--text-muted)', w = 12) =>
    `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    gender:   '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    ladder:   '<rect x="2" y="7" width="20" height="14" rx="2"/><polyline points="16 3 12 7 8 3"/>',
    pin:      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    trophy:   '<path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/>',
    search:   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    clock:    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    mail:     '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    phone:    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    skill:    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    flag:     '<line x1="4" y1="22" x2="4" y2="15"/><path d="M4 3v12s2-2 6-2 6 2 6 2V3s-2 2-6 2-6-2-6-2z"/>',
    home:     '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    arrowL:   '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    edit:     '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    link:     '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    history:  '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    dots:     '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  };

  const fmtShort = (d) => { if (!d) return ''; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  const ageFromDOB = (dob) => {
    if (!dob) return null;
    const b = new Date(dob + 'T00:00:00');
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
    return age;
  };

  // ── Fetch + compute everything for one player ──────────────────────────
  const fetchPlayerProfile = async (id) => {
    let p = (AdminState.allPlayers || []).find((x) => x.id === id);
    if (!p) {
      const rows = await api(`players?id=eq.${id}&select=*`).catch(() => []);
      p = rows[0];
    }
    if (!p) return null;

    const rpc = async (fn, args) => {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) { console.warn(`[rpc] ${fn}:`, error.message); return []; }
      return data || [];
    };

    const [allMatches, ladderPlayerRows, allLadders,
      myTournTeams, myTournaments, myTournCategories, allBracketMatches,
    ] = await Promise.all([
      api(`matches?player_id=eq.${id}&select=*&order=session_date.desc`).catch(() => []),
      api(`ladder_players?player_id=eq.${id}&select=*`).catch(() => []),
      api('ladders?select=id,name,status,location').catch(() => []),
      rpc('get_player_tournament_teams',     { p_player_id: id }),
      rpc('get_player_tournaments',           { p_player_id: id }),
      rpc('get_player_tournament_categories', { p_player_id: id }),
      rpc('get_player_bracket_matches',       { p_player_id: id }),
    ]);

    const ladderMatches = allMatches.filter((m) => !m.default_no_show && m.score_for !== null && m.score_against !== null);
    const ladderWins    = ladderMatches.filter((m) => m.score_for > m.score_against).length;
    const ladderLosses  = ladderMatches.length - ladderWins;
    const ladderPlayed  = ladderMatches.length;

    const ladderIds  = [...new Set(ladderPlayerRows.map((lp) => lp.ladder_id))];
    const myLadders  = allLadders.filter((l) => ladderIds.includes(l.id));
    const activeLadder = myLadders.find((l) => {
      const lp = ladderPlayerRows.find((r) => r.ladder_id === l.id);
      return l.status === 'active' && lp && lp.status !== 'sub';
    }) || myLadders.find((l) => l.status === 'active');

    const myTeamIds = (myTournTeams || []).map((tt) => tt.id);
    const myBracketMatches = (allBracketMatches || []).filter((bm) => bm.status === 'completed');
    const tournWins   = myBracketMatches.filter((bm) => myTeamIds.includes(bm.winner_id)).length;
    const tournLosses = myBracketMatches.length - tournWins;

    const totalWins   = ladderWins + tournWins;
    const totalLosses = ladderLosses + tournLosses;
    const totalPlayed = ladderPlayed + myBracketMatches.length;
    const winPct      = totalPlayed > 0 ? Math.round((totalWins / totalPlayed) * 100) : 0;

    // Streak (from most-recent-first ladder matches)
    const orderedResults = ladderMatches.map((m) => (m.score_for > m.score_against ? 'W' : 'L'));
    let streak = 0, streakType = '';
    if (orderedResults.length) {
      streakType = orderedResults[0];
      for (let i = 0; i < orderedResults.length; i++) {
        if (orderedResults[i] === streakType) streak++; else break;
      }
    }
    // Best win streak / longest loss streak (scan full history)
    let bestWinStreak = 0, longestLossStreak = 0, curW = 0, curL = 0;
    orderedResults.slice().reverse().forEach((r) => { // oldest -> newest for a natural streak scan
      if (r === 'W') { curW++; curL = 0; bestWinStreak = Math.max(bestWinStreak, curW); }
      else { curL++; curW = 0; longestLossStreak = Math.max(longestLossStreak, curL); }
    });

    // Opponent names for recent matches (same technique as the old modal)
    const recent8 = ladderMatches.slice(0, 4); // "Recent Activity" shows the latest 4
    let opponentMap = {};
    if (recent8.length) {
      try {
        const uniqDates   = [...new Set(recent8.map((m) => m.session_date))];
        const uniqLadders = [...new Set(recent8.map((m) => m.ladder_id))];
        const siblings = await api(
          `matches?player_id=neq.${id}&session_date=in.(${uniqDates.join(',')})&ladder_id=in.(${uniqLadders.join(',')})&select=id,player_id,session_date,court_group,game_number,ladder_id,score_for,score_against`,
        );
        const sibPlayerIds = [...new Set(siblings.map((s) => s.player_id).filter(Boolean))];
        let playerNameMap = {};
        if (sibPlayerIds.length) {
          const playerRows = await api(`players?id=in.(${sibPlayerIds.join(',')})&select=id,first_name,last_name`);
          playerRows.forEach((pr) => { playerNameMap[pr.id] = `${pr.first_name} ${pr.last_name}`; });
        }
        recent8.forEach((m) => {
          const slotSibs = siblings.filter((s) =>
            s.session_date === m.session_date && s.court_group === m.court_group &&
            s.game_number === m.game_number && s.ladder_id === m.ladder_id,
          );
          const opponents = slotSibs.filter((s) => s.score_for === m.score_against);
          const chosen = opponents.length ? opponents : slotSibs.slice(0, 2);
          if (chosen.length) opponentMap[m.id] = chosen.map((s) => playerNameMap[s.player_id] || `#${s.player_id}`).join(' & ');
        });
      } catch (e) { /* best-effort only */ }
    }

    return {
      p, allMatches, ladderMatches, ladderWins, ladderLosses, ladderPlayed,
      myLadders, ladderPlayerRows, activeLadder,
      myTournaments: myTournaments || [], myTournCategories: myTournCategories || [],
      myBracketMatches, myTeamIds,
      totalWins, totalLosses, totalPlayed, winPct,
      streak, streakType, bestWinStreak, longestLossStreak,
      orderedResults, recent8, opponentMap,
    };
  };

  // ── Header ───────────────────────────────────────────────────────────
  const renderHeader = (d) => {
    const { p } = d;
    const initials = ((p.first_name || '')[0] || '').toUpperCase() + ((p.last_name || '')[0] || '').toUpperCase();
    const avColors = ['var(--blue)', 'var(--orange)', 'var(--teal)', '#9a6e00', '#7B2FBE', '#C04A0E'];
    const avColor  = avColors[p.id % avColors.length];
    const isActive = p.status === 'active';
    const streakColor = d.streakType === 'W' ? 'var(--teal)' : 'var(--orange)';

    document.getElementById('pp-crumb-name').textContent = `${p.first_name} ${p.last_name}`;

    const wrap = document.getElementById('pp-header-wrap');
    wrap.innerHTML = `
      <div class="pp-header">
        <div class="pp-id">
          <div class="pp-av" style="background:${avColor};">${esc(initials)}</div>
          <div>
            <span class="${isActive ? 'ppm-active' : 'ppm-inactive'}">${isActive ? '● Active' : '○ Inactive'}</span>
            <div class="pp-name">${esc(p.first_name)} ${esc(p.last_name)}</div>
            ${p.current_rank ? `
              <div class="pp-rank">
                <span class="pp-rank-icon">${ppSVG(ICONS.trophy, '#7B2FBE', 22)}</span>
                <div>
                  <div class="pp-rank-lbl">FEROCIA Rank</div>
                  <div class="pp-rank-num">#${p.current_rank}</div>
                </div>
              </div>` : ''}
            <div class="pp-meta-row">
              ${p.gender ? `<span class="pp-meta">${ppSVG(ICONS.gender)} ${esc(p.gender)}</span>` : ''}
              ${p.date_joined ? `<span class="pp-meta">${ppSVG(ICONS.calendar)} Joined ${fmtDate(p.date_joined)}</span>` : ''}
              <span class="pp-meta">${ppSVG(ICONS.ladder)} ${d.myLadders.length} Ladder${d.myLadders.length !== 1 ? 's' : ''}</span>
              <span class="pp-meta">${ppSVG(ICONS.pin)} ${p.location ? esc(p.location) : '—'}</span>
            </div>
          </div>
        </div>
        <div class="pp-actions-col">
          <div class="pp-actions">
            <button class="pp-btn pp-btn-outline" data-action="ppPrevPlayer">${ppSVG(ICONS.arrowL, 'var(--blue)', 12)} Previous Player</button>
            <button class="pp-btn pp-btn-outline" data-action="ppSendMessage">${ppSVG(ICONS.mail, 'var(--blue)', 12)} Send Message</button>
            <div style="position:relative;">
              <button class="pp-btn pp-btn-outline" data-action="ppToggleMore">More ${ppSVG(ICONS.dots, 'var(--blue)', 12)}</button>
              <div id="pp-more-menu" style="display:none;position:absolute;top:calc(100% + 6px);right:0;background:white;border:0.5px solid #e0e7f5;border-radius:10px;box-shadow:0 8px 24px rgba(8,15,46,.12);min-width:210px;z-index:60;overflow:hidden;">
                <button data-action="ppEditPlayer" style="width:100%;text-align:left;padding:10px 14px;font-size:12px;font-weight:700;color:var(--text);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;">${ppSVG(ICONS.edit, 'var(--text-muted)')} Edit Player</button>
                <button data-action="ppViewHistory" style="width:100%;text-align:left;padding:10px 14px;font-size:12px;font-weight:700;color:var(--text);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;">${ppSVG(ICONS.history, 'var(--text-muted)')} Status History</button>
                ${p.portal_token ? `<button data-action="ppCopyDnaLink" style="width:100%;text-align:left;padding:10px 14px;font-size:12px;font-weight:700;color:var(--text);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;border-top:0.5px solid #f4f5f8;">${ppSVG(ICONS.link, 'var(--text-muted)')} Copy Player DNA Link</button>` : ''}
                ${(p.email && !p.email_verified) ? `<button data-action="ppResendEmailVerification" style="width:100%;text-align:left;padding:10px 14px;font-size:12px;font-weight:700;color:var(--text);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;border-top:0.5px solid #f4f5f8;">${ppSVG(ICONS.mail, 'var(--text-muted)')} Resend Email Verification</button>` : ''}
                ${(p.phone && !p.phone_verified) ? `<button data-action="ppResendSmsVerification" style="width:100%;text-align:left;padding:10px 14px;font-size:12px;font-weight:700;color:var(--text);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;${(p.email && !p.email_verified) ? '' : 'border-top:0.5px solid #f4f5f8;'}">${ppSVG(ICONS.phone, 'var(--text-muted)')} Resend SMS Verification</button>` : ''}
                <button data-action="ppResetPlayerDna" style="width:100%;text-align:left;padding:10px 14px;font-size:12px;font-weight:700;color:var(--orange);background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;border-top:0.5px solid #f4f5f8;">${ppSVG('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>', 'var(--orange)')} Reset Player DNA</button>
              </div>
            </div>
          </div>
          <div class="pp-stats-box">
            <div class="pp-stat-mini">
              <div class="pp-stat-mini-icon" style="background:#e8f0ff;">${ppSVG(ICONS.flag, 'var(--blue)', 16)}</div>
              <div><div class="pp-stat-mini-val">${d.totalPlayed}</div><div class="pp-stat-mini-lbl">Matches Played</div></div>
            </div>
            <div class="pp-stat-mini">
              <div class="pp-stat-mini-icon" style="background:rgba(36,188,150,0.12);">${ppSVG('<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>', 'var(--teal)', 16)}</div>
              <div><div class="pp-stat-mini-val" style="color:var(--teal);">${d.winPct}%</div><div class="pp-stat-mini-lbl">Win Rate</div></div>
            </div>
            <div class="pp-stat-mini">
              <div class="pp-stat-mini-icon" style="background:rgba(246,166,35,0.15);">${ppSVG(ICONS.trophy, '#9a6200', 16)}</div>
              <div><div class="pp-stat-mini-val">${d.totalWins}W - ${d.totalLosses}L</div><div class="pp-stat-mini-lbl">Overall Record</div></div>
            </div>
            <div class="pp-stat-mini">
              <div class="pp-stat-mini-icon" style="background:${d.streakType === 'W' ? 'rgba(36,188,150,0.12)' : 'rgba(242,96,36,0.12)'};">${ppSVG('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', streakColor, 16)}</div>
              <div><div class="pp-stat-mini-val" style="color:${streakColor};">${d.streak}</div><div class="pp-stat-mini-lbl">Current Streak ${d.streakType === 'W' ? 'Wins' : 'Losses'}</div></div>
            </div>
          </div>
        </div>
      </div>`;
  };

  // ── Overview tab ─────────────────────────────────────────────────────
  const renderOverview = (d) => {
    const el = document.getElementById('pp-tab-overview');

    // Performance Snapshot — period-filterable (Last 30 Days / All Time)
    const renderSnapshot = (period) => {
      const cutoff = period === '30d' ? Date.now() - 30 * 86400000 : null;
      const inPeriod = d.ladderMatches.filter((m) => !cutoff || new Date(m.session_date) >= cutoff);
      const wins   = inPeriod.filter((m) => m.score_for > m.score_against).length;
      const losses = inPeriod.length - wins;
      const wr     = inPeriod.length ? Math.round((wins / inPeriod.length) * 100) : 0;
      const pts    = inPeriod.reduce((s, m) => s + (m.points_earned || 0), 0);
      return `
        <div class="ppm-snap-grid" style="grid-template-columns:repeat(4,1fr);">
          <div class="ppm-snap-card"><div class="ppm-snap-val">${inPeriod.length}</div><div class="ppm-snap-lbl">Matches Played</div></div>
          <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:var(--teal);">${wins}</div><div class="ppm-snap-lbl">Wins</div></div>
          <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:var(--orange);">${losses}</div><div class="ppm-snap-lbl">Losses</div></div>
          <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:var(--blue);">${wr}%</div><div class="ppm-snap-lbl">Win Rate</div></div>
          <div class="ppm-snap-card"><div class="ppm-snap-val">${d.myTournaments.length}</div><div class="ppm-snap-lbl">Tournaments</div></div>
          <div class="ppm-snap-card"><div class="ppm-snap-val">${d.myLadders.length}</div><div class="ppm-snap-lbl">Ladder Season${d.myLadders.length !== 1 ? 's' : ''}</div></div>
          <div class="ppm-snap-card"><div class="ppm-snap-val" style="color:#b0bbd6;">—</div><div class="ppm-snap-lbl">Avg Opponent Level</div></div>
          <div class="ppm-snap-card"><div class="ppm-snap-val">${pts}</div><div class="ppm-snap-lbl">Points Earned</div></div>
        </div>`;
    };

    // Current Form — last 9 results as dots + streak banner + Win Rate Trend
    const last9 = d.orderedResults.slice(0, 9).slice().reverse(); // oldest -> newest, left to right
    const formDotsHTML = last9.map((r) =>
      `<div class="pp-form-dot ${r === 'W' ? 'pp-form-w' : 'pp-form-l'}">${r}</div>`,
    ).join('') || '<div class="pp-empty">No matches yet.</div>';

    const streakBannerHTML = d.streak > 0
      ? `<div class="pp-streak-banner ${d.streakType === 'W' ? 'pp-streak-good' : ''}">
          <span style="flex-shrink:0;">${d.streakType === 'W'
            ? ppSVG('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 'var(--teal)', 18)
            : ppSVG('<path d="M12 2v20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07M2 12h20M6 6l4 4M18 6l-4 4M6 18l4-4M18 18l-4-4"/>', 'var(--orange)', 18)}</span>
          <div>
            <div style="font-size:12px;font-weight:800;color:${d.streakType === 'W' ? '#085041' : 'var(--orange)'};">${d.streak} Consecutive ${d.streakType === 'W' ? 'Win' : 'Loss'}${d.streak !== 1 ? 'es' : ''}</div>
            <div style="font-size:10px;font-weight:600;color:var(--text-muted);">${d.streakType === 'W' ? 'On fire!' : 'Keep pushing!'}</div>
          </div>
        </div>` : '';

    // Win rate trend: group ladder matches into the last 5 calendar weeks
    const weeks = [];
    for (let i = 4; i >= 0; i--) {
      const end = new Date(); end.setDate(end.getDate() - i * 7);
      const start = new Date(end); start.setDate(start.getDate() - 6);
      const inWeek = d.ladderMatches.filter((m) => {
        const dt = new Date(m.session_date);
        return dt >= start && dt <= end;
      });
      const wr = inWeek.length ? Math.round((inWeek.filter((m) => m.score_for > m.score_against).length / inWeek.length) * 100) : null;
      weeks.push({ label: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), wr });
    }
    const maxWr = Math.max(40, ...weeks.map((w) => w.wr || 0));
    const axisMax = Math.ceil(maxWr / 20) * 20; // round up to the next 20% tick
    const chartW = 230, chartH = 90, padY = 8;
    const validPts = weeks.map((w, i) => ({ i, wr: w.wr })).filter((w) => w.wr !== null);
    const xStep = chartW / Math.max(1, weeks.length - 1);
    const yFor = (wr) => chartH - padY - (wr / axisMax) * (chartH - padY * 2);
    const points = validPts.map((w) => `${w.i * xStep},${yFor(w.wr)}`).join(' ');
    const ticks = [axisMax, axisMax / 2, 0];
    const gridSVG = ticks.map((t) => `<line x1="0" y1="${yFor(t)}" x2="${chartW}" y2="${yFor(t)}" stroke="var(--bg)" stroke-width="1"/>`).join('');
    const trendSVG = validPts.length >= 2
      ? `<svg width="100%" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="none" style="overflow:visible;">
           ${gridSVG}
           <polyline points="${points}" fill="none" stroke="var(--blue)" stroke-width="2"/>
           ${validPts.map((w) => `<circle cx="${w.i * xStep}" cy="${yFor(w.wr)}" r="2.5" fill="var(--blue)"/>`).join('')}
         </svg>`
      : '<div class="pp-empty">Not enough recent matches for a trend yet.</div>';
    const yAxisLabelsHTML = ticks.map((t) => `<span>${t}%</span>`).join('');
    const weekLabelsHTML = weeks.map((w) => `<span>${w.label}</span>`).join('');

    // Next Activity — estimated from the active ladder's most recent session + 7 days
    let nextActivityHTML = '<div class="pp-empty">No upcoming activity to show.</div>';
    if (d.activeLadder) {
      const lastSession = d.allMatches.find((m) => m.ladder_id === d.activeLadder.id);
      if (lastSession) {
        const sessionCount = new Set(d.allMatches.filter((m) => m.ladder_id === d.activeLadder.id).map((m) => m.session_date)).size;
        const est = new Date(lastSession.session_date + 'T00:00:00');
        est.setDate(est.getDate() + 7);
        const estTime = lastSession.session_time
          ? new Date(`1970-01-01T${lastSession.session_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          : '';
        nextActivityHTML = `
          <div style="background:rgba(36,188,150,0.06);border:0.5px solid rgba(36,188,150,0.2);border-radius:12px;padding:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
              ${ppSVG(ICONS.trophy, 'var(--teal)', 20)}
              <div>
                <div style="font-size:13px;font-weight:800;color:var(--text);">${esc(d.activeLadder.name)}</div>
                <div style="font-size:11px;font-weight:700;color:var(--text-muted);">Round ${sessionCount + 1}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
              <div style="text-align:center;background:#e8f0ff;border-radius:8px;padding:4px 9px;flex-shrink:0;">
                <div style="font-size:8px;font-weight:800;color:var(--blue);text-transform:uppercase;">${est.toLocaleDateString('en-US', { month: 'short' })}</div>
                <div style="font-family:'Inter',sans-serif;font-size:16px;color:var(--blue);line-height:1;">${est.getDate()}</div>
              </div>
              ${estTime ? `<span style="font-size:12px;font-weight:700;color:var(--text);">${estTime}</span>` : ''}
            </div>
            ${d.activeLadder.location ? `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                ${ppSVG(ICONS.pin, 'var(--teal)', 14)}
                <span style="font-size:12px;font-weight:700;color:var(--text);">${esc(d.activeLadder.location)}</span>
              </div>` : ''}
          </div>
          <button class="pp-btn pp-btn-outline" style="width:100%;justify-content:center;margin-top:12px;" data-action="ppViewLadder" data-ladderid="${d.activeLadder.id}">View Ladder</button>`;
      }
    }

    // Recent Activity
    const recentActivityHTML = d.recent8.length
      ? d.recent8.map((m) => {
          const won = m.score_for > m.score_against;
          const oppName = d.opponentMap[m.id] || 'Opponent';
          return `<div class="ppm-tl-item">
            <div class="${won ? 'ppm-pill-w' : 'ppm-pill-l'}" style="width:22px;height:22px;font-size:9px;">${won ? 'W' : 'L'}</div>
            <div style="flex:1;">
              <div class="ppm-tl-text">${won ? 'Won' : 'Lost'} vs ${esc(oppName)}</div>
              <div class="ppm-tl-ctx">Ladder match</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:13px;font-weight:800;color:${won ? 'var(--teal)' : 'var(--orange)'};">${m.score_for}–${m.score_against}</div>
              <div class="ppm-tl-date" style="margin-top:2px;">${fmtShort(m.session_date)}</div>
            </div>
          </div>`;
        }).join('')
      : '<div class="pp-empty">No recent activity yet.</div>';

    // Career Statistics
    const careerHTML = `
      <div class="ppm-career-grid" style="grid-template-columns:repeat(2,1fr);">
        <div class="ppm-career-card"><div class="ppm-career-lbl">Matches Played</div><div class="ppm-career-val">${d.totalPlayed}</div></div>
        <div class="ppm-career-card"><div class="ppm-career-lbl">Win Rate</div><div class="ppm-career-val" style="color:var(--teal);">${d.winPct}%</div></div>
        <div class="ppm-career-card"><div class="ppm-career-lbl">Total Wins</div><div class="ppm-career-val" style="color:var(--teal);">${d.totalWins}</div></div>
        <div class="ppm-career-card"><div class="ppm-career-lbl">Total Losses</div><div class="ppm-career-val" style="color:var(--orange);">${d.totalLosses}</div></div>
        <div class="ppm-career-card"><div class="ppm-career-lbl">Best Win Streak</div><div class="ppm-career-val">${d.bestWinStreak}</div></div>
        <div class="ppm-career-card"><div class="ppm-career-lbl">Longest Loss Streak</div><div class="ppm-career-val">${d.longestLossStreak}</div></div>
      </div>`;

    // Quick Info
    const p = d.p;
    const age = ageFromDOB(p.date_of_birth);
    const quickInfoHTML = `
      <div class="pp-quick-row"><div class="pp-quick-lbl">${ppSVG(ICONS.mail)} Email</div><div class="pp-quick-val">${p.email ? esc(p.email) : '—'} ${p.email ? `<span class="${p.email_verified ? 'pp-pill-verified' : 'pp-pill-unverified'}">${p.email_verified ? 'Verified' : 'Unverified'}</span>` : ''}</div></div>
      <div class="pp-quick-row"><div class="pp-quick-lbl">${ppSVG(ICONS.phone)} Phone</div><div class="pp-quick-val">${p.phone ? esc(p.phone) : '—'} ${p.phone ? `<span class="${p.phone_verified ? 'pp-pill-verified' : 'pp-pill-unverified'}">${p.phone_verified ? 'Verified' : 'Unverified'}</span>` : ''}</div></div>
      <div class="pp-quick-row"><div class="pp-quick-lbl">${ppSVG(ICONS.skill)} Skill Level</div><div class="pp-quick-val">${p.skill_level ? esc(p.skill_level) : '—'}</div></div>
      <div class="pp-quick-row"><div class="pp-quick-lbl">${ppSVG(ICONS.calendar)} Date of Birth</div><div class="pp-quick-val">${p.date_of_birth ? `${fmtDate(p.date_of_birth)}${age !== null ? ` (${age})` : ''}` : '—'}</div></div>
      <div class="pp-quick-row"><div class="pp-quick-lbl">${ppSVG(ICONS.pin)} Location</div><div class="pp-quick-val">${p.location ? esc(p.location) : '—'}</div></div>`;

    el.innerHTML = `
      <div class="pp-grid">
        <div class="pp-card">
          <div class="pp-card-hdr">
            <span class="pp-card-title" style="display:flex;align-items:center;gap:6px;">PERFORMANCE SNAPSHOT ${ppSVG('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', '#b0bbd6', 13)}</span>
            <select id="pp-snap-period" style="font-size:11px;font-weight:700;color:var(--text-muted);border:0.5px solid #e0e7f5;border-radius:99px;padding:4px 10px;background:#f8f9ff;font-family:'Inter',sans-serif;">
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>
          <div class="pp-card-body" id="pp-snap-body">${renderSnapshot('30d')}</div>
        </div>

        <div class="pp-card">
          <div class="pp-card-hdr"><span class="pp-card-title" style="display:flex;align-items:center;gap:6px;">CURRENT FORM ${ppSVG('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', '#b0bbd6', 13)}</span></div>
          <div class="pp-card-body">
            <div class="pp-form-row">${formDotsHTML}</div>
            ${streakBannerHTML}
            <div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px;">Win Rate Trend</div>
            <div style="display:flex;gap:6px;">
              <div style="display:flex;flex-direction:column;justify-content:space-between;font-size:8px;font-weight:700;color:#b0bbd6;height:${90}px;flex-shrink:0;">${yAxisLabelsHTML}</div>
              <div style="flex:1;min-width:0;">
                ${trendSVG}
                <div style="display:flex;justify-content:space-between;font-size:9px;font-weight:600;color:#b0bbd6;margin-top:4px;">${weekLabelsHTML}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="pp-card">
          <div class="pp-card-hdr"><span class="pp-card-title">NEXT ACTIVITY</span></div>
          <div class="pp-card-body">${nextActivityHTML}</div>
        </div>

        <div class="pp-card">
          <div class="pp-card-hdr"><span class="pp-card-title">RECENT ACTIVITY</span></div>
          <div class="pp-card-body">
            <div style="flex:1;">${recentActivityHTML}</div>
            <div style="margin-top:10px;"><a class="pp-link" data-action="ppShowTab" data-pptab="history">View All Activity →</a></div>
          </div>
        </div>

        <div class="pp-card">
          <div class="pp-card-hdr"><span class="pp-card-title">CAREER STATISTICS</span></div>
          <div class="pp-card-body">
            <div style="flex:1;">${careerHTML}</div>
            <div style="margin-top:12px;"><a class="pp-link" data-action="ppShowTab" data-pptab="competition">View Full Statistics →</a></div>
          </div>
        </div>

        <div class="pp-card">
          <div class="pp-card-hdr"><span class="pp-card-title">QUICK INFO</span></div>
          <div class="pp-card-body">
            <div style="flex:1;">${quickInfoHTML}</div>
            <div style="margin-top:12px;"><a class="pp-link" data-action="ppEditPlayer">View Full Profile →</a></div>
          </div>
        </div>
      </div>`;

    // Period filter — recompute Snapshot only, no full re-render/refetch
    document.getElementById('pp-snap-period')?.addEventListener('change', (e) => {
      document.getElementById('pp-snap-body').innerHTML = renderSnapshot(e.target.value);
    });
  };

  // ── "Coming Soon" placeholder for tabs the design team hasn't shipped yet ──
  const renderSoon = (tabId, label) => {
    const el = document.getElementById(`pp-tab-${tabId}`);
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';
    el.innerHTML = `
      <div class="pp-soon-card">
        <div class="pp-soon-icon">${ppSVG(ICONS.clock, 'var(--blue)', 24)}</div>
        <div class="pp-soon-title">${label} — Coming Soon</div>
        <div class="pp-soon-text">This tab is being designed right now. Once the design is ready, it'll be built out here.</div>
      </div>`;
  };

  // ── Tab switching ────────────────────────────────────────────────────
  const ppShowTab = (tab) => {
    document.querySelectorAll('.pp-tab').forEach((b) => b.classList.toggle('pp-tab-on', b.dataset.pptab === tab));
    document.querySelectorAll('.pp-tab-content').forEach((c) => { c.style.display = 'none'; });
    const target = document.getElementById(`pp-tab-${tab}`);
    if (target) target.style.display = '';
    const labels = { competition: 'Competition', dna: 'DNA', reliability: 'Reliability', membership: 'Membership', history: 'History', adminnotes: 'Admin Notes' };
    if (labels[tab]) renderSoon(tab, labels[tab]);
  };

  // ── Search — jump to another player without leaving the page ───────────
  const ppWireSearch = () => {
    const input = document.getElementById('pp-search-input');
    const results = document.getElementById('pp-search-results');
    if (!input || !results) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
      const matches = (AdminState.allPlayers || [])
        .filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
        .slice(0, 8);
      if (!matches.length) {
        results.innerHTML = '<div class="pp-search-row" style="color:#b0bbd6;cursor:default;">No players found</div>';
      } else {
        results.innerHTML = matches.map((p) =>
          `<div class="pp-search-row" data-pid="${p.id}">${esc(p.first_name)} ${esc(p.last_name)}</div>`,
        ).join('');
        results.querySelectorAll('.pp-search-row[data-pid]').forEach((row) => {
          row.addEventListener('click', () => {
            results.style.display = 'none';
            input.value = '';
            loadPlayerProfilePage(null, parseInt(row.dataset.pid, 10));
          });
        });
      }
      results.style.display = 'block';
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.pp-search-wrap')) results.style.display = 'none';
    });
  };

  // ── Main entry point ─────────────────────────────────────────────────
  const loadPlayerProfilePage = async (btn, idOverride) => {
    const id = idOverride ?? (btn && btn.dataset && btn.dataset.pid ? parseInt(btn.dataset.pid, 10) : null);
    if (!id) return;

    document.getElementById('pp-header-wrap').innerHTML = '<div class="loading" style="padding:40px;">Loading player profile...</div>';
    document.querySelectorAll('.pp-tab-content').forEach((c) => { c.innerHTML = ''; c.removeAttribute('data-rendered'); });
    ppShowTab('overview');

    const d = await fetchPlayerProfile(id);
    if (!d) {
      document.getElementById('pp-header-wrap').innerHTML = '<div class="empty">Player not found.</div>';
      return;
    }
    _ppCurrent = d;

    renderHeader(d);
    renderOverview(d);
  };

  // ── Previous Player — steps back through the roster, sorted by name ────
  const ppPrevPlayer = () => {
    if (!_ppCurrent) return;
    const sorted = [...(AdminState.allPlayers || [])].sort((a, b) =>
      `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`),
    );
    const idx = sorted.findIndex((p) => p.id === _ppCurrent.p.id);
    if (idx > 0) loadPlayerProfilePage(null, sorted[idx - 1].id);
    else toast('This is the first player alphabetically.');
  };

  // ── More menu actions ────────────────────────────────────────────────
  const ppToggleMore = () => {
    const menu = document.getElementById('pp-more-menu');
    if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  };
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('pp-more-menu');
    if (menu && menu.style.display !== 'none' && !e.target.closest('[data-action="ppToggleMore"]') && !e.target.closest('#pp-more-menu')) {
      menu.style.display = 'none';
    }
  });

  const ppEditPlayer = () => {
    if (_ppCurrent) window.openEdit(_ppCurrent.p.id);
  };
  const ppViewHistory = () => {
    if (!_ppCurrent) return;
    document.getElementById('edit-id').value = _ppCurrent.p.id;
    window.openPlayerHistory();
  };
  const ppCopyDnaLink = () => {
    if (!_ppCurrent?.p?.portal_token) return;
    const base = window.location.origin + window.location.pathname.replace(/admin\.html$/, '');
    const url  = `${base}portal/player-dna.html?t=${_ppCurrent.p.portal_token}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(() => toast('Player DNA link copied!'), () => toast(url));
    } else {
      toast(url);
    }
  };
  const ppSendMessage = () => toast('Messaging is coming soon.');

  // Honest placeholders — there's no real email/SMS verification system
  // yet (email_verified/phone_verified are just columns for now), so these
  // can't actually send or track a verification. Once that system exists,
  // wire the real send here instead of this toast.
  const ppResendEmailVerification = () => toast('Email verification isn\'t built yet — this will send a real verification email once that system exists.', true);
  const ppResendSmsVerification   = () => toast('SMS verification isn\'t built yet — this will send a real verification text once that system exists.', true);

  // Regenerates the player's Player DNA portal link (a new random token),
  // which immediately invalidates any previously-shared link. Confirmed
  // first since that's a real, slightly destructive side effect.
  const ppResetPlayerDna = async () => {
    if (!_ppCurrent) return;
    const ok = await window.confirmModal({
      title: 'Reset Player DNA link?',
      message: 'This generates a new Player DNA link for this player. Any link they (or you) already shared stops working immediately.',
      okLabel: 'Reset Link',
    });
    if (!ok) return;
    try {
      const newToken = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      await api(`players?id=eq.${_ppCurrent.p.id}`, 'PATCH', { portal_token: newToken });
      _ppCurrent.p.portal_token = newToken;
      toast('Player DNA link reset — the old link no longer works.');
      renderHeader(_ppCurrent); // re-render so "Copy Player DNA Link" reflects the new token
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  const ppViewLadder = (btn) => {
    const ladderId = parseInt(btn.dataset.ladderid, 10);
    const found = (AdminState.allLadders || []).find((l) => l.id === ladderId);
    if (found) {
      AdminState.currentLadder = found;
      const sel = document.getElementById('ladder-selector');
      if (sel) sel.value = ladderId;
      window.updateLadderBanner();
    }
    window.showPage('ladder', document.getElementById('sb-standings'));
  };

  // Search box is static HTML in the page shell — wire it once, here.
  ppWireSearch();

  // ── Expose / register with the shared infrastructure ───────────────────
  window.loadPlayerProfilePage = loadPlayerProfilePage;

  Object.assign(window.CLICK_HANDLERS, {
    ppShowTab:      (btn) => ppShowTab(btn.dataset.pptab),
    ppPrevPlayer:   () => ppPrevPlayer(),
    ppToggleMore:   () => ppToggleMore(),
    ppEditPlayer:   () => ppEditPlayer(),
    ppViewHistory:  () => ppViewHistory(),
    ppCopyDnaLink:  () => ppCopyDnaLink(),
    ppResendEmailVerification: () => ppResendEmailVerification(),
    ppResendSmsVerification:   () => ppResendSmsVerification(),
    ppResetPlayerDna:          () => ppResetPlayerDna(),
    ppSendMessage:  () => ppSendMessage(),
    ppViewLadder:   (btn) => ppViewLadder(btn),
    // Route "openPlayerProfile" (used across the admin — Players table,
    // Match Hub, etc.) to this page instead of the old modal.
    openPlayerProfile: (btn) => window.showPage('player-profile', btn),
  });
})();
