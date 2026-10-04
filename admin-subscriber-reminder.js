/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: RECORDATORIO DE CONFIRMACIÓN
   Depende de: config.js, db.js (api), admin-state.js,
               admin-email-utils.js, admin-promotions.js
               (window.loadSubscribers) y app.js (toast, confirmModal).
   Orden de carga: admin-email-utils.js -> admin-promotions.js ->
                   admin-subscriber-reminder.js -> app.js
   (toast y confirmModal se buscan al pulsar el botón, no al cargar,
   así que app.js puede seguir cargándose después.)

   Vivía dentro de app.js, la única de las cinco pantallas de correo
   que seguía en el archivo grande. Al sacarla se le añadió lo que las
   otras cuatro ya tenían: el ensayo "Send only to me", la bandera de
   envío en curso y el destinatario vinculado a su ficha.

   ESTA PANTALLA NO TIENE EDITOR: el asunto es fijo y el cuerpo lo
   pinta la plantilla 'confirm' del servidor. Por eso el ensayo importa
   más aquí que en ninguna otra: es la única forma de ver este correo
   sin mandárselo a una persona de verdad.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;

  const claveador = window.crearClaveador('recordatorio');
  const ensayo    = window.vincularEnsayo('pr-only-me', 'pr-send-btn', 'Send Reminder');

  const ASUNTO = '⏰ Reminder: Please confirm your Ferocia Sports subscription';

  /* El enlace que va en el ensayo NO confirma a nadie.
     Poner ahí el token de una persona real haría que un clic tuyo
     confirmara su suscripción sin que ella hiciera nada. Este texto
     lleva puntos, así que no pasa el filtro de confirm.html: la página
     contesta "Invalid Link" sin llegar a consultar la base de datos. */
  const TOKEN_ENSAYO = 'ensayo.no.confirma.a.nadie';

  const enlaceConfirmar = (token) =>
    window.location.origin
    + window.location.pathname.replace('admin.html', '')
    + `confirm.html?t=${token}`;

  const enviarRecordatorio = async () => {
    if (window.AdminState.emailInFlight) {
      toast('A send is still running somewhere in the admin. Please wait for it to finish.', true);
      return;
    }
    if (!CFG) {
      console.error('[confirm-reminder] falta config.js');
      toast('Configuration is missing. Please reload the page.', true);
      return;
    }

    const btn = document.getElementById('pr-send-btn');
    if (!btn) { console.error('[confirm-reminder] falta #pr-send-btn'); return; }

    /* El botón se apaga AQUÍ, antes de cualquier `await`.
       `emailInFlight` no se pone hasta más abajo, y entre medias hay una
       consulta de red para traer los pendientes. Un segundo clic en ese
       hueco arrancaba un envío paralelo: los correos se salvaban porque
       los dos llevan la misma llave, pero el primero en terminar apagaba
       la bandera global y dejaba al resto del admin sin protección con
       un envío todavía en marcha. */
    if (btn.disabled) return;
    btn.disabled = true;

    const soloAdmin = !!document.getElementById('pr-only-me')?.checked;
    /* La casilla se bloquea en cuanto se lee, no después de confirmar:
       entre leerla y bloquearla hay un `await`, y en ese hueco un clic
       la cambiaba. El envío salía con lo leído y la pantalla acababa
       enseñando lo contrario. */
    ensayo.bloquear(true);

    let banderaPuesta = false;

    try {
      let destinatarios;
      let sinEnlace = 0;
      let cuantos   = 1;

      if (soloAdmin) {
        destinatarios = [{
          email: CFG.ADMIN_EMAIL,
          name:  'Ferocia Admin',
          vars:  { confirm_url: enlaceConfirmar(TOKEN_ENSAYO) },
        }];
      } else {
        /* ── SE LEEN TODOS, POR TRAMOS ──────────────────────────
           Antes era UNA consulta sin orden ni tramos. El servidor
           devuelve 1.000 filas como máximo y no avisa, así que con 1.900
           pendientes pasaban tres cosas, y las tres malas:

             · la ventana decía "Send a reminder to 1000 subscribers?"
               cuando había 1.900 — un número falso, en el único sitio
               que existe para que tú decidas;
             · salían 1.000 correos, el 20% de la cuota del mes;
             · y sin `order`, una segunda pulsación traía OTRAS 1.000 de
               las mismas 1.900, solapadas, así que parte de la gente lo
               recibía dos veces.

           Esto no era alcanzable hasta que existió el freno del
           formulario: con él, 1.900 pendientes de golpe es justo lo que
           deja un ataque. Lo encontró la revisión del 3 de octubre.

           Se para cuando un tramo viene VACÍO, no cuando viene corto, y
           se avanza por lo que LLEGÓ: es la misma regla que `leerTodo`
           en el motor de envío, por los mismos motivos. */
        /* SE PAGINA POR EL ÚLTIMO id, no por un número de salto.

           Con `offset=1000`, si alguien confirma su suscripción entre el
           primer tramo y el segundo, la lista se corre un sitio y la
           persona que estaba en la posición 1.000 NO SE LEE NUNCA: se
           queda sin recordatorio y nadie se enbtera. Pidiendo "los
           siguientes a este id" eso no puede pasar, porque el punto de
           partida es una fila concreta y no una posición. Lo señaló la
           segunda revisión. */
        const pendientes = [];
        let ultimoId = 0;
        for (;;) {
          const tramo = await api(
            'subscribers?status=eq.pending'
            + '&select=id,first_name,last_name,email,confirm_token,confirm_email_skipped_at'
            + '&order=id.asc'
            + `&id=gt.${ultimoId}`
            + '&limit=1000');
          if (!tramo.length) break;
          pendientes.push(...tramo);
          ultimoId = tramo[tramo.length - 1].id;
          /* Freno de mano: si el filtro por id dejara de funcionar, cada
             tramo traería lo mismo y esto giraría para siempre dentro
             del navegador. */
          if (pendientes.length >= 20000) {
            console.error('[confirm-reminder] lectura cortada en 20.000: ¿falla el id=gt?');
            break;
          }
        }

        if (!pendientes.length) {
          toast('No pending subscribers to remind.', true);
          return;
        }

        /* Sin confirm_token no se manda: el correo llevaría un enlace
           que no confirma nada y la persona haría clic para que no
           pasara nada. Se cuentan aparte para poder decírselo. */
        const conEnlace = pendientes.filter((s) => s.confirm_token);
        sinEnlace = pendientes.length - conEnlace.length;
        if (!conEnlace.length) {
          toast('None of the pending subscribers has a valid confirmation link.', true);
          return;
        }

        /* ── MÁS DE 1.000 NO CABEN EN UN ENVÍO, Y SE DICE ANTES ───
           El servidor rechaza un envío de más de 1.000 destinatarios
           (`MAX_DESTINATARIOS`, en send-email). Sin esto, la ventana te
           pedía aprobar 1.900, pulsabas, y el servidor contestaba que
           no: te hacía aprobar algo que no podía pasar.

           Y partirlo en dos tandas NO es el arreglo: la lista de una
           campaña se guarda UNA vez, así que la segunda tanda se
           descartaría y esas personas no recibirían nada — o peor, con
           una llave nueva, los primeros 1.000 lo recibirían dos veces.

           Además, llegar a 1.000 pendientes sólo pasa después de una
           ráfaga de altas falsas, y ahí mandar el recordatorio es
           justamente lo que no hay que hacer. Así que se para y se
           explica. Lo señaló la segunda revisión. */
        const TOPE_ENVIO = 1000;
        if (conEnlace.length > TOPE_ENVIO) {
          const delFrenoAhora = conEnlace.filter((s) => s.confirm_email_skipped_at).length;
          toast(`There are ${conEnlace.length} pending subscribers, more than one send can `
              + `take (${TOPE_ENVIO}).`
              + (delFrenoAhora
                  ? ` ${delFrenoAhora} of them never got a confirmation email because the `
                    + `signup brake was on, which usually means a burst of fake signups.`
                  : '')
              + ' Nothing was sent — tell me and we will clean up the list first.', true);
          return;
        }

        cuantos = conEnlace.length;
        destinatarios = conEnlace.map((s) => ({
          email: s.email,
          name:  window.nombreDestinatario(s),
          /* Ata cada correo a la ficha de su suscriptor. El servidor lo
             guarda en communication_recipients, así que desde el
             historial se puede saber a qué ficha le llegó cada uno. */
          subscriber_id: s.id,
          /* El enlace es lo ÚNICO que cambia por persona, así que viaja
             en `vars`: el servidor lo guarda con su fila y puede pintar
             el correo de cualquiera sin volver a preguntar al navegador. */
          vars: { confirm_url: enlaceConfirmar(s.confirm_token) },
        }));

        /* ── Y SE DICE CUÁNTOS VIENEN DEL FRENO ─────────────────
           Si el freno del formulario saltó, la mayoría de estos
           pendientes pueden ser basura de un script. Mandarles el
           recordatorio sería hacer a mano el daño que el freno acaba de
           evitar: cientos de correos a direcciones inventadas, con sus
           rebotes y sus quejas de spam.

           No se les quita de la lista por su cuenta —entre ellos puede
           haber gente de verdad, y nadie puede distinguirlos mirando—
           pero se dice el número ANTES de que pulses, que es cuando
           sirve. */
        const delFreno = conEnlace.filter((s) => s.confirm_email_skipped_at).length;

        const seguro = await confirmModal({
          title:   `Send a reminder to ${cuantos} subscriber${cuantos === 1 ? '' : 's'}?`,
          message: (delFreno
                     ? `⚠️ ${delFreno} of these never got a confirmation email because the `
                       + `signup brake was on, which usually means a burst of fake signups. `
                       + `Sending to them would email invented addresses. Cancel and tell me `
                       + `first if you are not sure. `
                     : '')
                 + `Each one gets a link to confirm their subscription`
                 + (sinEnlace ? `, skipping ${sinEnlace} with no valid link` : '')
                 + `. This cannot be undone.`
                 /* Una sola frase seguida: confirmModal pinta con
                    textContent y sin white-space:pre-line, así que un
                    salto de línea se queda en un espacio. */
                 + ` To check the email first, cancel and use "Send only to me".`,
          okLabel: `Send ${cuantos} reminder${cuantos === 1 ? '' : 's'}`,
          cancelLabel: 'Cancel',
          danger: true,
        });
        if (!seguro) return;
      }

      btn.innerHTML = soloAdmin ? 'Sending rehearsal...' : `Sending to ${cuantos}...`;
      window.AdminState.emailInFlight = true;
      banderaPuesta = true;

      const r = await window.sendEmailServer({
        kind:     'subscriber_confirm',
        template: 'confirm',
        subject:  ASUNTO,
        ...(soloAdmin ? { meta: { solo_admin: true } } : {}),
        recipients: destinatarios,
        /* El ensayo va sin llave: es un correo a tu propia dirección y
           repetirlo tiene que llegar siempre.

           El envío real SÍ lleva llave, y por eso se puede reintentar
           desde Communications: con la misma llave el servidor retoma
           la misma campaña y se salta a quien ya recibió.

           La llave se compone SÓLO del nonce del claveador, y a
           propósito no de la lista de pendientes: esa lista se encoge
           sola cada vez que alguien confirma. Si entrara en la llave,
           una confirmación entre el fallo y el reintento cambiaría la
           llave, el servidor abriría una campaña NUEVA y todos los que
           ya lo habían recibido lo recibirían otra vez. El nonce se
           renueva solo cuando un envío termina limpio, que es
           exactamente cuando queremos una campaña nueva. */
        idempotency_key: soloAdmin ? null : await claveador.clave(['pendientes']),
      });

      if (!r.ok) {
        console.error('[confirm-reminder] send failed:', r);
        toast(r.message, true);
        return;
      }

      const d = r.data || {};
      console.log('[confirm-reminder] resultado del envio:', d);

      if (soloAdmin) {
        ensayo.reset();
        toast(d.sent
          ? `✅ Rehearsal sent to ${CFG.ADMIN_EMAIL} only. No subscriber received it, and the link `
            + `inside confirms nobody. The checkbox is now off — press Send Reminder again to email everyone.`
          : `Rehearsal did not go out: ${window.resumenEnvio(d)}`, !d.sent);
        return;
      }

      const saltados = sinEnlace ? ` (${sinEnlace} skipped — no valid link)` : '';

      /* La llave SÓLO se tira cuando el envío salió LIMPIO. El servidor
         contesta 200 también con 'partial' o 'failed', así que `r.ok` no
         quiere decir "salió bien": tirándola ahí, el reintento abriría
         una campaña NUEVA y todos recibirían otra copia. */
      /* La llave se renueva cuando la campaña está TERMINADA —no va a
         salir ni un correo más de ella— y no cuando llegó a todos. Las
         dos formas de equivocarse hacen daño en direcciones opuestas:
         renovar antes de tiempo duplica correos; no renovar nunca deja
         la pantalla enganchada a una campaña vieja.

         ESTA PANTALLA ES LA QUE MÁS LO SUFRE, y por eso conviene que
         esté escrito aquí: su lista de destinatarios cambia cada vez
         —son los pendientes de hoy— y su llave no lleva contenido que la
         distinga. Si la llave no se renovara, la campaña vieja quedaría
         fija y los pendientes nuevos no entrarían nunca: pulsar Enviar
         no mandaría nada y el aviso te diría que lo volvieras a
         intentar. Ver `envioTerminado` en admin-email-utils.js. */
      /* Ya NO se mira `d.failed`. Esa condición sobraba y costaba una
         pulsación: `d.failed` son los fallos de ESTA pulsación, y en la
         única pulsación donde cambiaba algo —la que agota el tercer
         intento de una dirección muerta— la campaña ya estaba
         terminada. El aviso te mandaba a reintentar algo que no se va a
         reintentar nunca, y había que pulsar una cuarta vez.

         Mientras queden intentos no hace falta: esa fila no está ni en
         los enviados ni en los agotados, así que `envioTerminado` ya es
         falso por su cuenta. */
      const limpio = window.envioTerminado(d) && !d.unconfirmed;
      if (limpio) {
        claveador.limpiar();
        /* Los casos raros los cuenta mensajeExito, que existe justo para
           ellos: un reintento que sólo manda los que faltaban, y un
           servidor que contesta sent:0 porque ya estaba todo entregado.
           Su última frase dice "your copy included", que aquí sería
           mentira —esta pantalla no se manda copia—, así que ese caso,
           el normal, se escribe aparte. */
        /* El ✅ se cae si alguien se quedó fuera, igual que en
           `mensajeExito`: un visto bueno verde con una pérdida escrita
           detrás es justo lo que no queremos. */
        const falto = window.huboPerdidas(d);
        toast(((d.already_sent || !d.sent)
          ? window.mensajeExito(d) + saltados
          : `${falto ? '' : '✅ '}Confirmation reminder sent to ${d.sent} `
            + `subscriber${d.sent === 1 ? '' : 's'}.${saltados}`)
          + window.loQueFalto(d), falto);
      } else {
        console.warn('[confirm-reminder] no salio limpio:', d);
        /* Si el envío se CORTÓ, eso es lo único que importa, y la
           respuesta dice por qué. Sin esto el aviso mandaba a reintentar
           un corte que no se arregla reintentando. */
        const corte = window.motivoDelCorte(d);
        toast(corte || (`Finished: ${window.resumenEnvio(d)}.${saltados} `
          + `Press Send Reminder again to retry the ones that failed.`), true);
      }

      /* Refresca el contador de pendientes de la tarjeta. Va con su
         propio try: si fallara, el envío ya salió bien y no tiene
         sentido enseñar un error rojo por no haber podido repintar. */
      try {
        await window.loadSubscribers();
      } catch (e) {
        console.warn('[confirm-reminder] no se pudo refrescar la lista:', e);
      }
    } catch (e) {
      console.error('[confirm-reminder]', e);
      toast(`Error: ${e.message}`, true);
    } finally {
      /* La bandera se baja SÓLO si la puso este envío. Es una sola para
         todo el admin: bajarla sin haberla puesto apagaría la
         protección de la pantalla que sí esté mandando. */
      if (banderaPuesta) window.AdminState.emailInFlight = false;
      btn.disabled = false;
      /* ensayo.sync() y NO una copia del HTML guardada al empezar: la
         copia sería una foto vieja, y si la casilla cambió mientras se
         mandaba el botón acabaría diciendo lo contrario de lo que
         marca. sync() mira la casilla de verdad. */
      ensayo.bloquear(false);
      ensayo.sync();
    }
  };

  Object.assign(window.CLICK_HANDLERS, {
    sendPendingReminder: () => enviarRecordatorio(),
  });
})();
