/* ============================================================
   FEROCIA — el popup "Almost Done!" en la portada (§107)
   ------------------------------------------------------------
   Sale sólo cuando la dirección trae ?subscribed=sent o
   ?subscribed=no_email (lo pone alta-hecha.js al suscribirse).
   Lee el email que dejó subscribe.html en sessionStorage, lo BORRA, y
   quita ?subscribed de la dirección: al recargar, no vuelve a salir.

   Se cierra con "Got it", con Esc o tocando fuera. La persona se queda
   arriba del todo, en la portada.
   ============================================================ */
(function () {
  'use strict';
  const CLAVE = 'ferocia-subscribed';
  const VIGENTE_MS = 10 * 60 * 1000;   // un email guardado hace más de 10 min no se usa

  const params = new URLSearchParams(window.location.search);
  const estado = params.get('subscribed');
  if (estado !== 'sent' && estado !== 'no_email') return;

  /* Fuera de la dirección enseguida (y sin crear otra entrada en el historial). */
  params.delete('subscribed');
  const resto = params.toString();
  try { history.replaceState(history.state, '', window.location.pathname + (resto ? `?${resto}` : '') + window.location.hash); } catch (_) {}

  let email = '';
  try {
    const guardado = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    sessionStorage.removeItem(CLAVE);
    if (guardado && typeof guardado.email === 'string' && Date.now() - Number(guardado.t) < VIGENTE_MS) email = guardado.email.trim();
  } catch (_) { /* sin almacenamiento: el mensaje sale sin el email */ }

  const el = (tag, cls, texto) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto) n.textContent = texto;   // siempre como texto, nunca como HTML
    return n;
  };

  function armar() {
    const fondo = el('div', 'fa-capa');
    const caja = el('div', 'fa-caja');
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-labelledby', 'fa-titulo');
    caja.setAttribute('aria-describedby', 'fa-texto');

    const icono = el('div', 'fa-icono', '✅');
    icono.setAttribute('aria-hidden', 'true');
    const titulo = el('h2', 'fa-titulo', 'Almost Done!');
    titulo.id = 'fa-titulo';
    const cuerpo = el('div', 'fa-texto');
    cuerpo.id = 'fa-texto';

    if (estado === 'sent') {
      cuerpo.append(el('p', '', email ? 'We sent a confirmation email to:' : 'We sent you a confirmation email.'));
      if (email) cuerpo.append(el('p', 'fa-correo', email));
      cuerpo.append(el('p', '', 'Please check your inbox — including your spam folder — and click the confirmation link to complete your subscription.'));
    } else {
      cuerpo.append(el('p', '', 'You’re on the list — but we couldn’t send your confirmation email just now.'));
      if (email) cuerpo.append(el('p', 'fa-correo', email));
      const p = el('p', '', 'Please write to ');
      p.append(el('strong', '', 'contact@ferociasports.com'), document.createTextNode(' and we’ll send it again.'));
      cuerpo.append(p);
    }

    const boton = el('button', 'fa-boton', 'Got it');
    boton.type = 'button';
    caja.append(icono, titulo, cuerpo, boton);
    fondo.append(caja);

    /* El resto de la página queda "inert" mientras el aviso está abierto:
       los lectores de pantalla no se salen de él. Se guardan sólo los que
       NO lo estaban, para devolverlos tal cual. */
    const apagados = [...document.body.children].filter((n) => n !== fondo && !n.inert);
    const cerrar = () => {
      apagados.forEach((n) => { n.inert = false; });
      fondo.remove();
      document.documentElement.classList.remove('fa-abierto');
      document.removeEventListener('keydown', teclas, true);
    };
    function teclas(e) {
      if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
      else if (e.key === 'Tab') { e.preventDefault(); boton.focus(); }   // el único control: el foco no sale del popup
    }
    boton.addEventListener('click', cerrar);
    fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
    document.addEventListener('keydown', teclas, true);

    document.documentElement.classList.add('fa-abierto');
    document.body.append(fondo);
    apagados.forEach((n) => { n.inert = true; });
    window.scrollTo(0, 0);
    boton.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armar);
  else armar();
})();
