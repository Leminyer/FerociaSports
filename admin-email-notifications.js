/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: EMAIL NOTIFICATIONS
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-state.js -> admin-email-utils.js ->
               admin-email-notifications.js -> app.js

   Extracted from app.js's EMAIL NOTIFICATIONS section. Uses the shared
   sendOneEmail()/AdminState.emailInFlight from admin-email-utils.js.
   Reads AdminState.currentLadder / AdminState.ladderPlayers, populated
   by admin-ladder-selector.js.

   setNotifyTemplate is exposed on window because it's called directly
   from app.js's generic form-input change listener (not through
   data-action), same reason admin-ladder-selector.js's functions are.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before admin-email-notifications.js');
    return;
  }
  const AdminState = window.AdminState;

  const NOTIFY_TEMPLATES = {
    welcome: {
      subject: '🏓 Welcome to the {{ladder}} — Guidelines & Schedule',
      message: `I hope this message finds you well.

I'm excited to share that our upcoming Pickleball Ladder will officially begin on Saturday, April 18, 2026, with sessions taking place every Saturday from 1:30 PM to 3:00 PM for six consecutive weeks.

Saturday April, 18 2026 (1:30 pm to 3:00 pm)
Saturday April, 25 2026 (1:30 pm to 3:00 pm)
Saturday May, 2 2026 (1:30 pm to 3:00 pm)
Saturday May, 9 2026 (1:30 pm to 3:00 pm)
Saturday May, 16 2026 (1:30 pm to 3:00 pm)
Saturday May, 23 2026 (1:30 pm to 3:00 pm)

🏓 Ladder Structure Overview

Format: Players will be randomly organized into groups of 4 or 5 for the first week. Starting from week 2, players will be organized based on their performance and points earned.

Match Style: Round-robin format within each group. Players will partner with and against everyone in their group.

Scoring: Games are played to 11 points (WIN BY 1).

Ranking Updates: Player rankings will be updated weekly according to total points earned.

Co-ed Participation: All players are welcome, regardless of gender.

Attendance: If you are unable to attend on a given week, please notify the organizer by the app (TeamReach) or by texting or calling to 786-241-7035 (Leminyer Zapata).

🧮 New Ladder Scoring System

✅ Win a match: +4 points
🤝🏼 Lose by 1-2 points (11-10, 11-9): +3 points
🎯 Lose by 3-4 points (11-8, 11-7): +2 points
🎁 Lose by 5-8 points (11-6 to 11-3): +1 points
🚫 Lose by 9-11 points (11-2, 11-1, 11-0): 0 points
⚠️ Default / No-Show: –1 points per match (applies if the player does not notify the organizer at least 24 hours before the time the ladder starts).

This new system is designed to reward not just wins but also competitive performance and tight matches.

📋 Additional Guidelines

Court Etiquette: Please be respectful and avoid interrupting play on adjacent courts.

Punctuality: Matches start promptly at 1:30 PM. Late arrivals may result in forfeits. You can get to the park earlier (around 1:00 pm).

Sportsmanship: Great sportsmanship is expected from all. Let's keep it friendly, fun, and welcoming!

Disputes, questions or concerns: Any issues should be reported directly to the organizer immediately. His decision will be final.

Line Calls: Are made by the team on the side the ball lands. Let's be fair and respectful.

Warnings/Penalties: Use of profanity is not allowed. Throwing paddles, aggressive behavior, or any form of violence will not be tolerated. Any player who engages in these actions will receive a warning for the first offense; a second offense will result in a one-week suspension. If the behavior persists, the player will be removed from the ladder.

Bring Your Own Balls 🏓
Stay Hydrated! Don't forget your water bottle! 💧

Conduct Policy — Profanity & Unsportsmanlike Behavior

Profanity, verbal abuse, aggressive behavior, and throwing paddles or other equipment are strictly prohibited.

Penalties:
• First offense: Formal warning
• Second offense: Match forfeiture
• Further offenses: Removal from the ladder

If you have any questions please feel free to reach out.

I'm looking forward to an amazing season of friendly competition and good vibes on the courts! 🎾🔥`,
    },
    scores: {
      subject: '🏆 Scores Updated — {{ladder}}',
      message:
        'The scores for the {{ladder}} ladder have just been updated!\n\nCheck the latest standings and see where you stand on the leaderboard.',
    },
    reminder: {
      subject: '⏰ Session Reminder — {{ladder}}',
      message:
        "This is a friendly reminder that your next pickleball session for the {{ladder}} ladder is coming up soon.\n\nMake sure you're ready to play your best game!",
    },
    end: {
      subject: '🏆 End of {{ladder}} — Congratulations!',
      message:
        'The {{ladder}} ladder has officially come to an end!\n\nThank you for your participation and great sportsmanship. Check the final standings to see how you finished.',
    },
    custom: {
      subject: '',
      message: '',
    },
  };

  const setNotifyTemplate = (type) => {
    const t = NOTIFY_TEMPLATES[type];
    if (!t) return;
    const ladderName = AdminState.currentLadder ? AdminState.currentLadder.name : 'ladder';
    document.getElementById('notify-subject').value = t.subject.replaceAll('{{ladder}}', ladderName);
    document.getElementById('notify-message').value = t.message.replaceAll('{{ladder}}', ladderName);
  };

  const openNotifyPlayers = () => {
    if (!AdminState.currentLadder) {
      toast('Please select a ladder first.', true);
      return;
    }
    const emailPlayers = AdminState.ladderPlayers.filter((p) => p.email && p.ladder_status === 'active');
    const totalPlayers = AdminState.ladderPlayers.length;

    // Subtitle: "N ladder players will receive this update."
    document.getElementById('notify-recipient-count').textContent =
      `${emailPlayers.length} ladder player${emailPlayers.length !== 1 ? 's' : ''} will receive this update.`;

    // Section 1: Ladder context
    document.getElementById('notify-ladder-name').textContent = AdminState.currentLadder.name;
    document.getElementById('notify-context-pills').innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#174CCC;background:#e8f0ff;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#174CCC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${totalPlayers} Player${totalPlayers !== 1 ? 's' : ''}
      </span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#085041;background:#d4f5ed;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#085041" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        ${emailPlayers.length} with Email
      </span>`;

    setNotifyTemplate('welcome');
    document.getElementById('notify-type').value = 'welcome';
    document.getElementById('notify-modal').classList.add('open');
  };

  const sendNotifications = async (e) => {
    e.preventDefault();
    if (!AdminState.currentLadder) return;

    const subject = document.getElementById('notify-subject').value.trim();
    const message = document.getElementById('notify-message').value.trim();
    if (!subject || !message) {
      toast('Please fill in subject and message.', true);
      return;
    }
    const emailPlayers = AdminState.ladderPlayers.filter((p) => p.email && p.ladder_status === 'active');
    if (!emailPlayers.length) {
      toast('No players to notify.', true);
      return;
    }

    // Add admin as last recipient to receive a copy and verify delivery
    const allRecipients = [
      ...emailPlayers,
      { first_name: 'Ferocia', last_name: 'Admin', email: CFG.ADMIN_EMAIL },
    ];

    const encoded = btoa(String(AdminState.currentLadder.id));
    const baseUrl =
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'players.html';
    const leaderboardUrl = `${baseUrl}?l=${encoded}`;

    const sendBtn = document.getElementById('notify-send-btn');
    const sendBtnOrigText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = 'Sending...';
    AdminState.emailInFlight = true;

    emailjs.init({ publicKey: CFG.EMAILJS.PUBLIC_KEY });
    let sent = 0;
    const failedRecipients = [];

    for (const player of allRecipients) {
      const ok = await window.sendOneEmail(CFG.EMAILJS.SERVICE, CFG.EMAILJS.TEMPLATES.LADDER_NOTIFY, {
        player_name: `${player.first_name} ${player.last_name}`,
        player_email: player.email,
        email_title: 'Pickleball Ladder',
        subject,
        message,
        leaderboard_url: leaderboardUrl,
      });
      if (ok) {
        sent++;
      } else {
        failedRecipients.push(player.email);
      }
      sendBtn.textContent = `Sending... ${sent + failedRecipients.length}/${allRecipients.length}`;
      if (sent + failedRecipients.length < allRecipients.length) {
        await sleep(CFG.EMAIL_THROTTLE_MS);
      }
    }

    AdminState.emailInFlight = false;

    // Show completion state before closing
    if (!failedRecipients.length) {
      sendBtn.style.background = 'linear-gradient(180deg,#2ab87a,#1d9e68)';
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sent ${sent} emails!`;
    } else {
      sendBtn.style.background = 'linear-gradient(180deg,#F26024,#d44e10)';
      sendBtn.innerHTML = `⚠ Sent ${sent}, ${failedRecipients.length} failed`;
    }

    await sleep(2000);
    sendBtn.disabled = false;
    sendBtn.innerHTML = sendBtnOrigText;
    sendBtn.style.background = '';
    document.getElementById('notify-modal').classList.remove('open');

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
  document.getElementById('notify-form')?.addEventListener('submit', sendNotifications);

  // ── Register with the shared infrastructure ───────────────────────────
  window.setNotifyTemplate = setNotifyTemplate; // called from app.js's generic input listener
  Object.assign(window.CLICK_HANDLERS, {
    openNotifyPlayers: () => openNotifyPlayers(),
  });
})();
