/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PROMOTIONS
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-state.js -> admin-email-utils.js ->
               admin-promotions.js -> app.js

   Extracted from app.js's PROMOTIONS section.

   ── EL ENVÍO PASA POR EL SERVIDOR ─────────────────────────────────
   Manda con sendEmailServer() de admin-email-utils.js, que llama a la
   Edge Function `send-email`. Usa AdminState.emailInFlight para que
   salir de la pantalla a media campaña pueda avisar.

   Lo que eso significa aquí:
     · Una sola petición para toda la campaña, no una por persona.
     · El mensaje se manda CRUDO: quien sustituye el nombre de cada
       persona es la plantilla del servidor, no este archivo.
     · La campaña queda registrada en `communications` y cada
       destinatario en `communication_recipients`. De ahí sale también
       la tarjeta "Last Campaign".

   Hay UN solo camino de envío, a propósito: el botón Launch. La casilla
   "Send only to me" no es un camino aparte — es el mismo envío con la
   lista reducida a una dirección, para poder ensayarlo. Antes había
   además un botón de prueba que iba por otro lado y no dejaba
   registro; se quitó porque dos caminos que parecen lo mismo y no lo
   son es como se cuela un fallo sin que nadie lo vea.

   _subsShown is local module state (how many subscriber rows are
   currently shown) — the status-filter and search inputs need to reset
   it and re-render on every keystroke/change, so this file wires those
   two listeners itself instead of leaving them in app.js's BOOT trying
   to reach into a private variable in a different closure.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before admin-promotions.js');
    return;
  }
  const AdminState = window.AdminState;

  /* ─── PROMOTIONS ───────────────────────────────────────── */

  // ── Promotions page state ─────────────────────────────────────────────
  let _allSubs       = [];
  /* Keys of everyone who is already a player, so each subscriber row can
     show the right icon without a lookup per row. Built once per load. */
  let _playerIndex   = new Map();
  /* La ficha completa de esos mismos jugadores, para los datos que se
     MUESTRAN aquí pero cuya verdad vive en la tabla de players.

     Por qué existe este segundo mapa en vez de ampliar _playerIndex:
     _playerIndex guarda sólo el id y de él dependen el iconito de
     convertir y el aviso de duplicado, que funcionan. Cambiarle la
     forma obligaría a tocar esos tres sitios. Los dos mapas se
     construyen del mismo array, en la misma vuelta: no hay una segunda
     consulta ni coste real. */
  let _playerByKey   = new Map();
  let _subsShown     = 25;
  /* 'month' | 'all' — qué periodo muestra el resumen por origen. No
     afecta a la tabla: el resumen responde "¿de dónde vino la gente?",
     la tabla responde "¿quién es?". Son dos preguntas distintas. */
  let _summaryPeriod = 'month';
  /* ─── ORIGEN DEL SUSCRIPTOR ────────────────────────────────
     Los nombres visibles, los colores y las tres funciones que los
     pintan viven en source-labels.js, porque la ficha del jugador
     necesita exactamente lo mismo y admin.html la carga ANTES que este
     archivo. Tenerlo duplicado habría hecho que renombrar una etiqueta
     en un sitio dejara el otro desactualizado sin avisar. */
  const FS = window.FerociaSource;
  if (!FS) console.error('[Ferocia] source-labels.js must load before admin-promotions.js');

  const SOURCE_NONE       = FS.NONE_KEY;     // '__none'
  const SOURCE_NONE_LABEL = FS.NONE_LABEL;   // 'Not recorded'
  const sourceMeta      = FS.meta;
  const sourceMetaOrRaw = FS.metaOrRaw;
  const sourcePill      = FS.pill;
  const heardLabel      = FS.heardLabel;

  /* ─── RESUMEN POR ORIGEN ───────────────────────────────────
     La pregunta que justifica toda esta función: ¿de dónde está
     saliendo la gente nueva?

     Cuenta sobre la lista COMPLETA, no sobre lo que la tabla tenga
     filtrado. Un resumen que cambiara con el filtro no sería un
     resumen, sería un eco de lo que ya estás viendo.

     Los suscriptores sin origen se cuentan aparte y NO entran en los
     porcentajes: meter 429 filas de las que no se sabe nada dentro del
     cálculo haría que cualquier canal real pareciera insignificante. */
  /* ⚠️  UNA SOLA DEFINICIÓN DE "ESTE MES", Y LA USAN LOS TRES SITIOS:
     el resumen por origen, el filtro de fecha de la tabla, y el
     "+N this month" de las tarjetas de arriba.

     Los tres tienen que cortar por el MISMO instante. Si cada uno se lo
     calculara aparte, el día que uno pasara a hora local y otro a UTC
     la tarjeta diría un número y la tabla enseñaría otro — que es
     exactamente el fallo que este filtro vino a arreglar.

     Es la medianoche del día 1 en la hora de Florida, no en UTC: la
     pregunta es "este mes" para quien mira la pantalla. En Florida eso
     son las 4 o 5 de la mañana en UTC, así que una alta de las 2 de la
     madrugada del día 1 cuenta como de este mes, que es lo que
     cualquiera esperaría. */
  const _inicioDeMes = () => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1).getTime();
  };

  /* ⚠️  SE COMPARAN INSTANTES, NO TEXTOS. Y NO ES UN DETALLE.

     La versión anterior comparaba las dos fechas como cadenas de texto.
     Eso sólo funciona si están escritas EXACTAMENTE igual, y no lo
     están: PostgREST manda '2026-10-03T22:00:05+00:00' —con '+00:00' y
     recortando los ceros de los decimales, como ya está documentado en
     db.js— mientras que `toISOString()` escribe
     '2026-10-01T04:00:00.000Z'. Comparando texto, el '+' va antes que
     el '.' y antes que la 'Z', así que un alta del segundo exacto del
     corte se caía fuera.

     Y lo grave no es ese milisegundo al mes. Es que el día que una
     consulta devuelva la columna con el desfase local
     ('2026-10-01T00:30:00-04:00'), la comparación de texto decide antes
     de llegar al desfase: compararía un reloj local contra uno UTC y se
     comería las primeras cuatro horas de cada mes, sin un solo error en
     ninguna parte.

     Comparando instantes eso no puede pasar, venga el formato que
     venga. Las 453 lecturas por pintada no cuestan nada. */
  const _momento = (iso) => {
    if (iso === null || iso === undefined || iso === '') return null;
    /* Postgres puede mandar el desfase corto ('+00' o '-04' en vez de
       '+00:00'), que `new Date()` no sabe leer: devuelve NaN. Se
       completa antes de interpretarlo.

       ⚠️  EL PATRÓN EXIGE UNA HORA DELANTE, Y NO SOBRA. La primera
       versión era `/([+-]\d{2})$/` a secas, y eso se comía el DÍA de
       una fecha sin hora: '2026-10-03' se convertía en '2026-10-03:00',
       que no se puede interpretar, y la función devolvía null. Hoy sólo
       se la llama con columnas que traen la hora, así que no habría
       roto nada — pero es una mina para el siguiente que la use. Lo
       encontró la segunda revisión del 4 de octubre.

       Y sólo se toca si es texto: un número o una fecha ya hecha pasan
       enteros. */
    const t = typeof iso === 'string'
      ? new Date(iso.replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00')).getTime()
      : new Date(iso).getTime();
    return isNaN(t) ? null : t;
  };

  /* El corte que toca para un periodo: null = sin corte, o sea "todo".
     Se le pasa el valor del interruptor del resumen o el del
     desplegable de la tabla, que usan las mismas dos palabras. */
  const _desdeDelPeriodo = (periodo) =>
    periodo === 'month' ? _inicioDeMes() : null;

  /* Sin fecha, o con una fecha que no se puede interpretar, NO es de
     este mes: no sabemos cuándo entró esa persona. Sigue saliendo en
     "All Time", que es donde tiene que salir. */
  const _enPeriodo = (s, desde) => {
    if (desde === null) return true;
    const t = _momento(s.subscribed_at);
    return t !== null && t >= desde;
  };

  const _renderSourceSummary = () => {
    const cont = document.getElementById('sub-source-summary');
    if (!cont) return;

    const desde = _desdeDelPeriodo(_summaryPeriod);

    const enPeriodo = _allSubs.filter(s => _enPeriodo(s, desde));

    const cuenta = new Map();
    let sinOrigen = 0;
    enPeriodo.forEach(s => {
      // Sólo cuenta como "no rastreado" el que de verdad no tiene dato.
      // Un origen que este archivo no reconozca igual se cuenta: el
      // dato existe y esconderlo daría un total que no cuadra.
      if (!s.source) { sinOrigen++; return; }
      cuenta.set(s.source, (cuenta.get(s.source) || 0) + 1);
    });

    const conOrigen = enPeriodo.length - sinOrigen;
    const filas = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);

    const toggle = (val, txt) => `
      <button type="button" data-action="setSourcePeriod" data-period="${val}"
        style="font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;padding:5px 12px;border-radius:99px;cursor:pointer;font-family:'Inter',sans-serif;
               border:0.5px solid ${_summaryPeriod === val ? 'transparent' : 'var(--divider-color)'};
               background:${_summaryPeriod === val ? 'var(--blue)' : 'white'};
               color:${_summaryPeriod === val ? 'white' : 'var(--text-muted)'};">${txt}</button>`;

    const cuerpo = filas.length
      ? filas.map(([src, n]) => {
          const m = sourceMetaOrRaw(src);
          const pct = conOrigen ? Math.round((n / conOrigen) * 100) : 0;
          /* Cada tarjeta filtra la tabla al pulsarla: ver "12 de
             Instagram" y querer saber quiénes son es el paso siguiente
             natural, y así no hay que ir al menú de filtros. */
          return `
            <button type="button" data-action="filterBySource" data-source="${esc(src)}"
              title="Show these subscribers in the table"
              style="flex:0 0 auto;min-width:104px;text-align:left;padding:10px 13px;border-radius:10px;cursor:pointer;font-family:'Inter',sans-serif;border:0.5px solid var(--divider-color);background:white;">
              <div style="font-size:19px;font-weight:800;color:${m.fg};line-height:1;">${n}</div>
              <div style="font-size:10px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--text);margin-top:5px;">${esc(m.label)}</div>
              <div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-top:2px;">${pct}% of tracked</div>
            </button>`;
        }).join('')
      : `<div style="font-size:12px;font-weight:600;color:var(--text-muted);padding:4px 0;">
           ${_summaryPeriod === 'month'
             ? 'Nobody has subscribed yet this month.'
             : 'No subscriber has a recorded source yet.'}
           Once people arrive through a tagged link, the breakdown appears here.
         </div>`;

    cont.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <div style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text);">Where they came from</div>
        <div style="display:flex;gap:6px;">${toggle('month', 'This month')}${toggle('all', 'All time')}</div>
        <div style="flex:1;"></div>
        ${sinOrigen ? `<div title="${esc(FS.NONE_HINT)}" style="font-size:10px;font-weight:600;color:var(--text-muted);">${sinOrigen} not recorded &mdash; excluded from the percentages</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${cuerpo}</div>`;
  };

  /* ════════════════════════════════════════════════════════════
     EL AVISO DEL FRENO DEL FORMULARIO

     El freno del formulario público (`subscribe-confirm`) deja de
     mandar correos de confirmación cuando entran demasiadas altas en 24
     horas. Eso protege la cuota y la reputación del dominio, y tiene un
     coste que hay que decir en voz alta: MIENTRAS ESTÁ PUESTO, LA GENTE
     DE VERDAD TAMPOCO RECIBE SU CORREO. Bastan 61 altas en un día para
     dejarlo así, y a un script eso le cuesta nada.

     Sin este aviso, el único rastro estaría en los registros de
     Supabase. Con 453 suscriptores se pueden perder todas las altas de
     una semana y esta pantalla parecería normal: el contador de
     pendientes sube, que es lo que hace siempre.

     ⚠️  AQUÍ NO SE REPITE EL NÚMERO 60. Eso vive en la función del
     servidor, y tener el mismo número en dos archivos es la forma más
     segura de que un día no coincidan. Este aviso no recalcula la
     decisión: mira la PRUEBA de que se tomó —fichas marcadas en las
     últimas 24 horas— que es un dato, no una copia de una regla.
     ════════════════════════════════════════════════════════════ */
  const pintarAvisoDelFreno = () => {
    const caja = document.getElementById('sub-brake-banner');
    if (!caja) return;

    const desde    = Date.now() - 24 * 60 * 60 * 1000;
    /* Lee la fecha con `_momento`, LA MISMA que usa el filtro de la
       tabla. Tenía su propio `new Date(iso)`, y eso dejaba una
       contradicción fea: con el desfase corto de Postgres ('+00'),
       `new Date` devuelve NaN y este aviso se APAGABA mientras la
       persona frenada seguía saliendo en la tabla. O sea, la única
       alarma que avisa de que el formulario está bloqueando a gente de
       verdad, muda. Lo encontró la segunda revisión del 4 de octubre. */
    const enVentana = (iso) => {
      const t = _momento(iso);
      return t !== null && t >= desde;
    };

    const frenadas = _allSubs.filter((s) => enVentana(s.confirm_email_skipped_at)).length;
    if (!frenadas) { caja.style.display = 'none'; caja.innerHTML = ''; return; }

    const altas = _allSubs.filter((s) => enVentana(s.subscribed_at)).length;

    /* ── LOS NÚMEROS SON UN MÍNIMO, NO UN TOTAL, Y SE DICE ─────
       `_allSubs` no son todos los suscriptores: la consulta que los trae
       no pide tope, y el servidor devuelve 1.000 filas como máximo sin
       avisar. O sea que justo en el caso para el que existe este aviso
       —una ráfaga de miles de altas— el número estaría cortado.

       Y aquí eso importa: si entraron 3.000 y el aviso dice "1.000",
       ella decide con un número tres veces menor que el real. Cuando se
       llega al tope se dice "al menos", que es lo único cierto que se
       puede afirmar sin pedir otra consulta. Lo señaló la segunda
       revisión. */
    const alMenos = _allSubs.length >= 1000 ? 'at least ' : '';

    /* ⚠️  EL AVISO LLEVA UN BOTÓN, NO UNA INSTRUCCIÓN.

       Antes decía "usa el filtro Pending — no email sent", y ahí se
       abría un hueco: los OTROS tres filtros se quedaban como
       estuvieran. Con una búsqueda escrita, o con el origen que una
       tarjeta del resumen acababa de poner, esa lista salía corta o
       directamente vacía. Una lista de alarma que se ve completa y no lo
       está es peor que no tener alarma.

       Las dos revisiones del 4 de octubre llegaron a esto por tres
       caminos distintos. La lección: la respuesta no era poner
       inteligencia en el desplegable de estado —eso además saltaba al
       pasar por encima con las flechas del teclado— sino que el aviso
       deje la pantalla ENTERA en el estado correcto de una vez. */
    caja.style.display = 'block';
    caja.innerHTML = `
      <div style="padding:14px 20px;background:#FFF1E8;border-bottom:0.5px solid #f3c9ae;">
        <div style="font-size:13px;font-weight:800;color:#9a3d0e;margin-bottom:4px;">
          ⚠️ The signup brake is on
        </div>
        <div style="font-size:12px;font-weight:600;color:#9a3d0e;line-height:1.5;">
          ${alMenos}${altas} signup${altas === 1 ? '' : 's'} came in over the last 24 hours,
          and ${alMenos}<strong>${frenadas}</strong> of them did not get a confirmation
          email, so those people cannot join the list. This protects the monthly email
          quota, but while it lasts <strong>new real signups are being blocked too</strong>.
          Tell me so I can look at it.
        </div>
        <button type="button" data-action="verFrenadas"
          style="margin-top:10px;font-family:'Inter',sans-serif;font-size:11px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;padding:11px 16px;border-radius:99px;border:0.5px solid #c88a5e;background:white;color:#9a3d0e;cursor:pointer;">
          Show me who
        </button>
      </div>`;
  };

  const _renderSubsTable = () => {
    const search = (document.getElementById('sub-search')?.value || '').toLowerCase().trim();
    const filter = document.getElementById('sub-status-filter')?.value || 'all';
    const srcFil = document.getElementById('sub-source-filter')?.value || 'all';
    /* El filtro de fecha. 'all' por defecto, para que la tabla siga
       enseñando todo mientras nadie lo toque.

       Se calcula el corte UNA VEZ, aquí fuera, y no dentro del filtro:
       con 453 filas, hacerlo dentro crearía 453 objetos de fecha para
       devolver siempre lo mismo. */
    const perFil = document.getElementById('sub-period-filter')?.value || 'all';
    const desde  = _desdeDelPeriodo(perFil);
    const filtered = _allSubs.filter(s => {
      const nameMatch = `${s.first_name} ${s.last_name} ${s.email} ${s.phone || ''} ${FerociaPhone.searchable(s.country_code, s.phone)}`.toLowerCase().includes(search);
      /* '__frenadas' no es un estado: son las fichas a las que el freno
         del formulario público no les mandó el correo de confirmación.
         Su estado sigue siendo 'pending', así que se mira la marca y no
         la columna de estado. Los dos guiones bajos del valor están
         para que no pueda chocar nunca con un estado real. */
      /* Y SE EXIGE QUE SIGA PENDIENTE. La marca del freno no se borra
         nunca, así que sin esto una persona a la que frenaron, que
         escribió, a la que rescataste y que ya confirmó seguiría
         saliendo para siempre en una lista que se llama "no email
         sent" — y trabajando esa lista te encontrarías una y otra vez
         a gente que ya rescataste, sin forma de distinguirla.

         Es además la MISMA definición que usa el SQL de limpieza
         (sql/62: `status = 'pending' and confirm_email_skipped_at is
         not null`). Dos definiciones de lo mismo en el mismo cambio era
         justo lo que no quería dejar. */
      const statusMatch = filter === 'all' ? true
        : filter === '__frenadas'
            ? (s.status === 'pending' && !!s.confirm_email_skipped_at)
        : s.status === filter;
      /* Los CUATRO filtros se combinan (Y, no O): buscar "maria", estado
         Active, origen Instagram y este mes devuelve las Marías activas
         que llegaron por Instagram este mes, no la suma de las cuatro
         listas. */
      const srcMatch = srcFil === 'all'
        || (srcFil === SOURCE_NONE ? !s.source : s.source === srcFil);
      /* Quien no tenga fecha de alta NO sale en "este mes". Es la misma
         regla que usa el resumen de arriba, por `_enPeriodo`. */
      const perMatch = _enPeriodo(s, desde);
      return nameMatch && statusMatch && srcMatch && perMatch;
    });
    const slice   = filtered.slice(0, _subsShown);
    const total   = filtered.length;

    pintarAvisoDelFreno();

    const avColors = ['var(--blue)','var(--teal)','var(--orange)','#7c3aed','#0891b2','#d97706'];
    const getAv = (s) => {
      const str = `${s.first_name}${s.last_name}`;
      let h = 0; for (let i=0;i<str.length;i++) h=str.charCodeAt(i)+((h<<5)-h);
      return avColors[Math.abs(h) % avColors.length];
    };
    const pillCSS = (status) => {
      if (status === 'active')       return 'background:rgba(36,188,150,0.12);color:#085041;';
      if (status === 'pending')      return 'background:rgba(242,96,36,0.12);color:#7a3d00;';
      return 'background:rgba(107,122,153,0.12);color:var(--text-muted);';
    };
    const tableHTML = slice.length ? `
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Subscriber</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Email</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Phone</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Skill</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Source</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Status</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;">Joined</th>
            <th style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text);padding:10px 16px;text-align:left;border-bottom:0.5px solid #e0e7f5;background:#fafbff;text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${slice.map(s => {
            const initials = `${s.first_name?.[0]||''}${s.last_name?.[0]||''}`.toUpperCase();
            return `<tr style="cursor:default;" onmouseover="this.querySelectorAll('td').forEach(t=>t.style.background='rgba(23,76,204,0.025)')" onmouseout="this.querySelectorAll('td').forEach(t=>t.style.background='')">
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;vertical-align:middle;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:30px;height:30px;border-radius:50%;background:${getAv(s)};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white;flex-shrink:0;">${esc(initials)}</div>
                  <div style="font-size:13px;font-weight:700;color:var(--text);">${esc(s.first_name)} ${esc(s.last_name)}</div>
                </div>
              </td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:var(--text-muted);">${esc(s.email || '—')}</td>
              ${/* Misma regla que el modal, y aqui tambien sin la marca:
                    la tabla se lee de un vistazo, el modal es el que
                    explica de donde sale cada dato. */''}
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:var(--text-muted);">${(() => {
                const t = _fldTel(_playerByKey.get(_personKey(s)), s);
                return t.phone ? esc(FerociaPhone.format(t.country_code, t.phone)) : '—';
              })()}</td>
              ${/* Misma regla que el modal: si ya es jugador, manda su
                    ficha. Aquí SIN la marca "from player" a propósito —
                    la tabla ya va apretada y una etiqueta por fila la
                    volvería ilegible. El modal es donde se explica. */''}
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:12px;color:var(--text-muted);text-transform:capitalize;">${esc(_fld(_playerByKey.get(_personKey(s)), s, 'skill_level').v || '—')}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;white-space:nowrap;">
                ${sourcePill(s.source)}
                ${/* La campaña va debajo y en pequeño: dice CUÁL anuncio,
                      no de qué canal. Sólo aparece si la hay, para no
                      dejar una línea vacía en cada fila antigua. */''}
                ${s.source_campaign
                  ? `<div style="font-size:10px;font-weight:600;color:var(--text-muted);margin-top:3px;">${esc(s.source_campaign)}</div>`
                  : ''}
              </td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;">
                <span style="font-size:9px;font-weight:800;padding:3px 9px;border-radius:99px;letter-spacing:.5px;text-transform:uppercase;${pillCSS(s.status)}">${esc(s.status || '—')}</span>
              </td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;font-size:11px;color:var(--text-muted);">${fmtDate(s.subscribed_at) || '—'}</td>
              <td style="padding:11px 16px;border-bottom:0.5px solid #f4f5f8;text-align:right;white-space:nowrap;">
                ${subActionIcons(s)}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : `<div class="empty" style="padding:20px;">No subscribers found.</div>`;

    document.getElementById('subscribers-table').innerHTML = tableHTML;

    // Load more row
    const lmRow = document.getElementById('sub-load-more-row');
    const lmInfo = document.getElementById('sub-results-info');
    const lmBtn  = document.getElementById('sub-load-more-btn');
    if (lmRow) {
      lmRow.style.display = 'flex';
      if (lmInfo) lmInfo.textContent = `Showing ${Math.min(_subsShown, total)} of ${total} subscribers`;
      if (lmBtn) {
        if (slice.length < total) {
          lmBtn.style.display = '';
          lmBtn.textContent = `Load ${Math.min(25, total - slice.length)} more`;
          lmBtn.onclick = () => { _subsShown += 25; _renderSubsTable(); };
        } else {
          lmBtn.style.display = 'none';
        }
      }
    }
  };

  const loadPromotionsPage = async () => {
    await loadSubscribers();
    // Auto-generate QR code on page load
    generateQR();
  };

  /* Mirrors _normName in admin-players.js and normalize_name_for_matching()
     in the database: lower → strip accents → collapse spaces. Kept local so
     this module has no load-order dependency on admin-players.js. */
  const _norm = (v) =>
    String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();

  /* Same three-field rule used everywhere else: email + first + last.
     Email alone would be wrong — a parent and child can share an inbox. */
  const _personKey = (r) =>
    `${(r.email || '').trim().toLowerCase()}|${_norm(r.first_name)}|${_norm(r.last_name)}`;

  /* ─── DE DÓNDE SALE CADA DATO ─────────────────────────────────
     Hay gente que está en las dos tablas: se suscribió por la web y
     además es jugador. Para esas personas, los datos personales se
     editan en la ficha del jugador — es lo que el admin hace todos los
     días — y la fila del suscriptor se queda con los huecos del día en
     que se apuntó, cuando el formulario ni pedía la mitad de los campos.

     La decisión (aprobada): NO se copia el dato de una tabla a la otra.
     Se muestra el del jugador, que es el único que se mantiene al día.
     Copiarlo crearía dos versiones del mismo dato, y en la primera
     corrección se contradirían sin que nada avisara.

     Lo que NO se toca, a propósito: self_rating y todo el bloque de
     origen. Esos son una FOTO del momento en que la persona se apuntó
     — lo que ella creía que jugaba, por dónde llegó — y su valor está
     justamente en que no cambian.
     ──────────────────────────────────────────────────────────── */

  const _vacio = (v) => v === null || v === undefined || String(v).trim() === '';

  /* Devuelve el valor a mostrar y si vino de la ficha del jugador.

     Regla, campo por campo:
       1. Ya es jugador Y su ficha tiene ese dato → el de la ficha.
       2. Si no → el del suscriptor, como hasta ahora.

     El punto 2 no es un detalle: hay fichas de jugador a las que les
     falta algún campo que el suscriptor SÍ tenía. Sin ese respaldo,
     este cambio esconderia un dato que hoy se ve — peor que el problema
     que viene a arreglar. Así nunca se muestra menos que antes. */
  const _fld = (p, s, field) => {
    const pv = p ? p[field] : null;
    return _vacio(pv) ? { v: s[field], dePlayer: false }
                      : { v: pv,       dePlayer: true  };
  };

  /* La ubicación son dos columnas pero un solo dato: si se mezclaran
     (ciudad del jugador, estado del suscriptor) podría salir un
     "Miami, FL" que no existe en ninguna de las dos fichas. Manda la
     ciudad: quien la tenga, aporta las dos. */
  const _fldUbic = (p, s) =>
    (p && !_vacio(p.city)) ? { city: p.city, state: p.state, dePlayer: true  }
                           : { city: s.city, state: s.state, dePlayer: false };

  /* El telefono va con su prefijo de pais y por la misma razon que la
     ubicacion viajan juntos: un numero de la ficha del jugador con el
     prefijo del suscriptor seria un telefono que no existe. Manda el
     numero: quien lo tenga, aporta los dos. */
  const _fldTel = (p, s) =>
    (p && !_vacio(p.phone))
      ? { phone: p.phone, country_code: p.country_code, dePlayer: true  }
      : { phone: s.phone, country_code: s.country_code, dePlayer: false };

  /* La marca que explica de dónde salió el dato. Va en teal, el mismo
     color del iconito de "Already a player", para que se lea como la
     misma idea y no como un aviso de error. */
  const _marcaPlayer = () =>
    '<span style="font-size:9px;font-weight:800;letter-spacing:.3px;'
    + 'text-transform:uppercase;color:var(--teal);margin-left:6px;'
    + 'white-space:nowrap;">from player</span>';

  /* Icons for the actions column.

     Three states, decided per row:
       · always      an eye → read-only details
       · already a player   → person-with-check, goes to their profile
       · unsubscribed       → NO convert icon at all (approved): someone
                              who left the mailing list is not converted
                              into a player from here
       · otherwise          → person-with-plus, opens the convert modal

     Y desde el 6 de octubre uno más, el de la suscripción:
       · activa o pendiente → sobre tachado, para darla de baja
       · dada de baja       → flecha de vuelta, para volver a activarla

     ⚠️  NINGUNO DE LOS DOS HACE NADA AL PULSARLO. Los dos abren una
     ventana que dice de quién se trata y pide confirmación. Están en la
     fila, al lado del de convertir, porque así se pidió; la ventana es
     lo que hace que pulsar en la fila equivocada no tenga consecuencias. */
  const ICON_EYE   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICON_ADD   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>';
  const ICON_CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>';
  // Sobre tachado = "deja de recibir correo". Flecha de vuelta = "vuelve".
  const ICON_UNSUB = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9"/><polyline points="22 7 12 13 2 7"/><line x1="16" y1="19" x2="22" y2="19"/></svg>';
  const ICON_BACK  = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';

  const iconBtn = (action, extra, title, icon, color) =>
    `<button type="button" data-action="${action}" ${extra} title="${title}"
       style="background:none;border:none;padding:4px 6px;cursor:pointer;color:${color};vertical-align:middle;"
       onmouseover="this.style.opacity='0.6'" onmouseout="this.style.opacity='1'">${icon}</button>`;

  const subActionIcons = (s) => {
    let html = iconBtn('viewSubscriber', `data-subid="${s.id}"`,
                       'View details', ICON_EYE, 'var(--text-muted)');

    if (s.status === 'unsubscribed') {
      // Sigue sin icono de convertir (decidido el 3 de octubre): a quien
      // se fue de la lista no se le convierte en jugador desde aquí.
      return html + iconBtn('resubscribeSubscriber', `data-subid="${s.id}"`,
                            'Subscribe again', ICON_BACK, 'var(--teal)');
    }

    const pid = _playerIndex.get(_personKey(s));
    html += pid
      ? iconBtn('showPage', `data-page="player-profile" data-pid="${pid}"`,
                'Already a player — view profile', ICON_CHECK, 'var(--teal)')
      : iconBtn('convertSubscriber', `data-subid="${s.id}"`,
                'Convert to player', ICON_ADD, 'var(--blue)');
    html += iconBtn('unsubscribeSubscriber', `data-subid="${s.id}"`,
                    'Unsubscribe', ICON_UNSUB, '#c04a0e');
    return html;
  };


  /* ─── SUBSCRIBER DETAILS & CONVERSION ────────────────────────
     Two separate modals on purpose: the details one gets opened far more
     often, and loading it with the conversion form would make the common
     case slower and more fragile.
     ──────────────────────────────────────────────────────────── */

  const svRow = (label, value) => `
    <div style="display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:0.5px solid var(--divider-color);">
      <div style="font-size:10px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);flex-shrink:0;">${label}</div>
      <div style="font-size:13px;font-weight:600;color:var(--text);text-align:right;word-break:break-word;">${value || '—'}</div>
    </div>`;

  /* ── UNA FECHA CON HORA, QUE `fmtDate` NO SABE HACER ──────────
     `fmtDate` (db.js) es para fechas SUELTAS: le pega 'T12:00:00' al
     texto para que la zona horaria no la mueva un día. Si lo que le
     llegan son fecha Y hora —como `confirm_email_skipped_at`, que es
     un `timestamptz`— el texto resultante no se puede interpretar y
     devuelve literalmente «Invalid Date». Lo comprobé ejecutándolo.

     Y mi prueba no lo pilló porque su banco tenía una versión FALSA de
     `fmtDate` que sí funcionaba. Simular una función cuyo
     comportamiento real ES el fallo es la forma más limpia de no
     encontrarlo nunca; el banco ahora usa la de verdad.

     Esto se escribe aquí y no en db.js para no tocar un archivo que
     cargan las cinco páginas por una etiqueta de una ficha. Es el mismo
     patrón que usa `cuando()` en admin-communications.js, que tenía
     este problema resuelto desde el principio. */
  const fechaYHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
         + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const svSection = (title) => `
    <div style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--blue);margin:18px 0 4px;">${title}</div>`;

  /* Three decimals, same convention as coach_rating on the player card.
     Returns '' for null/undefined/'' so svRow falls back to its dash —
     but NOT for 0, which is a real answer the subscriber gave and must
     stay visually different from "did not answer". */
  const svRating = (v) =>
    (v === null || v === undefined || v === '') ? '' : Number(v).toFixed(3);

  /* Una fila del bloque Personal: el valor ya formateado y, si salió de
     la ficha del jugador, la marca que lo dice. Sin valor devuelve ''
     para que svRow ponga su guion de siempre. */
  const svPersonal = (campo, fmt) => {
    if (_vacio(campo.v)) return '';
    const txt = fmt(campo.v);
    return campo.dePlayer ? `${txt}${_marcaPlayer()}` : txt;
  };

  const subAge = (iso) => {
    if (!iso) return null;
    const b = new Date(iso + 'T00:00:00');
    if (isNaN(b.getTime())) return null;
    const n = new Date();
    let a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a;
  };

  const subDob = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    const txt = m ? `${m[2]}/${m[3]}/${m[1]}` : String(iso);
    const age = subAge(iso);
    // "(41 years)" rather than "(41)" — matches the player profile.
    return age !== null ? `${txt} (${age} ${age === 1 ? 'year' : 'years'})` : txt;
  };

  window.viewSubscriber = (subId) => {
    const s = _allSubs.find(x => String(x.id) === String(subId));
    if (!s) { toast('Subscriber not found. Refresh the page.', true); return; }

    /* Su ficha de jugador, si la tiene. undefined para quien sólo está
       en la lista de correo, y entonces _fld devuelve el dato del
       suscriptor y todo se ve exactamente igual que antes. */
    const p = _playerByKey.get(_personKey(s));
    const ubic = _fldUbic(p, s);
    const tel  = _fldTel(p, s);

    document.getElementById('sv-name').textContent = `${s.first_name} ${s.last_name}`;
    document.getElementById('sv-body').innerHTML =
        svSection('Contact')
      + svRow('Email', esc(s.email))
      + svRow('Phone', (() => {
          if (_vacio(tel.phone)) return '';
          const txt = esc(FerociaPhone.format(tel.country_code, tel.phone));
          return tel.dePlayer ? `${txt}${_marcaPlayer()}` : txt;
        })())
      + svSection('Personal')
      + svRow('Gender', svPersonal(_fld(p, s, 'gender'), esc))
      + svRow('Date of Birth', svPersonal(_fld(p, s, 'date_of_birth'),
          (v) => esc(subDob(v))))
      + svRow('Location', (() => {
          const txt = FerociaLocation.formatLocation(ubic.city, ubic.state);
          if (!txt) return '';
          return ubic.dePlayer ? `${esc(txt)}${_marcaPlayer()}` : esc(txt);
        })())
      // The public form stores this lower-cased; the table capitalises it
      // with CSS, so this does the same for consistency.
      + svRow('Skill Level', svPersonal(_fld(p, s, 'skill_level'),
          (v) => esc(String(v).charAt(0).toUpperCase() + String(v).slice(1))))
      // The rating the subscriber gave themselves on the public form.
      // Deliberately NOT the coach rating — the wording says so, so nobody
      // mistakes it for an evaluated number.
      + svRow('Self-Rating', svRating(s.self_rating)
          ? `${esc(svRating(s.self_rating))}<span style="font-size:10px;font-weight:700;color:var(--text-muted);margin-left:6px;">self-reported</span>`
          : '')
      /* Dos cosas distintas, separadas a propósito:
           · Source       → lo que se MIDIÓ (la etiqueta del enlace)
           · Heard about  → lo que la persona DIJO
         Pueden no coincidir. Alguien puede llegar por un anuncio de
         Instagram y contestar "me lo dijo un amigo" — y las dos cosas
         son ciertas: el amigo se lo contó, el anuncio se lo recordó.
         Por eso no se mezclan en una sola fila. */
      + svSection('Where they came from')
      + svRow('Source', s.source
          ? sourcePill(s.source)
          : `<span style="color:var(--text-muted);font-weight:600;">${SOURCE_NONE_LABEL}</span>`)
      + svRow('Campaign', esc(s.source_campaign))
      + svRow('They said', (() => {
          if (!s.heard_about) return '';
          const txt = esc(heardLabel(s.heard_about));
          // El texto libre sólo existe con "Other", y es justo el que
          // enseña lo que a la lista de opciones le falta.
          return s.heard_about_other
            ? `${txt}<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-top:3px;font-style:italic;">&ldquo;${esc(s.heard_about_other)}&rdquo;</div>`
            : txt;
        })())
      + svSection('Subscription')
      + svRow('Status', esc(s.status))
      + svRow('Subscribed', fmtDate(s.subscribed_at))
      + svRow('Confirmed', s.confirm_token ? 'Pending confirmation' : 'Yes')
      /* Si el freno del formulario público le quitó el correo de
         confirmación, se dice AQUÍ y no en la tabla: la tabla se lee de
         un vistazo y una columna más la volvería ilegible en el móvil.
         Sin esto, una ficha pendiente a la que se le mandó el correo y
         otra a la que no son idénticas en pantalla.

         ⚠️  LA FILA SÓLO SALE CUANDO HUBO FRENO, y en el resto no sale
         nada. Mi primera versión ponía "Sent" para todos los demás, y
         eso es afirmar algo que no sabemos: el correo también se queda
         sin salir cuando Resend lo rechaza, cuando la ficha vuelve sin
         token, o cuando el propio apuntado del freno falla — y en esos
         tres casos esta columna está vacía. Lo encontró la revisión, y
         el caso que lo hace grave es el peor posible: alguien escribe
         diciendo que no le llegó, ella abre la ficha, y la ficha le
         dice que sí se mandó. */
      + (s.confirm_email_skipped_at
          ? svRow('Confirmation email',
              '<span style="color:#c04a0e;">Not sent — the signup brake was on '
              + `${esc(fechaYHora(s.confirm_email_skipped_at))}</span>`)
          : '')
      // Surfaces the legacy rows that have no token and therefore cannot
      // use the unsubscribe link in a campaign.
      + svRow('Can unsubscribe', s.unsubscribe_token ? 'Yes' : '<span style="color:#c04a0e;">No — no token</span>')
      /* Cuándo y por qué se fue. Sólo se enseña a quien está fuera: a
         quien está dentro, estos dos datos son del pasado y leerlos en
         su ficha haría pensar que está de baja. */
      + (s.status === 'unsubscribed'
          ? svRow('Unsubscribed', esc(_cuandoSeDioDeBaja(s)))
            + svRow('Reason', esc(_porQueSeDioDeBaja(s)))
          : '');

    document.getElementById('sub-view-modal').classList.add('open');
  };

  window.closeSubView = () =>
    document.getElementById('sub-view-modal').classList.remove('open');


  /* ─── DAR DE BAJA / VOLVER A ACTIVAR ──────────────────────────

     Dos botones en la fila de la tabla, y los dos pasan por aquí.
     NINGUNO actúa al pulsarlo: los dos abren esta ventana, que dice de
     quién se trata y espera una confirmación.

     Por qué una ventana propia y no la compartida (`confirmModal`, en
     db.js): ésa tiene exactamente dos botones, y su trampa del cursor
     —la que impide que un Enter despistado confirme algo -- cuenta con
     eso. Meterle un campo de texto obligaría a tocar la pieza que
     protege las 22 confirmaciones de la aplicación, por una pantalla.
     No merece la pena. Ésta sigue el patrón de la ventana de convertir
     a jugador, que ya es una ventana aparte con su propio formulario.

     Y por eso el motivo va en un `textarea` y no en un `input`: en un
     campo de una línea, Enter puede llegar a confirmar; en éste sólo
     hace un salto de línea. El dedo tiene que ir al botón. */

  /* Las TRES situaciones de una baja, y ninguna se puede confundir con
     otra, porque de eso depende que decidas con un dato y no con una
     suposición:
       · con motivo escrito  → la diste de baja tú
       · con fecha y sin motivo → se dio de baja ella desde el enlace,
         donde no se le pregunta nada
       · sin fecha → es anterior al 6 de octubre de 2026, que es cuando
         empezamos a guardarla. Ese dato no existe y no me lo invento. */
  /* Sin fecha entre paréntesis a propósito: la frontera no es el día que
     se subió esto, es el día que ella corre el `sql/69` — y eso el código
     no lo sabe. Una fecha concreta aquí sería una afirmación que puede
     salir falsa por una semana. */
  const _cuandoSeDioDeBaja = (s) =>
    s.unsubscribed_at
      ? fechaYHora(s.unsubscribed_at)
      : 'Before we started recording it';

  const _porQueSeDioDeBaja = (s) => {
    if (s.unsubscribe_note) return s.unsubscribe_note;
    if (s.unsubscribed_at) {
      return 'They unsubscribed themselves from the link in an email. '
           + 'That page does not ask for a reason.';
    }
    return 'Not recorded — this was before we started saving it.';
  };

  /* Las OTRAS fichas que comparten esa misma dirección y siguen dentro.
     Hasta cuatro personas pueden compartir buzón (una familia), y la
     lista de envío se arma por FICHA, no por dirección. */
  const _otrasEnEseBuzon = (s) => {
    const correo = String(s.email || '').trim().toLowerCase();
    if (!correo) return 0;
    return _allSubs.filter((x) => x.id !== s.id
      && String(x.email || '').trim().toLowerCase() === correo
      && x.status !== 'unsubscribed').length;
  };

  let _ssSub  = null;   // de quién habla la ventana abierta
  let _ssModo = null;   // 'baja' | 'alta'
  let _ssTecla = null;  // el oyente del teclado mientras está abierta
  /* Mientras se guarda o se manda el correo, la ventana NO se cierra
     (ni con Escape, ni pulsando fuera, ni con la X). Si se cerrara, al
     terminar cerraría la ventana que estuviera abierta entonces —la de
     otra persona— y se perdería lo escrito en ella. Lo señaló la
     revisión del ajuste 15. */
  let _ssOcupada = false;
  /* Si el correo de "Subscribe Again" no salió: a quién y con qué
     código, para "Retry email". */
  let _ssReintento = null;

  const closeSubStatus = (forzar = false) => {
    if (_ssOcupada && forzar !== true) return;
    document.getElementById('sub-status-modal').classList.remove('open');
    if (_ssTecla) { document.removeEventListener('keydown', _ssTecla); _ssTecla = null; }
    _ssSub = null;
    _ssModo = null;
    _ssReintento = null;
  };

  /* ⚠️  EL CURSOR NO SE SALE DE ESTA VENTANA, Y ESCAPE LA CIERRA.

     La ventana compartida (`confirmModal`, en db.js) lleva esto desde el
     4 de octubre, y lo lleva por un motivo concreto: sin ello el Tab se
     iba a la pantalla de atrás, el espacio pulsaba un botón de allí, se
     abría otra ventana encima, y un Enter contestaba que sí a las dos —
     462 correos saliendo con la pantalla diciendo otra cosa.

     Ésta es una ventana aparte, así que no heredaba nada de eso. Y es
     además la que más invita a usar el teclado, porque es la única con
     un campo de texto del que se sale con el Tab. Lo señaló la revisión
     del 6 de octubre, con el recorrido del cursor medido: dos tabulado-
     res y el foco estaba en los botones de la tabla de atrás.

     Aquí la trampa no puede dar por hecho que hay dos botones, como la
     compartida: hay dos botones Y un campo de texto. Se recorre lo que
     haya dentro. */
  const _atraparCursor = (modal) => {
    _ssTecla = (e) => {
      if (e.key === 'Escape') { closeSubStatus(); return; }
      if (e.key !== 'Tab') return;
      const foco = [...modal.querySelectorAll('button, textarea')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!foco.length) return;
      e.preventDefault();
      const i = foco.indexOf(document.activeElement);
      const sig = i === -1 ? 0
        : (i + (e.shiftKey ? foco.length - 1 : 1)) % foco.length;
      foco[sig].focus();
    };
    document.addEventListener('keydown', _ssTecla);
    /* Pulsar fuera de la ventana también la cierra, como las demás.
       Cerrar es la respuesta segura: no hace nada. */
    modal.onclick = (e) => { if (e.target === modal) closeSubStatus(); };
  };

  /* ⚠️  LOS DOS BOTONES LLEVAN BORDE, aunque el de confirmar lo lleve
     transparente. Con `border:none` el botón medía 2px menos de alto
     que el de Cancelar, y a 320px de ancho eso lo dejaba por debajo del
     tamaño mínimo para tocarlo con el dedo. Lo midió la prueba de
     móvil; a simple vista no se nota. */
  const _ssBoton = (accion, texto, fondo, extra = '') =>
    `<button type="button" data-action="${accion}" ${extra}
       style="padding:10px 22px;border:1px solid ${fondo === 'white' ? 'var(--divider-color)' : 'transparent'};border-radius:99px;background:${fondo};color:${fondo === 'white' ? 'var(--text)' : 'white'};font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">${texto}</button>`;

  const _abrirSubStatus = (subId, modo) => {
    const s = _allSubs.find(x => String(x.id) === String(subId));
    if (!s) { toast('Subscriber not found. Refresh the page.', true); return; }

    /* La tabla puede llevar minutos pintada. Si esta persona ya está en
       el estado al que ibas a llevarla, no se pregunta nada: se dice y
       se recarga. Mejor que confirmar un cambio que no hace nada. */
    const yaEsta = (modo === 'baja' && s.status === 'unsubscribed')
                || (modo === 'alta'  && s.status !== 'unsubscribed');
    if (yaEsta) {
      toast(`${s.first_name} ${s.last_name} is already `
          + `${modo === 'baja' ? 'unsubscribed' : 'subscribed'}. Refreshing the list.`);
      loadSubscribers();
      return;
    }

    _ssSub  = s;
    _ssModo = modo;

    document.getElementById('ss-title').textContent =
      modo === 'baja' ? 'Unsubscribe this person?' : 'Subscribe this person again?';
    document.getElementById('ss-subtitle').textContent =
      `${s.first_name} ${s.last_name} · ${s.email}`;

    const aviso = (fondo, borde, html) =>
      `<div style="padding:14px 16px;background:${fondo};border:1px solid ${borde};border-radius:10px;font-size:13px;font-weight:600;color:var(--text);line-height:1.6;">${html}</div>`;

    const body = document.getElementById('ss-body');

    if (modo === 'baja') {
      body.innerHTML =
        aviso('rgba(192,74,14,0.06)', 'rgba(192,74,14,0.25)',
            'They will stop receiving campaigns and the newsletter from now on. '
          + 'Nothing is deleted: their record, their history and where they came '
          + 'from all stay.'
          + (_playerIndex.get(_personKey(s))
              ? '<div style="margin-top:10px;font-weight:700;color:#c04a0e;">'
                + 'This person is also a player, so they will still get ladder '
                + 'and tournament emails. Those are not part of the mailing list.</div>'
              : '')
          /* ⚠️  EL BUZÓN COMPARTIDO. 19 de sus 490 direcciones llevan más
             de una ficha —familias que comparten correo— y la lista de
             envío se arma por FICHA, no por dirección. Sin este aviso,
             alguien escribe "quitadme de la lista", ella da de baja a esa
             ficha, la ventana le dice que esa persona deja de recibir, y
             al buzón le siguen llegando los correos a nombre de otro. Lo
             siguiente que se pulsa ahí es spam. Lo señaló la revisión del
             6 de octubre. */
          + (() => {
              const n = _otrasEnEseBuzon(s);
              if (!n) return '';
              return '<div style="margin-top:10px;font-weight:700;color:#c04a0e;">'
                + (n === 1
                    ? '1 other subscription shares this email address and will keep '
                      + 'receiving campaigns. Unsubscribe it too if the whole inbox '
                      + 'should stop.'
                    : `${n} other subscriptions share this email address and will keep `
                      + 'receiving campaigns. Unsubscribe them too if the whole inbox '
                      + 'should stop.')
                + '</div>';
            })())
        + '<div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);margin:18px 0 4px;">'
        + 'Why are you unsubscribing them? <span style="color:#e53935;">*</span></div>'
        + '<textarea id="ss-note" rows="3" maxlength="200"'
        + ' placeholder="They asked by email on Oct 6"'
        + ' style="width:100%;padding:10px 12px;border:1px solid var(--divider-color);border-radius:8px;font-family:\'Inter\',sans-serif;font-size:13px;font-weight:600;color:var(--text);outline:none;resize:vertical;box-sizing:border-box;"></textarea>'
        + '<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-top:6px;line-height:1.5;">'
        + 'Required. In six months this is the only thing that will explain why '
        + 'they are out of the list.</div>'
        + `<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap;">
             ${_ssBoton('closeSubStatus', 'Cancel', 'white')}
             ${_ssBoton('confirmSubStatus', 'Unsubscribe', '#c04a0e', 'id="ss-ok"')}
           </div>`;

      /* El botón se apaga mientras no haya texto, y se enciende cuando
         lo hay. Así "obligatorio" se ve antes de pulsar, en vez de ser
         un error después.

         ⚠️  LO APAGA `mirar()`, Y NADA MÁS. Lo tenía además escrito como
         `disabled` en el propio botón, y eso era código muerto: `mirar()`
         corre justo después de pintarlo y decide igual. La mutación lo
         demostró — quitar ese `disabled` no ponía roja ninguna prueba,
         porque no hacía nada. Dos sitios decidiendo lo mismo es como se
         empieza a tener dos que no coinciden. */
      const nota = document.getElementById('ss-note');
      const ok   = document.getElementById('ss-ok');
      const mirar = () => {
        const hay = nota.value.trim().length > 0;
        ok.disabled = !hay;
        ok.style.opacity = hay ? '1' : '0.45';
        ok.style.cursor  = hay ? 'pointer' : 'not-allowed';
      };
      nota.addEventListener('input', mirar);
      mirar();
      setTimeout(() => nota.focus(), 50);
    } else {
      body.innerHTML =
        aviso('rgba(36,188,150,0.06)', 'rgba(36,188,150,0.25)',
            '<div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);">Unsubscribed</div>'
          + `<div style="margin-bottom:10px;">${esc(_cuandoSeDioDeBaja(s))}</div>`
          + '<div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);">Reason</div>'
          + `<div>${esc(_porQueSeDioDeBaja(s))}</div>`)
        /* ⚠️  NADIE VUELVE COMO ACTIVO DESDE AQUÍ (ajuste 15, 12 de octubre).

           Vuelve como PENDIENTE y se le manda el correo de confirmación,
           con un enlace nuevo. Entra en los envíos cuando pulsa ese
           enlace, como cualquier alta del formulario: así es ELLA quien
           dice que quiere volver, y no sólo una pulsación nuestra. Vale
           igual para quien estaba activa antes de irse y para quien nunca
           llegó a confirmar. */
        + '<div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.6;margin-top:16px;">'
        + 'They will go back to <strong>Pending</strong> and get an email to '
        + 'confirm their subscription. They will receive campaigns and the '
        + 'newsletter once they click the link in that email.'
        + '</div>'
        + '<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-top:8px;line-height:1.5;">'
        + 'Only do this if this person asked you to. Writing to someone who chose '
        + 'to leave is what gets a sender marked as spam.</div>'
        + `<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap;">
             ${_ssBoton('closeSubStatus', 'Cancel', 'white')}
             ${_ssBoton('confirmSubStatus', 'Subscribe Again', 'linear-gradient(180deg,#2456d3,var(--blue))', 'id="ss-ok"')}
           </div>`;
    }

    const modal = document.getElementById('sub-status-modal');
    modal.classList.add('open');
    _atraparCursor(modal);
  };

  /* ─── SUBSCRIBE AGAIN: PENDIENTE + CORREO DE CONFIRMACIÓN ─────
     (ajuste 15, 12 de octubre)

     El asunto es el MISMO que el del formulario de alta: para quien lo
     recibe es el mismo correo, con la misma plantilla 'confirm'. El
     enlace se arma igual que en el recordatorio
     (admin-subscriber-reminder.js). */
  const ASUNTO_CONFIRMAR = '✅ Please confirm your Ferocia Sports subscription';

  const _enlaceConfirmar = (token) =>
    window.location.origin
    + window.location.pathname.replace('admin.html', '')
    + `confirm.html?t=${token}`;

  /* 64 letras hexadecimales, como las que pone la base de datos en el
     alta. Con el generador del navegador (el que sirve para claves), no
     con Math.random: este código es lo único que confirma a la persona. */
  const _nuevoTokenConfirmacion = () => {
    const b = new Uint8Array(32);
    window.crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  };

  /* Paso 1: la ficha pasa a pendiente con un código nuevo. Devuelve el
     código, o null si otra persona la cambió entretanto.

     ⚠️  SÓLO SI SIGUE DE BAJA. La tabla puede llevar minutos pintada:
     si otra administradora ya la devolvió (o la persona ya confirmó),
     esto no toca nada. Y como el PATCH no devuelve la fila, se pregunta
     después si el código que quedó guardado es el NUESTRO. Si no lo es,
     no se manda nada: un correo con un enlace que no confirma a nadie es
     peor que ningún correo. */
  const _apuntarDeNuevo = async (s) => {
    const token = _nuevoTokenConfirmacion();
    await api(`subscribers?id=eq.${s.id}&status=eq.unsubscribed`, 'PATCH',
      { status: 'pending', confirm_token: token, confirm_email_skipped_at: null });
    const [ahora] = await api(`subscribers?id=eq.${s.id}&select=status,confirm_token`);
    return (ahora && ahora.status === 'pending' && ahora.confirm_token === token) ? token : null;
  };

  /* Paso 2: el correo. Devuelve { llego, dudoso, detalle }.
     `dudoso`: se cortó la conexión y no sabemos si salió. */
  const _mandarConfirmacion = async (s, token) => {
    window.AdminState.emailInFlight = true;
    let r;
    try {
      r = await window.sendEmailServer({
        kind:     'subscriber_confirm',
        template: 'confirm',
        subject:  ASUNTO_CONFIRMAR,
        recipients: [{
          email: s.email,
          name:  window.nombreDestinatario(s),
          subscriber_id: s.id,
          vars:  { confirm_url: _enlaceConfirmar(token) },
        }],
        /* Una llave por código: "Retry email" repite el MISMO código y la
           MISMA llave, así que si el primer intento sí había llegado, el
           servidor no lo manda otra vez. Otra vuelta de Subscribe Again
           es otro código y otra llave. */
        idempotency_key: `reactivar-${s.id}-${token.slice(0, 16)}`,
      });
    } finally {
      window.AdminState.emailInFlight = false;
    }
    const d = (r && r.ok && r.data) || {};
    if (r && r.ok && ((d.sent || 0) + (d.already_sent || 0)) > 0) return { llego: true };
    console.error('[subscribe-again] el correo no salió:', r);
    /* Sin respuesta del servidor (se cortó, o no contestó a tiempo) no
       sabemos si salió. Con una respuesta, sí: no salió. */
    const dudoso = !!(r && !r.ok && r.code !== 'no_client'
                      && (r.code === 'network' || r.status == null))
      /* El servidor contestó que no mandó NADA y que nada falló: un
         intento anterior con la misma llave sigue en marcha. Puede
         llegar en un momento. */
      || !!(r && r.ok && !d.sent && !d.already_sent && !d.failed);
    return { llego: false, dudoso,
             detalle: r && !r.ok ? r.message : window.resumenEnvio(d) };
  };

  /* Si el correo no salió, la ventana NO se cierra: se queda diciéndolo,
     con "Retry email" para mandárselo a ESTA persona. Antes el aviso
     mandaba a "Send Reminder", que escribe a TODOS los pendientes. Lo
     señaló la revisión del ajuste 15. */
  const _pintarFalloDeCorreo = (s, token, fallo) => {
    _ssReintento = { s, token };
    document.getElementById('ss-title').textContent =
      fallo.dudoso ? 'Did the email go out?' : 'The email did not go out';
    const body = document.getElementById('ss-body');
    body.innerHTML =
      `<p class="ss-fallo">${esc(s.first_name)} ${esc(s.last_name)} is already `
      + '<strong>Pending</strong>, with a valid confirmation link. '
      + (fallo.dudoso
          ? 'We did not get a clear answer from the server, so we do not know yet if '
            + 'the confirmation email reached them. Retrying is safe: if it already '
            + 'went out, it will not be sent twice.'
          : `But the confirmation email did not go out (${esc(fallo.detalle)}).`)
      + '</p>'
      + '<p class="ss-fallo-nota">If you close this, they stay Pending without the email. '
      + 'You can send it later with "Send Reminder", which emails every pending subscriber.</p>'
      + `<div class="ss-botones">
           ${_ssBoton('closeSubStatus', 'Close', 'white')}
           ${_ssBoton('confirmSubStatus', 'Retry email', 'linear-gradient(180deg,#2456d3,var(--blue))', 'id="ss-ok"')}
         </div>`;
    /* El foco estaba en el botón que se acaba de borrar: se pone en
       Close, la respuesta que no hace nada. */
    setTimeout(() => body.querySelector('[data-action="closeSubStatus"]')?.focus(), 50);
  };

  /* Lo que pasa al pulsar "Subscribe Again" o "Retry email". */
  const _volverAApuntar = async (ok) => {
    let s, token;
    if (_ssReintento) {
      ({ s, token } = _ssReintento);
      /* Antes de reintentar se mira otra vez la ficha: si entretanto se
         dio de baja, confirmó, u otra administradora le puso un código
         nuevo, este correo ya no vale (su enlace no confirmaría nada).
         Lo señaló la segunda revisión del ajuste 15. */
      const [ahora] = await api(`subscribers?id=eq.${s.id}&select=status,confirm_token`);
      if (!ahora || ahora.status !== 'pending' || ahora.confirm_token !== token) {
        closeSubStatus(true);
        toast(`${s.first_name} ${s.last_name} was changed by someone else a moment `
            + 'ago, so the email was not sent. The list has been refreshed.', true);
        return;
      }
    } else {
      s = _ssSub;
      try {
        token = await _apuntarDeNuevo(s);
      } catch (err) {
        /* Pudo guardarse y fallar sólo la comprobación: no se ofrece
           repetir a ciegas. Se cierra y se recarga la lista para que se
           vea en qué estado quedó. Lo señaló la revisión del ajuste 15. */
        closeSubStatus(true);
        toast(`Error: ${err.message}. The list has been refreshed — check `
            + `${s.first_name} ${s.last_name}'s status before trying again.`, true);
        return;
      }
      if (!token) {
        closeSubStatus(true);
        toast(`${s.first_name} ${s.last_name} was changed by someone else a moment `
            + 'ago, so nothing was changed or sent. The list has been refreshed.', true);
        return;
      }
    }

    if (ok) ok.textContent = 'Sending email...';
    const fallo = await _mandarConfirmacion(s, token);
    if (fallo.llego) {
      closeSubStatus(true);
      toast(`✅ ${s.first_name} ${s.last_name} is now Pending. We sent them an email `
          + 'to confirm; they will receive campaigns once they click the link.');
      return;
    }
    _pintarFalloDeCorreo(s, token, fallo);
    toast(`${s.first_name} ${s.last_name} is now Pending, but the confirmation email `
        + (fallo.dudoso ? 'may not have gone out.' : 'did not go out.'), true);
  };

  const confirmSubStatus = async () => {
    const modo = _ssModo;
    if (!_ssSub || !modo) return;

    const ok = document.getElementById('ss-ok');
    let nota = '';
    if (modo === 'baja') {
      nota = (document.getElementById('ss-note')?.value || '').trim();
      /* Segundo cinturón: el botón ya nace apagado sin nota, pero si
         algún día ese enganche se rompiera, aquí no pasa igual. */
      if (!nota) { toast('Write why you are unsubscribing them first.', true); return; }
    } else if (window.AdminState.emailInFlight) {
      /* Volver a apuntar manda un correo: si hay otro envío en marcha
         en el admin, no se toca nada todavía. */
      toast('A send is still running somewhere in the admin. Please wait for it to finish.', true);
      return;
    }

    const textoBoton = ok ? ok.textContent : '';
    if (ok) { ok.disabled = true; ok.textContent = 'Saving...'; }
    _ssOcupada = true;
    try {
      if (modo === 'baja') {
        const s = _ssSub;
        /* La fecha NO se manda desde aquí: la pone la base de datos sola,
           con la regla del `sql/69`. Así vale igual para este botón, para
           el enlace del correo y para un SQL a mano, y no puede olvidarse
           en ninguno de los tres. */
        await api(`subscribers?id=eq.${s.id}`, 'PATCH',
          { status: 'unsubscribed', unsubscribe_note: nota });
        closeSubStatus(true);
        toast(`${s.first_name} ${s.last_name} will not receive any more emails.`);
      } else {
        await _volverAApuntar(ok);
      }
    } catch (err) {
      toast(`Error: ${err.message}`, true);
      const b = document.getElementById('ss-ok');
      if (b) { b.disabled = false; b.textContent = textoBoton; }
    } finally {
      _ssOcupada = false;
    }
    try {
      await loadSubscribers();
    } catch (e) {
      console.warn('[subscribe-again] no se pudo refrescar la lista:', e);
    }
  };

  window.convertSubscriber = (subId) => {
    const s = _allSubs.find(x => String(x.id) === String(subId));
    if (!s) { toast('Subscriber not found. Refresh the page.', true); return; }

    document.getElementById('sc-subtitle').textContent = `${s.first_name} ${s.last_name} · ${s.email}`;
    const body = document.getElementById('sc-body');

    // Already a player? Checked against the index loaded with the page,
    // then confirmed against the database when Create is pressed — the
    // index could be a few minutes stale.
    const existingId = _playerIndex.get(_personKey(s));
    if (existingId) {
      body.innerHTML = `
        <div style="padding:16px;background:rgba(36,188,150,0.06);border:1px solid rgba(36,188,150,0.25);border-radius:10px;font-size:13px;font-weight:600;color:var(--text);line-height:1.6;">
          This person already has a player record. Converting again would create a duplicate.
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
          <button type="button" data-action="closeSubConvert" style="padding:10px 18px;border:1px solid var(--divider-color);border-radius:99px;background:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Close</button>
          <button type="button" data-action="showPage" data-page="player-profile" data-pid="${existingId}"
            style="padding:10px 22px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3,var(--blue));color:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">View Profile</button>
        </div>`;
      document.getElementById('sub-convert-modal').classList.add('open');
      return;
    }

    const lbl = (t, req) => `<div style="font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">${t}${req ? ' <span style="color:#e53935;">*</span>' : ''}</div>`;
    const inp = 'width:100%;padding:9px 12px;border:1px solid var(--divider-color);border-radius:8px;font-family:\'Inter\',sans-serif;font-size:13px;font-weight:600;color:var(--text);outline:none;';

    body.innerHTML = `
      <div style="font-size:12px;font-weight:600;color:var(--text-muted);line-height:1.6;margin-bottom:14px;">
        Fields are prefilled from the subscription. Complete what is missing — a player record needs all of it.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>${lbl('Phone', true)}<div id="sc-phone-field"></div></div>
        <div>${lbl('Date of Birth', true)}<input type="date" id="sc-dob" style="${inp}" value="${s.date_of_birth || ''}"></div>
        <div>${lbl('City', true)}<input type="text" id="sc-city" list="city-suggestions" style="${inp}" value="${esc(s.city || '')}" placeholder="Boca Raton"></div>
        <div>${lbl('State', true)}<select id="sc-state" style="${inp}"></select></div>
        <div>${lbl('Gender')}<select id="sc-gender" style="${inp}">
          <option value="">Select</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select></div>
        <div>${lbl('Skill Level')}<select id="sc-skill" style="${inp}">
          <option value="" selected>Select level</option>
          <option value="Beginner">Beginner</option>
          <option value="Advanced Beginner">Advanced Beginner</option>
          <option value="Intermediate">Intermediate</option>
          <option value="Advanced Intermediate">Advanced Intermediate</option>
          <option value="Advanced">Advanced</option>
        </select></div>
        ${/* El self-rating se muestra JUNTO al campo del coach, no en otra
              pantalla: es en este momento, mientras decide el número,
              cuando al entrenador le sirve saber cómo se ve la persona a
              sí misma.

              Es una referencia, NO un valor por defecto: la casilla sigue
              vacía. Rellenarla con el self-rating invitaría a aceptarlo
              sin pensar, y entonces el coach_rating dejaría de ser una
              evaluación para pasar a ser una copia. */''}
        <div>${lbl('Coach Rating', true)}<input type="number" id="sc-rating" min="1" max="8" step="0.001" placeholder="3.500" style="${inp}">
          ${s.self_rating !== null && s.self_rating !== undefined
            ? `<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-top:5px;line-height:1.4;">
                 They rated themselves
                 <span style="font-weight:800;color:var(--text);">${esc(FS.rating(s.self_rating))}</span>
               </div>`
            : `<div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-top:5px;line-height:1.4;">
                 They did not rate themselves
               </div>`}
        </div>
        <div>${lbl('Player Status', true)}<select id="sc-status" style="${inp}">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select></div>
      </div>
      <div style="margin-top:16px;padding:12px 14px;background:#fff4e6;border-left:3px solid var(--orange);border-radius:0 8px 8px 0;font-size:12px;font-weight:600;color:#9a6200;line-height:1.6;">
        ⚠️ This cannot be undone from the app — there is no option to delete a player. Reversing it would need direct database access.
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button type="button" data-action="closeSubConvert" style="padding:10px 18px;border:1px solid var(--divider-color);border-radius:99px;background:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Cancel</button>
        <button type="button" id="sc-create-btn" data-action="doConvertSubscriber" data-subid="${s.id}"
          style="padding:10px 22px;border:none;border-radius:99px;background:linear-gradient(180deg,#2456d3,var(--blue));color:white;font-family:'Inter',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">Create Player</button>
      </div>`;

    document.getElementById('sub-convert-modal').classList.add('open');

    // Mount the shared widgets after the markup exists.
    FerociaPhone.mount({
      container: 'sc-phone-field',
      required:  true,
      value:     { country_code: s.country_code, phone: s.phone },
    });
    document.getElementById('sc-state').innerHTML = FerociaLocation.stateOptions(s.state || '');
    if (s.gender) document.getElementById('sc-gender').value = s.gender;

    /* subscribe.html stores the level lower-cased ("beginner"), while the
       player records use "Beginner". Assigning a value no <option> has
       leaves a select showing BLANK — not the first option — which is why
       this dropdown appeared empty. Match case-insensitively and fall back
       to the placeholder when nothing fits. */
    const skillSel = document.getElementById('sc-skill');
    const wanted   = String(s.skill_level || '').trim().toLowerCase();
    const match    = Array.from(skillSel.options)
      .find(o => o.value && o.value.toLowerCase() === wanted);
    skillSel.value = match ? match.value : '';
    FerociaLocation.loadCitySuggestions('city-suggestions', api);
  };

  window.closeSubConvert = () =>
    document.getElementById('sub-convert-modal').classList.remove('open');

  window.doConvertSubscriber = async (subId) => {
    const s = _allSubs.find(x => String(x.id) === String(subId));
    if (!s) { toast('Subscriber not found.', true); return; }

    const phone = FerociaPhone.validate('sc-phone-field', { required: true });
    if (!phone.ok) { toast(phone.error, true); return; }
    const phoneVal = FerociaPhone.getValue('sc-phone-field');

    const dob = document.getElementById('sc-dob').value;
    if (!dob) { toast('Date of birth is required.', true); return; }

    const city = FerociaLocation.validateCity(document.getElementById('sc-city').value, { required: true });
    if (!city.ok) { toast(city.error, true); return; }
    const state = FerociaLocation.validateState(document.getElementById('sc-state').value, { required: true });
    if (!state.ok) { toast(state.error, true); return; }

    const ratingRaw = document.getElementById('sc-rating').value;
    const rating = Number(ratingRaw);
    if (!ratingRaw || !Number.isFinite(rating) || rating < 1 || rating > 8) {
      toast('Coach rating is required and must be between 1 and 8.', true);
      return;
    }

    // confirmModal() renders with textContent, so this is one flowing
    // sentence rather than a formatted block.
    const ok = await confirmModal({
      title: 'Create a player record?',
      /* Empieza con el cursor en Cancel: el propio aviso dice que no se puede deshacer — no hay forma de borrar un jugador desde la aplicación. */
      focusCancel: true,
      message: `A player record will be created for ${s.first_name} ${s.last_name}. `
             + `This cannot be undone from the app — there is no option to delete a player, `
             + `so reversing it would need direct database access. They stay on the mailing list.`,
      okLabel: 'Create player',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;

    const btn = document.getElementById('sc-create-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
      // Re-check against the database, not the index: it was loaded when the
      // page opened and another admin may have added this person since.
      const dup = await api(
        `players?email=ilike.${encodeURIComponent(s.email)}&select=id,first_name,last_name,email&limit=25`);
      if ((dup || []).some(p => _personKey(p) === _personKey(s))) {
        toast('This person already has a player record. Refreshing the list.', true);
        window.closeSubConvert();
        await loadSubscribers();
        return;
      }

      await api('players', 'POST', {
        first_name:    s.first_name,
        last_name:     s.last_name,
        email:         s.email,
        phone:         phoneVal.phone,
        country_code:  phoneVal.country_code,
        date_of_birth: dob,
        city:          city.value,
        state:         state.value,
        gender:        document.getElementById('sc-gender').value || null,
        skill_level:   document.getElementById('sc-skill').value  || null,
        coach_rating:  Number(rating.toFixed(3)),
        coach_rating_updated_at: new Date().toISOString(),
        status:        document.getElementById('sc-status').value,
        // The date they became a player, not the date they subscribed.
        date_joined:   todayISO(),

        /* La historia de cómo llegó esta persona, que hasta ahora se
           quedaba en el suscriptor. Se copia tal cual, sin tocarla:
           son datos de un momento concreto y ya están validados por la
           base, así que volver a "limpiarlos" aquí sólo podría
           estropearlos.

           ⚠️  self_rating NO pisa a coach_rating. Conviven:
                 · self_rating  → lo que la persona cree que juega
                 · coach_rating → lo que el entrenador acaba de evaluar
               La diferencia entre ambos es justamente lo interesante.

           `?? null` en vez de `|| null` a propósito: un self_rating de
           0 es una respuesta real, y `||` lo convertiría en null,
           borrando el dato de quien se calificó con cero. */
        self_rating:       s.self_rating ?? null,
        source:            s.source            || null,
        source_campaign:   s.source_campaign   || null,
        source_detail:     s.source_detail     || null,
        heard_about:       s.heard_about       || null,
        heard_about_other: s.heard_about_other || null,
      });

      /* Push the completed details back onto the subscriber row.
         Without this the conversion filled in a date of birth, city and
         state on the PLAYER record while the subscriber kept its blanks —
         so reopening the details modal still showed "—" for data that had
         just been entered.

         Non-fatal: the player was created, which is the operation that
         mattered. A failure here is logged and reported, not raised. */
      try {
        await api(`subscribers?id=eq.${s.id}`, 'PATCH', {
          phone:         phoneVal.phone,
          country_code:  phoneVal.country_code,
          date_of_birth: dob,
          city:          city.value,
          state:         state.value,
          gender:        document.getElementById('sc-gender').value || s.gender      || null,
          skill_level:   document.getElementById('sc-skill').value  || s.skill_level || null,
        });
      } catch (syncErr) {
        console.warn('[promotions] player created but subscriber sync failed:', syncErr.message);
        toast('Player created, but the subscriber record could not be updated.', true);
      }

      window.closeSubConvert();
      toast(`${s.first_name} ${s.last_name} is now a player.`);
      await loadSubscribers();   // rebuilds the index so the icon flips
    } catch (err) {
      toast(`Error creating player: ${err.message}`, true);
      if (btn) { btn.disabled = false; btn.textContent = 'Create Player'; }
    }
  };

  const loadSubscribers = async () => {
    _subsShown = 25;
    let subs = [];
    try {
      subs = await api('subscribers?select=*&order=subscribed_at.desc');
    } catch (e) {
      document.getElementById('subscribers-table').innerHTML =
        `<div class="empty" style="padding:20px;">Error: ${esc(e.message)}</div>`;
      return;
    }
    _allSubs = subs;

    // Which of these people already have a player record. Loaded here, once,
    // rather than per row: 419 subscribers would mean 419 lookups.
    // Non-fatal — if it fails the convert icon simply shows for everyone and
    // the modal catches the duplicate before creating anything.
    /* Las columnas de más (phone, country_code, gender, date_of_birth,
       city, state, skill_level) son para los datos que se muestran en
       el modal y en las columnas Phone y Skill. No es una consulta
       nueva: es la misma de antes pidiendo más campos. */
    try {
      const players = await api(
        'players?select=id,first_name,last_name,email,phone,country_code,'
        + 'gender,date_of_birth,city,state,skill_level');
      _playerIndex = new Map();
      _playerByKey = new Map();
      players.forEach(p => {
        const k = _personKey(p);
        _playerIndex.set(k, p.id);
        _playerByKey.set(k, p);
      });
    } catch (err) {
      console.warn('[promotions] could not load players for the convert icon:', err.message);
      _playerIndex = new Map();
      _playerByKey = new Map();
    }

    // Stat cards
    const countActive  = subs.filter(s => s.status === 'active').length;
    const countPending = subs.filter(s => s.status === 'pending').length;
    const countUnsub   = subs.filter(s => s.status === 'unsubscribed').length;
    const countTotal   = subs.length;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('promo-stat-active',  countActive);
    setEl('promo-stat-pending', countPending);
    setEl('promo-stat-total',   countTotal);
    setEl('promo-stat-unsub',   countUnsub);

    /* Los de este mes, para el "+N this month" y el porcentaje de abajo.
       Usa LA MISMA definición que el resumen de origen y que el filtro
       de la tabla (`_desdeDelPeriodo` / `_enPeriodo`). Tenía su propia
       copia, byte a byte igual pero aparte, así que los tres números
       podían separarse en cuanto alguien tocara uno — y arrastraba el
       mismo fallo de comparar fechas como texto. Lo encontró la
       revisión del 4 de octubre. */
    const desdeMes = _desdeDelPeriodo('month');
    const newThisMonth = subs.filter(s => _enPeriodo(s, desdeMes)).length;
    const growthPct = countTotal > 0 ? Math.round((newThisMonth / countTotal) * 100) : 0;

    // Update ctx lines with real trend data
    const ctxActive = document.getElementById('promo-ctx-active');
    if (ctxActive) ctxActive.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +${newThisMonth} this month`;
    const ctxPending = document.getElementById('promo-ctx-pending');
    if (ctxPending) ctxPending.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Awaiting email verification`;
    const ctxTotal = document.getElementById('promo-ctx-total');
    if (ctxTotal) ctxTotal.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg> +${growthPct}% growth`;

    // Growth badge on QR card
    const badge = document.getElementById('promo-growth-badge');
    if (badge) badge.textContent = `+${newThisMonth} subscriber${newThisMonth !== 1 ? 's' : ''} this month`;

    // Pending label on action card
    const pendLabel = document.getElementById('promo-pending-label');
    if (pendLabel) pendLabel.textContent = `${countPending} subscriber${countPending !== 1 ? 's' : ''} awaiting confirmation.`;

    // Legacy compat
    const elA = document.getElementById('sub-count-active');
    const elP = document.getElementById('sub-count-pending');
    const elU = document.getElementById('sub-count-unsub');
    if (elA) elA.textContent = countActive + ' Active';
    if (elP) elP.textContent = countPending + ' Pending';
    if (elU) elU.textContent = countUnsub + ' Unsubscribed';

    // Wire copy URL button
    const copyBtn = document.getElementById('promo-copy-url-btn');
    if (copyBtn && !copyBtn._wired) {
      copyBtn._wired = true;
      copyBtn.addEventListener('click', () => {
        const url = document.getElementById('subscribe-url-display')?.textContent || '';
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          copyBtn.textContent = 'Copied!';
          copyBtn.style.color = 'var(--teal)';
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.style.color = '#C6F221'; }, 2000);
        });
      });
    }

    _renderSourceSummary();
    _renderSubsTable();
  };

  const generateQR = () => {
    const baseUrl =
      window.location.origin + window.location.pathname.replace('admin.html', '') + 'subscribe.html';
    // Populate URL strip in new QR card
    const urlDisplay = document.getElementById('subscribe-url-display');
    if (urlDisplay) urlDisplay.textContent = baseUrl;
    const qrEl = document.getElementById('qr-code');
    if (!qrEl) return;
    qrEl.innerHTML = '';
    /* eslint-disable no-new, no-undef */
    new QRCode(qrEl, {
      text: baseUrl,
      width: 150,
      height: 150,
      colorDark: '#0d1f4a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H,
    });
    /* eslint-enable */
  };

  // ── Helper: relative time ───────────────────────────────────────────────
  const _relTimePromo = (iso) => {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 172800) return 'Yesterday';
    return `${Math.floor(diff/86400)} days ago`;
  };

  /* ── LA CAMPAÑA VIVE EN COMMUNICATIONS (10 de octubre) ─────────
     El formulario está en la pestaña Send de Communications, como los
     demás canales ("Campaign"), con "All channels" para volver. Antes era
     una ventana encima de Promotions; el botón "Launch Campaign" de
     Promotions lleva ahora allí. El formulario y el envío son los de
     siempre: sólo cambia dónde se ve.
     Como en el Hub: si hay algo escrito, se pregunta antes de perderlo. */
  const panelCampana = () => document.getElementById('promo-panel');
  const campanaAbierta = () => { const p = panelCampana(); return !!p && !p.hidden; };

  /* ¿Hay algo escrito que se perdería? La etiqueta de cabecera no cuenta:
     la pone sola el tipo de campaña. */
  function hayBorradorCampana() {
    if (!campanaAbierta()) return false;
    const valor = (id) => (document.getElementById(id)?.value || '').trim();
    return !!(valor('promo-subject') || valor('promo-preview-text') || valor('promo-other-flyer-url')
      || (edPromo && edPromo.getText().trim()));
  }

  async function puedeDescartarCampana() {
    if (!hayBorradorCampana()) return true;
    return window.confirmModal({
      title: 'Discard the campaign you were writing?',
      message: 'The subject and message you were writing will be lost.',
      okLabel: 'Discard',
      cancelLabel: 'Keep writing',
      danger: true,
      focusCancel: true,
    });
  }

  function cerrarCampanaYa() {
    const p = panelCampana();
    if (!p) return;
    p.hidden = true;
    document.getElementById('co-send-home').hidden = false;
  }

  /* "All channels". */
  async function cerrarCampana() {
    if (!campanaAbierta()) return;
    /* Cerrar con la campaña saliendo dejaría sin el texto que hace falta
       para reintentarla si sale a medias. */
    if (window.envioEnCurso && window.envioEnCurso('cerrar')) return;
    if (!(await puedeDescartarCampana())) return;
    cerrarCampanaYa();
    /* El cursor vuelve a la tarjeta que la abrió, como en el Hub. */
    document.querySelector('#co-send-home [data-action="openSendPromo"]')?.focus();
  }

  /* La pestaña Send y los botones de correo de otras pantallas vuelven a
     las opciones: si hay una campaña a medio escribir, se pregunta.
     Devuelve si se cerró (o si no estaba abierta). */
  window.campanaIrAOpciones = async () => {
    if (!campanaAbierta()) return true;
    if (window.AdminState?.emailInFlight || _preparandoCampana) return false;
    if (!(await puedeDescartarCampana())) return false;
    cerrarCampanaYa();
    return true;
  };

  /* Al volver a Communications desde el menú: sin nada escrito se cierra;
     con un borrador se queda, que es a lo que se vuelve. */
  window.campanaAlVolver = () => {
    if (!campanaAbierta() || window.AdminState?.emailInFlight) return;
    if (!hayBorradorCampana()) cerrarCampanaYa();
  };

  /* ─── CONTADORES Y "MESSAGE CHECKLIST" (diseño del 11 de octubre) ───
     Los mismos topes que el Hub: 120 en el asunto y 5.000 caracteres de
     texto en el mensaje. Pasado el tope, el contador se pone en rojo y
     "Launch Campaign" avisa y no manda (leerFormulario). */
  const MAX_ASUNTO_CAMPANA = 120;
  const MAX_TEXTO_CAMPANA  = 5000;
  let _suscriptores = null;   // cuántos activos; null hasta que llega la cuenta

  /* A QUIÉN (ajuste 12): "all" = todos los suscriptores activos (como
     siempre); "selected" = sólo los que se marquen en la lista. */
  let _segmentoCampana = 'all';
  let _elegidosCampana = new Set();   // ids de suscriptor marcados
  let _candidatosCampana = null;      // los activos: [{ id, first_name, last_name, email }]
  /* El reenvío desde History: la campaña original (su id, su fecha y su
     meta) o null. Mientras dura, el tipo y el flyer son los suyos y sólo
     se manda a elegidos. */
  let _reenvio = null;

  /* La cuenta de "Recipient Preview". `estilo`: 'error' (en rojo, no se
     pudo leer), 'nota' (una indicación, no una cuenta) o nada. */
  function ponerCuenta(numero, palabra, estilo) {
    const n = document.getElementById('promo-audience-count');
    const w = document.getElementById('promo-audience-word');
    /* Sólo si cambia: la zona se lee en voz alta (aria-live) y esto se
       llama en cada tecla. */
    if (n && n.textContent !== String(numero)) n.textContent = String(numero);
    if (w && w.textContent !== palabra) w.textContent = palabra;
    n?.parentElement?.classList.toggle('hub-count-error', estilo === 'error' || estilo === true);
    n?.parentElement?.classList.toggle('hub-count-note', estilo === 'nota');
  }

  const plural = (x, uno, varios) => `${x} ${x === 1 ? uno : varios}`;

  /* "Recipient Preview" y la caja verde, según a quién va. */
  function pintarDestinatarios() {
    const ok = document.getElementById('promo-preview-ok');
    const titulo = document.getElementById('promo-ok-title');
    const linea = document.getElementById('promo-ok-sub');
    if (_suscriptores === null) { if (ok) ok.hidden = true; return; }   // cargando o con error: lo dice ponerCuenta
    if (_segmentoCampana === 'all') {
      ponerCuenta(_suscriptores, _suscriptores === 1 ? 'active subscriber' : 'active subscribers', false);
      if (titulo) titulo.textContent = 'All active subscribers selected';
      if (linea) linea.textContent = 'This campaign will be sent to all your active subscribers.';
      if (ok) ok.hidden = !(_suscriptores > 0);
      return;
    }
    const n = _elegidosCampana.size;
    if (!n) {
      ponerCuenta('', 'Select at least one subscriber.', 'nota');
      if (ok) ok.hidden = true;
      return;
    }
    ponerCuenta(n, `of ${plural(_suscriptores, 'active subscriber', 'active subscribers')}`, false);
    if (titulo) titulo.textContent = `${plural(n, 'subscriber', 'subscribers')} selected`;
    if (linea) linea.textContent = 'This campaign will be sent only to the subscribers you chose.';
    if (ok) ok.hidden = false;
  }

  /* Los botones "All Subscribers" / "Selected Subscribers" y la lista. */
  function ponerSegmentoCampana(segmento) {
    if (_reenvio && segmento === 'all') return;   // un reenvío nunca va a todos
    _segmentoCampana = segmento;
    document.querySelectorAll('#promo-segments [data-segment]').forEach((b) => {
      const on = b.dataset.segment === segmento;
      b.classList.toggle('co-pfilter-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const wrap = document.getElementById('promo-selected-wrap');
    if (wrap) wrap.hidden = segmento !== 'selected';
    if (segmento === 'selected') pintarCandidatosCampana();
    pintarCampana();
  }

  function notaLista(texto) {
    const d = document.createElement('div');
    d.className = 'hub-pick-empty';
    d.textContent = texto;
    return d;
  }

  /* La lista para marcar: los suscriptores ACTIVOS (los dados de baja y
     los que no confirmaron no salen nunca). Hecha con textContent: los
     nombres los escribe cualquiera al suscribirse. */
  function pintarCandidatosCampana() {
    const lista = document.getElementById('promo-pick-list');
    if (!lista) return;
    if (_candidatosCampana === null) {
      if (!_errorAudiencia) { lista.replaceChildren(notaLista('Loading subscribers…')); return; }
      const nota = notaLista('Could not load the subscribers. ');
      const otra = document.createElement('button');
      otra.type = 'button';
      otra.className = 'hub-attach-btn';
      otra.dataset.action = 'promoReloadAudience';
      otra.textContent = 'Try again';
      nota.append(otra);
      lista.replaceChildren(nota);
      return;
    }
    if (!_candidatosCampana.length) { lista.replaceChildren(notaLista('There are no active subscribers.')); return; }
    lista.replaceChildren(..._candidatosCampana.map((p) => {
      const nombre = window.nombreDestinatario(p) || p.email;
      const fila = document.createElement('label');
      fila.className = 'hub-pick';
      fila.dataset.name = `${nombre} ${p.email}`.toLowerCase();
      const caja = document.createElement('input');
      caja.type = 'checkbox';
      caja.value = String(p.id);
      caja.checked = _elegidosCampana.has(p.id);
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
    filtrarCandidatosCampana();
  }

  function filtrarCandidatosCampana() {
    const q = (document.getElementById('promo-search')?.value || '').trim().toLowerCase();
    document.querySelectorAll('#promo-pick-list .hub-pick').forEach((f) => {
      f.hidden = !!q && !f.dataset.name.includes(q);
    });
  }

  /* Al llegar la lista de activos: quien estaba marcado y ya no está
     activo deja de estarlo. */
  function guardarCandidatosCampana(subs) {
    const orden = (a, b) => (window.nombreDestinatario(a) || a.email).localeCompare(window.nombreDestinatario(b) || b.email);
    _candidatosCampana = [...subs].sort(orden);
    const activos = new Set(_candidatosCampana.map((x) => x.id));
    _elegidosCampana = new Set([..._elegidosCampana].filter((id) => activos.has(id)));
  }

  let _vezCampana = 0;
  let _errorAudiencia = false;      // no se pudo leer la lista de activos
  let _preparandoCampana = false;   // de pulsar Launch a que sale (confirmación incluida)

  /* Rellena el formulario con la campaña que se reenvía. `c` lo prepara
     admin-communications.js: { id, subject, sent_at, html, meta }, con el
     HTML ya limpio (sin scripts ni on…), como lo enseña History. */
  function aplicarReenvio(c) {
    const meta = c.meta || {};
    const tipo = ['Tournament', 'Ladder', 'Other'].includes(meta.campaign_type) ? meta.campaign_type : 'Other';
    /* La fecha del envío; si no llegó a salir, la de cuando se creó. */
    const fecha = new Date(c.sent_at || c.created_at || NaN);
    const dia = !isNaN(fecha) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
      month: 'short', day: 'numeric', year: 'numeric' }).format(fecha) : '';
    const flyer = typeof meta.flyer_url === 'string' ? meta.flyer_url : '';
    _reenvio = {
      id: c.id,
      subject: c.subject || '',
      tipo,
      flyer,
      conFlyer: !!flyer && flyer !== SPACER_FLYER,
      cuando: dia ? `${c.sent_at ? 'sent' : 'created'} ${dia}` : '',
    };
    const $id = (id) => document.getElementById(id);
    $id('promo-campaign-type').value = tipo;
    $id('promo-selected-type').textContent = tipo;
    $id('promo-header-label').value = typeof meta.email_type === 'string' ? meta.email_type : (ETIQUETA_POR_TIPO[tipo] || '');
    $id('promo-subject').value = c.subject || '';
    if (edPromo) edPromo.setHTML(c.html || '');
    /* El texto de vista previa sólo si se escribió a mano: si era el que
       sale solo del mensaje, se deja vacío para que siga al mensaje si lo
       corriges. */
    const pv = typeof meta.preview_text === 'string' ? meta.preview_text : '';
    $id('promo-preview-text').value = pv && pv !== vistaPreviaDe(edPromo ? edPromo.getText() : '') ? pv.slice(0, 140) : '';
    /* Para saber después si se tocó algo ("Start a new campaign"). */
    _reenvio.asunto = $id('promo-subject').value;
    _reenvio.html = edPromo ? edPromo.getHTML() : '';
    pintarReenvio();
    ponerSegmentoCampana('selected');
  }

  /* "Start a new campaign": sale del reenvío y deja el formulario en
     blanco (como al abrirlo). */
  async function salirDelReenvio() {
    if (!_reenvio) return;
    if (_preparandoCampana || (window.envioEnCurso && window.envioEnCurso('cerrar'))) return;
    /* Si ya marcaste a alguien o cambiaste el texto, se pregunta. */
    const tocado = _elegidosCampana.size > 0
      || document.getElementById('promo-subject').value !== _reenvio.asunto
      || (edPromo ? edPromo.getHTML() : '') !== _reenvio.html;
    if (tocado && !(await window.confirmModal({
      title: 'Start a new campaign?',
      message: 'The resend you were preparing (and who you selected) will be lost.',
      okLabel: 'Start new',
      cancelLabel: 'Keep resending',
      focusCancel: true,
    }))) return;
    cerrarCampanaYa();
    await openSendPromo();
  }

  /* El modo reenvío: aviso arriba, tipo y flyer fijos, "All" apagado. */
  function pintarReenvio() {
    const en = !!_reenvio;
    const $id = (id) => document.getElementById(id);
    if ($id('promo-resend')) $id('promo-resend').hidden = !en;
    if ($id('promo-type-field')) $id('promo-type-field').hidden = en;
    if ($id('promo-seg-hint')) $id('promo-seg-hint').hidden = !en;
    const todos = $id('promo-seg-all');
    if (todos) todos.disabled = en;
    if (en) {
      if ($id('promo-event-selector-wrap')) $id('promo-event-selector-wrap').hidden = true;
      if ($id('promo-other-flyer-wrap')) $id('promo-other-flyer-wrap').hidden = true;
      $id('promo-resend-subject').textContent = _reenvio.subject || '(no subject)';
      $id('promo-resend-when').textContent = _reenvio.cuando ? ` \u2014 ${_reenvio.cuando}` : '';
      $id('promo-resend-sub').textContent = `${_reenvio.tipo} campaign · `
        + (_reenvio.conFlyer ? 'same flyer as the original' : 'no flyer, like the original');
    }
  }

  function pintarCampana() {
    const $id = (id) => document.getElementById(id);
    const asuntoEl = $id('promo-subject');
    if (!asuntoEl) return;
    const largoAsunto = asuntoEl.value.length;
    const largo = edPromo ? edPromo.getText().length : 0;
    const cuenta = (id, n, max) => {
      const el = $id(id);
      if (!el) return;
      el.textContent = `${n}/${max}`;
      el.classList.toggle('hub-count-over', n > max);
    };
    cuenta('promo-subject-count', largoAsunto, MAX_ASUNTO_CAMPANA);
    cuenta('promo-char-count', largo, MAX_TEXTO_CAMPANA);
    const pv = $id('promo-preview-text');
    const cp = $id('promo-preview-count');
    if (pv && cp) cp.textContent = `${pv.value.length}/140`;

    /* "Recipient Preview" y la caja verde (sólo cuando hay a quién mandar). */
    pintarDestinatarios();

    const tipo = $id('promo-campaign-type')?.value || 'Other';
    /* En un reenvío el flyer es el del original: no se elige evento. */
    const conEvento = !_reenvio && (tipo === 'Tournament' || tipo === 'Ladder');
    const hecho = {
      subject: !!asuntoEl.value.trim(),
      message: largo > 0,
      recipients: _segmentoCampana === 'all' ? _suscriptores > 0 : _elegidosCampana.size > 0,
    };
    hecho.ready = hecho.subject && hecho.message && hecho.recipients
      && largoAsunto <= MAX_ASUNTO_CAMPANA && largo <= MAX_TEXTO_CAMPANA
      && (!conEvento || !!$id('promo-event-select')?.value);
    document.querySelectorAll('#promo-checklist [data-check]').forEach((li) => {
      li.classList.toggle('hub-done', !!hecho[li.dataset.check]);
    });
  }

  /* `reenvio` (ajuste 12): la campaña de History que se quiere volver a
     mandar, ya leída: { id, subject, sent_at, html, meta }. */
  const openSendPromo = async (reenvio = null) => {
    /* Reabrir el formulario con un envío en curso limpiaba el composer y
       se llevaba por delante el asunto y el mensaje de ESE envío, que
       todavía no ha contestado. Si sale parcial, el texto que hace
       falta para reintentar ya no existe. */
    if (window.envioEnCurso && window.envioEnCurso('abrir')) return;
    /* Ni mientras se prepara un lanzamiento (la lista, la confirmación). */
    if (_preparandoCampana) return;
    const panel = panelCampana();
    if (!panel) return;

    window.showPage('communications');
    /* Ya abierta con algo escrito (venía de Promotions, por ejemplo): se
       va a ella sin borrar nada. Un reenvío, en cambio, es otra campaña:
       si hay algo escrito, se pregunta antes de perderlo. */
    if (campanaAbierta()) {
      if (!reenvio) { panel.scrollIntoView({ block: 'start' }); return; }
      if (!(await puedeDescartarCampana())) { panel.scrollIntoView({ block: 'start' }); return; }
      cerrarCampanaYa();
    }
    /* Un mensaje a medio escribir en el Hub: se pregunta antes. Con "Keep
       writing" se queda en él. */
    if (window.hubIrAOpciones && !(await window.hubIrAOpciones())) return;

    /* Lo que escribe el usuario: asunto, mensaje y texto de vista previa,
       con sus contadores.

       Está en una función porque se limpia en DOS momentos: al abrir el
       modal y al cambiar de tipo de campaña. Tenerlo escrito dos veces
       haría que añadir un campo mañana se arreglara en un sitio y se
       olvidara en el otro — que es justo el fallo que acaba de aparecer. */
    const limpiarComposer = () => {
      if (edPromo) edPromo.clear();
      const sj = document.getElementById('promo-subject');
      if (sj) sj.value = '';
      const pv = document.getElementById('promo-preview-text');
      if (pv) pv.value = '';
      // Los contadores y la lista de comprobación también: si no, el
      // campo queda vacío pero debajo sigue diciendo "412/5000", que es
      // peor que no tener contador.
      pintarCampana();
    };

    /* La cuenta de la vez anterior no vale: hasta que llegue la nueva,
       "—" y sin caja verde ni "Recipients selected". */
    _suscriptores = null;
    _candidatosCampana = null;
    ponerCuenta('—', 'active subscribers', false);
    /* A quién: todos, como siempre; la lista de elegidos, vacía. */
    _reenvio = null;
    _elegidosCampana = new Set();
    const busca = document.getElementById('promo-search');
    if (busca) busca.value = '';
    pintarReenvio();
    ponerSegmentoCampana('all');

    // Reset composer
    limpiarComposer();

    // Reset type pills to Tournament
    document.querySelectorAll('.promo-type-pill').forEach(p => {
      p.classList.remove('active');
      p.setAttribute('aria-pressed', 'false');
    });
    const firstPill = document.querySelector('.promo-type-pill');
    if (firstPill) { firstPill.classList.add('active'); firstPill.setAttribute('aria-pressed', 'true'); }
    const typeInput = document.getElementById('promo-campaign-type');
    if (typeInput) typeInput.value = 'Tournament';
    const selTypeEl = document.getElementById('promo-selected-type');
    if (selTypeEl) selTypeEl.textContent = 'Tournament';
    // Reset event selector + flyer fields
    const evSel = document.getElementById('promo-event-select');
    if (evSel) evSel.innerHTML = '<option value="">Loading...</option>';
    const flyerInp = document.getElementById('promo-event-flyer-url');
    if (flyerInp) flyerInp.value = '';
    const otherFlyerInp = document.getElementById('promo-other-flyer-url');
    if (otherFlyerInp) otherFlyerInp.value = '';
    // La etiqueta de cabecera también se reinicia al abrir: si no, el
    // segundo correo del día saldría con la etiqueta del primero.
    const headerInp = document.getElementById('promo-header-label');
    if (headerInp) headerInp.value = ETIQUETA_POR_TIPO.Tournament;

    // Wire type pill clicks — show/hide event selector or flyer URL field
    const updateCampaignTypeUI = (type) => {
      const evWrap    = document.getElementById('promo-event-selector-wrap');
      const otherWrap = document.getElementById('promo-other-flyer-wrap');
      /* Con `hidden` y no con style.display (11 de octubre): el HTML
         nuevo no lleva estilos escritos, ni puestos desde aquí. */
      if (evWrap)    evWrap.hidden    = !(type === 'Tournament' || type === 'Ladder');
      if (otherWrap) otherWrap.hidden = type !== 'Other';
      // Repopulate event dropdown for selected type
      if (type === 'Tournament' || type === 'Ladder') populateCampaignEventDropdown(type);
    };
    document.querySelectorAll('.promo-type-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.promo-type-pill').forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-pressed', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-pressed', 'true');
        if (typeInput) typeInput.value = pill.dataset.type;
        if (selTypeEl) selTypeEl.textContent = pill.dataset.type;
        /* La etiqueta de la cabecera sigue al tipo de campaña, para no
           tener que escribirla. Se sobrescribe siempre a propósito: si
           se respetara lo que ya hubiera escrito, cambiar de Tournament
           a Ladder dejaría la cabecera diciendo TOURNAMENT. Quien
           quiera una etiqueta propia la escribe DESPUÉS de elegir el
           tipo, que es el orden natural del formulario. */
        const lblInp = document.getElementById('promo-header-label');
        if (lblInp) lblInp.value = ETIQUETA_POR_TIPO[pill.dataset.type] || 'ANNOUNCEMENT';
        /* El Flyer URL es de "Other": al cambiar de tipo se borra (12 de
           octubre). Escondido y mal escrito, el navegador frenaba
           "Launch Campaign" sin decir por qué. */
        const flyerOtro = document.getElementById('promo-other-flyer-url');
        if (flyerOtro) flyerOtro.value = '';
        /* Cambiar de tipo de campaña es empezar otra campaña distinta,
           así que el asunto, el mensaje y el texto de vista previa del
           anterior no deben quedarse. Antes se arrastraban, y era fácil
           mandar un torneo con el asunto de una promoción. */
        limpiarComposer();
        updateCampaignTypeUI(pill.dataset.type);
      };
    });
    // Trigger for initial state (Tournament selected by default)
    updateCampaignTypeUI('Tournament');

    /* Los contadores del asunto y del texto de vista previa, y la lista
       de comprobación, al escribir. Con `oninput` (no addEventListener):
       abrir el formulario otra vez no suma escuchadores. */
    const prevInp = document.getElementById('promo-preview-text');
    if (prevInp) prevInp.oninput = pintarCampana;
    const subjInp = document.getElementById('promo-subject');
    if (subjInp) subjInp.oninput = pintarCampana;

    /* El contador de caracteres lo mantiene admin-rich-editor.js, que
       recibe `alEscribir` al montar el editor. Antes se enganchaba aquí
       un escuchador nuevo en CADA apertura del modal: a la quinta
       campaña, cinco copias contando lo mismo. */


    /* Cada vez que se abre el modal: casilla de ensayo desmarcada y
       clave de campaña nueva.

       Lo primero, porque una casilla que se queda marcada de la vez
       anterior es la forma más fácil de creer que has lanzado a 450
       personas cuando solo te lo mandaste a ti.

       Lo segundo, porque abrir el modal es lo que distingue "reenviar
       esta campaña a propósito" de "he hecho doble clic". */
    ensayo.reset();

    /* ⚠️  OJO: la clave NO se renueva aquí si ya hay una pendiente.

       Mi primera versión ponía una nueva cada vez que se abría el
       modal, y eso abría un agujero grave:

         1. Lanzas a 450. Salen los primeros 100.
         2. El servidor revienta a mitad y devuelve error.
         3. Cierras el modal, lo vuelves a abrir y lanzas otra vez.
         4. Clave nueva → campaña NUEVA → esos 100 reciben una
            SEGUNDA copia.

       El envío fallido deja su clave puesta, así que reintentar
       —hayas cerrado el modal o no— retoma la MISMA campaña y el
       servidor se salta a quien ya recibió.

       La clave se borra sola cuando una campaña termina bien. Por eso
       reenviar una campaña a propósito sigue funcionando: después de
       un envío correcto no queda ninguna, y aquí se pone una nueva. */
    claveador.asegurar();
    claveadorElegidos.asegurar();

    /* Se enseña YA, antes de esperar a las cuentas de la derecha (que
       salen con "—" hasta que llegan). Si se enseñara al final, con la
       red lenta las tarjetas de los canales seguirían pulsables y se
       podían acabar abriendo dos formularios a la vez. */
    document.getElementById('co-send-home').hidden = true;
    panel.hidden = false;
    /* Un reenvío desde History (ajuste 12): el formulario, ya relleno
       con la campaña; tipo y flyer los del original, y a elegidos. Con el
       panel ya visible: el texto de un editor escondido sale sin los
       saltos de párrafo. */
    if (reenvio) aplicarReenvio(reenvio);
    panel.scrollIntoView({ block: 'start' });
    /* En el móvil no: el teclado taparía el formulario (como en el Hub). */
    if (window.matchMedia('(min-width: 769px)').matches) {
      /* En un reenvío lo primero es buscar a la persona. */
      document.getElementById(reenvio ? 'promo-search' : 'promo-subject')?.focus();
    }

    await cargarAudienciaCampana();

  };

  /* La cuenta de suscriptores, la lista de "Selected Subscribers" y la
     última campaña. Al abrir, y con "Try again" si falló (ajuste 12). */
  async function cargarAudienciaCampana() {
    /* Lo que llegue de una apertura anterior ya no se pinta. */
    const vez = ++_vezCampana;
    _errorAudiencia = false;
    try {
      const [subs, campanas] = await Promise.all([
        /* Los activos, con nombre y correo: son la cuenta y también la
           lista de "Selected Subscribers". */
        api('subscribers?status=eq.active&select=id,first_name,last_name,email'),
        /* La última campaña sale de `communications`, que es donde la
           escribe ahora el servidor.

           Tres detalles que no son opcionales:
           · kind=eq.promo — `communications` guarda TODOS los correos
             del club. Sin este filtro, un aviso de ladder aparecería
             aquí como "última campaña".
           · status=in.(sent,partial) — una campaña que falló del todo
             no es la última que se envió.
           · sin los ensayos "solo a mí" ni los envíos a suscriptores
             elegidos (un reenvío no es "la última campaña", decidido el
             11 de octubre): lo filtra la base, así no se escapan aunque
             haya muchos seguidos. */
        api('communications?kind=eq.promo&status=in.(sent,partial)'
            + '&meta->>solo_admin=is.null&meta->>segment=is.null'
            + '&select=sent_at,meta&order=sent_at.desc&limit=1').catch(() => []),
      ]);
      if (vez !== _vezCampana) return;

      const count = subs.length;
      guardarCandidatosCampana(subs);
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      _suscriptores = count;
      if (_segmentoCampana === 'selected') pintarCandidatosCampana();
      pintarCampana();

      const last = (campanas || []).find((c) => c.sent_at) || null;
      setEl('promo-last-sent', last ? _relTimePromo(last.sent_at) : 'No campaigns yet');
      setEl('promo-last-type', last ? (last.meta && last.meta.campaign_type) || 'General' : '');

    } catch (e) {
      if (vez !== _vezCampana) return;
      /* En rojo y no con el aspecto de una cuenta. */
      ponerCuenta('', 'Could not load audience data.', 'error');
      _suscriptores = null;
      _candidatosCampana = null;
      _errorAudiencia = true;
      pintarCandidatosCampana();
      pintarCampana();
    }
  }

  /* Cada pedido de eventos lleva su número: sólo se usa la respuesta del
     ÚLTIMO (12 de octubre). Si pulsas Tournament y enseguida Ladder, y los
     torneos llegan después, se ignoran: si no, la lista de Ladder salía
     con torneos. */
  let _turnoEventos = 0;
  const populateCampaignEventDropdown = async (type) => {
    const sel      = document.getElementById('promo-event-select');
    const flyerInp = document.getElementById('promo-event-flyer-url');
    if (!sel) return;
    const turno = ++_turnoEventos;
    sel.innerHTML = '<option value="">Loading...</option>';
    if (flyerInp) flyerInp.value = '';
    pintarCampana();
    try {
      const today  = new Date().toISOString().slice(0, 10);
      const dbType = type.toLowerCase(); // 'tournament' or 'ladder'
      const events = await api(`events?event_type=eq.${dbType}&event_date=gte.${today}&select=id,title,event_date,flyer_url&order=event_date.asc`);
      if (turno !== _turnoEventos) return;
      if (!events.length) {
        sel.innerHTML = `<option value="">No upcoming ${type.toLowerCase()} events</option>`;
        return;
      }
      sel.innerHTML = '<option value="">Select an event...</option>'
        + events.map(ev => {
            const d = new Date(ev.event_date + 'T00:00:00');
            const label = `${ev.title} — ${d.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})}`;
            return `<option value="${ev.id}" data-title="${ev.title.replace(/"/g,'&quot;')}" data-flyer="${ev.flyer_url || ''}">${label}</option>`;
          }).join('');
      // Wire selection → auto-fill subject + store flyer URL
      sel.onchange = () => {
        const opt = sel.options[sel.selectedIndex];
        const subjectEl = document.getElementById('promo-subject');
        if (opt.value && subjectEl) {
          const emoji = type === 'Tournament' ? '🏆' : '🏓';
          subjectEl.value = `${emoji} ${opt.dataset.title} — Don't Miss It!`;
        }
        if (flyerInp) flyerInp.value = opt.dataset.flyer || '';
        pintarCampana();
      };
    } catch (err) {
      if (turno !== _turnoEventos) return;
      sel.innerHTML = '<option value="">Error loading events</option>';
    }
  };

  /* ─── EL EDITOR CON FORMATO ────────────────────────────────
     La barra y su comportamiento viven en admin-rich-editor.js, que
     usan las cinco pantallas que escriben correos. Antes estaban aquí,
     cuando Promotions era la única con editor.

     El contador de caracteres sigue siendo de esta pantalla, así que
     se le pasa al módulo en vez de moverlo allí: lo que comparten las
     cinco es la barra, no lo que cada una pinta a su lado. */
  const edPromo = window.FerociaEditor
    ? window.FerociaEditor.mount('promo-message', {
        /* SIN barraId, mount() no encontraba barra y se creaba UNA
           SEGUNDA encima de la escrita a mano: dos tiras grises
           apiladas, y sólo en esta pantalla. La de aquí ya existe en
           admin.html porque lleva además el contador de caracteres. */
        barraId: 'promo-fmt-bar',
        alEscribir: () => pintarCampana(),
      })
    : null;
  if (!edPromo) console.error('[Ferocia] admin-rich-editor.js must load before admin-promotions.js');

  /* ─── LOS DATOS QUE VIAJAN A LA PLANTILLA ──────────────────
     Un solo sitio los construye, y un solo camino los usa. Antes había
     dos caminos que armaban la misma lista por separado, y eso permitía
     que una prueba saliera perfecta y el envío de verdad llevara algo
     distinto sin que nadie lo notara.

     ⚠️  Las claves tienen que coincidir EXACTAMENTE con las que lee la
         plantilla del servidor (send-email/templates.ts, renderPromo).
         Una clave que no existe allí se ignora en silencio: no da
         error, simplemente no aparece en el correo. */

  /* Cuando no hay flyer se manda un espaciador transparente de 600x1.

     Antes se mandaba un GIF de 1x1 incrustado en el propio correo, y
     eso fallaba por dos motivos:
       · la plantilla lo estiraba al 100% de ancho y, al ser cuadrado,
         crecía también a 600 de ALTO: un hueco vacío enorme en medio
         del correo (medido: 1245px de alto contra 646px sin él);
       · Gmail elimina las imágenes incrustadas en formato data:, así
         que además aparecía rota.
     Un archivo de 600x1 ya tiene la proporción correcta y ocupa 1px. */
  const SPACER_FLYER =
    'https://yyocceadorckkfbgnbqk.supabase.co/storage/v1/object/public/'
    + 'newsletter-images/logo/spacer-600x1.png';

  /* La etiqueta de la cabecera, arriba a la derecha. Sale del tipo de
     campaña que ya se elige arriba, así que no hay que escribirla dos
     veces — pero se puede cambiar a mano para un caso suelto. */
  const ETIQUETA_POR_TIPO = {
    Tournament: 'TOURNAMENT',
    Ladder:     'LADDER',
    Other:      'ANNOUNCEMENT',
  };

  const etiquetaCabecera = (campaignType) => {
    const escrita = (document.getElementById('promo-header-label')?.value || '').trim();
    const v = escrita || ETIQUETA_POR_TIPO[campaignType] || 'ANNOUNCEMENT';
    // Mayúsculas y sin acentos: la cabecera es una etiqueta corta, y así
    // se ve igual la escriba quien la escriba.
    return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().slice(0, 24);
  };

  /* Los marcadores fuera.

     Antes el texto de vista previa se calculaba DESPUÉS de sustituir
     {first_name} por el nombre real, porque la sustitución la hacía el
     navegador persona a persona. Ahora la hace el servidor, así que
     aquí el mensaje todavía los lleva puestos — y un asunto de bandeja
     que dijera "Hi {first_name}, come play" quedaría fatal.

     Se quitan y se recoloca la puntuación: "Hi {first_name}, come
     play" → "Hi, come play". Si no te gusta cómo queda, el campo
     "Preview text" del formulario manda sobre esto. */
  const sinMarcadores = (t) => String(t || '')
    .replace(/\{\s*first_name\s*\}/gi, '')
    .replace(/\{\{\s*player_name\s*\}\}/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  /* El texto que se lee en la bandeja de entrada, antes de abrir.
     Si no se escribe uno, se saca del principio del mensaje: cualquier
     cosa es mejor que dejar que el programa de correo muestre "Hi Ana,",
     que es lo que hacía hasta ahora. */
  const textoVistaPrevia = (mensaje) => {
    const escrito = (document.getElementById('promo-preview-text')?.value || '').trim();
    if (escrito) return escrito.slice(0, 140);
    return vistaPreviaDe(mensaje);
  };
  /* La que sale sola del mensaje (también la usa el reenvío, ajuste 12). */
  function vistaPreviaDe(mensaje) {
    const limpio = sinMarcadores(mensaje);
    if (limpio.length <= 140) return limpio;
    // Corta en la última palabra entera, no a mitad de una.
    return limpio.slice(0, 140).replace(/\s+\S*$/, '') + '…';
  }

  /* ─── UN SOLO SITIO QUE LEE EL FORMULARIO ──────────────────
     La prueba y el envío real leían los mismos cuatro campos con el
     mismo código copiado dos veces, validación incluida. Eso es
     exactamente la trampa que avisa el comentario de arriba, un nivel
     más abajo: una prueba podía resolver el flyer de una manera y el
     envío de verdad de otra, y nadie se enteraría hasta que el correo
     saliera mal a 450 personas.

     Devuelve null si falta algo, y ya ha avisado con un toast. */
  const leerFormulario = () => {
    const subject = (document.getElementById('promo-subject')?.value || '').trim();


    /* SE MANDA innerHTML, NO innerText.

       `innerText` da solo el texto: sin negritas, sin listas, sin
       colores. Por eso el editor tenía botones de negrita y de lista
       desde siempre y el correo llegaba sin nada — la aplicación
       enseñaba una cosa y mandaba otra.

       El HTML se filtra ENTERO en el servidor (sanear.ts), que es lo
       único que no se puede saltar nadie. Aquí no se filtra: filtrar
       en los dos sitios daría una falsa sensación de seguridad y
       además haría más difícil ver dónde se decide qué pasa. */
    const message = edPromo ? edPromo.getHTML() : '';

    /* Para validar y para el texto de la bandeja de entrada. Un editor
       "vacío" en el navegador no es una cadena vacía: suele tener un
       <br> o un <div></div> dentro. Con el HTML no se puede saber si
       hay algo escrito; con el texto, sí. */
    const texto = edPromo ? edPromo.getText() : '';

    const campaignType = document.getElementById('promo-campaign-type')?.value || 'Other';

    let flyerUrl = '';
    if (_reenvio) {
      /* Un reenvío lleva el flyer del original, aunque su evento ya no
         esté entre los próximos (ajuste 12). */
      flyerUrl = _reenvio.flyer;
    } else if (campaignType === 'Tournament' || campaignType === 'Ladder') {
      const sel = document.getElementById('promo-event-select');
      if (!sel || !sel.value) { toast('Please select an event.', true); return null; }
      flyerUrl = document.getElementById('promo-event-flyer-url')?.value || '';
    } else if (campaignType === 'Other') {
      flyerUrl = (document.getElementById('promo-other-flyer-url')?.value || '').trim();
    }

    if (!subject || !texto) {
      toast('Please fill in the subject and message.', true);
      return null;
    }
    /* Los topes, como en el Hub (11 de octubre). El del asunto también
       aquí: el tope del campo sólo frena lo que se escribe, y el asunto
       que pone sola la lista de eventos puede pasarse. */
    if (subject.length > MAX_ASUNTO_CAMPANA) {
      toast(`The subject is too long: ${subject.length} characters. The limit is ${MAX_ASUNTO_CAMPANA}.`, true);
      return null;
    }
    if (texto.length > MAX_TEXTO_CAMPANA) {
      toast(`The message is too long: ${texto.length} characters. `
        + `The limit is ${MAX_TEXTO_CAMPANA.toLocaleString('en-US')}.`, true);
      return null;
    }
    /* El ensayo "solo a mí" sí se puede sin nadie marcado: va a ti. */
    if (_segmentoCampana === 'selected' && !_elegidosCampana.size
        && !document.getElementById('promo-only-me')?.checked) {
      toast('Select at least one subscriber.', true);
      return null;
    }
    return { subject, message, texto, campaignType, flyerUrl };
  };

  /* Lo que vale para TODA la campaña, no para una persona.

     Vive en `communications.meta`, una sola vez por campaña, y de ahí
     la lee el servidor para pintar los 450 correos. Lo que cambia por
     persona (su nombre, su enlace de baja) va aparte, en cada
     destinatario.

     ⚠️  Las claves tienen que coincidir EXACTAMENTE con las que usa la
         plantilla del servidor (templates.ts, renderPromo). Una clave
         que no existe allí se ignora en silencio: no da error,
         simplemente no aparece en el correo. */
  const metaPromo = ({ campaignType, texto, flyerUrl }) => ({
    /* Cuando no hay flyer va el espaciador, NO una cadena vacía. La
       plantilla omite la fila de la imagen si la URL está vacía, y eso
       cambiaría el alto del correo respecto a como sale hoy. */
    flyer_url:     flyerUrl || SPACER_FLYER,
    email_type:    etiquetaCabecera(campaignType),
    /* El texto de la bandeja sale del TEXTO, no del HTML: si saliera
       del HTML, la bandeja de entrada enseñaría `<p style="color...`
       antes de que nadie abriera el correo. */
    preview_text:  textoVistaPrevia(texto),
    /* Para la tarjeta "Last Campaign". `communications.kind` es 'promo'
       en todas las campañas, así que el tipo (Tournament / Ladder /
       Other) no cabe ahí: va aquí, que es la columna que existe justo
       para lo que cambia según el caso. */
    campaign_type: campaignType,
    /* LA MARCA. El servidor no tiene que adivinar si este mensaje
       lleva formato: se lo decimos, y como `meta` se guarda con la
       campaña, un reintento de dentro de dos semanas lo sabrá igual. */
    cuerpo_html:   true,
  });
  /* La clave contra envíos duplicados. El mecanismo entero —y por qué
     lleva dos trozos— está explicado en admin-email-utils.js, donde lo
     comparten las cuatro pantallas que mandan en lote. */
  const claveador = window.crearClaveador('promo');
  /* Los envíos a elegidos (y los reenvíos) llevan su propia clave
     (ajuste 12): si un reenvío sale bien, NO se borra la clave de una
     campaña a todos que se cortó y está pendiente de reintentar. */
  const claveadorElegidos = window.crearClaveador('promo-sel');
  const claveDe = (elegidos) => (elegidos ? claveadorElegidos : claveador);

  /* La casilla de ensayo y la etiqueta del botón van juntas. El
     mecanismo vive en admin-email-utils.js: lo comparten las cuatro
     pantallas que tienen casilla, y así todas dicen lo mismo. */
  const ensayo = window.vincularEnsayo('promo-only-me', 'promo-send-btn', 'Launch Campaign');

  /* nombreDestinatario() y resumenEnvio() viven en admin-email-utils.js:
     los usan las cuatro pantallas que mandan en lote. */
  const nombreDe = window.nombreDestinatario;
  const resumenEnvio = window.resumenEnvio;

  const enviarCampana = async (e) => {
    e.preventDefault();

    if (window.AdminState.emailInFlight) {
      toast('Please wait for the current send to finish.', true);
      return;
    }

    const datos = leerFormulario();
    if (!datos) return;

    /* ¿Ensayo o de verdad? La casilla se desmarca sola cada vez que se
       abre el modal, así que un ensayo de ayer no puede convertirse en
       el lanzamiento de hoy sin querer. */
    const soloAdmin = !!document.getElementById('promo-only-me')?.checked;
    /* La casilla se bloquea AQUÍ, en cuanto se lee, y no después de la
       confirmación. Entre leerla y bloquearla hay al menos un `await`,
       y en ese hueco un clic en la casilla la cambiaba: el envío salía
       con lo leído, pero el `finally` —que a propósito mira la casilla
       de verdad— dejaba el botón diciendo lo contrario de lo que se
       acababa de mandar. */
    ensayo.bloquear(true);
    /* A quién, leído UNA vez aquí (ajuste 12): null = todos los activos;
       si no, los ids marcados en "Selected Subscribers". */
    const elegidos = _segmentoCampana === 'selected' ? new Set(_elegidosCampana) : null;
    const reenvioDe = elegidos && _reenvio ? _reenvio.id : null;


    const baseUrl = window.location.origin + window.location.pathname.replace('admin.html', '');

    /* Tu copia. Va siempre, y va AL FINAL igual que antes.

       Si tu dirección está además en la lista de suscriptores, el
       servidor se queda con la PRIMERA aparición — la del suscriptor,
       con su enlace de baja real — y descarta esta. Antes recibías dos
       copias en ese caso. */
    const copiaAdmin = {
      email: CFG.ADMIN_EMAIL,
      name:  'Ferocia Admin',
      vars:  { unsubscribe_url: `${baseUrl}unsubscribe.html` },
    };

    let recipients;
    /* Fuera del bloque a propósito: el aviso del final también lo nombra,
       y ahí ya no se ve lo de dentro del `else`. En el ensayo "solo a mí"
       se queda en cero, que es lo correcto: ahí no hay lista. */
    let sinEnlace = [];
    if (soloAdmin) {
      recipients = [copiaAdmin];
    } else {
      let subs = [];
      try {
        subs = await api('subscribers?status=eq.active&select=*');
      } catch (err) {
        toast(`Error: ${err.message}`, true);
        ensayo.bloquear(false);   // soltar la casilla al salir por aquí
        return;
      }
      /* "Selected Subscribers" (ajuste 12): sólo los marcados, y sólo si
         SIGUEN activos — la lista se acaba de leer otra vez, justo ahora.
         Quien se dio de baja entretanto no recibe nada, y se dice. */
      let yaNoActivos = 0;
      if (elegidos) {
        const total = elegidos.size;
        subs = subs.filter((x) => elegidos.has(x.id));
        yaNoActivos = total - subs.length;
        if (!subs.length) {
          toast(total === 1 ? 'That subscriber is no longer active, so nothing was sent.'
                            : 'None of the selected subscribers is still active, so nothing was sent.', true);
          ensayo.bloquear(false);
          return;
        }
      }
      if (!subs.length) {
        toast('No active subscribers to send to.', true);
        ensayo.bloquear(false);   // soltar la casilla al salir por aquí
        return;
      }
      /* ⚠️  A QUIEN NO TIENE ENLACE DE BAJA NO SE LE MANDA.

         Cada enlace lleva el código de SU dueño. Sin código, esa persona
         se queda con las dos salidas cerradas: el enlace del correo la
         lleva a una página que dice "Invalid Link", y tampoco recibe el
         botón de darse de baja de Gmail, porque la cabecera que lo
         activa sólo se pone cuando el enlace lleva código. Lo único que
         le queda es el botón de spam, y una queja de spam baja la
         reputación del dominio para los otros 452.

         Antes se le mandaba igual, con el enlace pelado. El newsletter
         ya se los saltaba; ahora las dos pantallas hacen lo mismo.

         Y NO ES SILENCIOSO: el número se dice en la ventana de
         confirmación y otra vez en el aviso del final. Dejar a alguien
         fuera sin decirlo es el otro fallo, no el arreglo.

         Desde `sql/64` la base no deja crear a nadie sin código, así que
         esto es la red de seguridad, no el camino normal: si algún día
         salta, es que hay un dato raro y hay que mirarlo. */
      sinEnlace = subs.filter((s) => !s.unsubscribe_token);
      const conEnlace = subs.filter((s) => s.unsubscribe_token);
      if (!conEnlace.length) {
        toast(`None of the ${subs.length} active subscribers has a working `
            + 'unsubscribe link, so nothing was sent. Tell your developer.', true);
        ensayo.bloquear(false);
        return;
      }

      recipients = [
        ...conEnlace.map((s) => ({
          email: s.email,
          name:  nombreDe(s),
          subscriber_id: s.id,
          /* Cada enlace de baja lleva el token de SU dueño. Esto es lo
             único que cambia por persona, y por eso viaja en `vars`:
             el servidor lo guarda con su fila y así puede pintar el
             correo de cualquiera sin volver a preguntar al navegador. */
          vars: {
            unsubscribe_url: `${baseUrl}unsubscribe.html?t=${s.unsubscribe_token}`,
          },
        })),
        /* Tu copia sólo al mandar a todos: a elegidos va sin copia
           (decidido el 11 de octubre). */
        ...(elegidos ? [] : [copiaAdmin]),
      ];

      /* ─── ÚLTIMA PARADA ANTES DE 450 CORREOS ─────────────────
         Un clic en Launch mandaba la campaña inmediatamente. Un clic
         donde no era —o dos veces en la tecla equivocada— y ya está:
         no hay forma de recoger un correo enviado.

         La confirmación dice el NÚMERO, que es lo que de verdad hace
         parar a pensar. "¿Seguro?" a secas se contesta que sí sin
         leer; "462 personas" no.

         Solo aparece en el envío a la lista. En el ensayo "solo a mí"
         no: preguntar por un correo a tu propia dirección no protege
         de nada y enseña a darle a Confirmar sin leer, que es
         exactamente lo que no queremos. */
      /* El número es el de los que DE VERDAD van a recibirlo. Antes era
         `subs.length`, que contaba también a quien no tiene enlace de
         baja: la ventana prometía 453 y salían 452. */
      const cuantos = conEnlace.length;
      const fuera = yaNoActivos
        ? ` ${yaNoActivos} of the subscribers you chose ${yaNoActivos === 1 ? 'is' : 'are'} no longer active and won't receive it.`
        : '';
      const seguro = await confirmModal({
        title:   `Send this campaign to ${cuantos} subscriber${cuantos === 1 ? '' : 's'}?`,
        /* Empieza con el cursor en Cancel: manda correos y eso no se deshace. */
        focusCancel: true,
        message: (elegidos
          ? `"${datos.subject}" will be emailed to ${cuantos} selected subscriber${cuantos === 1 ? '' : 's'}. This cannot be undone.${fuera}`
          : `"${datos.subject}" will be emailed to ${cuantos} active subscriber`
            + `${cuantos === 1 ? '' : 's'}, plus a copy to you. This cannot be undone.`)
               + window.avisoSinEnlaceDeBaja(sinEnlace.length)
               /* Una sola frase seguida: confirmModal pinta con
                  textContent y sin white-space:pre-line, así que un
                  \n\n se queda en un espacio y la frase se pega a la
                  anterior. Su propio admin-incident-reports.js lo
                  documenta. */
               + ` To check it first, cancel and use "Send only to me".`,
        okLabel: `Send to ${cuantos}`,
        cancelLabel: 'Cancel',
        danger: true,
      });
      // Al cancelar hay que SOLTAR la casilla: si no, se queda gris
      // para siempre y ya no se puede marcar el ensayo.
      if (!seguro) { ensayo.bloquear(false); return; }   // el modal se queda abierto
    }

    const sendBtn  = document.getElementById('promo-send-btn');
    sendBtn.disabled = true;
    /* Ya no hay contador "127/450": el envío es UNA petición, no 450.
       Lo que se puede decir con verdad es a cuánta gente va. */
    sendBtn.innerHTML = soloAdmin
      ? 'Sending rehearsal to you...'
      : `Sending to ${recipients.length} people...`;
    window.AdminState.emailInFlight = true;

    let r;
    try {
      r = await window.sendEmailServer({
        kind:     'promo',
        template: 'promo',
        subject:  datos.subject,
        /* El mensaje CRUDO, con los {first_name} sin tocar. La
           sustitución la hace el servidor por persona. Guardar aquí el
           texto ya personalizado dejaría en la base de datos el correo
           de una sola persona en vez de la campaña. */
        body: datos.message,
        meta: {
          ...metaPromo(datos),
          /* Marca el ensayo para que no cuente como "Last Campaign". */
          ...(soloAdmin ? { solo_admin: true } : {}),
          /* Un envío a elegidos (o un reenvío) tampoco cuenta como "Last
             Campaign", y en History se sabe de qué campaña es copia. */
          ...(elegidos ? { segment: 'selected' } : {}),
          ...(reenvioDe ? { resend_of: reenvioDe } : {}),
        },
        recipients,
        idempotency_key: soloAdmin ? null
          : await claveDe(elegidos).clave([datos.subject, datos.message,
                                   datos.campaignType, datos.flyerUrl,
                                   /* A quién también, pero sólo "todos" o
                                      "elegidos", no la lista: si un envío a
                                      elegidos se corta y se reintenta con
                                      alguien más marcado, se RETOMA (el
                                      servidor añade a los nuevos y no repite
                                      a quien ya lo recibió). */
                                   elegidos ? 'selected' : 'all']),
      });
    } finally {
      /* En finally: si esto no se limpia, `emailInFlight` se queda en
         true y la página avisa de un envío en curso para siempre,
         además de bloquear el botón de prueba. */
      window.AdminState.emailInFlight = false;
      sendBtn.disabled = false;
      /* ensayo.sync() y NO `innerHTML = origHTML`.

         `origHTML` era una FOTO del botón tomada al empezar el envío.
         Si la casilla cambiaba mientras se mandaba, el finally reponía
         esa foto vieja y el botón acababa diciendo lo contrario de lo
         que marca la casilla — justo la mentira que esto existe para
         impedir. sync() mira la casilla de verdad, no una foto.

         Y con bloquear(false) la casilla vuelve a estar disponible. */
      ensayo.bloquear(false);
      ensayo.sync();
    }

    if (!r.ok) {
      /* El modal NO se cierra cuando falla. Antes se cerraba siempre y
         el mensaje escrito se perdía; ahora el texto sigue ahí y se
         puede reintentar. Y reintentar es seguro: con la misma clave,
         el servidor retoma la misma campaña en vez de crear otra. */
      console.error('[promo] send failed:', r);
      toast(r.message, true);
      return;
    }

    const d = r.data || {};
    console.log('[promo] resultado del envio:', d);

    if (soloAdmin) {
      /* El modal se queda abierto a propósito: el ensayo existe para
         mirar el correo y LUEGO lanzar de verdad. Cerrarlo obligaría a
         escribir la campaña otra vez. */
      ensayo.reset();
      toast(d.sent
        ? `✅ Rehearsal sent to ${CFG.ADMIN_EMAIL} only. Nothing went to the list. The checkbox is now off — press Launch again to send for real.`
        : `Rehearsal did not go out: ${resumenEnvio(d)}`, !d.sent);
      /* Aunque sea un ensayo, la tarjeta de la derecha vuelve a leerse:
         los contadores de la lista pueden haber cambiado. */
      return;
    }

    /* La clave y el cierre SOLO cuando la campaña salió LIMPIA.

       El servidor contesta 200 también con estado 'partial' o 'failed'
       (index.ts: json() usa 200 por defecto), así que `r.ok` no quiere
       decir "salió bien". Antes se hacían las dos cosas siempre:
       - tirar la clave abría una campaña NUEVA en el reintento, y el
         servidor ya no sabía quién tenía el correo: los 462 repetían;
       - cerrar el modal se llevaba por delante la campaña escrita,
         justo cuando hacía falta para reintentar. */
    /* La llave se renueva cuando la campaña está TERMINADA —no va a
       salir ni un correo más de ella— y no cuando llegó a todos. Las
       dos formas de equivocarse hacen daño en direcciones opuestas:
       renovar antes de tiempo duplica correos; no renovar nunca deja
       la pantalla enganchada a una campaña vieja. Ver `envioTerminado`
       en admin-email-utils.js. */
    /* Ya NO se mira `d.failed`. Esa condición sobraba y costaba una
       pulsación: `d.failed` son los fallos de ESTA pulsación, y en la
       única pulsación donde cambiaba algo —la que agota el tercer
       intento de una dirección muerta— la campaña ya estaba terminada.
       El aviso te mandaba a reintentar algo que no se va a reintentar
       nunca, y había que pulsar una cuarta vez para cerrarla.

       Mientras queden intentos no hace falta: esa fila no está ni en
       los enviados ni en los agotados, así que `envioTerminado` ya es
       falso por su cuenta. */
    const limpio = window.envioTerminado(d) && !d.unconfirmed;
    if (limpio) {
      /* Salió: de vuelta a los canales, como cuando se cerraba la
         ventana. */
      cerrarCampanaYa();
      /* Una campaña nueva tiene que renovar la clave: si no, volver a
         lanzar la misma campaña más tarde chocaría con la de este
         envío y no mandaría nada. */
      claveDe(elegidos).limpiar();
      /* "Campaign launched!" sólo si LANZÓ algo. Con todas las
         direcciones agotadas, `mensajeExito` ya dice "Nothing was sent"
         —y le quita el ✅ a propósito— pero este prefijo volvía a
         afirmar lo contrario, y más fuerte: "Campaign launched! Nothing
         was sent. 60 addresses could not be reached." */
      const falto = window.huboPerdidas(d);
      /* MÁS DE UNO, no más de cero: a esta campaña se le añade siempre
         una copia para ella (`copiaAdmin`), y esa copia cuenta en
         `d.sent`. Con todas las direcciones de la lista agotadas y sólo
         su copia entregada, `d.sent` vale 1 y el aviso decía "Campaign
         launched!" de una campaña que no llegó a ningún suscriptor. */
      /* A elegidos no va copia: ahí basta con uno (ajuste 12). */
      const salio = (d.sent || 0) + (d.already_sent || 0) > (elegidos ? 0 : 1);
      toast(`${salio ? 'Campaign launched! ' : ''}`
            + `${window.mensajeExito(d)}${window.loQueFalto(d)}${window.loQueEntro(d)}`
            + window.avisoSinEnlaceDeBaja(sinEnlace.length),
            falto || sinEnlace.length > 0);
    } else {
      console.warn('[promotions] no salio limpio:', d);
      /* Si el envío se CORTÓ, eso es lo único que importa, y la
         respuesta dice por qué. Sin esto el aviso mandaba a reintentar
         un corte que no se arregla reintentando. */
      const corte = window.motivoDelCorte(d);
      /* ⚠️  Y AQUÍ TAMBIÉN. Lo tenía sólo en el camino limpio, así que si
         el envío se cortaba, los que se quedaron fuera por no tener
         enlace de baja desaparecían del aviso — y en los reintentos que
         también se cortaran, para siempre. Lo encontró la revisión del 5
         de octubre. */
      toast((corte
        || `Campaign finished: ${resumenEnvio(d)}. Press Launch again to retry the ones that failed.`)
        + window.avisoSinEnlaceDeBaja(sinEnlace.length), true);
    }
  };


  // Own these listeners directly (DOM is already parsed by the time this
  // script runs, same as every other listener).
  /* Mientras se prepara un envío (la lista, la confirmación), no se
     puede salir del reenvío ni lanzar otro (ajuste 12). */
  const sendPromoEmail = async (e) => {
    e.preventDefault();
    if (_preparandoCampana) return;
    _preparandoCampana = true;
    try { await enviarCampana(e); } finally { _preparandoCampana = false; }
  };
  document.getElementById('promo-form')?.addEventListener('submit', sendPromoEmail);

  /* "Selected Subscribers" (ajuste 12): marcar y buscar. Una vez, al
     cargar; la lista se vuelve a pintar entera, los escuchadores no. */
  document.getElementById('promo-pick-list')?.addEventListener('change', (e) => {
    const caja = e.target.closest('input[type="checkbox"]');
    if (!caja) return;
    const id = Number(caja.value);
    if (caja.checked) _elegidosCampana.add(id); else _elegidosCampana.delete(id);
    pintarCampana();
  });
  document.getElementById('promo-search')?.addEventListener('input', filtrarCandidatosCampana);
  /* Enter en el buscador no debe mandar la campaña (está dentro del formulario). */
  document.getElementById('promo-search')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
  });

  /* "Resend to…" de History (admin-communications.js). */
  window.campanaReenviar = (campana) => openSendPromo(campana);
  document.getElementById('sub-status-filter')?.addEventListener('change', () => { _subsShown = 25; _renderSubsTable(); });
  document.getElementById('sub-search')?.addEventListener('input', () => { _subsShown = 25; _renderSubsTable(); });
  document.getElementById('sub-source-filter')?.addEventListener('change', () => { _subsShown = 25; _renderSubsTable(); });
  document.getElementById('sub-period-filter')?.addEventListener('change', () => { _subsShown = 25; _renderSubsTable(); });

  // ── Expose / register with the shared infrastructure ──────────────────
  window.loadPromotionsPage = loadPromotionsPage; // called from the page router
  window.loadSubscribers    = loadSubscribers;    // called by admin-subscriber-reminder.js

  Object.assign(window.CLICK_HANDLERS, {
    // CLICK_HANDLERS are called with ONE argument: the button element.
    viewSubscriber:      (btn) => window.viewSubscriber(btn.dataset.subid),
    // Los dos abren la ventana; ninguno cambia nada por sí solo.
    unsubscribeSubscriber: (btn) => _abrirSubStatus(btn.dataset.subid, 'baja'),
    resubscribeSubscriber: (btn) => _abrirSubStatus(btn.dataset.subid, 'alta'),
    closeSubStatus:        () => closeSubStatus(),
    confirmSubStatus:      () => confirmSubStatus(),
    // El resumen por origen: cambiar de periodo, y saltar de una
    // tarjeta al listado filtrado de esa misma gente.
    setSourcePeriod: (btn) => {
      _summaryPeriod = btn.dataset.period === 'all' ? 'all' : 'month';
      _renderSourceSummary();
    },
    filterBySource: (btn) => {
      const sel = document.getElementById('sub-source-filter');
      if (!sel) return;
      /* ⚠️  SI ESE ORIGEN NO ESTÁ EN EL DESPLEGABLE, NO SE FINGE.

         Asignarle a un `<select>` un valor que no tiene deja el valor
         en cadena vacía, y más abajo `'' || 'all'` lo convierte en
         "todos los orígenes": la tarjeta diría 2 y la tabla enseñaría
         los 453, con el desplegable en blanco y sin explicación. El
         mismo fallo que esto vino a arreglar, por otra puerta.

         Puede pasar de verdad: el resumen pinta a propósito una
         tarjeta para un origen que no reconozca, y añadir un origen
         nuevo se hace en la base y en el enlace, sin tocar admin.html.
         Lo encontró la revisión del 4 de octubre. */
      const existe = [...sel.options].some((o) => o.value === btn.dataset.source);
      if (!existe) {
        toast(`"${btn.dataset.source}" is not in the Sources filter yet, `
            + 'so the table cannot be narrowed to it. Tell your developer to add it.', true);
        return;
      }
      sel.value = btn.dataset.source;
      /* ⚠️  AQUÍ ESTABA EL FALLO, Y ES EL MOTIVO DE TODO ESTE FILTRO.

         La tarjeta cuenta el periodo del resumen; la tabla no tenía
         periodo ninguno. Así que pulsar "Direct (2)" con "This month"
         puesto enseñaba los 26 Direct de la historia. Un botón que dice
         2 y te da 26 es un botón que miente.

         LOS CUATRO FILTROS, NO DOS. La primera versión de este arreglo
         sincronizaba el origen y la fecha y se dejaba el estado y el
         buscador como estuvieran. Eso es PEOR que el fallo original:
         con el filtro "Pending — no email sent" puesto —que es el que
         el propio aviso del freno te manda usar— pulsar "Direct (4)"
         dejaba la tabla en "No subscribers found". Un número equivocado
         es un número equivocado; "no hay nadie de Direct" es una
         afirmación falsa. Lo encontró la revisión del 4 de octubre.

         El resumen cuenta por origen y por periodo, y por nada más. Así
         que la tabla tiene que quedarse exactamente así: esos dos
         puestos, y los otros dos abiertos. Los cuatro controles están a
         la vista, así que se ve lo que pasó. */
      const per = document.getElementById('sub-period-filter');
      if (per) per.value = _summaryPeriod === 'month' ? 'month' : 'all';
      const est = document.getElementById('sub-status-filter');
      if (est) est.value = 'all';
      const bus = document.getElementById('sub-search');
      if (bus) bus.value = '';
      _subsShown = 25;
      _renderSubsTable();
      // Sin esto la tabla se filtra fuera de la pantalla y parece que
      // el botón no hizo nada.
      document.getElementById('subscribers-table')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    /* El botón del aviso del freno. Deja los CUATRO filtros en el único
       estado en que esa lista está completa: el estado en "no email
       sent" y los otros tres abiertos.

       Los tres se abren a propósito, y el de fecha es el que más
       importa: el aviso mira las últimas 24 HORAS y el filtro de fecha
       corta por MES, así que el 1 de noviembre el aviso habla de
       frenadas del 31 de octubre y "This Month" las esconde. Esa lista
       nunca es una pregunta de calendario: es "a quién le falta su
       correo ahora mismo". */
    verFrenadas: () => {
      const poner = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      poner('sub-status-filter', '__frenadas');
      poner('sub-period-filter', 'all');
      poner('sub-source-filter', 'all');
      poner('sub-search', '');
      _subsShown = 25;
      _renderSubsTable();
      document.getElementById('subscribers-table')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    convertSubscriber:   (btn) => window.convertSubscriber(btn.dataset.subid),
    doConvertSubscriber: (btn) => window.doConvertSubscriber(btn.dataset.subid),
    closeSubView:        () => window.closeSubView(),
    closeSubConvert:     () => window.closeSubConvert(),
    openSendPromo: () => openSendPromo(),
    promoSegment: (btn) => { if (!btn.disabled) ponerSegmentoCampana(btn.dataset.segment); },
    promoResendExit: () => salirDelReenvio(),
    promoReloadAudience: () => {
      ponerCuenta('—', 'active subscribers', false);
      _errorAudiencia = false;
      pintarCandidatosCampana();
      cargarAudienciaCampana();
    },
    closePromoModal: () => cerrarCampana(),
    generateQR: () => generateQR(),
  });
})();
