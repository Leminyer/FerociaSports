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
              <div><div class="pp-stat-mini-val" style="font-size:16px;white-space:nowrap;">${d.totalWins}W - ${d.totalLosses}L</div><div class="pp-stat-mini-lbl">Overall Record</div></div>
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

    // Per the founder's decision: show whichever streak matches the
    // player's OVERALL performance direction — best win streak if they
    // have more wins than losses overall, longest loss streak otherwise.
    // (Not the raw "current streak" — a strong player on a brief rough
    // patch would otherwise show a loss banner despite being ahead overall.)
    const bannerIsWin = d.totalWins >= d.totalLosses;
    const bannerStreak = bannerIsWin ? d.bestWinStreak : d.longestLossStreak;
    const streakBannerHTML = bannerStreak > 0
      ? `<div class="pp-streak-banner ${bannerIsWin ? 'pp-streak-good' : ''}">
          <span style="flex-shrink:0;">${bannerIsWin
            ? ppSVG('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 'var(--teal)', 18)
            : ppSVG('<path d="M12 2v20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07M2 12h20M6 6l4 4M18 6l-4 4M6 18l4-4M18 18l-4-4"/>', 'var(--orange)', 18)}</span>
          <div>
            <div style="font-size:12px;font-weight:800;color:${bannerIsWin ? '#085041' : 'var(--orange)'};">${bannerStreak} Consecutive ${bannerIsWin ? 'Win' : 'Loss'}${bannerStreak !== 1 ? 'es' : ''}</div>
            <div style="font-size:10px;font-weight:600;color:var(--text-muted);">${bannerIsWin ? 'Best streak this career' : 'Longest rough patch this career'}</div>
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
  // ── Competition tab ──────────────────────────────────────────────────
  // Lazily fetches the extra data Competition needs beyond what Overview
  // already has (current ladder standings position + position history).
  const fetchCompetitionExtras = async (d) => {
    const extras = { standingsRows: [], myStandingRow: null, positionHistory: [] };
    if (d.activeLadder) {
      try {
        const { data } = await supabase.rpc('get_ladder_standings', { p_ladder_id: d.activeLadder.id });
        extras.standingsRows = (data || []).slice().sort((a, b) => (b.points || 0) - (a.points || 0));
        const idx = extras.standingsRows.findIndex((r) => r.player_id === d.p.id);
        if (idx >= 0) extras.myStandingRow = { ...extras.standingsRows[idx], position: idx + 1 };
      } catch (e) { /* best-effort */ }
      try {
        extras.positionHistory = await api(
          `ladder_position_snapshots?player_id=eq.${d.p.id}&ladder_id=eq.${d.activeLadder.id}&select=*&order=session_date.asc`,
        );
      } catch (e) { /* best-effort */ }
    }
    return extras;
  };

  const renderCompetition = async (d) => {
    const el = document.getElementById('pp-tab-competition');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';
    el.innerHTML = '<div class="loading" style="padding:40px;">Loading competition data...</div>';
    const playerIdAtStart = d.p.id;
    const ex = await fetchCompetitionExtras(d);
    // If the admin navigated to a different player while this was loading,
    // don't overwrite that player's tab with this stale data.
    if (!_ppCurrent || _ppCurrent.p.id !== playerIdAtStart) return;

    const scorePair = (scoreFor, scoreAgainst) => {
      const forWon = scoreFor > scoreAgainst;
      return `<span style="color:${forWon ? 'var(--teal)' : 'var(--orange)'};">${scoreFor}</span>–<span style="color:${forWon ? 'var(--orange)' : 'var(--teal)'};">${scoreAgainst}</span>`;
    };

    // ── Section 1: KPI cards ──────────────────────────────────────────
    const last5 = d.orderedResults.slice(0, 5).slice().reverse();
    const formDots5 = last5.map((r) => `<div class="pp-form-dot-lg ${r === 'W' ? 'pp-form-w-lg' : 'pp-form-l-lg'}">${r}</div>`).join('')
      || '<span class="pp-perf-val-empty">No matches yet</span>';

    // Win Rate progress ring (simple SVG circle, stroke-dashoffset trick)
    const ringR = 30, ringC = 2 * Math.PI * ringR;
    const ringOffset = ringC - (d.winPct / 100) * ringC;
    const winRateRingSVG = `
      <svg width="76" height="76" viewBox="0 0 76 76" style="transform:rotate(-90deg);">
        <circle cx="38" cy="38" r="${ringR}" fill="none" stroke="#f0f2f8" stroke-width="8"/>
        <circle cx="38" cy="38" r="${ringR}" fill="none" stroke="var(--teal)" stroke-width="8"
          stroke-dasharray="${ringC}" stroke-dashoffset="${ringOffset}" stroke-linecap="round"/>
      </svg>`;

    const kpiHTML = `
      <div class="pp-kpi-row pp-section-gap">
        <div class="pp-kpi-card">
          <div class="pp-kpi-lbl">${ppSVG(ICONS.trophy, '#c5d0e8', 15)} FEROCIA Ranking</div>
          <div class="pp-kpi-val" style="color:#c5d0e8;">—</div>
          <div class="pp-kpi-sub">Ranking system coming soon</div>
        </div>
        <div class="pp-kpi-card">
          <div class="pp-kpi-lbl">Current Form</div>
          <div style="display:flex;gap:8px;margin-bottom:12px;">${formDots5}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span class="pp-kpi-sub" style="margin-top:0;">${d.streakType === 'L' ? 'Loss Streak' : 'Win Streak'}</span>
            <span class="pp-kpi-sub" style="margin-top:0;font-weight:800;color:${d.streakType === 'W' ? 'var(--teal)' : 'var(--orange)'};">${d.streak > 0 ? `${d.streak} ${d.streakType === 'W' ? 'Wins' : 'Losses'}` : '—'}</span>
          </div>
        </div>
        <div class="pp-kpi-card" style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
          <div>
            <div class="pp-kpi-lbl">Win Rate</div>
            <div class="pp-kpi-val" style="color:var(--text);">${d.winPct}%</div>
            <div class="pp-kpi-sub">Career Win Percentage</div>
          </div>
          <div style="width:76px;height:76px;flex-shrink:0;">${winRateRingSVG}</div>
        </div>
        <div class="pp-kpi-card">
          <div class="pp-kpi-lbl">Career Record</div>
          <div style="display:flex;align-items:flex-end;gap:10px;margin-top:4px;">
            <div style="text-align:center;">
              <div style="font-size:28px;font-weight:800;color:var(--teal);line-height:1;">${d.totalWins}</div>
              <div style="font-size:11px;font-weight:700;color:var(--teal);margin-top:6px;">Wins</div>
            </div>
            <div style="font-size:20px;font-weight:700;color:#c5d0e8;padding-bottom:22px;">–</div>
            <div style="text-align:center;">
              <div style="font-size:28px;font-weight:800;color:var(--orange);line-height:1;">${d.totalLosses}</div>
              <div style="font-size:11px;font-weight:700;color:var(--orange);margin-top:6px;">Losses</div>
            </div>
          </div>
        </div>
      </div>`;

    // ── Section 2: Performance Overview ───────────────────────────────
    const seasonMatches = d.activeLadder ? d.ladderMatches.filter((m) => m.ladder_id === d.activeLadder.id) : [];
    const seasonWins = seasonMatches.filter((m) => m.score_for > m.score_against).length;
    const seasonRecord = d.activeLadder ? `${seasonWins}W – ${seasonMatches.length - seasonWins}L` : null;
    const perfRow = (lbl, val, color) => `<div class="pp-perf-row"><span class="pp-perf-lbl">${lbl}</span><span class="${val === null ? 'pp-perf-val-empty' : 'pp-perf-val'}" style="${color && val !== null ? `color:${color};` : ''}">${val === null ? 'Not enough historical data yet' : val}</span></div>`;
    const perfTitleRow = (title, iconPath, iconColor) =>
      `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
         <span class="pp-perf-title" style="margin-bottom:0;">${title}</span>
         <span style="width:32px;height:32px;border-radius:9px;background:${iconColor}22;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ppSVG(iconPath, iconColor, 16)}</span>
       </div>`;
    const perfOverviewHTML = `
      <div class="pp-perf-card">
        ${perfTitleRow('Performance Overview', '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>', '#174CCC')}
        ${perfRow('Total Matches', d.totalPlayed)}
        ${perfRow('Wins', d.totalWins, 'var(--teal)')}
        ${perfRow('Losses', d.totalLosses, 'var(--orange)')}
        ${perfRow('Win Percentage', `${d.winPct}%`)}
        ${perfRow('Current Win Streak', d.streakType === 'W' ? d.streak : 0, d.streakType === 'W' ? 'var(--teal)' : null)}
        ${perfRow('Best Win Streak', d.bestWinStreak)}
        ${perfRow('Average Tournament Finish', null)}
        ${perfRow('Average Ladder Finish', null)}
        ${seasonRecord ? `<div class="pp-perf-row"><span class="pp-perf-lbl">Current Season Record</span><span class="pp-perf-val">${scorePair(seasonWins, seasonMatches.length - seasonWins)}</span></div>` : perfRow('Current Season Record', null)}
      </div>`;

    // ── Section 3: Tournament Performance ─────────────────────────────
    // Real round_name values used across the app: R32, R16, QF, Semifinals,
    // "3rd Place", Final (confirmed against tournament-results.html).
    const rn = (bm) => (bm.round_name || '').toLowerCase();
    const won = (bm) => d.myTeamIds.includes(bm.winner_id);
    const finals     = d.myBracketMatches.filter((bm) => rn(bm) === 'final');
    const thirdPlace = d.myBracketMatches.filter((bm) => rn(bm) === '3rd place');
    const semis      = d.myBracketMatches.filter((bm) => rn(bm) === 'semifinals');
    const quarters   = d.myBracketMatches.filter((bm) => rn(bm) === 'qf');
    const championships = finals.filter(won).length;
    const runnerUps     = finals.filter((bm) => !won(bm)).length;
    const thirdPlaceWins = thirdPlace.filter(won).length;
    const tournWinRate  = d.myBracketMatches.length ? Math.round((d.myBracketMatches.filter(won).length / d.myBracketMatches.length) * 100) : 0;
    const currentTournament = d.myTournaments.find((t) => t.status === 'active' || t.status === 'in_progress') || null;
    const bestFinishLabel = championships > 0 ? 'Champion' : runnerUps > 0 ? 'Runner-Up' : thirdPlaceWins > 0 ? '3rd Place' : semis.length ? 'Semifinalist' : quarters.length ? 'Quarterfinalist' : d.myTournaments.length ? 'Participant' : null;
    const tournHTML = `
      <div class="pp-perf-card">
        ${perfTitleRow('Tournament Performance', ICONS.trophy, '#F26024')}
        ${perfRow('Tournaments Played', d.myTournaments.length)}
        ${perfRow('Championships', championships, championships > 0 ? '#9a6200' : null)}
        ${perfRow('Runner-Up', runnerUps)}
        ${perfRow('Third Place Finishes', thirdPlaceWins, thirdPlaceWins > 0 ? '#9a3412' : null)}
        ${perfRow('Quarterfinal Appearances', quarters.length)}
        ${perfRow('Semifinal Appearances', semis.length)}
        ${perfRow('Best Finish', bestFinishLabel, bestFinishLabel === 'Champion' ? 'var(--teal)' : null)}
        ${perfRow('Current Tournament', currentTournament ? esc(currentTournament.name) : 'None', currentTournament ? 'var(--blue)' : null)}
        ${perfRow('Tournament Win Rate', d.myBracketMatches.length ? `${tournWinRate}%` : null)}
      </div>`;

    // ── Section 4: Ladder Performance ─────────────────────────────────
    const attendedDates = new Set(d.allMatches.filter((m) => d.activeLadder && m.ladder_id === d.activeLadder.id && !m.default_no_show).map((m) => m.session_date));
    const allLadderDates = new Set(d.allMatches.filter((m) => d.activeLadder && m.ladder_id === d.activeLadder.id).map((m) => m.session_date));
    const attendanceRate = allLadderDates.size ? Math.round((attendedDates.size / allLadderDates.size) * 100) : null;
    const highestPosition = ex.positionHistory.length ? Math.min(...ex.positionHistory.map((r) => r.position)) : null;
    const avgFinish = ex.positionHistory.length ? (ex.positionHistory.reduce((s, r) => s + r.position, 0) / ex.positionHistory.length).toFixed(1) : null;
    const ladderHTML = `
      <div class="pp-perf-card">
        ${perfTitleRow('Ladder Performance', '<line x1="6" y1="2" x2="6" y2="22"/><line x1="18" y1="2" x2="18" y2="22"/><line x1="6" y1="7" x2="18" y2="7"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="17" x2="18" y2="17"/>', '#24BC96')}
        ${perfRow('Ladders Played', d.myLadders.length)}
        ${perfRow('Current Ladder', d.activeLadder ? esc(d.activeLadder.name) : 'None', d.activeLadder ? 'var(--blue)' : null)}
        ${perfRow('Current Position', ex.myStandingRow ? `#${ex.myStandingRow.position} of ${ex.standingsRows.length}` : null)}
        ${perfRow('Highest Position Ever', highestPosition ? `#${highestPosition}` : null, highestPosition === 1 ? 'var(--teal)' : null)}
        ${perfRow('Average Finish', avgFinish ? `#${avgFinish}` : null)}
        ${perfRow('Attendance Rate', attendanceRate !== null ? `${attendanceRate}%` : null, attendanceRate >= 90 ? 'var(--teal)' : null)}
        ${perfRow('Promotion History', null)}
        ${perfRow('Largest Position Gain', null)}
      </div>`;
    if (!ex.positionHistory.length) {
      // Being upfront in the UI too, not just to the founder — position
      // tracking only started recently, so most players won't have any
      // history yet.
    }

    // ── Section 5: Recent Matches (ladder + tournament, mixed) ────────
    const recentMixed = [
      ...d.recent8.map((m) => ({
        isTourn: false, date: m.session_date, won: m.score_for > m.score_against,
        comp: d.myLadders.find((l) => l.id === m.ladder_id)?.name || 'Ladder',
        opp: d.opponentMap[m.id] || 'Opponent', scoreHTML: scorePair(m.score_for, m.score_against),
      })),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 8);
    const recentMatchesHTML = recentMixed.length ? recentMixed.map((m) => `
      <div class="pp-match-row">
        <div class="${m.won ? 'ppm-pill-w' : 'ppm-pill-l'}" style="width:26px;height:26px;">${m.won ? 'W' : 'L'}</div>
        <div class="pp-match-info">
          <div class="pp-match-opp">vs ${esc(m.opp || 'Opponent')}</div>
          <div class="pp-match-comp">${esc(m.comp)}</div>
        </div>
        <div>
          <div class="pp-match-score">${m.scoreHTML}</div>
          <div class="pp-match-date">${fmtShort(m.date)}</div>
        </div>
      </div>`).join('') : '<div class="pp-empty">No recent matches yet.</div>';

    // ── Section 6: Competition Timeline ───────────────────────────────
    // Ladder rows show simple Win/Loss (a per-ladder-season "final finish"
    // like the mockup's "Champion"/"Runner-Up" would need each ladder's
    // final standings computed individually — not built yet). Tournament
    // rows use the same real round_name values (Final/Semifinals/QF/3rd
    // Place) to show an accurate Champion/Runner-Up/Semifinal/Quarterfinal
    // badge, since that data already exists per match.
    const resultBadge = (label, kind) => {
      const styles = {
        champion:  'background:rgba(36,188,150,0.12);color:#085041;border-color:rgba(36,188,150,0.3);',
        runnerup:  'background:#f4f5f8;color:var(--text-muted);border-color:#e0e7f5;',
        semi:      'background:rgba(23,76,204,0.08);color:var(--blue);border-color:rgba(23,76,204,0.25);',
        win:       'background:rgba(36,188,150,0.12);color:#085041;border-color:rgba(36,188,150,0.3);',
        loss:      'background:rgba(242,96,36,0.1);color:var(--orange);border-color:rgba(242,96,36,0.25);',
      };
      return `<span style="display:inline-block;padding:3px 12px;border-radius:99px;font-size:11px;font-weight:700;border:1px solid;${styles[kind]}">${label}</span>`;
    };
    const tournTimelineRows = d.myBracketMatches.filter((bm) => bm.round_name).map((bm) => {
      const isWon = won(bm);
      let label, kind, finish;
      const roundLower = rn(bm);
      if (roundLower === 'final') { label = isWon ? 'Champion' : 'Runner-Up'; kind = isWon ? 'champion' : 'runnerup'; finish = isWon ? '1st 🏆' : '2nd 🥈'; }
      else if (roundLower === '3rd place') { label = isWon ? '3rd Place' : 'Semifinal'; kind = isWon ? 'champion' : 'semi'; finish = isWon ? '3rd 🥉' : 'Top 4'; }
      else if (roundLower === 'semifinals') { label = 'Semifinal'; kind = 'semi'; finish = 'Top 4'; }
      else if (roundLower === 'qf') { label = 'Quarterfinal'; kind = 'semi'; finish = 'Top 8'; }
      else { label = isWon ? 'Win' : 'Loss'; kind = isWon ? 'win' : 'loss'; finish = '—'; }
      return {
        date: bm.scheduled_date || bm.match_date || null,
        comp: d.myTournaments.find((t) => t.id === bm.tournament_id)?.name || 'Tournament',
        division: '—', label, kind, finish,
      };
    });
    const ladderTimelineRows = d.recent8.map((m) => ({
      date: m.session_date,
      comp: d.myLadders.find((l) => l.id === m.ladder_id)?.name || 'Ladder',
      division: '—',
      label: m.score_for > m.score_against ? 'Win' : 'Loss',
      kind: m.score_for > m.score_against ? 'win' : 'loss',
      finish: '—',
    }));
    const timelineEntries = [...tournTimelineRows, ...ladderTimelineRows]
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 10);
    const timelineRows = timelineEntries.map((t) => `
      <tr>
        <td>${fmtShort(t.date)}</td>
        <td>${esc(t.comp)}</td>
        <td>${t.division}</td>
        <td>${resultBadge(t.label, t.kind)}</td>
        <td>${t.finish}</td>
      </tr>`).join('');
    const timelineHTML = timelineRows
      ? `<table class="pp-timeline-table"><thead><tr><th>Date</th><th>Competition</th><th>Division</th><th>Result</th><th>Finish</th></tr></thead><tbody>${timelineRows}</tbody></table>`
      : '<div class="pp-empty">No competition history yet.</div>';

    // ── Section 7: Achievements ────────────────────────────────────────
    const achievements = [];
    if (championships > 0) achievements.push({ icon: '🏆', label: `Tournament Champion${championships > 1 ? ` (${championships})` : ''}` });
    if (d.bestWinStreak >= 5) achievements.push({ icon: '🔥', label: `${d.bestWinStreak} Match Win Streak` });
    if (d.totalPlayed >= 100) achievements.push({ icon: '🎯', label: '100 Career Matches' });
    if (d.totalPlayed >= 25 && d.totalPlayed < 100) achievements.push({ icon: '🚀', label: 'Rising Player' });
    if (d.winPct >= 60 && d.totalPlayed >= 10) achievements.push({ icon: '💪', label: 'Consistent Competitor' });
    if (ex.myStandingRow && ex.myStandingRow.position === 1) achievements.push({ icon: '🥇', label: 'Ladder Champion' });
    if (runnerUps > 0) achievements.push({ icon: '🥈', label: 'Tournament Finalist' });
    const achievementsHTML = achievements.length
      ? `<div class="pp-badge-grid">${achievements.map((a) => `<div class="pp-badge-card"><span style="font-size:18px;">${a.icon}</span>${esc(a.label)}</div>`).join('')}</div>`
      : '<div class="pp-empty">No achievements unlocked yet.</div>';

    // ── Section 8: Competition Insights (auto-generated, real data only) ──
    const insights = [];
    if (d.ladderPlayed >= 5 && d.myBracketMatches.length >= 5) {
      const ladderWr = Math.round((d.ladderWins / d.ladderPlayed) * 100);
      if (Math.abs(ladderWr - tournWinRate) >= 10) {
        insights.push(`Performs better in ${ladderWr > tournWinRate ? 'Ladders' : 'Tournaments'} than in ${ladderWr > tournWinRate ? 'Tournaments' : 'Ladders'} (${Math.max(ladderWr, tournWinRate)}% vs ${Math.min(ladderWr, tournWinRate)}%).`);
      }
    }
    if (d.streak >= 3) {
      insights.push(d.streakType === 'W' ? `In excellent form — ${d.streak} wins in a row.` : `Currently on a ${d.streak}-match losing streak.`);
    }
    if (!insights.length) insights.push('Not enough data yet for personalized insights — check back after a few more matches.');
    const checkIcon = ppSVG('<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>', 'var(--teal)', 15);
    const insightsHTML = `
      <div class="pp-insight-card">
        <div class="pp-perf-title" style="display:flex;align-items:center;gap:8px;">✨ Competition Insights</div>
        ${insights.map((i) => `<div class="pp-insight-item">${checkIcon} ${i}</div>`).join('')}
      </div>`;

    // ── Section 9: Ranking Progression — no rank history yet ──────────
    const rankChartHTML = `
      <div class="pp-perf-card">
        <div class="pp-perf-title">Ranking Progression</div>
        <div class="pp-empty">No ranking history yet — this will populate once the ranking system is built.</div>
      </div>`;

    el.innerHTML = `
      ${kpiHTML}
      <div class="pp-3col pp-section-gap">${perfOverviewHTML}${tournHTML}${ladderHTML}</div>
      <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:24px;align-items:stretch;" class="pp-section-gap">
        <div class="pp-perf-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span class="pp-perf-title" style="margin-bottom:0;">Recent Matches</span>
            <a class="pp-link" data-action="ppShowTab" data-pptab="history">View All →</a>
          </div>
          ${recentMatchesHTML}
        </div>
        <div class="pp-perf-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span class="pp-perf-title" style="margin-bottom:0;">Competition Timeline</span>
            <a class="pp-link" data-action="ppShowTab" data-pptab="history">View All →</a>
          </div>
          ${timelineHTML}
        </div>
      </div>
      <div class="pp-2col pp-section-gap" style="align-items:stretch;">
        <div class="pp-perf-card"><div class="pp-perf-title">Achievements</div>${achievementsHTML}</div>
        ${insightsHTML}
      </div>
      <div style="margin-top:24px;">${rankChartHTML}</div>
    `;
  };

  // ── Admin tab ────────────────────────────────────────────────────────
  // Phase 1: Quick Actions, Administrative Flags, Reliability Summary
  // (Reliability is computed by get_player_reliability() in the database —
  // not recomputed here in JS — so any future module can call the same
  // RPC and get identical numbers). Internal Notes, Player Tags, Private
  // Attachments, Admin Tasks, and the Audit Trail are later phases.
  // ── Internal Notes ───────────────────────────────────────────────────
  const NOTE_TYPE_LABELS = {
    general: 'General', positive: 'Positive', warning: 'Warning',
    incident: 'Incident', suspension: 'Suspension', followup: 'Follow-up',
  };
  let _ppNoteFormOpen = false;

  const fetchPlayerNotes = async (playerId) => {
    try {
      const { data, error } = await supabase.rpc('get_player_admin_notes', { p_player_id: playerId });
      if (error) { console.warn('[notes] fetch failed:', error.message); return []; }
      return data || [];
    } catch (e) { return []; }
  };

  const NOTE_TYPE_ICONS = {
    general:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    positive:   '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
    warning:    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    incident:   '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    suspension: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
    followup:   '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  };

  const renderNotesList = (notes) => notes.length
    ? notes.map((n) => `
        <div class="pp-note-row pp-note-accent-${n.note_type}">
          <span class="pp-note-badge pp-note-${n.note_type}">${ppSVG(NOTE_TYPE_ICONS[n.note_type] || NOTE_TYPE_ICONS.general, 'white', 11)} ${NOTE_TYPE_LABELS[n.note_type] || n.note_type}</span>
          <span class="pp-note-meta">${fmtShort(n.created_at?.slice(0, 10))} · ${esc(n.admin_name)}</span>
          <div class="pp-note-content">${esc(n.content)}</div>
        </div>`).join('')
    : '<div class="pp-empty">No internal notes yet.</div>';

  const ppToggleNoteForm = () => {
    _ppNoteFormOpen = !_ppNoteFormOpen;
    const el = document.getElementById('pp-note-form-wrap');
    if (el) el.style.display = _ppNoteFormOpen ? 'block' : 'none';
  };

  const ppSaveNote = async () => {
    if (!_ppCurrent) return;
    const type = document.getElementById('pp-note-type').value;
    const content = document.getElementById('pp-note-content').value.trim();
    if (!content) { toast('Please write a note before saving.', true); return; }
    if (!AdminState.currentAdminId) { toast('Could not identify the current admin — try refreshing the page.', true); return; }

    try {
      await api('player_admin_notes', 'POST', {
        player_id: _ppCurrent.p.id,
        admin_id: AdminState.currentAdminId,
        note_type: type,
        content,
      });
      toast('Note added.');
      document.getElementById('pp-note-content').value = '';
      _ppNoteFormOpen = false;
      const notesEl = document.getElementById('pp-notes-list');
      if (notesEl) {
        notesEl.innerHTML = '<div class="loading" style="padding:16px;">Loading...</div>';
        const notes = await fetchPlayerNotes(_ppCurrent.p.id);
        notesEl.innerHTML = renderNotesList(notes);
      }
      document.getElementById('pp-note-form-wrap').style.display = 'none';
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  // Logs a late cancellation for today and refreshes the Admin tab so the
  // Reliability Summary count updates right away.
  const ppLogLateCancellation = async () => {
    if (!_ppCurrent) return;
    if (!AdminState.currentAdminId) { toast('Could not identify the current admin — try refreshing the page.', true); return; }
    try {
      await api('player_late_cancellations', 'POST', {
        player_id: _ppCurrent.p.id,
        ladder_id: _ppCurrent.activeLadder?.id || null,
        admin_id: AdminState.currentAdminId,
      });
      toast('Late cancellation logged.');
      document.getElementById('pp-tab-adminnotes').removeAttribute('data-rendered');
      renderAdmin(_ppCurrent);
    } catch (e) {
      toast(`Error: ${e.message}`, true);
    }
  };

  // ── Player Tags ──────────────────────────────────────────────────────
  // Fixed catalog — administrators pick from this list, they can't create
  // custom tags (matches the spec). Colors are per-category, not per-tag.
  const TAG_CATALOG = {
    Community:   { color: '#7B2FBE', tags: ['Volunteer', 'Community Leader', 'Ambassador'] },
    Coaching:    { color: '#174CCC', tags: ['Coach', 'Instructor', 'Junior Parent'] },
    Business:    { color: '#9a6200', tags: ['VIP', 'Sponsor', 'Partner'] },
    Competition: { color: '#24BC96', tags: ['Tournament Director', 'Referee', 'Mentor'] },
  };
  const tagColor = (tag) => {
    for (const cat of Object.values(TAG_CATALOG)) if (cat.tags.includes(tag)) return cat.color;
    return 'var(--text-muted)';
  };
  let _ppTagPickerOpen = false;

  const renderTagsCard = (tags) => {
    const pills = (tags || []).map((t) => {
      const c = tagColor(t);
      return `<span style="display:inline-flex;align-items:center;gap:8px;background:${c}22;color:${c};border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;">
        ${esc(t)}
        <button type="button" data-action="ppRemoveTag" data-tag="${esc(t)}" style="background:none;border:none;color:${c};cursor:pointer;font-weight:800;padding:0;line-height:1;font-size:15px;">×</button>
      </span>`;
    }).join('');
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div class="pp-perf-title" style="margin-bottom:0;">Player Tags</div>
        <button type="button" data-action="ppToggleTagPicker" style="width:26px;height:26px;border-radius:50%;border:1px solid var(--blue);background:white;color:var(--blue);cursor:pointer;font-size:13px;font-weight:800;line-height:1;">+</button>
      </div>
      <div id="pp-tag-picker" style="display:none;background:#f8f9ff;border:1px solid var(--divider-color);border-radius:10px;padding:12px;margin-bottom:12px;">
        ${Object.entries(TAG_CATALOG).map(([cat, info]) => `
          <div style="margin-bottom:8px;">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:5px;">${cat}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${info.tags.map((t) => (tags || []).includes(t) ? '' : `<button type="button" data-action="ppAddTag" data-tag="${esc(t)}" style="background:white;border:1px solid ${info.color};color:${info.color};border-radius:99px;padding:4px 10px;font-size:10px;font-weight:700;cursor:pointer;">+ ${esc(t)}</button>`).join('')}
            </div>
          </div>`).join('')}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${pills || '<div class="pp-empty">No tags assigned yet.</div>'}
      </div>`;
  };

  const ppToggleTagPicker = () => {
    _ppTagPickerOpen = !_ppTagPickerOpen;
    const el = document.getElementById('pp-tag-picker');
    if (el) el.style.display = _ppTagPickerOpen ? 'block' : 'none';
  };

  const _ppRefreshTagsCard = async () => {
    const el = document.getElementById('pp-tags-card-body');
    if (!el || !_ppCurrent) return;
    el.innerHTML = renderTagsCard(_ppCurrent.p.tags);
  };

  const ppAddTag = async (btn) => {
    if (!_ppCurrent) return;
    const tag = btn.dataset.tag;
    const current = _ppCurrent.p.tags || [];
    if (current.includes(tag)) return;
    const updated = [...current, tag];
    try {
      await api(`players?id=eq.${_ppCurrent.p.id}`, 'PATCH', { tags: updated });
      _ppCurrent.p.tags = updated;
      _ppTagPickerOpen = false;
      _ppRefreshTagsCard();
    } catch (e) { toast(`Error: ${e.message}`, true); }
  };

  const ppRemoveTag = async (btn) => {
    if (!_ppCurrent) return;
    const tag = btn.dataset.tag;
    const updated = (_ppCurrent.p.tags || []).filter((t) => t !== tag);
    try {
      await api(`players?id=eq.${_ppCurrent.p.id}`, 'PATCH', { tags: updated });
      _ppCurrent.p.tags = updated;
      _ppRefreshTagsCard();
    } catch (e) { toast(`Error: ${e.message}`, true); }
  };

  const notesCardHTML = (playerId) => `
    <div class="pp-perf-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span class="pp-perf-title" style="margin-bottom:0;">Internal Notes</span>
        <button type="button" data-action="ppToggleNoteForm" style="display:flex;align-items:center;gap:5px;padding:6px 14px;border:1px solid var(--blue);border-radius:99px;background:white;color:var(--blue);font-size:11px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Note
        </button>
      </div>
      <div id="pp-note-form-wrap" class="pp-note-form" style="display:none;">
        <select id="pp-note-type" style="width:100%;padding:8px 10px;border:1px solid #e0e7f5;border-radius:8px;font-family:'Inter',sans-serif;font-size:12px;font-weight:600;color:var(--text);margin-bottom:8px;">
          ${Object.entries(NOTE_TYPE_LABELS).map(([val, lbl]) => `<option value="${val}">${lbl}</option>`).join('')}
        </select>
        <textarea id="pp-note-content" placeholder="Write the note..." style="width:100%;min-height:70px;padding:10px;border:1px solid #e0e7f5;border-radius:8px;font-family:'Inter',sans-serif;font-size:12px;font-weight:500;color:var(--text);resize:vertical;margin-bottom:8px;"></textarea>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" data-action="ppToggleNoteForm" style="padding:7px 14px;border:1px solid #e0e7f5;border-radius:99px;background:white;color:var(--text-muted);font-size:11px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">Cancel</button>
          <button type="button" data-action="ppSaveNote" style="padding:7px 16px;border:none;border-radius:99px;background:var(--blue);color:white;font-size:11px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">Save Note</button>
        </div>
      </div>
      <div id="pp-notes-list"><div class="loading" style="padding:16px;">Loading notes...</div></div>
      <div style="margin-top:10px;"><a class="pp-link" data-action="ppShowTab" data-pptab="history">View all notes →</a></div>
    </div>`;

  const flagPill = (label, isOn, subtitle) => `
    <div style="display:flex;align-items:center;gap:10px;background:white;border:1px solid var(--divider-color);border-radius:12px;padding:14px 16px;">
      ${ppSVG(isOn ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>' : '<circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>', isOn ? 'var(--teal)' : '#c5d0e8', 18)}
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--text);">${label}</div>
        ${subtitle ? `<div style="font-size:10px;font-weight:600;color:var(--text-muted);">${subtitle}</div>` : ''}
      </div>
    </div>`;

  const renderAdmin = async (d) => {
    const el = document.getElementById('pp-tab-adminnotes');
    if (!el || el.dataset.rendered) return;
    el.dataset.rendered = '1';
    el.innerHTML = '<div class="loading" style="padding:40px;">Loading admin data...</div>';
    const playerIdAtStart = d.p.id;

    let rel = null;
    try {
      const { data } = await supabase.rpc('get_player_reliability', { p_player_id: d.p.id });
      rel = data?.[0] || null;
    } catch (e) { console.warn('[reliability] failed:', e.message); }
    if (!_ppCurrent || _ppCurrent.p.id !== playerIdAtStart) return;

    const p = d.p;
    const flagsHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        ${flagPill('Email Verified', !!p.email_verified)}
        ${flagPill('Phone Verified', !!p.phone_verified)}
        ${flagPill('Waiver Signed', !!p.waiver_signed)}
        ${flagPill('Active Membership', p.status === 'active')}
        ${flagPill('Emergency Contact', !!p.emergency_contact_on_file)}
      </div>`;

    // Each metric gets its own visual treatment instead of a repeated
    // sparkline — a percentage suits a progress ring, small counts suit
    // dots/a gauge, a volume metric suits a mini bar-stack, and the
    // overall rating suits a badge icon rather than any chart at all.
    const ringViz = (pct, color) => {
      const r = 20, c = 2 * Math.PI * r;
      const offset = c - (Math.min(pct, 100) / 100) * c;
      return `<svg width="48" height="48" viewBox="0 0 48 48" style="transform:rotate(-90deg);margin-top:8px;">
        <circle cx="24" cy="24" r="${r}" fill="none" stroke="#f0f2f8" stroke-width="5"/>
        <circle cx="24" cy="24" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
      </svg>`;
    };
    const dotsViz = (count, color) => {
      const shown = Math.min(count, 5);
      const dots = Array.from({ length: 5 }, (_, i) =>
        `<span style="width:8px;height:8px;border-radius:50%;background:${i < shown ? color : '#e5e7eb'};display:inline-block;"></span>`).join('');
      return `<div style="display:flex;gap:4px;justify-content:center;margin-top:12px;">${dots}</div>`;
    };
    const gaugeViz = (count, max, color) => {
      const pct = Math.min((count / max) * 100, 100);
      return `<div style="width:100%;height:6px;background:#f0f2f8;border-radius:99px;margin-top:12px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:99px;"></div>
      </div>`;
    };
    const barsViz = (count, color) => {
      const heights = [40, 65, 50, 85, 60].map((h) => count > 0 ? h : 15);
      const bars = heights.map((h) => `<div style="width:6px;height:${h}%;background:${color};border-radius:2px;"></div>`).join('');
      return `<div style="display:flex;align-items:flex-end;gap:4px;height:24px;margin-top:10px;justify-content:center;">${bars}</div>`;
    };
    const badgeViz = (label, color) => `
      <div style="margin-top:6px;">${ppSVG('<path d="M12 2l2.4 5.3 5.6.6-4.2 3.9 1.2 5.7L12 14.7 6.9 17.5l1.2-5.7-4.2-3.9 5.6-.6z"/>', color, 34)}</div>`;

    const relStat = (label, valHTML, vizHTML, color, extraBtn) => `
      <div style="background:white;border:1px solid var(--divider-color);border-radius:12px;padding:16px 10px;text-align:center;display:flex;flex-direction:column;align-items:center;position:relative;">
        ${extraBtn || ''}
        <div style="font-size:22px;font-weight:800;color:${color || 'var(--text)'};line-height:1;">${valHTML}</div>
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-top:6px;">${label}</div>
        ${vizHTML}
      </div>`;
    const logCancellationBtn = `
      <button type="button" data-action="ppLogLateCancellation" title="Log a late cancellation for today"
        style="position:absolute;top:6px;right:6px;width:18px;height:18px;border-radius:50%;border:none;background:#f0f2f8;color:var(--text-muted);font-size:11px;font-weight:800;cursor:pointer;line-height:1;">+</button>`;
    const relCard = rel ? `
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">
        ${relStat('Attendance', rel.attendance_pct !== null ? `${rel.attendance_pct}%` : '—', ringViz(rel.attendance_pct || 0, 'var(--teal)'), 'var(--teal)')}
        ${relStat('Late Cancellations', rel.late_cancellations, dotsViz(rel.late_cancellations, 'var(--orange)'), null, logCancellationBtn)}
        ${relStat('No Shows', rel.no_shows, gaugeViz(rel.no_shows, 5, rel.no_shows > 0 ? 'var(--orange)' : '#c5d0e8'), rel.no_shows > 0 ? 'var(--orange)' : 'var(--text)')}
        ${relStat('Games Confirmed', rel.games_confirmed, barsViz(rel.games_confirmed, 'var(--blue)'), 'var(--blue)')}
        ${relStat(`<span style="white-space:nowrap;">Overall Reliability</span>`, rel.overall_label, badgeViz(rel.overall_label, rel.overall_label === 'Excellent' ? 'var(--teal)' : rel.overall_label === 'Needs Improvement' ? 'var(--orange)' : 'var(--text-muted)'), rel.overall_label === 'Excellent' ? 'var(--teal)' : rel.overall_label === 'Needs Improvement' ? 'var(--orange)' : 'var(--text)')}
      </div>
      <div style="margin-top:10px;"><a class="pp-link" data-action="ppShowTab" data-pptab="reliability">View full reliability details →</a></div>`
      : '<div class="pp-empty">Reliability data unavailable.</div>';

    const comingSoonRow = (title) => `
      <div class="pp-perf-card" style="opacity:0.6;">
        <div class="pp-perf-title" style="display:flex;align-items:center;gap:8px;">${title} <span class="pp-tab-soon">Soon</span></div>
        <div class="pp-empty">Coming in the next phase.</div>
      </div>`;

    el.innerHTML = `
      <div class="pp-section-gap">
        <div class="pp-perf-title">Quick Actions</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <button data-action="ppEditPlayer" style="display:flex;align-items:center;gap:12px;background:white;border:1px solid var(--divider-color);border-radius:14px;padding:16px 18px;cursor:pointer;text-align:left;font-family:'Inter',sans-serif;">
            <span style="width:40px;height:40px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ppSVG(ICONS.edit, 'white', 18)}</span>
            <div><div style="font-size:13px;font-weight:700;color:var(--text);">Edit Player</div><div style="font-size:11px;font-weight:600;color:var(--text-muted);">Edit player information and profile details</div></div>
          </button>
          <button data-action="ppSendMessage" style="display:flex;align-items:center;gap:12px;background:white;border:1px solid var(--divider-color);border-radius:14px;padding:16px 18px;cursor:pointer;text-align:left;font-family:'Inter',sans-serif;">
            <span style="width:40px;height:40px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ppSVG(ICONS.mail, 'white', 18)}</span>
            <div><div style="font-size:13px;font-weight:700;color:var(--text);">Send Email</div><div style="font-size:11px;font-weight:600;color:var(--text-muted);">Send an email directly to this player</div></div>
          </button>
        </div>
      </div>
      <div class="pp-2col pp-section-gap" style="align-items:start;">
        ${notesCardHTML(d.p.id)}
        <div style="display:flex;flex-direction:column;gap:24px;">
          <div class="pp-perf-card">
            <div class="pp-perf-title">Administrative Flags</div>
            ${flagsHTML}
          </div>
          <div class="pp-perf-card">
            <div class="pp-perf-title">Reliability Summary</div>
            ${relCard}
          </div>
          <div class="pp-perf-card" id="pp-tags-card-body">${renderTagsCard(d.p.tags)}</div>
        </div>
      </div>
      ${comingSoonRow('Private Attachments')}
      ${comingSoonRow('Admin Tasks')}
    `;

    const notesEl = document.getElementById('pp-notes-list');
    if (notesEl) {
      const notes = await fetchPlayerNotes(d.p.id);
      if (_ppCurrent && _ppCurrent.p.id === playerIdAtStart) notesEl.innerHTML = renderNotesList(notes);
    }
  };

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
    if (tab === 'competition') { if (_ppCurrent) renderCompetition(_ppCurrent); return; }
    if (tab === 'adminnotes') { if (_ppCurrent) renderAdmin(_ppCurrent); return; }
    const labels = { dna: 'DNA', reliability: 'Reliability', membership: 'Membership', history: 'History' };
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
  // Opens a simple subject+message modal and sends a single email to the
  // current player — same underlying send mechanism as Notify Players
  // (sendOneEmail), just scoped to one recipient instead of a ladder roster.
  const ppSendMessage = () => {
    if (!_ppCurrent?.p?.email) { toast('This player has no email on file.', true); return; }
    document.getElementById('pp-email-recipient').textContent =
      `To: ${_ppCurrent.p.first_name} ${_ppCurrent.p.last_name} (${_ppCurrent.p.email})`;
    document.getElementById('pp-email-subject').value = '';
    document.getElementById('pp-email-message').value = '';
    document.getElementById('pp-email-modal').classList.add('open');
  };

  const ppCloseEmailModal = () => {
    document.getElementById('pp-email-modal').classList.remove('open');
  };

  const ppSendEmailSubmit = async (e) => {
    e.preventDefault();
    if (!_ppCurrent?.p?.email) return;
    const subject = document.getElementById('pp-email-subject').value.trim();
    const message = document.getElementById('pp-email-message').value.trim();
    if (!subject || !message) { toast('Please fill in subject and message.', true); return; }

    const p = _ppCurrent.p;
    const sendBtn = document.getElementById('pp-email-send-btn');
    const origHTML = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = 'Sending...';

    try {
      emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
      const ok = await window.sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.LADDER_NOTIFY, {
        player_name: `${p.first_name} ${p.last_name}`,
        player_email: p.email,
        email_title: 'Ferocia Sports Center',
        subject, message,
        leaderboard_url: window.location.origin + window.location.pathname.replace('admin.html', '') + 'players.html',
      });
      if (ok) {
        toast(`Email sent to ${p.first_name} ${p.last_name}!`);
        ppCloseEmailModal();
      } else {
        toast('Email failed to send. Check your EmailJS config.', true);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = origHTML;
    }
  };
  document.getElementById('pp-email-form')?.addEventListener('submit', ppSendEmailSubmit);

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
    ppCloseEmailModal: () => ppCloseEmailModal(),
    ppToggleNoteForm: () => ppToggleNoteForm(),
    ppSaveNote: () => ppSaveNote(),
    ppLogLateCancellation: () => ppLogLateCancellation(),
    ppToggleTagPicker: () => ppToggleTagPicker(),
    ppAddTag: (btn) => ppAddTag(btn),
    ppRemoveTag: (btn) => ppRemoveTag(btn),
    ppViewLadder:   (btn) => ppViewLadder(btn),
    // Route "openPlayerProfile" (used across the admin — Players table,
    // Match Hub, etc.) to this page instead of the old modal.
    openPlayerProfile: (btn) => window.showPage('player-profile', btn),
  });
})();
