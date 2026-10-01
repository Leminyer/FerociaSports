/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: COMMUNICATIONS
   Depende de: config.js, db.js, admin-state.js, admin-email-utils.js
   Orden de carga: admin-email-utils.js -> admin-communications.js

   Una pantalla con dos pestañas:

     · SEND     — desde dónde se manda cada cosa.
     · HISTORY  — qué se ha mandado, a quién le llegó, a quién no, y
                  por qué. Con reintento.

   ── POR QUÉ ESTA PANTALLA ─────────────────────────────────────────

   El registro de envíos existe desde el primer día del servidor: cada
   correo deja una fila con la persona, su estado y el error concreto.
   Pero no había DÓNDE mirarlo. Se escribía y no se leía.

   Y había algo peor. Cuando una campaña sale a medias, se puede
   reintentar sin duplicar a nadie — pero la llave que lo hace posible
   vivía sólo en la memoria del navegador. Cerrabas la pestaña y se
   perdía: reintentar al día siguiente le mandaba otra copia a los 448
   que ya la tenían. Aquí esa llave se lee de la base de datos, que es
   donde siempre estuvo guardada, así que el reintento funciona una
   semana después igual que a los cinco minutos.

   ── LO QUE ESTA PANTALLA NO HACE ──────────────────────────────────

   No borra nada. El registro es el libro de cuentas de a quién se le
   escribió: un botón de borrar ahí es fácil de pulsar sin querer y no
   hay forma de deshacerlo. Si algún día la tabla se hace incómoda de
   tamaño, se decide entonces y con calma.

   Tampoco escribe en la tabla. Lo único que provoca una escritura es
   el reintento, y esa la hace el servidor por el mismo camino de
   siempre — esta pantalla sólo le dice "retoma aquella".
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js debe cargar antes de admin-communications.js');
    return;
  }

  /* Cuántas filas se piden de golpe. Mismo número que la tabla de
     suscriptores, para que la aplicación se comporte igual en todas
     partes. */
  const POR_PAGINA = 25;

  /* Y cuántas personas se enseñan de un envío antes de pedir más. Una
     campaña son 460 filas: pintarlas todas de golpe deja la ventana
     pesada y no se leen igual. */
  const PERSONAS_POR_PAGINA = 50;

  /* ── ESTADO DEL MÓDULO ─────────────────────────────────────
     Todo lo que la pantalla necesita recordar entre clics. Vive aquí
     dentro, no en window: nadie más tiene por qué tocarlo. */
  let _envios        = [];     // lo que ya se ha traído del servidor
  let _hayMas        = false;  // ¿queda algo más por traer?
  let _cargando      = false;  // para que dos clics no pidan lo mismo dos veces
  let _filtroTipo    = '';     // '' = todos
  let _abierto       = null;   // el envío que está abierto en la ventana
  let _personas      = [];     // sus destinatarios
  let _personasMas   = false;
  let _filtroPersona = '';     // '' | 'sent' | 'failed' | 'pending'

  /* CONTRA LAS RESPUESTAS QUE LLEGAN TARDE.
     Cada petición se lleva un número. Cuando vuelve, si ese número ya no
     es el último, la respuesta se tira.

     Sin esto pasaba lo siguiente, y con dos clics: se pulsa "Failed" y
     enseguida "Delivered"; la respuesta de Failed llega la segunda y se
     pinta debajo del filtro que dice Delivered. La pantalla acababa
     enseñando gente que NO recibió el correo bajo la etiqueta de que sí.
     En una pantalla cuyo único trabajo es decir a quién le llegó, eso no
     es un detalle. */
  let _vez = 0;
  let _cargandoPersonas = false;

  /* ── LO QUE SE LEE DE LA BASE DE DATOS ─────────────────────
     Se piden las columnas por su nombre, no con un `*`. Así, si
     mañana la tabla gana una columna con algo que no debe salir a la
     pantalla, no aparece aquí sola. */
  /* La LISTA no pide `body`. Un cuerpo puede llevar una imagen pegada
     dentro (el editor la guarda en el propio texto), así que 25 cuerpos
     son megabytes en cada página — justo lo que la paginación venía a
     evitar. Se pide al abrir un envío, que es cuando se ve.

     `meta` sí hace falta aquí: de ahí sale la marca de "ensayo sólo a
     mí", que se enseña en la propia lista. */
  const COLS_LISTA = [
    'id', 'kind', 'subject', 'template', 'status',
    'sent_count', 'failed_count', 'created_at', 'sent_at', 'idempotency_key', 'meta',
  ].join(',');

  /* El detalle sí los necesita: el mensaje se enseña, y `meta` viaja en
     el reintento para que el correo se reconstruya igual. */
  const COLS_ENVIO = COLS_LISTA + ',body';

  /* `vars` se pedía aquí y no se usaba. Es un JSON por persona, así que
     eran cuatrocientos trozos de texto cargados en cada página de la
     lista para nada. El reintento sí lo necesita, y se lo pide él solo
     cuando toca. */
  const COLS_PERSONA = ['id', 'email', 'status', 'error', 'sent_at', 'attempts'].join(',');

  /* Los nombres que ve ella. En la base de datos son etiquetas
     técnicas; aquí se llaman como los llama la aplicación. */
  const NOMBRE_TIPO = {
    promo:              'Campaign',
    ladder_notify:      'Ladder Update',
    tournament_notify:  'Tournament Update',
    players_broadcast:  'All Players',
    player_message:     'Single Player',
    subscriber_confirm: 'Confirmation',
    newsletter:         'Newsletter',
  };

  const COLOR_TIPO = {
    promo:              { bg: '#e8f0ff', fg: '#174CCC' },
    ladder_notify:      { bg: '#eaf7f1', fg: '#1d9e68' },
    tournament_notify:  { bg: '#fff4e5', fg: '#b26a00' },
    players_broadcast:  { bg: '#f0ecff', fg: '#5b42c4' },
    player_message:     { bg: '#f4f5f8', fg: '#6b7a99' },
    subscriber_confirm: { bg: '#e8f7fb', fg: '#0b7f98' },
    newsletter:         { bg: '#fdf0f6', fg: '#a3316f' },
  };

  const ESTADO_ENVIO = {
    sent:    { txt: 'Sent',      bg: '#eaf7f1', fg: '#1d9e68' },
    partial: { txt: 'Partial',   bg: '#fff4e5', fg: '#b26a00' },
    failed:  { txt: 'Failed',    bg: '#fdeceb', fg: '#c62828' },
    sending: { txt: 'Sending…',  bg: '#e8f0ff', fg: '#174CCC' },
  };

  const ESTADO_PERSONA = {
    sent:    { txt: 'Delivered', bg: '#eaf7f1', fg: '#1d9e68' },
    failed:  { txt: 'Failed',    bg: '#fdeceb', fg: '#c62828' },
    pending: { txt: 'Pending',   bg: '#f4f5f8', fg: '#6b7a99' },
    sending: { txt: 'Sending…',  bg: '#e8f0ff', fg: '#174CCC' },
  };

  /* Tres intentos y la dirección se deja en paz. Es la misma regla que
     aplica el servidor (MAX_INTENTOS); está escrita aquí para poder
     avisar ANTES de que ella pulse un botón que no va a hacer nada. */
  const MAX_INTENTOS = 3;

  // ── AYUDAS DE PINTADO ─────────────────────────────────────

  /** La etiqueta de color de siempre, con la misma forma que las demás. */
  const pastilla = (txt, c) =>
    `<span style="font-size:9px;font-weight:800;padding:3px 9px;border-radius:99px;`
    + `letter-spacing:.5px;text-transform:uppercase;display:inline-block;line-height:1.4;`
    + `background:${c.bg};color:${c.fg};">${window.esc(txt)}</span>`;

  const pastillaTipo = (k) => {
    const c = COLOR_TIPO[k] || { bg: '#f4f5f8', fg: '#6b7a99' };
    return pastilla(NOMBRE_TIPO[k] || k, c);
  };

  const pastillaEstado = (s) => {
    const e = ESTADO_ENVIO[s] || { txt: s, bg: '#f4f5f8', fg: '#6b7a99' };
    return pastilla(e.txt, e);
  };

  const pastillaPersona = (s) => {
    const e = ESTADO_PERSONA[s] || { txt: s, bg: '#f4f5f8', fg: '#6b7a99' };
    return pastilla(e.txt, e);
  };

  /** Fecha corta y hora. Lo que hace falta para reconocer un envío. */
  const cuando = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
         + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const TH = 'font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;'
           + 'color:var(--text);padding:10px 16px;text-align:left;'
           + 'border-bottom:0.5px solid #e0e7f5;background:#fafbff;';
  const TD = 'padding:11px 16px;border-bottom:0.5px solid #f4f5f8;';

  /** Una fila que se ilumina al pasar por encima, como las demás tablas. */
  const FILA = 'onmouseover="this.querySelectorAll(\'td\').forEach(t=>t.style.background=\'rgba(23,76,204,0.025)\')"'
             + ' onmouseout="this.querySelectorAll(\'td\').forEach(t=>t.style.background=\'\')"';

  const vacio = (txt) =>
    `<div class="empty" style="padding:44px 20px;text-align:center;font-size:13px;color:var(--text-muted);">${window.esc(txt)}</div>`;

  const cargando = (txt) =>
    `<div class="loading" style="padding:20px;">${window.esc(txt)}</div>`;

  // ── PESTAÑAS ──────────────────────────────────────────────

  /**
   * Cambia de pestaña. Mismo comportamiento que las de la ficha de
   * jugador: la de abajo se pinta la primera vez que se abre, no al
   * cargar la página, para no pedir datos que quizá no se miren.
   */
  function mostrarTab(cual) {
    document.querySelectorAll('#page-communications .co-tab').forEach((b) => {
      b.classList.toggle('pp-tab-on', b.dataset.tab === cual);
    });
    document.querySelectorAll('#page-communications .co-tab-content').forEach((c) => {
      c.style.display = c.dataset.tab === cual ? '' : 'none';
    });
    /* Se vuelve a leer CADA vez que se entra, no sólo la primera.
       Antes: abrir History, ir a Promotions, mandar una campaña, volver
       a History… y la campaña recién mandada no estaba. Para alguien
       que no sabe que hay una caché por medio, eso significa que el
       envío no quedó registrado. */
    if (cual === 'history') cargarEnvios(true);
  }

  // ── PESTAÑA HISTORIAL: LA LISTA ───────────────────────────

  /**
   * Trae una página de envíos DEL SERVIDOR.
   *
   * La otra tabla de la aplicación (suscriptores) se trae las filas
   * todas de una vez y luego enseña 25. Con 460 suscriptores eso va
   * bien. Aquí no: esta tabla crece con CADA correo que se manda, así
   * que traerla entera para enseñar 25 filas sería más pesada cada
   * semana. Se pide sólo el trozo que se va a ver.
   *
   * Se piden 26 para saber si queda una página más, y se enseñan 25.
   * Es una fila de más en vez de una segunda consulta para contar.
   *
   * @param {boolean} desdeElPrincipio  true al abrir o al filtrar
   */
  async function cargarEnvios(desdeElPrincipio) {
    const mia = ++_vez;
    _cargando = true;

    if (desdeElPrincipio) { _envios = []; _hayMas = false; }

    const caja = document.getElementById('co-hist-table');
    if (desdeElPrincipio && caja) caja.innerHTML = cargando('Loading history...');

    const filtro = _filtroTipo ? `&kind=eq.${encodeURIComponent(_filtroTipo)}` : '';
    const ruta = `communications?select=${COLS_LISTA}${filtro}`
               + `&order=created_at.desc&limit=${POR_PAGINA + 1}&offset=${_envios.length}`;

    try {
      const filas = await window.api(ruta);
      /* Si mientras se esperaba se cambió el filtro o se volvió a pedir,
         esta respuesta ya no vale: pintarla dejaría la tabla diciendo
         una cosa y el desplegable otra. */
      if (mia !== _vez) return;
      if (!Array.isArray(filas)) throw new Error('unexpected_response');

      _hayMas = filas.length > POR_PAGINA;
      /* Se descartan las que ya están.
         Las páginas se piden por posición ("dame desde la 25"), así que
         si mientras tanto se manda un correo nuevo, todo baja un puesto
         y la fila 25 se vuelve a pedir. Sin esto, el mismo envío salía
         dos veces — y justo en la pantalla que existe para llevar la
         cuenta de lo que se mandó. */
      const yaEstan = new Set(_envios.map((x) => String(x.id)));
      const nuevas = filas.slice(0, POR_PAGINA).filter((x) => !yaEstan.has(String(x.id)));
      _envios = _envios.concat(nuevas);
      pintarEnvios();
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[communications] no se pudo leer el historial:', err);
      /* El mensaje técnico va a la consola, no a la pantalla. "JWT
         expired" o "PGRST116" no le dicen nada a nadie. */
      if (caja) caja.innerHTML = vacio('Could not load the history. Please try again in a moment.');
      pintarPie();
    } finally {
      /* En `finally` a propósito: si esto no se limpia, la pantalla se
         queda en "Loading history..." para siempre y ni el filtro ni el
         botón de traer más vuelven a funcionar. Sólo recarga la página. */
      if (mia === _vez) _cargando = false;
    }
  }

  function pintarEnvios() {
    const caja = document.getElementById('co-hist-table');
    if (!caja) return;

    if (!_envios.length) {
      /* "Vacío" puede significar dos cosas muy distintas: que de verdad
         no hay nada, o que tu cuenta perdió el permiso de admin (en ese
         caso la base de datos contesta "cero filas", no "no puedes").
         Decir sólo lo primero sería tranquilizador y falso, así que se
         nombra la segunda posibilidad sin alarmar. */
      caja.innerHTML = vacio(_filtroTipo
        ? 'No sends of this type yet.'
        : 'Nothing has been sent yet. Anything you send from now on will show up here. '
          + '(If you were expecting to see past sends here, check that your admin access is still active.)');
      pintarPie();
      return;
    }

    caja.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="${TH}">When</th>
            <th style="${TH}">Type</th>
            <th style="${TH}">Subject</th>
            <th style="${TH}">Delivered</th>
            <th style="${TH}">Status</th>
            <th style="${TH}text-align:right;">&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          ${_envios.map((e) => {
            /* NO se inventa un total.
               Antes ponía "455 of 460" sumando enviados + fallidos. Esa
               suma NO es cuánta gente había: quien se quedó a medias no
               es ni lo uno ni lo otro, así que desaparecía del total. Una
               campaña con 400 enviados, 10 fallidos y 50 colgados salía
               como "400 of 410" — parecía casi perfecta, y cincuenta
               personas no aparecían por ningún lado.
               El servidor arregló exactamente este error en su día; no
               vamos a reintroducirlo aquí. Se enseña lo que se sabe. */
            const entrega = e.sent_count
              ? `${e.sent_count} delivered`
              : (e.status === 'sending' ? 'in progress' : '—');
            const fallos = e.failed_count
              ? `<div style="font-size:10px;font-weight:700;color:#c62828;margin-top:2px;">${e.failed_count} failed</div>`
              : '';
            return `<tr ${FILA}>
              <td style="${TD}font-size:12px;color:var(--text-muted);white-space:nowrap;">${window.esc(cuando(e.sent_at || e.created_at))}</td>
              <td style="${TD}white-space:nowrap;">${pastillaTipo(e.kind)}${
                /* El ensayo "Send only to me" queda marcado en `meta`. Sin
                   esta etiqueta, la prueba y la campaña de verdad salen
                   como dos filas idénticas con el mismo asunto. */
                (e.meta && e.meta.solo_admin)
                  ? ' ' + pastilla('Test', { bg: '#f4f5f8', fg: '#6b7a99' })
                  : ''}</td>
              <td style="${TD}font-size:13px;font-weight:700;color:var(--text);">${window.esc(e.subject || '(no subject)')}</td>
              <td style="${TD}font-size:12px;color:var(--text-muted);white-space:nowrap;">${window.esc(entrega)}${fallos}</td>
              <td style="${TD}white-space:nowrap;">${pastillaEstado(e.status)}</td>
              <td style="${TD}text-align:right;white-space:nowrap;">
                <button class="btn btn-outline btn-sm" data-action="openCommDetail" data-commid="${e.id}"
                        style="font-size:10px;font-weight:700;padding:6px 14px;border-radius:99px;border:0.5px solid #c5d6f5;background:white;color:var(--blue);cursor:pointer;">View</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    pintarPie();
  }

  /** La fila de abajo: cuántas se ven y el botón de traer más. */
  function pintarPie() {
    const fila = document.getElementById('co-hist-more-row');
    const info = document.getElementById('co-hist-info');
    const btn  = document.getElementById('co-hist-more-btn');
    if (!fila || !info || !btn) return;

    if (!_envios.length) { fila.style.display = 'none'; return; }
    fila.style.display = 'flex';
    /* NO se dice "de N": para saber el total habría que contar la tabla
       entera en cada carga, y esa cuenta se vuelve cara justo cuando la
       tabla crece. Se dice lo que se sabe con certeza. */
    info.textContent = `Showing ${_envios.length} send${_envios.length === 1 ? '' : 's'}`
                     + (_hayMas ? '' : ' — that’s all of them');
    btn.style.display = _hayMas ? '' : 'none';
    btn.textContent = `Load ${POR_PAGINA} more`;
    btn.disabled = false;
  }

  // ── PESTAÑA HISTORIAL: EL DETALLE ─────────────────────────

  /* ── EL CUERPO DEL CORREO, LIMPIO ANTES DE ENSEÑARLO ──────
     Es la primera vez que un mensaje guardado se vuelve a pintar como
     HTML vivo dentro de la sesión de un admin. El editor no limpia
     nada: lo que se pega desde una página web se guarda tal cual, y
     eso puede traer una imagen con un `onerror` que se ejecuta al
     pintarla. `innerHTML` no corre un <script>, pero sí corre eso.

     Se hace lo mínimo que cierra el agujero sin cambiar cómo se ve:
     fuera los <script>/<style>/<iframe>, fuera cualquier atributo que
     empiece por `on`, y fuera los enlaces que no sean http(s). */
  function limpiarCuerpo(html) {
    const caja = document.createElement('div');
    caja.innerHTML = String(html == null ? '' : html);
    caja.querySelectorAll('script,style,iframe,object,embed,link,meta,form,base')
        .forEach((n) => n.remove());
    caja.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((a) => {
        const nom = a.name.toLowerCase();
        if (nom.startsWith('on')) { n.removeAttribute(a.name); return; }
        if ((nom === 'href' || nom === 'src' || nom === 'xlink:href')
            && !/^(https?:|mailto:|cid:|data:image\/)/i.test(a.value.trim())) {
          n.removeAttribute(a.name);
        }
      });
    });
    return caja.innerHTML;
  }

  /** Abre un envío: el mensaje que se escribió y a quién le llegó. */
  async function abrirDetalle(id) {
    const enLista = _envios.find((x) => String(x.id) === String(id));
    if (!enLista) { window.toast('That send is no longer on screen. Reload the list.', true); return; }

    const mia = ++_vez;
    _abierto = enLista;
    _personas = [];
    _personasMas = false;
    _filtroPersona = '';

    document.getElementById('co-det-subject').textContent = enLista.subject || '(no subject)';
    document.getElementById('co-det-meta').innerHTML =
      `${pastillaTipo(enLista.kind)} <span style="font-size:11px;font-weight:600;color:var(--text-muted);margin-left:8px;">${window.esc(cuando(enLista.sent_at || enLista.created_at))}</span>`;
    document.getElementById('co-det-body').innerHTML = cargando('Loading message...');

    document.querySelectorAll('#co-det-filters .co-pfilter').forEach((b) => {
      b.classList.toggle('co-pfilter-on', (b.dataset.pf || '') === '');
    });

    document.getElementById('co-det-people').innerHTML = cargando('Loading recipients...');
    document.getElementById('co-det-retry-row').style.display = 'none';
    document.getElementById('communications-detail-modal').classList.add('open');

    /* El cuerpo NO viene en la lista (son megabytes por página), así que
       se pide aquí, para este envío y sólo cuando se abre. */
    try {
      const filas = await window.api(
        `communications?select=${COLS_ENVIO}&id=eq.${encodeURIComponent(enLista.id)}&limit=1`);
      if (mia !== _vez) return;
      if (Array.isArray(filas) && filas[0]) {
        _abierto = filas[0];
        const k = _envios.findIndex((x) => String(x.id) === String(filas[0].id));
        if (k !== -1) _envios[k] = Object.assign({}, _envios[k], filas[0]);
      }
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[communications] no se pudo leer el envio:', err);
    }
    if (mia !== _vez) return;

    document.getElementById('co-det-body').innerHTML =
      _abierto.body
        ? limpiarCuerpo(_abierto.body)
        : '<em style="color:var(--text-muted);">(no message body)</em>';

    await cargarPersonas(true);
  }

  function cerrarDetalle() {
    /* A diferencia de las ventanas donde se ESCRIBE un correo, ésta sólo
       lee: no hay nada que perder al cerrarla. Bloquearla mientras corre
       un envío de otra pantalla dejaba a la persona encerrada aquí sin
       motivo. */
    _vez++;   // lo que venga en camino ya no se pinta
    document.getElementById('communications-detail-modal').classList.remove('open');
    _abierto = null;
    _personas = [];
  }

  /** Trae una página de destinatarios del envío abierto. */
  async function cargarPersonas(desdeElPrincipio) {
    if (!_abierto) return;
    if (_cargandoPersonas) return;
    _cargandoPersonas = true;

    const mia = _vez;
    const deQuien = _abierto.id;
    if (desdeElPrincipio) { _personas = []; _personasMas = false; }

    const filtro = _filtroPersona ? `&status=eq.${encodeURIComponent(_filtroPersona)}` : '';
    const ruta = `communication_recipients?select=${COLS_PERSONA}`
               + `&communication_id=eq.${encodeURIComponent(deQuien)}${filtro}`
               /* Los que fallaron primero: son los que hay que mirar.
                  Un listado alfabético obligaría a buscarlos a mano
                  entre cuatrocientos que salieron bien. */
               + `&order=status.asc,email.asc`
               + `&limit=${PERSONAS_POR_PAGINA + 1}&offset=${_personas.length}`;

    try {
      const filas = await window.api(ruta);
      /* Que siga abierto EL MISMO envío y que no se haya cambiado el
         filtro por el camino. Si no, esta respuesta pertenece a otra
         pregunta y pintarla sería mentir. */
      if (mia !== _vez || !_abierto || _abierto.id !== deQuien) return;
      if (!Array.isArray(filas)) throw new Error('unexpected_response');

      _personasMas = filas.length > PERSONAS_POR_PAGINA;
      /* Igual que arriba: un reintento cambia el estado de alguien, y
         como la lista va ordenada por estado, las posiciones se mueven. */
      const yaEstan = new Set(_personas.map((x) => String(x.id)));
      const nuevas = filas.slice(0, PERSONAS_POR_PAGINA).filter((x) => !yaEstan.has(String(x.id)));
      _personas = _personas.concat(nuevas);
      pintarPersonas();
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[communications] no se pudieron leer los destinatarios:', err);
      const caja = document.getElementById('co-det-people');
      if (caja) caja.innerHTML = vacio('Could not load the recipients. Please try again in a moment.');
    } finally {
      _cargandoPersonas = false;
    }
  }

  /* El botón de "traer más" se pinta SIN `disabled`.

     Este HTML se genera dentro de la carga, cuando la bandera de
     "cargando" todavía está levantada, así que ponerlo ahí hacía que el
     botón naciera apagado y no se encendiera jamás. El doble clic ya lo
     para cargarPersonas(), que levanta la bandera de forma inmediata,
     antes de cualquier espera. */
  function pintarPersonas() {
    const caja = document.getElementById('co-det-people');
    if (!caja) return;

    if (!_personas.length) {
      caja.innerHTML = vacio(_filtroPersona
        ? 'Nobody in this send has that status.'
        : 'This send has no recipients recorded.');
      pintarReintento();
      return;
    }

    caja.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="${TH}">Recipient</th>
            <th style="${TH}">Status</th>
            <th style="${TH}">Detail</th>
          </tr>
        </thead>
        <tbody>
          ${_personas.map((p) => {
            /* El motivo del fallo es EL dato que esta pantalla vino a
               enseñar. Si la dirección ya agotó los intentos se dice
               aquí, y no después de que ella pulse reintentar. */
            const agotada = (p.attempts || 0) >= MAX_INTENTOS && p.status !== 'sent';
            const detalle = p.status === 'sent'
              ? `<span style="font-size:11px;color:var(--text-muted);">${window.esc(cuando(p.sent_at))}</span>`
              : p.error
                ? `<span style="font-size:11px;color:#c62828;">${window.esc(String(p.error).slice(0, 160))}</span>`
                : '<span style="font-size:11px;color:var(--text-muted);">—</span>';
            const aviso = agotada
              ? `<div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-top:3px;">Tried ${p.attempts} times — will not retry again</div>`
              : '';
            return `<tr ${FILA}>
              <td style="${TD}font-size:12px;color:var(--text);">${window.esc(p.email)}</td>
              <td style="${TD}white-space:nowrap;">${pastillaPersona(p.status)}</td>
              <td style="${TD}">${detalle}${aviso}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${_personasMas ? `
        <div style="padding:12px 16px;border-top:0.5px solid var(--divider-color);text-align:center;">
          <button data-action="loadMoreCommPeople"
                  style="font-size:10px;font-weight:700;padding:7px 18px;border-radius:99px;border:0.5px solid #c5d6f5;background:white;color:var(--blue);cursor:pointer;">
            Load ${PERSONAS_POR_PAGINA} more
          </button>
        </div>` : ''}`;
    pintarReintento();
  }

  // ── EL REINTENTO ──────────────────────────────────────────

  /**
   * ¿Queda alguien a quien se le pueda volver a intentar?
   *
   * Se mira sobre lo que se ha traído. Si la lista está filtrada o
   * paginada puede haber más abajo, así que el botón NO promete un
   * número: dice que quedan pendientes, y el servidor decide a quién
   * coge de verdad.
   */
  function hayQueReintentar() {
    if (!_abierto) return false;
    /* 'sending' CUENTA, y es el caso que más importa.

       Un envío se queda en 'sending' cuando la ejecución se murió a
       mitad: se creó la campaña y falló lo siguiente, o el servidor
       tardó más de la cuenta. Entonces sent_count y failed_count valen
       cero los dos — así que mirar sólo esos contadores dejaba fuera
       exactamente los envíos que hay que rescatar.

       El servidor tiene una red de seguridad para esto (recoge las
       filas que se quedaron colgadas), pero sólo se activa cuando
       alguien reintenta. Si esta pantalla no lo ofrece, esa red no se
       usa nunca y la campaña se queda en "Sending…" para siempre. */
    if (_abierto.status === 'sent') return false;
    return _abierto.status === 'sending'
        || _abierto.status === 'partial'
        || _abierto.status === 'failed'
        || (_abierto.failed_count || 0) > 0;
  }

  /* Los tipos de envío que NUNCA llevan llave, por decisión y no por
     ser antiguos: el mensaje a un jugador se manda a propósito más de
     una vez, y el ensayo "solo a mí" va sin llave para que repetirlo
     siempre llegue.

     El recordatorio de confirmación SALIÓ de esta lista: desde que
     vive en admin-subscriber-reminder.js sí lleva llave, así que se
     puede reintentar desde aquí. Los recordatorios anteriores a ese
     cambio siguen sin llave y caen en el mensaje genérico de abajo,
     que para ellos es cierto. */
  const SIN_LLAVE_A_PROPOSITO = new Set(['player_message']);

  function pintarReintento() {
    const fila = document.getElementById('co-det-retry-row');
    const txt  = document.getElementById('co-det-retry-text');
    const btn  = document.getElementById('co-det-retry-btn');
    if (!fila || !txt || !btn || !_abierto) return;

    if (!hayQueReintentar()) { fila.style.display = 'none'; return; }

    fila.style.display = 'flex';

    /* El newsletter se reintenta desde SU pantalla, no desde aquí.
       Tiene llave, así que sin esto saldría el botón — y ese botón
       llama al motor de envío general, que no sabe armar un newsletter.
       Su propia función sí sabe reanudarlo sin duplicar a nadie. */
    if (_abierto.kind === 'newsletter') {
      btn.style.display = 'none';
      txt.innerHTML = '<strong>This is a newsletter.</strong> '
                    + 'Finish it from the Newsletter screen: pressing Send there normally picks up '
                    + 'only the people who did not get it. If the last send warned that some emails '
                    + 'went out <em>without being recorded</em>, check before pressing — those people '
                    + 'would get it twice.';
      return;
    }

    if (!_abierto.idempotency_key) {
      /* Sin llave guardada no se puede retomar: el servidor abriría una
         campaña NUEVA y le volvería a escribir a quien ya la tenía.

         Pero el MOTIVO importa, y antes este mensaje se lo inventaba.
         Decía "se mandó antes de que los reintentos existieran" incluso
         para un mensaje a un jugador de hace cinco minutos, que nunca
         lleva llave por diseño. Decir algo falso aquí enseña a no
         fiarse de esta pantalla. */
      btn.style.display = 'none';
      const esEnsayo = _abierto.meta && _abierto.meta.solo_admin;
      if (esEnsayo) {
        txt.innerHTML = '<strong>This was a test send to yourself.</strong> '
                      + 'There is nothing to retry — send it again from its own screen when you are ready.';
      } else if (SIN_LLAVE_A_PROPOSITO.has(_abierto.kind)) {
        txt.innerHTML = '<strong>This kind of email is not retried from here.</strong> '
                      + 'Send it again from the screen it came from — it is meant to be sent more than once.';
      } else {
        txt.innerHTML = '<strong>This send cannot be retried.</strong> '
                      + 'It has no resume key, so sending it again would email everyone a second time.';
      }
      return;
    }

    btn.style.display = '';
    if (_abierto.status === 'sending') {
      /* Se distingue a propósito: "no llegó a nadie" no es lo mismo que
         "le faltaron unos pocos", y la acción que hay que tomar es más
         urgente. */
      txt.innerHTML = '<strong>This send stopped before it finished.</strong> '
                    + 'Retrying picks up where it left off — nobody who already received it will get it twice.';
    } else {
      txt.innerHTML = 'Some people did not get this email. Retrying picks up <strong>only</strong> those — '
                    + 'nobody who already received it will get it twice.';
    }
  }

  /**
   * Reintenta el envío abierto.
   *
   * La pieza que lo hace seguro es `idempotency_key`: el servidor ve
   * que ya conoce esa llave, RETOMA aquella misma campaña en vez de
   * crear otra, y sólo coge las filas que no están 'sent'. Por eso se
   * manda la llave GUARDADA y no una nueva.
   */
  async function reintentar() {
    /* El newsletter no se reintenta desde aquí: su motor es otro. El
       botón ya está oculto, pero que la garantía no dependa de una
       propiedad de estilo. */
    if (_abierto && _abierto.kind === 'newsletter') return;
    if (!_abierto || !_abierto.idempotency_key) return;
    if (window.envioEnCurso && window.envioEnCurso()) return;

    const btn = document.getElementById('co-det-retry-btn');
    /* El botón se apaga AQUÍ, antes de la pregunta. Antes se apagaba
       después de dos esperas (la confirmación y una consulta), y en ese
       hueco un segundo clic colaba otro reintento: los dos escribían la
       bandera global de "envío en curso" y el primero en terminar la
       apagaba, dejando al resto del admin sin protección a mitad. */
    if (btn.disabled) return;
    btn.disabled = true;
    const original = btn.innerHTML;

    const e = _abierto;
    try {
      const seguro = await window.confirmModal({
        title:   'Retry this send?',
        message: `"${e.subject || '(no subject)'}" will be sent again, but only to the people who did not `
               + 'receive it. Everyone who already got it will be skipped.'
               + ' Addresses that have already failed three times are not tried again.',
        okLabel: 'Retry',
        cancelLabel: 'Cancel',
      });
      if (!seguro) return;

      /* Los destinatarios salen de lo que está GUARDADO, no de lo que se
         calculó el día del envío. Volver a consultar la lista de
         suscriptores daría una lista distinta: los que se dieron de alta
         después entrarían en una campaña que no era para ellos. */
      let pendientes = [];
      try {
        pendientes = await window.api(
          `communication_recipients?select=email,vars&communication_id=eq.${encodeURIComponent(e.id)}`
          + `&status=neq.sent&attempts=lt.${MAX_INTENTOS}&limit=1000`) || [];
      } catch (err) {
        console.error('[communications] no se pudo leer quien falta:', err);
        window.toast('Could not check who is still pending. Please try again in a moment.', true);
        return;
      }

      if (!pendientes.length) {
        /* Que no haya filas pendientes tiene DOS causas muy distintas, y
           confundirlas sería mentir: o ya se intentó todo lo intentable,
           o la campaña nunca llegó a tener destinatarios (se murió antes
           de escribirlos). En el segundo caso el servidor SÍ sabe
           arreglarlo, así que se le manda igual. */
        if (e.status === 'sending' && !(e.sent_count || 0) && !(e.failed_count || 0)) {
          pendientes = [{ email: CFG.ADMIN_EMAIL, vars: {} }];
        } else {
          window.toast('There is nobody left to retry — everyone either received it '
                     + 'or has already been tried three times.', true);
          return;
        }
      }

      btn.innerHTML = `Retrying ${pendientes.length}...`;
      window.AdminState.emailInFlight = true;

      let r;
      try {
        r = await window.sendEmailServer({
          kind:     e.kind,
          template: e.template,
          subject:  e.subject || '',
          body:     e.body || '',
          meta:     e.meta || {},
          recipients: pendientes.map((p) => ({ email: p.email, vars: p.vars || {} })),
          /* LA LLAVE GUARDADA. Esto es lo que convierte un reenvío en un
             reintento. */
          idempotency_key: e.idempotency_key,
        });
      } finally {
        window.AdminState.emailInFlight = false;
      }

      if (!r.ok) {
        console.error('[communications] el reintento fallo:', r);
        window.toast(r.message, true);
      } else {
        const d = r.data || {};
        window.toast(window.mensajeExito(d), !d.sent);
      }

      /* Se vuelve a leer SIEMPRE, salga bien o mal.
         Cuando el servidor tarda más de la cuenta, la petición se corta
         pero el envío puede seguir su curso allí. Dejando la pantalla
         como estaba, ella leía "no se pudo conectar" junto a la misma
         lista de fallos de antes y concluía que no había pasado nada —
         cuando quizá ya habían salido todos. */
      await refrescarAbierto();

    } catch (err) {
      console.error('[communications] error inesperado en el reintento:', err);
      window.toast('Something went wrong. Please try again in a moment.', true);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  /** Vuelve a leer el envío abierto y sus destinatarios. */
  async function refrescarAbierto() {
    if (!_abierto) return;
    try {
      const filas = await window.api(
        `communications?select=${COLS_ENVIO}&id=eq.${encodeURIComponent(_abierto.id)}&limit=1`) || [];
      if (filas[0]) {
        _abierto = filas[0];
        const i = _envios.findIndex((x) => String(x.id) === String(filas[0].id));
        if (i !== -1) _envios[i] = filas[0];
        pintarEnvios();
      }
    } catch (err) {
      console.error('[communications] no se pudo releer el envio:', err);
    }
    await cargarPersonas(true);
  }

  // ── REGISTRO ──────────────────────────────────────────────

  window.openCommunications = () => {
    /* Al abrir la pantalla se enseña SEND, que es lo que se viene a
       hacer la mayoría de las veces. El historial se carga cuando se
       pincha su pestaña, no antes. */
    mostrarTab('send');
  };

  Object.assign(window.CLICK_HANDLERS, {
    commShowTab:        (btn) => mostrarTab(btn.dataset.tab),
    openCommDetail:     (btn) => abrirDetalle(btn.dataset.commid),
    closeCommDetail:    () => cerrarDetalle(),
    loadMoreCommPeople: () => cargarPersonas(false),
    retryComm:          () => reintentar(),
    filterCommPeople:   (btn) => {
      if (_cargandoPersonas) return;   // dos clics seguidos no se pisan
      _filtroPersona = btn.dataset.pf || '';
      document.querySelectorAll('#co-det-filters .co-pfilter').forEach((b) => {
        b.classList.toggle('co-pfilter-on', (b.dataset.pf || '') === _filtroPersona);
      });
      document.getElementById('co-det-people').innerHTML = cargando('Loading...');
      cargarPersonas(true);
    },
  });

  document.getElementById('co-hist-type-filter')?.addEventListener('change', (ev) => {
    _filtroTipo = ev.target.value || '';
    /* Sin guardia de `_cargando`: cargarEnvios se lleva su propio número
       de vez y descarta la respuesta anterior. Antes se abandonaba la
       petición nueva y se pintaba la vieja, así que el desplegable decía
       "Campaign" y la tabla enseñaba de todo. */
    cargarEnvios(true);
  });

  document.getElementById('co-hist-more-btn')?.addEventListener('click', () => cargarEnvios(false));
})();
