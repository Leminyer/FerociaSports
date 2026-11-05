/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: SEND TEXT & WHATSAPP (§115)
   Depende de: db.js (api, esc, toast, window.supabase), admin-state.js
               (CLICK_HANDLERS), country-codes.js (FerociaPhone),
               admin-communications.js (las pestañas; llama a
               window.FerociaTexto.alAbrir / .historial).

   Para los avisos de ÚLTIMA HORA (rain out, canchas cerradas, una
   emergencia). Todo sale DESDE EL TELÉFONO de la administradora, con su
   número: aquí no se manda nada. El panel sólo:
     · trae a los jugadores de la escalera, el torneo o All Players (la
       misma lista del Hub: sin subs ni inactivos, y respeta "Do not
       email"; quien no tiene correo sí entra — sql/129);
     · arma el mensaje (plantillas "⚠️ Urgent" aprobadas el 3 nov);
     · "Copy message" (para pegarlo en la lista de difusión de WhatsApp)
       y "Download contacts" (para armar esa lista en el teléfono);
     · una fila por jugador con sus botones WhatsApp y Text, que abren su
       conversación con el mensaje ya escrito ("Hi Ana, …").
   "Sent ✓" marca que se pulsó el botón: el panel NO puede saber si de
   verdad se envió. Las marcas viven sólo en esta pantalla (decisión 4A);
   Text & WhatsApp History guarda una línea por aviso con cuántas hubo.

   Los botones usan los enlaces oficiales (wa.me y sms:). No hay Twilio,
   ni API de WhatsApp, ni costo. Todo lo que escribió alguien (nombres)
   se pinta con textContent.

   También: window.FerociaContacto, lo que usa la ficha del jugador
   (admin-player-profile.js) para sus botones WhatsApp y Text.

   Familias (4 nov, 1A · 2A): quienes comparten EXACTAMENTE el mismo
   número van en una sola fila, con un solo mensaje ("Hi Ana and Bea,"),
   un solo contacto en "Download contacts" y una sola marca ✓.
   ============================================================ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const FIRMA = '— Leminyer Zapata - Ferocia Sports';
  const MAX_MENSAJE = 1000;

  /* Las plantillas, tal como se aprobaron (3 nov). {event} es el nombre de
     la escalera o del torneo; [entre corchetes], lo escribe ella. */
  const PLANTILLAS = [
    ['', 'Select a template…', null],
    ['rain', 'Rain out', '⚠️ RAIN OUT: Today\'s {event} session is cancelled due to weather. Stay safe — we\'ll share the make-up date soon.'],
    ['courts', 'Courts closed', '⚠️ COURTS CLOSED: The courts are closed today, so today\'s {event} session is cancelled. We\'ll share the make-up date soon.'],
    ['cancelled', 'Session cancelled (emergency)', '⚠️ SESSION CANCELLED: Due to an unexpected emergency, today\'s {event} session is cancelled. Sorry for the short notice — more info soon.'],
    ['late', 'Running late', '⚠️ RUNNING LATE: I\'m running late for today\'s {event} session. Please warm up and start your games — I\'ll be there as soon as I can.'],
    ['time', 'Start time changed', '⚠️ TIME CHANGE: Today\'s {event} session will start at [new time] instead of [usual time]. See you on the court!'],
    ['custom', 'Custom', ''],
  ];

  const TEXTOS = {
    all_players: { titulo: 'All Players', sub: 'A last-minute message to your active player community.' },
    ladder:      { titulo: 'Ladder Players', sub: 'A last-minute message to one ladder\'s players.', rotulo: 'Ladder', elige: 'Choose a ladder…', grupos: ['Active ladders', 'Past ladders'] },
    tournament:  { titulo: 'Tournament Players', sub: 'A last-minute message to one tournament\'s players.', rotulo: 'Tournament', elige: 'Choose a tournament…', grupos: ['Current & upcoming', 'Past tournaments'] },
  };
  const MOTIVOS = {
    sub: (n) => `${n} sub${n === 1 ? '' : 's'}`,
    inactive: (n) => `${n} inactive`,
    do_not_email: (n) => `${n} marked "Do not email"`,
  };

  /* ── LOS NÚMEROS Y LOS ENLACES (también para la ficha) ───── */
  const digitos = (x) => String(x || '').replace(/\D/g, '');

  /* El número completo (código de país + número), con la misma regla de
     largo que el formulario (country-codes.js). */
  function numero(codigo, telefono) {
    const d = digitos(telefono);
    if (!d) return { ok: false, motivo: 'none' };
    /* Sin código de país no se adivina (+1 sería inventarlo, igual que
       country-codes.js): "Check number". */
    const cc = digitos(codigo);
    if (!cc) return { ok: false, motivo: 'check' };
    const paises = (window.FerociaPhone && window.FerociaPhone.COUNTRIES) || [];
    const pais = paises.find((c) => digitos(c.dial) === cc);
    let largoOk;
    if (pais && pais.len) largoOk = d.length === pais.len;
    else {
      /* Países sin un largo fijo: un 0 delante (el prefijo nacional) o el
         código de país repetido darían otro número. Mejor "Check number".
         Argentina: los móviles en WhatsApp llevan un 9 delante. */
      largoOk = d.length >= 4 && d.length <= 14 && !d.startsWith('0') && !d.startsWith(cc)
        && (cc !== '54' || d.startsWith('9'));
    }
    if (!largoOk || (cc + d).length > 15) return { ok: false, motivo: 'check' };
    const mostrar = window.FerociaPhone && typeof window.FerociaPhone.format === 'function'
      ? window.FerociaPhone.format(`+${cc}`, d) : `+${cc} ${d}`;
    return { ok: true, completo: cc + d, mostrar };
  }
  /* Un medio emoji suelto (p. ej. cortado al pegar) haría fallar la
     codificación: se quita. */
  const codificar = (t) => {
    try { return encodeURIComponent(t); } catch (e) {
      return encodeURIComponent(String(t).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, ''));
    }
  };
  const enlaceWhatsApp = (completo, texto) => `https://wa.me/${completo}${texto ? `?text=${codificar(texto)}` : ''}`;
  /* "?&body=" lo entienden tanto el iPhone como Android. */
  const enlaceTexto = (completo, texto) => `sms:+${completo}${texto ? `?&body=${codificar(texto)}` : ''}`;
  const nombrePila = (n) => (String(n || '').trim().split(/\s+/)[0] || '');
  /* "Ana", "Ana and Bea", "Ana, Bea and Carla" (decisión 2A del 4 nov). */
  const unirNombres = (lista) => (lista.length <= 1 ? (lista[0] || '')
    : `${lista.slice(0, -1).join(', ')} and ${lista[lista.length - 1]}`);
  /* nombre: uno, o varios (quienes comparten el número). */
  const conSaludo = (nombre, texto) => {
    const nombres = (Array.isArray(nombre) ? nombre : [nombre]).map(nombrePila).filter(Boolean)
      .filter((x, i, todos) => todos.indexOf(x) === i);
    const n = unirNombres(nombres);
    if (!n) return texto;
    return texto ? `Hi ${n},\n${texto}` : `Hi ${n}, `;
  };

  window.FerociaContacto = { numero, enlaceWhatsApp, enlaceTexto, conSaludo };

  /* ── ESTADO ─────────────────────────────────────────────── */
  let _tipo = null;          // 'all_players' | 'ladder' | 'tournament'
  let _audiencia = null;     // id de la escalera o del torneo
  let _nombres = new Map();  // id → nombre
  let _gente = [];           // lo que devolvió admin_text_audience (incluidos)
  let _fuera = {};           // motivo → cuántos quedaron fuera
  let _marcas = new Map();   // player_id → { wa, sms } — sólo en esta pantalla (4A)
  let _vez = 0;              // una respuesta vieja no pinta encima
  let _registro = null;      // { id } de la fila del historial de ESTE aviso
  let _registrando = null;   // la creación en vuelo
  let _copiado = false;
  let _guardarEn = null;
  let _plantillaPuesta = '';  // el texto que puso la última plantilla (para saber si ella lo cambió)
  let _ultima = 0;            // cuándo se tocó por última vez este aviso (copiar o un botón)
  const _waAntes = new Map(); // player_id → la marca de WhatsApp antes de "No WhatsApp" (para deshacer)

  const nombreDe = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Player';
  const etiquetaAudiencia = () => (_tipo === 'all_players' ? 'All Players' : (_nombres.get(_audiencia) || ''));

  /* ── ABRIR Y CERRAR ─────────────────────────────────────── */
  /* Al volver a la pestaña: si el aviso abierto es de hace más de 30
     minutos, es otro aviso: la lista se vuelve a leer y los ✓ empiezan de
     nuevo (el mensaje escrito se queda). */
  const VIEJO_MS = 30 * 60 * 1000;
  function alAbrir() {
    if ($('tw-panel').hidden) { $('tw-home').hidden = false; return; }
    if (_ultima && Date.now() - _ultima > VIEJO_MS && (_tipo === 'all_players' || _audiencia)) {
      _ultima = 0;
      olvidar();
      cargarGente();
    }
  }

  async function abrir(tipo) {
    if (!TEXTOS[tipo]) return;
    _tipo = tipo;
    _audiencia = null;
    olvidar();
    const t = TEXTOS[tipo];
    $('tw-title').textContent = t.titulo;
    $('tw-sub').textContent = t.sub;
    $('tw-plantilla').replaceChildren(...PLANTILLAS.map(([v, txt]) => new Option(txt, v)));
    $('tw-plantilla').value = '';
    $('tw-mensaje').value = '';
    _plantillaPuesta = '';
    contar();
    $('tw-home').hidden = true;
    $('tw-panel').hidden = false;
    if (tipo === 'all_players') {
      $('tw-aud-wrap').hidden = true;
      $('tw-resto').hidden = false;
      await cargarGente();
      return;
    }
    $('tw-aud-wrap').hidden = false;
    $('tw-aud-label').textContent = t.rotulo;
    $('tw-resto').hidden = true;
    await cargarAudiencias();
  }

  function cerrar() {
    olvidar();
    _tipo = null;
    $('tw-panel').hidden = true;
    $('tw-home').hidden = false;
  }

  /* Todo lo de la audiencia anterior se olvida (las marcas son de ESE aviso). */
  function olvidar() {
    /* Lo que estaba por guardarse del aviso de antes se guarda YA, con sus
       números (si no, los últimos ✓ se perderían). */
    if (_registro && _guardarEn) guardarFila(_registro.id, foto());
    _vez++;
    _gente = [];
    _fuera = {};
    _marcas = new Map();
    _registro = null;
    _registrando = null;
    _copiado = false;
    clearTimeout(_guardarEn);
    $('tw-list').replaceChildren();
    $('tw-excluded').textContent = '';
    $('tw-count').textContent = '';
    $('tw-solo-sin-wa').checked = false;
  }

  async function cargarAudiencias() {
    const sel = $('tw-aud-select');
    const t = TEXTOS[_tipo];
    const mia = _vez;
    sel.disabled = true;
    sel.replaceChildren(new Option('Loading…', ''));
    let filas;
    try {
      filas = _tipo === 'ladder'
        ? await api('ladders?select=id,name,status,start_date&order=start_date.desc')
        : await api('tournaments?select=id,name,date,status&order=date.desc');
    } catch (e) {
      if (mia !== _vez) return;
      sel.replaceChildren(new Option('Could not load the list', ''));
      toast(`Could not load the list: ${e.message}`, true);
      return;
    }
    if (mia !== _vez) return;
    const vigente = (f) => (_tipo === 'ladder' ? f.status === 'active' : f.status === 'draft' || f.status === 'active');
    const fecha = (f) => (_tipo === 'ladder' ? f.start_date : f.date);
    const etiqueta = (f) => (fecha(f) ? `${f.name} · ${fmtDate(fecha(f))}` : f.name);
    const opciones = [new Option(t.elige, '')];
    [filas.filter(vigente), filas.filter((f) => !vigente(f))].forEach((lista, i) => {
      if (!lista.length) return;
      const g = document.createElement('optgroup');
      g.label = t.grupos[i];
      lista.forEach((f) => g.append(new Option(etiqueta(f), String(f.id))));
      opciones.push(g);
    });
    _nombres = new Map(filas.map((f) => [f.id, f.name]));
    sel.replaceChildren(...opciones);
    sel.value = '';
    sel.disabled = false;
  }

  async function alElegirAudiencia() {
    const v = $('tw-aud-select').value;
    olvidar();
    _audiencia = v ? Number(v) : null;
    $('tw-resto').hidden = !_audiencia;
    /* El nombre del evento va en la plantilla: se vuelve a poner, salvo
       que ella ya haya cambiado el texto (lo escrito a mano no se pisa). */
    if ($('tw-plantilla').value && $('tw-plantilla').value !== 'custom'
        && $('tw-mensaje').value === _plantillaPuesta) aplicarPlantilla();
    if (_audiencia) await cargarGente();
  }

  /* ── LA LISTA ───────────────────────────────────────────── */
  async function cargarGente() {
    const mia = _vez;
    $('tw-list').replaceChildren(nota('Loading players…'));
    let data;
    try {
      const r = await window.supabase.rpc('admin_text_audience', { p_audience_type: _tipo, p_audience_id: _audiencia });
      if (r.error) throw r.error;
      data = r.data || [];
    } catch (e) {
      if (mia !== _vez) return;
      console.error('[text-whatsapp] no se pudo leer la lista:', e);
      const sinSql = /admin_text_audience|PGRST202|404/i.test(String(e?.message || e?.code || ''));
      $('tw-list').replaceChildren(nota(sinSql ? 'Text & WhatsApp is not set up yet (SQL 129).' : 'Could not load the players. Try again.'));
      return;
    }
    if (mia !== _vez) return;
    const comparar = new Intl.Collator('en', { sensitivity: 'base' }).compare;
    _gente = data.filter((p) => p.included).sort((a, b) =>
      comparar(a.last_name || '', b.last_name || '') || comparar(a.first_name || '', b.first_name || ''));
    _fuera = {};
    data.filter((p) => !p.included).forEach((p) => { _fuera[p.excluded_reason] = (_fuera[p.excluded_reason] || 0) + 1; });
    pintar();
  }

  function nota(texto) {
    const d = document.createElement('div');
    d.className = 'tw-empty';
    d.textContent = texto;
    return d;
  }

  function mensaje() { return $('tw-mensaje').value.trim(); }

  /* §115 (4 nov, 1A): quienes comparten EXACTAMENTE el mismo número (una
     mamá y su hija) van en UNA fila, con un solo mensaje para los dos. Un
     número que no se puede usar no se junta con nadie. La clave es el
     número completo; la de una fila suelta, su id. */
  function grupos() {
    const porNumero = new Map();
    const lista = [];
    _gente.forEach((p) => {
      const n = numero(p.country_code, p.phone);
      if (!n.ok) { lista.push({ clave: `p${p.player_id}`, personas: [p], n }); return; }
      if (!porNumero.has(n.completo)) {
        const g = { clave: n.completo, personas: [], n };
        porNumero.set(n.completo, g);
        lista.push(g);
      }
      porNumero.get(n.completo).personas.push(p);
    });
    /* Un mismo teléfono: si alguien ya lo marcó "No WhatsApp", vale para todos. */
    lista.forEach((g) => { g.sinWhatsApp = g.personas.some((p) => p.whatsapp === 'no'); });
    return lista;
  }

  /* "Ana Uno & Bea Uno" (en la lista) y "Ana & Bea Uno" (en el contacto). */
  const nombreGrupo = (g) => g.personas.map(nombreDe).join(' & ');
  function nombreContacto(g) {
    const ap = g.personas.map((p) => String(p.last_name || '').trim());
    if (g.personas.length > 1 && ap.every((x) => x && x === ap[0])) {
      return { n: `${ap[0]} · FEROCIA;${g.personas.map((p) => nombrePila(p.first_name) || 'Player').join(' & ')}`,
               fn: `${g.personas.map((p) => nombrePila(p.first_name) || 'Player').join(' & ')} ${ap[0]} · FEROCIA` };
    }
    if (g.personas.length > 1) return { n: `· FEROCIA;${nombreGrupo(g)}`, fn: `${nombreGrupo(g)} · FEROCIA` };
    const p = g.personas[0];
    return { n: `${`${p.last_name || ''} · FEROCIA`.trim()};${p.first_name || ''}`, fn: `${nombreDe(p)} · FEROCIA` };
  }

  function pintar() {
    const lista = $('tw-list');
    const fuera = Object.entries(_fuera).filter(([, n]) => n > 0).map(([m, n]) => (MOTIVOS[m] ? MOTIVOS[m](n) : `${n} ${m}`));
    $('tw-excluded').textContent = fuera.length ? `Not included: ${fuera.join(' · ')}.` : '';
    if (!_gente.length) {
      lista.replaceChildren(nota('No one in this group can receive messages.'));
      pintarCuenta();
      return;
    }
    const soloSinWa = $('tw-solo-sin-wa').checked;
    const texto = mensaje();
    const filas = grupos().filter((g) => !soloSinWa || g.sinWhatsApp).map((g) => fila(g, texto));
    lista.replaceChildren(...(filas.length ? filas : [nota('Everyone in this list may have WhatsApp.')]));
    pintarCuenta();
  }

  function fila(g, texto) {
    const n = g.n;
    const ids = g.personas.map((p) => p.player_id);
    const m = _marcas.get(g.clave) || {};
    const f = document.createElement('div');
    f.className = 'tw-row';
    f.dataset.id = ids.join(',');

    const quien = document.createElement('div');
    quien.className = 'tw-who';
    const nom = document.createElement('div');
    nom.className = 'tw-name';
    nom.textContent = nombreGrupo(g);
    const tel = document.createElement('div');
    tel.className = 'tw-phone';
    const p0 = g.personas[0];
    tel.textContent = (n.ok ? n.mostrar : (p0.phone ? String(p0.phone) : ''))
      + (g.personas.length > 1 ? ` · shared number (${g.personas.length} players)` : '');
    quien.append(nom, tel);

    const etiquetas = document.createElement('div');
    etiquetas.className = 'tw-tags';
    const pill = (txt, cls) => { const s = document.createElement('span'); s.className = `pill ${cls}`; s.textContent = txt; return s; };
    if (!n.ok) etiquetas.append(pill(n.motivo === 'none' ? 'No phone' : 'Check number', 'hub-pill-warn'));
    else if (g.sinWhatsApp) etiquetas.append(pill('No WhatsApp', 'pill-inactive'));
    if (m.wa) etiquetas.append(pill('WhatsApp ✓', 'pill-active'));
    if (m.sms) etiquetas.append(pill('Text ✓', 'pill-active'));

    const botones = document.createElement('div');
    botones.className = 'tw-actions';
    if (n.ok) {
      const cuerpo = conSaludo(g.personas.map((p) => p.first_name), texto);
      if (!g.sinWhatsApp) botones.append(enlace('WhatsApp', 'tw-btn tw-btn-wa', enlaceWhatsApp(n.completo, cuerpo), 'wa', g, !texto));
      botones.append(enlace('Text', 'tw-btn tw-btn-sms', enlaceTexto(n.completo, cuerpo), 'sms', g, !texto));
      const marca = document.createElement('button');
      marca.type = 'button';
      marca.className = 'tw-link';
      marca.dataset.action = 'twWhatsAppMark';
      marca.dataset.ids = ids.join(',');
      marca.dataset.valor = g.sinWhatsApp ? 'restore' : 'no';
      marca.textContent = g.sinWhatsApp ? 'Has WhatsApp?' : 'No WhatsApp';
      marca.title = g.sinWhatsApp ? 'Show the WhatsApp button again' : 'WhatsApp said this number isn\'t on WhatsApp';
      botones.append(marca);
    }
    f.append(quien, etiquetas, botones);
    return f;
  }

  function enlace(txt, cls, href, canal, g, sinTexto) {
    const a = document.createElement('a');
    a.className = cls;
    a.href = href;
    a.textContent = txt;
    a.dataset.canal = canal;
    a.dataset.clave = g.clave;
    if (canal === 'wa') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    if (sinTexto) { a.setAttribute('aria-disabled', 'true'); a.classList.add('tw-btn-off'); a.title = 'Write the message first'; }
    a.setAttribute('aria-label', `${txt} ${nombreGrupo(g)}`);
    return a;
  }

  function pintarCuenta() {
    const total = _gente.length;
    const numeros = grupos().filter((g) => g.n.ok).length;
    const wa = [..._marcas.values()].filter((m) => m.wa).length;
    const sms = [..._marcas.values()].filter((m) => m.sms).length;
    $('tw-count').textContent = total
      ? `${total} player${total === 1 ? '' : 's'} · ${numeros} number${numeros === 1 ? '' : 's'} · ${wa} WhatsApp ✓ · ${sms} Text ✓` : '';
  }

  /* ── EL MENSAJE ─────────────────────────────────────────── */
  function aplicarPlantilla() {
    const p = PLANTILLAS.find(([v]) => v === $('tw-plantilla').value);
    if (!p || p[2] === null) return;
    if (p[0] === 'custom') { $('tw-mensaje').value = ''; }
    else {
      const evento = _tipo === 'all_players' ? '' : (_nombres.get(_audiencia) || '');
      const base = evento ? p[2].replaceAll('{event}', () => evento) : p[2].replaceAll('{event} ', '').replaceAll('{event}', '');
      $('tw-mensaje').value = `${base} ${FIRMA}`;
    }
    _plantillaPuesta = $('tw-mensaje').value;
    alCambiarMensaje();
  }

  function contar() {
    const n = $('tw-mensaje').value.length;
    $('tw-mensaje-count').textContent = `${n}/${MAX_MENSAJE}`;
  }

  function alCambiarMensaje() {
    contar();
    /* Cambiar el mensaje después de haberlo copiado o mandado a alguien es
       OTRO aviso: el de antes se queda en el historial como estaba, y los
       ✓ empiezan de nuevo (una fila = un aviso). */
    if (_registro && (_copiado || _marcas.size)) {
      /* Los últimos ✓ del aviso de antes se guardan (sin tocar su mensaje). */
      if (_guardarEn) {
        clearTimeout(_guardarEn); _guardarEn = null;
        const { message, ...numeros } = foto();
        guardarFila(_registro.id, numeros);
      }
      _registro = null;
      _registrando = null;
      _marcas = new Map();
      _copiado = false;
      _vez++;
      toast('New message: the ✓ marks start again. The previous one stays in Text & WhatsApp History.');
    }
    /* Los botones llevan el mensaje: se rehacen. */
    if (_gente.length) pintar();
  }

  /* ── EL HISTORIAL (Text & WhatsApp History) ─────────────── */
  function cuentas() {
    const v = [..._marcas.values()];
    return { whatsapp_marked: v.filter((m) => m.wa).length, text_marked: v.filter((m) => m.sms).length };
  }

  /* La fila de ESTE aviso se crea con la primera acción (copiar o pulsar
     un botón) y se va poniendo al día. Si falla (p. ej. sin el SQL 129),
     se dice en la consola y la pantalla sigue funcionando. */
  /* Lo que se guarda de este aviso, tomado AHORA. */
  const foto = () => ({ message: mensaje().slice(0, 5000), people: _gente.length, whatsapp_copied: _copiado, ...cuentas() });

  async function registrar() {
    if (_registro || !mensaje()) return _registro;
    if (!_registrando) {
      const mia = _vez;
      const datos = { audience_type: _tipo, audience_id: _tipo === 'all_players' ? null : _audiencia,
                      audience_label: etiquetaAudiencia() || 'All Players', ...foto() };
      _registrando = (async () => {
        try {
          const { data, error } = await window.supabase.from('comm_text_sends').insert(datos).select('id').single();
          if (error) throw error;
          if (mia !== _vez) return null;   // ella ya está en otro aviso
          _registro = { id: data.id };
          return _registro;
        } catch (e) {
          console.warn('[text-whatsapp] no se pudo guardar en el historial:', e?.message || e);
          if (mia === _vez) _registrando = null;   // la próxima acción lo vuelve a intentar
          return null;
        }
      })();
    }
    return _registrando;
  }

  function programarGuardado() {
    clearTimeout(_guardarEn);
    const mia = _vez;
    _guardarEn = setTimeout(() => { _guardarEn = null; if (mia === _vez) guardar(); }, 700);
  }

  async function guardarFila(id, datos) {
    const { error } = await window.supabase.from('comm_text_sends').update(datos).eq('id', id);
    if (error) console.warn('[text-whatsapp] no se pudo poner al día el historial:', error.message);
  }

  async function guardar() {
    const mia = _vez;
    const r = await registrar();
    if (!r || mia !== _vez || !mensaje()) return;
    await guardarFila(r.id, foto());
  }

  /* ── ACCIONES ───────────────────────────────────────────── */
  async function copiar() {
    const texto = mensaje();
    if (!texto) { toast('Write the message first.', true); $('tw-mensaje').focus(); return; }
    let ok = false;
    try { await navigator.clipboard.writeText(texto); ok = true; } catch (e) {
      /* Sin permiso para el portapapeles: el método de siempre. */
      const caja = $('tw-mensaje');
      caja.select();
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    }
    if (!ok) { toast('Could not copy. Select the message and copy it by hand.', true); return; }
    _copiado = true;
    _ultima = Date.now();
    toast('Message copied. Paste it in your WhatsApp broadcast list.');
    programarGuardado();
  }

  /* Los contactos de la lista, en un archivo .vcf para el teléfono, con el
     nombre "Ana Uno · FEROCIA" (decisión 3A). Sólo los que tienen un número
     que se puede usar. */
  function descargarContactos() {
    const escV = (s) => String(s || '').replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');
    /* Un contacto por NÚMERO: una familia que lo comparte es un contacto
       ("Ana & Bea Uno · FEROCIA"). */
    const filas = grupos().filter((g) => g.n.ok);
    if (!filas.length) { toast('No one in this list has a usable phone number.', true); return; }
    const vcf = filas.map((g) => {
      const c = nombreContacto(g);
      const [apellido, nombre] = c.n.split(';');
      return [
        'BEGIN:VCARD', 'VERSION:3.0',
        `N:${escV(apellido)};${escV(nombre)};;;`,
        `FN:${escV(c.fn)}`,
        'ORG:FEROCIA Sports Center',
        `TEL;TYPE=CELL:+${g.n.completo}`,
        'END:VCARD',
      ].join('\r\n');
    }).join('\r\n') + '\r\n';
    const nombre = `FEROCIA - ${etiquetaAudiencia() || 'All Players'} - contacts.vcf`.replace(/[\\/:*?"<>|]+/g, '-');
    const url = URL.createObjectURL(new Blob([vcf], { type: 'text/vcard;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`${filas.length} contact${filas.length === 1 ? '' : 's'} downloaded. Open the file on your phone to add them.`);
  }

  /* Pulsar WhatsApp o Text: se abre (lo hace el enlace) y se marca ✓. */
  function alPulsarEnlace(ev) {
    const a = ev.target.closest('a.tw-btn');
    if (!a) return;
    if (a.getAttribute('aria-disabled') === 'true') {
      ev.preventDefault();
      toast('Write the message first.', true);
      $('tw-mensaje').focus();
      return;
    }
    const clave = a.dataset.clave;
    const m = _marcas.get(clave) || {};
    m[a.dataset.canal] = true;
    _marcas.set(clave, m);
    /* La fila se rehace después de que el navegador siga el enlace. */
    setTimeout(pintar, 0);
    _ultima = Date.now();
    const mia = _vez;
    registrar().then((r) => { if (r && mia === _vez) programarGuardado(); });
  }

  /* "No WhatsApp" (o deshacerlo) para TODOS los que comparten ese número.
     Deshacer devuelve a cada uno la marca que tenía antes. */
  async function marcarWhatsApp(btn) {
    const ids = String(btn.dataset.ids || '').split(',').map(Number).filter(Boolean);
    if (!ids.length) return;
    const quitar = btn.dataset.valor === 'restore';
    const personas = ids.map((id) => _gente.find((x) => x.player_id === id)).filter(Boolean);
    const nuevo = (p) => (quitar ? (_waAntes.get(p.player_id) || (p.whatsapp === 'no' ? 'unknown' : p.whatsapp)) : 'no');
    btn.disabled = true;
    try {
      /* Agrupados por valor: normalmente es una sola llamada. */
      const porValor = new Map();
      personas.forEach((p) => { const v = nuevo(p); if (!porValor.has(v)) porValor.set(v, []); porValor.get(v).push(p.player_id); });
      for (const [v, lista] of porValor) await api(`players?id=in.(${lista.join(',')})`, 'PATCH', { whatsapp: v });
    } catch (e) {
      btn.disabled = false;
      toast(/whatsapp/i.test(e.message) ? 'WhatsApp marks are not set up yet (SQL 129).' : `Could not save: ${e.message}`, true);
      return;
    }
    const nombres = { yes: 'Yes', no: 'No', unknown: 'Unknown' };
    personas.forEach((p) => {
      const v = nuevo(p);
      if (!quitar) _waAntes.set(p.player_id, p.whatsapp === 'no' ? 'unknown' : p.whatsapp);
      else _waAntes.delete(p.player_id);
      p.whatsapp = v;
      window.logAuditAction?.(p.player_id, 'player_edited', `WhatsApp: ${nombres[v]} (Send Text & WhatsApp)`);
      /* La ficha en memoria del panel, para que Edit Player diga lo mismo. */
      const enLista = (window.AdminState?.allPlayers || []).find((x) => x.id === p.player_id);
      if (enLista) enLista.whatsapp = v;
    });
    toast(quitar ? 'WhatsApp button is back for this number.'
      : `Marked "No WhatsApp"${personas.length > 1 ? ` for the ${personas.length} players who share this number` : ''}. Use Text.`);
    pintar();
  }

  /* ── TEXT & WHATSAPP HISTORY ────────────────────────────── */
  const POR_PAGINA = 25;
  let _historial = [];
  let _vezHist = 0;

  async function historial(desdeCero) {
    const mia = ++_vezHist;
    const cuerpo = $('twh-body');
    if (desdeCero) { _historial = []; cuerpo.replaceChildren(nota('Loading...')); }
    const { data, error } = await window.supabase.from('comm_text_sends')
      .select('id,created_at,audience_type,audience_label,message,people,whatsapp_copied,whatsapp_marked,text_marked')
      .order('created_at', { ascending: false }).range(_historial.length, _historial.length + POR_PAGINA - 1);
    if (mia !== _vezHist) return;
    if (error) {
      console.error('[text-whatsapp] no se pudo leer el historial:', error);
      cuerpo.replaceChildren(nota(/comm_text_sends|PGRST205|42P01/i.test(`${error.message} ${error.code}`)
        ? 'Text & WhatsApp History is not set up yet (SQL 129).' : 'Could not load the history. Try again.'));
      return;
    }
    _historial = _historial.concat(data || []);
    pintarHistorial((data || []).length === POR_PAGINA);
  }

  function pintarHistorial(hayMas) {
    const cuerpo = $('twh-body');
    if (!_historial.length) {
      cuerpo.replaceChildren(nota('No text or WhatsApp messages yet. They appear here when you copy a message or tap WhatsApp or Text in "Send Text & WhatsApp".'));
      return;
    }
    const fmt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const tipo = { ladder: 'Ladder', tournament: 'Tournament', all_players: 'All Players' };
    const filas = _historial.map((h) => {
      const t = document.createElement('article');
      t.className = 'card twh-row';
      const cab = document.createElement('div');
      cab.className = 'twh-head';
      const quien = document.createElement('div');
      quien.className = 'twh-aud';
      quien.textContent = h.audience_type === 'all_players' ? 'All Players' : `${h.audience_label} · ${tipo[h.audience_type] || ''}`;
      const cuando = document.createElement('div');
      cuando.className = 'twh-when';
      cuando.textContent = fmt(h.created_at);
      cab.append(quien, cuando);
      const msg = document.createElement('p');
      msg.className = 'twh-msg';
      msg.textContent = h.message;
      const cuenta = document.createElement('div');
      cuenta.className = 'twh-counts';
      cuenta.textContent = `${h.people} player${h.people === 1 ? '' : 's'} · ${h.whatsapp_copied ? 'Copied for WhatsApp broadcast · ' : ''}`
        + `${h.whatsapp_marked} WhatsApp ✓ · ${h.text_marked} Text ✓`;
      t.append(cab, msg, cuenta);
      return t;
    });
    const pie = [];
    if (hayMas) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hub-attach-btn';
      b.dataset.action = 'twhMore';
      b.textContent = 'Load more';
      pie.push(b);
    }
    const aviso = document.createElement('p');
    aviso.className = 'twh-note';
    aviso.textContent = '✓ = you tapped the button. The panel can\'t confirm that each message was actually sent from your phone.';
    cuerpo.replaceChildren(aviso, ...filas, ...pie);
  }

  /* ── EVENTOS ────────────────────────────────────────────── */
  $('tw-aud-select')?.addEventListener('change', alElegirAudiencia);
  $('tw-plantilla')?.addEventListener('change', aplicarPlantilla);
  $('tw-mensaje')?.addEventListener('input', alCambiarMensaje);
  $('tw-solo-sin-wa')?.addEventListener('change', pintar);
  $('tw-list')?.addEventListener('click', alPulsarEnlace);

  Object.assign(window.CLICK_HANDLERS, {
    twOpen:          (btn) => abrir(btn.dataset.audience),
    twClose:         () => cerrar(),
    twCopy:          () => copiar(),
    twContacts:      () => descargarContactos(),
    twWhatsAppMark:  (btn) => marcarWhatsApp(btn),
    twhMore:         () => historial(false),
  });

  window.FerociaTexto = { alAbrir, historial: () => historial(true) };
})();
