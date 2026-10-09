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

    /* El envío se corta cuando no se puede comprobar quién se dio de
       baja. Sin esta línea salía el texto crudo de la base de datos, que
       no dice ninguna de las dos cosas que ella necesita saber: que no
       salió nada, y que puede volver a pulsar. */
    baja_check_failed: 'Could not check who has unsubscribed, so nothing was sent — '
                     + 'press Send again and it will pick up where it left off.',

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
  /**
   * ¿Está TERMINADA esta campaña? O sea: ¿se puede asegurar que de ella
   * no va a salir ni un correo más, nunca?
   *
   * De esto depende cuándo se renueva la llave anti-duplicados, y las
   * dos formas de equivocarse hacen daño en direcciones opuestas:
   *
   * · RENOVARLA ANTES DE TIEMPO → el siguiente envío con el mismo texto
   *   abre una campaña NUEVA, el servidor ya no sabe quién tenía el
   *   correo, y todos reciben una segunda copia.
   * · NO RENOVARLA NUNCA → la pantalla se queda enganchada a una
   *   campaña vieja. Pulsar Enviar reanuda aquélla, no sale nada, y el
   *   aviso te dice que lo vuelvas a intentar. El recordatorio de
   *   confirmación es el caso peor: su lista de destinatarios cambia
   *   cada vez (los pendientes de hoy), así que quedarse enganchado lo
   *   deja mudo para siempre.
   *
   * ── POR QUÉ NO VALE MIRAR `d.status` ─────────────────────────
   * Porque esa etiqueta cambió de significado el 3 de octubre y esto no
   * puede cambiar con ella. Hoy 'sent' quiere decir "no queda nada que
   * intentar", que es casi lo que hace falta — pero se escribe también
   * cuando el envío no pudo contar las filas, y entonces mentiría. Esto
   * se calcula con las CUENTAS, que no han cambiado de significado
   * nunca.
   *
   * ── LA CUENTA ────────────────────────────────────────────────
   * Terminada = a cada destinatario le llegó, o ya se le había enviado
   * antes, o se agotaron sus tres intentos y no se le va a volver a
   * escribir. Fíjate en que los agotados CUENTAN: ignorarlos es lo que
   * dejaba la campaña enganchada para siempre en cuanto una dirección
   * se muere — y con 453 personas, eso pasa casi todos los meses.
   *
   * Si las cuentas no se pudieron leer, el servidor manda `total: 0` y
   * esto devuelve `false`. Es la dirección correcta del error: ante la
   * duda, la llave se queda puesta y nadie recibe nada dos veces.
   *
   * Y si el servidor es anterior a este cambio no manda `gave_up`:
   * cuenta como cero, o sea que esto se comporta como antes —
   * conservador— en vez de romperse.
   */
  function envioTerminado(d) {
    if (!d) return false;
    const total = Number(d.total) || 0;
    if (total <= 0) return false;
    const cubiertos = (Number(d.sent) || 0)
                    + (Number(d.already_sent) || 0)
                    + (Number(d.gave_up) || 0);
    return cubiertos >= total;
  }

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

    /* ── NI UN ✅ NI UN "TODOS" CUANDO ALGUIEN SE QUEDÓ FUERA ──
       Desde el 3 de octubre una campaña se da por terminada aunque
       alguna dirección se haya dado por perdida, y entonces dos de
       estas frases pasaron a ser falsas de la peor manera:

         · "Everyone had already received this" seguido de
           "1 address could not be reached" se contradice a sí mismo;
         · "there was nobody to send to" de un envío en el que SÍ había
           gente, y a toda le falló la dirección.

       Lo que falte lo nombra `loQueFalto`, que se pega detrás. Lo que
       hace falta aquí es no afirmar lo contrario, y no poner el ✅. */
    const perdidas = (Number(d && d.gave_up) || 0)
                   + (Number(d && d.invalid_addresses) || 0);
    const ok = perdidas ? '' : '✅ ';

    if (!nuevos && antes) {
      return perdidas
        ? `Nothing new was sent — everyone else had already received this.`
        : `Everyone had already received this — nothing new was sent.`;
    }
    if (antes) {
      return `${ok}Sent to the remaining ${nuevos}. ${total} people have now received it.`;
    }
    if (!nuevos) {
      return perdidas
        ? `Nothing was sent.`
        : `Nothing was sent — there was nobody to send to.`;
    }
    return `${ok}Sent successfully — ${nuevos} email${nuevos === 1 ? '' : 's'}, your copy included.`;
  }

  /**
   * ¿Se quedó alguien fuera de este envío?
   *
   * Sirve para el COLOR del aviso, no para su texto. Un envío que
   * terminó dejando a tres personas sin el correo no es un fallo —no
   * hay nada que reintentar— pero tampoco es un ✅ verde: es algo que
   * ella tiene que ver. Pintarlo verde escondía justo el dato por el
   * que existe `loQueFalto`.
   */
  function huboPerdidas(d) {
    return ((Number(d && d.gave_up) || 0)
          + (Number(d && d.invalid_addresses) || 0)) > 0;
  }

  /**
   * Lo que NO llegó, para pegarlo detrás del aviso de éxito.
   *
   * Hace falta desde que una campaña se da por terminada aunque alguna
   * dirección se haya dado por perdida: sin esto, el aviso diría
   * "✅ Enviado correctamente" de un envío al que le faltó gente, y ella
   * no tendría forma de enterarse. Un ✅ que esconde algo es peor que un
   * aviso feo.
   */
  function loQueFalto(d) {
    const partes = [];
    const perdidas = Number(d && d.gave_up) || 0;
    const malas    = Number(d && d.invalid_addresses) || 0;
    if (perdidas) {
      partes.push(`${perdidas} address${perdidas === 1 ? '' : 'es'} could not be reached`);
    }
    if (malas) {
      partes.push(`${malas} invalid address${malas === 1 ? '' : 'es'} skipped`);
    }
    return partes.length ? ` ${partes.join(', ')}.` : '';
  }

  /**
   * A QUIEN SE DEJÓ FUERA POR NO TENER ENLACE DE BAJA.
   *
   * Un correo con un "Unsubscribe" que lleva a "Invalid Link" deja a esa
   * persona con una sola salida: el botón de spam. Y una queja de spam
   * baja la reputación del dominio para todos los demás. Así que a quien
   * no tiene su código no se le manda.
   *
   * Pero dejar a alguien fuera EN SILENCIO es el otro fallo, no el
   * arreglo: por eso esta frase. Sale en la ventana de confirmación
   * (antes de mandar) y en el aviso del final.
   *
   * Desde `sql/64` la base no deja crear a nadie sin código, así que
   * esto no debería salir nunca. Si sale, hay un dato raro.
   *
   * @param   {number} n  cuántos se quedaron fuera
   * @returns {string}    la frase, o '' si no se quedó nadie
   */
  function avisoSinEnlaceDeBaja(n) {
    const c = Number(n) || 0;
    if (c <= 0) return '';
    return ` ${c} ${c === 1 ? 'subscriber was' : 'subscribers were'} left out `
         + 'because they have no working unsubscribe link — tell your developer.';
  }

  /**
   * LO QUE CAMBIÓ EN LA LISTA AL RETOMAR UN ENVÍO.
   *
   * Cuando un envío no termina del todo, la aplicación se queda
   * enganchada a él y la siguiente pulsación lo retoma. Hasta el 5 de
   * octubre eso DESCARTABA EN SILENCIO a quien se hubiera apuntado
   * entremedias: la ventana decía "a 15 suscriptores", no les llegaba a
   * 5 de ellos, y el aviso decía "ya lo habían recibido todos".
   *
   * Ahora el servidor los añade, y esto lo cuenta. Sin esta frase el
   * arreglo seguiría siendo silencioso, sólo que al revés: la lista
   * cambiaría sola y nadie se enteraría.
   *
   * Los dos números son CERO en un envío nuevo, así que esto no dice
   * nada salvo cuando de verdad se retomó algo y la lista se movió.
   *
   * Va pegada detrás del resultado, igual que `loQueFalto`, en las siete
   * pantallas que mandan por `send-email`.
   *
   * @param   {object} d  lo que contesta la Edge Function
   * @returns {string}    la frase, o '' si no cambió nada
   */
  function loQueEntro(d) {
    const partes = [];
    const nuevos  = Number(d && d.added) || 0;
    const fuera   = Number(d && d.removed) || 0;
    if (nuevos) {
      partes.push(`${nuevos} ${nuevos === 1 ? 'person had' : 'people had'} signed up `
                + 'since the last attempt and been added');
    }
    /* Se nombra aparte y SIEMPRE, aunque no se añadiera a nadie: que una
       persona se haya dado de baja a mitad de un envío es justo lo que
       hay que poder ver en el historial. */
    if (fuera) {
      partes.push(`${fuera} ${fuera === 1 ? 'person' : 'people'} unsubscribed `
                + 'in the meantime and been taken off');
    }
    return partes.length ? ` ${partes.join(', ')}.` : '';
  }

  /**
   * SI EL ENVÍO SE CORTÓ, POR QUÉ — Y SI PULSAR SIRVE DE ALGO.
   *
   * El servidor distingue tres motivos de corte y los manda en
   * `stopped_because`. Ninguna de las cinco pantallas los leía: con la
   * clave del proveedor caducada, lo que salía era "Finished: 100
   * failed. Press Send again to retry the ones that failed."
   *
   * Y eso no se acaba nunca. En ese corte los intentos NO suben a
   * propósito (esas direcciones no tienen nada de malo), así que se
   * puede pulsar indefinidamente y pasa siempre lo mismo. El único
   * dato que sirve —el proveedor rechazó nuestra contraseña, y hasta
   * arreglarla no va a salir nada— estaba en la respuesta y se tiraba.
   *
   * De los tres motivos, sólo uno se arregla volviendo a pulsar, y cada
   * frase lo dice.
   *
   * ⚠️  ESTA FUNCIÓN ES LA ÚNICA VOZ DEL CORTE, TAMBIÉN PARA EL
   * NEWSLETTER. El servidor compone su propia frase (`mensajeCorte`, en
   * send-newsletter), y la segunda revisión demostró que las dos no
   * coincidían: la del servidor decía "vuelve a pulsar" para los tres
   * motivos y sin mirar si algo salió sin apuntarse. Así que la pantalla
   * del Newsletter ignora `message` cuando hay corte y usa esto. Un
   * aviso, un sitio.
   *
   * @param   {object} d  lo que contesta la Edge Function
   * @returns {string}    el aviso entero, o '' si no se cortó
   */
  function motivoDelCorte(d) {
    const motivo = d && d.stopped_because;
    const razon =
        motivo === 'credenciales'
          ? 'the email provider rejected our login — the RESEND_API_KEY secret needs checking'
      : motivo === 'lote_grande'
          ? 'the provider says this email is too large to send in batches of 100'
      : motivo === 'proveedor_caido'
          ? 'the email provider is not responding'
      : '';
    if (!razon) return '';

    /* Correos que SALIERON y no se pudieron apuntar. Es el único dato de
       toda la respuesta que puede acabar en una copia repetida, así que
       manda sobre el resto.

       Dos nombres para lo mismo: `send-email` lo llama `unconfirmed` y
       `send-newsletter` lo llama `unrecorded`. Se aceptan los dos para
       que esta función sirva a las seis pantallas.

       (Aquí NO se cuentan los FALLOS sin apuntar: ésos no salieron.) */
    const sinApuntar = (Number(d && d.unconfirmed) || 0)
                    || (Number(d && d.unrecorded) || 0);
    const enviados   = Number(d && d.sent) || 0;
    /* Los que ya lo tenían de una vuelta anterior. Sin esto, el segundo
       corte de un envío de 453 decía "Sent to 50" y no había forma de
       saber que 400 ya estaban hechos. */
    const antes      = (Number(d && d.already_sent) || 0)
                    || (Number(d && d.skipped) || 0);

    const cuantos = antes
      ? `${enviados} now and ${antes} earlier`
      : `${enviados}`;
    const cabecera = sinApuntar
      ? `Sent to ${cuantos} that could be recorded, then stopped: `
      : `Sent to ${cuantos}, then stopped: `;

    /* ── EL AVISO DE LOS NO APUNTADOS GANA A TODO LO DEMÁS ─────
       Y hace falta decirlo aquí: la revisión encontró que, al enseñar el
       motivo del corte EN LUGAR del resumen, este dato desaparecía — era
       el único sitio donde se nombraba (`resumenEnvio`).

       Lo malo no es que desapareciera un número. Es que el corte por
       proveedor caído dice "espera unos minutos y vuelve a pulsar", y a
       los 15 minutos el rescate del servidor recoge esas filas y les
       vuelve a escribir. O sea que la frase tranquilizadora llevaba a la
       copia repetida, que es lo peor que puede pasar aquí.

       La misma regla que ya usa la pantalla del Newsletter: si algo salió
       sin apuntarse, eso es lo único que importa y NO se vuelve a mandar.

       ⚠️  LA FRASE NO NOMBRA NINGÚN BOTÓN. Decía "Do NOT press Send
       again", y de las seis pantallas que la enseñan dos no tienen
       ningún botón que se llame Send: en Promotions dice "Launch
       Campaign" y en Communications dice "Retry". Mandarla a no pulsar
       un botón que no existe es mandarla a no hacer nada. */
    if (sinApuntar) {
      return `${cabecera}${razon}. `
        + `⚠️ ${sinApuntar}${enviados ? ' more' : ''} email${sinApuntar === 1 ? '' : 's'} `
        + 'went out but could not be recorded. Do not send this again from any screen — '
        + 'those people would get it twice. Check with me first.'
        + loQueFalto(d);
    }

    /* De los tres cortes, sólo uno se arregla volviendo a pulsar. Los
       otros dos acaban en "dímelo y lo arreglo": ella no tiene por qué
       saber qué es un secreto de Supabase ni cómo se acorta un correo.

       Tampoco se nombra el botón, por lo mismo de arriba: "send it
       again" vale para Send, para Launch Campaign y para Retry. */
    const queHacer =
        motivo === 'proveedor_caido'
          ? ' Wait a few minutes and send it again — the rest will go out, and nobody gets it twice.'
      : motivo === 'lote_grande'
          ? ' Nothing more will go out until it is made shorter — tell me and I will fix it.'
      : ' Sending it again will not help until it is fixed — tell me and I will sort it out.';

    /* Y las direcciones mal escritas se nombran también aquí: en un corte
       nunca se llega al aviso verde, que es el único sitio donde se
       decían (`loQueFalto`), así que desaparecían sin dejar rastro. */
    return `${cabecera}${razon}.${queHacer}${loQueFalto(d)}`;
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
     LLEGÓ A TODOS y reenvías  → la clave se limpió al terminar, así
       a propósito                que sale un envío nuevo. ✔

     Ojo con esa última línea, que es la que sostiene todo lo demás: la
     clave se suelta cuando el correo LLEGÓ A TODOS, no cuando el
     servidor dice "terminado". Desde el 3 de octubre esas dos cosas no
     son lo mismo — 'sent' quiere decir "no queda nada que intentar", y
     un envío con una dirección muerta lo cumple aunque falte uno.
     Soltar la clave ahí abriría una campaña NUEVA en el siguiente envío
     con el mismo texto, y todos los que ya lo tenían recibirían otra
     copia.

     Y esperar a que llegue a TODOS tampoco vale: con una dirección
     muerta eso no pasa nunca, y la pantalla se queda enganchada a una
     campaña que ya no puede mandar nada. Lo correcto es renovarla
     cuando la campaña está TERMINADA. Esa cuenta vive en
     `envioTerminado`, con el porqué entero.

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
  window.leerErrorDeFuncion = leerError;   // el Hub lee igual los errores de sus funciones
  window.crearClaveador  = crearClaveador;
  window.nombreDestinatario = nombreDestinatario;
  window.resumenEnvio       = resumenEnvio;
  window.mensajeExito       = mensajeExito;
  window.loQueFalto         = loQueFalto;
  window.loQueEntro         = loQueEntro;
  window.avisoSinEnlaceDeBaja = avisoSinEnlaceDeBaja;
  window.huboPerdidas       = huboPerdidas;
  window.motivoDelCorte     = motivoDelCorte;
  window.envioTerminado     = envioTerminado;
  window.vincularEnsayo     = vincularEnsayo;
  window.envioEnCurso       = envioEnCurso;
})();
