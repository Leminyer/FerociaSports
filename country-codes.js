/* ============================================================
   FEROCIA — Phone field with country code selector
   ------------------------------------------------------------
   Standalone. Depends on nothing but the browser, and touches no
   existing code — mount it where you want a phone input.

   WHY A LOCAL FILE INSTEAD OF A LIBRARY
     intl-tel-input and similar packages weigh ~100 KB and solve
     problems FEROCIA does not have: 99.8% of the numbers on file are
     US 10-digit. They also wrap the input in their own markup, which
     fights the existing styles. This file is ~12 KB, uses the app's
     own design tokens, and there is no third-party dependency to
     audit or keep up to date.

   STORAGE CONTRACT
     Two separate values, matching the database columns:
       country_code -> "+1"          (dial code, with the plus)
       phone        -> "5613026946"  (digits only, no dial code)

     Formatting is presentation only. What the admin sees is
     "(561) 302-6946"; what gets saved is "5613026946". This is what
     makes the data uniform and searchable — the previous free-text
     field produced "(305) 322-4748", "201-895-4179" and "1301221423"
     for the same kind of number.

   USAGE
     FerociaPhone.mount({
       container: 'phone-field',       // id of an empty element
       inputClass: 'ap-input',         // class of the surrounding form
       value: { country_code: '+1', phone: '5613026946' },  // optional
       onChange: (v) => {}             // optional
     });

     FerociaPhone.getValue('phone-field');
       -> { country_code: '+1', phone: '5613026946' }
       -> { country_code: null, phone: null }   when left empty

     FerociaPhone.validate('phone-field');
       -> { ok: true }
       -> { ok: false, error: 'US numbers need 10 digits (you entered 9).' }

     FerociaPhone.setValue('phone-field', '+1', '5613026946');
   ============================================================ */

