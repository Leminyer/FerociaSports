/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: PROMOTIONS
   Depends on: config.js, db.js, admin-state.js, admin-email-utils.js
   Load order: admin-state.js -> admin-email-utils.js ->
               admin-promotions.js -> app.js

   Extracted from app.js's PROMOTIONS section.

   ── EL ENVÍO PASA POR EL SERVIDOR ─────────────────────────────────
   Este módulo ya NO usa EmailJS. Manda con sendEmailServer() de
   admin-email-utils.js, que llama a la Edge Function `send-email`.
   Sigue usando AdminState.emailInFlight, igual que antes.

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

   Tournament Notify y Email Notifications siguen con EmailJS por ahora.

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
  const _renderSourceSummary = () => {
    const cont = document.getElementById('sub-source-summary');
    if (!cont) return;

    const desde = (() => {
      if (_summaryPeriod !== 'month') return null;
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), 1).toISOString();
    })();

    const enPeriodo = _allSubs.filter(s =>
      !desde || (s.subscribed_at && s.subscribed_at >= desde));

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

  const _renderSubsTable = () => {
    const search = (document.getElementById('sub-search')?.value || '').toLowerCase().trim();
    const filter = document.getElementById('sub-status-filter')?.value || 'all';
    const srcFil = document.getElementById('sub-source-filter')?.value || 'all';
    const filtered = _allSubs.filter(s => {
      const nameMatch = `${s.first_name} ${s.last_name} ${s.email} ${s.phone || ''} ${FerociaPhone.searchable(s.country_code, s.phone)}`.toLowerCase().includes(search);
      const statusMatch = filter === 'all' || s.status === filter;
      /* Los tres filtros se combinan (Y, no O): buscar "maria", estado
         Active y origen Instagram devuelve las Marías activas que
         llegaron por Instagram, no la suma de las tres listas. */
      const srcMatch = srcFil === 'all'
        || (srcFil === SOURCE_NONE ? !s.source : s.source === srcFil);
      return nameMatch && statusMatch && srcMatch;
    });
    const slice   = filtered.slice(0, _subsShown);
    const total   = filtered.length;

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
       · otherwise          → person-with-plus, opens the convert modal */
  const ICON_EYE   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICON_ADD   = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>';
  const ICON_CHECK = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>';

  const iconBtn = (action, extra, title, icon, color) =>
    `<button type="button" data-action="${action}" ${extra} title="${title}"
       style="background:none;border:none;padding:4px 6px;cursor:pointer;color:${color};vertical-align:middle;"
       onmouseover="this.style.opacity='0.6'" onmouseout="this.style.opacity='1'">${icon}</button>`;

  const subActionIcons = (s) => {
    let html = iconBtn('viewSubscriber', `data-subid="${s.id}"`,
                       'View details', ICON_EYE, 'var(--text-muted)');

    if (s.status === 'unsubscribed') return html;   // no conversion

    const pid = _playerIndex.get(_personKey(s));
    html += pid
      ? iconBtn('showPage', `data-page="player-profile" data-pid="${pid}"`,
                'Already a player — view profile', ICON_CHECK, 'var(--teal)')
      : iconBtn('convertSubscriber', `data-subid="${s.id}"`,
                'Convert to player', ICON_ADD, 'var(--blue)');
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
      // Surfaces the legacy rows that have no token and therefore cannot
      // use the unsubscribe link in a campaign.
      + svRow('Can unsubscribe', s.unsubscribe_token ? 'Yes' : '<span style="color:#c04a0e;">No — no token</span>');

    document.getElementById('sub-view-modal').classList.add('open');
  };

  window.closeSubView = () =>
    document.getElementById('sub-view-modal').classList.remove('open');

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

    // Trend: count subscribers joined this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const newThisMonth = subs.filter(s => s.subscribed_at && s.subscribed_at >= monthStart).length;
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

  const openSendPromo = async () => {
    const modal = document.getElementById('promo-modal');
    if (!modal) return;

    /* Lo que escribe el usuario: asunto, mensaje y texto de vista previa,
       con sus contadores.

       Está en una función porque se limpia en DOS momentos: al abrir el
       modal y al cambiar de tipo de campaña. Tenerlo escrito dos veces
       haría que añadir un campo mañana se arreglara en un sitio y se
       olvidara en el otro — que es justo el fallo que acaba de aparecer. */
    const limpiarComposer = () => {
      const ed = document.getElementById('promo-message');
      if (ed) ed.innerHTML = '';
      const sj = document.getElementById('promo-subject');
      if (sj) sj.value = '';
      const pv = document.getElementById('promo-preview-text');
      if (pv) pv.value = '';
      // Los contadores también: si no, el campo queda vacío pero debajo
      // sigue diciendo "412 / 2000", que es peor que no tener contador.
      const c1 = document.getElementById('promo-char-count');
      if (c1) c1.textContent = '0 / 2000';
      const c2 = document.getElementById('promo-char-count2');
      if (c2) c2.textContent = '0 / 2000';
      const cp = document.getElementById('promo-preview-count');
      if (cp) cp.textContent = '0 / 140';
    };

    // Reset composer
    const editor = document.getElementById('promo-message');
    limpiarComposer();

    // Reset type pills to Tournament
    document.querySelectorAll('.promo-type-pill').forEach(p => p.classList.remove('active'));
    const firstPill = document.querySelector('.promo-type-pill');
    if (firstPill) firstPill.classList.add('active');
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
      if (evWrap)    evWrap.style.display    = (type === 'Tournament' || type === 'Ladder') ? 'block' : 'none';
      if (otherWrap) otherWrap.style.display = type === 'Other' ? 'block' : 'none';
      // Repopulate event dropdown for selected type
      if (type === 'Tournament' || type === 'Ladder') populateCampaignEventDropdown(type);
    };
    document.querySelectorAll('.promo-type-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.promo-type-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
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

    // Contador del texto de vista previa
    const prevInp = document.getElementById('promo-preview-text');
    if (prevInp) {
      prevInp.oninput = () => {
        const el = document.getElementById('promo-preview-count');
        if (el) el.textContent = `${prevInp.value.length} / 140`;
      };
    }

    // Wire character counter
    if (editor) {
      editor.addEventListener('input', () => {
        const len = editor.innerText.length;
        const el1 = document.getElementById('promo-char-count');
        const el2 = document.getElementById('promo-char-count2');
        if (el1) el1.textContent = `${len} / 2000`;
        if (el2) el2.textContent = `${len} / 2000`;
      });
    }


    /* Cada vez que se abre el modal: casilla de ensayo desmarcada y
       clave de campaña nueva.

       Lo primero, porque una casilla que se queda marcada de la vez
       anterior es la forma más fácil de creer que has lanzado a 450
       personas cuando solo te lo mandaste a ti.

       Lo segundo, porque abrir el modal es lo que distingue "reenviar
       esta campaña a propósito" de "he hecho doble clic". */
    const chkSolo = document.getElementById('promo-only-me');
    if (chkSolo) chkSolo.checked = false;
    actualizarEtiquetaLanzar();

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
    if (!_promoNonce) _promoNonce = _nuevoNonce();

    // Load audience + last campaign in parallel
    try {
      const [subs, campanas] = await Promise.all([
        api('subscribers?status=eq.active&select=id'),
        /* La última campaña sale de `communications`, que es donde la
           escribe ahora el servidor.

           Tres detalles que no son opcionales:
           · kind=eq.promo — `communications` guarda TODOS los correos
             del club. Sin este filtro, un aviso de ladder aparecería
             aquí como "última campaña".
           · status=in.(sent,partial) — una campaña que falló del todo
             no es la última que se envió.
           · se piden 5 y no 1, para poder descartar los ensayos
             "solo a mí" sin filtrar por dentro del JSON. */
        api('communications?kind=eq.promo&status=in.(sent,partial)'
            + '&select=sent_at,meta&order=sent_at.desc&limit=5').catch(() => []),
      ]);

      const count = subs.length;
      const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setEl('promo-audience-count', count);

      const recipEl = document.getElementById('promo-recipient-count');
      if (recipEl) recipEl.innerHTML = `<span style="font-weight:800;color:var(--teal);">${count} active subscriber${count !== 1 ? 's' : ''}</span> will receive this campaign.`;

      const last = (campanas || []).find(
        (c) => c.sent_at && !(c.meta && c.meta.solo_admin)) || null;
      setEl('promo-last-sent', last ? _relTimePromo(last.sent_at) : 'No campaigns yet');
      setEl('promo-last-type', last ? (last.meta && last.meta.campaign_type) || 'General' : '');

    } catch (e) {
      const recipEl = document.getElementById('promo-recipient-count');
      if (recipEl) recipEl.textContent = 'Could not load audience data.';
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };

  const populateCampaignEventDropdown = async (type) => {
    const sel      = document.getElementById('promo-event-select');
    const flyerInp = document.getElementById('promo-event-flyer-url');
    if (!sel) return;
    sel.innerHTML = '<option value="">Loading...</option>';
    if (flyerInp) flyerInp.value = '';
    try {
      const today  = new Date().toISOString().slice(0, 10);
      const dbType = type.toLowerCase(); // 'tournament' or 'ladder'
      const events = await api(`events?event_type=eq.${dbType}&event_date=gte.${today}&select=id,title,event_date,flyer_url&order=event_date.asc`);
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
      };
    } catch (err) {
      sel.innerHTML = '<option value="">Error loading events</option>';
    }
  };

  /* ═══ LA BARRA DE FORMATO DEL EDITOR ═══════════════════════
     EL PROBLEMA QUE RESUELVE ESTO

     Un comando de formato se aplica a lo que esté SELECCIONADO en el
     editor. Pero al tocar cualquier control de la barra, el editor
     pierde el foco y con él la selección, así que el comando llega
     sin nada a lo que aplicarse.

     Con los botones el fallo se disimula —el navegador recuerda la
     última selección un instante— pero con un desplegable (el tamaño
     de letra) o un panel de colores no: abres el menú, eliges, y para
     entonces la selección ya no existe hace rato.

     Así que se guarda por nuestra cuenta cada vez que el cursor se
     mueve dentro del editor, y se restaura justo antes de aplicar.

     ── POR QUÉ ESTÁ AQUÍ Y NO DENTRO DE openSendPromo ──
     Porque openSendPromo se ejecuta CADA VEZ que se abre el modal.
     Registrar escuchadores ahí los iría apilando: a la quinta
     campaña, cinco copias del mismo escuchador respondiendo a cada
     tecla. Aquí se registran una sola vez, al cargar la página. */
  let _rangoEditor = null;

  const _editorPromo = () => document.getElementById('promo-message');

  const guardarRango = () => {
    const ed = _editorPromo();
    const sel = window.getSelection && window.getSelection();
    if (!ed || !sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    // Solo si de verdad está dentro del editor, no en otro campo.
    if (ed.contains(r.commonAncestorContainer)) _rangoEditor = r.cloneRange();
  };

  {
    const ed = _editorPromo();
    if (ed) {
      ['keyup', 'mouseup', 'input', 'focus'].forEach((ev) =>
        ed.addEventListener(ev, guardarRango));
      document.addEventListener('selectionchange', () => {
        if (document.activeElement === ed) guardarRango();
      });
    }
  }

  /**
   * Aplica un comando de formato a lo que esté seleccionado.
   * Lo usan TODOS los controles de la barra, para que no haya dos
   * formas distintas de hacer lo mismo.
   *
   * `styleWithCSS` hace que el navegador escriba
   * `<span style="color:...">` en vez de la etiqueta antigua
   * `<font color=...>`. El saneador del servidor entiende las dos,
   * pero la primera es la que sobrevive limpia en los correos.
   */
  window.promoCmd = (comando, valor) => {
    const ed = _editorPromo();
    if (!ed) return;
    ed.focus();
    if (_rangoEditor) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(_rangoEditor);
    }
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
    document.execCommand(comando, false, valor === undefined ? null : valor);
    guardarRango();
  };

  /* ─── LOS CONTROLES DE LA BARRA ────────────────────────────
     Aquí, a nivel de módulo, y no dentro de openSendPromo.

     Estaban dentro, así que no existían hasta que alguien abría el
     modal por primera vez. En la práctica funcionaba —los botones
     viven dentro del modal— pero es un orden frágil: cualquier otra
     cosa que quisiera usarlos antes se encontraría con nada. Y
     además se reasignaban enteros en cada apertura. */
  window.promptInsertLink = () => {
    const url = prompt('Enter URL:');
    /* Sólo enlaces de verdad. El servidor lo vuelve a comprobar —él
       es la autoridad— pero avisar aquí evita que alguien pegue algo
       raro, le dé a enviar y descubra el problema en el correo. */
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      toast('Links must start with https:// or mailto:', true);
      return;
    }
    window.promoCmd('createLink', url.trim());
  };
  window.toggleEmojiPicker = (e) => {
    e.stopPropagation();
    const picker = document.getElementById('emoji-picker');
    if (!picker) return;
    const isOpen = picker.style.display === 'grid';
    picker.style.display = isOpen ? 'none' : 'grid';
    if (!isOpen) {
      // Close when clicking outside
      const close = (ev) => {
        if (!picker.contains(ev.target) && ev.target.id !== 'emoji-picker-btn') {
          picker.style.display = 'none';
          document.removeEventListener('click', close);
        }
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  };
  window.insertFixedEmoji = (emoji) => {
    /* Por promoCmd, que restaura la selección: al abrir el panel de
       emojis el editor pierde el cursor, y sin restaurarlo el emoji
       caía al principio del mensaje en vez de donde estabas. */
    window.promoCmd('insertText', emoji);
    // Close picker after selection
    const picker = document.getElementById('emoji-picker');
    if (picker) picker.style.display = 'none';
  };

  /* El panel de colores, hermano del de emojis. Un <input type="color">
     sería más corto, pero su ventana del sistema se lleva el foco de
     una forma que ni guardando la selección se recupera bien en todos
     los navegadores. Unas muestras fijas siempre funcionan, y además
     empujan a usar colores que pegan con la marca. */
  window.togglePromoColors = (e) => {
    e.stopPropagation();
    guardarRango();
    const panel = document.getElementById('promo-color-picker');
    if (!panel) return;
    const abierto = panel.style.display === 'grid';
    panel.style.display = abierto ? 'none' : 'grid';
    if (!abierto) {
      const cerrar = (ev) => {
        if (!panel.contains(ev.target) && ev.target.id !== 'promo-color-btn') {
          panel.style.display = 'none';
          document.removeEventListener('click', cerrar);
        }
      };
      setTimeout(() => document.addEventListener('click', cerrar), 0);
    }
  };

  window.aplicarColorPromo = (hex) => {
    window.promoCmd('foreColor', hex);
    const panel = document.getElementById('promo-color-picker');
    if (panel) panel.style.display = 'none';
  };

  /* El tamaño de letra.

     `fontSize` del navegador sólo admite la escala 1–7 de HTML, que
     cada programa de correo interpreta a su manera. Se manda esa
     escala y el saneador del servidor la traduce a píxeles fijos
     (3 = 14px, el normal), así que el correo se ve igual en todas
     partes en vez de depender de quien lo abra. */
  window.aplicarTamanoPromo = (sel) => {
    if (!sel.value) return;
    window.promoCmd('fontSize', sel.value);
    sel.selectedIndex = 0;   // vuelve a "Size" para poder repetir
  };

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
    const limpio = sinMarcadores(mensaje);
    if (limpio.length <= 140) return limpio;
    // Corta en la última palabra entera, no a mitad de una.
    return limpio.slice(0, 140).replace(/\s+\S*$/, '') + '…';
  };

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
    const editor  = document.getElementById('promo-message');

    /* SE MANDA innerHTML, NO innerText.

       `innerText` da solo el texto: sin negritas, sin listas, sin
       colores. Por eso el editor tenía botones de negrita y de lista
       desde siempre y el correo llegaba sin nada — la aplicación
       enseñaba una cosa y mandaba otra.

       El HTML se filtra ENTERO en el servidor (sanear.ts), que es lo
       único que no se puede saltar nadie. Aquí no se filtra: filtrar
       en los dos sitios daría una falsa sensación de seguridad y
       además haría más difícil ver dónde se decide qué pasa. */
    const message = editor ? editor.innerHTML.trim() : '';

    /* Para validar y para el texto de la bandeja de entrada. Un editor
       "vacío" en el navegador no es una cadena vacía: suele tener un
       <br> o un <div></div> dentro. Con el HTML no se puede saber si
       hay algo escrito; con el texto, sí. */
    const texto = editor ? editor.innerText.trim() : '';

    const campaignType = document.getElementById('promo-campaign-type')?.value || 'Other';

    let flyerUrl = '';
    if (campaignType === 'Tournament' || campaignType === 'Ladder') {
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

  /* ─── CONTRA EL ENVÍO DUPLICADO ────────────────────────────
     El servidor rechaza una campaña repetida si llega con la misma
     idempotency_key. La clave se compone de dos trozos, y cada uno
     resuelve un caso distinto:

       · el NONCE, que se renueva al abrir el modal
       · el HASH del contenido

     Doble clic en Launch      → mismo nonce, mismo hash → misma clave
                                 → el segundo no manda nada. ✔
     Editas el texto y reenvías→ mismo nonce, OTRO hash → clave nueva
       sin cerrar el modal        → campaña nueva con el texto nuevo. ✔
                                 (con una clave sola por contenido, el
                                 servidor habría retomado la campaña
                                 vieja y mandado el texto ANTERIOR)
     Cierras y reabres el modal→ nonce nuevo → campaña nueva, aunque el
                                 texto sea idéntico: un reenvío a
                                 propósito tiene que poder hacerse. ✔ */
  let _promoNonce = null;

  const _nuevoNonce = () =>
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  const _hashCorto = async (txt) => {
    try {
      if (!window.crypto || !window.crypto.subtle) return null;
      const buf = await window.crypto.subtle.digest(
        'SHA-256', new TextEncoder().encode(txt));
      return [...new Uint8Array(buf)].slice(0, 8)
        .map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (_) {
      /* Sin crypto.subtle no hay clave. Se manda sin ella: el envío
         funciona igual y el botón deshabilitado sigue cubriendo el
         doble clic. Es peor, pero no es un motivo para no enviar. */
      return null;
    }
  };

  /* La clave es SOLO para el envío a la lista.

     El ensayo va sin clave, y no es un descuido. Protegerlo de
     duplicados no aporta nada —es un correo a tu propia dirección— y
     en cambio costaba algo real: dos ensayos seguidos del mismo texto
     habrían compartido clave, y el segundo no te habría llegado. Te
     quedarías mirando la bandeja sin entender por qué. El botón
     deshabilitado ya cubre el doble clic. */
  const claveCampana = async (datos) => {
    if (!_promoNonce) _promoNonce = _nuevoNonce();
    const h = await _hashCorto([
      datos.subject, datos.message, datos.campaignType, datos.flyerUrl,
    ].join('\u0000'));
    return h ? `promo-${_promoNonce}-${h}` : null;
  };

  /* ─── LA ETIQUETA DEL BOTÓN SIGUE A LA CASILLA ─────────────
     Un botón que dice "Launch Campaign" mientras la casilla de ensayo
     está marcada es una trampa: dice una cosa y hace otra. Con la
     casilla puesta, el botón lo dice.

     Se guarda el HTML original una sola vez y se sustituye solo el
     texto, para no perder el icono.

     ⚠️  El texto "Launch Campaign" tiene que coincidir con el de
         admin.html. Si allí cambia, aquí hay que cambiarlo también. */
  let _lanzarHTMLOriginal = null;

  const actualizarEtiquetaLanzar = () => {
    const btn = document.getElementById('promo-send-btn');
    if (!btn) return;
    if (_lanzarHTMLOriginal === null) _lanzarHTMLOriginal = btn.innerHTML;
    const solo = !!document.getElementById('promo-only-me')?.checked;
    btn.innerHTML = solo
      ? _lanzarHTMLOriginal.replace('Launch Campaign', 'Launch — only to me')
      : _lanzarHTMLOriginal;
  };

  /* El nombre para el saludo del correo.

     `[a, b].filter(Boolean).join(' ')` y no `${a} ${b}`: un suscriptor
     sin apellido salía saludado como "Hi Ana null," porque la
     interpolación convierte el null en texto. Con la lista filtrada
     queda "Hi Ana,". */
  const nombreDe = (s) =>
    [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || 'Player';

  /* Una línea que resuma lo que devolvió el servidor.

     Se mira campo por campo porque cada uno significa algo distinto y
     mezclarlos sería mentir:
       sent        salieron en esta ejecución
       already_sent ya habían salido antes (un reintento)
       failed      rebotaron o Resend los rechazó
       unconfirmed salieron, pero no se pudo escribir su fila: se
                   recuperan solos en el siguiente intento
       invalid_addresses descartados antes de empezar por no ser un
                   correo válido — nunca se intentaron */
  const resumenEnvio = (d) => {
    const partes = [];
    if (d.sent)         partes.push(`${d.sent} sent`);
    if (d.already_sent) partes.push(`${d.already_sent} already sent earlier`);
    if (d.failed)       partes.push(`${d.failed} failed`);
    if (d.unconfirmed)  partes.push(`${d.unconfirmed} unconfirmed (will retry)`);
    if (d.invalid_addresses) partes.push(`${d.invalid_addresses} invalid address${d.invalid_addresses === 1 ? '' : 'es'}`);
    return partes.length ? partes.join(', ') : 'nothing to send';
  };

  const sendPromoEmail = async (e) => {
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
    if (soloAdmin) {
      recipients = [copiaAdmin];
    } else {
      let subs = [];
      try {
        subs = await api('subscribers?status=eq.active&select=*');
      } catch (err) {
        toast(`Error: ${err.message}`, true);
        return;
      }
      if (!subs.length) {
        toast('No active subscribers to send to.', true);
        return;
      }
      recipients = [
        ...subs.map((s) => ({
          email: s.email,
          name:  nombreDe(s),
          subscriber_id: s.id,
          /* Cada enlace de baja lleva el token de SU dueño. Esto es lo
             único que cambia por persona, y por eso viaja en `vars`:
             el servidor lo guarda con su fila y así puede pintar el
             correo de cualquiera sin volver a preguntar al navegador. */
          vars: {
            unsubscribe_url: s.unsubscribe_token
              ? `${baseUrl}unsubscribe.html?t=${s.unsubscribe_token}`
              : `${baseUrl}unsubscribe.html`,
          },
        })),
        copiaAdmin,
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
      const cuantos = subs.length;
      const seguro = await confirmModal({
        title:   `Send this campaign to ${cuantos} subscriber${cuantos === 1 ? '' : 's'}?`,
        message: `"${datos.subject}" will be emailed to ${cuantos} active subscriber`
               + `${cuantos === 1 ? '' : 's'}, plus a copy to you. This cannot be undone.`
               + `\n\nTo check it first, cancel and use "Send only to me".`,
        okLabel: `Send to ${cuantos}`,
        cancelLabel: 'Cancel',
        danger: true,
      });
      if (!seguro) return;   // el modal se queda abierto, no se pierde nada
    }

    const sendBtn  = document.getElementById('promo-send-btn');
    const origHTML = sendBtn.innerHTML;
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
        },
        recipients,
        idempotency_key: soloAdmin ? null : await claveCampana(datos),
      });
    } finally {
      /* En finally: si esto no se limpia, `emailInFlight` se queda en
         true y la página avisa de un envío en curso para siempre,
         además de bloquear el botón de prueba. */
      window.AdminState.emailInFlight = false;
      sendBtn.disabled = false;
      sendBtn.innerHTML = origHTML;
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
      const chk = document.getElementById('promo-only-me');
      if (chk) { chk.checked = false; actualizarEtiquetaLanzar(); }
      toast(d.sent
        ? `✅ Rehearsal sent to ${CFG.ADMIN_EMAIL} only. Nothing went to the list. The checkbox is now off — press Launch again to send for real.`
        : `Rehearsal did not go out: ${resumenEnvio(d)}`, !d.sent);
      /* Aunque sea un ensayo, la tarjeta de la derecha vuelve a leerse:
         los contadores de la lista pueden haber cambiado. */
      return;
    }

    // Envío real: se cierra el modal, como hasta ahora.
    const modal = document.getElementById('promo-modal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }

    /* Un envío nuevo tiene que renovar la clave: si no, volver a
       lanzar la misma campaña más tarde chocaría con la de este envío
       y no mandaría nada. */
    _promoNonce = null;

    const limpio = d.status === 'sent' && !d.failed && !d.unconfirmed;
    if (limpio) {
      toast(`✅ Campaign launched! ${d.sent} email${d.sent === 1 ? '' : 's'} sent.`);
    } else {
      toast(`Campaign finished: ${resumenEnvio(d)}.`, true);
    }
  };


  // Own these listeners directly (DOM is already parsed by the time this
  // script runs, same as every other listener).
  document.getElementById('promo-form')?.addEventListener('submit', sendPromoEmail);
  document.getElementById('promo-only-me')?.addEventListener('change', actualizarEtiquetaLanzar);
  document.getElementById('sub-status-filter')?.addEventListener('change', () => { _subsShown = 25; _renderSubsTable(); });
  document.getElementById('sub-search')?.addEventListener('input', () => { _subsShown = 25; _renderSubsTable(); });
  document.getElementById('sub-source-filter')?.addEventListener('change', () => { _subsShown = 25; _renderSubsTable(); });

  // ── Expose / register with the shared infrastructure ──────────────────
  window.loadPromotionsPage = loadPromotionsPage; // called from the page router
  window.loadSubscribers    = loadSubscribers;    // called by sendPendingReminder, which stays in app.js

  Object.assign(window.CLICK_HANDLERS, {
    // CLICK_HANDLERS are called with ONE argument: the button element.
    viewSubscriber:      (btn) => window.viewSubscriber(btn.dataset.subid),
    // El resumen por origen: cambiar de periodo, y saltar de una
    // tarjeta al listado filtrado de esa misma gente.
    setSourcePeriod: (btn) => {
      _summaryPeriod = btn.dataset.period === 'all' ? 'all' : 'month';
      _renderSourceSummary();
    },
    filterBySource: (btn) => {
      const sel = document.getElementById('sub-source-filter');
      if (!sel) return;
      sel.value = btn.dataset.source;
      _subsShown = 25;
      _renderSubsTable();
      // Sin esto la tabla se filtra fuera de la pantalla y parece que
      // el botón no hizo nada.
      document.getElementById('subscribers-table')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    convertSubscriber:   (btn) => window.convertSubscriber(btn.dataset.subid),
    doConvertSubscriber: (btn) => window.doConvertSubscriber(btn.dataset.subid),
    closeSubView:        () => window.closeSubView(),
    closeSubConvert:     () => window.closeSubConvert(),
    openSendPromo: () => openSendPromo(),
    generateQR: () => generateQR(),
  });
})();
