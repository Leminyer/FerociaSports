/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: REVIEWS → INSIGHTS (§129) · 24 nov 2026
   Etapa 3 de torneos. Aprobado: 1A 2A 3A 4A 5A 6B · diseño 1A 2A 3A 4A.

   Qué dicen las reviews, en una pestaña dentro de Reviews:
     · periodo: Last 30 days / 90 days / This year / All time (empieza en
       All time); se cuenta por el día (hora del club) en que se contestó;
     · números grandes: reviews, % de respuesta (de los que recibieron el
       pedido; sin ensayos), promedio (SÓLO aquí, nunca en la web), % de
       4–5 estrellas, con comentario y con "qué mejorar";
     · alerta: reviews de 1–2 estrellas que eran nuevas al abrir;
     · por evento, mes a mes, torneos vs escaleras;
     · temas por palabras clave (lista aprobada; el texto no sale de la
       app): "What players praise" (comentarios de 4–5 ★) y "What players
       ask to improve" (la parte privada y los comentarios de 1–2 ★);
     · "Download CSV" del periodo (trae las notas privadas: sólo para ella).
   Tocar un evento, un tema o la alerta abre la lista ya filtrada.

   Datos: admin_reviews_list() (SQL 125, ya la carga admin-reviews.js) y
   admin_reviews_pedidos() (SQL 146, a quién se le pidió). Sin el SQL 146
   todo funciona salvo el % de respuesta, que dice "—".
   Todo lo que escribió un jugador se pone con textContent.
   Depende de: db.js (supabase, toast), admin-state.js (CLICK_HANDLERS),
   admin-reviews.js (window.FerociaReviews).
   ============================================================ */

