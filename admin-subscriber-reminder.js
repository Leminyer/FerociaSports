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
        const pendientes = await api(
          'subscribers?status=eq.pending'
          + '&select=id,first_name,last_name,email,confirm_token');

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

        const seguro = await confirmModal({
          title:   `Send a reminder to ${cuantos} subscriber${cuantos === 1 ? '' : 's'}?`,
          message: `Each one gets a link to confirm their subscription`
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
      const limpio = d.status === 'sent' && !d.failed && !d.unconfirmed;
      if (limpio) {
        claveador.limpiar();
        /* Los casos raros los cuenta mensajeExito, que existe justo para
           ellos: un reintento que sólo manda los que faltaban, y un
           servidor que contesta sent:0 porque ya estaba todo entregado.
           Su última frase dice "your copy included", que aquí sería
           mentira —esta pantalla no se manda copia—, así que ese caso,
           el normal, se escribe aparte. */
        toast((d.already_sent || !d.sent)
          ? window.mensajeExito(d) + saltados
          : `✅ Confirmation reminder sent to ${d.sent} subscriber${d.sent === 1 ? '' : 's'}.${saltados}`);
      } else {
        console.warn('[confirm-reminder] no salio limpio:', d);
        toast(`Finished: ${window.resumenEnvio(d)}.${saltados} `
          + `Press Send Reminder again to retry the ones that failed.`, true);
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
