/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: TOURNAMENT NOTIFY
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-state.js -> admin-email-utils.js ->
               admin-tournament-notify.js -> app.js -> tournament.js

   Extracted from app.js's TOURNAMENT NOTIFY section. Uses the shared
   sendOneEmail()/AdminState.emailInFlight from admin-email-utils.js
   instead of a private copy (this section never had its own — it was
   already sharing app.js's, so this preserves that exactly).

   openTournamentNotifyModal is called by tournament.js via
   window.app.openTournamentNotifyModal — exposed as a plain global
   here since window.app itself is only assembled later, in app.js's
   BOOT section, which reads window.openTournamentNotifyModal to build it.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before admin-tournament-notify.js');
    return;
  }

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
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:var(--blue);background:#e8f0ff;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4"/><path d="M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M12 17v4"/><path d="M8 21h8"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6z"/></svg>
        ${catCount} Division${catCount !== 1 ? 's' : ''}
      </span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:var(--blue);background:#e8f0ff;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
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

  // Sends the subject/message currently in the form to the admin only, so
  // they can preview exactly how it'll look before notifying real players.
  const sendTestTournamentNotifyEmail = async () => {
    if (window.AdminState.emailInFlight) { toast('Please wait for the current send to finish.', true); return; }

    const modal = document.getElementById('tournament-notify-modal');
    const { _tournamentId, _tournamentName } = modal;
    if (!_tournamentId) { toast('No tournament selected.', true); return; }

    const subject = document.getElementById('t-notify-subject').value.trim();
    const message = document.getElementById('t-notify-message').value.trim();
    if (!subject || !message) {
      toast('Please fill in subject and message before sending a test.', true);
      return;
    }

    const baseTourneyUrl =
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'tournament-results.html';
    const resultsUrl = `${baseTourneyUrl}?t=${btoa(String(_tournamentId))}`;
    const testMsg = message.replace('{{player_name}}', 'Ferocia Admin');

    const testBtn = document.getElementById('t-notify-test-btn');
    const origHTML = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = 'Sending test...';

    try {
      emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
      const ok = await window.sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.LADDER_NOTIFY, {
        player_name: 'Ferocia Admin',
        player_email: CFG.ADMIN_EMAIL,
        email_title: _tournamentName || 'Tournament',
        subject: `[TEST] ${subject}`,
        message: testMsg,
        leaderboard_url: resultsUrl,
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
    const sendBtnOrigText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    window.AdminState.emailInFlight = true;

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
      const ok = await window.sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.LADDER_NOTIFY, {
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

    window.AdminState.emailInFlight = false;

    // Show completion state before closing
    if (!failedRecipients.length) {
      sendBtn.style.background = 'linear-gradient(180deg,#2ab87a,#1d9e68)';
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sent ${sent} emails!`;
    } else {
      sendBtn.style.background = 'linear-gradient(180deg,var(--orange),#d44e10)';
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

  // Own the form's submit listener directly (DOM is already parsed by the
  // time this script runs, same as every other listener app.js's BOOT wires).
  document.getElementById('t-notify-form')?.addEventListener('submit', sendTournamentNotify);

  // ── Register with the shared infrastructure ───────────────────────────
  window.openTournamentNotifyModal = openTournamentNotifyModal; // for window.app, built in app.js's BOOT
  Object.assign(window.CLICK_HANDLERS, {
    closeTournamentNotifyModal: () => closeTournamentNotifyModal(),
    sendTestTournamentNotifyEmail: () => sendTestTournamentNotifyEmail(),
  });
})();
