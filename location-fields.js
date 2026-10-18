/* ============================================================
   FEROCIA — City & State fields
   ------------------------------------------------------------
   Shared by the admin forms and the public subscribe page, so both
   normalise a city the same way. Two places doing it differently is how
   "Boca Raton" and "boca ratón" end up as separate cities.

   WHY CITY AND STATE ARE SEPARATE FIELDS
     A single free-text "location" gives you "Boca Raton", "boca raton",
     "Boca Raton, FL" and "Boca Ratón" as four different places. You then
     cannot count how many members come from each city, filter by area, or
     segment a campaign — which is most of what a subscriber list is for.

   NORMALISATION (approved)
     · strip accents      "Boca Ratón"  → "Boca Raton"
     · drop odd symbols   "Miami!!"     → "Miami"
     · collapse spaces    "Fort  Myers" → "Fort Myers"
     · title case         "boca raton"  → "Boca Raton"

     Hyphens, apostrophes and periods survive on purpose: Winston-Salem,
     Coeur d'Alene and St. Petersburg are real places.

   CITY MUST BE IN THE CHOSEN STATE (SQL 109, 18 Oct 2026)
     Suggestions follow the chosen state, and comprobarLugar() checks the
     pair before saving. The city list comes from GeoNames (geonames.org,
     CC BY 4.0) and the USPS ZIP city names.
   ============================================================ */

