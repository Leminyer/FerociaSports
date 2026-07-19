/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: FTC PLAYOFFS & SCHEDULE GENERATION
   Depends on: config.js, db.js, admin-state.js, admin-ladder-selector.js
   Load order: admin-state.js -> admin-ladder-selector.js ->
               admin-ftc-playoffs-schedule.js -> app.js

   Extracted from app.js's FTC LADDER — PLAYOFFS and
   FTC LADDER — PHASE 3: SCHEDULE GENERATION sections, MERGED into one
   file rather than split in two: they call each other's functions
   directly (renderFtcBracket, ftcRefreshPlayoffMatchModal,
   ftcCheckAndUpdatePlayoffMatchupStatus are Playoffs functions called
   from Schedule; ftcLeaguePts, ftcOpenTiebreakerModal are Schedule
   functions called from Playoffs) — splitting them would have meant
   exposing 5 more functions globally for no real benefit, since they're
   really one feature (regular season -> playoffs) rather than two.

   Reads/writes AdminState.ftc.teams / .schedule / .matches — teams
   populated by admin-ftc-teams.js.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  /* ─── FTC LADDER — PLAYOFFS ───────────────────────────────── */
  // ── Playoff state ────────────────────────────────────────────────────────
  let ftcPlayoffBracket  = null; // { format:'top4'|'top6', rounds:[...], champion:null }
  let ftcPlayoffMatches  = [];   // playoff ftc_ladder_matches rows
  let ftcPlayoffSchedule = [];   // playoff ftc_ladder_schedule rows (one per matchup)
  let _ftcPlayoffScoresModalScheduleId = null; // currently open playoff scores modal
  // Debug exposure
  window._dbg = { get ftcPlayoffSchedule(){ return ftcPlayoffSchedule; }, get ftcPlayoffMatches(){ return ftcPlayoffMatches; }, get ftcTeams(){ return AdminState.ftc.teams; } };

  const loadFtcPlayoffs = async () => {
    if (!AdminState.currentLadder) return;
    const el = document.getElementById('ftc-playoffs-title');
    if (el) { el.textContent = AdminState.currentLadder.name || ''; el.style.display = 'block'; }

    // Ensure base data loaded
    if (!AdminState.ftc.teams.length) {
      try { AdminState.ftc.teams = await api(`ftc_ladder_teams?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=id`); } catch(e) {}
    }
    if (!AdminState.ftc.matches.length) {
      try { AdminState.ftc.matches = await api(`ftc_ladder_matches?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=schedule_id,match_type`); } catch(e) {}
    }
    if (!AdminState.ladderPlayers.length) { try { await window.loadLadderPlayers(); } catch(e) {} }

    // Load playoff schedule + matches
    try {
      ftcPlayoffSchedule = await api(`ftc_ladder_schedule?ladder_id=eq.${AdminState.currentLadder.id}&is_playoff=eq.true&order=playoff_round,id`);
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
    const completedMatches = AdminState.ftc.matches.filter(m => m.status === 'completed' && !m.is_tiebreaker);
    const teamStats = {};
    AdminState.ftc.teams.forEach(t => { teamStats[t.id] = { team:t, pts:0, wins:0, losses:0, ptsFor:0, ptsAgainst:0 }; });
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
    if (!AdminState.currentLadder) return;
    const format = document.getElementById('ftc-po-format')?.value || 'top4';
    const n = format === 'top8' ? 8 : format === 'top6' ? 6 : 4;

    // Compute seeded teams (reuse standings logic)
    const completedMatches = AdminState.ftc.matches.filter(m => m.status === 'completed' && !m.is_tiebreaker);
    const teamStats = {};
    AdminState.ftc.teams.forEach(t => { teamStats[t.id] = { team:t, pts:0, wins:0, losses:0, ptsFor:0, ptsAgainst:0 }; });
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
        ladder_id:   AdminState.currentLadder.id,
        week_number: 99,
        is_playoff:  true,
        status:      'scheduled',
        ...r,
      })));

      // Step 2: Reload schedule from DB to get real IDs
      ftcPlayoffSchedule = await api(`ftc_ladder_schedule?ladder_id=eq.${AdminState.currentLadder.id}&is_playoff=eq.true&order=playoff_round,id`);

      // Step 3: Insert match rows for matchups where both teams are known
      const matchRows = [];
      for (const s of ftcPlayoffSchedule.filter(s => s.team_a_id && s.team_b_id)) {
        const tA = AdminState.ftc.teams.find(t => t.id === s.team_a_id);
        const tB = AdminState.ftc.teams.find(t => t.id === s.team_b_id);
        for (const mt of matchTypes) {
          matchRows.push({
            schedule_id:  s.id,
            ladder_id:    AdminState.currentLadder.id,
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

    const tName = (id) => { if (!id) return null; const t = AdminState.ftc.teams.find(x => x.id === id); return t ? esc(t.name) : `#${id}`; };
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
    const champTeam = champId && champFinal ? (champId.wA > champId.wB ? AdminState.ftc.teams.find(t=>t.id===champFinal.team_a_id) : AdminState.ftc.teams.find(t=>t.id===champFinal.team_b_id)) : null;

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
    const champTeam = wA>wB ? AdminState.ftc.teams.find(t=>t.id===champFinal.team_a_id) : AdminState.ftc.teams.find(t=>t.id===champFinal.team_b_id);
    const runnerUp  = wA>wB ? AdminState.ftc.teams.find(t=>t.id===champFinal.team_b_id) : AdminState.ftc.teams.find(t=>t.id===champFinal.team_a_id);
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
      <div style="font-size:13px;font-weight:700;color:#174CCC;margin-bottom:2px;">${esc(AdminState.currentLadder?.name||'')} Champions</div>
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
    const tA = AdminState.ftc.teams.find(t => t.id === sched.team_a_id);
    const tB = AdminState.ftc.teams.find(t => t.id === sched.team_b_id);
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
    const tA = AdminState.ftc.teams.find(t => t.id === sched.team_a_id);
    const tB = AdminState.ftc.teams.find(t => t.id === sched.team_b_id);
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
      const p = AdminState.ladderPlayers.find(x => x.id === id);
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
        schedule_id: scheduleId, ladder_id: AdminState.currentLadder.id,
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
      const tA = AdminState.ftc.teams.find(t => t.id === updated.team_a_id);
      const tB = AdminState.ftc.teams.find(t => t.id === updated.team_b_id);
      const newMatches = typeOrder.map(mt => ({
        schedule_id: updated.id, ladder_id: AdminState.currentLadder.id, match_type: mt,
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

  // AdminState.ftc.schedule / AdminState.ftc.matches — initial values set in admin-state.js

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
    const idx = AdminState.ftc.teams.findIndex(t => t.id === teamId);
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
    const n = AdminState.ftc.teams.length;
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
    if (!AdminState.currentLadder) return;
    // Set page title (Bebas Neue, same as RP ladder pages)
    const schTitleEl = document.getElementById('ftc-schedule-title');
    if (schTitleEl) {
      schTitleEl.textContent = AdminState.currentLadder.name || '';
      schTitleEl.style.display = 'block';
    }
    // Reset preview card — hide it on every fresh load
    const previewCard = document.getElementById('ftc-sch-preview-card');
    const previewWeeks = document.getElementById('ftc-preview-weeks');
    if (previewCard)  previewCard.style.display = 'none';
    if (previewWeeks) previewWeeks.innerHTML = '';
    // Ensure AdminState.ftc.teams is loaded — may be empty if navigating directly to Schedule tab
    if (!AdminState.ftc.teams.length) {
      try {
        AdminState.ftc.teams = await api(
          `ftc_ladder_teams?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=id`
        );
      } catch (e) { /* non-fatal */ }
    }
    // Pre-fill start date from ladder start_date, then auto-set day of week
    const startEl = document.getElementById('ftc-sch-start-date');
    if (startEl && !startEl.value && AdminState.currentLadder.start_date) {
      startEl.value = AdminState.currentLadder.start_date;
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
      AdminState.ftc.schedule = await api(
        `ftc_ladder_schedule?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=week_number,id`
      );
      // Also fetch all individual matches for this ladder
      AdminState.ftc.matches = await api(
        `ftc_ladder_matches?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=schedule_id,match_type`
      );
      // Toggle delete/generate/preview buttons based on whether schedule exists
      const _delBtn  = document.getElementById('ftc-delete-schedule-btn');
      const _genBtn  = document.getElementById('ftc-generate-schedule-btn');
      const _prevBtn = document.querySelector('button[onclick="ftcPreviewSchedule()"]');
      if (AdminState.ftc.schedule.length > 0) {
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
    if (AdminState.ftc.teams.length < 2) {
      toast('Register at least 2 teams before generating a schedule.', true);
      return;
    }
    const weeks     = parseInt(document.getElementById('ftc-sch-weeks')?.value || '6', 10);
    const startDate = document.getElementById('ftc-sch-start-date')?.value;
    const targetDay = parseInt(document.getElementById('ftc-sch-day')?.value || '6', 10);
    if (!startDate) { toast('Please select a start date.', true); return; }

    ftcUpdateSchStats();
    const firstMatchDate = ftcNextWeekday(startDate, targetDay);
    const rounds         = ftcGenerateRoundRobin(AdminState.ftc.teams, weeks);

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

    const tName = (t) => t ? esc(t.name || `Team ${AdminState.ftc.teams.indexOf(t)+1}`) : '—';

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
            const timeDisplay = time ? window.fmtTime12(time) : '—';

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
    if (!AdminState.currentLadder || !AdminState.ftc.teams.length) return;
    try {
      const scheduleRows = await api(
        `ftc_ladder_schedule?ladder_id=eq.${AdminState.currentLadder.id}&select=id,team_a_id,team_b_id,is_bye,court&order=week_number,id`
      );
      const matchTypes = ['mens','womens','mixed1','mixed2'];
      const matchRows  = [];
      scheduleRows.filter(s => !s.is_bye).forEach(s => {
        const tA = AdminState.ftc.teams.find(t => t.id === s.team_a_id);
        const tB = AdminState.ftc.teams.find(t => t.id === s.team_b_id);
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
            schedule_id: s.id, ladder_id: AdminState.currentLadder.id, match_type: type,
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
      await api(`ftc_ladder_matches?ladder_id=eq.${AdminState.currentLadder.id}`, 'DELETE');
      await api(`ftc_ladder_schedule?ladder_id=eq.${AdminState.currentLadder.id}`, 'DELETE');
      AdminState.ftc.schedule = [];
      AdminState.ftc.matches  = [];
      toast('Schedule deleted. You can now generate a new one.');
      await loadFtcSchedule();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  window.ftcGenerateSchedule = async () => {
    if (AdminState.ftc.teams.length < 2) {
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
    if (AdminState.ftc.schedule.length > 0) {
      toast('A schedule already exists for this ladder. To start over, delete the existing schedule first.', true);
      return;
    }

    const firstMatchDate = ftcNextWeekday(startDate, targetDay);
    const rounds = ftcGenerateRoundRobin(AdminState.ftc.teams, weeks);

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
      const team = AdminState.ftc.teams.find(t => String(t.id) === doubleBye[0]);
      toast(`Schedule error: ${team?.name || 'A team'} was assigned a bye more than once. Please check team count and weeks.`, true);
      return;
    }

    const rows = [];
    rounds.forEach((round, i) => {
      const matchDate = ftcAddWeeks(firstMatchDate, i);
      round.matchups.forEach(m => {
        rows.push({
          ladder_id:   AdminState.currentLadder.id,
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
        `ftc_ladder_schedule?ladder_id=eq.${AdminState.currentLadder.id}&order=week_number,id&select=id,team_a_id,team_b_id,is_bye,court`
      );

      // Build ftc_ladder_matches (4 per non-bye matchup)
      const matchTypes = ['mens','womens','mixed1','mixed2'];
      const matchRows  = [];

      scheduleIds.filter(s => !s.is_bye).forEach(s => {
        const tA = AdminState.ftc.teams.find(t => t.id === s.team_a_id);
        const tB = AdminState.ftc.teams.find(t => t.id === s.team_b_id);
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
            ladder_id:      AdminState.currentLadder.id,
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
    if (!AdminState.ftc.schedule.length) {
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
    AdminState.ftc.schedule.filter(s => !s.is_playoff && s.week_number !== 99).forEach(s => {
      if (!byWeek[s.week_number]) byWeek[s.week_number] = [];
      byWeek[s.week_number].push(s);
    });

    // Index matches by schedule_id
    const matchesBySchedule = {};
    AdminState.ftc.matches.forEach(m => {
      if (!matchesBySchedule[m.schedule_id]) matchesBySchedule[m.schedule_id] = [];
      matchesBySchedule[m.schedule_id].push(m);
    });

    // If schedule exists but NO individual matches exist at all
    const nonByeSchedule = AdminState.ftc.schedule.filter(s => !s.is_bye);
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
      const p = AdminState.ladderPlayers.find(x => x.id === id);
      return p ? `${esc(p.first_name)} ${esc(p.last_name)}` : `Player #${id}`;
    };
    const teamName = (id) => {
      if (!id) return '<span style="color:#b0bbd6;">TBD</span>';
      const t = AdminState.ftc.teams.find(x => x.id === id);
      return t ? esc(t.name || `Team ${AdminState.ftc.teams.indexOf(t)+1}`) : `Team #${id}`;
    };

    const totalWeeks = Object.keys(byWeek).length;
    const completed  = AdminState.ftc.schedule.filter(s => s.status === 'completed').length;

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
            const timeDisplay   = s.match_time ? window.fmtTime12(s.match_time) : '—';
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
              const tAn = AdminState.ftc.teams.find(t => t.id === (subMatches[0]?.team_a_id))?.name || 'Team A';
              const tBn = AdminState.ftc.teams.find(t => t.id === (subMatches[0]?.team_b_id))?.name || 'Team B';
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
    const p = AdminState.ladderPlayers.find(x => x.id === id);
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
    const m = AdminState.ftc.matches.find(x => x.id === matchId);
    if (!m) return;
    const tA   = AdminState.ftc.teams.find(t => t.id === m.team_a_id);
    const tB   = AdminState.ftc.teams.find(t => t.id === m.team_b_id);
    const info = FTC_MATCH_LABELS[m.match_type] || { label: m.match_type };
    const schedRow = AdminState.ftc.schedule.find(s => s.id === m.schedule_id);
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

    const m = AdminState.ftc.matches.find(x => x.id === matchId);
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
      // Update AdminState.ftc.matches array
      const idx = AdminState.ftc.matches.findIndex(x => x.id === matchId);
      if (idx >= 0) AdminState.ftc.matches[idx] = { ...ftcMatches[idx], ...m };

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
    const slotMatches = AdminState.ftc.matches.filter(m => m.schedule_id === scheduleId && !m.is_tiebreaker);
    const allDone = slotMatches.length === 4 && slotMatches.every(m => m.status === 'completed');
    if (allDone) {
      // Count wins per team
      const winsA = slotMatches.filter(m => m.winner_team_id === m.team_a_id).length;
      const winsB = slotMatches.filter(m => m.winner_team_id === m.team_b_id).length;
      if (winsA === 2 && winsB === 2) {
        // 2-2 tie — prompt tiebreaker
        const sched = AdminState.ftc.schedule.find(s => s.id === scheduleId);
        if (sched) setTimeout(() => ftcOpenTiebreakerModal(scheduleId, sched.team_a_id, sched.team_b_id), 300);
        return;
      }
      // Update schedule row status to completed
      await api(`ftc_ladder_schedule?id=eq.${scheduleId}`, 'PATCH', { status: 'completed' });
      const si = AdminState.ftc.schedule.findIndex(s => s.id === scheduleId);
      if (si >= 0) AdminState.ftc.schedule[si].status = 'completed';
    }
  };

  // Tiebreaker modal
  window.ftcOpenTiebreakerModal = (scheduleId, teamAId, teamBId) => {
    const tA = AdminState.ftc.teams.find(t => t.id === teamAId);
    const tB = AdminState.ftc.teams.find(t => t.id === teamBId);
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
    const sched = AdminState.ftc.schedule.find(s => s.id === scheduleId);
    if (!sched) return;
    const winnerId = scoreA > scoreB ? sched.team_a_id : sched.team_b_id;
    try {
      // Create a tiebreaker match row
      await api('ftc_ladder_matches', 'POST', [{
        schedule_id:     scheduleId,
        ladder_id:       AdminState.currentLadder.id,
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
      const si = AdminState.ftc.schedule.findIndex(s => s.id === scheduleId);
      if (si >= 0) AdminState.ftc.schedule[si].status = 'completed';
      // Refresh
      AdminState.ftc.matches = await api(`ftc_ladder_matches?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=schedule_id,match_type`);
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
    const m = AdminState.ftc.matches.find(x => x.id === matchId);
    if (!m) return;
    const tA = AdminState.ftc.teams.find(t => t.id === m.team_a_id);
    const tB = AdminState.ftc.teams.find(t => t.id === m.team_b_id);
    const info = FTC_MATCH_LABELS[m.match_type] || { label: m.match_type, color:'#174CCC' };
    const pName = (id) => {
      if (!id) return 'TBD';
      const p = AdminState.ladderPlayers.find(x => x.id === id);
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
    const m = AdminState.ftc.matches.find(x => x.id === matchId);
    if (!m) return;
    const tA = AdminState.ftc.teams.find(t => t.id === m.team_a_id);
    const tB = AdminState.ftc.teams.find(t => t.id === m.team_b_id);
    const info = FTC_MATCH_LABELS[m.match_type] || { label: m.match_type, color:'#174CCC' };
    const pName = (id) => {
      if (!id) return 'TBD';
      const p = AdminState.ladderPlayers.find(x => x.id === id);
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
    // Update local AdminState.ftc.matches
    const matchId = parseInt(btn.dataset.mid, 10);
    const field   = btn.dataset.field;
    const match   = AdminState.ftc.matches.find(x => x.id === matchId);
    if (match) match[field] = newVal;
    // Update UI
    const pName = (id) => {
      const p = AdminState.ladderPlayers.find(x => x.id === id);
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
    const m = AdminState.ftc.matches.find(x => x.id === matchId);
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
      AdminState.ftc.matches = await api(`ftc_ladder_matches?ladder_id=eq.${AdminState.currentLadder.id}&select=*&order=schedule_id,match_type`);
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


  // ── Expose with the shared infrastructure ──────────────────────────────
  window.loadFtcPlayoffs = loadFtcPlayoffs; // called from the page router
  window.loadFtcSchedule = loadFtcSchedule; // called from the page router
})();
