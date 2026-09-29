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

     window.sendEmailServer(payload)                        ← NUEVO
         Manda por la Edge Function `send-email`, en el servidor.
         Devuelve { ok, data, code, detail, message }. Nunca lanza.

     AdminState.emailInFlight
         Shared boolean guard so a page navigation mid-send can warn
         the user, no matter which feature is currently sending.

   ── POR QUÉ HAY DOS TRANSPORTES A LA VEZ ──────────────────────────
   `sendOneEmail` (EmailJS) queda INTACTA a propósito. Los módulos que
   todavía no se han cambiado la siguen usando y siguen funcionando
   exactamente igual que antes. Lo nuevo se añade al lado; no se
   sustituye nada de golpe. Cuando el último módulo pase al servidor,
   `sendOneEmail` y las claves de EmailJS se van juntas.

   Lo que gana el módulo que pasa al servidor:
     · La clave del proveedor no está en el navegador. Es un secreto de
       Supabase, y nadie que abra el código de la página la ve.
     · Manda en lotes de 100. Una campaña de 450 tarda segundos, no
       minutos, y se puede cerrar la pestaña sin romper el envío.
     · Queda registro persona a persona, así que un reintento sabe a
       quién le llegó ya y nadie recibe dos copias.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before admin-email-utils.js');
    return;
  }

  /* ════════════════════════════════════════════════════════════
     TRANSPORTE ANTIGUO — EmailJS, desde el navegador.
     Sin cambios. No tocar mientras quede un módulo que lo use.
     ════════════════════════════════════════════════════════════ */

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

  /* ════════════════════════════════════════════════════════════
     TRANSPORTE NUEVO — la Edge Function `send-email`.
     ════════════════════════════════════════════════════════════ */

  const FUNCION = 'send-email';

  /* Lo que se le enseña al admin cuando algo falla.

     El código de error que devuelve la función es para nosotros; a la
     persona que está delante del botón le sirve saber DOS cosas: si
     salió algo y qué puede hacer. Sin esta traducción el toast diría
     "FunctionsHttpError: Edge Function returned a non-2xx status code",
     que no informa de ninguna de las dos. */
  const MENSAJES = {
    missing_authorization: 'You are not signed in. Sign in again and retry — nothing was sent.',
    not_authorized:        'Your account is not an active admin. Nothing was sent.',
    auth_check_failed:     'Could not verify your admin access. Try again — nothing was sent.',

    kind_invalido:     'Internal error: unknown email type. Nothing was sent.',
    template_invalido: 'Internal error: unknown email template. Nothing was sent.',

    sin_destinatarios:        'There is nobody to send to.',
    demasiados_destinatarios: 'Too many recipients for one send (limit is 1000). Nothing was sent.',
    ningun_email_valido:      'None of the addresses are valid. Nothing was sent.',
    test_email_invalido:      'That test address is not a valid email.',

    resend_failed: 'The email provider rejected the request. Nothing was sent.',

    no_se_pudo_crear:  'Server error creating the send record. Nothing was sent.',
    idempotencia_rota: 'Server error checking for a duplicate send. Nothing was sent.',
    lectura_fallo:     'Server error reading the recipient list. Check the Supabase logs.',
    snapshot_fallo:    'Server error writing the recipient list. Check the Supabase logs.',
    reserva_fallo:     'Server error reserving recipients. Check the Supabase logs.',
    unexpected:        'Unexpected server error. Check the Supabase logs.',

    network:   'Could not reach the server. Check your connection, then try again.',
    no_client: 'Internal error: the Supabase client is not ready.',
  };

  /**
   * Saca el error REAL de lo que devuelve supabase-js.
   *
   * Esto no es un adorno. Cuando la función responde 401/403/400, la
   * librería envuelve la respuesta en un FunctionsHttpError cuyo
   * `.message` es siempre el mismo texto genérico. El cuerpo — donde
   * está el código que sí dice qué pasó — viaja en `.context`, que es
   * el Response todavía sin leer. Sin esto, todos los fallos parecen
   * exactamente el mismo fallo.
   *
   * Se clona antes de leer: el cuerpo de un Response se consume una
   * sola vez, y leerlo aquí no debe dejarlo vacío para nadie más.
   */
  async function leerError(error) {
    const out = {
      status: null,
      code:   null,
      detail: (error && error.message) || 'unknown',
    };
    const ctx = error && error.context;
    if (!ctx) return out;
    if (typeof ctx.status === 'number') out.status = ctx.status;

    try {
      const fuente = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
      if (fuente && typeof fuente.json === 'function') {
        const cuerpo = await fuente.json();
        if (cuerpo && typeof cuerpo === 'object') {
          if (cuerpo.error) out.code = String(cuerpo.error);
          if (cuerpo.detail)     out.detail = String(cuerpo.detail);
          else if (cuerpo.error) out.detail = String(cuerpo.error);
        }
      }
    } catch (_) {
      /* Un cuerpo que no es JSON no cambia nada: ya tenemos el estado
         HTTP y el mensaje de la librería. */
    }
    return out;
  }

  /**
   * Manda por el servidor.
   *
   * @param {object} payload  Lo que espera la función: kind, template,
   *                          subject, body, meta, recipients[], y
   *                          opcionalmente idempotency_key — o bien
   *                          preview:true / test_email.
   * @returns {Promise<{ok:boolean, data?:object, code?:string|null,
   *                    status?:number|null, detail?:string, message:string}>}
   *
   * NUNCA lanza. Quien llama decide qué hacer con `ok`, igual que hacía
   * con el true/false de sendOneEmail. Un throw suelto a mitad de un
   * envío deja el botón bloqueado y `emailInFlight` en true, y desde
   * ahí la página no vuelve a mandar nada hasta recargarla.
   */
  async function sendEmailServer(payload) {
    const sb = window.supabase;
    if (!sb || !sb.functions || typeof sb.functions.invoke !== 'function') {
      console.error('[Ferocia] db.js must load before sendEmailServer is called');
      return { ok: false, code: 'no_client', status: null,
               detail: 'supabase client missing', message: MENSAJES.no_client };
    }

    let data, error;
    try {
      ({ data, error } = await sb.functions.invoke(FUNCION, { body: payload }));
    } catch (e) {
      /* Se cayó la red, o la petición no llegó a salir.

         Fíjate en lo que NO dice este mensaje: no promete que no se
         mandó nada, porque no lo sabemos — la petición pudo llegar y
         perderse la respuesta. Lo que sí sabemos es que reintentar es
         seguro: con la misma idempotency_key el servidor retoma la
         misma campaña y no le manda a nadie dos veces. */
      return { ok: false, code: 'network', status: null,
               detail: String(e), message: MENSAJES.network };
    }

    if (!error) return { ok: true, data: data || {}, message: '' };

    const info = await leerError(error);
    return {
      ok: false,
      code:   info.code,
      status: info.status,
      detail: info.detail,
      message: MENSAJES[info.code] || `Send failed: ${info.detail}`,
    };
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

  window.sendOneEmail    = sendOneEmail;
  window.sendEmailServer = sendEmailServer;
})();
