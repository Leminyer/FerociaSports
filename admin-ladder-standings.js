/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: LADDER STANDINGS & PRINT STANDINGS
   Depends on: config.js, db.js, admin-state.js, admin-ladder-selector.js
   Load order: admin-state.js -> admin-ladder-selector.js ->
               admin-ladder-standings.js -> app.js

   Extracted from app.js's LADDER STANDINGS + PRINT STANDINGS sections.
   loadLadder() and printStandings() both read the shared
   get_ladder_standings()/get_ladder_sessions() RPCs (same source of
   truth players.html uses) rather than computing locally.

   loadLadder/renderLadder are exposed on window because they're called
   directly (not through data-action) from a few places in app.js:
   tab-switching and the gender-filter change listener.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  const loadLadder = async () => {
    if (!AdminState.currentLadder) {
      document.getElementById('ladder-stats').innerHTML = '';
      document.getElementById('ladder-table').innerHTML =
        '<div class="empty">Please select or create a ladder first.</div>';
      return;
    }
    try {
      if (!AdminState.allPlayers.length) AdminState.allPlayers = await api('players?select=*&order=id');

      // ── Shared RPCs — same source of truth the public players.html uses ──
      const { data: standingsRows, error: stErr } =
        await supabase.rpc('get_ladder_standings', { p_ladder_id: AdminState.currentLadder.id });
      if (stErr) throw new Error(stErr.message);
      const { data: sessionsRows, error: sessErr } =
        await supabase.rpc('get_ladder_sessions', { p_ladder_id: AdminState.currentLadder.id });
      if (sessErr) throw new Error(sessErr.message);

      // Map RPC standings rows onto the shape renderLadder()/renderMomentumWatch() expect.
      const ranked = (standingsRows || []).map((r) => ({
        id: r.player_id, first_name: r.first_name, last_name: r.last_name, gender: r.gender,
        _rank: r.rank, _points: Number(r.points) || 0, _wins: r.wins, _losses: r.losses,
        _matches: r.matches_played, _ptsFor: r.pts_for, _diff: r.diff,
      }));

      // Flatten the sessions RPC (already deduped, court/game/team-paired) into a
      // matches-like array — same shape renderMomentumWatch() and the stat cards
      // below already know how to read, so neither had to change.
      const matches = [];
      (sessionsRows || []).forEach((s) => {
        (s.games || []).forEach((g) => {
          [...(g.team_a || []), ...(g.team_b || [])].forEach((row) => {
            matches.push({
              session_date: s.session_date, court_group: s.court_group, game_number: g.game_number,
              player_id: row.player_id, points_earned: row.points_earned,
            });
          });
        });
        (s.no_shows || []).forEach((row) => {
          matches.push({
            session_date: s.session_date, court_group: s.court_group, game_number: null,
            player_id: row.player_id, points_earned: row.points_earned,
          });
        });
      });

      AdminState.allPlayers._ranked = ranked;
      const sessions = [...new Set(matches.map((m) => m.session_date))];
      const uniqueGames = new Set(
        matches.filter((m) => m.game_number !== null)
          .map((m) => `${m.session_date}__${m.court_group}__${m.game_number}`),
      ).size;
      const leader = ranked[0] ? `${ranked[0].first_name} ${ranked[0].last_name}` : '-';
      // Show ladder title
      const titleEl = document.getElementById('ladder-title');
      if (titleEl) {
        titleEl.textContent = AdminState.currentLadder.name;
        titleEl.style.display = 'block';
      }
      // Stats cards with colored borders + rich leader card
      const leaderP = ranked[0];
      const leaderName = leaderP ? `${leaderP.first_name} ${leaderP.last_name}` : '-';
      const leaderPts  = leaderP ? leaderP._points : 0;
      document.getElementById('ladder-stats').innerHTML = `
        <div class="stat stat-blue">
          <div class="stat-label">Players</div>
          <div class="stat-value">${AdminState.ladderPlayers.length}</div>
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
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
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
    const icon   = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>`;
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
    const all      = AdminState.allPlayers._ranked || [];
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
        trendHTML = `<div class="trend-fire"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Season leader</div>`;
      } else if (p._points > 0) {
        trendHTML = `<div class="trend-up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>${p._points} pts earned</div>`;
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
        <td style="text-align:center;font-size:13px;font-weight:800;color:${p._diff > 0 ? 'var(--teal)' : p._diff < 0 ? 'var(--orange)' : 'var(--text-muted)'};">${p._diff > 0 ? '+' : ''}${p._diff}</td>
        <td style="text-align:center;font-size:13px;font-weight:700;color:var(--teal);">${p._wins}</td>
        <td style="text-align:center;font-size:13px;font-weight:700;color:var(--orange);">${p._losses}</td>
        <td style="text-align:center;font-size:13px;font-weight:700;color:var(--text-muted);">${p._matches}</td>
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
            <th style="text-align:center;width:70px;">Matches</th>
            <th style="text-align:center;width:160px;">Trend</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    document.getElementById('ladder-table').innerHTML = podiumHTML + `<div style="padding:0 4px;">${tableHTML}</div>`;
  };

  const printStandings = async () => {
    const players = AdminState.allPlayers._ranked;
    if (!players || !players.length) {
      toast('No standings to print. Load a ladder first.', true);
      return;
    }

    const btn = document.querySelector('[data-action="printStandings"]');
    // Kept so the button goes back to its own icon and label from the page,
    // instead of being renamed by this file.
    const btnHTML = btn ? btn.innerHTML : '';
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
      const ladderName = AdminState.currentLadder?.name || 'Ladder';

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

      // Column definitions matching the image. Age and Coach / Self were
      // carved out of the Player column, so Gender and Points stay exactly
      // where they were and the table still ends at the right margin.
      const COL = {
        rank:   { x: ML,          w: 14,  label: 'Rank',   align: 'center' },
        player: { x: ML + 14,     w: 64,  label: 'Player', align: 'left'   },
        age:    { x: ML + 78,     w: 16,  label: 'Age',    align: 'center' },
        rating: { x: ML + 94,     w: 30,  label: 'Coach / Self', align: 'center' },
        gender: { x: ML + 124,    w: 22,  label: 'Gender', align: 'center' },
        points: { x: ML + 146,    w: CW - 146, label: 'Points', align: 'center' },
      };

      // Age from date_of_birth, without shifting the day in western timezones.
      const ageFrom = (iso) => {
        if (!iso) return null;
        const b = new Date(iso + 'T00:00:00');
        if (isNaN(b.getTime())) return null;
        const now = new Date();
        let e = now.getFullYear() - b.getFullYear();
        if (now.getMonth() < b.getMonth() ||
           (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) e--;
        return e;
      };
      // Three decimals, same as the players table. A dash when there is no value.
      const ratingText = (v) =>
        (v === null || v === undefined || v === '') ? '—' : Number(v).toFixed(3);

      /* The standings RPC only returns name, gender and points, so the age and
         the two ratings are read from the full player rows already loaded into
         AdminState.allPlayers by loadLadder(). Subs already carry them. */
      const playerById = new Map((AdminState.allPlayers || []).map((f) => [f.id, f]));
      const extrasFor = (p) => {
        const f = playerById.get(p.id) || p;
        const e = ageFrom(f.date_of_birth);
        return {
          age:   e === null ? '—' : String(e),
          rating: `${ratingText(f.coach_rating)} / ${ratingText(f.self_rating)}`,
        };
      };

      // Shrinks a name just enough to keep it on one line inside its column.
      const fitText = (text, width, base) => {
        let s = base;
        doc.setFontSize(s);
        while (s > 6 && doc.getTextWidth(text) > width) { s -= 0.25; doc.setFontSize(s); }
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
        const name = `${p.first_name} ${p.last_name}`;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...DARK);
        fitText(name, COL.player.w - 4, 8.5);
        doc.text(name, COL.player.x + 2, y + ROW_H / 2 + 1.2);

        // Age and Coach / Self rating
        const extra = extrasFor(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(extra.age, COL.age.x + COL.age.w / 2, y + ROW_H / 2 + 1.2, { align: 'center' });
        doc.text(extra.rating, COL.rating.x + COL.rating.w / 2, y + ROW_H / 2 + 1.2, { align: 'center' });

        // Gender
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
      const subs = AdminState.ladderPlayers.filter(p => p.ladder_status === 'sub');
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
          const name = `${p.first_name} ${p.last_name}`;
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(...DARK);
          fitText(name, COL.player.w - 4, 8.5);
          doc.text(name, COL.player.x + 2, y + ROW_H / 2 + 1.2);
          const extra = extrasFor(p);
          const gender = p.gender === 'Male' ? 'M' : p.gender === 'Female' ? 'F' : '-';
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text(extra.age, COL.age.x + COL.age.w / 2, y + ROW_H / 2 + 1.2, { align: 'center' });
          doc.text(extra.rating, COL.rating.x + COL.rating.w / 2, y + ROW_H / 2 + 1.2, { align: 'center' });
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
      if (btn) { btn.disabled = false; btn.innerHTML = btnHTML; }
    }
  };

  // ── Expose / register with the shared infrastructure ──────────────────
  window.loadLadder   = loadLadder;   // called directly from tab-switch code in app.js
  window.renderLadder = renderLadder; // called directly from the gender-filter listener
  Object.assign(window.CLICK_HANDLERS, {
    printStandings: () => printStandings(),
  });
})();
