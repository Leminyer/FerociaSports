/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: RESULTADOS DE UNA ENCUESTA
   Depende de: db.js (api, toast, confirmModal, supabase),
               admin-communications.js (la ventana de detalle de un envío:
               llama a commPollMostrar / commPollOcultar).

   Entregable 6 (decidido el 10 de octubre). En el detalle de un envío
   que es una encuesta, arriba de todo:
     · cuántos eligieron cada respuesta y cuántos no contestaron; al
       pulsar un grupo, los nombres con la hora de su respuesta;
     · al pulsar un nombre, su historial de cambios;
     · cambiar tú la respuesta de alguien (o quitársela), también con la
       encuesta cerrada; queda apuntado que fuiste tú;
     · "Close poll": cerrarla a mano. Es definitivo;
     · en la disponibilidad semanal, "Use responses for roster": los
       cuatro grupos (Confirmed, Maybe, Not playing, No response) para
       verlos, copiarlos o imprimirlos. No arma el roster: es la lista
       para que lo prepares tú.

   Todo se LEE con las reglas de la base (sólo una administradora activa
   ve algo) y lo único que se ESCRIBE pasa por dos funciones de la base
   (sql/77) que vuelven a comprobar que eres administradora activa.

   "No response" sale de la foto de las personas del envío
   (communication_people), no de quién está hoy en la escalera.
   ============================================================ */
