/* ============================================================
   FEROCIA — después de suscribirse, a la portada (§107)
   ------------------------------------------------------------
   Cuando la suscripción sale bien, subscribe.html llama:

     FerociaSubscribeDone.go('sent', email)      → el correo de confirmación salió
     FerociaSubscribeDone.go('no_email', email)  → quedó en la lista, el correo no salió

   y la persona pasa a ferociasports.com, donde alta-aviso.js
   enseña el mensaje en un popup.

   El EMAIL NO va en la dirección de la página (quedaría en el historial
   y en las estadísticas de visitas): se guarda un momento en el
   navegador (sessionStorage, sólo esta pestaña) y el popup lo borra al
   leerlo. En la dirección sólo va el tipo de mensaje.
   ============================================================ */
(function () {
  'use strict';
  const CLAVE = 'ferocia-subscribed';
  const ESTADOS = ['sent', 'no_email'];

  function go(estado, email) {
    const e = ESTADOS.includes(estado) ? estado : 'sent';
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify({ email: String(email || '').slice(0, 254), t: Date.now() }));
    } catch (_) { /* sin almacenamiento: el popup sale igual, sin el email */ }
    /* La portada del sitio, junto a esta página. replace: "atrás" no
       devuelve al formulario ya enviado. */
    const destino = new URL('./', window.location.href);
    destino.searchParams.set('subscribed', e);
    window.location.replace(destino.href);
  }

  window.FerociaSubscribeDone = { go, CLAVE };
})();