(function () {
  'use strict';

  /* Florida first — this is a Boca Raton club, so it is the answer most of
     the time and nobody should scroll for it. The rest alphabetical. */
  const STATES = [
    { code: 'FL', name: 'Florida', pinned: true },
    { code: 'AL', name: 'Alabama' },        { code: 'AK', name: 'Alaska' },
    { code: 'AZ', name: 'Arizona' },        { code: 'AR', name: 'Arkansas' },
    { code: 'CA', name: 'California' },     { code: 'CO', name: 'Colorado' },
    { code: 'CT', name: 'Connecticut' },    { code: 'DE', name: 'Delaware' },
    { code: 'DC', name: 'District of Columbia' },
    { code: 'GA', name: 'Georgia' },        { code: 'HI', name: 'Hawaii' },
    { code: 'ID', name: 'Idaho' },          { code: 'IL', name: 'Illinois' },
    { code: 'IN', name: 'Indiana' },        { code: 'IA', name: 'Iowa' },
    { code: 'KS', name: 'Kansas' },         { code: 'KY', name: 'Kentucky' },
    { code: 'LA', name: 'Louisiana' },      { code: 'ME', name: 'Maine' },
    { code: 'MD', name: 'Maryland' },       { code: 'MA', name: 'Massachusetts' },
    { code: 'MI', name: 'Michigan' },       { code: 'MN', name: 'Minnesota' },
    { code: 'MS', name: 'Mississippi' },    { code: 'MO', name: 'Missouri' },
    { code: 'MT', name: 'Montana' },        { code: 'NE', name: 'Nebraska' },
    { code: 'NV', name: 'Nevada' },         { code: 'NH', name: 'New Hampshire' },
    { code: 'NJ', name: 'New Jersey' },     { code: 'NM', name: 'New Mexico' },
    { code: 'NY', name: 'New York' },       { code: 'NC', name: 'North Carolina' },
    { code: 'ND', name: 'North Dakota' },   { code: 'OH', name: 'Ohio' },
    { code: 'OK', name: 'Oklahoma' },       { code: 'OR', name: 'Oregon' },
    { code: 'PA', name: 'Pennsylvania' },   { code: 'PR', name: 'Puerto Rico' },
    { code: 'RI', name: 'Rhode Island' },   { code: 'SC', name: 'South Carolina' },
    { code: 'SD', name: 'South Dakota' },   { code: 'TN', name: 'Tennessee' },
    { code: 'TX', name: 'Texas' },          { code: 'UT', name: 'Utah' },
    { code: 'VT', name: 'Vermont' },        { code: 'VA', name: 'Virginia' },
    { code: 'WA', name: 'Washington' },     { code: 'WV', name: 'West Virginia' },
    { code: 'WI', name: 'Wisconsin' },      { code: 'WY', name: 'Wyoming' },
  ];

  const BY_CODE = Object.fromEntries(STATES.map(s => [s.code, s]));
  // Full name → code, so "Florida" resolves to "FL". Needed because 247
  // player rows were written with the full name before this module existed,
  // and without it Edit Player would show an empty dropdown for them and
  // then WIPE the state on save.
  const BY_NAME = Object.fromEntries(STATES.map(s => [s.name.toLowerCase(), s.code]));

  /**
   * Cleans a city name for storage.
   *   "  boca   ratón!! " → "Boca Raton"
   *   "ST. PETERSBURG"    → "St. Petersburg"
   *   "winston-salem"     → "Winston-Salem"
   *
   * NFD splits an accented letter into base + combining mark, and the
   * regex then drops the marks — so "ó" becomes "o" rather than being
   * deleted along with the symbols.
   */
  const normalizeCity = (raw) => {
    const cleaned = String(raw ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')       // accents
      .replace(/[^A-Za-z\s\-'.]/g, '')        // keep letters, space, - ' .
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return '';

    // Title case, applied after every space, hyphen or period so that
    // "st. petersburg" and "winston-salem" both come out right.
    return cleaned.toLowerCase().replace(/(^|[\s\-.])([a-z])/g,
      (_, sep, ch) => sep + ch.toUpperCase());
  };

  /**
   * @returns {{ok:boolean, value:string, error?:string}}
   */
  const validateCity = (raw, opts) => {
    const required = !!(opts && opts.required);
    const v = normalizeCity(raw);
    if (!v) {
      return required
        ? { ok: false, value: '', error: 'City is required.' }
        : { ok: true, value: '' };
    }
    // A single letter is a typo, not a city.
    if (v.replace(/[^A-Za-z]/g, '').length < 2) {
      return { ok: false, value: v, error: `"${raw}" does not look like a city name.` };
    }
    return { ok: true, value: v };
  };

  /**
   * Accepts a two-letter code OR a full state name, and always returns the
   * code. Legacy rows hold "Florida" rather than "FL"; converting instead
   * of rejecting means editing one of those players fixes it rather than
   * blanking it.
   */
  const toStateCode = (raw) => {
    const v = String(raw ?? '').trim();
    if (!v) return '';
    if (BY_CODE[v.toUpperCase()]) return v.toUpperCase();
    return BY_NAME[v.toLowerCase()] || '';
  };

  const validateState = (raw, opts) => {
    const required = !!(opts && opts.required);
    const v = String(raw ?? '').trim();
    if (!v) {
      return required
        ? { ok: false, value: '', error: 'State is required.' }
        : { ok: true, value: '' };
    }
    const code = toStateCode(v);
    if (!code) {
      return { ok: false, value: '', error: `"${raw}" is not a valid US state.` };
    }
    return { ok: true, value: code };
  };

  /** <option> markup for a state dropdown, Florida first. */
  const stateOptions = (selected) => {
    // Run the incoming value through toStateCode so a legacy "Florida"
    // still preselects Florida instead of falling back to "Select state".
    const sel = toStateCode(selected);
    const opt = (s) =>
      `<option value="${s.code}"${s.code === sel ? ' selected' : ''}>${s.name}</option>`;
    const pinned = STATES.filter(s => s.pinned);
    const rest   = STATES.filter(s => !s.pinned)
                         .sort((a, b) => a.name.localeCompare(b.name));
    return `<option value="">Select state</option>`
         + pinned.map(opt).join('')
         + `<option value="" disabled>──────────</option>`
         + rest.map(opt).join('');
  };

  /**
   * Fills a <datalist> with the cities already on file, so the next person
   * from Fort Lauderdale picks the existing spelling instead of inventing
   * a new one. Best-effort: a failure here leaves the field as plain text.
   *
   * @param {string} datalistId
   * @param {function} apiFn  The api() helper of the calling page.
   */
  const loadCitySuggestions = async (datalistId, apiFn) => {
    const el = document.getElementById(datalistId);
    if (!el || typeof apiFn !== 'function') return;
    try {
      const rows = await apiFn('players?select=city&city=not.is.null&order=city');
      const seen = new Set();
      const cities = [];
      rows.forEach(r => {
        const c = normalizeCity(r.city);
        if (c && !seen.has(c)) { seen.add(c); cities.push(c); }
      });
      el.innerHTML = cities.map(c => `<option value="${c}"></option>`).join('');
    } catch (err) {
      console.warn('[FerociaLocation] could not load city suggestions:', err.message);
    }
  };

  /* ════════════════════════════════════════════════════════════
     SUGERENCIAS DE CIUDAD EN EL PROPIO CAMPO
     ------------------------------------------------------------
     EL PROBLEMA QUE RESUELVE

     El campo tenía `placeholder="Boca Raton"`. Un placeholder se
     pinta en gris claro DENTRO del campo y desaparece al escribir —
     pero para quien no conoce esa convención parece texto ya
     escrito. La gente lo daba por rellenado, le daba a suscribirse
     y el formulario le decía que faltaba la ciudad. Quedaban
     atascados sin entender por qué.

     Ahora el campo empieza VACÍO —se ve que hay que escribir— y al
     hacer clic aparece una lista con las ciudades de la zona. Se
     puede escribir cualquier otra: la lista es un atajo, no un
     límite.

     POR QUÉ NO UN <datalist>
     Sería más corto, pero no se abre al hacer clic de forma fiable:
     Chrome lo abre al escribir, y cada navegador hace una cosa
     distinta. Lo que se pidió es que aparezca AL HACER CLIC, así
     que la lista se pinta aquí y se comporta igual en todas partes.

     Lo que se elige de la lista y lo que se escribe a mano pasan
     los dos por normalizeCity() al guardar, así que "boca raton"
     acaba en la base de datos como "Boca Raton".
     ════════════════════════════════════════════════════════════ */

  /* Boca Raton primero: es el club y es la respuesta la mayoría de
     las veces. Detrás, la zona — quien viene de Delray hace clic en
     "Delray Beach" en vez de escribir "delray", y eso es una
     variante menos que limpiar después. */
  const CIUDADES_CERCANAS = [
    'Boca Raton', 'Delray Beach', 'Boynton Beach', 'Deerfield Beach',
    'Highland Beach', 'Pompano Beach', 'Parkland', 'Coral Springs',
    'Coconut Creek', 'Lighthouse Point', 'Fort Lauderdale',
    'West Palm Beach', 'Wellington', 'Lake Worth', 'Jupiter',
  ];

  /** Para comparar lo tecleado con la lista sin que estorben acentos
      ni mayúsculas: "BOCA ratón" tiene que encontrar "Boca Raton". */
  const _plano = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  let _estilosPuestos = false;
  const _ponerEstilos = () => {
    if (_estilosPuestos) return;
    _estilosPuestos = true;
    const st = document.createElement('style');
    /* Los estilos van aquí y no en la hoja de la página porque este
       módulo lo usan dos páginas con hojas distintas. Las variables
       llevan valor de reserva por lo mismo. */
    st.textContent = `
      .fl-ciudad-caja { position: relative; }
      .fl-ciudad-lista {
        position: absolute; top: calc(100% + 4px); left: 0; right: 0;
        z-index: 60; max-height: 208px; overflow-y: auto;
        background: var(--white, #fff);
        border: 0.5px solid var(--border, #e0e7f5);
        border-radius: var(--radius-sm, 8px);
        box-shadow: 0 8px 24px rgba(8,15,46,.14);
        padding: 4px; display: none;
      }
      .fl-ciudad-lista.abierta { display: block; }
      .fl-ciudad-op {
        padding: 9px 12px; font-size: 13px;
        font-family: 'Inter', sans-serif;
        color: var(--text, #111); border-radius: 6px; cursor: pointer;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .fl-ciudad-op:hover, .fl-ciudad-op.fl-activa {
        background: var(--blue, #174CCC); color: #fff;
      }
      .fl-ciudad-pista {
        padding: 7px 12px 5px; font-size: 10px; font-weight: 800;
        letter-spacing: .6px; text-transform: uppercase;
        color: var(--muted, #6b7a99); font-family: 'Inter', sans-serif;
      }
      .fl-lugar-aviso {
        margin: 8px 0 4px; padding: 12px; border-radius: 12px;
        background: #FDECEC; color: #9B1C1C;
        font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.45; font-weight: 600;
        display: flex; flex-direction: column; align-items: flex-start; gap: 10px;
      }
      .fl-lugar-aviso.fl-duda { background: #F1F4F9; color: #374151; }
      .fl-lugar-aviso p { margin: 0; }
      .fl-lugar-boton {
        min-height: 44px; padding: 0 16px; border-radius: 99px; cursor: pointer;
        font: inherit; font-size: 13px; font-weight: 800;
        border: 0; background: #9B1C1C; color: #fff;
      }
      .fl-duda .fl-lugar-boton { border: 1.5px solid #0d1f4a; background: #fff; color: #0d1f4a; }
      .fl-lugar-boton:focus-visible { outline: 3px solid #174CCC; outline-offset: 2px; }`;
    document.head.appendChild(st);
  };

  /**
   * Convierte un <input> de texto en un campo de ciudad con
   * sugerencias. Escribir cualquier otra ciudad sigue estando
   * permitido — la lista no valida nada.
   *
   * @param {string} inputId   id del <input>
   * @param {object} [opts]
   * @param {string[]} [opts.ciudades]  la lista a ofrecer
   * @param {string} [opts.titulo]      el rótulo de arriba de la lista
   */
  const mountCitySuggest = (inputId, opts) => {
    const input = document.getElementById(inputId);
    if (!input || input._flCiudadMontado) return;   // nunca dos veces
    input._flCiudadMontado = true;
    _ponerEstilos();

    const ciudades = (opts && opts.ciudades) || CIUDADES_CERCANAS;
    const titulo   = (opts && opts.titulo) || 'Common nearby';

    /* SQL 109 (§93): las sugerencias siguen al ESTADO elegido. La lista
       de cercanas es toda de Florida, así que sólo sale con Florida (o sin
       estado todavía); al escribir 2 letras o más se piden a la base las
       ciudades de ese estado. El estado se encuentra solo: "s-city" →
       "s-state", "ed-city" → "ed-state". */
    const estadoEl = document.getElementById((opts && opts.estadoId) || inputId.replace(/city/i, 'state'));
    const estadoActual = () => (estadoEl ? toStateCode(estadoEl.value) : '');
    let remotas = [];          // lo último que mandó la base
    let remotasDe = '';        // para qué "estado|texto" eran
    let relojRemoto = null;

    /* El autocompletado del navegador taparía la lista con su propio
       desplegable, y encima con lo que la persona escribió en otra
       web cualquiera. */
    input.setAttribute('autocomplete', 'off');
    input.removeAttribute('placeholder');   // el campo empieza vacío

    // El <input> se envuelve para poder colocar la lista debajo.
    const caja = document.createElement('div');
    caja.className = 'fl-ciudad-caja';
    input.parentNode.insertBefore(caja, input);
    caja.appendChild(input);

    const lista = document.createElement('div');
    lista.className = 'fl-ciudad-lista';
    lista.setAttribute('role', 'listbox');
    caja.appendChild(lista);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');

    let activa = -1;
    let visibles = [];

    const cerrar = () => {
      lista.classList.remove('abierta');
      input.setAttribute('aria-expanded', 'false');
      activa = -1;
    };

    const marcar = () => {
      [...lista.querySelectorAll('.fl-ciudad-op')].forEach((el, i) =>
        el.classList.toggle('fl-activa', i === activa));
    };

    /* Pide a la base las ciudades del estado que empiezan por lo escrito.
       Espera un momento a que deje de teclear. Si la base no contesta,
       queda la lista de cercanas: las sugerencias son un atajo. */
    const pedirRemotas = (st, q) => {
      clearTimeout(relojRemoto);
      const clave = `${st}|${q}`;
      if (!st || q.replace(/[^a-z]/g, '').length < 2 || clave === remotasDe) return;
      const cli = _cliente();
      if (!cli) return;
      relojRemoto = setTimeout(async () => {
        try {
          const { data, error } = await cli.rpc('ciudades_sugerir', { p_state: st, p_q: q });
          if (error) throw error;
          if (`${estadoActual()}|${_plano(input.value)}` !== clave) return;   // ya escribió otra cosa
          remotas = Array.isArray(data) ? data.filter((c) => typeof c === 'string') : [];
          remotasDe = clave;
          if (document.activeElement === input) pintar();
        } catch (err) {
          console.warn('[FerociaLocation] city suggestions:', (err && err.message) || err);
        }
      }, 250);
    };

    const pintar = () => {
      if (eligiendo) return;
      const q = _plano(input.value);
      const st = estadoActual();
      const cercanas = (!st || st === 'FL') ? ciudades : [];
      const deAqui = q ? cercanas.filter((c) => _plano(c).includes(q)) : cercanas.slice();
      pedirRemotas(st, q);
      const remotasValen = remotasDe === `${st}|${q}` ? remotas : [];
      const vistas = new Set(deAqui.map(_plano));
      visibles = deAqui.concat(remotasValen.filter((c) => !vistas.has(_plano(c)))).slice(0, 15);

      /* Si lo escrito no se parece a ninguna, la lista estorba: la
         persona está escribiendo su propia ciudad y tapar el campo
         con una lista vacía es peor que no enseñar nada. */
      if (!visibles.length) { cerrar(); return; }

      /* Con elementos y textContent (no HTML): los nombres que manda la
         base nunca se interpretan como código. */
      const nombreEstado = (BY_CODE[st] && BY_CODE[st].name) || '';
      const pista = document.createElement('div');
      pista.className = 'fl-ciudad-pista';
      pista.textContent = remotasValen.length && nombreEstado ? `Cities in ${nombreEstado}` : titulo;
      lista.replaceChildren(pista, ...visibles.map((c, i) => {
        const op = document.createElement('div');
        op.className = 'fl-ciudad-op';
        op.setAttribute('role', 'option');
        op.dataset.i = String(i);
        op.textContent = c;
        return op;
      }));
      lista.classList.add('abierta');
      input.setAttribute('aria-expanded', 'true');
      activa = -1;
      marcar();
    };

    /* Mientras se elige, `pintar` no hace nada.

       Sin esta bandera la lista se quedaba abierta después de elegir:
       `elegir` avisa al campo de que ha cambiado, ese aviso llega a
       `pintar` —que escucha los cambios del campo— y `pintar` la
       volvía a abrir justo después de cerrarla. El aviso hace falta
       igual, por si algún día algo escucha al campo; lo que sobra es
       que se lo aplique a sí mismo. */
    let eligiendo = false;

    const elegir = (ciudad) => {
      eligiendo = true;
      input.value = ciudad;
      // Por si algo escucha al campo (contadores, validación en vivo).
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      eligiendo = false;
      cerrar();
    };

    input.addEventListener('focus', pintar);
    input.addEventListener('click', pintar);
    input.addEventListener('input', pintar);
    /* Otro estado: lo sugerido antes ya no vale. */
    if (estadoEl) estadoEl.addEventListener('change', () => { remotas = []; remotasDe = ''; cerrar(); });

    /* mousedown y no click: el ratón al bajar quita el foco del campo,
       y para cuando llegaría el click la lista ya se habría cerrado
       por el blur. preventDefault evita ese blur. */
    lista.addEventListener('mousedown', (e) => {
      const op = e.target.closest('.fl-ciudad-op');
      if (!op) return;
      e.preventDefault();
      elegir(visibles[Number(op.dataset.i)]);
    });

    input.addEventListener('keydown', (e) => {
      const abierta = lista.classList.contains('abierta');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!abierta) { pintar(); return; }
        e.preventDefault();
        activa += (e.key === 'ArrowDown' ? 1 : -1);
        if (activa < 0) activa = visibles.length - 1;
        if (activa >= visibles.length) activa = 0;
        marcar();
        lista.querySelectorAll('.fl-ciudad-op')[activa]
          ?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        /* Sólo se roba el Enter si hay una opción MARCADA. Si no, el
           Enter tiene que seguir enviando el formulario como siempre:
           quien escribió su ciudad y le da a Enter espera enviar, no
           que no pase nada. */
        if (abierta && activa >= 0) { e.preventDefault(); elegir(visibles[activa]); }
        else cerrar();
      } else if (e.key === 'Escape') {
        if (abierta) { e.stopPropagation(); cerrar(); }
      } else if (e.key === 'Tab') {
        cerrar();
      }
    });

    input.addEventListener('blur', () => setTimeout(cerrar, 120));
    document.addEventListener('click', (e) => {
      if (!caja.contains(e.target)) cerrar();
    });
  };

  /* ════════════════════════════════════════════════════════════
     LA CIUDAD TIENE QUE ESTAR EN EL ESTADO ELEGIDO (SQL 109, §93)
     ------------------------------------------------------------
     Antes de guardar, la página llama a
       await FerociaLocation.comprobarLugar('s-city', 's-state', ciudad, estado)
     y sólo guarda si devuelve true. Si no, el aviso queda pintado
     debajo de los dos campos:
       · la ciudad está en otro estado → "It's in Florida." y el botón
         "Change state to Florida" (no deja guardar);
       · no está en ninguna parte → "Check the spelling." y el botón
         "It's spelled right — keep it", que guarda tal cual.
     La base aplica la misma regla al guardar (aunque esta revisión
     no llegue a hacerse), así que esto es para explicarlo bien.
     Si la base no contesta, no se bloquea a nadie: guarda y la base
     decide.
     ════════════════════════════════════════════════════════════ */

  /* El cliente de la base: el del portal o el del sitio (db.js). */
  const _cliente = () => {
    const P = window.FerociaPortal;
    if (P && P.sb && typeof P.sb.rpc === 'function') return P.sb;
    const s = window.supabase;
    return s && typeof s.rpc === 'function' ? s : null;
  };

  /** @returns {Promise<{ok:boolean, mismatch?:boolean, unknown?:boolean, states?:Array, state_name?:string}>} */
  const revisarCiudadEstado = async (ciudad, estado) => {
    const cli = _cliente();
    if (!cli || !ciudad || !estado) return { ok: true, sinRevisar: true };
    try {
      const { data, error } = await cli.rpc('ciudad_estado_revisar', { p_city: ciudad, p_state: estado });
      if (error) throw error;
      return data && typeof data === 'object' ? data : { ok: true, sinRevisar: true };
    } catch (err) {
      console.warn('[FerociaLocation] city check:', (err && err.message) || err);
      return { ok: true, sinRevisar: true };
    }
  };

  /* "Está bien escrita, guárdala": se recuerda por campo, para esa
     ciudad en ese estado. Si cambia cualquiera de los dos, se pregunta
     otra vez. */
  const _aceptadas = new WeakMap();
  const _avisos = new WeakMap();

  const quitarAvisoLugar = (idCiudad) => {
    const ci = document.getElementById(idCiudad);
    const viejo = ci && _avisos.get(ci);
    if (viejo) { viejo.remove(); _avisos.delete(ci); }
  };

  /* El aviso va debajo de la fila que tiene los dos campos. */
  const _pintarAviso = (ci, es, texto, boton, alPulsar, duda) => {
    quitarAvisoLugar(ci.id);
    _ponerEstilos();
    let fila = ci.parentElement;
    while (fila && !fila.contains(es) && fila.parentElement) fila = fila.parentElement;
    const caja = document.createElement('div');
    caja.className = 'fl-lugar-aviso' + (duda ? ' fl-duda' : '');
    caja.setAttribute('role', 'alert');
    const p = document.createElement('p');
    p.textContent = texto;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fl-lugar-boton';
    b.textContent = boton;
    b.addEventListener('click', alPulsar);
    caja.append(p, b);
    if (fila && fila !== es && fila.contains(ci)) fila.after(caja); else ci.after(caja);
    _avisos.set(ci, caja);
    /* En cuanto toque la ciudad o el estado, el aviso ya no aplica. */
    if (!ci._flLugarEscucha) {
      ci._flLugarEscucha = true;
      const limpiar = () => quitarAvisoLugar(ci.id);
      ci.addEventListener('input', limpiar);
      es.addEventListener('change', limpiar);
    }
    return b;
  };

  /**
   * @param {string} idCiudad  id del campo de ciudad
   * @param {string} idEstado  id del <select> de estado
   * @param {string} ciudad    la ciudad ya limpia (normalizeCity)
   * @param {string} estado    el código del estado ("FL")
   * @returns {Promise<boolean>} true = se puede guardar
   */
  const comprobarLugar = async (idCiudad, idEstado, ciudad, estado) => {
    const ci = document.getElementById(idCiudad), es = document.getElementById(idEstado);
    if (!ci || !es) return true;
    quitarAvisoLugar(idCiudad);
    const r = await revisarCiudadEstado(ciudad, estado);
    const aqui = (r && r.state_name) || (BY_CODE[estado] && BY_CODE[estado].name) || estado;

    if (r && r.mismatch && Array.isArray(r.states) && r.states.length) {
      const otro = r.states[0];
      const cod = toStateCode(otro && otro.code);
      const nombre = (BY_CODE[cod] && BY_CODE[cod].name) || String((otro && otro.name) || '');
      const b = _pintarAviso(ci, es, `We couldn't find ${ciudad} in ${aqui}. It's in ${nombre}.`,
        `Change state to ${nombre}`, () => {
          es.value = cod;
          es.dispatchEvent(new Event('change', { bubbles: true }));
          quitarAvisoLugar(idCiudad);
          es.focus();
        }, false);
      b.focus();
      return false;
    }

    if (r && r.unknown) {
      const clave = `${estado}|${_plano(ciudad)}`;
      if (_aceptadas.get(ci) === clave) return true;
      _pintarAviso(ci, es, `We couldn't find ${ciudad} in ${aqui}. Check the spelling.`,
        "It's spelled right — keep it", () => {
          _aceptadas.set(ci, clave);
          quitarAvisoLugar(idCiudad);
          /* Vuelve a mandar el formulario: esta vez pasa. */
          const f = ci.form;
          if (f && typeof f.requestSubmit === 'function') f.requestSubmit();
          else if (f) f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }, true);
      ci.focus();
      return false;
    }
    return true;
  };

  /** "Boca Raton, FL" — the one place that decides how a location reads. */
  const formatLocation = (city, state) => {
    const c = (city || '').trim();
    // toStateCode first: a legacy "Florida" would otherwise render as the
    // shouted "FLORIDA".
    const s = toStateCode(state) || String(state || '').trim();
    if (c && s) return `${c}, ${s}`;
    return c || s || '';
  };

  window.FerociaLocation = {
    STATES,
    CIUDADES_CERCANAS,
    mountCitySuggest,
    normalizeCity,
    toStateCode,
    validateCity,
    validateState,
    stateOptions,
    loadCitySuggestions,
    formatLocation,
    revisarCiudadEstado,
    comprobarLugar,
    quitarAvisoLugar,
  };
})();
