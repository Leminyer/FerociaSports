/* ============================================================
   FEROCIA SPORTS CENTER — LA PÁGINA DE RESPUESTA DE UNA ENCUESTA
   Depende de: config.js (SUPABASE_URL y la clave pública).

   Cómo funciona:
     1. El enlace del correo trae, detrás de "#", el enlace privado de
        la persona (t) y la respuesta que pulsó en el correo (o).
     2. Se le pregunta al servidor qué encuesta es (poll-respond, "view").
        Eso NO contesta nada.
     3. Se enseña la encuesta con esa respuesta ya marcada. Sólo cuando
        la persona pulsa "Confirm my answer" se guarda ("answer").

   Lo que el servidor contesta ya viene comprobado; aquí sólo se pinta.
   Toda la seguridad está en el servidor (poll-respond y sql/76).
   ============================================================ */
(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG || {};
  const PUERTA = `${String(CFG.SUPABASE_URL || '').replace(/\/+$/, '')}/functions/v1/poll-respond`;
  const ZONA = 'America/New_York';

  const $ = (id) => document.getElementById(id);

  /* Lo que trae la dirección detrás de "#": t=<enlace>&o=<respuesta>.
     Se lee una vez y se BORRA de la barra de direcciones: así el enlace
     no se queda en el historial del navegador (ni en el de otros
     aparatos sincronizados) ni a la vista de quien mire la pantalla.
     Recargar la página pide volver a pulsar el botón del correo. */
  const datos = new URLSearchParams(location.hash.replace(/^#/, ''));
  const token = datos.get('t') || '';
  const pulsada = Number(datos.get('o')) || null;
  if (location.hash) {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* se queda la dirección */ }
  }

  let _encuesta = null;   // lo último que contestó el servidor
  let _elegida = null;    // la respuesta marcada ahora (posición)
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
        /* Que la dirección de esta página no viaje a ningún lado. */
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

  /* ── FECHAS ─────────────────────────────────────────────── */
  /* "Sunday, October 11 at 6:00 PM", en la hora del club: la misma
     forma que en el correo. */
  function textoPlazo(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dia = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'long', month: 'long', day: 'numeric' }).format(d);
    const hora = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }).format(d);
    return `${dia} at ${hora}`;
  }

  function textoSesion(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })
      .format(new Date(`${fecha}T12:00:00Z`));
  }

  const etiquetaDe = (e, pos) => (e.options || []).find((o) => o.position === pos)?.label || '';

  /* ── PINTAR ─────────────────────────────────────────────── */
  function mostrar(cual) {
    ['rs-loading', 'rs-poll', 'rs-done', 'rs-closed', 'rs-message'].forEach((id) => {
      $(id).hidden = id !== cual;
    });
  }

  function aviso(titulo, texto, reintentar) {
    $('rs-message-title').textContent = titulo;
    $('rs-message-text').textContent = texto;
    $('rs-retry').hidden = !reintentar;
    mostrar('rs-message');
  }

  const AVISOS = {
    /* Sin enlace: casi siempre, alguien que recargó la página. */
    missing: ['Open your poll from the email',
      'For your privacy, this page does not keep your personal link. Press the button in your email again to answer.'],
    invalid: ['This link is not valid',
      'It may be incomplete or no longer active. Open the button in your email again, or contact us at contact@ferociasports.com.'],
    busy: ['Too many attempts', 'Please wait a minute and try again.'],
    offline: ['Could not connect', 'Check your internet connection and try again.'],
    error: ['Something went wrong', 'Please try again in a moment.'],
  };

  /* Lo que contestó el servidor decide qué se ve. */
  function pintar(e) {
    if (e.state === 'open' || e.state === 'bad_option') { pintarEncuesta(e); return; }
    if (e.state === 'recorded') { pintarHecho(e); return; }
    if (e.state === 'closed') { pintarCerrada(e); return; }
    const [t, x] = AVISOS[e.state] || AVISOS.error;
    aviso(t, x, e.state !== 'invalid' && e.state !== 'missing');
  }

  function pintarEncuesta(e) {
    _encuesta = e;
    $('rs-sample').hidden = !e.sample;
    $('rs-title').textContent = e.title || '';
    const sesion = e.kind === 'availability' ? textoSesion(e.session_date) : '';
    $('rs-session').textContent = sesion;
    $('rs-session').hidden = !sesion;
    $('rs-question').textContent = e.question || '';
    $('rs-for').textContent = e.name ? `Answering for ${e.name}` : '';
    $('rs-for').hidden = !e.name;
    const actual = etiquetaDe(e, e.current);
    $('rs-current').textContent = actual ? `Your current response: ${actual}` : '';
    $('rs-current').hidden = !actual;

    /* Marcada: la que se pulsó en el correo; si no, la que ya tenía. */
    const valida = (p) => (e.options || []).some((o) => o.position === p);
    if (_elegida === null || !valida(_elegida)) {
      _elegida = valida(pulsada) ? pulsada : (valida(e.current) ? e.current : null);
    }

    $('rs-options').replaceChildren(...(e.options || []).map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rs-option';
      b.setAttribute('role', 'radio');
      b.dataset.position = String(o.position);
      const punto = document.createElement('span');
      punto.className = 'rs-dot';
      punto.setAttribute('aria-hidden', 'true');
      const texto = document.createElement('span');
      texto.textContent = o.label;
      b.append(punto, texto);
      return b;
    }));
    marcar();

    const plazo = textoPlazo(e.deadline);
    $('rs-deadline').textContent = plazo ? `You can change your response until ${plazo}.` : '';
    $('rs-error').hidden = e.state !== 'bad_option';
    $('rs-error').textContent = e.state === 'bad_option' ? 'That answer is not part of this poll. Choose one of the options.' : '';
    mostrar('rs-poll');
  }

  function marcar() {
    document.querySelectorAll('#rs-options .rs-option').forEach((b) => {
      b.setAttribute('aria-checked', Number(b.dataset.position) === _elegida ? 'true' : 'false');
    });
    $('rs-confirm').disabled = _elegida === null || _enviando;
  }

  function pintarHecho(e) {
    _encuesta = e;
    $('rs-done-title').textContent = e.title || '';
    $('rs-done-answer').textContent = etiquetaDe(e, e.sample ? _elegida : e.current);
    const plazo = textoPlazo(e.deadline);
    $('rs-done-note').textContent = e.sample
      ? 'This was a sample copy: the answer was not counted.'
      : (plazo ? `You can change your response until ${plazo}.` : '');
    mostrar('rs-done');
    $('rs-change').focus();
  }

  function pintarCerrada(e) {
    $('rs-closed-title').textContent = e.title || '';
    $('rs-closed-question').textContent = e.question || '';
    const actual = etiquetaDe(e, e.current);
    $('rs-closed-answer').textContent = actual ? `Your response: ${actual}` : '';
    $('rs-closed-answer').hidden = !actual;
    mostrar('rs-closed');
  }

  /* ── ACCIONES ───────────────────────────────────────────── */
  async function confirmar() {
    if (_elegida === null || _enviando) return;
    _enviando = true;
    $('rs-confirm').textContent = 'Saving…';
    marcar();
    const e = await pedir({ action: 'answer', option: _elegida });
    _enviando = false;
    $('rs-confirm').textContent = 'Confirm my answer';
    marcar();
    /* Sin conexión o con un fallo pasajero, se queda en la encuesta con
       su respuesta marcada para que pueda volver a pulsar. */
    if (e.state === 'offline' || e.state === 'error' || e.state === 'busy') {
      const [t, x] = AVISOS[e.state] || AVISOS.error;
      $('rs-error').textContent = `${t}. ${x}`;
      $('rs-error').hidden = false;
      return;
    }
    pintar(e);
  }

  async function cargar() {
    mostrar('rs-loading');
    if (!token) { pintar({ state: 'missing' }); return; }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !CFG.SUPABASE_URL) { pintar({ state: 'invalid' }); return; }
    pintar(await pedir({ action: 'view' }));
  }

  $('rs-options').addEventListener('click', (ev) => {
    const b = ev.target.closest('.rs-option');
    if (!b || _enviando) return;
    _elegida = Number(b.dataset.position);
    $('rs-error').hidden = true;
    marcar();
  });
  $('rs-confirm').addEventListener('click', confirmar);
  /* "Change my answer": vuelve a la encuesta con lo que tiene marcado. */
  $('rs-change').addEventListener('click', () => { if (_encuesta) pintarEncuesta({ ..._encuesta, state: 'open' }); });
  $('rs-retry').addEventListener('click', cargar);

  cargar();
})();