(function () {
  'use strict';

  const ZONA = 'America/New_York';
  const $ = (id) => document.getElementById(id);

  /* Los grupos del roster: la disponibilidad tiene sus tres respuestas
     fijas, en este orden (comms-send, RESPUESTAS_DISPONIBILIDAD). */
  const ROSTER = [
    { titulo: 'Confirmed',   posicion: 1 },
    { titulo: 'Maybe',       posicion: 3 },
    { titulo: 'Not playing', posicion: 2 },
    { titulo: 'No response', posicion: null },
  ];

  let _vez = 0;          // lo que llegue tarde de otra encuesta no se pinta
  let _envio = null;     // el envío abierto
  let _datos = null;     // { poll, opciones, personas }
  let _abiertos = new Set();   // grupos desplegados ('o<id>' o 'none')
  let _yo = null;        // tu id, para decir "by you"

  /* ── FECHAS, EN HORA DE FLORIDA ─────────────────────────── */
  const fmt = (ms, op) => new Intl.DateTimeFormat('en-US', { timeZone: ZONA, ...op }).format(new Date(ms));
  const textoPlazo = (iso) => `${fmt(Date.parse(iso), { weekday: 'long', month: 'long', day: 'numeric' })}`
    + ` at ${fmt(Date.parse(iso), { hour: 'numeric', minute: '2-digit' })}`;
  const textoHora = (iso) => `${fmt(Date.parse(iso), { month: 'short', day: 'numeric' })}`
    + ` · ${fmt(Date.parse(iso), { hour: 'numeric', minute: '2-digit' })}`;
  const textoSesion = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(String(f || ''))
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })
      .format(new Date(`${f}T12:00:00Z`))
    : '');

  const nombre = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Player';
  const porNombre = (a, b) => (a.last_name || '').localeCompare(b.last_name || '')
    || (a.first_name || '').localeCompare(b.first_name || '');

  function el(etiqueta, clase, texto) {
    const e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  /* ── ABRIR Y CERRAR (los llama admin-communications.js) ─── */
  function ocultar() {
    _vez++;
    _envio = null;
    _datos = null;
    $('co-det-poll').hidden = true;
    $('co-poll-roster').hidden = true;
  }

  async function mostrar(envio) {
    ocultar();
    /* Sólo los envíos con encuesta; un ensayo sólo tiene la copia de
       muestra, así que no hay resultados que enseñar. */
    if (!envio || !envio.meta || !envio.meta.poll || envio.meta.solo_admin) return;
    _envio = envio;
    _abiertos = new Set();
    $('co-det-poll').hidden = false;
    $('co-poll-question').textContent = envio.meta.poll.question || '';
    $('co-poll-status').textContent = 'Loading results…';
    $('co-poll-groups').replaceChildren();
    $('co-poll-close-btn').hidden = true;
    $('co-poll-roster-btn').hidden = true;
    if (!_yo) {
      try { _yo = (await window.supabase.auth.getUser()).data?.user?.id || null; } catch (e) { _yo = null; }
      if (_envio !== envio) return;   // se cerró, o se abrió otro, mientras tanto
    }
    await cargar();
  }

  /* Una tabla entera, por tramos de 1.000: el servidor no devuelve más
     de 1.000 filas por consulta y no avisa. Con ~460 jugadores no pasa,
     pero una cuenta que se queda corta pondría gente en "No response". */
  async function leerTodas(ruta) {
    const todas = [];
    for (;;) {
      const tramo = await window.api(`${ruta}&limit=1000&offset=${todas.length}`);
      todas.push(...tramo);
      if (tramo.length < 1000) return todas;
    }
  }

  /* ── LEER ───────────────────────────────────────────────── */
  async function cargar() {
    const mia = ++_vez;
    const envio = _envio;
    try {
      const [poll] = await window.api(`comm_polls?select=id,kind,question,session_date,deadline,closed_at`
        + `&communication_id=eq.${encodeURIComponent(envio.id)}&limit=1`);
      if (mia !== _vez) return;
      if (!poll) {
        /* El envío se cortó antes de guardar su encuesta: no salió a nadie. */
        $('co-poll-status').textContent = 'This poll was not created: the send stopped before it went out.';
        return;
      }
      const [opciones, enlaces, gente, respuestas] = await Promise.all([
        window.api(`comm_poll_options?select=id,position,label&poll_id=eq.${poll.id}&order=position`),
        leerTodas(`comm_poll_links?select=id,person_id&poll_id=eq.${poll.id}&is_sample=eq.false&revoked_at=is.null&order=id`),
        leerTodas(`communication_people?select=id,first_name,last_name&communication_id=eq.${encodeURIComponent(envio.id)}`
          + '&included=eq.true&order=id'),
        leerTodas(`comm_poll_responses?select=link_id,option_id,answered_at,by_admin,set_by&poll_id=eq.${poll.id}&order=link_id`),
      ]);
      if (mia !== _vez) return;
      const persona = new Map(gente.map((g) => [g.id, g]));
      const respuesta = new Map(respuestas.map((r) => [r.link_id, r]));
      const personas = enlaces.filter((l) => persona.has(l.person_id)).map((l) => ({
        ...persona.get(l.person_id), link_id: l.id, resp: respuesta.get(l.id) || null,
      })).sort(porNombre);
      _datos = { poll, opciones, personas };
      pintar();
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[comms-results] no se pudieron leer los resultados:', err);
      $('co-poll-status').textContent = 'Could not load the results. Close this window and open it again.';
    }
  }

  const abierta = (poll) => !poll.closed_at && Date.parse(poll.deadline) > Date.now();

  /* Quién la puso, cuando fue a mano: "by you" o "by an admin". */
  const aMano = (r) => (r.by_admin ? `set ${r.set_by && r.set_by === _yo ? 'by you' : 'by an admin'}` : '');

  /* ── PINTAR ─────────────────────────────────────────────── */
  /* Se repinta entero, pero el cursor del teclado vuelve a donde estaba
     (la cabecera de un grupo o la fila de una persona), y los historiales
     abiertos siguen abiertos. */
  function pintar() {
    const activo = document.activeElement;
    const dentro = activo && $('co-poll-groups').contains(activo);
    const volverA = dentro ? (activo.dataset.clave ? `[data-clave="${activo.dataset.clave}"]`
      : activo.dataset.link ? `.${activo.classList[0]}[data-link="${activo.dataset.link}"]` : null) : null;
    const historiales = [...document.querySelectorAll('#co-poll-groups .co-poll-person-name[aria-expanded="true"]')]
      .map((b) => b.dataset.link);
    dibujar();
    if (volverA) $('co-poll-groups').querySelector(volverA)?.focus();
    historiales.forEach((l) => {
      const b = $('co-poll-groups').querySelector(`.co-poll-person-name[data-link="${l}"]`);
      if (b) verHistorial(b);
    });
  }

  function dibujar() {
    const { poll, opciones, personas } = _datos;
    $('co-poll-question').textContent = poll.question;
    const sesion = poll.kind === 'availability' ? textoSesion(poll.session_date) : '';
    $('co-poll-status').textContent = [
      sesion,
      poll.closed_at ? `Closed by hand · ${textoHora(poll.closed_at)}`
        : abierta(poll) ? `Open · players can answer until ${textoPlazo(poll.deadline)}`
          : `Closed · the deadline was ${textoPlazo(poll.deadline)}`,
    ].filter(Boolean).join(' · ');
    $('co-poll-close-btn').hidden = !abierta(poll);
    $('co-poll-roster-btn').hidden = poll.kind !== 'availability';

    const grupos = [
      ...opciones.map((o) => ({ clave: `o${o.id}`, titulo: o.label, gente: personas.filter((p) => p.resp?.option_id === o.id) })),
      { clave: 'none', titulo: 'No response', gente: personas.filter((p) => !p.resp), sin: true },
    ];
    const total = personas.length || 1;
    $('co-poll-groups').replaceChildren(...grupos.map((g) => {
      const caja = el('div', `co-poll-group${g.sin ? ' co-poll-group-none' : ''}`);
      const cab = el('button', 'co-poll-group-head');
      cab.type = 'button';
      cab.dataset.action = 'commPollGroup';
      cab.dataset.clave = g.clave;
      cab.setAttribute('aria-expanded', _abiertos.has(g.clave) ? 'true' : 'false');
      const barra = el('span', 'co-poll-bar');
      const lleno = el('span', 'co-poll-bar-fill');
      lleno.style.width = `${Math.round((g.gente.length / total) * 100)}%`;
      barra.append(lleno);
      cab.append(el('span', 'co-poll-group-name', g.titulo), barra, el('span', 'co-poll-group-count', String(g.gente.length)));
      caja.append(cab);
      if (_abiertos.has(g.clave)) caja.append(listaDe(g.gente));
      return caja;
    }));
    pintarRoster();
  }

  /* Los nombres de un grupo, cada uno con su hora, quién lo puso, su
     historial (al pulsar el nombre) y el desplegable para cambiarlo. */
  function listaDe(gente) {
    const lista = el('div', 'co-poll-people');
    if (!gente.length) { lista.append(el('div', 'co-poll-empty', 'Nobody.')); return lista; }
    const { opciones } = _datos;
    gente.forEach((p) => {
      const fila = el('div', 'co-poll-person');
      const quien = el('button', 'co-poll-person-name', nombre(p));
      quien.type = 'button';
      quien.dataset.action = 'commPollHistory';
      quien.dataset.link = String(p.link_id);
      quien.setAttribute('aria-expanded', 'false');
      const cuando = el('span', 'co-poll-person-when', p.resp
        ? [textoHora(p.resp.answered_at), aMano(p.resp)].filter(Boolean).join(' · ')
        : '');
      /* Elegir y luego "Save": así las flechas del teclado recorren la
         lista sin disparar nada (en Windows, cada flecha es un cambio). */
      const cambiar = el('select', 'co-poll-change');
      cambiar.dataset.link = String(p.link_id);
      cambiar.setAttribute('aria-label', `New answer for ${nombre(p)}`);
      cambiar.append(new Option('Change…', ''));
      opciones.forEach((o) => { if (o.id !== p.resp?.option_id) cambiar.append(new Option(o.label, String(o.id))); });
      if (p.resp) cambiar.append(new Option('No response', 'none'));
      const guardar = el('button', 'co-poll-save', 'Save');
      guardar.type = 'button';
      guardar.dataset.action = 'commPollSave';
      guardar.dataset.link = String(p.link_id);
      guardar.disabled = true;
      guardar.setAttribute('aria-label', `Save the new answer for ${nombre(p)}`);
      const historial = el('div', 'co-poll-history');
      historial.hidden = true;
      fila.append(quien, cuando, cambiar, guardar, historial);
      lista.append(fila);
    });
    return lista;
  }

  function desplegar(btn) {
    const clave = btn.dataset.clave;
    if (_abiertos.has(clave)) _abiertos.delete(clave); else _abiertos.add(clave);
    pintar();
  }

  /* El historial de cambios de una persona (sql/76 lo guarda desde el
     entregable 5; sql/77 añade quién lo puso). */
  async function verHistorial(btn) {
    const caja = btn.parentElement.querySelector('.co-poll-history');
    if (!caja.hidden) { caja.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
    caja.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    caja.replaceChildren(el('div', 'co-poll-empty', 'Loading…'));
    const mia = _vez;
    let filas;
    try {
      filas = await window.api(`comm_poll_response_log?select=option_id,answered_at,by_admin,set_by`
        + `&link_id=eq.${encodeURIComponent(btn.dataset.link)}&order=id`);
    } catch (err) {
      if (mia !== _vez) return;
      caja.replaceChildren(el('div', 'co-poll-empty', 'Could not load the changes.'));
      return;
    }
    if (mia !== _vez) return;
    const etiqueta = new Map(_datos.opciones.map((o) => [o.id, o.label]));
    caja.replaceChildren(...(filas.length ? filas.map((f) => el('div', 'co-poll-history-row',
      `${textoHora(f.answered_at)} — ${f.option_id ? etiqueta.get(f.option_id) || '?' : 'No response'}`
      + (f.by_admin ? ` (${aMano(f)})` : ''))) : [el('div', 'co-poll-empty', 'No answers yet.')]));
  }

  /* ── CAMBIAR TÚ UNA RESPUESTA ───────────────────────────── */
  async function cambiar(btn) {
    const sel = btn.parentElement.querySelector('select.co-poll-change');
    const valor = sel ? sel.value : '';
    if (!valor || !_datos) return;
    const p = _datos.personas.find((x) => String(x.link_id) === sel.dataset.link);
    if (!p) return;
    const opcion = valor === 'none' ? null : _datos.opciones.find((o) => String(o.id) === valor);
    const destino = opcion ? opcion.label : 'No response';
    const ok = await window.confirmModal({
      title: `Mark ${nombre(p)} as "${destino}"?`,
      message: (opcion
        ? `${nombre(p)}'s answer will be "${destino}". It will show that you set it.`
        : `${nombre(p)}'s answer will be removed, and they will show as "No response".`)
        + (abierta(_datos.poll) ? ' They can still change it from their email until the deadline.' : ''),
      okLabel: 'Save',
      cancelLabel: 'Cancel',
      focusCancel: true,
    });
    if (!ok) { sel.value = ''; btn.disabled = true; return; }
    const { error } = await window.supabase.rpc('comm_poll_admin_set', {
      p_link_id: p.link_id, p_option_id: opcion ? opcion.id : null,
    });
    if (error) {
      console.error('[comms-results] no se pudo cambiar la respuesta:', error.message);
      window.toast('Could not save the answer. Try again in a moment.', true);
      return;
    }
    window.toast(`Saved: ${nombre(p)} → ${destino}.`);
    await cargar();
    window.commPollCambio?.();
  }

  /* ── CERRAR LA ENCUESTA ─────────────────────────────────── */
  async function cerrarEncuesta() {
    if (!_datos || !abierta(_datos.poll)) return;
    const ok = await window.confirmModal({
      title: 'Close this poll?',
      message: 'Players will no longer be able to answer or change their answer. '
             + 'You can still set answers yourself. This cannot be undone.',
      okLabel: 'Close poll',
      cancelLabel: 'Cancel',
      danger: true,
      focusCancel: true,
    });
    if (!ok) return;
    const { error } = await window.supabase.rpc('comm_poll_close', { p_poll_id: _datos.poll.id });
    if (error) {
      console.error('[comms-results] no se pudo cerrar la encuesta:', error.message);
      window.toast('Could not close the poll. Try again in a moment.', true);
      return;
    }
    window.toast('Poll closed. Players can no longer answer.');
    await cargar();
  }

  /* ── EL ROSTER ──────────────────────────────────────────── */
  function gruposRoster() {
    const { opciones, personas } = _datos;
    const idDe = new Map(opciones.map((o) => [o.position, o.id]));
    return ROSTER.map((g) => ({
      titulo: g.titulo,
      gente: g.posicion === null ? personas.filter((p) => !p.resp)
        : personas.filter((p) => p.resp && p.resp.option_id === idDe.get(g.posicion)),
    }));
  }

  function verRoster() {
    if (!_datos || _datos.poll.kind !== 'availability') return;
    $('co-poll-roster').hidden = !$('co-poll-roster').hidden;
    pintarRoster();
    if (!$('co-poll-roster').hidden) $('co-poll-roster').scrollIntoView({ block: 'nearest' });
  }

  function pintarRoster() {
    if (!_datos || $('co-poll-roster').hidden) return;
    const { poll } = _datos;
    $('co-roster-title').textContent = [_envio.meta.audience?.label, textoSesion(poll.session_date)]
      .filter(Boolean).join(' · ');
    $('co-roster-cols').replaceChildren(...gruposRoster().map((g, i) => {
      const col = el('div', 'co-roster-col');
      const cab = el('div', 'co-roster-col-head');
      cab.append(el('span', 'co-roster-col-title', `${g.titulo} (${g.gente.length})`));
      const copiar = el('button', 'co-roster-copy', 'Copy');
      copiar.type = 'button';
      copiar.dataset.action = 'commPollCopy';
      copiar.dataset.i = String(i);
      copiar.setAttribute('aria-label', `Copy the ${g.titulo} names`);
      cab.append(copiar);
      const lista = el('ol', 'co-roster-list');
      g.gente.forEach((p) => lista.append(el('li', '', nombre(p))));
      if (!g.gente.length) lista.append(el('li', 'co-roster-none', '—'));
      col.append(cab, lista);
      return col;
    }));
  }

  async function copiar(btn) {
    const g = gruposRoster()[Number(btn.dataset.i)];
    if (!g) return;
    const texto = [`${g.titulo.toUpperCase()} (${g.gente.length})`, ...g.gente.map(nombre)].join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      window.toast(`Copied ${g.gente.length} name${g.gente.length === 1 ? '' : 's'} (${g.titulo}).`);
    } catch (e) {
      window.toast('Could not copy. Select the names and copy them by hand.', true);
    }
  }

  /* Imprimir SÓLO el roster. Se copia a una caja suelta al final de la
     página (dentro de la ventana del detalle, que tiene alto fijo, una
     lista larga se cortaba en la primera hoja) y la hoja de estilos de
     impresión esconde todo lo demás (admin-comms-hub.css). */
  function imprimir() {
    if (!_datos || $('co-poll-roster').hidden) return;
    document.getElementById('co-print-area')?.remove();
    const area = el('div');
    area.id = 'co-print-area';
    const copia = $('co-poll-roster').cloneNode(true);
    copia.removeAttribute('id');
    copia.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
    area.append(copia);
    document.body.append(area);
    document.body.classList.add('co-print-roster');
    const quitar = () => {
      document.body.classList.remove('co-print-roster');
      area.remove();
      window.removeEventListener('afterprint', quitar);
    };
    window.addEventListener('afterprint', quitar);
    /* Por si un navegador no avisa con "afterprint" (algunos iPhone): al
       dejar de estar en modo impresión, se quita igual. Si no, la próxima
       vez que se imprimiera cualquier otra cosa saldría sólo el roster. */
    const medio = window.matchMedia ? window.matchMedia('print') : null;
    const alCambiar = (e) => { if (!e.matches) { quitar(); medio.removeEventListener?.('change', alCambiar); } };
    medio?.addEventListener?.('change', alCambiar);
    window.print();
  }

  window.commPollMostrar = mostrar;
  window.commPollOcultar = ocultar;

  /* Elegir otra respuesta sólo enciende su "Save". */
  document.getElementById('co-poll-groups')?.addEventListener('change', (e) => {
    const sel = e.target.closest('select.co-poll-change');
    if (sel) sel.parentElement.querySelector('.co-poll-save').disabled = !sel.value;
  });

  Object.assign(window.CLICK_HANDLERS, {
    commPollGroup:   (btn) => desplegar(btn),
    commPollSave:    (btn) => cambiar(btn),
    commPollHistory: (btn) => verHistorial(btn),
    commPollClose:   () => cerrarEncuesta(),
    commPollRoster:  () => verRoster(),
    commPollCopy:    (btn) => copiar(btn),
    commPollPrint:   () => imprimir(),
  });
})();
