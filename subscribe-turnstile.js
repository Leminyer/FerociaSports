/* ============================================================
   FEROCIA — Turnstile en el formulario de suscripción
   Ajuste 21 (13 de octubre) — decisiones §29

   Turnstile (Cloudflare, gratis) comprueba que quien rellena el
   formulario es una persona. Aquí sólo se consigue la verificación; la
   que decide es la función subscribe-confirm, en el servidor, que se la
   pregunta a Cloudflare ANTES de crear la ficha.

   Modo "Managed" con appearance 'interaction-only': casi nadie ve nada.
   Sólo si a Cloudflare algo le parece raro aparece una casilla encima
   del botón, y entonces hay que marcarla.

   QUÉ PASA SI NO SE CONSIGUE (decidido el 13 de octubre):
     · Cloudflare no carga (caído, un bloqueador de anuncios…): la
       inscripción se manda SIN verificación. El servidor guarda la ficha
       pero no manda el correo; la persona ve "escribe a contact@" y en el
       admin se le puede reenviar con el sobre.
     · Cloudflare pide marcar la casilla: no se manda nada hasta que la
       marque, y se le dice.

   La clave de aquí es la PÚBLICA (Site Key): va en la página a
   propósito y no da acceso a nada. La secreta vive sólo en Supabase.

   Uso desde subscribe.html:
     const v = await FerociaTurnstile.obtener();
       → { token: '…' }            verificada
       → { token: null }           no se pudo (se manda igual)
       → { necesitaClic: true }    hay que marcar la casilla
       → { esperar: true }         sigue comprobando: que pulse otra vez
     FerociaTurnstile.usado();     después de mandarla (vale UNA vez)
     FerociaTurnstile.mostrarError(texto) / ocultarError()
   ============================================================ */

(function () {
  'use strict';

  const SITE_KEY = '0x4AAAAAAFV0OYMCoslC-ws4';
  /* La misma etiqueta que exige subscribe-confirm: una verificación
     sacada en otro formulario no vale para éste. */
  const ACCION = 'subscribe';
  const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ferociaTurnstileListo';
  /* Lo que se espera, como mucho, a que termine una verificación que
     está en marcha al pulsar el botón. */
  const ESPERA_MS = 10000;
  /* Si el script de Cloudflare no ha llegado en este tiempo, se da por
     perdido (una red que lo deja colgado no avisa con un error). */
  const CARGA_MAX_MS = 15000;

  /* cargando | verificando | lista | interactivo | error | sin_script */
  let estado = 'cargando';
  let token = null;
  let widgetId = null;
  /* Si la comprobación tarda, la primera vez se le pide que espere y
     pulse otra vez; la segunda se manda sin verificación (si no, una
     comprobación que no termina nunca la dejaría sin poder apuntarse). */
  let yaPidioEsperar = false;
  const esperando = [];
  const avisar = () => { while (esperando.length) esperando.shift()(); };

  const caja = () => document.getElementById('s-turnstile');
  const cajaError = () => document.getElementById('err-turnstile');

  function mostrarError(texto) {
    const e = cajaError();
    if (!e) return;
    e.textContent = texto;
    e.style.display = 'block';
  }
  function ocultarError() {
    const e = cajaError();
    if (e) e.style.display = 'none';
  }

  function pintar() {
    const c = caja();
    if (!c || !window.turnstile || widgetId !== null) return;
    estado = 'verificando';
    /* 'flexible' necesita 300 px como mínimo; en un móvil muy estrecho
       se usa la casilla compacta. */
    const tam = c.clientWidth >= 300 ? 'flexible' : 'compact';
    try {
      widgetId = window.turnstile.render(c, {
        sitekey: SITE_KEY,
        action: ACCION,
        appearance: 'interaction-only',
        theme: 'light',
        size: tam,
        callback: (t) => { token = t; estado = 'lista'; ocultarError(); avisar(); },
        /* Una verificación dura 5 minutos; Cloudflare saca otra sola. */
        'expired-callback': () => { token = null; estado = 'verificando'; },
        'before-interactive-callback': () => { estado = 'interactivo'; avisar(); },
        'after-interactive-callback': () => { if (estado === 'interactivo') estado = 'verificando'; },
        /* Si no marcó la casilla a tiempo, Cloudflare la vuelve a poner. */
        'timeout-callback': () => { token = null; },
        'error-callback': () => { token = null; estado = 'error'; avisar(); },
        'unsupported-callback': () => { token = null; estado = 'error'; avisar(); },
      });
    } catch (e) {
      console.warn('[Ferocia subscribe] Turnstile no se pudo pintar:', e);
      estado = 'error';
      avisar();
    }
  }

  /* Cloudflare llama a esto cuando su script termina de cargar. */
  window.ferociaTurnstileListo = pintar;

  function cargarScript() {
    if (!caja()) return;
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      console.warn('[Ferocia subscribe] El script de Turnstile no cargó: se mandará sin verificación.');
      estado = 'sin_script';
      avisar();
    };
    document.head.appendChild(s);
    setTimeout(() => {
      if (estado === 'cargando') { estado = 'sin_script'; avisar(); }
    }, CARGA_MAX_MS);
  }

  /** La verificación para mandar con el formulario. */
  async function obtener() {
    const fin = Date.now() + ESPERA_MS;
    for (;;) {
      if (token) return { token };
      if (estado === 'interactivo') return { necesitaClic: true };
      /* Sin script no hay nada que esperar. Con un error, sí: Cloudflare
         lo reintenta solo y suele arreglarse en unos segundos. */
      if (estado === 'sin_script') return { token: null };
      const resto = fin - Date.now();
      if (resto <= 0) {
        if (estado === 'verificando' && !yaPidioEsperar) {
          yaPidioEsperar = true;
          return { esperar: true };
        }
        return { token: null };
      }
      await new Promise((r) => { esperando.push(r); setTimeout(r, Math.min(resto, 500)); });
    }
  }

  /** Una verificación vale UNA vez: después de mandarla se pide otra. */
  function usado() {
    token = null;
    if (widgetId !== null && window.turnstile) {
      estado = 'verificando';
      try { window.turnstile.reset(widgetId); } catch (_) { estado = 'error'; }
    }
  }

  window.FerociaTurnstile = { obtener, usado, mostrarError, ocultarError };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cargarScript);
  } else {
    cargarScript();
  }
})();
