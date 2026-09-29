/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: TOURNAMENT NOTIFY
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-state.js -> admin-email-utils.js ->
               admin-tournament-notify.js -> app.js -> tournament.js

   Extracted from app.js's TOURNAMENT NOTIFY section.

   ── EL ENVÍO PASA POR EL SERVIDOR ─────────────────────────────────
   Ya NO usa EmailJS. Manda con sendEmailServer() de
   admin-email-utils.js: una sola petición para todo el torneo, la
   clave del proveedor fuera del navegador, y registro persona a
   persona. El mensaje se escribe con formato y viaja como HTML, que
   el servidor filtra antes de pintarlo.

   Hay UN solo camino de envío. La casilla "Send only to me" es ese
   mismo camino con la lista reducida a una dirección.

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

  /* Compartidos con las otras cuatro pantallas que mandan correo. */
  const edTNotify = window.FerociaEditor
    ? window.FerociaEditor.mount('t-notify-message', { barraId: 't-notify-fmt-bar' }) : null;
  if (!edTNotify) console.error('[Ferocia] admin-rich-editor.js must load before admin-tournament-notify.js');
  const claveador = window.crearClaveador('tourney');

  /* La casilla de ensayo y la etiqueta del botón van juntas: con la
     casilla puesta, el botón dice "Send only to me". Un botón que
     dijera "Send Update" mientras la casilla está marcada
     diría una cosa y haría otra. */
  const ensayo = window.vincularEnsayo('t-notify-only-me', 't-notify-send-btn', 'Send Update');

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
    /* SIN el "Hi {{player_name}}," que llevaba antes, por dos motivos:

       · La plantilla del correo YA saluda por el nombre, arriba del
         mensaje. Con esa línea el nombre salía dos veces.
       · No hay que escribir variables a mano. Quien redacte esto
         mañana no tiene por qué saber qué es {{player_name}}.

       Si alguien la escribe igualmente, el servidor la sigue
       sustituyendo: se quitó del texto por defecto, no del sistema. */
    if (edTNotify) edTNotify.setHTML(window.FerociaEditor.textoAHTML(
      `The results for ${tournamentName} are now available. `
      + `Click the link below to view your standings, bracket results, and more.`
      + `\n\nThank you for participating and congratulations to all players `
      + `on a great tournament!\n\nFerocia Sports Center`));

    // Store on modal for use by sendTournamentNotify
    const modal = document.getElementById('tournament-notify-modal');
    modal._tournamentId = tournamentId;
    modal._tournamentName = tournamentName;
    modal._emailPlayers = emailPlayers;

    /* Casilla de ensayo siempre desmarcada al abrir; la clave sólo se
       pone si no hay ninguna pendiente (ver admin-email-utils.js). */
    ensayo.reset();
    claveador.asegurar();

    modal.classList.add('open');
  };

  const closeTournamentNotifyModal = () => {
    document.getElementById('tournament-notify-modal').classList.remove('open');
  };

  const sendTournamentNotify = async (e) => {
    e.preventDefault();
    if (window.AdminState.emailInFlight) { toast('Please wait for the current send to finish.', true); return; }

    const modal = document.getElementById('tournament-notify-modal');
    const { _tournamentId, _tournamentName, _emailPlayers } = modal;
    if (!_tournamentId || !_emailPlayers?.length) return;

    const subject = document.getElementById('t-notify-subject').value.trim();
    const message = edTNotify ? edTNotify.getHTML() : '';
    const texto   = edTNotify ? edTNotify.getText() : '';
    if (!subject || !texto) { toast('Please fill in subject and message.', true); return; }

    const soloAdmin = !!document.getElementById('t-notify-only-me')?.checked;
    /* La casilla se bloquea AQUÍ, en cuanto se lee, y no después de la
       confirmación. Entre leerla y bloquearla hay al menos un `await`,
       y en ese hueco un clic en la casilla la cambiaba: el envío salía
       con lo leído, pero el `finally` —que a propósito mira la casilla
       de verdad— dejaba el botón diciendo lo contrario de lo que se
       acababa de mandar. */
    ensayo.bloquear(true);


    const baseTourneyUrl =
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'tournament-results.html';
    const resultsUrl = `${baseTourneyUrl}?t=${btoa(String(_tournamentId))}`;

    const copiaAdmin = { email: CFG.ADMIN_EMAIL, name: 'Ferocia Admin' };

    let recipients;
    if (soloAdmin) {
      recipients = [copiaAdmin];
    } else {
      recipients = [
        ..._emailPlayers.map((p) => ({
          email: p.email,
          name:  window.nombreDestinatario(p),
          player_id: p.id,
        })),
        copiaAdmin,
      ];

      const cuantos = _emailPlayers.length;
      const seguro = await confirmModal({
        title:   `Notify ${cuantos} player${cuantos === 1 ? '' : 's'}?`,
        message: `"${subject}" will be emailed to ${cuantos} player`
               + `${cuantos === 1 ? '' : 's'} from ${_tournamentName}`
               + `, plus a copy to you. This cannot be undone.`
               /* Una sola frase seguida: confirmModal pinta con
                  textContent y sin white-space:pre-line, así que un
                  \n\n se queda en un espacio y la frase se pega a la
                  anterior. Su propio admin-incident-reports.js lo
                  documenta. */
               + ` To check it first, cancel and use "Send only to me".`,
        okLabel: `Send to ${cuantos}`,
        cancelLabel: 'Cancel',
        danger: true,
      });
      // Al cancelar hay que SOLTAR la casilla: si no, se queda gris
      // para siempre y ya no se puede marcar el ensayo.
      if (!seguro) { ensayo.bloquear(false); return; }
    }

    const sendBtn = document.getElementById('t-notify-send-btn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = soloAdmin
      ? 'Sending rehearsal to you...'
      : `Sending to ${recipients.length} people...`;
    window.AdminState.emailInFlight = true;

    let r;
    try {
      r = await window.sendEmailServer({
        kind:     'tournament_notify',
        template: 'notify',
        subject,
        body: message,
        meta: {
          email_title: _tournamentName,
          leaderboard_url: resultsUrl,
          cuerpo_html: true,
          ...(soloAdmin ? { solo_admin: true } : {}),
        },
        recipients,
        idempotency_key: soloAdmin ? null
          : await claveador.clave([_tournamentId, subject, message]),
      });
    } finally {
      window.AdminState.emailInFlight = false;
      sendBtn.disabled = false;
      /* ensayo.sync() y NO `innerHTML = origHTML`.

         `origHTML` era una FOTO del botón tomada al empezar el envío.
         Si la casilla cambiaba mientras se mandaba, el finally reponía
         esa foto vieja y el botón acababa diciendo lo contrario de lo
         que marca la casilla — justo la mentira que esto existe para
         impedir. sync() mira la casilla de verdad, no una foto.

         Y con bloquear(false) la casilla vuelve a estar disponible. */
      ensayo.bloquear(false);
      ensayo.sync();
    }

    if (!r.ok) {
      console.error('[tournament-notify] send failed:', r);
      toast(r.message, true);
      return;   // la ventana se queda abierta: no se pierde el mensaje
    }

    const d = r.data || {};
    console.log('[tournament-notify] resultado del envio:', d);

    if (soloAdmin) {
      ensayo.reset();
      toast(d.sent
        ? `✅ Rehearsal sent to ${CFG.ADMIN_EMAIL} only. No player received it. The checkbox is now off — press Send again to notify everyone.`
        : `Rehearsal did not go out: ${window.resumenEnvio(d)}`, !d.sent);
      return;
    }

    /* La clave y el cierre SOLO cuando el envío salió LIMPIO.

       El servidor contesta 200 también con estado 'partial' o 'failed'
       (index.ts: json() usa 200 por defecto), así que `r.ok` no quiere
       decir "salió bien". Antes se hacían las dos cosas siempre:
       - tirar la clave abría una campaña NUEVA en el reintento, y el
         servidor ya no sabía quién tenía el correo: todos repetían;
       - cerrar la ventana se llevaba por delante el mensaje escrito,
         justo cuando hacía falta para reintentar. */
    const limpio = d.status === 'sent' && !d.failed && !d.unconfirmed;
    if (limpio) {
      claveador.limpiar();   // el siguiente aviso será uno nuevo
      closeTournamentNotifyModal();
      toast(`✅ ${d.sent} email${d.sent === 1 ? '' : 's'} sent successfully!`);
    } else {
      console.warn('[tournament-notify] no salio limpio:', d);
      toast(`Finished: ${window.resumenEnvio(d)}. Press Send again to retry the ones that failed.`, true);
    }
  };

  // Own the form's submit listener directly (DOM is already parsed by the
  // time this script runs, same as every other listener app.js's BOOT wires).
  document.getElementById('t-notify-form')?.addEventListener('submit', sendTournamentNotify);

  // ── Register with the shared infrastructure ───────────────────────────
  window.openTournamentNotifyModal = openTournamentNotifyModal; // for window.app, built in app.js's BOOT
  Object.assign(window.CLICK_HANDLERS, {
    closeTournamentNotifyModal: () => closeTournamentNotifyModal(),
  });
})();
