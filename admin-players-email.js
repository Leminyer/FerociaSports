/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: EMAIL ALL PLAYERS
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-email-utils.js -> admin-players-email.js

   Sends one message to every ACTIVE player who has an email address.

   Built on the same pieces as the tournament notifier: sendOneEmail()
   for the retry logic, AdminState.emailInFlight so navigating away
   mid-send warns the user, and the same throttle between sends.

   WHY THE THROTTLE STAYS
     CFG.EMAIL_THROTTLE_MS (600ms) is not slowness to be optimised away.
     EmailJS rate-limits per second; going faster gets messages rejected
     or flagged as spam, which costs far more than four minutes.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before admin-players-email.js');
    return;
  }

  // Recipients resolved when the modal opens, reused when sending so the
  // list cannot change between what the admin was told and what is sent.
  let _peRecipients = [];
  let _peSkipped    = 0;

  /** Rough wall-clock estimate: throttle plus the request itself. */
  const estimateMinutes = (n) => {
    const seconds = n * ((CFG.EMAIL_THROTTLE_MS + 300) / 1000);
    return seconds < 90
      ? `about ${Math.max(1, Math.round(seconds))} seconds`
      : `about ${Math.round(seconds / 60)} minute${Math.round(seconds / 60) !== 1 ? 's' : ''}`;
  };

  const pill = (bg, color, text) =>
    `<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;
       color:${color};background:${bg};padding:3px 9px;border-radius:99px;">${text}</span>`;

  window.openPlayersEmail = async () => {
    let players = [];
    try {
      players = await api('players?status=eq.active&select=first_name,last_name,email&order=first_name');
    } catch (err) {
      toast(`Error loading players: ${err.message}`, true);
      return;
    }

    // Players with no email on file are skipped, not treated as an error —
    // the admin is told how many, so the number is never a silent surprise.
    _peRecipients = players.filter(p => p.email && p.email.trim());
    _peSkipped    = players.length - _peRecipients.length;

    if (!_peRecipients.length) {
      toast('No active players have an email address on file.', true);
      return;
    }

    document.getElementById('pe-recipient-count').textContent =
      `${_peRecipients.length} active player${_peRecipients.length !== 1 ? 's' : ''} will receive this message.`;

    document.getElementById('pe-summary').innerHTML =
      pill('#e8f0ff', 'var(--blue)',
        `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
         ${_peRecipients.length} Recipient${_peRecipients.length !== 1 ? 's' : ''}`)
      + (_peSkipped ? pill('#fff4e6', '#9a6200',
        `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
         ${_peSkipped} skipped — no email`) : '')
      // Stated up front so nobody starts a four-minute send on their way out.
      + pill('#f3f4f6', 'var(--text-muted)',
        `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
         Takes ${estimateMinutes(_peRecipients.length + 1)}`);

    document.getElementById('pe-subject').value = '';
    document.getElementById('pe-message').value = '';

    const btn     = document.getElementById('pe-send-btn');
    const testBtn = document.getElementById('pe-test-btn');
    if (testBtn) testBtn.disabled = false;
    btn.disabled = false;
    btn.style.background = 'linear-gradient(180deg,#2456d3,var(--blue))';
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send to All Players`;

    document.getElementById('players-email-modal').classList.add('open');
  };

  window.closePlayersEmail = () => {
    if (window.AdminState.emailInFlight) {
      toast('Emails are still being sent. Please wait for it to finish.', true);
      return;
    }
    document.getElementById('players-email-modal').classList.remove('open');
  };

  /**
   * Sends one copy to the admin so they can see how the message actually
   * lands in an inbox — line breaks, the subject in the blue header, the
   * whole thing — before committing to a send that cannot be recalled.
   *
   * Uses the SAME template and the SAME parameters as the real run, so
   * what arrives is what everyone else will get. Only two things differ:
   * "[TEST]" on the subject line, and {{player_name}} resolved to the
   * admin's own name rather than a player's.
   */
  const sendTestPlayersEmail = async () => {
    const subject = document.getElementById('pe-subject').value.trim();
    const message = document.getElementById('pe-message').value.trim();
    if (!subject || !message) { toast('Write a subject and message first.', true); return; }

    const testBtn  = document.getElementById('pe-test-btn');
    const origHTML = testBtn.innerHTML;
    testBtn.disabled  = true;
    testBtn.innerHTML = 'Sending test...';

    try {
      emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
      const ok = await window.sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.MESSAGE, {
        player_name:  'Ferocia Admin',
        player_email: CFG.ADMIN_EMAIL,
        email_title:  subject,
        subject:      `[TEST] ${subject}`,
        message:      message.replace(/\{\{player_name\}\}/g, 'Ferocia Admin'),
      });
      if (ok) toast(`✅ Test email sent to ${CFG.ADMIN_EMAIL}`);
      else    toast('Test email failed. Check your EmailJS config.', true);
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    } finally {
      testBtn.disabled  = false;
      testBtn.innerHTML = origHTML;
    }
  };

  const sendPlayersEmail = async (e) => {
    e.preventDefault();

    const subject = document.getElementById('pe-subject').value.trim();
    const message = document.getElementById('pe-message').value.trim();
    if (!subject || !message) { toast('Subject and message are required.', true); return; }
    if (!_peRecipients.length) { toast('No recipients loaded. Close and reopen the window.', true); return; }

    // A mass send cannot be undone, so it takes one deliberate confirmation.
    // confirmModal() renders the message with textContent, so this is one
    // flowing sentence rather than a formatted block.
    const ok = await confirmModal({
      title: `Send to ${_peRecipients.length} players?`,
      message:
        `This will email all ${_peRecipients.length} active players with an address on file` +
        (_peSkipped ? `, skipping ${_peSkipped} who have none` : '') +
        `. It takes ${estimateMinutes(_peRecipients.length + 1)} and cannot be undone — ` +
        `keep this window open until it finishes.`,
      okLabel: 'Send now',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    const sendBtn = document.getElementById('pe-send-btn');
    const testBtn = document.getElementById('pe-test-btn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    // Lock the test button too: firing a test mid-run would interleave an
    // extra request into a throttle that is deliberately paced.
    if (testBtn) testBtn.disabled = true;
    window.AdminState.emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    let sent = 0;
    const failedRecipients = [];

    // Admin last, as in the other bulk senders: a copy arrives once the run
    // is done, which doubles as confirmation that delivery worked.
    const allRecipients = [
      ..._peRecipients,
      { first_name: 'Ferocia', last_name: 'Admin', email: CFG.ADMIN_EMAIL },
    ];

    for (const player of allRecipients) {
      const playerMsg = message.replace(/\{\{player_name\}\}/g,
        `${player.first_name} ${player.last_name}`);

      const okSend = await window.sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.MESSAGE, {
        player_name:  `${player.first_name} ${player.last_name}`,
        player_email: player.email,
        email_title:  subject,
        subject,
        message:      playerMsg,
      });

      if (okSend) sent++;
      else failedRecipients.push(player.email);

      sendBtn.textContent = `Sending... ${sent + failedRecipients.length}/${allRecipients.length}`;
      if (sent + failedRecipients.length < allRecipients.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    window.AdminState.emailInFlight = false;

    if (!failedRecipients.length) {
      sendBtn.style.background = 'linear-gradient(180deg,#2ab87a,#1d9e68)';
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sent ${sent} emails!`;
      setTimeout(() => {
        document.getElementById('players-email-modal').classList.remove('open');
        toast(`Message sent to ${sent - 1} players.`);
      }, 1400);
    } else {
      // Failures are named, not just counted: the admin can resend to those
      // few individually from each player's profile.
      sendBtn.disabled = false;
      if (testBtn) testBtn.disabled = false;
      sendBtn.style.background = 'linear-gradient(180deg,#2456d3,var(--blue))';
      sendBtn.innerHTML = 'Send to All Players';
      console.warn('[players-email] failed recipients:', failedRecipients);
      toast(`Sent ${sent}, but ${failedRecipients.length} failed. See the console for the addresses.`, true);
    }
  };

  document.getElementById('players-email-form')
    ?.addEventListener('submit', sendPlayersEmail);

  Object.assign(window.CLICK_HANDLERS, {
    openPlayersEmail:     () => window.openPlayersEmail(),
    closePlayersEmail:    () => window.closePlayersEmail(),
    sendTestPlayersEmail: () => sendTestPlayersEmail(),
  });
})();
