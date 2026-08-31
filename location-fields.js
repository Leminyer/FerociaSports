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

  const validateState = (raw, opts) => {
    const required = !!(opts && opts.required);
    const v = String(raw ?? '').trim().toUpperCase();
    if (!v) {
      return required
        ? { ok: false, value: '', error: 'State is required.' }
        : { ok: true, value: '' };
    }
    if (!BY_CODE[v]) {
      return { ok: false, value: '', error: `"${raw}" is not a valid US state code.` };
    }
    return { ok: true, value: v };
  };

  /** <option> markup for a state dropdown, Florida first. */
  const stateOptions = (selected) => {
    const opt = (s) =>
      `<option value="${s.code}"${s.code === (selected || '') ? ' selected' : ''}>${s.name}</option>`;
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

  /** "Boca Raton, FL" — the one place that decides how a location reads. */
  const formatLocation = (city, state) => {
    const c = (city || '').trim();
    const s = (state || '').trim().toUpperCase();
    if (c && s) return `${c}, ${s}`;
    return c || s || '';
  };

  window.FerociaLocation = {
    STATES,
    normalizeCity,
    validateCity,
    validateState,
    stateOptions,
    loadCitySuggestions,
    formatLocation,
  };
})();
