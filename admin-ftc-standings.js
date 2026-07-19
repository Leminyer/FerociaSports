/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: FTC STANDINGS
   Depends on: config.js, db.js, admin-state.js, admin-ladder-selector.js
   Load order: admin-state.js -> admin-ladder-selector.js ->
               admin-ftc-standings.js -> app.js

   Extracted from app.js's FTC LADDER — PHASE 5: STANDINGS & STATS
   section. Reads AdminState.ftc.teams / .schedule / .matches, populated
   by admin-ftc-teams.js and admin-ftc-playoffs-schedule.js respectively.
   Fully independent of those two — no function calls cross this boundary.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  /* ─── FTC LADDER — PHASE 5: STANDINGS & STATS ─────────────── */

  window.ftcStdTab = (e, tab) => {
    document.getElementById('ftc-std-team-tab').style.display   = tab === 'team'   ? 'block' : 'none';
    document.getElementById('ftc-std-player-tab').style.display = tab === 'player' ? 'block' : 'none';
    const tabs = document.querySelectorAll('#page-ftc-standings .lop-tab');
    tabs.forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
  };

  const loadFtcStandings = async () => {
    if (!AdminState.currentLadder) return;

    // Set page title
    const titleEl = document.getElementById('ftc-standings-title');
    if (titleEl) { titleEl.textContent = AdminState.currentLadder.name || ''; titleEl.style.display = 'block'; }

    // Ensure teams + matches + players loaded
    if (!AdminState.ftc.teams.length) {
      try { AdminState.ftc.teams = await api(`ftc_ladder_teams?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=id`); } catch(e) {}
    }
    if (!AdminState.ftc.matches.length) {
      try { AdminState.ftc.matches = await api(`ftc_ladder_matches?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=schedule_id,match_type`); } catch(e) {}
    }
    if (!AdminState.ladderPlayers.length) { try { await window.loadLadderPlayers(); } catch(e) {} }

    const completedMatches = AdminState.ftc.matches.filter(m => m.status === 'completed' && !m.is_tiebreaker);
    const completedSchedule = AdminState.ftc.schedule.filter(s => !s.is_bye);
    const weeksComplete = AdminState.ftc.schedule.length
      ? [...new Set(AdminState.ftc.schedule.filter(s => s.status === 'completed').map(s => s.week_number))].length
      : 0;
    const totalWeeks = [...new Set(AdminState.ftc.schedule.map(s => s.week_number))].length;

    // ── Compute team stats ────────────────────────────────────────────────
    const teamStats = {};
    AdminState.ftc.teams.forEach(t => {
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
    AdminState.ftc.schedule.filter(s => !s.is_bye && s.status === 'completed').forEach(s => {
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
      const p = AdminState.ladderPlayers.find(x => x.id === id);
      return p ? { id: p.id, name: `${p.first_name} ${p.last_name}`, initials: (p.first_name[0]||'') + (p.last_name[0]||'') } : null;
    };

    const ensurePlayer = (pid, teamId) => {
      if (!pid) return;
      if (!playerStats[pid]) {
        const info = pName(pid);
        const team = AdminState.ftc.teams.find(t => t.id === teamId);
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
          week: AdminState.ftc.schedule.find(s => s.id === m.schedule_id)?.week_number || '?',
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
          week: AdminState.ftc.schedule.find(s => s.id === m.schedule_id)?.week_number || '?',
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
        <div class="stat-value">${AdminState.ftc.teams.length}</div>
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
            const pNameShort = (id) => { const p = AdminState.ladderPlayers.find(x => x.id === id); return p ? `${p.first_name[0]}. ${p.last_name}` : '—'; };
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


  // ── Expose with the shared infrastructure ──────────────────────────────
  window.loadFtcStandings = loadFtcStandings; // called from the page router
})();
