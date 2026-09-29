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

  /* ─── EL NOMBRE PARA EL SALUDO ─────────────────────────────
     `[a, b].filter(Boolean).join(' ')` y no `${a} ${b}`: alguien sin
     apellido salía saludado como "Hi Ana null," porque la
     interpolación convierte el null en texto. */
  function nombreDestinatario(p) {
    return [p && p.first_name, p && p.last_name]
      .filter(Boolean).join(' ').trim() || 'Player';
  }

  /* ─── EL RESUMEN DE LO QUE PASÓ ────────────────────────────
     Campo por campo, porque cada uno significa algo distinto y
     mezclarlos sería mentir:
       sent              salieron en esta ejecución
       already_sent      ya habían salido antes (un reintento)
       failed            rebotaron o el proveedor los rechazó
       unconfirmed       salieron, pero no se pudo escribir su fila;
                         se recuperan solos en el siguiente intento
       invalid_addresses descartados antes de empezar por no ser un
                         correo válido — nunca se intentaron */
  function resumenEnvio(d) {
    const partes = [];
    if (d.sent)         partes.push(`${d.sent} sent`);
    if (d.already_sent) partes.push(`${d.already_sent} already sent earlier`);
    if (d.failed)       partes.push(`${d.failed} failed`);
    if (d.unconfirmed)  partes.push(`${d.unconfirmed} unconfirmed (will retry)`);
    if (d.invalid_addresses) {
      partes.push(`${d.invalid_addresses} invalid address${d.invalid_addresses === 1 ? '' : 'es'}`);
    }
    return partes.length ? partes.join(', ') : 'nothing to send';
  }

  /* ════════════════════════════════════════════════════════════
     CONTRA EL ENVÍO DUPLICADO

     El servidor rechaza un envío repetido si llega con la misma
     `idempotency_key`. La clave se compone de dos trozos y cada uno
     resuelve un caso distinto:

       · el NONCE, que se renueva al abrir la ventana de envío
       · el HASH del contenido

     Doble clic en Enviar      → mismo nonce, mismo hash → misma clave
                                 → el segundo no manda nada. ✔
     Editas el texto y reenvías→ mismo nonce, OTRO hash → clave nueva
       sin cerrar la ventana      → se manda el texto NUEVO. ✔
                                 (con una clave sólo por contenido, el
                                 servidor habría retomado el envío
                                 viejo y mandado el texto ANTERIOR)
     Falla y reintentas        → misma clave → RETOMA el mismo envío y
                                 se salta a quien ya recibió. ✔
     Terminó bien y reenvías   → la clave se limpió al terminar, así
       a propósito                que sale un envío nuevo. ✔

     Vive aquí y no en cada módulo porque son cuatro pantallas que
     mandan en lote, y esto escrito cuatro veces es lo mismo escrito
     de tres formas distintas al cabo de un año.
     ════════════════════════════════════════════════════════════ */

  const _nuevoNonce = () =>
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const _hashCorto = async (txt) => {
    try {
      if (!window.crypto || !window.crypto.subtle) return null;
      const buf = await window.crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].slice(0, 8)
        .map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      /* Sin crypto.subtle no hay clave. Se manda igual: el envío
         funciona y el botón deshabilitado sigue cubriendo el doble
         clic. Es peor, pero no es motivo para no enviar. */
      return null;
    }
  };

  /**
   * Un generador de claves por pantalla.
   *
   * @param {string} prefijo  para reconocer de dónde salió la clave
   *                          cuando se mira la tabla `communications`.
   */
  function crearClaveador(prefijo) {
    let nonce = null;
    return {
      /** Al abrir la ventana de envío. NO renueva si hay una pendiente:
          un envío que falló deja la suya puesta, y reintentar tiene que
          retomarlo en vez de crear otro y duplicar a quien ya recibió. */
      asegurar: () => { if (!nonce) nonce = _nuevoNonce(); },
      /** Tras un envío CORRECTO: el siguiente será uno nuevo. */
      limpiar: () => { nonce = null; },
      /** @param {Array} partes  lo que identifica este envío concreto */
      clave: async (partes) => {
        if (!nonce) nonce = _nuevoNonce();
        const h = await _hashCorto(partes.map((p) => String(p ?? '')).join('\u0000'));
        return h ? `${prefijo}-${nonce}-${h}` : null;
      },
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
  window.crearClaveador  = crearClaveador;
  window.nombreDestinatario = nombreDestinatario;
  window.resumenEnvio       = resumenEnvio;
})();
