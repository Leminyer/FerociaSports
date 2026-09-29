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
      }`;
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

    const pintar = () => {
      if (eligiendo) return;
      const q = _plano(input.value);
      visibles = q ? ciudades.filter((c) => _plano(c).includes(q)) : ciudades.slice();

      /* Si lo escrito no se parece a ninguna, la lista estorba: la
         persona está escribiendo su propia ciudad y tapar el campo
         con una lista vacía es peor que no enseñar nada. */
      if (!visibles.length) { cerrar(); return; }

      lista.innerHTML = `<div class="fl-ciudad-pista">${titulo}</div>`
        + visibles.map((c, i) =>
            `<div class="fl-ciudad-op" role="option" data-i="${i}">${c}</div>`).join('');
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
  };
})();