(function () {
  'use strict';

  /* ─── COUNTRY DATA ────────────────────────────────────────────
     `len` is the expected national number length, used only to warn
     the admin — never to block saving. Where a country allows several
     lengths, or where we are not confident, it is null and no length
     check runs. Guessing wrong would reject valid numbers, which is
     worse than not checking.
     ──────────────────────────────────────────────────────────── */
  const COUNTRIES = [
    // Pinned to the top: 99.8% of records on file are US numbers.
    { iso: 'US', name: 'United States', dial: '+1',   flag: '🇺🇸', len: 10, pinned: true },
    { iso: 'CA', name: 'Canada',        dial: '+1',   flag: '🇨🇦', len: 10, pinned: true },
    // Common in South Florida.
    { iso: 'VE', name: 'Venezuela',     dial: '+58',  flag: '🇻🇪', len: 10, pinned: true },
    { iso: 'CO', name: 'Colombia',      dial: '+57',  flag: '🇨🇴', len: 10, pinned: true },
    { iso: 'BR', name: 'Brazil',        dial: '+55',  flag: '🇧🇷', len: null, pinned: true },
    { iso: 'MX', name: 'Mexico',        dial: '+52',  flag: '🇲🇽', len: 10, pinned: true },

    { iso: 'AR', name: 'Argentina',          dial: '+54',  flag: '🇦🇷', len: null },
    { iso: 'AU', name: 'Australia',          dial: '+61',  flag: '🇦🇺', len: 9 },
    { iso: 'AT', name: 'Austria',            dial: '+43',  flag: '🇦🇹', len: null },
    { iso: 'BS', name: 'Bahamas',            dial: '+1',   flag: '🇧🇸', len: 10 },
    { iso: 'BB', name: 'Barbados',           dial: '+1',   flag: '🇧🇧', len: 10 },
    { iso: 'BE', name: 'Belgium',            dial: '+32',  flag: '🇧🇪', len: null },
    { iso: 'BO', name: 'Bolivia',            dial: '+591', flag: '🇧🇴', len: 8 },
    { iso: 'CL', name: 'Chile',              dial: '+56',  flag: '🇨🇱', len: 9 },
    { iso: 'CN', name: 'China',              dial: '+86',  flag: '🇨🇳', len: 11 },
    { iso: 'CR', name: 'Costa Rica',         dial: '+506', flag: '🇨🇷', len: 8 },
    { iso: 'CU', name: 'Cuba',               dial: '+53',  flag: '🇨🇺', len: 8 },
    { iso: 'CZ', name: 'Czechia',            dial: '+420', flag: '🇨🇿', len: 9 },
    { iso: 'DK', name: 'Denmark',            dial: '+45',  flag: '🇩🇰', len: 8 },
    { iso: 'DO', name: 'Dominican Republic', dial: '+1',   flag: '🇩🇴', len: 10 },
    { iso: 'EC', name: 'Ecuador',            dial: '+593', flag: '🇪🇨', len: 9 },
    { iso: 'EG', name: 'Egypt',              dial: '+20',  flag: '🇪🇬', len: 10 },
    { iso: 'SV', name: 'El Salvador',        dial: '+503', flag: '🇸🇻', len: 8 },
    { iso: 'FI', name: 'Finland',            dial: '+358', flag: '🇫🇮', len: null },
    { iso: 'FR', name: 'France',             dial: '+33',  flag: '🇫🇷', len: 9 },
    { iso: 'DE', name: 'Germany',            dial: '+49',  flag: '🇩🇪', len: null },
    { iso: 'GR', name: 'Greece',             dial: '+30',  flag: '🇬🇷', len: 10 },
    { iso: 'GT', name: 'Guatemala',          dial: '+502', flag: '🇬🇹', len: 8 },
    { iso: 'HT', name: 'Haiti',              dial: '+509', flag: '🇭🇹', len: 8 },
    { iso: 'HN', name: 'Honduras',           dial: '+504', flag: '🇭🇳', len: 8 },
    { iso: 'HK', name: 'Hong Kong',          dial: '+852', flag: '🇭🇰', len: 8 },
    { iso: 'HU', name: 'Hungary',            dial: '+36',  flag: '🇭🇺', len: 9 },
    { iso: 'IN', name: 'India',              dial: '+91',  flag: '🇮🇳', len: 10 },
    { iso: 'ID', name: 'Indonesia',          dial: '+62',  flag: '🇮🇩', len: null },
    { iso: 'IE', name: 'Ireland',            dial: '+353', flag: '🇮🇪', len: 9 },
    { iso: 'IL', name: 'Israel',             dial: '+972', flag: '🇮🇱', len: 9 },
    { iso: 'IT', name: 'Italy',              dial: '+39',  flag: '🇮🇹', len: null },
    { iso: 'JM', name: 'Jamaica',            dial: '+1',   flag: '🇯🇲', len: 10 },
    { iso: 'JP', name: 'Japan',              dial: '+81',  flag: '🇯🇵', len: null },
    { iso: 'MY', name: 'Malaysia',           dial: '+60',  flag: '🇲🇾', len: null },
    { iso: 'NL', name: 'Netherlands',        dial: '+31',  flag: '🇳🇱', len: 9 },
    { iso: 'NZ', name: 'New Zealand',        dial: '+64',  flag: '🇳🇿', len: null },
    { iso: 'NI', name: 'Nicaragua',          dial: '+505', flag: '🇳🇮', len: 8 },
    { iso: 'NG', name: 'Nigeria',            dial: '+234', flag: '🇳🇬', len: 10 },
    { iso: 'NO', name: 'Norway',             dial: '+47',  flag: '🇳🇴', len: 8 },
    { iso: 'PK', name: 'Pakistan',           dial: '+92',  flag: '🇵🇰', len: 10 },
    { iso: 'PA', name: 'Panama',             dial: '+507', flag: '🇵🇦', len: 8 },
    { iso: 'PY', name: 'Paraguay',           dial: '+595', flag: '🇵🇾', len: 9 },
    { iso: 'PE', name: 'Peru',               dial: '+51',  flag: '🇵🇪', len: 9 },
    { iso: 'PH', name: 'Philippines',        dial: '+63',  flag: '🇵🇭', len: 10 },
    { iso: 'PL', name: 'Poland',             dial: '+48',  flag: '🇵🇱', len: 9 },
    { iso: 'PT', name: 'Portugal',           dial: '+351', flag: '🇵🇹', len: 9 },
    { iso: 'PR', name: 'Puerto Rico',        dial: '+1',   flag: '🇵🇷', len: 10 },
    { iso: 'RO', name: 'Romania',            dial: '+40',  flag: '🇷🇴', len: 9 },
    { iso: 'RU', name: 'Russia',             dial: '+7',   flag: '🇷🇺', len: 10 },
    { iso: 'SA', name: 'Saudi Arabia',       dial: '+966', flag: '🇸🇦', len: 9 },
    { iso: 'SG', name: 'Singapore',          dial: '+65',  flag: '🇸🇬', len: 8 },
    { iso: 'ZA', name: 'South Africa',       dial: '+27',  flag: '🇿🇦', len: 9 },
    { iso: 'KR', name: 'South Korea',        dial: '+82',  flag: '🇰🇷', len: null },
    { iso: 'ES', name: 'Spain',              dial: '+34',  flag: '🇪🇸', len: 9 },
    { iso: 'SE', name: 'Sweden',             dial: '+46',  flag: '🇸🇪', len: null },
    { iso: 'CH', name: 'Switzerland',        dial: '+41',  flag: '🇨🇭', len: 9 },
    { iso: 'TW', name: 'Taiwan',             dial: '+886', flag: '🇹🇼', len: 9 },
    { iso: 'TH', name: 'Thailand',           dial: '+66',  flag: '🇹🇭', len: 9 },
    { iso: 'TT', name: 'Trinidad & Tobago',  dial: '+1',   flag: '🇹🇹', len: 10 },
    { iso: 'TR', name: 'Turkey',             dial: '+90',  flag: '🇹🇷', len: 10 },
    { iso: 'UA', name: 'Ukraine',            dial: '+380', flag: '🇺🇦', len: 9 },
    { iso: 'AE', name: 'United Arab Emirates', dial: '+971', flag: '🇦🇪', len: 9 },
    { iso: 'GB', name: 'United Kingdom',     dial: '+44',  flag: '🇬🇧', len: 10 },
    { iso: 'UY', name: 'Uruguay',            dial: '+598', flag: '🇺🇾', len: 8 },
    { iso: 'VN', name: 'Vietnam',            dial: '+84',  flag: '🇻🇳', len: 9 },
  ];

  const DEFAULT_ISO = 'US';

  // Live instances, keyed by container id.
  const instances = {};

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const digitsOnly = (s) => String(s ?? '').replace(/[^0-9]/g, '');

  const findByIso  = (iso)  => COUNTRIES.find(c => c.iso === iso);

  /* Several countries share +1 (US, Canada, the Caribbean). When only a
     dial code is known — which is all the database stores — the first
     match wins, and for +1 that is deliberately the US. */
  const findByDial = (dial) => COUNTRIES.find(c => c.dial === dial);

  /* US/Canada display formatting: 5613026946 -> (561) 302-6946.
     Everything else is left as typed. Faking a format for a country
     whose conventions we do not know would look wrong to someone who
     does know them. */
  const formatForDisplay = (digits, country) => {
    if (!digits) return '';
    if (country.dial === '+1') {
      if (digits.length <= 3)  return `(${digits}`;
      if (digits.length <= 6)  return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6,10)}`;
    }
    return digits;
  };

  const maxDigitsFor = (country) => country.len || 15; // E.164 ceiling

  function render(inst) {
    const { root, inputClass } = inst;
    const c = inst.country;

    root.innerHTML = `
      <div class="fp-wrap">
        <button type="button" class="fp-country" data-fp-toggle
                aria-haspopup="listbox" aria-expanded="false"
                title="${esc(c.name)} (${esc(c.dial)})">
          <span class="fp-flag">${c.flag}</span>
          <span class="fp-dial">${esc(c.dial)}</span>
          <svg class="fp-caret" width="10" height="10" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <input type="tel" class="fp-number ${esc(inputClass)}" data-fp-number
               inputmode="numeric" autocomplete="tel-national"
               placeholder="${c.dial === '+1' ? '(561) 302-6946' : 'Phone number'}"
               value="${esc(formatForDisplay(inst.digits, c))}">
      </div>
      <div class="fp-hint" data-fp-hint></div>
      <div class="fp-menu" data-fp-menu hidden>
        <input type="text" class="fp-search" data-fp-search placeholder="Search country..." autocomplete="off">
        <div class="fp-list" data-fp-list role="listbox"></div>
      </div>`;

    renderList(inst, '');
    wire(inst);
  }

  function renderList(inst, query) {
    const list = inst.root.querySelector('[data-fp-list]');
    const q = query.trim().toLowerCase();

    const match = (c) =>
      !q || c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.iso.toLowerCase() === q;

    const pinned = COUNTRIES.filter(c => c.pinned && match(c));
    const rest   = COUNTRIES.filter(c => !c.pinned && match(c))
                            .sort((a, b) => a.name.localeCompare(b.name));

    const row = (c) => `
      <button type="button" class="fp-opt${c.iso === inst.country.iso ? ' is-active' : ''}"
              role="option" data-fp-pick="${c.iso}">
        <span class="fp-flag">${c.flag}</span>
        <span class="fp-opt-name">${esc(c.name)}</span>
        <span class="fp-opt-dial">${esc(c.dial)}</span>
      </button>`;

    if (!pinned.length && !rest.length) {
      list.innerHTML = `<div class="fp-empty">No country matches that search.</div>`;
      return;
    }

    list.innerHTML =
      pinned.map(row).join('') +
      (pinned.length && rest.length ? '<div class="fp-sep"></div>' : '') +
      rest.map(row).join('');
  }

  function setHint(inst, text, kind) {
    const el = inst.root.querySelector('[data-fp-hint]');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'fp-hint' + (text ? ` is-${kind || 'info'}` : '');
  }

  function wire(inst) {
    const root   = inst.root;
    const toggle = root.querySelector('[data-fp-toggle]');
    const menu   = root.querySelector('[data-fp-menu]');
    const search = root.querySelector('[data-fp-search]');
    const number = root.querySelector('[data-fp-number]');

    const closeMenu = () => {
      menu.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      search.value = '';
      renderList(inst, '');
    };

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      toggle.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) search.focus();
    });

    search.addEventListener('input', () => renderList(inst, search.value));
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); toggle.focus(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = root.querySelector('[data-fp-pick]');
        if (first) first.click();
      }
    });

    root.querySelector('[data-fp-list]').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fp-pick]');
      if (!btn) return;
      const next = findByIso(btn.dataset.fpPick);
      if (!next) return;
      inst.country = next;
      // Trim if the new country allows fewer digits than are typed.
      inst.digits = inst.digits.slice(0, maxDigitsFor(next));
      render(inst);
      const n = inst.root.querySelector('[data-fp-number]');
      if (n) n.focus();
      emit(inst);
    });

    // Typing: keep only digits in state, show a formatted version.
    number.addEventListener('input', () => {
      const before   = number.value;
      const caretEnd = number.selectionStart === before.length;
      inst.digits = digitsOnly(before).slice(0, maxDigitsFor(inst.country));
      number.value = formatForDisplay(inst.digits, inst.country);
      // Only force the caret to the end when it was already there, so
      // editing mid-number does not jump the cursor around.
      if (caretEnd) number.setSelectionRange(number.value.length, number.value.length);
      setHint(inst, '');
      emit(inst);
    });

    number.addEventListener('blur', () => {
      const r = validateInstance(inst);
      setHint(inst, r.ok ? '' : r.error, 'warn');
    });

    // Close when clicking anywhere else on the page.
    if (!inst._docHandler) {
      inst._docHandler = (e) => { if (!root.contains(e.target)) closeMenu(); };
      document.addEventListener('click', inst._docHandler);
    }
  }

  function emit(inst) {
    if (typeof inst.onChange === 'function') {
      inst.onChange(valueOf(inst));
    }
  }

  function valueOf(inst) {
    return inst.digits
      ? { country_code: inst.country.dial, phone: inst.digits }
      : { country_code: null, phone: null };
  }

  /* Validation is advisory. An empty field is valid — plenty of players
     have no phone on record, and forcing one would push admins to type
     junk to get past the form. */
  function validateInstance(inst) {
    const d = inst.digits;
    if (!d) return { ok: true };
    if (d.length < 4) {
      return { ok: false, error: 'That looks too short to be a phone number.' };
    }
    if (d.length > 15) {
      return { ok: false, error: 'Phone numbers cannot be longer than 15 digits.' };
    }
    const expected = inst.country.len;
    if (expected && d.length !== expected) {
      return {
        ok: false,
        error: `${inst.country.name} numbers need ${expected} digits (you entered ${d.length}).`,
      };
    }
    return { ok: true };
  }

  window.FerociaPhone = {
    COUNTRIES,

    mount(opts) {
      const root = typeof opts.container === 'string'
        ? document.getElementById(opts.container)
        : opts.container;
      if (!root) {
        console.warn('[FerociaPhone] container not found:', opts.container);
        return null;
      }

      const val     = opts.value || {};
      const country = (val.country_code && findByDial(val.country_code))
                   || findByIso(DEFAULT_ISO);

      const inst = {
        root,
        id:         root.id,
        inputClass: opts.inputClass || '',
        country,
        digits:     digitsOnly(val.phone).slice(0, maxDigitsFor(country)),
        onChange:   opts.onChange,
      };

      // Remove the document listener of a previous mount on the same
      // container, or they accumulate every time a modal reopens.
      const prev = instances[inst.id];
      if (prev && prev._docHandler) document.removeEventListener('click', prev._docHandler);

      instances[inst.id] = inst;
      render(inst);
      return inst;
    },

    getValue(id) {
      const inst = instances[id];
      return inst ? valueOf(inst) : { country_code: null, phone: null };
    },

    setValue(id, countryCode, phone) {
      const inst = instances[id];
      if (!inst) return;
      inst.country = (countryCode && findByDial(countryCode)) || findByIso(DEFAULT_ISO);
      inst.digits  = digitsOnly(phone).slice(0, maxDigitsFor(inst.country));
      render(inst);
    },

    clear(id) { this.setValue(id, null, ''); },

    validate(id) {
      const inst = instances[id];
      if (!inst) return { ok: true };
      const r = validateInstance(inst);
      setHint(inst, r.ok ? '' : r.error, 'warn');
      return r;
    },

    // Digits only, no dial code — for CSV import and other bulk paths
    // that never touch the UI.
    normalize(raw) { return digitsOnly(raw); },
  };
})();
