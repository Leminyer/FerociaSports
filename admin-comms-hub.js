/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: COMMUNICATIONS HUB
   Depende de: config.js, db.js (api, esc, fmtDate, supabase, toast,
               confirmModal), admin-state.js (CLICK_HANDLERS, AdminState,
               logAuditAction), app.js (showPage; se usa al pulsar),
               admin-rich-editor.js (FerociaEditor),
               admin-email-utils.js (sendEmailServer, crearClaveador,
               vincularEnsayo, envioEnCurso, leerErrorDeFuncion,
               nombreDestinatario y los textos del resultado),
               admin-communications.js (la ventana de detalle de un envío)

   El panel de la pestaña Send desde donde se escribe a los jugadores:
     1. la audiencia: una escalera, un torneo, o All Players;
     2. los destinatarios: todos, unas divisiones o unos jugadores;
     3. la vista previa: cuántas personas, cuántos correos, y quién se
        queda fuera y por qué;
     4. el mensaje, y enviarlo;
     5. lo que ya se le ha mandado a esa escalera o a ese torneo.
   Las demás pantallas traen aquí con la audiencia ya elegida
   (window.hubAbrirCon): ver "ABRIR EL HUB DESDE OTRA PANTALLA".

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

   ── ANUNCIO O ENCUESTA (entregable 5) ──────────────────────────────
   En escaleras y torneos se elige qué se manda (decidido el 10 de
   octubre): un anuncio, la disponibilidad semanal (sólo escaleras) o una
   encuesta propia (de 2 a 6 respuestas). Una encuesta va sin PDF, con el
   texto opcional, y cada persona recibe sus propios botones para
   contestar. Las horas se escriben y se enseñan en hora de Florida,
   esté donde esté el ordenador.

   ── QUIÉN ENVÍA ────────────────────────────────────────────────────
   El servidor (función comms-send). Desde aquí sólo se le dice qué
   audiencia, qué destinatarios y qué mensaje; la lista la vuelve a
   calcular él con la misma función que la vista previa, y le pasa el
   envío a send-email, que manda como siempre. La respuesta es la misma
   que la de las ventanas de antes, y se lee con las mismas piezas.
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

  /* Las plantillas de la ventana "Send Ladder Update", tal cual (decidido
     el 9 de octubre). {{ladder}} se cambia por el nombre de la escalera. */
  const PLANTILLAS_ESCALERA = {
    welcome: {
      subject: '🏓 Welcome to the {{ladder}} — Guidelines & Schedule',
      message: `I hope this message finds you well.

I'm excited to share that our upcoming Pickleball Ladder will officially begin on Saturday, April 18, 2026, with sessions taking place every Saturday from 1:30 PM to 3:00 PM for six consecutive weeks.

Saturday April, 18 2026 (1:30 pm to 3:00 pm)
Saturday April, 25 2026 (1:30 pm to 3:00 pm)
Saturday May, 2 2026 (1:30 pm to 3:00 pm)
Saturday May, 9 2026 (1:30 pm to 3:00 pm)
Saturday May, 16 2026 (1:30 pm to 3:00 pm)
Saturday May, 23 2026 (1:30 pm to 3:00 pm)

🏓 Ladder Structure Overview

Format: Players will be randomly organized into groups of 4 or 5 for the first week. Starting from week 2, players will be organized based on their performance and points earned.

Match Style: Round-robin format within each group. Players will partner with and against everyone in their group.

Scoring: Games are played to 11 points (WIN BY 1).

Ranking Updates: Player rankings will be updated weekly according to total points earned.

Co-ed Participation: All players are welcome, regardless of gender.

Attendance: If you are unable to attend on a given week, please notify the organizer by the app (TeamReach) or by texting or calling to 786-241-7035 (Leminyer Zapata).

🧮 New Ladder Scoring System

✅ Win a match: +4 points
🤝🏼 Lose by 1-2 points (11-10, 11-9): +3 points
🎯 Lose by 3-4 points (11-8, 11-7): +2 points
🎁 Lose by 5-8 points (11-6 to 11-3): +1 points
🚫 Lose by 9-11 points (11-2, 11-1, 11-0): 0 points
⚠️ Default / No-Show: –1 points per match (applies if the player does not notify the organizer at least 24 hours before the time the ladder starts).

This new system is designed to reward not just wins but also competitive performance and tight matches.

📋 Additional Guidelines

Court Etiquette: Please be respectful and avoid interrupting play on adjacent courts.

Punctuality: Matches start promptly at 1:30 PM. Late arrivals may result in forfeits. You can get to the park earlier (around 1:00 pm).

Sportsmanship: Great sportsmanship is expected from all. Let's keep it friendly, fun, and welcoming!

Disputes, questions or concerns: Any issues should be reported directly to the organizer immediately. His decision will be final.

Line Calls: Are made by the team on the side the ball lands. Let's be fair and respectful.

Warnings/Penalties: Use of profanity is not allowed. Throwing paddles, aggressive behavior, or any form of violence will not be tolerated. Any player who engages in these actions will receive a warning for the first offense; a second offense will result in a one-week suspension. If the behavior persists, the player will be removed from the ladder.

Bring Your Own Balls 🏓
Stay Hydrated! Don't forget your water bottle! 💧

Conduct Policy — Profanity & Unsportsmanlike Behavior

Profanity, verbal abuse, aggressive behavior, and throwing paddles or other equipment are strictly prohibited.

Penalties:
• First offense: Formal warning
• Second offense: Match forfeiture
• Further offenses: Removal from the ladder

If you have any questions please feel free to reach out.

I'm looking forward to an amazing season of friendly competition and good vibes on the courts! 🎾🔥`,
    },
    scores: {
      subject: '🏆 Scores Updated — {{ladder}}',
      message:
        'The scores for the {{ladder}} ladder have just been updated!\n\nCheck the latest standings and see where you stand on the leaderboard.',
    },
    reminder: {
      subject: '⏰ Session Reminder — {{ladder}}',
      message:
        "This is a friendly reminder that your next pickleball session for the {{ladder}} ladder is coming up soon.\n\nMake sure you're ready to play your best game!",
    },
    end: {
      subject: '🏆 End of {{ladder}} — Congratulations!',
      message:
        'The {{ladder}} ladder has officially come to an end!\n\nThank you for your participation and great sportsmanship. Check the final standings to see how you finished.',
    },
    custom: {
      subject: '',
      message: '',
    },
  };

  /* El texto de siempre del aviso de un torneo. Sin "Hi {{player_name}},":
     el correo ya saluda por el nombre. */
  const textoTorneo = (nombre) => ({
    subject: `🏆 ${nombre} — Your Results Are Ready`,
    message: `The results for ${nombre} are now available. `
      + 'Click the link below to view your standings, bracket results, and more.'
      + '\n\nThank you for participating and congratulations to all players '
      + 'on a great tournament!\n\nFerocia Sports Center',
  });

  /* Las opciones de "Notification Type" de cada audiencia. La primera,
     "Select one", deja el mensaje en blanco: así se abre, y así queda
     después de cada envío (decidido el 10 de octubre). All Players no
     tiene lista: empieza siempre en blanco. */
  const OPCIONES = {
    ladder: [
      ['', 'Select one'],
      ['welcome', '👋 Welcome & Guidelines'],
      ['scores', '📊 Scores Updated'],
      ['reminder', '⏰ Session Reminder'],
      ['end', '🏆 End of Ladder'],
      ['custom', '✏️ Custom Message'],
    ],
    tournament: [
      ['', 'Select one'],
      ['results', '🏆 Results Ready'],
    ],
  };

  /* El asunto y el texto de una opción, con el nombre de la escalera o
     del torneo puesto. "Select one" (y "Custom Message") van en blanco. */
  function plantillaDe(clave, nombre) {
    if (_tipo === 'tournament' && clave === 'results') return textoTorneo(nombre);
    const t = _tipo === 'ladder' ? PLANTILLAS_ESCALERA[clave] : null;
    if (!t) return { subject: '', message: '' };
    return { subject: t.subject.replaceAll('{{ladder}}', nombre),
             message: t.message.replaceAll('{{ladder}}', nombre) };
  }

  /* Lo que se añade solo a cada correo, según la audiencia. */
  const AVISO_MENSAJE = {
    ladder:      'A button to the ladder standings is added to every email automatically.',
    tournament:  'A button to the tournament results is added to every email automatically.',
    all_players: 'Each player is greeted by name automatically — just write your message.',
  };
  /* Las notas del mensaje cuando es una encuesta. */
  const AVISO_ENCUESTA = 'Optional. Shown above the answer buttons. Each player gets their own private buttons.';

  /* ── ANUNCIO O ENCUESTA ─────────────────────────────────────
     Qué se puede mandar a cada audiencia, y cómo se llama el botón. */
  const CLASES_DE = {
    ladder:      ['announcement', 'availability', 'custom'],
    tournament:  ['announcement', 'custom'],
    all_players: ['announcement'],
  };
  const BOTON = {
    announcement: 'Send Email',
    availability: 'Send Availability Request',
    custom:       'Send Poll',
  };
  /* Las respuestas con las que empieza una encuesta propia. */
  const RESPUESTAS_INICIALES = ['Yes', 'No', 'Maybe'];
  const MIN_RESPUESTAS = 2;
  const MAX_RESPUESTAS = 6;
  const MAX_PREGUNTA = 300;
  const MAX_RESPUESTA = 80;
  const ZONA = 'America/New_York';

  /* Los estados de un envío que tienen color propio (admin-comms-hub.css). */
  const ESTADOS = new Set(['sent', 'partial', 'failed', 'sending']);
  const ROTULO_HISTORIAL = {
    ladder:      'Sent to this ladder',
    tournament:  'Sent to this tournament',
    all_players: 'Sent to All Players',
  };

  /* ── ESTADO ─────────────────────────────────────────────── */
  let _tipo        = null;       // 'ladder' | 'tournament' | 'all_players'
  let _audiencia   = null;       // id de la escalera o del torneo
  let _segmento    = 'all';      // 'all' | 'divisions' | 'selected'
  let _divisiones  = new Set();  // ids elegidos con 'divisions'
  let _elegidos    = new Set();  // ids elegidos con 'selected'
  let _candidatos  = null;       // quién se puede elegir: los que reciben con 'all'
  let _motivos     = new Map();  // id → por qué no se le puede elegir (sub, inactive…)
  let _pidiendoCandidatos = null;  // la petición en curso, para no pedirla dos veces
  let _verPersonas = false;
  let _origen      = null;       // la tarjeta que abrió el panel, para devolverle el foco
  let _turnoAudiencia = 0;
  let _turnoVista     = 0;
  let _espera = null;
  let _nombres     = new Map();  // id → nombre de cada escalera o torneo de la lista
  let _ultimaVista = null;       // la vista previa que se ve AHORA; null mientras carga
  let _plantilla   = { subject: '', html: '' };  // lo último que puso una plantilla
  let _historial   = new Map();  // id → envío, para abrir su detalle
  let _clase       = 'announcement';  // 'announcement' | 'availability' | 'custom'
  let _encuestaTocada = false;   // ¿cambió ella algo de la encuesta?
  let _preguntaSola   = true;    // la pregunta aún la pone la fecha de la sesión
  let _plazoSolo      = true;    // el plazo aún lo pone la fecha de la sesión

  const $ = (id) => document.getElementById(id);

  const CFG = window.FEROCIA_CONFIG;
  const editor = window.FerociaEditor
    ? window.FerociaEditor.mount('hub-message', { barraId: 'hub-fmt-bar' }) : null;
  if (!editor) console.error('[Ferocia] admin-rich-editor.js must load before admin-comms-hub.js');
  const claveador = window.crearClaveador('hub');
  const ensayo = window.vincularEnsayo('hub-only-me', 'hub-send-btn', BOTON.announcement);

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
    if (window.envioEnCurso('abrir')) return;
    _tipo = tipo;
    _origen = boton || null;
    _audiencia = null;
    olvidarAudiencia();

    /* El mensaje empieza en blanco cada vez, como en las ventanas de
       antes. La casilla de ensayo se desmarca SIEMPRE: una casilla que
       se queda puesta de la vez anterior es la forma más fácil de creer
       que se avisó a todos cuando sólo se lo mandó una a sí misma.
       La llave, en cambio, NO se renueva si hay una pendiente: reintentar
       un envío que falló tiene que retomarlo, no crear otro. */
    ponerTexto('', '');
    _plantilla = { subject: '', html: '' };
    quitarAdjunto();
    $('hub-preset').replaceChildren(...(OPCIONES[tipo] || []).map(([v, t]) => new Option(t, v)));
    $('hub-preset').value = '';   // "Select one": se empieza en blanco
    limpiarEncuesta();
    ponerClase('announcement', true);
    ensayo.reset();
    claveador.asegurar();

    const t = TEXTOS[tipo];
    $('hub-title').textContent = t.titulo;
    $('hub-sub').textContent = t.sub;
    $('hub-seg-all').textContent = t.todos;

    $('co-send-home').hidden = true;
    $('hub-panel').hidden = false;

    if (tipo === 'all_players') {
      $('hub-step-audience').hidden = true;
      mostrarDestinatarios(true);
      mostrarMensaje(true);
      $('hub-seg-all').focus();
      ponerSegmento('all');
      cargarHistorial();
      return;
    }

    $('hub-step-audience').hidden = false;
    $('hub-audience-label').textContent = t.rotulo;
    mostrarDestinatarios(false);
    mostrarMensaje(false);
    $('hub-audience-select').focus();
    await cargarAudiencias();
  }

  /* "All channels": cierra el panel y vuelve a la rejilla. Si hay un
     mensaje a medio escribir, pregunta antes (aprobado el 10 de
     octubre): cerrar lo perdería. */
  async function cerrar() {
    if ($('hub-panel').hidden) return;
    if (window.envioEnCurso('cerrar')) return;
    if (!(await puedeDescartar())) return;
    cerrarYa();
  }

  function cerrarYa() {
    olvidarAudiencia();
    $('hub-panel').hidden = true;
    $('co-send-home').hidden = false;
    if (_origen && document.contains(_origen)) _origen.focus();
    _origen = null;
  }

  /* Al volver a la pantalla Communications. Sin borrador, el panel se
     cierra, para que nunca se vea una vista previa vieja. Con borrador
     se queda como estaba —volver a él es justo a lo que se viene— y la
     vista previa se pide otra vez para que esté al día. */
  function alVolver() {
    if ($('hub-panel').hidden || window.AdminState.emailInFlight) return;
    if (!hayBorrador()) { cerrarYa(); return; }
    if (_tipo === 'all_players' || _audiencia) pedirVista();
  }

  /* ¿Hay algo escrito que se perdería? Una plantilla sin tocar no
     cuenta: se vuelve a poner sola. */
  function hayBorrador() {
    if ($('hub-panel').hidden) return false;
    const escrito = $('hub-subject').value.trim() || (editor ? editor.getText() : '');
    return !!_adjunto || _subiendo || (!!escrito && !sinTocar())
        || (_clase !== 'announcement' && _encuestaTocada);
  }

  async function puedeDescartar() {
    if (!hayBorrador()) return true;
    return confirmModal({
      title: 'Discard the message you were writing?',
      message: (_adjunto || _subiendo)
        ? 'The subject, message and attached PDF you were working on will be lost.'
        : _clase !== 'announcement'
          ? 'The poll you were preparing will be lost.'
          : 'The subject and message you were writing will be lost.',
      okLabel: 'Discard',
      cancelLabel: 'Keep writing',
      danger: true,
      focusCancel: true,
    });
  }

  /* Todo lo que depende de la audiencia elegida se descarta, y las
     respuestas que aún vengan de camino ya no se pintarán. */
  function olvidarAudiencia() {
    _turnoAudiencia++;
    _turnoVista++;
    clearTimeout(_espera);
    _candidatos = null;
    _motivos = new Map();
    _pidiendoCandidatos = null;
    _segmento = 'all';
    _divisiones = new Set();
    _elegidos = new Set();
    _verPersonas = false;
    _ultimaVista = null;
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
    _nombres = new Map(filas.map((f) => [f.id, f.name]));
    sel.replaceChildren(...opciones);
    sel.value = '';
    sel.disabled = false;
  }

  function alElegirAudiencia() {
    const valor = $('hub-audience-select').value;
    olvidarAudiencia();
    /* El PDF es de la escalera o el torneo de antes (un roster): al
       cambiar, se quita, para que no se cuele el de otra (decidido el 10
       de octubre). El texto escrito sí se queda. */
    if (_adjunto || _subiendo) {
      quitarAdjunto();
      toast(`The PDF was removed because you changed the ${_tipo === 'tournament' ? 'tournament' : 'ladder'}. Attach the right one.`);
    }
    if (!valor) { _audiencia = null; mostrarDestinatarios(false); mostrarMensaje(false); return; }

    _audiencia = Number(valor);
    mostrarDestinatarios(true);
    mostrarMensaje(true);
    cargarHistorial();
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
    /* La vista previa del segmento anterior deja de valer YA: mientras
       carga la lista de jugadores, "Send" no puede usar sus números. */
    _ultimaVista = null;
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

  /* Alguien elegido ya no puede recibir: la lista se vuelve a pedir, sin
     él, y con ella la vista previa — si no, "Send" seguiría sin saber a
     quién va hasta que se tocara otra casilla. */
  async function rehacerCandidatos() {
    const turno = _turnoAudiencia;
    _candidatos = null;
    await cargarCandidatos();
    /* Sólo si la lista llegó: si no, la vista volvería a fallar igual y
       se pedirían las dos cosas una y otra vez. */
    if (turno === _turnoAudiencia && _segmento === 'selected' && _candidatos) pedirVista();
  }

  /* La regla de quién se puede elegir, en un solo sitio: la usan la
     carga de la lista y la vista previa de "todos". Quien estaba elegido
     y ya no se puede elegir sale de la selección. */
  function guardarCandidatos(gente) {
    _candidatos = gente.filter((p) => p.included);
    _motivos = new Map(gente.filter((p) => !p.included).map((p) => [p.player_id, p.excluded_reason]));
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
    _ultimaVista = null;
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
         elegir se rehace con lo que hay ahora, y la vista previa con
         ella. Esa vista nueva tapa este mensaje en un momento, así que
         se dice también en el aviso, para que no pase sin verse. */
      if (r.codigo === 'player_not_in_audience' && segmento === 'selected') {
        toast(r.mensaje, true);
        rehacerCandidatos();
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
    _ultimaVista = datos;
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

  /* ── EL MENSAJE ─────────────────────────────────────────── */
  function ponerTexto(asunto, html) {
    $('hub-subject').value = asunto;
    if (editor) editor.setHTML(html);
  }

  /* El mensaje y el historial se ven en cuanto hay audiencia. */
  function mostrarMensaje(si) {
    $('hub-step-compose').hidden = !si;
    $('hub-step-history').hidden = !si;
    if (si) { prepararMensaje(); return; }
    _historial = new Map();
    $('hub-history').replaceChildren();
  }

  /* ¿Sigue el mensaje tal como lo dejó la última plantilla? Si ella ya
     escribió algo, cambiar de escalera NO se lo borra. */
  function sinTocar() {
    return $('hub-subject').value === _plantilla.subject
        && (editor ? editor.getHTML() : '') === _plantilla.html;
  }

  /* Pone una plantilla y recuerda cómo quedó, para saber después si se
     ha tocado. Se guarda lo que devuelve el editor, no lo que se le
     dio: el navegador puede escribir el mismo HTML de otra forma. */
  function aplicarPlantilla(asunto, texto) {
    ponerTexto(asunto, window.FerociaEditor.textoAHTML(texto));
    _plantilla = { subject: $('hub-subject').value, html: editor ? editor.getHTML() : '' };
  }

  /* Las plantillas de la escalera, con su nombre puesto. */
  function aplicarPreset() {
    const t = plantillaDe($('hub-preset').value, _nombres.get(_audiencia) || '');
    aplicarPlantilla(t.subject, t.message);
  }

  /* El texto de partida de cada audiencia. Sólo si el mensaje está como
     lo dejó la plantilla anterior: lo escrito a mano no se pisa. */
  function prepararMensaje() {
    const clases = CLASES_DE[_tipo] || ['announcement'];
    $('hub-kind-wrap').hidden = clases.length < 2;
    $('hub-kind-availability').hidden = !clases.includes('availability');
    pintarClase();
    if (sinTocar()) aplicarTextoDeClase();
  }

  /* El asunto y el texto de partida según lo que se manda. */
  function aplicarTextoDeClase() {
    if (_clase === 'availability') {
      aplicarPlantilla(`${_nombres.get(_audiencia) || ''} — Availability Required`, '');
    } else if (_clase === 'custom') {
      aplicarPlantilla('', '');
    } else if (OPCIONES[_tipo]) {
      aplicarPreset();
    }
  }

  /* Tras un envío que salió bien, el formulario vuelve a empezar (para
     que no se pueda mandar dos veces el mismo sin querer):
       · el mensaje en blanco, con "Select one";
       · si se eligieron jugadores a mano, se desmarcan y se vuelve a
         "todos", con la búsqueda vacía.
     Tras un ensayo NO: el mensaje se queda para mandarlo de verdad. */
  function empezarDeNuevo() {
    $('hub-preset').value = '';
    ponerTexto('', '');
    _plantilla = { subject: '', html: '' };
    quitarAdjunto();
    /* Y vuelve a "Announcement", con la encuesta en blanco. */
    limpiarEncuesta();
    ponerClase('announcement', true);
    if (_segmento === 'selected') {
      _elegidos = new Set();
      $('hub-search').value = '';
      ponerSegmento('all');
    }
  }

  /* ── EL PDF ADJUNTO ─────────────────────────────────────── */
  /* Sólo en escaleras y torneos, uno, PDF y 10 MB como máximo (decidido
     el 10 de octubre). Se sube en cuanto se elige, a la carpeta privada
     `comms-attachments` (sql/75), y al enviar el servidor vuelve a
     comprobarlo todo: aquí sólo se avisa antes, para no hacer esperar. */
  const CARPETA_ADJUNTOS = 'comms-attachments';
  const MAX_ADJUNTO = 10 * 1024 * 1024;
  const CON_ADJUNTO = new Set(['ladder', 'tournament']);
  let _adjunto = null;       // { path, filename, size } cuando ya está subido
  let _subiendo = false;
  let _turnoAdjunto = 0;     // quitar o reabrir mientras sube: la subida vieja no se pinta

  const tamano = (b) => (b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

  /* El nombre con el que lo verá el jugador: el del archivo, sin los
     caracteres que un buzón no admite. */
  function nombreVisible(n) {
    let v = String(n || '').replace(/[\x00-\x1f\u202a-\u202e\u2066-\u2069\\/:*?"<>|]/g, '').trim();
    if (!/\.pdf$/i.test(v)) v += '.pdf';
    if (v.length > 120) v = `${v.slice(0, 116).trim()}.pdf`;
    return v.length > 4 ? v : 'attachment.pdf';
  }

  /* El nombre dentro de la carpeta: letras sin acentos, números y . _ - */
  function nombreEnCarpeta(n) {
    const base = String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '').slice(0, 100);
    return `${base || 'attachment'}.pdf`;
  }

  function pintarAdjunto() {
    /* Las encuestas van sin PDF (decidido el 10 de octubre). */
    $('hub-attach-wrap').hidden = !CON_ADJUNTO.has(_tipo) || _clase !== 'announcement';
    $('hub-attach-btn').hidden = !!_adjunto;
    $('hub-attach-btn').disabled = _subiendo;
    $('hub-attach-btn-text').textContent = _subiendo ? 'Uploading…' : 'Attach PDF';
    $('hub-attach-file').hidden = !_adjunto;
    $('hub-attach-hint').hidden = !_adjunto;
    if (_adjunto) {
      $('hub-attach-name').textContent = _adjunto.filename;
      $('hub-attach-size').textContent = tamano(_adjunto.size);
    }
  }

  /* El archivo se queda en la carpeta (desde el navegador no se puede
     borrar nada de ella); sólo deja de ir en este correo. */
  function quitarAdjunto() {
    _turnoAdjunto++;
    _adjunto = null;
    _subiendo = false;
    $('hub-attach-input').value = '';
    pintarAdjunto();
  }

  async function subirAdjunto(archivo) {
    $('hub-attach-input').value = '';   // así, elegir el mismo archivo otra vez también avisa
    if (!archivo) return;
    /* Por el nombre y por el contenido, NO por el tipo que dice el
       navegador: en algunos ordenadores un .pdf llega sin tipo. */
    if (!/\.pdf$/i.test(archivo.name)) {
      toast('Only PDF files can be attached.', true);
      return;
    }
    if (archivo.size > MAX_ADJUNTO) {
      toast('This PDF is larger than 10 MB. Make it smaller and try again.', true);
      return;
    }
    /* La marca de un PDF, "%PDF-", va en su primer kilobyte. */
    let cabecera = '';
    try { cabecera = await archivo.slice(0, 1024).text(); } catch (e) { /* se queda vacía */ }
    if (!cabecera.includes('%PDF-')) { toast('This file is not a valid PDF.', true); return; }

    const turno = ++_turnoAdjunto;
    _subiendo = true;
    pintarAdjunto();
    const path = `hub/${crypto.randomUUID()}/${nombreEnCarpeta(archivo.name)}`;
    let error = null;
    try {
      /* Se sube con el tipo puesto a mano: supabase-js manda el tipo que
         trae el archivo, y si el navegador no puso ninguno, la carpeta
         (que sólo acepta PDF) lo rechazaría. */
      const comoPDF = new Blob([archivo], { type: 'application/pdf' });
      ({ error } = await window.supabase.storage.from(CARPETA_ADJUNTOS)
        .upload(path, comoPDF, { contentType: 'application/pdf', upsert: false }));
    } catch (e) { error = e; }
    if (turno !== _turnoAdjunto) return;
    _subiendo = false;
    if (error) {
      pintarAdjunto();
      toast(`Could not upload the PDF: ${error.message || 'try again'}.`, true);
      return;
    }
    _adjunto = { path, filename: nombreVisible(archivo.name), size: archivo.size };
    pintarAdjunto();
  }

  /* ── ANUNCIO O ENCUESTA ─────────────────────────────────── */
  /* Elegir qué se manda. `sinAviso`: al abrir y tras un envío, donde no
     hay nada que avisar. */
  function ponerClase(clase, sinAviso) {
    if (!BOTON[clase]) return;
    if (!(CLASES_DE[_tipo] || ['announcement']).includes(clase)) clase = 'announcement';
    const antes = _clase;
    _clase = clase;
    /* Un PDF no viaja en una encuesta: se quita y se dice, para que no
       desaparezca en silencio. */
    if (clase !== 'announcement' && (_adjunto || _subiendo)) {
      quitarAdjunto();
      if (!sinAviso) toast('The PDF was removed: polls are sent without attachments.');
    }
    pintarClase();
    /* El plazo de partida es distinto en cada clase de encuesta: se pone
       el que toca, salvo que ella ya lo haya cambiado a mano. */
    if (antes !== clase && _plazoSolo) ponerPlazoSolo();
    if (sinTocar()) aplicarTextoDeClase();
  }

  /* Enseña lo que toca a cada clase de envío. */
  function pintarClase() {
    const encuesta = _clase !== 'announcement';
    document.querySelectorAll('#hub-kinds [data-kind]').forEach((b) => {
      const on = b.dataset.kind === _clase;
      b.classList.toggle('co-pfilter-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('hub-preset-wrap').hidden = !OPCIONES[_tipo] || encuesta;
    $('hub-poll-wrap').hidden = !encuesta;
    $('hub-session-wrap').hidden = _clase !== 'availability';
    $('hub-options-fixed').hidden = _clase !== 'availability';
    $('hub-options').hidden = _clase !== 'custom';
    $('hub-options-hint').hidden = _clase !== 'custom';
    pintarBotonRespuesta();
    $('hub-message-req').hidden = encuesta;
    $('hub-message-opt').hidden = !encuesta;
    $('hub-message-hint').textContent = encuesta ? AVISO_ENCUESTA : (AVISO_MENSAJE[_tipo] || '');
    $('hub-question').placeholder = _clase === 'availability'
      ? 'Will you be playing this Monday?' : 'Which time works best?';
    pintarAdjunto();
    ensayo.rotular(BOTON[_clase]);
  }

  /* La encuesta en blanco: sin pregunta ni fecha, las respuestas de
     partida, y el plazo lo pondrá la fecha (o el de por defecto). */
  function limpiarEncuesta() {
    $('hub-question').value = '';
    $('hub-session').value = '';
    $('hub-deadline').value = '';
    pintarRespuestas(RESPUESTAS_INICIALES);
    _encuestaTocada = false;
    _preguntaSola = true;
    _plazoSolo = true;
  }

  /* ── LAS HORAS, EN HORA DE FLORIDA ───────────────────────
     Los campos de fecha del navegador usan la hora del ordenador. Aquí
     se convierten a mano desde y hacia la hora del club, para que el
     plazo sea el mismo aunque el ordenador esté en otra zona. */
  function partesEnZona(ms) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hourCycle: 'h23', year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    return Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  }
  /** "2026-10-11T18:00" (hora de Florida) → instante. NaN si no vale. */
  function desdeZona(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(texto || ''));
    if (!m) return NaN;
    const pared = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    let t = pared;
    /* Dos vueltas bastan incluso el día del cambio de hora. */
    for (let i = 0; i < 2; i++) {
      const p = partesEnZona(t);
      t += pared - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    }
    return t;
  }
  /** Instante → "2026-10-11T18:00" en hora de Florida. */
  function aZona(ms) {
    const p = partesEnZona(ms);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  /** "2026-10-12" + n días, sin pasar por la hora del ordenador. */
  function sumarDias(fecha, n) {
    const d = new Date(`${fecha}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  /** "Sunday, October 11 at 6:00 PM", como en el correo y en la página. */
  function textoPlazo(ms) {
    const d = new Date(ms);
    return `${new Intl.DateTimeFormat('en-US', { timeZone: ZONA, weekday: 'long', month: 'long', day: 'numeric' }).format(d)}`
         + ` at ${new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', minute: '2-digit' }).format(d)}`;
  }
  const diaDeLaSemana = (fecha) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' })
    .format(new Date(`${fecha}T12:00:00Z`));

  /* El plazo de partida (decidido el 10 de octubre): en la
     disponibilidad, el día antes de la sesión a las 6:00 PM; en una
     encuesta propia, dentro de 2 días a las 6:00 PM. */
  function ponerPlazoSolo() {
    const sesion = $('hub-session').value;
    if (_clase === 'availability') {
      $('hub-deadline').value = sesion ? `${sumarDias(sesion, -1)}T18:00` : '';
    } else if (_clase === 'custom') {
      $('hub-deadline').value = `${sumarDias(aZona(Date.now()).slice(0, 10), 2)}T18:00`;
    }
  }

  /* Al elegir el día de la sesión, la pregunta y el plazo se ponen solos
     — mientras ella no los haya cambiado a mano. */
  function alElegirSesion() {
    _encuestaTocada = true;
    const sesion = $('hub-session').value;
    if (_preguntaSola) {
      $('hub-question').value = sesion ? `Will you be playing this ${diaDeLaSemana(sesion)}?` : '';
    }
    if (_plazoSolo) ponerPlazoSolo();
  }

  /* Las respuestas de una encuesta propia: una caja por respuesta, con
     su botón para quitarla (nunca menos de 2) y "+ Add answer" (hasta 6). */
  function pintarRespuestas(lista) {
    $('hub-options').replaceChildren(...lista.map((texto, i) => {
      const fila = document.createElement('div');
      fila.className = 'hub-option-row';
      const caja = document.createElement('input');
      caja.type = 'text';
      caja.className = 'hub-input';
      caja.maxLength = MAX_RESPUESTA;
      caja.autocomplete = 'off';
      caja.value = texto;
      caja.setAttribute('aria-label', `Answer ${i + 1}`);
      const quitar = document.createElement('button');
      quitar.type = 'button';
      quitar.className = 'hub-attach-remove';
      quitar.dataset.action = 'hubOptionDel';
      quitar.dataset.i = String(i);
      quitar.textContent = 'Remove';
      quitar.setAttribute('aria-label', `Remove answer ${i + 1}`);
      quitar.hidden = lista.length <= MIN_RESPUESTAS;
      fila.append(caja, quitar);
      return fila;
    }));
    pintarBotonRespuesta();
  }

  function pintarBotonRespuesta() {
    $('hub-option-add').hidden = _clase !== 'custom' || leerRespuestas().length >= MAX_RESPUESTAS;
  }

  const leerRespuestas = () => [...document.querySelectorAll('#hub-options input')].map((c) => c.value);

  function anadirRespuesta() {
    const lista = leerRespuestas();
    if (lista.length >= MAX_RESPUESTAS) return;
    _encuestaTocada = true;
    pintarRespuestas([...lista, '']);
    const cajas = document.querySelectorAll('#hub-options input');
    cajas[cajas.length - 1].focus();
  }

  function quitarRespuesta(btn) {
    const lista = leerRespuestas();
    if (lista.length <= MIN_RESPUESTAS) return;
    _encuestaTocada = true;
    lista.splice(Number(btn.dataset.i), 1);
    pintarRespuestas(lista);
  }

  /* La encuesta tal como se manda, o el primer problema que tiene (con
     el campo donde está). El servidor lo vuelve a comprobar todo. */
  function leerEncuesta() {
    const pregunta = $('hub-question').value.trim();
    const sesion = $('hub-session').value;
    if (_clase === 'availability' && !/^\d{4}-\d{2}-\d{2}$/.test(sesion)) {
      return { error: 'Choose the session date.', campo: $('hub-session') };
    }
    if (!pregunta) return { error: 'Write the question.', campo: $('hub-question') };
    if (pregunta.length > MAX_PREGUNTA) return { error: 'The question is too long (300 characters at most).', campo: $('hub-question') };
    let respuestas;
    if (_clase === 'custom') {
      respuestas = leerRespuestas().map((r) => r.trim());
      const vacia = respuestas.findIndex((r) => !r);
      if (vacia !== -1) {
        return { error: 'Fill in every answer, or remove the empty ones.',
                 campo: document.querySelectorAll('#hub-options input')[vacia] };
      }
      if (respuestas.length < MIN_RESPUESTAS) return { error: 'A poll needs at least 2 answers.', campo: $('hub-option-add') };
      if (new Set(respuestas.map((r) => r.toLowerCase())).size !== respuestas.length) {
        return { error: 'Two answers are the same. Make each answer different.', campo: $('hub-options') };
      }
    }
    const plazo = desdeZona($('hub-deadline').value);
    if (!Number.isFinite(plazo)) return { error: 'Choose the response deadline.', campo: $('hub-deadline') };
    if (plazo <= Date.now() + 60 * 1000) {
      return { error: 'The response deadline has already passed. Choose a later one.', campo: $('hub-deadline') };
    }
    if (plazo > Date.now() + 120 * 864e5) {
      return { error: 'The response deadline is too far away (120 days at most).', campo: $('hub-deadline') };
    }
    return {
      poll: {
        kind: _clase,
        question: pregunta,
        ...(_clase === 'availability' ? { session_date: sesion } : {}),
        deadline: new Date(plazo).toISOString(),
        ...(_clase === 'custom' ? { options: respuestas } : {}),
      },
      plazoTexto: textoPlazo(plazo),
    };
  }

  /* ── ENVIAR ─────────────────────────────────────────────── */
  /* Los errores después de los cuales la lista que se ve ya no vale:
     se vuelve a pedir para que enseñe lo que hay ahora. */
  const REFRESCAR_VISTA = new Set([
    'player_not_in_audience', 'division_not_in_tournament', 'no_recipients',
    'audience_changed',
  ]);
  /* El mismo tope que el servidor (comms-send, MAX_CUERPO). */
  const MAX_MENSAJE = 200000;

  async function enviar() {
    if (window.AdminState.emailInFlight) {
      toast('Please wait for the current send to finish.', true);
      return;
    }
    const asunto = $('hub-subject').value.trim();
    const html   = editor ? editor.getHTML() : '';
    /* Se valida con el TEXTO: un editor "vacío" suele tener un <br>. */
    const texto  = editor ? editor.getText() : '';
    const clase  = _clase;
    const esEncuesta = clase !== 'announcement';
    /* En una encuesta el texto es opcional; lo que hace falta es la
       pregunta y el plazo. */
    if (!asunto || (!texto && !esEncuesta)) {
      toast(esEncuesta ? 'Please fill in the subject.' : 'Please fill in subject and message.', true);
      return;
    }
    let encuesta = null;
    if (esEncuesta) {
      encuesta = leerEncuesta();
      if (encuesta.error) {
        toast(encuesta.error, true);
        if (encuesta.campo) encuesta.campo.focus();
        return;
      }
    }
    if (_subiendo) { toast('Wait for the PDF to finish uploading.', true); return; }
    if (html.length > MAX_MENSAJE) {
      toast('The message is too long. Pasted images are the usual cause — remove them and try again.', true);
      return;
    }

    /* Se manda a quien se está viendo. Mientras la lista carga, o si dio
       error, no se sabe a quién iría: no se deja enviar. */
    const vista = _ultimaVista;
    if (!vista) {
      toast('The recipient list is not ready. Wait a moment, or fix the recipients above.', true);
      return;
    }
    const s = vista.summary;
    if (!s.people) { toast('No one in this group can receive email.', true); return; }

    /* La foto de lo que se va a mandar, tomada AHORA. Nada de lo de
       abajo vuelve a leer la pantalla. */
    const tipo = _tipo;
    const pedido = {
      audience_type: tipo,
      audience_id:   tipo === 'all_players' ? null : _audiencia,
      segment:       _segmento,
      ...(_segmento === 'divisions' ? { division_ids: [..._divisiones].sort((a, b) => a - b) } : {}),
      ...(_segmento === 'selected'  ? { player_ids:   [..._elegidos].sort((a, b) => a - b) }   : {}),
      subject: asunto,
      /* Una encuesta sin texto va con el cuerpo vacío, no con el <br>
         que deja el editor. */
      body:    esEncuesta && !texto ? '' : html,
      ...(encuesta ? { poll: encuesta.poll } : {}),
      /* Lo que ella ve y confirma. Si al enviar ya no cuadra con lo que
         calcula el servidor, no se manda nada ('audience_changed'). */
      expected_people: s.people,
      expected_emails: s.emails,
    };
    const adjunto = CON_ADJUNTO.has(tipo) && !esEncuesta ? _adjunto : null;
    if (adjunto) pedido.attachment = { path: adjunto.path, filename: adjunto.filename };
    const conAdjunto = adjunto ? `, with the attachment "${adjunto.filename}"` : '';
    const donde = tipo === 'all_players' ? 'All Players' : (_nombres.get(_audiencia) || '');

    /* Se lee la casilla y se bloquea en el mismo paso: entre leerla y
       bloquearla no puede haber un `await`. En ese hueco un clic la
       cambiaba, y el botón acababa diciendo lo contrario de lo que se
       acababa de mandar. */
    const soloAdmin = !!$('hub-only-me').checked;
    ensayo.bloquear(true);

    /* La misma regla que el servidor (comms-send, `unaPersona`): elegir
       a mano a UNA persona es escribirle a un jugador, y va sin copia
       para ti. Si no, es un aviso de grupo y la lleva. */
    const uno = pedido.segment === 'selected' && s.people === 1
      ? vista.people.find((p) => p.included) : null;
    if (!soloAdmin) {
      const seguro = await confirmModal(encuesta ? avisoEncuesta(clase, encuesta, uno, s, donde) : uno ? {
        title:   `Send this email to ${window.nombreDestinatario(uno)}?`,
        message: `"${asunto}" will be emailed to ${window.nombreDestinatario(uno)} (${uno.email})${conAdjunto}. `
               + 'This cannot be undone. To check it first, cancel and use "Send only to me".',
        okLabel: 'Send',
        cancelLabel: 'Cancel',
        danger: true,
        focusCancel: true,
      } : {
        title:   `Send to ${s.people} player${s.people === 1 ? '' : 's'}?`,
        message: `"${asunto}" will be emailed to ${s.people} player${s.people === 1 ? '' : 's'} `
               + `(${s.emails} email address${s.emails === 1 ? '' : 'es'}) in ${donde}${conAdjunto}, `
               + 'plus a copy to you. This cannot be undone. '
               + 'To check it first, cancel and use "Send only to me".',
        okLabel: `Send to ${s.people}`,
        cancelLabel: 'Cancel',
        danger: true,
        focusCancel: true,
      });
      if (!seguro) { ensayo.bloquear(false); return; }
    }

    /* Mientras se manda, el panel entero queda quieto: cambiar de
       audiencia o de texto a mitad no cambiaría el envío, pero la
       pantalla diría otra cosa que lo que salió. */
    const btn = $('hub-send-btn');
    const panel = $('hub-panel');
    btn.disabled = true;
    btn.textContent = soloAdmin ? 'Sending rehearsal to you…'
      : `Sending to ${s.emails} email${s.emails === 1 ? '' : 's'}${adjunto ? ' one by one' : ''}…`;
    panel.inert = true;
    window.AdminState.emailInFlight = true;

    let r;
    try {
      /* El ensayo va sin llave: un segundo ensayo del mismo texto tiene
         que llegar. El de verdad la lleva SIEMPRE: con la misma audiencia
         y el mismo texto, pulsar otra vez retoma el mismo envío. */
      const llave = soloAdmin ? null : await claveador.clave([
        tipo, pedido.audience_id, pedido.segment,
        (pedido.division_ids || []).join(','), (pedido.player_ids || []).join(','),
        asunto, html, adjunto ? adjunto.path : '',
        /* La encuesta también: otra pregunta u otro plazo es otro envío. */
        clase, encuesta ? JSON.stringify(encuesta.poll) : '',
      ]);
      if (!soloAdmin && !llave) {
        r = { ok: false, message: 'This browser could not prepare the send. Reload the page and try again.' };
      } else {
        r = await window.sendEmailServer({
          ...pedido,
          test_only: soloAdmin,
          ...(soloAdmin ? {} : { idempotency_key: llave }),
        }, 'comms-send');
      }
    } finally {
      window.AdminState.emailInFlight = false;
      panel.inert = false;
      btn.disabled = false;
      ensayo.bloquear(false);
      ensayo.sync();
      btn.focus();
    }

    if (!r.ok) {
      console.error('[comms-hub] send failed:', r);
      toast(r.message, true);
      if (REFRESCAR_VISTA.has(r.code)) {
        if (_segmento === 'selected') rehacerCandidatos(); else pedirVista();
      }
      return;
    }

    const d = r.data || {};
    /* Escribirle a un jugador queda anotado en el historial de su ficha,
       como cuando se hacía desde la ficha (decidido el 9 de octubre). Sólo
       si le salió de verdad; un ensayo no se anota. */
    if (!soloAdmin && uno && d.sent > 0) {
      window.logAuditAction(uno.player_id, 'email_sent', `Sent email: ${asunto}`);
    }
    if (soloAdmin) {
      ensayo.reset();
      toast(d.sent
        ? `✅ Rehearsal sent to ${CFG.ADMIN_EMAIL} only. Nobody else received it. The checkbox is now off — press Send again to send it for real.`
        : `Rehearsal did not go out: ${window.resumenEnvio(d)}`, !d.sent);
      return;
    }

    /* La llave se renueva sólo cuando el envío está TERMINADO (ver
       envioTerminado en admin-email-utils.js). Si no, se deja el texto
       como está: pulsar otra vez retoma el mismo envío. */
    if (window.envioTerminado(d) && !d.unconfirmed) {
      claveador.limpiar();
      empezarDeNuevo();
      toast(window.mensajeExito(d) + window.loQueFalto(d) + window.loQueEntro(d),
            window.huboPerdidas(d));
    } else {
      console.warn('[comms-hub] no salio limpio:', d);
      const corte = window.motivoDelCorte(d);
      toast(corte
        || `Finished: ${window.resumenEnvio(d)}. Press Send again to retry the ones that failed.`, true);
    }
    cargarHistorial();
  }

  /* La pregunta antes de mandar una encuesta: qué se pregunta, a
     cuántos, que cada uno lleva sus botones y hasta cuándo. */
  function avisoEncuesta(clase, encuesta, uno, s, donde) {
    const que = clase === 'availability' ? 'availability request' : 'poll';
    const pregunta = `"${encuesta.poll.question}"`;
    const plazo = `Answers can be changed until ${encuesta.plazoTexto} (Florida time).`;
    const comprobar = 'This cannot be undone. To check it first, cancel and use "Send only to me".';
    if (uno) {
      return {
        title: `Send this ${que} to ${window.nombreDestinatario(uno)}?`,
        message: `${pregunta} will be emailed to ${window.nombreDestinatario(uno)} (${uno.email}), `
               + `with their own private answer buttons. ${plazo} ${comprobar}`,
        okLabel: 'Send', cancelLabel: 'Cancel', danger: true, focusCancel: true,
      };
    }
    return {
      title: `Send this ${que} to ${s.people} player${s.people === 1 ? '' : 's'}?`,
      message: `${pregunta} will be emailed to ${s.people} player${s.people === 1 ? '' : 's'} `
             + `(${s.emails} email address${s.emails === 1 ? '' : 'es'}) in ${donde}, plus a sample copy to you. `
             + `Each player gets their own private answer buttons. ${plazo} ${comprobar}`,
      okLabel: `Send to ${s.people}`, cancelLabel: 'Cancel', danger: true, focusCancel: true,
    };
  }

  /* ── LO QUE YA SE LE MANDÓ A ESTA AUDIENCIA ─────────────── */
  /* Los diez últimos envíos del Hub a esta escalera, este torneo o All
     Players. Los ensayos no salen: no se le mandaron a nadie de aquí.
     Los envíos de las ventanas de antes no guardaban la audiencia, así
     que sólo están en la pestaña History. */
  async function cargarHistorial() {
    const turno = _turnoAudiencia;
    const tipo = _tipo;
    const lista = $('hub-history');
    $('hub-history-label').textContent = ROTULO_HISTORIAL[tipo] || 'Sent from the Hub';
    lista.replaceChildren(nota('hub-hist-empty', 'Loading…'));

    let filas;
    try {
      filas = await api(`communications?select=${window.commColumnasLista}`
        + `&meta->audience->>type=eq.${tipo}`
        + (tipo === 'all_players' ? '' : `&meta->audience->>id=eq.${_audiencia}`)
        + '&meta->>solo_admin=is.null&order=created_at.desc&limit=10');
    } catch (e) {
      if (turno !== _turnoAudiencia) return;
      lista.replaceChildren(nota('hub-hist-empty', 'Could not load what was sent before.'));
      return;
    }
    if (turno !== _turnoAudiencia) return;

    _historial = new Map(filas.map((f) => [String(f.id), f]));
    /* Las encuestas dicen cuántos contestaron ("2/3 responded"). Si esa
       cuenta no se puede leer, se enseña lo de siempre ("3 sent"). */
    const respuestas = await window.commLeerRespuestas(filas);
    if (turno !== _turnoAudiencia) return;
    if (!filas.length) {
      lista.replaceChildren(nota('hub-hist-empty',
        'Nothing sent from here yet. Older emails are in the History tab.'));
      return;
    }
    lista.replaceChildren(...filas.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hub-hist-row';
      b.dataset.action = 'hubOpenSend';
      b.dataset.id = String(f.id);
      const main = document.createElement('span');
      main.className = 'hub-hist-main';
      const asunto = document.createElement('span');
      asunto.className = 'hub-hist-subject';
      asunto.textContent = f.subject || '(no subject)';
      const fecha = document.createElement('span');
      fecha.className = 'hub-hist-when';
      const deEncuesta = window.commTipoEncuesta(f);
      fecha.textContent = window.commCuando(f.sent_at || f.created_at) + (deEncuesta ? ` · ${deEncuesta}` : '');
      main.append(asunto, fecha);
      const cuenta = document.createElement('span');
      cuenta.className = 'hub-hist-count';
      const n = f.sent_count || 0;
      const r = respuestas.get(String(f.id));
      cuenta.textContent = r ? `${r.responded}/${r.recipients} responded` : `${n} sent`;
      /* El mismo texto y los mismos colores que en la pestaña History,
         con clases en vez de estilos dentro del HTML. */
      const estado = document.createElement('span');
      estado.className = `pill hub-st ${ESTADOS.has(f.status) ? `hub-st-${f.status}` : ''}`;
      estado.textContent = window.commTextoEstado(f.status);
      b.append(main, cuenta, estado);
      return b;
    }));
  }

  function abrirEnvio(btn) {
    const fila = _historial.get(btn.dataset.id);
    if (fila) window.commAbrirEnvio(fila);
  }

  /* ── ABRIR EL HUB DESDE OTRA PANTALLA ───────────────────── */
  /* Los botones de correo de las demás pantallas traen aquí, con la
     audiencia ya elegida: "Notify Players" de una escalera o de un
     torneo, "Email Players" de Players, y "Send Email" de la ficha de un
     jugador. Un solo sitio para escribir a los jugadores. */

  /* Por qué no se le puede escribir a un jugador concreto. */
  const NO_SE_PUEDE = {
    inactive:      'is inactive. Inactive players don\'t receive emails — reactivate them first.',
    no_email:      'has no email on file.',
    invalid_email: 'has an email address that isn\'t valid. Fix it in their profile first.',
  };
  /* No aparece en la lista de jugadores (por ejemplo, se borró mientras
     tanto): no se inventa un motivo. */
  const NO_ESTA = 'is no longer on the players list.';

  /* En el móvil el teclado taparía la vista previa — y con ella a quién
     va el correo — así que allí no se pone el cursor en el asunto. */
  const listoParaEscribir = () => {
    $('hub-panel').scrollIntoView({ block: 'start' });
    if (window.matchMedia('(min-width: 769px)').matches) $('hub-subject').focus();
  };

  async function abrirCon(tipo, id, jugador) {
    if (window.envioEnCurso('abrir')) return;
    /* Un mensaje a medio escribir en el Hub: se pregunta. "Keep writing"
       lleva a él en vez de abrir lo nuevo. */
    if (hayBorrador()) {
      if (!(await puedeDescartar())) { window.showPage('communications'); return; }
      cerrarYa();
    }
    window.showPage('communications');
    await abrir(tipo, null);
    if (_tipo !== tipo) return;   // no se abrió (otro envío en curso)

    if (tipo !== 'all_players') {
      const sel = $('hub-audience-select');
      if (sel.disabled) return;   // la lista no cargó: cargarAudiencias ya lo dijo
      if (![...sel.options].some((o) => o.value === String(id))) {
        toast('That ladder or tournament is no longer in the list.', true);
        return;
      }
      sel.value = String(id);
      alElegirAudiencia();
      listoParaEscribir();
      return;
    }
    if (!jugador) return;

    /* Un jugador: "Selected Players" con él ya marcado. Si no se le puede
       escribir, se dice por qué en vez de dejar una lista sin nadie. */
    _elegidos = new Set([jugador.id]);
    const turno = _turnoAudiencia;
    await ponerSegmento('selected');
    /* Si entretanto ella cambió de audiencia o de destinatarios, esto ya
       no es lo que está mirando: no se pinta nada encima. */
    if (turno !== _turnoAudiencia || _segmento !== 'selected' || !_candidatos) return;
    if (_elegidos.has(jugador.id)) {
      /* Su nombre en la búsqueda: la lista enseña sólo a él, marcado,
         en vez de todos los jugadores con él perdido en medio. Borrando
         la búsqueda vuelven a verse todos. */
      $('hub-search').value = jugador.nombre;
      filtrarCandidatos();
      listoParaEscribir();
      return;
    }
    const motivo = NO_SE_PUEDE[_motivos.get(jugador.id)] || NO_ESTA;
    const texto = `${jugador.nombre} ${motivo}`;
    pintarAviso(texto);
    toast(texto, true);
  }

  window.hubAbrirCon = abrirCon;

  /* ── EVENTOS ────────────────────────────────────────────── */
  $('hub-audience-select')?.addEventListener('change', alElegirAudiencia);
  $('hub-search')?.addEventListener('input', filtrarCandidatos);
  $('hub-attach-input')?.addEventListener('change', (e) => subirAdjunto(e.target.files?.[0]));
  /* Elegir otra plantilla la pone, como en la ventana de antes. */
  $('hub-preset')?.addEventListener('change', aplicarPreset);
  /* La encuesta: cualquier cambio a mano cuenta como borrador, y la
     pregunta y el plazo escritos a mano ya no los pisa la fecha. */
  $('hub-session')?.addEventListener('change', alElegirSesion);
  $('hub-question')?.addEventListener('input', () => { _encuestaTocada = true; _preguntaSola = false; });
  $('hub-deadline')?.addEventListener('input', () => { _encuestaTocada = true; _plazoSolo = false; });
  $('hub-options')?.addEventListener('input', () => { _encuestaTocada = true; });
  $('hub-pick-list')?.addEventListener('change', (e) => {
    const caja = e.target.closest('input[type="checkbox"]');
    if (!caja) return;
    const id = Number(caja.value);
    if (caja.checked) _elegidos.add(id); else _elegidos.delete(id);
    pedirVista();
  });

  window.hubAlVolver = alVolver;

  Object.assign(window.CLICK_HANDLERS, {
    hubOpen:         (btn) => abrir(btn.dataset.audience, btn),
    hubClose:        () => cerrar(),
    hubSegment:      (btn) => ponerSegmento(btn.dataset.segment),
    hubDivision:     (btn) => cambiarDivision(btn),
    hubTogglePeople: () => verPersonas(),
    hubSend:         () => enviar(),
    hubOpenSend:     (btn) => abrirEnvio(btn),
    hubAttachPick:   () => $('hub-attach-input').click(),
    hubAttachRemove: () => quitarAdjunto(),
    hubKind:         (btn) => ponerClase(btn.dataset.kind),
    hubOptionAdd:    () => anadirRespuesta(),
    hubOptionDel:    (btn) => quitarRespuesta(btn),
    /* Los botones de las otras pantallas. */
    hubNotifyLadder: () => {
      const escalera = window.AdminState.currentLadder;
      if (!escalera) { toast('Please select a ladder first.', true); return; }
      abrirCon('ladder', escalera.id);
    },
    hubNotifyTournament: (btn) => abrirCon('tournament', Number(btn.dataset.id)),
    hubEmailAllPlayers:  () => abrirCon('all_players'),
  });
})();
