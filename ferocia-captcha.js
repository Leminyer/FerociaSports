/* ============================================================
   FEROCIA — el captcha de Cloudflare (Turnstile) para ENTRAR
   Hito 5 del Portal del Jugador (14 de octubre) — decisiones §51 y §53

   Supabase puede exigir un captcha antes de mandar un correo de entrada
   (portal) o de aceptar una contraseña (panel): así un robot no puede
   crear cuentas en serie ni probar contraseñas. Cuando ella lo enciende
   en Supabase (Authentication → Attack Protection), cada una de esas
   peticiones tiene que llevar una verificación de Cloudflare.

   Este archivo consigue esa verificación:
     const token = await FerociaCaptcha.token(caja);   // '…' o null
     … se manda a Supabase con { captchaToken: token } …
     FerociaCaptcha.usado(caja);                       // vale UNA vez

   · Casi nadie ve nada (appearance 'interaction-only'): sólo si a
     Cloudflare algo le parece raro aparece una casilla en la caja, y
     entonces hay que marcarla.
   · Si Cloudflare no carga (un bloqueador, sin internet…) devuelve null
     y se intenta igual: si el captcha está apagado en Supabase, entra;
     si está encendido, Supabase lo rechaza y la pantalla lo explica.
   · Es el MISMO widget (Site Key) del formulario de suscripción. La
     clave de aquí es PÚBLICA; la secreta la pone ella en Supabase.

   · Si falla, FerociaCaptcha.codigo(caja) dice por qué (17 oct): el
     número que da Cloudflare (p. ej. '600010'), 'no-script' (no cargó),
     'timeout' (no contestó a tiempo) o 'unsupported' (navegador sin
     soporte). Sirve para que la pantalla lo enseñe y saber la causa.

   Lo usan: el portal (pj-auth.js) y el login del panel (auth.js).
   ============================================================ */

(function () {
  'use strict';

  const SITE_KEY = '0x4AAAAAAFV0OYMCoslC-ws4';
  const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const CARGA_MAX_MS = 15000;     // si el script no llega en este tiempo, se da por perdido
  const ESPERA_MAX_MS = 25000;    // Cloudflare suele contestar en 1-3 s sin que nadie vea nada
  const CASILLA_MAX_MS = 120000;  // si aparece la casilla, tiempo para marcarla

  let cargando = null;            // la promesa de cargar el script (una sola vez)
  let sinScript = false;
  const widgets = new Map();      // caja → { id, esperando: [fn], token, enCurso, codigo }

  function cargar() {
    if (window.turnstile) return Promise.resolve(true);
    if (sinScript) return Promise.resolve(false);
    if (cargando) return cargando;
    cargando = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      const reloj = setTimeout(() => { sinScript = true; resolve(false); }, CARGA_MAX_MS);
      s.onload = () => { clearTimeout(reloj); resolve(!!window.turnstile); };
      s.onerror = () => { clearTimeout(reloj); sinScript = true; console.warn('[captcha] Cloudflare no cargó'); resolve(false); };
      document.head.appendChild(s);
    });
    return cargando;
  }

  function avisar(w, valor) {
    const fns = w.esperando.splice(0);
    fns.forEach((fn) => fn(valor));
  }

  function pintar(caja) {
    let w = widgets.get(caja);
    if (w) return w;
    w = { id: null, esperando: [], token: null, enCurso: null, codigo: null };
    widgets.set(caja, w);
    /* El ancho se mira en el contenedor: la caja escondida no ocupa nada. */
    const ancho = (caja.parentElement || caja).clientWidth;
    const esconder = () => caja.classList.remove('is-visible');
    try {
      w.id = window.turnstile.render(caja, {
        sitekey: SITE_KEY,
        appearance: 'interaction-only',
        execution: 'execute',
        theme: 'light',
        size: ancho >= 300 ? 'flexible' : 'compact',
        callback: (t) => { w.token = t; w.codigo = null; esconder(); avisar(w, t); },
        'before-interactive-callback': () => { caja.classList.add('is-visible'); },
        'expired-callback': () => { w.token = null; esconder(); },
        'error-callback': (cod) => { w.token = null; w.codigo = String(cod || 'error'); esconder(); avisar(w, null); return true; },
        'unsupported-callback': () => { w.token = null; w.codigo = 'unsupported'; esconder(); avisar(w, null); },
      });
    } catch (e) {
      console.warn('[captcha] no se pudo pintar:', e);
      w.id = null;
      w.codigo = 'render';
    }
    return w;
  }

  /** Una verificación nueva para la caja dada (o null si no se pudo). */
  async function token(caja) {
    if (!caja) return null;
    if (!(await cargar())) return null;
    const w = pintar(caja);
    if (w.id === null) return null;
    if (w.token) return w.token;
    if (!w.enCurso) w.codigo = null;
    /* Dos clics seguidos: el segundo espera la MISMA verificación, no
       arranca otra (Cloudflare no deja correr dos a la vez en una caja). */
    if (w.enCurso) return w.enCurso;
    w.enCurso = new Promise((resolve) => {
      let reloj = null;
      const listo = (t) => {
        clearTimeout(reloj);
        const i = w.esperando.indexOf(listo);
        if (i >= 0) w.esperando.splice(i, 1);
        w.enCurso = null;
        resolve(t);
      };
      /* Sin respuesta en 25 s se intenta sin ella; pero si a la persona
         le apareció la casilla, se le dan 2 minutos para marcarla. */
      const vigilar = (ms) => {
        reloj = setTimeout(() => {
          if (ms === ESPERA_MAX_MS && caja.classList.contains('is-visible')) {
            vigilar(CASILLA_MAX_MS - ESPERA_MAX_MS);
          } else {
            w.codigo = w.codigo || 'timeout';
            listo(null);
          }
        }, ms);
      };
      vigilar(ESPERA_MAX_MS);
      w.esperando.push(listo);
      try { window.turnstile.execute(w.id); } catch (_) { /* ya estaba en marcha */ }
    });
    return w.enCurso;
  }

  /** Después de mandarla: Cloudflare acepta cada verificación UNA vez. */
  function usado(caja) {
    const w = widgets.get(caja);
    if (!w || w.id === null) return;
    w.token = null;
    try { window.turnstile.reset(w.id); } catch (_) { /* nada */ }
  }

  /** ¿El error de Supabase es por el captcha? */
  const esErrorDeCaptcha = (err) => /captcha/i.test(String((err && (err.message || err.msg)) || err || ''));

  /** Por qué falló la última verificación de esa caja (o null). */
  function codigo(caja) {
    const w = caja ? widgets.get(caja) : null;
    if (w && w.codigo) return w.codigo;
    return sinScript ? 'no-script' : null;
  }

  window.FerociaCaptcha = { token, usado, esErrorDeCaptcha, codigo };
})();
