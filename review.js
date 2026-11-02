/* ============================================================
   FEROCIA SPORTS CENTER — LA PÁGINA DE LA REVIEW (§113)
   Depende de: config.js (SUPABASE_URL y la clave pública).

   Cómo funciona:
     1. El enlace del correo trae, detrás de "#", el enlace privado de
        la persona (t) y las estrellas que pulsó en el correo (s).
     2. Se le pregunta al servidor qué review es (poll-respond,
        "review_view"). Eso NO guarda nada.
     3. Se enseñan las estrellas ya marcadas y los dos cuadros (con lo
        que ya hubiera escrito, si vuelve a editarla). Sólo cuando pulsa
        "Submit my review" se guarda ("review_answer").

   Toda la seguridad está en el servidor (poll-respond y sql/125).
   Aquí sólo se pinta. Los textos se ponen siempre con textContent /
   value, nunca como HTML.
   ============================================================ */
(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG || {};
  const PUERTA = `${String(CFG.SUPABASE_URL || '').replace(/\/+$/, '')}/functions/v1/poll-respond`;
  const ZONA = 'America/New_York';
  const MAXIMO = 1000;

  const $ = (id) => document.getElementById(id);

  /* Lo que trae la dirección detrás de "#": t=<enlace>&s=<estrellas>.
     Se lee una vez y se BORRA de la barra de direcciones (igual que en
     respond.js): el enlace no se queda en el historial. */
  const datos = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = datos.get('t') || '';
  const pulsada = Number(datos.get('s')) || null;
  if (location.hash) {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* se queda la dirección */ }
  }

  let _review = null;     // lo último que contestó el servidor
  let _estrellas = null;  // las estrellas marcadas ahora (1 a 5)
  let _enviando = false;

  /* ── HABLAR CON EL SERVIDOR ─────────────────────────────── */
  async function pedir(cuerpo) {
    try {
      const r = await fetch(PUERTA, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CFG.SUPABASE_KEY,
          Authorization: `Bearer ${CFG.SUPABASE_KEY}`,
        },
        body: JSON.stringify({ ...cuerpo, token }),
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
      let d = null;
      try { d = await r.json(); } catch (e) { d = null; }
      if (r.status === 429) return { state: 'busy' };
      if (!d || typeof d.state !== 'string') return { state: 'error' };
      return d;
    } catch (e) {
      return { state: 'offline' };
    }
  }

  /* "Sunday, December 1 at 6:00 PM", en la hora del club (como el correo). */
  function textoPlazo(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dia = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'long', month: 'long', day: 'numeric' }).format(d);
    const hora = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }).format(d);
    return `${dia} at ${hora}`;
  }

  const valida = (n) => Number.isInteger(n) && n >= 1 && n <= 5;

  /* Las estrellas como texto, para "Your rating": ★★★★☆ (las apagadas en gris). */
  function pintarEstrellas(caja, n) {
    caja.replaceChildren();
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      if (i > n) s.className = 'rv-off';
      caja.append(s);
    }
    caja.setAttribute('aria-label', `${n} out of 5 stars`);
  }

  /* ── PINTAR ─────────────────────────────────────────────── */
  function mostrar(cual) {
    ['rv-loading', 'rv-form', 'rv-done', 'rv-closed', 'rv-message'].forEach((id) => {
      $(id).hidden = id !== cual;
    });
  }

  function aviso(titulo, texto, reintentar) {
    $('rv-message-title').textContent = titulo;
    $('rv-message-text').textContent = texto;
    $('rv-retry').hidden = !reintentar;
    mostrar('rv-message');
  }

  const AVISOS = {
    missing: ['Open your review from the email',
      'For your privacy, this page does not keep your personal link. Tap a star in your email again to leave your review.'],
    invalid: ['This link is not valid',
      'It may be incomplete or no longer active. Open the link in your email again, or contact us at contact@ferociasports.com.'],
    busy: ['Too many attempts', 'Please wait a minute and try again.'],
    offline: ['Could not connect', 'Check your internet connection and try again.'],
    error: ['Something went wrong', 'Please try again in a moment.'],
  };

  /* Lo que contestó el servidor decide qué se ve. Una encuesta normal
     abierta aquí se trata como enlace que no vale (el servidor ya lo
     rechaza; esto es sólo por si acaso). */
  function pintar(e) {
    if (e.kind && e.kind !== 'review' && ['open', 'recorded', 'closed'].includes(e.state)) { pintar({ state: 'invalid' }); return; }
    if (e.state === 'open') { pintarFormulario(e, true); return; }
    if (e.state === 'bad_option' || e.state === 'too_long') { pintarFormulario({ ...(_review || {}), ...e }, false); return; }
    if (e.state === 'recorded') { pintarHecha(e); return; }
    if (e.state === 'closed') { pintarCerrada(e, !!e.trasGuardar); return; }
    const [t, x] = AVISOS[e.state] || AVISOS.error;
    aviso(t, x, e.state !== 'invalid' && e.state !== 'missing');
  }

  /* rellenar: poner en los cuadros lo que dice el servidor (al abrir).
     Tras un error se dejan como estaban, para no borrar lo escrito. */
  function pintarFormulario(e, rellenar) {
    _review = e;
    $('rv-sample').hidden = !e.sample;
    $('rv-title').textContent = e.title || '';
    $('rv-question').textContent = e.question || '';
    $('rv-for').textContent = e.name ? `Reviewing as ${e.name}` : '';
    $('rv-for').hidden = !e.name;

    if (rellenar) {
      const r = e.review || {};
      $('rv-comment').value = r.comment || '';
      $('rv-improve').value = r.improve || '';
      /* Marcadas: las que pulsó en el correo; si no, las que ya había dado. */
      if (!valida(_estrellas)) _estrellas = valida(pulsada) ? pulsada : (valida(e.current) ? e.current : null);
    }
    contar();

    $('rv-stars').replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rv-star';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', n === 1 ? '1 star' : `${n} stars`);
      b.dataset.stars = String(n);
      b.textContent = '★';
      return b;
    }));
    marcar();

    const plazo = textoPlazo(e.deadline);
    $('rv-deadline').textContent = plazo ? `You can share or update your review until ${plazo}.` : '';
    const errores = {
      bad_option: 'Choose from 1 to 5 stars.',
      too_long: `Each answer can have up to ${MAXIMO.toLocaleString('en-US')} characters.`,
    };
    $('rv-error').textContent = errores[e.state] || '';
    $('rv-error').hidden = !errores[e.state];
    mostrar('rv-form');
  }

  function marcar() {
    document.querySelectorAll('#rv-stars .rv-star').forEach((b) => {
      const n = Number(b.dataset.stars);
      b.classList.toggle('is-on', valida(_estrellas) && n <= _estrellas);
      b.setAttribute('aria-checked', n === _estrellas ? 'true' : 'false');
    });
    $('rv-submit').disabled = !valida(_estrellas) || _enviando;
  }

  /* El contador sólo aparece cerca del límite, para no distraer. */
  function contar() {
    [['rv-comment', 'rv-comment-count'], ['rv-improve', 'rv-improve-count']].forEach(([caja, cuenta]) => {
      const n = $(caja).value.length;
      $(cuenta).textContent = n >= MAXIMO - 200 ? `${n}/${MAXIMO}` : '';
      $(cuenta).classList.toggle('is-near', n >= MAXIMO);
    });
  }

  function pintarHecha(e) {
    _review = e;
    $('rv-done-title').textContent = e.title || '';
    const n = e.sample ? _estrellas : e.current;
    pintarEstrellas($('rv-done-stars'), valida(n) ? n : 0);
    const plazo = textoPlazo(e.deadline);
    $('rv-done-note').textContent = e.sample
      ? 'This was a sample copy: nothing was saved.'
      : (plazo ? `You can update your review until ${plazo}.` : '');
    mostrar('rv-done');
    $('rv-edit').focus();
  }

  /* trasGuardar: el plazo terminó mientras escribía: se dice que lo
     último no se guardó (en vez de que desaparezca sin más). */
  function pintarCerrada(e, trasGuardar) {
    $('rv-closed-note').hidden = !trasGuardar;
    $('rv-closed-title').textContent = e.title || '';
    const n = e.current;
    $('rv-closed-stars').hidden = !valida(n);
    if (valida(n)) pintarEstrellas($('rv-closed-stars'), n);
    mostrar('rv-closed');
  }

  /* ── ACCIONES ───────────────────────────────────────────── */
  async function enviar() {
    if (!valida(_estrellas) || _enviando) return;
    const comment = $('rv-comment').value;
    const improve = $('rv-improve').value;
    if (comment.length > MAXIMO || improve.length > MAXIMO) { pintar({ state: 'too_long' }); return; }
    _enviando = true;
    $('rv-submit').textContent = 'Saving…';
    marcar();
    const e = await pedir({ action: 'review_answer', rating: _estrellas, comment, improve });
    _enviando = false;
    $('rv-submit').textContent = 'Submit my review';
    marcar();
    /* Sin conexión o un fallo pasajero: se queda en el formulario, con
       todo lo escrito, para que pueda volver a pulsar. */
    if (e.state === 'offline' || e.state === 'error' || e.state === 'busy') {
      const [t, x] = AVISOS[e.state] || AVISOS.error;
      $('rv-error').textContent = `${t}. ${x}`;
      $('rv-error').hidden = false;
      return;
    }
    pintar(e.state === 'closed' ? { ...e, trasGuardar: true } : e);
  }

  async function cargar() {
    mostrar('rv-loading');
    if (!token) { pintar({ state: 'missing' }); return; }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !CFG.SUPABASE_URL) { pintar({ state: 'invalid' }); return; }
    pintar(await pedir({ action: 'review_view' }));
  }

  $('rv-stars').addEventListener('click', (ev) => {
    const b = ev.target.closest('.rv-star');
    if (!b || _enviando) return;
    _estrellas = Number(b.dataset.stars);
    $('rv-error').hidden = true;
    marcar();
  });
  /* Con el teclado: flechas para subir o bajar estrellas. */
  $('rv-stars').addEventListener('keydown', (ev) => {
    if (_enviando) return;
    const paso = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[ev.key];
    if (!paso) return;
    ev.preventDefault();
    _estrellas = Math.min(5, Math.max(1, (_estrellas || 0) + paso));
    marcar();
    document.querySelector(`#rv-stars .rv-star[data-stars="${_estrellas}"]`)?.focus();
  });
  $('rv-comment').addEventListener('input', contar);
  $('rv-improve').addEventListener('input', contar);
  $('rv-submit').addEventListener('click', enviar);
  /* "Edit my review": vuelve al formulario con lo que guardó. */
  $('rv-edit').addEventListener('click', () => { if (_review) pintarFormulario({ ..._review, state: 'open' }, false); });
  $('rv-retry').addEventListener('click', cargar);
  /* Si con la página ya abierta se pulsa otra estrella del correo y el
     navegador reutiliza esta pestaña, sólo cambia lo de detrás de "#":
     se vuelve a cargar para leer el enlace nuevo. */
  window.addEventListener('hashchange', () => {
    const d = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (!d.get('t')) return;
    /* El mismo enlace (otra estrella): se marca esa, sin perder lo escrito. */
    const quitar = () => { try { history.replaceState(null, '', location.pathname); } catch (e) { /* se queda */ } };
    if (d.get('t') === token && !_enviando) {
      const n = Number(d.get('s'));
      if (!$('rv-form').hidden) { quitar(); if (valida(n)) { _estrellas = n; marcar(); } return; }
      /* Desde "Thank you!": vuelve al formulario con esa estrella. */
      if (!$('rv-done').hidden && _review) {
        quitar();
        if (valida(n)) _estrellas = n;
        pintarFormulario({ ..._review, state: 'open' }, false);
        return;
      }
    }
    /* Cualquier otra pantalla: se vuelve a cargar CON el enlace nuevo. */
    location.reload();
  });

  cargar();
})();
