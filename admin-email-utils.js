/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: SHARED EMAIL UTILITIES
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-email-utils.js -> cualquier
               pantalla que mande correo.

   Vivía dentro de app.js; se sacó aquí porque lo usaban varias
   pantallas a la vez. Ofrece:

     window.sendEmailServer(payload)
         Manda por la Edge Function `send-email`, en el servidor.
         Devuelve { ok, data, code, detail, message }. Nunca lanza.

     window.crearClaveador(prefijo)
         La clave contra envíos duplicados, una por pantalla.

     window.nombreDestinatario(p) / window.resumenEnvio(d)
         Dos ayudantes que usan por igual todas las pantallas.

     AdminState.emailInFlight
         Shared boolean guard so a page navigation mid-send can warn
         the user, no matter which feature is currently sending.

   ── TODO EL CORREO SALE DEL SERVIDOR ──────────────────────────────
   Las pantallas del admin que mandan correo pasan por aquí, y de aquí a
   la Edge Function `send-email`. A día de hoy son siete: Promotions,
   avisos de ladder, avisos de torneo, correo a todos los jugadores,
   mensaje a un jugador, el recordatorio de confirmación y el reintento
   del historial.

   Hay dos que NO pasan por aquí, y las dos por el mismo motivo —
   necesitan su propia función del servidor:
     · el Newsletter, que llama a `send-newsletter` porque arma el
       correo con las secciones del mes;
     · el formulario público (subscribe.html), que llama a
       `subscribe-confirm` porque ahí no hay ningún admin con sesión.

   ⚠️  LA REGLA QUE SOSTIENE TODO ESTO: no queda ni una credencial de
   proveedor de correo en el código del navegador — ni aquí, ni en
   config.js, ni en ninguna página. Viven como secretos de Supabase y
   sólo las ven las funciones del servidor. Si algún día hace falta
   mandar correo desde una pantalla nueva, se hace a través de una
   función del servidor; nunca metiendo una clave en el navegador.

   Lo demás que da mandar desde el servidor:
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
     TRANSPORTE NUEVO — la Edge Function `send-email`.
     ════════════════════════════════════════════════════════════ */

  const FUNCION = 'send-email';

  /* Cuánto se espera al servidor antes de dejar de esperarlo. Una
     campaña de 460 va en lotes de 100 y tarda segundos, no minutos, así
     que tres minutos es de sobra: esto no está para cortar un envío
     lento, sino para que uno colgado no congele el admin. */
  const TOPE_MS = 180000;

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

    no_se_pudo_crear:  'Server error creating the send record. Nothing was sent.',
    idempotencia_rota: 'Server error checking for a duplicate send. Nothing was sent.',
    lectura_fallo:     'Server error reading the recipient list. Check the Supabase logs.',
    snapshot_fallo:    'Server error writing the recipient list. Check the Supabase logs.',
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
   *                          opcionalmente idempotency_key.
   * @returns {Promise<{ok:boolean, data?:object, code?:string|null,
   *                    status?:number|null, detail?:string, message:string}>}
   *
   * NUNCA lanza: quien llama decide qué hacer mirando `ok`. Un throw
   * suelto a mitad de un envío deja el botón bloqueado y
   * `emailInFlight` en true, y desde ahí la página no vuelve a mandar
   * nada hasta recargarla.
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
      /* CON LÍMITE DE TIEMPO, y no por capricho.

         Mientras esta llamada no conteste, `emailInFlight` sigue en
         true, y con eso las ventanas de correo no se dejan cerrar ni
         reabrir (ver envioEnCurso). Sin un tope, una petición que se
         queda colgada —arranque en frío atascado, un proxy que no
         suelta el socket, wifi que ni falla ni responde— dejaba el
         admin congelado detrás de una capa a pantalla completa, sin
         más salida que recargar.

         No se puede cancelar la petición de verdad (functions.invoke
         no acepta una señal de aborto), así que lo que se hace es
         DEJAR DE ESPERARLA. El envío puede seguir su curso en el
         servidor: por eso el mensaje es el mismo que el de la red
         caída, el que a propósito NO promete que no se mandó nada.
         Reintentar es seguro — la misma idempotency_key retoma la
         misma campaña y nadie recibe dos copias. */
      const conTope = new Promise((_, rechaza) =>
        setTimeout(() => rechaza(new Error(`sin respuesta en ${TOPE_MS / 1000}s`)), TOPE_MS));
      ({ data, error } = await Promise.race([
        sb.functions.invoke(FUNCION, { body: payload }),
        conTope,
      ]));
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

  /* ════════════════════════════════════════════════════════════
     LA CASILLA DE ENSAYO Y EL BOTÓN VAN JUNTOS

     Un botón que dice "Send to All Players" mientras la casilla de
     ensayo está marcada es una trampa: dice una cosa y hace otra. Con
     la casilla puesta, el botón lo dice — y dice LO MISMO que la
     casilla, palabra por palabra, para que no haya que interpretar
     nada.

     Se guarda el HTML original una sola vez y se sustituye sólo el
     texto, así el icono no se pierde.

     Vive aquí porque son cuatro pantallas con casilla. Escrito cuatro
     veces, a la tercera ya no dirían lo mismo.
     ════════════════════════════════════════════════════════════ */

  const ETIQUETA_ENSAYO = 'Send only to me';

  /**
   * @param {string} casillaId  la casilla "Send only to me"
   * @param {string} botonId    el botón de enviar
   * @param {string} textoNormal  el texto que el botón trae escrito en
   *        admin.html — tiene que coincidir EXACTAMENTE, o el cambio
   *        no encuentra qué sustituir.
   * @returns {{sync:function, reset:function, bloquear:function, original:string}}
   */
  function vincularEnsayo(casillaId, botonId, textoNormal) {
    const chk = document.getElementById(casillaId);
    const btn = document.getElementById(botonId);
    if (!chk || !btn) {
      /* Sin esto el fallo es SILENCIOSO: reset() no desmarcaría nada y
         el aviso "the checkbox is now off" estaría mintiendo. */
      console.error(`[Ferocia] vincularEnsayo: falta #${casillaId} o #${botonId}`);
      return { sync: () => {}, reset: () => {}, bloquear: () => {} };
    }

    const original = btn.innerHTML;
    if (original.indexOf(textoNormal) === -1) {
      /* Si el texto de admin.html cambia y aquí no, el botón se
         quedaría sin avisar del ensayo y nadie se enteraría. Mejor
         que se vea en la consola. */
      console.warn(`[Ferocia] "${textoNormal}" no está en #${botonId}: la etiqueta de ensayo no cambiará`);
    }

    const sync = () => {
      btn.innerHTML = chk.checked
        ? original.replace(textoNormal, ETIQUETA_ENSAYO)
        : original;
    };
    chk.addEventListener('change', sync);

    /** Al abrir la ventana, y después de un ensayo. */
    const reset = () => { chk.checked = false; sync(); };

    /* Durante el envío la casilla se bloquea.

       Si no, se puede marcar o desmarcar MIENTRAS se manda, y entonces
       el botón y la casilla acaban diciendo cosas distintas: el envío
       ya salió con el valor que había al pulsar, pero la pantalla
       enseña el nuevo. Bloquearla mientras dura el envío quita el
       problema de raíz, en vez de intentar arreglarlo después. */
    const bloquear = (b) => { chk.disabled = !!b; };

    return { sync, reset, bloquear, original };
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

  /**
   * El aviso verde cuando un envío sale bien. UNO solo, para las cuatro
   * pantallas, porque las cuatro se equivocaban de tres maneras:
   *
   * 1. Un REINTENTO contaba sólo lo reintentado. Tras un parcial de una
   *    campaña de 460, el segundo intento decía "3 emails sent" y
   *    cerraba la ventana: por pantalla no había forma de saber si
   *    habían recibido 3 personas o 463.
   * 2. Cuando ya estaba todo mandado, el servidor contesta sent:0 con
   *    estado 'sent' — y salía un "✅ 0 emails sent successfully!".
   *    Pasa de verdad: se pierde la respuesta, ella reintenta, y el
   *    servidor ve que no queda nada por hacer.
   * 3. `d.sent` incluye TU copia, así que tras aprobar "Send to 50"
   *    el aviso decía 51. Ahora se nombra la copia en vez de callarla.
   *
   * @param   {object} d  lo que contesta la Edge Function
   * @returns {string}    el texto del aviso
   */
  function mensajeExito(d) {
    const nuevos = d.sent || 0;
    const antes  = d.already_sent || 0;
    const total  = nuevos + antes;

    if (!nuevos && antes) {
      return `Everyone had already received this — nothing new was sent.`;
    }
    if (antes) {
      return `✅ Sent to the remaining ${nuevos}. ${total} people have now received it.`;
    }
    if (!nuevos) return `Nothing was sent — there was nobody to send to.`;
    return `✅ Sent successfully — ${nuevos} email${nuevos === 1 ? '' : 's'}, your copy included.`;
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

  /**
   * ¿Se puede tocar esta ventana de correo ahora mismo?
   *
   * Devuelve false —y avisa— mientras haya un envío en curso. Existe
   * porque cerrar la ventana a mitad de un envío no lo detiene: sigue
   * corriendo, y al volver a abrirla el composer se limpia y se lleva
   * por delante el asunto y el mensaje del envío que todavía no ha
   * contestado. Si ese envío sale parcial, el texto que hace falta
   * para reintentar ya no existe.
   *
   * Email All Players ya se protegía así; las demás pantallas no, y
   * eran copias del mismo patrón. Ahora la comprobación vive en un
   * solo sitio y dice lo mismo en las cinco.
   *
   * @param   {string} [que]  qué se estaba intentando hacer, para el aviso
   * @returns {boolean}       true si hay un envío en curso (o sea: no toques)
   */
  function envioEnCurso(que) {
    if (!window.AdminState || !window.AdminState.emailInFlight) return false;
    /* `toast` se busca AL LLAMAR, no al cargar: este archivo se carga
       antes que app.js, que es quien lo publica en window. */
    const aviso = window.toast || ((m) => console.warn('[Ferocia]', m));
    /* El mensaje NO dice "este envío", porque `emailInFlight` es uno
       solo para todo el admin: el que está corriendo puede ser el de
       otra pantalla — un newsletter, por ejemplo. Si dijera "este",
       ella leería "aquí no estoy mandando nada" y pensaría que la
       pantalla está rota. Diciendo "somewhere in the admin" sabe dónde
       mirar. */
    aviso(que === 'abrir'
      ? 'A send is still running somewhere in the admin. Please wait for it to finish before opening this again.'
      : 'A send is still running somewhere in the admin. Please wait for it to finish.', true);
    return true;
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

  window.sendEmailServer = sendEmailServer;
  window.crearClaveador  = crearClaveador;
  window.nombreDestinatario = nombreDestinatario;
  window.resumenEnvio       = resumenEnvio;
  window.mensajeExito       = mensajeExito;
  window.vincularEnsayo     = vincularEnsayo;
  window.envioEnCurso       = envioEnCurso;
})();
