/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PRINT ROSTER
   Depends on: config.js, db.js, admin-state.js, admin-ladder-selector.js
   Load order: admin-state.js -> admin-ladder-selector.js ->
               admin-print-roster.js -> app.js

   Extracted from app.js's PRINT ROSTER section. Reads the shared
   get_ladder_sessions() RPC (same source of truth the Sessions tab and
   players.html use) for one specific date, then draws the PDF with jsPDF.
   ============================================================ */

(function () {
  'use strict';

  const AdminState = window.AdminState;

  /* ─── PRINT ROSTER ─────────────────────────────────────── */

  const printRoster = async (btn) => {
    const date = btn.dataset.date;
    const ladderId = parseInt(btn.dataset.ladderid, 10);
    if (!date || !ladderId) { toast('Missing date or ladder.', true); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Generating...';

    try {
      // ── Shared RPC — same source of truth as the Sessions tab and players.html ──
      const { data: allSessions, error: sessErr } =
        await supabase.rpc('get_ladder_sessions', { p_ladder_id: ladderId });
      if (sessErr) throw new Error(sessErr.message);
      const dateSessions = (allSessions || []).filter((s) => s.session_date === date);
      if (!dateSessions.length) { toast('No sessions found for this date.', true); return; }

      // Group by time → court, flattening the RPC's already-deduped, paired
      // teams back into per-game row arrays — the exact shape the PDF-drawing
      // code below expects, so that layout code didn't need to change.
      const byTime = {};
      dateSessions.forEach((s) => {
        const t = s.session_time || '00:00';
        if (!byTime[t]) byTime[t] = {};
        const courtEntry = { games: {}, noShow: [] };
        (s.games || []).forEach((g) => {
          courtEntry.games[g.game_number] = [...(g.team_a || []), ...(g.team_b || [])].map((r) => ({
            id: r.match_id, player_id: r.player_id, score_for: r.score_for, score_against: r.score_against,
            points_earned: r.points_earned, is_sub: r.is_sub, default_no_show: false,
            court_group: s.court_group, game_number: g.game_number, session_time: s.session_time,
            players: { first_name: r.first_name, last_name: r.last_name },
          }));
        });
        (s.no_shows || []).forEach((ns) => {
          courtEntry.noShow.push({
            id: ns.match_id, player_id: ns.player_id, points_earned: ns.points_earned,
            default_no_show: true, court_group: s.court_group, session_time: s.session_time,
            players: { first_name: ns.first_name, last_name: ns.last_name },
          });
        });
        byTime[t][s.court_group] = courtEntry;
      });
      const sortedPdfTimes = Object.keys(byTime).sort();

      // Ladder info for header
      const ladderName = AdminState.currentLadder?.name || 'Ladder';
      const scoringFormat = AdminState.currentLadder?.scoring_format || '';
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
          // Deduplicate by player_id before measuring height
          const gpDeduped = {};
          court.games[gn].forEach(m => { if (!gpDeduped[m.player_id] || m.id > gpDeduped[m.player_id].id) gpDeduped[m.player_id] = m; });
          const gp = Object.values(gpDeduped).filter(m => !m.default_no_show);
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
          // Deduplicate by player_id — keep latest row per player
          const gameDeduped = {};
          court.games[gn].forEach(m => {
            if (!gameDeduped[m.player_id] || m.id > gameDeduped[m.player_id].id) {
              gameDeduped[m.player_id] = m;
            }
          });
          const gamePlayers = Object.values(gameDeduped).filter((m) => !m.default_no_show);
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


  // ── Register with the shared infrastructure ───────────────────────────
  Object.assign(window.CLICK_HANDLERS, {
    printRoster: (btn) => printRoster(btn),
  });
})();