(function () {
  'use strict';

  const ZONA = 'America/New_York';
  const $ = (id) => document.getElementById(id);
  const sb = () => window.supabase;

  /* ── 1. LOS TEMAS (aprobados el 24 nov; se cambian aquí) ─────
     Se busca sin mayúsculas ni tildes. "palabra*" = la palabra y lo que
     empieza igual (organiz* → organized, organization…). Una frase
     ("on time") se busca entera. */
  const TEMAS = [
    { clave: 'courts', nombre: 'Courts & facilities', palabras: ['court*', 'net', 'nets', 'surface*', 'lines', 'light', 'lights', 'lighting', 'parking', 'restroom*', 'bathroom*', 'shade', 'heat', 'hot', 'wind*', 'bench*', 'water', 'cancha*', 'red', 'redes', 'luz', 'luces', 'bano*', 'estacionamiento', 'sombra', 'calor'] },
    { clave: 'organization', nombre: 'Organization & schedule', palabras: ['organiz*', 'organis*', 'schedul*', 'on time', 'late', 'delay*', 'wait*', 'start*', 'round', 'rounds', 'format*', 'smooth*', 'fast', 'slow*', 'organizad*', 'horario*', 'tarde', 'espera*', 'demora*', 'formato*'] },
    { clave: 'level', nombre: 'Level & matchups', palabras: ['level*', 'skill*', 'competitiv*', 'fair*', 'matchup*', 'balanced', 'even', 'uneven', 'rating*', 'dupr', 'partner*', 'nivel*', 'parej*', 'competitivo*'] },
    { clave: 'communication', nombre: 'Communication', palabras: ['email*', 'info', 'information', 'communicat*', 'update*', 'notice*', 'clear*', 'text', 'texts', 'message*', 'app', 'portal', 'correo*', 'informacion', 'aviso*', 'comunicacion'] },
    { clave: 'atmosphere', nombre: 'Atmosphere & people', palabras: ['fun', 'friendly', 'people', 'community', 'vibe*', 'atmosphere', 'welcom*', 'social*', 'energy', 'great time', 'divertid*', 'ambiente', 'amigabl*', 'comunidad', 'gente'] },
    { clave: 'staff', nombre: 'Staff & hosting', palabras: ['staff', 'host*', 'organizer*', 'director*', 'coach*', 'leminyer', 'helpful', 'team', 'organizadora', 'entrenador*', 'equipo'] },
    { clave: 'prizes', nombre: 'Prizes & value', palabras: ['prize*', 'medal*', 'price*', 'cost*', 'fee', 'fees', 'value', 'worth', 'shirt*', 'swag', 'premio*', 'medalla*', 'precio*', 'costo*'] },
    { clave: 'food', nombre: 'Food & drinks', palabras: ['food', 'drink*', 'snack*', 'pizza', 'coffee', 'lunch', 'comida*', 'bebida*', 'merienda*'] },
  ];

  /* Texto "plano" del MISMO largo que el original (para poder resaltar la
     palabra encontrada en el texto de verdad): minúsculas y sin tildes. */
  function plano(texto) {
    let out = '';
    for (const ch of String(texto || '')) {
      const n = ch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      out += n.length === ch.length ? n : ch.toLowerCase().slice(0, ch.length).padEnd(ch.length, ' ');
    }
    return out;
  }
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  TEMAS.forEach((t) => {
    const alts = t.palabras.map((p) => (p.endsWith('*') ? `${escRe(p.slice(0, -1))}[a-z0-9]*` : escRe(p).replace(/ /g, '\\s+')));
    t.re = new RegExp(`(^|[^a-z0-9])(${alts.join('|')})(?![a-z0-9])`, 'g');
  });

  /* Los textos se juntan primero (NFC): una tilde escrita aparte ("o" +
     "´") pasa a ser "ó". Se guarda el texto plano de cada uno. */
  const _planos = new Map();
  const nfc = (texto) => String(texto || '').normalize('NFC');
  function planoDe(texto) {
    let v = _planos.get(texto);
    if (v === undefined) { v = plano(texto); if (_planos.size > 5000) _planos.clear(); _planos.set(texto, v); }
    return v;
  }

  /* Las coincidencias de un tema en un texto (ya en NFC): [{ desde, hasta }]. */
  function buscar(texto, tema) {
    const p = planoDe(texto);
    const hits = [];
    tema.re.lastIndex = 0;
    let m;
    while ((m = tema.re.exec(p))) {
      const desde = m.index + m[1].length;
      hits.push({ desde, hasta: desde + m[2].length });
      if (m[0].length === 0) tema.re.lastIndex++;
    }
    return hits;
  }

  /* De dónde sale cada lado (2A): elogios = comentarios de 4–5 ★;
     mejorar = la parte privada + comentarios de 1–2 ★. Los de 3 ★ no
     cuentan en ningún lado. */
  function textosDe(r, lado) {
    if (lado === 'praise') return r.rating >= 4 && r.comment ? [nfc(r.comment)] : [];
    const t = [];
    if (r.improve) t.push(nfc(r.improve));
    if (r.rating <= 2 && r.comment) t.push(nfc(r.comment));
    return t;
  }
  function coincide(r, clave, lado) {
    const tema = TEMAS.find((t) => t.clave === clave);
    return !!tema && textosDe(r, lado).some((x) => buscar(x, tema).length > 0);
  }
  window.FerociaReviewTemas = { TEMAS, coincide, buscar };

  /* ── 2. FECHAS Y PERIODO ──────────────────────────────────── */
  const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
  const diaClub = (iso) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : FMT.format(d);
  };
  const hoyClub = () => diaClub(new Date().toISOString());
  /* El día (del club) en que se contestó cada review, calculado una vez. */
  const _dias = new WeakMap();
  const diaDe = (r) => { let d = _dias.get(r); if (d === undefined) { d = diaClub(r.answered_at); _dias.set(r, d); } return d; };
  const menosDias = (dia, n) => {
    const [y, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
  };
  const PERIODOS = [['30', 'Last 30 days'], ['90', '90 days'], ['year', 'This year'], ['all', 'All time']];
  let _periodo = 'all';
  /* ¿Este día (YYYY-MM-DD) cae en el periodo? (hoy se calcula una vez por vuelta) */
  function dentroDe(periodo, hoy) {
    if (periodo === 'all') return () => true;
    if (periodo === 'year') return (dia) => !!dia && dia.slice(0, 4) === hoy.slice(0, 4);
    const desde = menosDias(hoy, Number(periodo));
    return (dia) => !!dia && dia > desde && dia <= hoy;
  }
  let enPeriodo = dentroDe('all', '');
  const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fechaCorta = (dia) => (dia ? `${MESES[Number(dia.slice(5, 7)) - 1]} ${Number(dia.slice(8, 10))}` : '');

  /* ── 3. DATOS ─────────────────────────────────────────────── */
  let _pedidos = null;      // filas de admin_reviews_pedidos(); null = sin SQL 146 o error
  let _ensayos = new Set(); // link_id de reviews contestadas en un ensayo: no cuentan
  let _pidiendo = null;
  let _vuelta = 0;
  function pedirPedidos() {
    if (_pidiendo) return _pidiendo;
    const mia = ++_vuelta;
    /* Las dos por separado: si una falla, la otra sigue valiendo. */
    _pidiendo = Promise.all([sb().rpc('admin_reviews_pedidos'), sb().rpc('admin_reviews_ensayos')]
      .map((q) => Promise.resolve(q).catch((error) => ({ error })))).then(([a, b]) => {
      if (mia !== _vuelta) return;
      if (a.error) console.warn('[reviews] sin pedidos (¿SQL 146?):', a.error?.message || a.error);
      if (b.error) console.warn('[reviews] sin ensayos (¿SQL 146?):', b.error?.message || b.error);
      _pedidos = a.error ? null : (a.data || []);
      _ensayos = new Set((b.error ? [] : (b.data || [])).map((x) => Number(typeof x === 'object' && x ? Object.values(x)[0] : x)));
    });
    return _pidiendo;
  }

  const plural = (n, una, varias) => `${n} ${n === 1 ? una : (varias || `${una}s`)}`;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const promedio = (filas) => (filas.length ? filas.reduce((s, r) => s + r.rating, 0) / filas.length : null);
  const unDecimal = (v) => (v == null ? '—' : v.toFixed(1));

  const el = (tag, clase, texto) => {
    const x = document.createElement(tag);
    if (clase) x.className = clase;
    if (texto !== undefined && texto !== null) x.textContent = texto;
    return x;
  };
  const boton = (clase, texto, accion, datos) => {
    const b = el('button', clase, texto);
    b.type = 'button';
    b.dataset.action = accion;
    Object.entries(datos || {}).forEach(([k, v]) => { b.dataset[k] = v; });
    return b;
  };

  /* ── 4. PINTAR ────────────────────────────────────────────── */
  let _abierta = false;

  function cerrar() { _abierta = false; }

  async function abrir() {
    _abierta = true;
    if (_pedidos === null && !_pidiendo) $('rvi-body').replaceChildren(el('div', 'loading', 'Loading...'));
    await pedirPedidos();
    pintar();
  }

  function pintar() {
    if (!_abierta || $('rvw-p-ins').hidden) return;
    const R = window.FerociaReviews;
    const caja = $('rvi-body');
    if (R && R.estado() !== 'ok') {
      caja.replaceChildren(el('div', R.estado() === 'error' ? 'empty' : 'loading',
        R.estado() === 'error' ? 'Could not load the reviews. Try again in a moment.' : 'Loading...'));
      return;
    }
    const todas = (R ? R.filas() : []).filter((r) => !_ensayos.has(Number(r.link_id)));   // sin los ensayos
    const nuevas = R ? R.nuevas() : new Set();
    enPeriodo = dentroDe(_periodo, hoyClub());
    const partes = [];

    /* Barra: periodo + CSV */
    const barra = el('div', 'rvi-barra');
    const seg = el('div', 'pa-seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Period');
    PERIODOS.forEach(([k, t]) => {
      const b = boton('pa-seg-b', t, 'rviPeriodo', { periodo: k });
      b.setAttribute('aria-pressed', k === _periodo ? 'true' : 'false');
      seg.append(b);
    });
    const csv = boton('btn btn-secondary rvi-csv', '⬇ Download CSV', 'rviCsv');
    barra.append(seg, csv);
    partes.push(barra);

    const filas = todas.filter((r) => enPeriodo(diaDe(r)));
    csv.disabled = !filas.length;

    /* Alerta (3A): 1–2 estrellas que eran nuevas al abrir */
    const bajas = todas.filter((r) => r.rating <= 2 && nuevas.has(r.link_id));
    if (bajas.length) {
      const a = el('div', 'rvi-alerta');
      a.append(el('span', null, `⚠ ${bajas.length === 1 ? '1 review' : `${bajas.length} reviews`} with 1–2 stars you hadn't seen yet.`),
        boton('rvi-link', 'See them →', 'rviVerBajas'));
      partes.push(a);
    }

    if (!todas.length) {
      partes.push(el('div', 'empty', 'No reviews yet. Send a "Review Request" from the Communications Hub after a ladder or tournament is completed.'));
      caja.replaceChildren(...partes);
      return;
    }

    /* Pedidos del periodo (4A) */
    const ped = _pedidos ? _pedidos.filter((p) => enPeriodo(String(p.requested_day || '').slice(0, 10))) : null;
    const asked = ped ? ped.reduce((s, p) => s + p.asked, 0) : 0;
    const answered = ped ? ped.reduce((s, p) => s + p.answered, 0) : 0;
    const eventos = new Set(filas.map((r) => R.claveEvento(r)));

    /* Números grandes */
    const kpi = (etiqueta, valor, sub) => {
      const k = el('div', 'pa-kpi');
      k.append(el('span', 'pa-kpi-l', etiqueta), el('span', 'pa-kpi-n', valor), el('span', 'pa-kpi-s', sub));
      return k;
    };
    const altas = filas.filter((r) => r.rating >= 4).length;
    const conCom = filas.filter((r) => !!r.comment).length;
    const conMej = filas.filter((r) => !!r.improve).length;
    const kp = el('div', 'pa-kpis rvi-kpis');
    kp.append(
      kpi('Reviews', String(filas.length), `from ${plural(eventos.size, 'event')}`),
      kpi('Response rate', ped ? pct(answered, asked) : '—', ped ? `${answered} of ${asked} asked` : 'Needs SQL 146'),
      kpi('Average', filas.length ? `${unDecimal(promedio(filas))} ★` : '—', 'panel only — never on the website'),
      kpi('4–5 stars', pct(altas, filas.length), plural(altas, 'review')),
      kpi('With a comment', String(conCom), pct(conCom, filas.length)),
      kpi('Said what to improve', String(conMej), pct(conMej, filas.length)));
    partes.push(kp);

    if (!filas.length) {
      partes.push(el('div', 'empty', 'No reviews in this period. Try "All time".'));
      caja.replaceChildren(...partes);
      return;
    }

    /* Por evento + mes a mes */
    const dos = el('div', 'rvi-dos');
    dos.append(tablaEventos(filas, ped), tendencia(filas, ped));
    partes.push(dos);

    /* Temas */
    const tres = el('div', 'rvi-dos');
    tres.append(temas(filas, 'praise'), temas(filas, 'improve'));
    partes.push(tres);

    caja.replaceChildren(...partes);
    caja.querySelectorAll('[data-w]').forEach((x) => { x.style.width = `${Number(x.dataset.w)}%`; });
    caja.querySelectorAll('[data-h]').forEach((x) => { const v = Number(x.dataset.h); x.style.height = v ? `${Math.max(3, v)}%` : '0'; });
  }

  function tarjeta(titulo, sub) {
    const c = el('section', 'card pa-card rvi-card');
    const h = el('div', 'pa-card-h');
    const id = `rvi-h-${Math.random().toString(36).slice(2, 8)}`;
    const t = el('h2', 'pa-h2', titulo);
    t.id = id;
    h.append(t);
    if (sub) h.append(el('span', 'pa-sub', sub));
    c.setAttribute('aria-labelledby', id);
    c.append(h);
    return c;
  }

  const ESTRELLAS = [5, 4, 3, 2, 1];
  function barraEstrellas(filas) {
    const b = el('span', 'rvi-dist');
    b.setAttribute('role', 'img');
    b.setAttribute('aria-label', ESTRELLAS.map((n) => `${filas.filter((r) => r.rating === n).length} with ${n} star${n === 1 ? '' : 's'}`).join(', '));
    ESTRELLAS.forEach((n) => {
      const c = filas.filter((r) => r.rating === n).length;
      if (!c) return;
      const i = el('i', `rvi-s${n}`);
      i.dataset.w = String((c / filas.length) * 100);
      b.append(i);
    });
    return b;
  }

  function tablaEventos(filas, ped) {
    const R = window.FerociaReviews;
    const c = tarjeta('By event', 'Tap an event to read its reviews');
    const mapa = new Map();
    const de = (k, base) => {
      if (!mapa.has(k)) mapa.set(k, { clave: k, label: base.label, tipo: base.tipo, fecha: base.fecha || '', asked: 0, answered: 0, filas: [] });
      return mapa.get(k);
    };
    /* El % de cada evento con TODOS sus pedidos (no sólo los del periodo):
       así una review del periodo pedida antes no deja el evento en "0". */
    const conPedidos = new Set((ped || []).map((p) => `${p.event_type}:${p.event_id}`));
    (_pedidos || []).forEach((p) => {
      const e = de(`${p.event_type}:${p.event_id}`, { label: p.event_label, tipo: p.event_type, fecha: String(p.event_date || '').slice(0, 10) });
      e.asked += p.asked; e.answered += p.answered;
      if (!e.fecha && p.event_date) e.fecha = String(p.event_date).slice(0, 10);
    });
    filas.forEach((r) => {
      const e = de(R.claveEvento(r), { label: r.event_label, tipo: r.event_type });
      e.filas.push(r);
    });
    const lista = [...mapa.values()].filter((e) => e.filas.length || conPedidos.has(e.clave))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (a.label || '').localeCompare(b.label || ''));
    const tabla = el('table', 'rvi-tabla');
    const cap = el('caption', 'pa-sr', 'Reviews by event');
    const th = el('thead'); const trh = el('tr');
    ['Event', 'Asked', 'Answered', 'Avg', 'Stars 1–5', 'To improve'].forEach((t) => { const x = el('th', null, t); x.scope = 'col'; trh.append(x); });
    th.append(trh);
    const tb = el('tbody');
    lista.forEach((e) => {
      const tr = el('tr');
      const td0 = el('th');
      td0.scope = 'row';
      const b = boton('rvi-ev', e.label || 'Event', 'rviVerEvento', { evento: e.clave });
      if (!e.filas.length) b.disabled = true;
      td0.append(b, el('small', 'rvi-ev-s', [e.tipo === 'tournament' ? 'Tournament' : 'Ladder', fechaCorta(e.fecha)].filter(Boolean).join(' · ')));
      tr.append(td0,
        el('td', null, ped ? String(e.asked) : '—'),
        el('td', null, ped ? `${e.answered} · ${pct(e.answered, e.asked)}` : String(e.filas.length)),
        el('td', null, unDecimal(promedio(e.filas))));
      const tdB = el('td'); if (e.filas.length) tdB.append(barraEstrellas(e.filas));
      tr.append(tdB, el('td', null, String(e.filas.filter((r) => !!r.improve).length)));
      tb.append(tr);
    });
    tabla.append(cap, th, tb);
    const scroll = el('div', 'rvi-scroll');
    scroll.append(tabla);
    c.append(scroll);
    return c;
  }

  function tendencia(filas, ped) {
    const c = tarjeta('Month by month', 'Bars = how many reviews · number = average stars');
    /* Meses del primero al último con reviews (máx. los 12 más recientes). */
    const meses = [...new Set(filas.map((r) => diaDe(r).slice(0, 7)))].sort();
    const todos = [];
    if (meses.length) {
      let [y, m] = meses[0].split('-').map(Number);
      const [yf, mf] = meses[meses.length - 1].split('-').map(Number);
      while (y < yf || (y === yf && m <= mf)) { todos.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
    }
    const ult = todos.slice(-12);
    const por = ult.map((k) => filas.filter((r) => diaDe(r).slice(0, 7) === k));
    const max = Math.max(1, ...por.map((x) => x.length));
    const graf = el('div', 'rvi-graf');
    graf.setAttribute('role', 'img');
    graf.setAttribute('aria-label', ult.map((k, i) => `${MESES[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}: ${plural(por[i].length, 'review')}${por[i].length ? `, average ${unDecimal(promedio(por[i]))}` : ''}`).join('; '));
    ult.forEach((k, i) => {
      const col = el('div', 'rvi-col');
      col.setAttribute('aria-hidden', 'true');
      const barra = el('div', 'rvi-barra-v');
      barra.dataset.h = String((por[i].length / max) * 100);
      col.append(el('span', 'rvi-prom', por[i].length ? unDecimal(promedio(por[i])) : ''), barra,
        el('span', 'rvi-mes', `${MESES[Number(k.slice(5)) - 1]} · ${por[i].length}`));
      graf.append(col);
    });
    c.append(graf);

    /* Torneos vs escaleras */
    c.append(el('h3', 'rvi-h3', 'Tournaments vs ladders'));
    const vs = el('div', 'rvi-vs');
    [['tournament', 'Tournaments'], ['ladder', 'Ladders']].forEach(([tipo, nombre]) => {
      const f = filas.filter((r) => r.event_type === tipo);
      const p = (ped || []).filter((x) => x.event_type === tipo);
      const a = p.reduce((s, x) => s + x.asked, 0), r = p.reduce((s, x) => s + x.answered, 0);
      const b = el('div', 'rvi-vs-c');
      b.append(el('small', null, `${nombre} · ${plural(f.length, 'review')}`), el('b', null, f.length ? `${unDecimal(promedio(f))} ★` : '—'),
        el('small', null, ped ? `${pct(r, a)} answered` : ''));
      vs.append(b);
    });
    c.append(vs);
    return c;
  }

  /* Una frase corta alrededor de la palabra, con la palabra en negrita. */
  function cita(texto, hit) {
    const t = nfc(texto);
    const ini = Math.max(0, t.lastIndexOf('.', hit.desde - 1) + 1, hit.desde - 70);
    const antes = t.slice(0, ini).replace(/[.\s]/g, '');
    let fin = t.indexOf('.', hit.hasta);
    fin = fin === -1 ? t.length : fin + 1;
    const cortada = fin > hit.hasta + 90;             // la frase sigue: se corta y lleva "…"
    if (cortada) fin = hit.hasta + 90;
    const q = el('q', 'rvi-cita');
    q.append(document.createTextNode(`${antes ? '…' : ''}${t.slice(ini, hit.desde).trimStart()}`),
      el('b', null, t.slice(hit.desde, hit.hasta)),
      document.createTextNode(`${t.slice(hit.hasta, fin)}${cortada ? '…' : ''}`));
    return q;
  }

  function temas(filas, lado) {
    const mejorar = lado === 'improve';
    const c = tarjeta(mejorar ? 'What players ask to improve' : 'What players praise',
      mejorar ? 'Private · "What could we do better?" and comments with 1–2 stars' : 'Comments with 4–5 stars');
    if (mejorar) c.querySelector('.pa-card-h h2').append(el('span', 'rvi-priv', 'PRIVATE'));
    const conTexto = filas.filter((r) => textosDe(r, lado).length);
    const filasTema = TEMAS.map((t) => {
      const rs = conTexto.filter((r) => textosDe(r, lado).some((x) => buscar(x, t).length));
      return { t, rs };
    }).filter((x) => x.rs.length).sort((a, b) => b.rs.length - a.rs.length);
    if (!conTexto.length) {
      c.append(el('p', 'rvi-vacio', mejorar ? 'Nobody said what to improve in this period.' : 'No comments with 4–5 stars in this period.'));
      return c;
    }
    filasTema.forEach(({ t, rs }) => {
      const fila = el('div', `rvi-tema${mejorar ? ' is-mejorar' : ''}`);
      const b = boton('rvi-tema-b', null, 'rviVerTema', { tema: t.clave, lado });
      b.append(el('span', 'rvi-tema-n', t.nombre), el('span', 'rvi-tema-c', String(rs.length)));
      b.setAttribute('aria-label', `${t.nombre}: ${plural(rs.length, 'review')}. Read them`);
      fila.append(b);
      /* 2 ejemplos, los más recientes */
      [...rs].sort((a, z) => String(z.answered_at).localeCompare(String(a.answered_at))).slice(0, 2).forEach((r) => {
        const x = textosDe(r, lado).find((tx) => buscar(tx, t).length);
        fila.append(cita(x, buscar(x, t)[0]));
      });
      c.append(fila);
    });
    const sinTema = conTexto.filter((r) => !TEMAS.some((t) => textosDe(r, lado).some((x) => buscar(x, t).length))).length;
    if (sinTema) c.append(el('p', 'rvi-vacio', `No theme: ${plural(sinTema, 'review')} didn't match any word — ${sinTema === 1 ? "it's" : "they're"} still in the Reviews list.`));
    return c;
  }

  /* ── 5. CSV (6B, 4A: el periodo elegido) ──────────────────── */
  const campo = (v) => {
    let s = String(v === null || v === undefined ? '' : v).replace(/\r\n?/g, '\n');
    if (/^[=+\-@\t]/.test(s)) s = `'${s}`;                 // que Excel no lo abra como fórmula
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  function csv() {
    const R = window.FerociaReviews;
    enPeriodo = dentroDe(_periodo, hoyClub());
    const filas = R.filas().filter((r) => !_ensayos.has(Number(r.link_id)) && enPeriodo(diaDe(r)));
    if (!filas.length) { window.toast('There are no reviews in this period.', true); return; }
    const fechas = new Map((_pedidos || []).map((p) => [`${p.event_type}:${p.event_id}`, String(p.event_date || '').slice(0, 10)]));
    const cab = ['Event', 'Type', 'Event date', 'Player', 'Stars', 'Comment', 'What could we do better (private)', 'On website', 'Requested', 'Answered'];
    const datos = filas.map((r) => [r.event_label || '', r.event_type === 'tournament' ? 'Tournament' : 'Ladder', fechas.get(R.claveEvento(r)) || '',
      [r.first_name, r.last_name].filter(Boolean).join(' '), r.rating, r.comment || '', r.improve || '', r.is_public ? 'Yes' : 'No',
      diaClub(r.requested_at), diaDe(r)]);
    /* Con BOM: así Excel lee bien las tildes. */
    const texto = '\uFEFF' + [cab, ...datos].map((f) => f.map(campo).join(',')).join('\r\n') + '\r\n';
    const nombre = `FEROCIA-reviews-${({ 30: 'last-30-days', 90: 'last-90-days', year: hoyClub().slice(0, 4), all: 'all-time' })[_periodo]}-${hoyClub()}.csv`;
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    window.toast(`Downloaded ${plural(filas.length, 'review')}. The file has private notes — keep it to yourself.`);
  }

  /* La lista, con el mismo periodo (si no es "All time"): así cuadra con
     los números de Insights. */
  function periodoLista() {
    if (_periodo === 'all') return null;
    const dentro = dentroDe(_periodo, hoyClub());
    return { nombre: (PERIODOS.find(([k]) => k === _periodo) || [])[1] || '', dentro: (r) => dentro(diaDe(r)) };
  }

  /* ── 6. EVENTOS ───────────────────────────────────────────── */
  Object.assign(window.CLICK_HANDLERS, {
    rviPeriodo: (b) => { _periodo = b.dataset.periodo; pintar(); document.querySelector(`.pa-seg-b[data-periodo="${_periodo}"]`)?.focus(); },
    rviCsv: () => csv(),
    rviVerBajas: () => window.FerociaReviews.verLista({ rating: 'low', ver: 'new', sinEnsayos: _ensayos }),
    rviVerEvento: (b) => window.FerociaReviews.verLista({ evento: b.dataset.evento, periodo: periodoLista(), sinEnsayos: _ensayos }),
    rviVerTema: (b) => {
      const t = TEMAS.find((x) => x.clave === b.dataset.tema);
      if (t) window.FerociaReviews.verLista({ tema: { clave: t.clave, lado: b.dataset.lado, nombre: t.nombre }, periodo: periodoLista(), sinEnsayos: _ensayos });
    },
  });
  /* Lista nueva → números nuevos, pero sólo si Insights está a la vista. */
  if (window.FerociaReviews) window.FerociaReviews.alCargar(() => { _pidiendo = null; _vuelta++; if (_abierta && !$('rvw-p-ins').hidden) abrir(); else _pedidos = null; });
  window.FerociaReviewInsights = { abrir, cerrar };
})();
