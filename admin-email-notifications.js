/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: EMAIL NOTIFICATIONS
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-state.js -> admin-email-utils.js ->
               admin-email-notifications.js -> app.js

   Extracted from app.js's EMAIL NOTIFICATIONS section.
   Reads AdminState.currentLadder / AdminState.ladderPlayers, populated
   by admin-ladder-selector.js.

   ── EL ENVÍO PASA POR EL SERVIDOR ─────────────────────────────────
   Manda con sendEmailServer() de admin-email-utils.js, que llama a la
   Edge Function `send-email`: una sola petición para todo el grupo, la
   clave del proveedor fuera del navegador, y registro persona a persona
   en la base de datos.

   El mensaje se escribe en un editor con formato (admin-rich-editor.js)
   y viaja como HTML, que el servidor filtra antes de pintarlo.

   Hay UN solo camino de envío: el botón Send. La casilla
   "Send only to me" no es otro camino — es el mismo con la lista
   reducida a una dirección, para poder ensayarlo. El botón de prueba
   que había antes iba por otro lado y no dejaba registro.

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

  /* El editor con formato y la clave contra duplicados: los dos son
     compartidos, viven en admin-rich-editor.js y admin-email-utils.js
     y los usan las cinco pantallas que mandan correo. */
  const edNotify = window.FerociaEditor
    ? window.FerociaEditor.mount('notify-message', { barraId: 'notify-fmt-bar' }) : null;
  if (!edNotify) console.error('[Ferocia] admin-rich-editor.js must load before admin-email-notifications.js');
  const claveador = window.crearClaveador('ladder');

  /* La casilla de ensayo y la etiqueta del botón van juntas: con la
     casilla puesta, el botón dice "Send only to me". Un botón que
     dijera "Send Update" mientras la casilla está marcada
     diría una cosa y haría otra. */
  const ensayo = window.vincularEnsayo('notify-only-me', 'notify-send-btn', 'Send Update');

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
    /* Las plantillas están guardadas como TEXTO, con sus saltos de
       línea. Metidas tal cual en un editor con formato se pegarían
       todas las líneas en un bloque, así que se convierten a párrafos
       de verdad: la plantilla se sigue viendo como siempre. */
    if (edNotify) edNotify.setHTML(
      window.FerociaEditor.textoAHTML(t.message.replaceAll('{{ladder}}', ladderName)));
  };

  const openNotifyPlayers = () => {
    /* Reabrir la ventana con un envío en curso limpiaba el composer y
       se llevaba por delante el asunto y el mensaje de ESE envío, que
       todavía no ha contestado. Si sale parcial, el texto que hace
       falta para reintentar ya no existe. */
    if (window.envioEnCurso && window.envioEnCurso('abrir')) return;
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
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:var(--blue);background:#e8f0ff;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        ${totalPlayers} Player${totalPlayers !== 1 ? 's' : ''}
      </span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#085041;background:#d4f5ed;padding:2px 8px;border-radius:99px;">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#085041" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        ${emailPlayers.length} with Email
      </span>`;

    setNotifyTemplate('welcome');
    document.getElementById('notify-type').value = 'welcome';

    /* La casilla de ensayo se desmarca SIEMPRE al abrir: una casilla
       que se queda puesta de la vez anterior es la forma más fácil de
       creer que has avisado a la ladder entera cuando sólo te lo
       mandaste a ti.

       La clave, en cambio, NO se renueva si hay una pendiente: un
       envío que falló deja la suya, y reintentar tiene que retomarlo
       en vez de crear otro y duplicar a quien ya recibió. */
    ensayo.reset();
    claveador.asegurar();

    document.getElementById('notify-modal').classList.add('open');
  };

  const sendNotifications = async (e) => {
    e.preventDefault();
    if (!AdminState.currentLadder) return;
    if (AdminState.emailInFlight) { toast('Please wait for the current send to finish.', true); return; }

    const subject = document.getElementById('notify-subject').value.trim();
    const message = edNotify ? edNotify.getHTML() : '';
    /* El texto sirve para VALIDAR: un editor "vacío" no es una cadena
       vacía, suele tener un <br> dentro. Con el HTML no se sabe si hay
       algo escrito; con el texto, sí. */
    const texto   = edNotify ? edNotify.getText() : '';
    if (!subject || !texto) {
      toast('Please fill in subject and message.', true);
      return;
    }

    const emailPlayers = AdminState.ladderPlayers.filter((p) => p.email && p.ladder_status === 'active');
    if (!emailPlayers.length) {
      toast('No players to notify.', true);
      return;
    }

    /* ¿Ensayo o de verdad? La casilla se desmarca sola al abrir la
       ventana, así que un ensayo de ayer no se convierte en el envío
       de hoy sin querer. */
    const soloAdmin = !!document.getElementById('notify-only-me')?.checked;
    /* La casilla se bloquea AQUÍ, en cuanto se lee, y no después de la
       confirmación. Entre leerla y bloquearla hay al menos un `await`,
       y en ese hueco un clic en la casilla la cambiaba: el envío salía
       con lo leído, pero el `finally` —que a propósito mira la casilla
       de verdad— dejaba el botón diciendo lo contrario de lo que se
       acababa de mandar. */
    ensayo.bloquear(true);


    const encoded = btoa(String(AdminState.currentLadder.id));
    const baseUrl =
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'players.html';
    const leaderboardUrl = `${baseUrl}?l=${encoded}`;

    // Tu copia, al final. Si además juegas la ladder, el servidor se
    // queda con la primera aparición y no recibes dos.
    const copiaAdmin = { email: CFG.ADMIN_EMAIL, name: 'Ferocia Admin' };

    let recipients;
    if (soloAdmin) {
      recipients = [copiaAdmin];
    } else {
      recipients = [
        ...emailPlayers.map((p) => ({
          email: p.email,
          name:  window.nombreDestinatario(p),
          player_id: p.id,
        })),
        copiaAdmin,
      ];

      /* ─── ÚLTIMA PARADA ANTES DE ENVIAR ─────────────────────
         El número es lo que hace parar a pensar: "¿seguro?" a secas se
         contesta que sí sin leer. Un aviso no se puede recoger. */
      const cuantos = emailPlayers.length;
      const seguro = await confirmModal({
        title:   `Notify ${cuantos} player${cuantos === 1 ? '' : 's'}?`,
        message: `"${subject}" will be emailed to ${cuantos} active player`
               + `${cuantos === 1 ? '' : 's'} in ${AdminState.currentLadder.name}`
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
      if (!seguro) { ensayo.bloquear(false); return; }   // la ventana se queda abierta
    }

    const sendBtn = document.getElementById('notify-send-btn');
    sendBtn.disabled = true;
    /* Ya no hay contador "12/30": el envío es UNA petición, no treinta. */
    sendBtn.innerHTML = soloAdmin
      ? 'Sending rehearsal to you...'
      : `Sending to ${recipients.length} people...`;
    AdminState.emailInFlight = true;

    let r;
    try {
      r = await window.sendEmailServer({
        kind:     'ladder_notify',
        template: 'notify',
        subject,
        /* El mensaje CRUDO. La sustitución del nombre la hace el
           servidor, por persona. */
        body: message,
        meta: {
          /* La etiqueta de la cabecera del correo. Era fija antes y se
             deja fija: cambiarla es otra conversación. */
          email_title: 'Pickleball Ladder',
          leaderboard_url: leaderboardUrl,
          cuerpo_html: true,
          ...(soloAdmin ? { solo_admin: true } : {}),
        },
        recipients,
        /* El ensayo va sin clave: es un correo a tu propia dirección y
           protegerlo de duplicados sólo conseguiría que el segundo
           ensayo del mismo texto no te llegara. */
        idempotency_key: soloAdmin ? null
          : await claveador.clave([AdminState.currentLadder.id, subject, message]),
      });
    } finally {
      /* En finally: si esto no se limpia, `emailInFlight` se queda en
         true y la página avisa de un envío en curso para siempre. */
      AdminState.emailInFlight = false;
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
      /* La ventana NO se cierra cuando falla: el mensaje escrito sigue
         ahí y se puede reintentar. Reintentar es seguro — con la misma
         clave el servidor retoma el mismo envío. */
      console.error('[ladder-notify] send failed:', r);
      toast(r.message, true);
      return;
    }

    const d = r.data || {};
    console.log('[ladder-notify] resultado del envio:', d);

    if (soloAdmin) {
      /* La ventana se queda abierta a propósito: el ensayo existe para
         mirar el correo y LUEGO enviar de verdad. */
      ensayo.reset();
      toast(d.sent
        ? `✅ Rehearsal sent to ${CFG.ADMIN_EMAIL} only. Nobody in the ladder received it. The checkbox is now off — press Send again to notify everyone.`
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
    /* La llave se renueva cuando la campaña está TERMINADA —no va a
       salir ni un correo más de ella— y no cuando llegó a todos. Las
       dos formas de equivocarse hacen daño en direcciones opuestas:
       renovar antes de tiempo duplica correos; no renovar nunca deja
       la pantalla enganchada a una campaña vieja. Ver `envioTerminado`
       en admin-email-utils.js. */
    const limpio = window.envioTerminado(d) && !d.failed && !d.unconfirmed;
    if (limpio) {
      claveador.limpiar();   // el siguiente aviso será uno nuevo
      document.getElementById('notify-modal').classList.remove('open');
      toast(window.mensajeExito(d) + window.loQueFalto(d));
    } else {
      console.warn('[ladder-notify] no salio limpio:', d);
      toast(`Finished: ${window.resumenEnvio(d)}. Press Send again to retry the ones that failed.`, true);
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
