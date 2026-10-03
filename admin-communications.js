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

  /* Este archivo ya no lee ningún valor de la configuración: lo único que
     usaba era la dirección del admin, y era para la sustitución del
     reintento que se quitó.

     La comprobación se queda porque sigue siendo cierta de otra manera:
     aquí se llama a `window.api(...)`, que vive en db.js, y db.js no
     puede montar su cliente sin config.js. Si config.js no cargó, es
     mejor que esto se queje con un mensaje claro ahora que dejar que
     reviente más tarde dentro de una consulta, donde la causa real ya no
     se ve. */
  if (!window.FEROCIA_CONFIG) {
    console.error('[Ferocia] config.js debe cargar antes de admin-communications.js '
                + '(lo necesita db.js, de donde sale window.api)');
    return;
  }

  /* Cuántas filas se piden de golpe. Mismo número que la tabla de
     suscriptores, para que la aplicación se comporte igual en todas
     partes. */
  /* ── CÓMO SE RECONOCE A QUIEN SE DIO DE BAJA ───────────────
     El servidor marca esa fila con un motivo que empieza por un CÓDIGO
     fijo, y detrás una frase que se puede reescribir libremente:

         unsubscribed: la persona se dio de baja antes de que le llegara

     Aquí se compara el código, nunca la frase. Eso importa: antes se
     comparaba el texto entero, y corregir una tilde en el servidor
     habría hecho que esta pantalla dejara de reconocerlo —sin que nada
     fallara en voz alta— y esa persona volvería a aparecer como una
     dirección que rebota.

     El código vive en `CODIGO_BAJA`, en _shared/motor-envio.ts, con la
     explicación completa. Si alguna vez cambia ALLÍ, hay que cambiarlo
     aquí; la frase, no.

     Se acepta además el texto antiguo, el de antes de que existiera el
     código, por si quedan filas guardadas con él. Esa segunda condición
     se puede borrar cuando no queden. */
  const CODIGO_BAJA = 'unsubscribed';
  const esBaja = (motivo) => {
    const t = String(motivo || '').trim().toLowerCase();
    return t.startsWith(CODIGO_BAJA + ':') || t.startsWith('se dio de baja');
  };

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
  /* ¿Se LEYERON los destinatarios sin tropiezos? No es lo mismo que
     `_personas.length === 0`.

     "La lista está vacía porque este envío no apuntó a nadie" y "la
     lista está vacía porque la consulta falló" se parecen en el código y
     no se parecen en nada en la pantalla: con la primera hay que decir
     que no se puede retomar, y con la segunda decir eso sería mentir —
     puede haber 453 personas ahí que no se han podido leer. */
  let _personasOk    = false;
  let _filtroPersona = '';     // '' | 'sent' | 'failed' | 'pending'

  /* CONTRA LAS RESPUESTAS QUE LLEGAN TARDE.
     Cada petición se lleva un número. Cuando vuelve, si ese número ya no
     es el último, la respuesta se tira.

     Sin esto pasaba lo siguiente, y con dos clics: se pulsa "Failed" y
     enseguida "Sent"; la respuesta de Failed llega la segunda y se
     pinta debajo del filtro que dice Sent. La pantalla acababa
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

  /* ⚠️  DICE 'Sent', NO 'Delivered', Y ES A PROPÓSITO.
     Lo único que sabemos es que Resend ACEPTÓ el correo. Si el buzón lo
     rebota media hora después, nadie nos lo cuenta: esa vuelta la manda
     Resend a una dirección nuestra que todavía no existe (los
     "webhooks", en la lista de pendientes). Así que esta pantalla no
     puede afirmar que a alguien le llegó.

     Decía 'Delivered', en la pantalla cuyo único trabajo es decir quién
     recibió el correo. Prometer entrega sin poder comprobarla es lo que
     hace que una pantalla deje de servir para decidir. */
  const ESTADO_PERSONA = {
    sent:    { txt: 'Sent',      bg: '#eaf7f1', fg: '#1d9e68' },
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
            <th style="${TH}">Sent</th>
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
              ? `${e.sent_count} sent`
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
    if (desdeElPrincipio) { _personas = []; _personasMas = false; _personasOk = false; }

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
      _personasOk = true;
      pintarPersonas();

      /* Puede pasar que una página entera venga repetida: la lista va
         ordenada por estado, así que un reintento mueve a alguien de
         'failed' a 'sent' —del principio al final— y las posiciones se
         corren debajo de lo que ya se trajo.

         Entonces no se añade nadie y la pantalla queda EXACTAMENTE igual,
         que es justo la confusión que el contador vino a quitar. Así que
         se dice en voz alta en vez de dejarla pulsando un botón mudo. */
      if (!desdeElPrincipio && !nuevas.length) {
        window.toast('Nothing new to show — reopen this send to see the current list.');
      }
    } catch (err) {
      if (mia !== _vez) return;
      console.error('[communications] no se pudieron leer los destinatarios:', err);
      /* Se queda en falso A PROPÓSITO: no sabemos si hay destinatarios o
         no, y la fila de reintento no puede afirmar ninguna de las dos
         cosas. */
      _personasOk = false;
      const caja = document.getElementById('co-det-people');
      if (caja) caja.innerHTML = vacio('Could not load the recipients. Please try again in a moment.');
      pintarReintento();
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
            /* QUIEN SE DIO DE BAJA NO ES UNA DIRECCIÓN QUE REBOTA, y hay
               que distinguirlo en los dos sitios donde se nota.

               Al barrer a alguien que se dio de baja a mitad del envío se
               le ponen los intentos al tope — es la forma de que la
               reserva no vuelva a cogerlo—. Pero eso hacía que su fila
               dijera "se intentó 3 veces" de una persona a la que no se
               intentó NI UNA, y además enseñaba el texto interno, que
               está en español dentro de una pantalla en inglés.

               Su dirección está perfecta. Lo que pasó es que pidió que no
               se le escribiera, y eso es lo que tiene que leerse. */
            const seDioDeBaja = esBaja(p.error);
            const detalle = p.status === 'sent'
              ? `<span style="font-size:11px;color:var(--text-muted);">${window.esc(cuando(p.sent_at))}</span>`
              : seDioDeBaja
                ? '<span style="font-size:11px;color:var(--text-muted);">Unsubscribed before this went out</span>'
                : p.error
                  ? `<span style="font-size:11px;color:#c62828;">${window.esc(String(p.error).slice(0, 160))}</span>`
                  : '<span style="font-size:11px;color:var(--text-muted);">—</span>';
            /* LA ETIQUETA GENÉRICA TIENE QUE SER CIERTA PARA TODA FILA
               EN LA QUE PUEDA SALIR, y "se intentó 3 veces" no lo era.

               A quien se da de baja a mitad se le ponen los intentos al
               tope — es el truco para que la reserva no vuelva a
               cogerlo—, así que ese 3 es una señal, no una cuenta. Decir
               "se intentó 3 veces" de alguien al que no se intentó ni
               una es inventarse un hecho.

               Y no basta con tratarlo aparte cuando se reconoce el
               motivo: si algún día el texto del servidor cambia y aquí
               deja de reconocerse, la fila volvería a soltar esa
               mentira. Así que la etiqueta dice lo que SIEMPRE es
               verdad —que no se va a reintentar— y el caso reconocido
               añade el porqué. Si el reconocimiento falla, se degrada a
               algo feo pero cierto. */
            const aviso = seDioDeBaja
              ? '<div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-top:3px;">Not a bad address — they asked not to be emailed</div>'
              : agotada
                ? '<div style="font-size:10px;font-weight:700;color:var(--text-muted);margin-top:3px;">Will not be retried again</div>'
                : '';
            return `<tr ${FILA}>
              <td style="${TD}font-size:12px;color:var(--text);">${window.esc(p.email)}</td>
              <td style="${TD}white-space:nowrap;">${pastillaPersona(p.status)}</td>
              <td style="${TD}">${detalle}${aviso}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      ${pieDeLista()}`;
    pintarReintento();
  }

  /**
   * El pie de la lista: cuántos destinatarios se están viendo, y el botón
   * de traer más.
   *
   * Sólo aparece cuando hay más de una página. Para un envío de tres
   * personas un "Showing 3 of 3" no dice nada que no se vea ya.
   */
  function pieDeLista() {
    const hayPaginas = _personasMas || _personas.length > PERSONAS_POR_PAGINA;
    if (!hayPaginas) return '';

    /* El total sale de lo que el propio envío tiene guardado, sin pedir
       nada más a la base de datos. Pero esa suma SÓLO es el total de
       verdad cuando el envío está 'sent', y conviene saber por qué:

       el servidor guarda `sent_count` y `failed_count`, y una fila que se
       quedó atascada a mitad no está en ninguno de los dos. Así que en un
       envío interrumpido la suma se queda corta. Un envío de 120 personas
       que murió con 80 hechas guarda 80, y aquí habríamos dicho
       "Showing 50 of 80" — un total inventado, justo en la pantalla a la
       que se viene a averiguar a quién le falta el correo.

       Esperar a 'sent' es la garantía que hace falta, y conviene saber
       por qué sigue valiendo: ese estado quiere decir "no queda nada por
       hacer", o sea que cada fila está o enviada o dada por perdida tras
       sus tres intentos. Las dos cuentas juntas cubren entonces TODAS las
       filas, y su suma es el total de verdad.

       (Antes 'sent' quería decir "llegó a todos", que también servía. La
       aritmética aguanta el cambio; el motivo es otro. Se deja escrito
       porque un comentario que justifica algo con una razón caducada es
       como se rompe esto la próxima vez.)

       Las otras dos condiciones son de pura coherencia: si queda gente
       por traer el total tiene que ser mayor que lo que se ve, y si no
       queda nadie tiene que ser exactamente lo que se ve.

       Cuando algo de eso no se cumple se dice sólo cuántos van. Se pierde
       el "de 431", que es bonito; no se pierde la razón de ser de esto,
       que es ver que el número cambia al pulsar el botón. */
    const total = (_abierto.sent_count || 0) + (_abierto.failed_count || 0);
    const fiable = !_filtroPersona
                && _abierto.status === 'sent'
                && (_personasMas ? total > _personas.length
                                 : total === _personas.length);
    const cuenta = fiable
      ? `Showing ${_personas.length} of ${total}`
      : `Showing ${_personas.length}`;

    return `
      <div class="co-det-foot${_personasMas ? '' : ' co-det-foot-solo'}">
        <span class="co-det-count">${cuenta}</span>
        ${_personasMas ? `
        <button type="button" class="co-det-more" data-action="loadMoreCommPeople">
          Load ${PERSONAS_POR_PAGINA} more
        </button>` : ''}
      </div>`;
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

    /* ── UN ENVÍO TERMINADO CON FALLOS NO SE QUEDA CALLADO ─────
       Desde que "terminado" quiere decir "no queda nada por hacer" (y no
       "le llegó a todos"), un envío con una dirección muerta se marca
       como enviado — que es la verdad— y la fila de reintento
       desaparece, que también es correcto: no hay nada que reintentar.

       Pero desaparecer del todo deja la pregunta sin responder. Ella ve
       "Sent · 451 · 2 failed" y no sabe si esos 2 están esperando algo.
       Así que se dice: terminado, y a cuántos no se pudo llegar.

       Sin botón, porque no hay nada que pulsar. */
    if (!hayQueReintentar()) {
      const fallidos = _abierto.failed_count || 0;
      if (_abierto.status === 'sent' && fallidos > 0) {
        fila.style.display = 'flex';
        btn.style.display = 'none';
        /* El motivo se dice según lo que ESTE tipo de correo puede
           producir de verdad. Sólo el newsletter saca de la lista a quien
           se dio de baja a mitad; en una campaña ese motivo no existe, y
           nombrarlo sería inventarse una explicación. */
        const porQue = _abierto.kind === 'newsletter'
          ? 'either the mailbox rejected it three times, or the person unsubscribed before it went out'
          : 'the mailbox rejected it three times';
        txt.innerHTML = '<strong>This send is finished.</strong> '
                      + `${fallidos} address${fallidos !== 1 ? 'es' : ''} could not be reached — `
                      + `${porQue}. There is nothing left to send. `
                      + 'The list below says which, and why.';
        return;
      }
      fila.style.display = 'none';
      return;
    }

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

    /* ── LO QUE NO SE PUEDE RETOMAR, SE DICE AQUÍ ──────────────
       Una campaña SIN NINGÚN destinatario apuntado no se puede retomar:
       la lista a la que iba vivía sólo en la pestaña del navegador que
       se murió, y el servidor no tiene de dónde sacarla —no calcula
       audiencias, usa la que se le pasa—.

       Antes esto sólo se descubría al pulsar: la fila decía "Retrying
       picks up where it left off", y el clic contestaba "no hay nada que
       retomar". Un botón cuya única función es explicarse a sí mismo,
       cada vez. Y la condición que lo detectaba miraba el estado
       ('sending'), que no es el discriminador: una campaña cuyo apuntado
       falló queda en 'failed' con las cuentas a cero, y entonces el
       mensaje del clic decía "ya lo recibieron todos o se intentó tres
       veces" — de gente que no recibió nada y a la que nunca se intentó.

       El discriminador de verdad es "no hay ni una fila de
       destinatario", y la pantalla ya lo sabe: acaba de cargarlos. */
    if (_personasOk && !_personas.length && !_personasMas && !_filtroPersona) {
      btn.style.display = 'none';
      txt.innerHTML = '<strong>This send has no recipients recorded,</strong> so there is '
                    + 'nothing to pick up — it stopped before it saved the list it was meant '
                    + 'for, and that list cannot be recovered. Send it again from the screen '
                    + 'it came from.';
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
           o la campaña nunca llegó a tener destinatarios porque se murió
           antes de escribirlos.

           ── LO QUE ESTO HACÍA ANTES, Y POR QUÉ SE QUITÓ ──────────
           En el segundo caso se sustituía la lista por la dirección del
           propio admin, con el comentario de que "el servidor sabe
           arreglarlo". NO lo sabe: el servidor no tiene de dónde sacar
           la audiencia —lo dice su propia cabecera—, construye la lista
           con los destinatarios que se le pasan, y nada más.

           Así que lo que pasaba de verdad: se mandaba UN correo al
           admin, el servidor apuntaba UNA fila (la suya), cerraba la
           campaña como 'sent' con 1 de 1, y el botón de reintentar
           desaparecía para siempre. Los 453 destinatarios de verdad
           vivían sólo en la pestaña que se murió. El mensaje quedaba
           imposible de mandar a la gente para la que era, y el historial
           afirmaba que se había enviado.

           Un botón que destruye una lista de destinatarios y miente
           sobre el resultado es peor que un botón que no existe. */
        /* Se mira si hay FILAS, no el estado. Una campaña cuyo apuntado
           falló queda en 'failed' con las cuentas a cero, no en
           'sending': con la condición anterior caía en el `else` y se le
           decía "ya lo recibieron todos o se intentó tres veces" a gente
           que no recibió nada y a la que nunca se intentó. */
        const sinFilas = _personasOk && !_personas.length && !_personasMas;
        if (sinFilas) {
          window.toast('This send has no recipients recorded, so there is nothing here to '
                     + 'pick up — the list it was meant for was never saved. '
                     + 'Send it again from the screen it came from.', true);
        } else {
          window.toast('There is nobody left to retry — everyone either received it '
                     + 'or has already been tried three times.', true);
        }
        return;
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
        /* `loQueFalto` y el motivo del corte también aquí: este reintento
           usa el mismo motor que las cinco pantallas de envío y se corta
           por lo mismo. Sin esto, el reintento era la única puerta por la
           que esas dos cosas no se nombraban — y la peor, porque es la
           puerta a la que se llega justamente cuando algo ya falló. */
        const corte = window.motivoDelCorte(d);
        window.toast(corte || (window.mensajeExito(d) + window.loQueFalto(d)),
                     !!corte || !d.sent || window.huboPerdidas(d));
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
