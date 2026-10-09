/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: COMMUNICATIONS HUB
   Depende de: db.js (api, esc, fmtDate, supabase, toast),
               admin-state.js (CLICK_HANDLERS),
               admin-email-utils.js (leerErrorDeFuncion, nombreDestinatario)

   El panel de la pestaña Send donde se elige A QUIÉN se le escribe:
     1. la audiencia: una escalera, un torneo, o All Players;
     2. los destinatarios: todos, unas divisiones o unos jugadores;
     3. la vista previa: cuántas personas, cuántos correos, y quién se
        queda fuera y por qué.

   ── QUIÉN DECIDE LA LISTA ──────────────────────────────────────────
   Esta pantalla NO arma la lista de destinatarios. La pide al servidor
   (función comms-audience → sql/73), que es quien sabe quién forma cada
   audiencia, quién es suplente o está inactivo, y quién comparte buzón.
   El envío usará la misma función, así que lo que se ve aquí es lo que
   se manda. Aquí sólo se cuenta lo que el servidor contestó.

   ── LAS RESPUESTAS QUE LLEGAN TARDE ────────────────────────────────
   Con la red lenta, una respuesta puede llegar cuando ya se ha elegido
   otra cosa. Cada petición se lleva un número de turno y, si al volver
   ya no es el último, se tira. Hay DOS turnos, y no uno, a propósito:
     · _turnoAudiencia — qué audiencia hay abierta. Lo usan las listas
       (escaleras, torneos, divisiones, jugadores para elegir).
     · _turnoVista     — qué vista previa se está pidiendo.
   Con uno solo, pedir una vista previa invalidaba la lista de
   divisiones que aún venía de camino, y "Specific Divisions" se quedaba
   vacío para siempre.

   ── LO QUE TODAVÍA NO HACE ─────────────────────────────────────────
   Escribir y enviar. Eso es el entregable 3.
   ============================================================ */

