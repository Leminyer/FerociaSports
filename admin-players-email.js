/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: EMAIL ALL PLAYERS
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-email-utils.js -> admin-players-email.js

   Sends one message to every ACTIVE player who has an email address.

   ── EL ENVÍO PASA POR EL SERVIDOR ─────────────────────────────────
   Manda con sendEmailServer() de admin-email-utils.js: UNA petición
   para toda la lista en vez de una por jugador.

   El ritmo lo lleva el servidor, que manda en lotes de 100. Aquí no hay
   ninguna pausa entre envíos, y es a propósito: los proveedores de
   correo limitan cuántos se aceptan por segundo, pero ese freno tiene
   que estar donde se manda —en el servidor—, no en una pestaña del
   navegador que puede cerrarse a mitad.

   Consecuencias visibles, todas buscadas:
     · De ~4 minutos a segundos.
     · Ya no hay que dejar la ventana abierta: el envío no vive aquí.
     · Queda registro persona a persona en la base de datos.

   El mensaje se escribe con formato (admin-rich-editor.js) y viaja
   como HTML, que el servidor filtra antes de pintarlo.
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
  /* El temporizador que cierra la ventana 1,4 s despues de un envio
     bien hecho. Se guarda para poder cancelarlo si ella vuelve a
     abrir la ventana dentro de ese rato. */
  let _peCierre     = null;

  /* Compartidos con las otras cuatro pantallas que mandan correo. */
  const edPlayers = window.FerociaEditor
    ? window.FerociaEditor.mount('pe-message', { barraId: 'pe-fmt-bar' }) : null;
  if (!edPlayers) console.error('[Ferocia] admin-rich-editor.js must load before admin-players-email.js');
  const claveador = window.crearClaveador('players');

  /* La casilla de ensayo y la etiqueta del botón van juntas: con la
     casilla puesta, el botón dice "Send only to me". Un botón que
     dijera "Send to All Players" mientras la casilla está marcada
     diría una cosa y haría otra. */
  const ensayo = window.vincularEnsayo('pe-only-me', 'pe-send-btn', 'Send to All Players');

  /* La estimación de minutos que había aquí se quitó porque era FALSA:
     calculaba la pausa del navegador entre envío y envío, y esa pausa
     ya no existe. Decir "tarda 4 minutos, no cierres la ventana"
     cuando tarda segundos y la ventana da igual es peor que no decir
     nada — enseña a desconfiar de lo que pone en pantalla. */

  const pill = (bg, color, text) =>
    `<span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;
       color:${color};background:${bg};padding:3px 9px;border-radius:99px;">${text}</span>`;

  window.openPlayersEmail = async () => {
    /* Reabrir la ventana con un envío en curso limpiaba el composer y
       se llevaba por delante el asunto y el mensaje de ESE envío, que
       todavía no ha contestado. Si sale parcial, el texto que hace
       falta para reintentar ya no existe. */
    if (window.envioEnCurso && window.envioEnCurso('abrir')) return;

    /* Si el envio anterior dejo armado el cierre de 1,4 s, se anula:
       si no, cerraria esta ventana que se acaba de abrir y soltaria
       el aviso del envio ANTERIOR encima del mensaje nuevo. */
    if (_peCierre) { clearTimeout(_peCierre); _peCierre = null; }

    let players = [];
    try {
      players = await api('players?status=eq.active&select=id,first_name,last_name,email&order=first_name');
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
      + pill('#f3f4f6', 'var(--text-muted)',
        `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
         Sends in seconds`);

    document.getElementById('pe-subject').value = '';
    if (edPlayers) edPlayers.clear();

    /* Casilla de ensayo siempre desmarcada al abrir; la clave sólo se
       pone si no hay ninguna pendiente (ver admin-email-utils.js). */
    claveador.asegurar();

    const btn = document.getElementById('pe-send-btn');
    btn.disabled = false;
    btn.style.background = 'linear-gradient(180deg,#2456d3,var(--blue))';
    /* El TEXTO del botón lo pone ensayo.reset(), y sólo él. Aquí había
       además un innerHTML con el mismo icono y el mismo texto escritos
       a mano: dos sitios para lo mismo es como acaban diciendo cosas
       distintas. Va después, para que sea el último en hablar. */
    ensayo.reset();

    document.getElementById('players-email-modal').classList.add('open');
  };

  window.closePlayersEmail = () => {
    /* Esta comprobación estaba escrita a mano aquí y era la única de
       las cinco pantallas que la tenía. Ahora vive en
       admin-email-utils.js y las cinco dicen lo mismo. */
    if (window.envioEnCurso && window.envioEnCurso()) return;
    document.getElementById('players-email-modal').classList.remove('open');
  };

  const sendPlayersEmail = async (e) => {
    e.preventDefault();
    if (window.AdminState.emailInFlight) { toast('Please wait for the current send to finish.', true); return; }

    const subject = document.getElementById('pe-subject').value.trim();
    const message = edPlayers ? edPlayers.getHTML() : '';
    const texto   = edPlayers ? edPlayers.getText() : '';
    if (!subject || !texto) { toast('Subject and message are required.', true); return; }
    if (!_peRecipients.length) { toast('No recipients loaded. Close and reopen the window.', true); return; }

    const soloAdmin = !!document.getElementById('pe-only-me')?.checked;
    /* La casilla se bloquea AQUÍ, en cuanto se lee, y no después de la
       confirmación. Entre leerla y bloquearla hay un `await` (el modal
       de confirmar), y en ese hueco un clic en la casilla la cambiaba:
       el envío salía con lo leído, pero el `finally` —que a propósito
       mira la casilla de verdad— dejaba el botón diciendo lo contrario
       de lo que se acababa de mandar. */
    ensayo.bloquear(true);

    // Tu copia, al final. Si además eres jugador, el servidor se queda
    // con la primera aparición y no recibes dos.
    const copiaAdmin = { email: CFG.ADMIN_EMAIL, name: 'Ferocia Admin' };

    let recipients;
    if (soloAdmin) {
      recipients = [copiaAdmin];
    } else {
      recipients = [
        ..._peRecipients.map((p) => ({
          email: p.email,
          name:  window.nombreDestinatario(p),
          player_id: p.id,
        })),
        copiaAdmin,
      ];

      /* La confirmación ya existía aquí, y era la única de la app. Lo
         que cambia es lo que dice: antes avisaba de que tardaba cuatro
         minutos y de no cerrar la ventana. Las dos cosas han dejado de
         ser verdad, y una advertencia falsa enseña a no leerlas. */
      const cuantos = _peRecipients.length;
      const seguro = await confirmModal({
        title:   `Send to ${cuantos} player${cuantos === 1 ? '' : 's'}?`,
        message: `"${subject}" will be emailed to all ${cuantos} active player`
               + `${cuantos === 1 ? '' : 's'} with an address on file`
               + (_peSkipped ? `, skipping ${_peSkipped} who have none` : '')
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

    const sendBtn  = document.getElementById('pe-send-btn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = soloAdmin
      ? 'Sending rehearsal to you...'
      : `Sending to ${recipients.length} people...`;
    window.AdminState.emailInFlight = true;
    /* El `ensayo.bloquear(true)` ya se hizo arriba, en cuanto se leyó la
       casilla. Aquí sobraba. */

    let r;
    try {
      r = await window.sendEmailServer({
        kind:     'players_broadcast',
        template: 'message',
        subject,
        body: message,
        meta: {
          /* En esta plantilla `email_title` es el titular grande del
             correo, y el asunto es lo que mejor funciona ahí: "Rained
             out — session cancelled" se lee mucho mejor que un nombre
             de club repetido en todos los correos. */
          email_title: subject,
          cuerpo_html: true,
          ...(soloAdmin ? { solo_admin: true } : {}),
        },
        recipients,
        idempotency_key: soloAdmin ? null
          : await claveador.clave([subject, message]),
      });
    } finally {
      window.AdminState.emailInFlight = false;
      sendBtn.disabled = false;
      /* ensayo.sync() y NO `innerHTML = origHTML`.

         `origHTML` era una FOTO del botón tomada al empezar el envío.
         Si la casilla cambiaba mientras se mandaba, el finally reponía
         esa foto vieja y el botón acababa diciendo lo contrario de lo
         que marca la casilla — justo la mentira que esto existe para
         impedir. sync() mira la casilla de verdad, no una foto. */
      ensayo.bloquear(false);
      ensayo.sync();
      sendBtn.style.background = 'linear-gradient(180deg,#2456d3,var(--blue))';
    }

    if (!r.ok) {
      console.error('[players-email] send failed:', r);
      toast(r.message, true);
      return;   // la ventana se queda abierta: no se pierde el mensaje
    }

    const d = r.data || {};
    console.log('[players-email] resultado del envio:', d);

    if (soloAdmin) {
      ensayo.reset();
      toast(d.sent
        ? `✅ Rehearsal sent to ${CFG.ADMIN_EMAIL} only. No player received it. The checkbox is now off — press Send again to email everyone.`
        : `Rehearsal did not go out: ${window.resumenEnvio(d)}`, !d.sent);
      return;
    }

    const limpio = d.status === 'sent' && !d.failed && !d.unconfirmed;

    /* La clave SOLO se tira cuando el envío salió LIMPIO.

       El servidor contesta 200 también cuando el estado es 'partial' o
       'failed' (index.ts: json() usa 200 por defecto), así que `r.ok`
       no quiere decir "salió bien". Tirando la clave ahí, el reintento
       que el propio aviso pide —"Press Send again to retry the ones
       that failed"— abría una campaña NUEVA: el servidor ya no sabía
       que esas personas tenían el correo, y TODAS recibían otra copia. */
    if (limpio) {
      claveador.limpiar();
      sendBtn.style.background = 'linear-gradient(180deg,#2ab87a,#1d9e68)';
      sendBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Sent ${d.sent} emails!`;
      /* El botón se APAGA durante el aviso verde. El `finally` de arriba
         ya lo había vuelto a habilitar, así que durante 1,4 s decía
         "Sent 50 emails!" y seguía siendo pulsable: un clic ahí
         arrancaba la campaña entera por segunda vez. */
      sendBtn.disabled = true;
      /* El temporizador se GUARDA para poder cancelarlo. Durante estos
         1,4 s `emailInFlight` ya es false, así que ella puede volver a
         abrir la ventana para escribir otro mensaje — y entonces este
         temporizador se la cerraba en las narices, con un aviso del
         envío ANTERIOR. openPlayersEmail() lo cancela. */
      _peCierre = setTimeout(() => {
        _peCierre = null;
        document.getElementById('players-email-modal').classList.remove('open');
        ensayo.sync();   // por la casilla real, no por una foto
        sendBtn.disabled = false;
        sendBtn.style.background = 'linear-gradient(180deg,#2456d3,var(--blue))';
        toast(window.mensajeExito(d));
      }, 1400);
    } else {
      /* La ventana NO se cierra: si algo falló, el mensaje escrito sigue
         ahí y se puede reintentar. Con la misma clave, el servidor
         retoma el mismo envío y se salta a quien ya recibió. */
      console.warn('[players-email] no salio limpio:', d);
      toast(`Finished: ${window.resumenEnvio(d)}. Press Send again to retry the ones that failed.`, true);
    }
  };


  document.getElementById('players-email-form')
    ?.addEventListener('submit', sendPlayersEmail);

  Object.assign(window.CLICK_HANDLERS, {
    openPlayersEmail:     () => window.openPlayersEmail(),
    closePlayersEmail:    () => window.closePlayersEmail(),
  });
})();
