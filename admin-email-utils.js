/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: SHARED EMAIL UTILITIES
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-email-utils.js -> (any module
               that sends email: admin-tournament-notify.js, and later
               Email Notifications / Promotions once those are extracted)

   Extracted from app.js (was defined inline in the EMAIL NOTIFICATIONS
   section, but used by three different sections). Exposes:

     window.sendOneEmail(serviceId, templateId, params)
         Sends one email via EmailJS with one retry on failure.
         Returns true on success, false on permanent failure.

     AdminState.emailInFlight
         Shared boolean guard so a page navigation mid-send can warn
         the user, no matter which feature is currently sending.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before admin-email-utils.js');
    return;
  }

  async function sendOneEmail(serviceId, templateId, params) {
    try {
      await emailjs.send(serviceId, templateId, params);
      return true;
    } catch (err) {
      // Brief backoff, then one retry
      await sleep(CFG.EMAIL_RETRY_DELAY_MS);
      try {
        await emailjs.send(serviceId, templateId, params);
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  // Warn the user before they navigate away mid-send.
  function beforeUnloadGuard(e) {
    if (window.AdminState.emailInFlight) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  }
  window.addEventListener('beforeunload', beforeUnloadGuard);

  window.sendOneEmail = sendOneEmail;
})();