(function () {
  'use strict';

  /* Los textos de cada audiencia. */
  const TEXTOS = {
    ladder: {
      titulo: 'Ladder Update',
      sub: 'Choose the ladder and who should receive it.',
      rotulo: 'Ladder',
      elige: 'Choose a ladder…',
      grupos: ['Active ladders', 'Past ladders'],
      todos: 'All Ladder Players',
    },
    tournament: {
      titulo: 'Tournament Update',
      sub: 'Choose the tournament and who should receive it.',
      rotulo: 'Tournament',
      elige: 'Choose a tournament…',
      grupos: ['Current & upcoming', 'Past tournaments'],
      todos: 'All Tournament Players',
    },
    all_players: {
      titulo: 'All Players',
      sub: 'Choose who should receive it.',
      todos: 'All Players',
    },
  };

  /* Por qué alguien no recibe. El código lo pone el servidor. */
  const MOTIVOS = {
    sub:           { corto: 'Sub',           plural: (n) => `${n} sub${n === 1 ? '' : 's'}` },
    inactive:      { corto: 'Inactive',      plural: (n) => `${n} inactive` },
    no_email:      { corto: 'No email',      plural: (n) => `${n} with no email` },
    invalid_email: { corto: 'Invalid email', plural: (n) => `${n} with an invalid email` },
  };

  /* Los errores que el servidor devuelve con un código fijo, en una
     frase que se pueda leer. Nunca se enseña SQL ni un código suelto. */
  const ERRORES = {
    audience_not_found:         'That ladder or tournament no longer exists. Choose another one.',
    division_not_in_tournament: 'One of those divisions is no longer part of this tournament. Choose again.',
    player_not_in_audience:     'One of the selected players is no longer in this group, or can\'t receive email. Review the selection.',
    not_authorized:             'Your account is not an active admin.',
  };
  /* Una sesión caducada la rechaza Supabase antes de llegar a la
     función, con su propio mensaje y sin nuestro código: se reconoce
     por el estado 401. */
  const SESION_CADUCADA = 'Your session has ended. Sign in again.';
  const ERROR_GENERAL = 'Could not load the recipients. Try again.';

  /* ── ESTADO ─────────────────────────────────────────────── */
  let _tipo        = null;       // 'ladder' | 'tournament' | 'all_players'
  let _audiencia   = null;       // id de la escalera o del torneo
  let _segmento    = 'all';      // 'all' | 'divisions' | 'selected'
  let _divisiones  = new Set();  // ids elegidos con 'divisions'
  let _elegidos    = new Set();  // ids elegidos con 'selected'
  let _candidatos  = null;       // quién se puede elegir: los que reciben con 'all'
  let _pidiendoCandidatos = null;  // la petición en curso, para no pedirla dos veces
  let _verPersonas = false;
  let _origen      = null;       // la tarjeta que abrió el panel, para devolverle el foco
  let _turnoAudiencia = 0;
  let _turnoVista     = 0;
  let _espera = null;

  const $ = (id) => document.getElementById(id);

  /* ── LLAMAR AL SERVIDOR ─────────────────────────────────── */
  async function pedirAudiencia(segmento, extra) {
    const payload = {
      audience_type: _tipo,
      audience_id:   _tipo === 'all_players' ? null : _audiencia,
      segment:       segmento,
      ...extra,
    };
    try {
      const { data, error } = await window.supabase.functions.invoke('comms-audience', { body: payload });
      if (!error) return { ok: true, data };
      const info = await window.leerErrorDeFuncion(error);
      return {
        ok: false,
        codigo: info.code,
        mensaje: ERRORES[info.code] || (info.status === 401 ? SESION_CADUCADA : ERROR_GENERAL),
      };
    } catch (e) {
      return { ok: false, codigo: null, mensaje: ERROR_GENERAL };
    }
  }

  /* ── ABRIR Y CERRAR ─────────────────────────────────────── */
  async function abrir(tipo, boton) {
    if (!TEXTOS[tipo]) return;
    _tipo = tipo;
    _origen = boton || null;
    _audiencia = null;
    olvidarAudiencia();

    const t = TEXTOS[tipo];
    $('hub-title').textContent = t.titulo;
    $('hub-sub').textContent = t.sub;
    $('hub-seg-all').textContent = t.todos;

    $('co-send-home').hidden = true;
    $('hub-panel').hidden = false;

    if (tipo === 'all_players') {
      $('hub-step-audience').hidden = true;
      mostrarDestinatarios(true);
      $('hub-seg-all').focus();
      ponerSegmento('all');
      return;
    }

    $('hub-step-audience').hidden = false;
    $('hub-audience-label').textContent = t.rotulo;
    mostrarDestinatarios(false);
    $('hub-audience-select').focus();
    await cargarAudiencias();
  }

  /* Cierra el panel y vuelve a la rejilla. También lo llama la pantalla
     Communications al entrar, para que nunca se vea una vista previa
     vieja. */
  function cerrar() {
    if ($('hub-panel').hidden) return;
    olvidarAudiencia();
    $('hub-panel').hidden = true;
    $('co-send-home').hidden = false;
    if (_origen && document.contains(_origen)) _origen.focus();
    _origen = null;
  }

  /* Todo lo que depende de la audiencia elegida se descarta, y las
     respuestas que aún vengan de camino ya no se pintarán. */
  function olvidarAudiencia() {
    _turnoAudiencia++;
    _turnoVista++;
    clearTimeout(_espera);
    _candidatos = null;
    _pidiendoCandidatos = null;
    _segmento = 'all';
    _divisiones = new Set();
    _elegidos = new Set();
    _verPersonas = false;
    $('hub-search').value = '';
    $('hub-pick-list').replaceChildren();
    $('hub-divisions').replaceChildren();
    $('hub-seg-divisions').hidden = true;
    limpiarVista();
  }

  function limpiarVista() {
    $('hub-preview').replaceChildren();
    $('hub-people').replaceChildren();
    $('hub-people').hidden = true;
    $('hub-view-btn').hidden = true;
  }

  function mostrarDestinatarios(si) {
    $('hub-step-recipients').hidden = !si;
    $('hub-step-preview').hidden = !si;
  }

  /* ── LA LISTA DE ESCALERAS O TORNEOS ────────────────────── */
  async function cargarAudiencias() {
    const sel = $('hub-audience-select');
    const t = TEXTOS[_tipo];
    const turno = _turnoAudiencia;
    sel.disabled = true;
    sel.replaceChildren(new Option('Loading…', ''));

    let filas;
    try {
      filas = _tipo === 'ladder'
        ? await api('ladders?select=id,name,status,start_date&order=start_date.desc')
        : await api('tournaments?select=id,name,date,status&order=date.desc');
    } catch (e) {
      if (turno !== _turnoAudiencia) return;
      sel.replaceChildren(new Option('Could not load the list', ''));
      toast(`Could not load the list: ${e.message}`, true);
      return;
    }
    if (turno !== _turnoAudiencia) return;

    /* Lo vigente primero; lo pasado, aparte, para el historial. La
       fecha va en el nombre para distinguir dos con el mismo nombre. */
    const vigente = (f) => _tipo === 'ladder'
      ? f.status === 'active'
      : f.status === 'draft' || f.status === 'active';
    const fecha = (f) => (_tipo === 'ladder' ? f.start_date : f.date);
    const etiqueta = (f) => (fecha(f) ? `${f.name} · ${fmtDate(fecha(f))}` : f.name);

    const opciones = [new Option(t.elige, '')];
    [filas.filter(vigente), filas.filter((f) => !vigente(f))].forEach((lista, i) => {
      if (!lista.length) return;
      const grupo = document.createElement('optgroup');
      grupo.label = t.grupos[i];
      lista.forEach((f) => grupo.append(new Option(etiqueta(f), String(f.id))));
      opciones.push(grupo);
    });
    sel.replaceChildren(...opciones);
    sel.value = '';
    sel.disabled = false;
  }

  function alElegirAudiencia() {
    const valor = $('hub-audience-select').value;
    olvidarAudiencia();
    if (!valor) { _audiencia = null; mostrarDestinatarios(false); return; }

    _audiencia = Number(valor);
    mostrarDestinatarios(true);
    /* Las divisiones se piden aparte y sin esperar: la vista previa de
       "todos" no las necesita, y el botón aparece cuando llegan. */
    if (_tipo === 'tournament') cargarDivisiones();
    ponerSegmento('all');
  }

  async function cargarDivisiones() {
    const turno = _turnoAudiencia;
    let filas;
    try {
      filas = await api(`tournament_categories?tournament_id=eq.${_audiencia}&select=id,name&order=id`);
    } catch (e) {
      if (turno === _turnoAudiencia) toast(`Could not load the divisions: ${e.message}`, true);
      return;
    }
    if (turno !== _turnoAudiencia) return;
    $('hub-seg-divisions').hidden = filas.length === 0;
    $('hub-divisions').replaceChildren(...filas.map((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'co-pfilter';
      b.dataset.action = 'hubDivision';
      b.dataset.id = String(d.id);
      b.setAttribute('aria-pressed', 'false');
      b.textContent = d.name;
      return b;
    }));
  }

  /* ── DESTINATARIOS ──────────────────────────────────────── */
  async function ponerSegmento(segmento) {
    _segmento = segmento;
    _turnoVista++;
    clearTimeout(_espera);
    limpiarVista();
    document.querySelectorAll('#hub-segments [data-segment]').forEach((b) => {
      const on = b.dataset.segment === segmento;
      b.classList.toggle('co-pfilter-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('hub-divisions-wrap').hidden = segmento !== 'divisions';
    $('hub-selected-wrap').hidden = segmento !== 'selected';

    if (segmento === 'selected') {
      const turno = _turnoAudiencia;
      await cargarCandidatos();
      if (turno !== _turnoAudiencia || _segmento !== segmento) return;
    }
    pedirVista();
  }

  function cambiarDivision(btn) {
    const id = Number(btn.dataset.id);
    if (_divisiones.has(id)) _divisiones.delete(id); else _divisiones.add(id);
    const on = _divisiones.has(id);
    btn.classList.toggle('co-pfilter-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    pedirVista();
  }

  /* Quién se puede elegir en "Selected Players": los que recibirían con
     "todos". A un suplente o a alguien sin correo no se le puede elegir
     — el servidor rechazaría la petición entera. */
  async function cargarCandidatos() {
    const lista = $('hub-pick-list');
    if (_candidatos) { pintarCandidatos(); return; }
    const turno = _turnoAudiencia;
    lista.replaceChildren(nota('hub-pick-empty', 'Loading players…'));
    if (!_pidiendoCandidatos) _pidiendoCandidatos = pedirAudiencia('all', {});
    const r = await _pidiendoCandidatos;
    if (turno !== _turnoAudiencia) return;
    _pidiendoCandidatos = null;
    if (!r.ok) { lista.replaceChildren(nota('hub-pick-empty', r.mensaje)); return; }
    guardarCandidatos(r.data.people);
    pintarCandidatos();
  }

  /* La regla de quién se puede elegir, en un solo sitio: la usan la
     carga de la lista y la vista previa de "todos". Quien estaba elegido
     y ya no se puede elegir sale de la selección. */
  function guardarCandidatos(gente) {
    _candidatos = gente.filter((p) => p.included);
    const validos = new Set(_candidatos.map((p) => p.player_id));
    _elegidos = new Set([..._elegidos].filter((id) => validos.has(id)));
  }

  function pintarCandidatos() {
    const lista = $('hub-pick-list');
    if (!_candidatos.length) {
      lista.replaceChildren(nota('hub-pick-empty', 'No one in this group can receive email.'));
      return;
    }
    lista.replaceChildren(..._candidatos.map((p) => {
      const nombre = window.nombreDestinatario(p);
      const fila = document.createElement('label');
      fila.className = 'hub-pick';
      fila.dataset.name = `${nombre} ${p.email}`.toLowerCase();
      const caja = document.createElement('input');
      caja.type = 'checkbox';
      caja.value = String(p.player_id);
      caja.checked = _elegidos.has(p.player_id);
      const textos = document.createElement('span');
      textos.className = 'hub-pick-text';
      const n = document.createElement('span');
      n.className = 'hub-pick-name';
      n.textContent = nombre;
      const m = document.createElement('span');
      m.className = 'hub-pick-mail';
      m.textContent = p.email;
      textos.append(n, m);
      fila.append(caja, textos);
      return fila;
    }));
    filtrarCandidatos();
  }

  function filtrarCandidatos() {
    const q = $('hub-search').value.trim().toLowerCase();
    document.querySelectorAll('#hub-pick-list .hub-pick').forEach((f) => {
      f.hidden = !!q && !f.dataset.name.includes(q);
    });
  }

  /* ── VISTA PREVIA ───────────────────────────────────────── */
  /* Espera un momento antes de preguntar: marcar seis jugadores seguidos
     no tiene que hacer seis peticiones. */
  function pedirVista() {
    clearTimeout(_espera);
    const turno = ++_turnoVista;
    $('hub-view-btn').hidden = true;
    $('hub-people').hidden = true;

    if (_segmento === 'divisions' && !_divisiones.size) {
      pintarAviso('Choose at least one division to see who will receive it.');
      return;
    }
    if (_segmento === 'selected' && !_elegidos.size) {
      pintarAviso('Select at least one player.');
      return;
    }
    $('hub-preview').replaceChildren(nota('hub-note', 'Loading recipients…'));
    _espera = setTimeout(() => cargarVista(turno), 250);
  }

  async function cargarVista(turno) {
    const segmento = _segmento;
    const extra = segmento === 'divisions' ? { division_ids: [..._divisiones] }
                : segmento === 'selected'  ? { player_ids:   [..._elegidos] }
                : {};
    const r = await pedirAudiencia(segmento, extra);
    if (turno !== _turnoVista) return;
    if (!r.ok) {
      $('hub-preview').replaceChildren(nota('hub-error', r.mensaje));
      /* Alguien de la selección ya no puede recibir: la lista para
         elegir se rehace con lo que hay ahora. */
      if (r.codigo === 'player_not_in_audience' && segmento === 'selected') {
        _candidatos = null;
        cargarCandidatos();
      }
      return;
    }
    if (segmento === 'all' && !_candidatos) guardarCandidatos(r.data.people);
    pintarVista(r.data);
  }

  function pintarAviso(texto) {
    $('hub-preview').replaceChildren(nota('hub-note', texto));
  }

  function pintarVista(datos) {
    const { people: gente, summary: s } = datos;
    const partes = [];

    if (!s.people) {
      partes.push(nota('hub-count', 'No one in this group can receive email.'));
    } else {
      partes.push(nota('hub-count',
        `${s.people} player${s.people === 1 ? '' : 's'} · ${s.emails} email${s.emails === 1 ? '' : 's'}`));
      if (s.emails < s.people) {
        partes.push(nota('hub-note',
          'Players who share an email address (families) get one email between them.'));
      }
    }

    const fuera = Object.keys(MOTIVOS).filter((k) => s.excluded[k] > 0)
      .map((k) => MOTIVOS[k].plural(s.excluded[k]));
    if (fuera.length) partes.push(nota('hub-note', `Not included: ${fuera.join(' · ')}.`));

    $('hub-preview').replaceChildren(...partes);
    pintarPersonas(gente);
    $('hub-view-btn').hidden = gente.length === 0;
    ponerBotonPersonas();
  }

  /* Primero quienes reciben, luego quienes no, cada grupo por nombre
     (el servidor ya los manda ordenados). */
  function pintarPersonas(gente) {
    const orden = [...gente.filter((p) => p.included), ...gente.filter((p) => !p.included)];
    const filas = orden.map((p) => {
      const estado = p.included
        ? '<span class="pill pill-active">Receives</span>'
        : `<span class="pill ${p.excluded_reason === 'sub' || p.excluded_reason === 'inactive'
              ? 'pill-inactive' : 'hub-pill-warn'}">${esc(MOTIVOS[p.excluded_reason]?.corto || p.excluded_reason)}</span>`;
      return `<tr class="${p.included ? '' : 'hub-row-out'}">
        <td>${esc(window.nombreDestinatario(p))}</td>
        <td class="hub-td-mail">${esc(p.email || '—')}</td>
        <td>${estado}</td>
      </tr>`;
    }).join('');
    $('hub-people').innerHTML = `<table class="hub-table">
      <thead><tr><th>Player</th><th>Email</th><th>Status</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  }

  function verPersonas() {
    _verPersonas = !_verPersonas;
    ponerBotonPersonas();
  }

  function ponerBotonPersonas() {
    const btn = $('hub-view-btn');
    btn.textContent = _verPersonas ? 'Hide recipients' : 'View recipients';
    btn.setAttribute('aria-expanded', _verPersonas ? 'true' : 'false');
    $('hub-people').hidden = !_verPersonas || btn.hidden;
  }

  /* Un párrafo con su clase y su texto, sin pasar por innerHTML. */
  function nota(clase, texto) {
    const d = document.createElement('div');
    d.className = clase;
    d.textContent = texto;
    return d;
  }

  /* ── EVENTOS ────────────────────────────────────────────── */
  $('hub-audience-select')?.addEventListener('change', alElegirAudiencia);
  $('hub-search')?.addEventListener('input', filtrarCandidatos);
  $('hub-pick-list')?.addEventListener('change', (e) => {
    const caja = e.target.closest('input[type="checkbox"]');
    if (!caja) return;
    const id = Number(caja.value);
    if (caja.checked) _elegidos.add(id); else _elegidos.delete(id);
    pedirVista();
  });

  window.hubCerrar = cerrar;

  Object.assign(window.CLICK_HANDLERS, {
    hubOpen:         (btn) => abrir(btn.dataset.audience, btn),
    hubClose:        () => cerrar(),
    hubSegment:      (btn) => ponerSegmento(btn.dataset.segment),
    hubDivision:     (btn) => cambiarDivision(btn),
    hubTogglePeople: () => verPersonas(),
  });
})();
