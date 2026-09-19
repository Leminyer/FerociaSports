/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: NEWSLETTER
   Depends on: config.js, db.js, admin-state.js
   ------------------------------------------------------------
   Create, edit, preview, test and send FEROCIA Monthly.

   SAVE AND SEND ARE SEPARATE, ALWAYS
     Saving writes the draft. Sending is a different button with its own
     confirmation. Nothing goes out because someone pressed Save.

   A SENT EDITION IS HISTORY
     Once status is 'sent', the editor becomes read-only. Subscribers
     already have that content in their inbox; letting it be edited would
     make the archive disagree with what was actually delivered.

   THE PREVIEW IS THE REAL THING
     It renders through the same Edge Function that sends, in preview
     mode, rather than a separate mock that could drift from the email.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) { console.error('[Ferocia] config.js must load before admin-newsletter.js'); return; }

  let _issues  = [];
  let _current = null;   // the edition being edited
  let _dirty   = false;

  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  /* ─── HELPERS ────────────────────────────────────────────── */

  const setDirty = (v) => {
    _dirty = v;
    const btn = document.getElementById('nl-save-btn');
    if (btn) {
      btn.textContent = v ? 'Save Draft •' : 'Save Draft';
      // Blue is the resting state, matching Preview and Send Test to Me.
      // This used to reset to grey-and-black, which quietly undid the
      // styling set in the markup.
      btn.style.borderColor = v ? 'var(--orange)' : 'var(--blue)';
      btn.style.color       = v ? 'var(--orange)' : 'var(--blue)';
    }
  };

  const isSent = () => _current?.status === 'sent';

  /* The newsletter spells the month out in full — "October 2, 2026" — while
     the rest of the admin uses the short form.

     fmtDate is a global shared by nine modules (players, sessions,
     promotions, rosters and more). Changing it to suit the newsletter
     would move dates on screens nobody asked about, so it is left alone
     and the long form is built here, for this section only.

     Noon rather than midnight: "2026-10-02" parsed as UTC midnight becomes
     October 1st for anyone west of Greenwich. */
  const fmtDateLong = (d) => {
    if (!d) return '';
    const dt = new Date(String(d).includes('T') ? d : d + 'T12:00:00');
    return isNaN(dt) ? String(d)
      : dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  /** Reads a value out of the content object by dotted path. */
  const get = (path, fallback = '') => {
    const parts = path.split('.');
    let v = _current?.content || {};
    for (const p of parts) { v = v?.[p]; if (v === undefined) return fallback; }
    return v ?? fallback;
  };

  const set = (path, value) => {
    if (isSent()) return;
    const parts = path.split('.');
    let o = _current.content;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
    setDirty(true);
  };
  window.nlSet = set;

  /* Inter is the app's typeface everywhere else, so it is stated on every
     control rather than left to inherit — form elements do NOT inherit
     font-family from their parent by default, which is why the small text
     here looked different from the rest of the admin. */
  const FONT = "font-family:'Inter',sans-serif;";
  const inputStyle = 'width:100%;padding:10px 12px;border:1px solid var(--divider-color);border-radius:8px;'
    + FONT + 'font-size:13px;font-weight:600;color:var(--text);outline:none;';

  const field = (label, path, opts = {}) => {
    const v = esc(get(path));
    const dis = isSent() ? 'disabled' : '';
    const el = opts.textarea
      ? `<textarea data-nlpath="${path}" ${dis} rows="${opts.rows || 5}" placeholder="${esc(opts.placeholder || '')}"
           style="${inputStyle}resize:vertical;line-height:1.6;font-weight:500;">${v}</textarea>`
      : `<input type="text" data-nlpath="${path}" ${dis} value="${v}" placeholder="${esc(opts.placeholder || '')}" style="${inputStyle}">`;
    return `
      <div style="margin-bottom:12px;">
        <div style="${FONT}font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">${esc(label)}</div>
        ${el}
        ${opts.hint ? `<div style="${FONT}font-size:11px;font-weight:600;color:var(--text-light);margin-top:4px;line-height:1.5;">${esc(opts.hint)}</div>` : ''}
      </div>`;
  };

  /* The icon that sits above each Around FEROCIA number.

     These are the PNG files in the newsletter-images bucket, the same ones
     the email itself loads — so what the dropdown previews is exactly what
     the reader gets. A <select> cannot draw an image, so the chosen icon is
     shown beside it.

     Leaving it on "Default" gives the icon that matches the position, so
     nothing has to be chosen for the section to look finished. A <select>
     fires the same `input` event as the text fields, so it saves through
     the one delegated listener already in place. */
  const ICON_BASE = CFG.SUPABASE_URL + '/storage/v1/object/public/newsletter-images/icons/';

  const ICON_CHOICES = [
    ['num-players', 'Players'],
    ['num-games',   'Games played'],
    ['num-ladders', 'Ladders'],
    ['num-new',     'New players'],
  ];
  const ICON_DEFAULTS = ICON_CHOICES.map((c) => c[0]);   // same order as the email

  const iconField = (path, index) => {
    const v    = get(path);
    const dis  = isSent() ? 'disabled' : '';
    // Drafts saved before the icons became images may still hold an emoji.
    const name = /^[a-z][a-z0-9-]*$/.test(v) ? v : '';
    const shown = name || ICON_DEFAULTS[index] || ICON_DEFAULTS[0];
    return `
      <div style="margin-bottom:12px;">
        <div style="${FONT}font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">Icon</div>
        <div style="display:flex;align-items:center;gap:9px;">
          <img src="${esc(ICON_BASE + shown + '.png')}" alt="" width="26" height="26"
               style="flex-shrink:0;display:block;">
          <select data-nlpath="${path}" ${dis} style="${inputStyle}cursor:pointer;">
            <option value="" ${name ? '' : 'selected'}>Default</option>
            ${ICON_CHOICES.map(([f, n]) =>
              `<option value="${f}" ${name === f ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </div>
      </div>`;
  };

  /* Upload box instead of asking for a URL.

     "Paste the public link from the bucket" assumed the person knows what
     a bucket is. They pick a file; the upload happens here, exactly as the
     event flyer upload already does. */
  const imageField = (label, path, hint) => {
    const url = get(path);
    const id  = 'nlimg_' + path.replace(/\./g, '_');
    return `
      <div style="margin-bottom:12px;">
        <div style="${FONT}font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;">${esc(label)}</div>
        ${url ? `
        <div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--divider-color);border-radius:8px;margin-bottom:8px;">
          <img src="${esc(url)}" alt="" style="width:90px;height:60px;object-fit:cover;border-radius:6px;flex-shrink:0;">
          <div style="flex:1;min-width:0;${FONT}font-size:11px;font-weight:600;color:var(--text-muted);">Image uploaded</div>
          ${isSent() ? '' : `<button type="button" data-action="nlImgClear" data-path="${path}"
            style="background:none;border:none;color:#e53935;${FONT}font-size:11px;font-weight:700;cursor:pointer;">Remove</button>`}
        </div>` : ''}
        ${isSent() ? '' : `
        <!-- The browser's default file input is ugly and dated. Events
             already solved this: a styled <label> pointing at a hidden
             <input>. Same class, same look. -->
        <label class="ev-file-upload" for="${id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span style="${FONT}font-size:11px;font-weight:600;color:var(--text-muted);">${url ? 'Click to replace' : 'Click to upload'} — JPG or PNG, max 5MB</span>
        </label>
        <input type="file" id="${id}" accept="image/jpeg,image/png,image/jpg" data-action-file="${path}" style="display:none;">
        <div id="${id}_status" style="${FONT}font-size:11px;font-weight:600;color:var(--blue);margin-top:5px;"></div>`}
        ${hint ? `<div style="${FONT}font-size:11px;font-weight:600;color:var(--text-light);margin-top:4px;line-height:1.5;">${esc(hint)}</div>` : ''}
      </div>`;
  };

  /** Uploads to the newsletter-images bucket and stores the public URL. */
  const uploadImage = async (file, path, statusId) => {
    const st = document.getElementById(statusId);
    const setStatus = (t, err) => { if (st) { st.textContent = t; st.style.color = err ? '#e53935' : 'var(--blue)'; } };

    if (!file.type.startsWith('image/')) { setStatus('That file is not an image.', true); return; }
    // 5MB, same ceiling the event flyer upload uses.
    if (file.size > 5 * 1024 * 1024)     { setStatus('Image must be under 5MB.', true); return; }

    setStatus('Uploading...');
    try {
      const ext  = file.name.split('.').pop().toLowerCase();
      const name = `${Date.now()}_${path.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
      const token = (await window.supabase.auth.getSession()).data.session.access_token;
      const res = await fetch(`${CFG.SUPABASE_URL}/storage/v1/object/newsletter-images/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type, 'x-upsert': 'false' },
        body: file,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || `Upload failed (${res.status})`);
      }
      set(path, `${CFG.SUPABASE_URL}/storage/v1/object/public/newsletter-images/${name}`);
      setStatus('');
      renderSections();
      toast('Image uploaded.');
    } catch (err) {
      setStatus(err.message, true);
    }
  };

  document.addEventListener('change', (e) => {
    const path = e.target?.dataset?.actionFile;
    if (path && e.target.files?.[0]) {
      uploadImage(e.target.files[0], path, e.target.id + '_status');
    }
    // A <select> fires `input` in every current browser, so the delegated
    // input listener already covers the icon dropdown. This is the belt to
    // that suspenders: writing the same value twice changes nothing.
    const nlpath = e.target?.dataset?.nlpath;
    if (nlpath && e.target.tagName === 'SELECT' && _current) set(nlpath, e.target.value);
  });

  window.nlImgClear = (path) => { set(path, ''); renderSections(); };

  const sectionCard = (num, title, purpose, body) => `
    <div class="card" style="padding:0;margin-bottom:14px;overflow:hidden;">
      <div style="padding:14px 18px;background:var(--bg);border-bottom:0.5px solid var(--divider-color);">
        <div style="display:flex;align-items:center;gap:9px;">
          <div style="width:22px;height:22px;border-radius:50%;background:var(--blue);color:white;font-family:'Inter',sans-serif;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${num}</div>
          <div style="font-family:'Inter',sans-serif;font-size:15px;font-weight:800;color:var(--text);">${esc(title)}</div>
        </div>
        <div style="${FONT}font-size:11.5px;font-weight:600;color:var(--text-muted);margin-top:4px;">${esc(purpose)}</div>
      </div>
      <div style="padding:16px 18px;">${body}</div>
    </div>`;

  /* ─── REPEATING ITEMS ────────────────────────────────────── */

  /* Upcoming events, champions and spotlight are lists with no fixed
     length: an October with four ladders and a November with one must
     both work. Items are added and removed rather than living in a
     fixed number of slots. */

  const listAdd = (path, template) => {
    if (isSent()) return;
    const arr = get(path, []);
    arr.push(JSON.parse(JSON.stringify(template)));
    set(path, arr);
    renderSections();
  };
  window.nlListAdd = listAdd;

  const listRemove = async (path, idx) => {
    if (isSent()) return;
    const ok = await confirmModal({
      title: 'Remove this item?',
      message: 'It will be taken out of this edition. Nothing is sent or deleted elsewhere.',
      okLabel: 'Remove', cancelLabel: 'Cancel',
    });
    if (!ok) return;
    const arr = get(path, []);
    arr.splice(idx, 1);
    set(path, arr);
    renderSections();
  };
  window.nlListRemove = listRemove;

  const removeBtn = (path, i) => isSent() ? '' : `
    <button type="button" data-action="nlRemove" data-path="${path}" data-idx="${i}"
      style="background:none;border:none;color:#e53935;${FONT}font-size:11px;font-weight:700;cursor:pointer;padding:0;">Remove</button>`;

  const addBtn = (label, action, path) => isSent() ? '' : `
    <button type="button" data-action="${action}" data-path="${path}"
      style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px dashed var(--blue);border-radius:8px;background:white;color:var(--blue);font-family:'Inter',sans-serif;font-size:11.5px;font-weight:700;cursor:pointer;">
      + ${esc(label)}</button>`;

  const itemBox = (inner, path, i) => `
    <div style="border:1px solid var(--divider-color);border-radius:8px;padding:13px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:9px;">
        <span style="font-size:10px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Item ${i + 1}</span>
        ${removeBtn(path, i)}
      </div>
      ${inner}</div>`;

  /* ─── SECTION RENDERERS ──────────────────────────────────── */

  const secHeader = () => sectionCard('H', 'Header', 'The banner image and the line printed over it', `
    ${imageField('Banner image', 'hero.image_url',
       'Appears at the top of the email, under the FEROCIA Monthly title. Landscape works best — about twice as wide as it is tall.')}
    ${field('Line printed over the banner', 'hero.quote', {
       placeholder: 'A stronger pickleball community together.',
       hint: 'One short sentence, shown in white over the dark strip below the image. Leave it empty and the strip is not shown at all.' })}`);

  const secUpcoming = () => {
    const items = get('upcoming', []);
    return sectionCard(1, "What's Coming Up", 'Ladders, tournaments, clinics — what readers can register for',
      (isSent() ? '' : `
      <div style="margin-bottom:12px;">
        <button type="button" data-action="nlPickEvents"
          style="display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border:1px solid var(--blue);border-radius:99px;background:#f0f5ff;color:var(--blue);${FONT}font-size:12px;font-weight:700;cursor:pointer;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Add from Events
        </button>
      </div>`)
      // The line that sits under the heading. The email has always rendered
      // it; there was simply no box to type it in, so it was always empty.
      + field('Intro line', 'upcoming_sub',
              { placeholder: 'New ladders. A spooky tournament. More pickleball.',
                hint: 'One short line under the WHAT\'S COMING UP heading.' })
      + items.map((_, i) => itemBox(
        field('Name', `upcoming.${i}.title`) +
        field('Date', `upcoming.${i}.date`, { placeholder: 'Starts October 2, 2026' }) +
        field('Time', `upcoming.${i}.time`, { placeholder: '8:30 AM – 10:30 AM' }) +
        field('Location', `upcoming.${i}.location`) +
        imageField(`Flyer (optional)`, `upcoming.${i}.image_url`,
          'For a tournament with its own artwork. The flyer fills the top of the card; leave it empty and the card shows the calendar instead.') +
        field('Registration URL', `upcoming.${i}.url`, { hint: 'Leave empty if registration has not opened.' }) +
        field('Button label', `upcoming.${i}.cta_label`, { placeholder: 'Register Now — or "Registration coming soon" with no URL' }),
        'upcoming', i)).join('')
      + addBtn('Add event', 'nlAddUpcoming', 'upcoming'));
  };

  const secSpotlight = () => {
    const items = get('spotlight', []);
    const players = (base, key, label) => {
      const arr = get(`${base}.${key}`, []);
      return `<div style="margin:10px 0 4px;font-size:10px;font-weight:800;color:var(--blue);text-transform:uppercase;letter-spacing:.5px;">${label}</div>`
        + arr.map((_, j) => `
          <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:6px;">
            <div style="width:20px;padding-top:10px;font-size:11px;font-weight:800;color:var(--text-muted);">${j + 1}</div>
            <div style="flex:2;">${field('Name', `${base}.${key}.${j}.name`)}</div>
            <div style="flex:1;">${field('Points', `${base}.${key}.${j}.detail`, { placeholder: '83 PTS' })}</div>
            <div style="padding-top:10px;">${removeBtn(`${base}.${key}`, j)}</div>
          </div>`).join('')
        + addBtn(`Add to ${label}`, 'nlAddPlayer', `${base}.${key}`);
    };
    return sectionCard(2, 'Player Spotlight', 'Ladder leaders, most improved, or any recognition this month',
      (isSent() ? '' : `
      <div style="margin-bottom:12px;">
        <button type="button" data-action="nlPickLadder"
          style="display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border:1px solid var(--blue);border-radius:99px;background:#f0f5ff;color:var(--blue);${FONT}font-size:12px;font-weight:700;cursor:pointer;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Add a Ladder
        </button>
      </div>`)
      + items.map((_, i) => itemBox(
        field('Ladder name', `spotlight.${i}.ladder`) +
        field('Period', `spotlight.${i}.period`, { placeholder: 'July – September 2026' }) +
        players(`spotlight.${i}`, 'top_men', 'Top Men') +
        players(`spotlight.${i}`, 'top_women', 'Top Women'),
        'spotlight', i)).join('')
      + addBtn('Add manually', 'nlAddSpotlight', 'spotlight'));
  };

  const secChampions = () => {
    const items = get('champions', []);
    return sectionCard(3, 'Tournament Champions', 'Every division, every placement — the layout grows',
      (isSent() ? '' : `
      <div style="margin-bottom:12px;">
        <button type="button" data-action="nlPickTournament"
          style="display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border:1px solid var(--blue);border-radius:99px;background:#f0f5ff;color:var(--blue);${FONT}font-size:12px;font-weight:700;cursor:pointer;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Add a Tournament
        </button>
      </div>`)
      // The tournament name and the divisions only appear once there is
      // something to edit. Importing fills the name in, so an empty field
      // and an "Add division" button up front asked the admin to do work
      // the importer was about to do for them.
      + (items.length
          ? field('Tournament name', 'champions_sub', { placeholder: 'Mamba Day 2026 · Sunday, August 23, 2026' })
          : '')
      + items.map((_, i) => {
        const pod = get(`champions.${i}.podium`, ['', '', '']);
        return itemBox(
          field('Division', `champions.${i}.division`, { placeholder: 'Mixed Doubles 55+' }) +
          field('Level', `champions.${i}.level`, { placeholder: 'Up to 4.0' }) +
          pod.map((_, j) =>
            field(['Champion', '2nd place', '3rd place'][j] || `${j + 1}th`, `champions.${i}.podium.${j}`,
                  { placeholder: 'Chris Berry & Emely Skiff' })).join(''),
          'champions', i);
      }).join('')
      + addBtn(items.length ? 'Add division' : 'Add manually', 'nlAddChampion', 'champions'));
  };

  const secCoach = () => sectionCard(4, "Coach's Corner", 'Real pickleball teaching — the reason to open the email', `
    ${field('Tip headline', 'coach.title', { placeholder: 'Win the point later, not on your third shot' })}
    ${field('Body', 'coach.body', { textarea: true, rows: 9, hint: 'Blank lines become paragraphs.' })}
    ${field('Signature', 'coach.author', { placeholder: 'Coach Leminyer' })}
    ${field("This month's challenge", 'coach.challenge', { textarea: true, rows: 3 })}
    ${field('Challenge goal', 'coach.goal', {
       placeholder: 'Ten clean third-shot drops in a row',
       hint: 'Optional. Shown on its own line, in bold, under the challenge.' })}`);

  const secPick = () => sectionCard(5, 'FEROCIA Pick of the Month', 'One product — never a carousel', `
    ${field('Product name', 'pick.name', { placeholder: 'Selkirk SLK Halo Control' })}
    ${imageField('Product photo', 'pick.image_url',
       'Optional. A photo of the product — the email still reads fine without one.')}
    ${field('Description', 'pick.description', { textarea: true, rows: 3 })}
    ${field("Coach's tip", 'pick.tip', { textarea: true, rows: 3 })}
    ${field('Amazon / affiliate URL', 'pick.amazon_url', { hint: 'Pasted exactly as given. Nothing is appended to it.' })}`);

  const secNumbers = () => {
    const items = get('numbers.items', []);
    return sectionCard(6, 'Around FEROCIA', 'Monthly activity — only the metrics worth showing',
      field('Subtitle', 'numbers.subtitle', { placeholder: 'September by the numbers' })
      + items.map((_, i) => `
        <div style="display:flex;gap:8px;align-items:flex-start;">
          <div style="width:168px;flex-shrink:0;">${iconField(`numbers.items.${i}.icon`, i)}</div>
          <div style="flex:1;">${field('Value', `numbers.items.${i}.value`, { placeholder: '64' })}</div>
          <div style="flex:2;">${field('Label', `numbers.items.${i}.label`, { placeholder: 'Players on court' })}</div>
          <div style="padding-top:10px;">${removeBtn('numbers.items', i)}</div>
        </div>`).join('')
      + (items.length < 4 ? `<div style="margin-bottom:18px;">${addBtn('Add metric', 'nlAddMetric', 'numbers.items')}</div>` : '')
      + field('Closing line', 'numbers.footer', { placeholder: 'A growing community. A brighter place to play.' }));
  };

  const renderSections = () => {
    const el = document.getElementById('nl-sections');
    if (!el || !_current) return;
    el.innerHTML = secHeader() + secUpcoming() + secSpotlight() + secChampions()
                 + secCoach() + secPick() + secNumbers();
  };

  // One delegated listener rather than one per field: the sections are
  // rebuilt whenever a list item is added or removed.
  document.addEventListener('input', (e) => {
    const path = e.target?.dataset?.nlpath;
    if (path && _current) set(path, e.target.value);
  });


  /* ─── IMPORTING FROM THE DATABASE ────────────────────────────
     Events, ladder standings and tournament results already live in
     FEROCIA's tables. Retyping them into a newsletter is slow and gets
     names and points wrong.

     Everything imported stays EDITABLE afterwards: newsletter copy is
     not the same as an operational record, and a title that reads well
     in the admin may need shortening for an email.
     ──────────────────────────────────────────────────────────── */

  let _pickState = null;   // { mode, items, selected }

  const openPick = (title, sub, bodyHTML, showConfirm) => {
    document.getElementById('nl-pick-title').textContent = title;
    document.getElementById('nl-pick-sub').textContent   = sub;
    document.getElementById('nl-pick-body').innerHTML    = bodyHTML;
    document.getElementById('nl-pick-footer').style.display = showConfirm ? 'block' : 'none';
    document.getElementById('nl-pick-modal').classList.add('open');
  };

  window.nlClosePick = () => {
    document.getElementById('nl-pick-modal').classList.remove('open');
    _pickState = null;
  };

  /* A <label> for the checkbox rows, a <div> for the click-through ones.

     They were all divs with data-action="nlPickToggle", which meant
     clicking the checkbox toggled it natively AND fired the row handler
     that toggled it back — so nothing ever appeared ticked. A label lets
     the browser handle it, and the whole row stays clickable. */
  const pickRow = (inner, attrs = '', asLabel = false) => asLabel
    ? `<label ${attrs} style="display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid var(--divider-color);border-radius:8px;margin-bottom:8px;cursor:pointer;">${inner}</label>`
    : `<div ${attrs} style="display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid var(--divider-color);border-radius:8px;margin-bottom:8px;cursor:pointer;">${inner}</div>`;

  const emptyMsg = (t) => `<div style="${FONT}padding:26px;text-align:center;font-size:12.5px;font-weight:600;color:var(--text-muted);line-height:1.6;">${esc(t)}</div>`;

  /* ── EVENTS ──────────────────────────────────────────────── */

  window.nlPickEvents = async () => {
    openPick('Add from Events', 'Loading...', emptyMsg('Loading events...'), false);
    let events = [];
    try {
      // Same visibility rule the site uses: upcoming one-off events plus
      // the recurring ones, which have no future date of their own.
      const today = todayISO();
      events = await api(`events?or=(event_date.gte.${today},event_type.in.(clinic,private_session))`
        + `&select=*&order=event_date.asc`);
    } catch (err) {
      openPick('Add from Events', '', emptyMsg(`Could not load events: ${err.message}`), false);
      return;
    }
    if (!events.length) {
      openPick('Add from Events', '', emptyMsg('There are no upcoming events. Create one on the Events page first.'), false);
      return;
    }
    _pickState = { mode: 'events', items: events, selected: new Set() };

    const fmtT = (t) => t ? window.fmtTime12(t) : '';
    openPick('Add from Events', 'Tick the ones to feature. Everything stays editable afterwards.',
      events.map((e, i) => pickRow(`
        <input type="checkbox" class="nl-pick-cb" id="nlcb_${i}" data-i="${i}" style="width:16px;height:16px;accent-color:var(--blue);cursor:pointer;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="${FONT}font-size:13px;font-weight:700;color:var(--text);">${esc(e.title)}</div>
          <div style="${FONT}font-size:11px;font-weight:600;color:var(--text-muted);margin-top:1px;">
            ${fmtDate(e.event_date)}${e.event_time ? ` · ${fmtT(e.event_time)}` : ''}${e.event_time && e.end_time ? ` – ${fmtT(e.end_time)}` : ''}
          </div>
          ${e.registration_url
            ? '<div style="' + FONT + 'font-size:10px;font-weight:700;color:#1D9E68;margin-top:2px;">Registration link available</div>'
            : '<div style="' + FONT + 'font-size:10px;font-weight:700;color:#9a6200;margin-top:2px;">No registration link yet</div>'}
        </div>`, `for="nlcb_${i}"`, true)).join(''),
      true);
  };

  /* ── LADDERS ─────────────────────────────────────────────── */

  window.nlPickLadder = async () => {
    openPick('Add From Ladder', 'Loading...', emptyMsg('Loading ladders...'), false);
    let ladders = [];
    try {
      // Completed only: a ladder still running has no final standings, so
      // publishing its leaders would be wrong by next week.
      ladders = await api('ladders?status=eq.completed&select=*&order=id.desc');
    } catch (err) {
      openPick('Add From Ladder', '', emptyMsg(`Could not load ladders: ${err.message}`), false);
      return;
    }
    if (!ladders.length) {
      openPick('Add From Ladder', '', emptyMsg('No completed ladders yet. Only finished ladders have final standings to publish.'), false);
      return;
    }
    _pickState = { mode: 'ladder', items: ladders };

    openPick('Add From Ladder', 'Pick one — the top three men and women load automatically.',
      ladders.map((l, i) => pickRow(`
        <div style="flex:1;min-width:0;">
          <div style="${FONT}font-size:13px;font-weight:700;color:var(--text);">${esc(l.name)}</div>
          <div style="${FONT}font-size:11px;font-weight:600;color:var(--text-muted);margin-top:1px;">
            ${l.start_date ? fmtDate(l.start_date) : ''}${l.end_date ? ` – ${fmtDate(l.end_date)}` : ''}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
        `data-action="nlLadderChoose" data-i="${i}"`)).join(''),
      false);
  };

  window.nlLadderChoose = async (i) => {
    const l = _pickState?.items?.[i];
    if (!l) return;
    document.getElementById('nl-pick-body').innerHTML = emptyMsg('Loading standings...');
    try {
      const { data, error } = await window.supabase.rpc('get_ladder_standings', { p_ladder_id: l.id });
      if (error) throw new Error(error.message);

      /* rank in the RPC is the OVERALL position, so it cannot be used to
         pick the top three of each gender — a ladder whose first four are
         men would leave the women's list starting at rank 5. Each gender
         is ranked separately here. */
      const byGender = (g) => (data || [])
        .filter((r) => String(r.gender || '').toLowerCase() === g)
        .sort((a, b) => Number(b.points) - Number(a.points))
        .slice(0, 3)
        .map((r) => ({ name: `${r.first_name} ${r.last_name}`, detail: `${r.points} PTS` }));

      const men   = byGender('male');
      const women = byGender('female');
      if (!men.length && !women.length) {
        document.getElementById('nl-pick-body').innerHTML =
          emptyMsg('That ladder has no standings yet. Nothing was added.');
        return;
      }

      const arr = get('spotlight', []);
      arr.push({
        ladder: l.name,
        // The period is filled from the ladder's own dates; edit it if the
        // newsletter should word it differently.
        period: [l.start_date && fmtDate(l.start_date), l.end_date && fmtDate(l.end_date)]
                  .filter(Boolean).join(' – '),
        top_men: men,
        top_women: women,
      });
      set('spotlight', arr);
      window.nlClosePick();
      renderSections();
      toast(`Added ${l.name} — ${men.length} men, ${women.length} women.`);
    } catch (err) {
      document.getElementById('nl-pick-body').innerHTML =
        emptyMsg(`Could not load standings: ${err.message}`);
    }
  };

  /* ── TOURNAMENTS ─────────────────────────────────────────── */

  window.nlPickTournament = async () => {
    openPick('Add From Tournament', 'Loading...', emptyMsg('Loading tournaments...'), false);
    let ts = [];
    try {
      ts = await api('tournaments?status=eq.completed&select=*&order=id.desc');
    } catch (err) {
      openPick('Add From Tournament', '', emptyMsg(`Could not load tournaments: ${err.message}`), false);
      return;
    }
    if (!ts.length) {
      openPick('Add From Tournament', '', emptyMsg('No completed tournaments yet.'), false);
      return;
    }
    _pickState = { mode: 'tournament', items: ts };

    openPick('Add From Tournament', 'Pick one — every division and all three placements load automatically.',
      ts.map((t, i) => pickRow(`
        <div style="flex:1;min-width:0;">
          <div style="${FONT}font-size:13px;font-weight:700;color:var(--text);">${esc(t.name)}</div>
          <div style="${FONT}font-size:11px;font-weight:600;color:var(--text-muted);margin-top:1px;">${t.date ? fmtDate(t.date) : ''}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
        `data-action="nlTournamentChoose" data-i="${i}"`)).join(''),
      false);
  };

  /* Same ordering the public results page uses: wins, then point
     difference, then points for, then fewest losses. Teams that forfeited
     drop to the bottom. Reimplemented here rather than imported because
     tournament.js keeps it inside a page-scoped closure — the ordering is
     copied exactly so both agree. */
  const calcPodium = (teams, matches) => {
    const st = {};
    teams.forEach((t) => { st[t.id] = { team: t, w: 0, l: 0, pf: 0, pa: 0, ff: false }; });
    matches.filter((m) => m.status === 'completed').forEach((m) => {
      const a = st[m.team_a_id], b = st[m.team_b_id];
      if (!a || !b) return;
      a.pf += m.score_a || 0; a.pa += m.score_b || 0;
      b.pf += m.score_b || 0; b.pa += m.score_a || 0;
      if (m.winner_id === m.team_a_id) { a.w++; b.l++; }
      else if (m.winner_id === m.team_b_id) { b.w++; a.l++; }
      if (m.forfeit_team_id && st[m.forfeit_team_id]) st[m.forfeit_team_id].ff = true;
    });
    return Object.values(st).sort((x, y) =>
      (x.ff - y.ff) || (y.w - x.w) || ((y.pf - y.pa) - (x.pf - x.pa)) || (y.pf - x.pf) || (x.l - y.l));
  };

  window.nlTournamentChoose = async (i) => {
    const t = _pickState?.items?.[i];
    if (!t) return;
    document.getElementById('nl-pick-body').innerHTML = emptyMsg('Loading results...');
    try {
      // tournament_teams has no tournament_id: it hangs off the category.
      // So the categories come first, then their teams and matches.
      const cats = await api(`tournament_categories?tournament_id=eq.${t.id}&select=*&order=id`);
      if (!cats?.length) {
        document.getElementById('nl-pick-body').innerHTML =
          emptyMsg('That tournament has no categories. Nothing was added.');
        return;
      }
      const catIds = cats.map((c) => c.id).join(',');
      const [teams, matches] = await Promise.all([
        api(`tournament_teams?category_id=in.(${catIds})&select=id,category_id,name`),
        api(`tournament_rr_matches?category_id=in.(${catIds})`
          + `&select=category_id,status,team_a_id,team_b_id,score_a,score_b,winner_id,forfeit_team_id`),
      ]);

      const added = [];
      (cats || []).forEach((c) => {
        const ct = (teams || []).filter((x) => x.category_id === c.id);
        const cm = (matches || []).filter((m) => m.category_id === c.id);
        if (!ct.length) return;
        const podium = calcPodium(ct, cm).slice(0, 3).map((r) => r.team.name);
        // A division with no completed matches produces no real podium.
        if (!podium.length) return;
        // tournament_categories has no skill/level column — the level is
        // usually part of the name ("Mixed Doubles 55+ Up to 4.0"). Left
        // empty for the admin to split out if they want it on its own line.
        added.push({ division: c.name, level: '', podium });
      });

      if (!added.length) {
        document.getElementById('nl-pick-body').innerHTML =
          emptyMsg('That tournament has no completed results. Nothing was added.');
        return;
      }

      set('champions', (get('champions', [])).concat(added));
      if (!get('champions_sub')) {
        set('champions_sub', `${t.name}${t.date ? ` · ${fmtDate(t.date)}` : ''}`);
      }
      window.nlClosePick();
      renderSections();
      toast(`Added ${added.length} division${added.length !== 1 ? 's' : ''} from ${t.name}.`);
    } catch (err) {
      document.getElementById('nl-pick-body').innerHTML =
        emptyMsg(`Could not load results: ${err.message}`);
    }
  };

  /* ── CONFIRM (events only) ───────────────────────────────── */

  window.nlPickConfirm = () => {
    if (_pickState?.mode !== 'events') return;
    const chosen = Array.from(document.querySelectorAll('.nl-pick-cb:checked'))
      .map((cb) => _pickState.items[parseInt(cb.dataset.i, 10)])
      .filter(Boolean);
    if (!chosen.length) { toast('Nothing selected.', true); return; }

    const fmtT = (x) => x ? window.fmtTime12(x) : '';
    const arr = get('upcoming', []);
    chosen.forEach((e) => arr.push({
      title: e.title,
      // "Starts" comes in as part of the text so it can be taken out for a
      // tournament, where the proposal shows the date on its own.
      date: 'Starts ' + fmtDateLong(e.event_date),
      time: [fmtT(e.event_time), fmtT(e.end_time)].filter(Boolean).join(' – '),
      location: '',
      // The description is no longer imported: the card shows name, date
      // and time, as the visual proposal does, so carrying the text across
      // only left dead weight in the saved JSON.
      image_url: '',
      url: e.registration_url || '',
      // An event with no registration link gets the label the spec asks
      // for rather than a button that goes nowhere.
      cta_label: e.registration_url ? 'Register Now' : 'Registration coming soon',
    }));
    set('upcoming', arr);
    window.nlClosePick();
    renderSections();
    toast(`Added ${chosen.length} event${chosen.length !== 1 ? 's' : ''}.`);
  };

  /* ─── LIST VIEW ──────────────────────────────────────────── */

  const statusPill = (s) => s === 'sent'
    ? '<span style="font-size:10px;font-weight:800;color:#1D9E68;background:#EEF9F2;padding:3px 10px;border-radius:99px;text-transform:uppercase;">Sent</span>'
    : '<span style="font-size:10px;font-weight:800;color:#9a6200;background:#FFF4E6;padding:3px 10px;border-radius:99px;text-transform:uppercase;">Draft</span>';

  const renderList = () => {
    const el = document.getElementById('nl-list');
    if (!_issues.length) {
      el.innerHTML = '<div class="empty" style="padding:28px;">No editions yet. Create the first one.</div>';
      return;
    }
    el.innerHTML = _issues.map((n) => `
      <div style="display:flex;align-items:center;gap:14px;padding:15px 20px;border-bottom:0.5px solid #f4f5f8;cursor:pointer;"
           data-action="nlOpen" data-id="${n.id}">
        <div style="flex:1;min-width:0;">
          <div style="font-family:'Inter',sans-serif;font-size:15px;font-weight:700;color:var(--text);">${esc(n.title)}</div>
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-top:2px;">
            ${n.status === 'sent'
              ? `Sent ${fmtDate(String(n.sent_at).slice(0, 10))} · ${n.sent_count} recipient${n.sent_count !== 1 ? 's' : ''}${n.failed_count ? ` · ${n.failed_count} failed` : ''}`
              : `Last edited ${fmtDate(String(n.updated_at).slice(0, 10))}`}
          </div>
        </div>
        ${statusPill(n.status)}
        ${n.status === 'draft' ? `
        <button type="button" data-action="nlDelete" data-id="${n.id}" title="Delete this draft"
          style="background:none;border:none;padding:4px 6px;cursor:pointer;color:var(--text-light);"
          onmouseover="this.style.color='#e53935'" onmouseout="this.style.color='var(--text-light)'">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>` : ''}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`).join('');
  };

  const loadNewsletterPage = async () => {
    document.getElementById('nl-list-view').style.display = 'block';
    document.getElementById('nl-edit-view').style.display = 'none';
    try {
      _issues = await api('newsletters?select=*&order=issue_date.desc');
    } catch (err) {
      document.getElementById('nl-list').innerHTML =
        `<div class="empty" style="padding:24px;">Error: ${esc(err.message)}</div>`;
      return;
    }
    renderList();
  };
  window.loadNewsletterPage = loadNewsletterPage;

  /* ─── CREATE / OPEN ──────────────────────────────────────── */

  window.nlNew = async () => {
    const now = new Date();
    // Next month: a newsletter is normally written ahead of the month it
    // covers, not during it.
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const title = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const iso   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

    /* Warn before creating a second edition for the same month.

       "New Edition" always makes a new one, which is right — a special
       edition is legitimate. But pressing it twice by habit produced a
       duplicate October with no hint that the first one existed. This
       names what is already there and offers to open it instead. */
    const existing = _issues.filter((n) => String(n.issue_date).slice(0, 7) === iso.slice(0, 7));
    if (existing.length) {
      const drafts = existing.filter((n) => n.status === 'draft');
      const sent   = existing.filter((n) => n.status === 'sent');

      const what = drafts.length && sent.length
        ? `a draft and a sent edition`
        : drafts.length
          ? `${drafts.length} draft${drafts.length !== 1 ? 's' : ''}`
          : `a sent edition`;

      const ok = await confirmModal({
        title: `${title} already exists`,
        message: `There ${existing.length === 1 ? 'is' : 'are'} already ${what} for ${title}. `
          + `Creating another means keeping two editions for the same month. `
          + (drafts.length
              ? `If you meant to keep working on the existing draft, open it instead.`
              : `A second edition for a month that was already sent is unusual — check this is what you want.`),
        okLabel: 'Create another anyway',
        cancelLabel: drafts.length ? 'Open the existing one' : 'Cancel',
      });

      if (!ok) {
        // Cancelling on a month that has a draft opens it, which is what
        // the person almost always meant.
        if (drafts.length) openIssue(drafts[0].id, drafts[0]);
        return;
      }
    }

    try {
      await api('newsletters', 'POST', {
        title,
        issue_date: iso,
        status: 'draft',
        content: {},
      });
      // db.js's POST does not return the inserted row, so the new edition is
      // fetched back rather than assumed.
      _issues = await api('newsletters?select=*&order=id.desc&limit=1');
      if (_issues[0]) openIssue(_issues[0].id, _issues[0]);
      toast(`Draft created for ${title}.`);
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  const openIssue = (id, preloaded) => {
    const n = preloaded || _issues.find((x) => String(x.id) === String(id));
    if (!n) { toast('Edition not found.', true); return; }
    _current = { ...n, content: n.content || {} };
    setDirty(false);

    document.getElementById('nl-list-view').style.display = 'none';
    document.getElementById('nl-edit-view').style.display = 'block';
    // "October 2026 — Draft" on one line, with the status in a lighter
    // weight so the month still leads.
    document.getElementById('nl-edit-title').innerHTML =
      `${esc(n.title)} <span style="font-size:15px;font-weight:600;color:var(--text-muted);letter-spacing:0;">— ${n.status === 'sent' ? 'Sent' : 'Draft'}</span>`;

    // A sent issue is what subscribers already received. Editing it would
    // make the archive disagree with their inbox.
    const banner = document.getElementById('nl-sent-banner');
    const sent = n.status === 'sent';
    banner.style.display = sent ? 'block' : 'none';
    if (sent) {
      banner.textContent = `This edition was sent on ${fmtDate(String(n.sent_at).slice(0, 10))} to `
        + `${n.sent_count} subscriber${n.sent_count !== 1 ? 's' : ''}. It is kept exactly as it went out, so it cannot be edited.`;
    }
    ['nl-save-btn', 'nl-test-btn', 'nl-send-btn'].forEach((bid) => {
      const b = document.getElementById(bid);
      if (b) { b.disabled = sent; b.style.opacity = sent ? '0.4' : '1'; b.style.cursor = sent ? 'not-allowed' : 'pointer'; }
    });

    // The address lives in the tooltip now: shown under the button it made
    // that one taller than the other three.
    const tb = document.getElementById('nl-test-btn');
    if (tb) tb.title = `Sends one copy to ${CFG.ADMIN_EMAIL}. Subscribers receive nothing.`;

    renderSections();
  };
  window.nlOpen = openIssue;

  /* Deleting a draft.

     Creating a second October by mistake was easy and had no way back —
     "New Edition" always makes a new one, and nothing could be removed.
     Only DRAFTS can be deleted: a sent edition is the record of what 450
     people received, and that has to stay. */
  window.nlDelete = async (id) => {
    const n = _issues.find((x) => String(x.id) === String(id));
    if (!n) return;
    if (n.status === 'sent') {
      toast('Sent editions cannot be deleted — they are the record of what was sent.', true);
      return;
    }
    const ok = await confirmModal({
      title: `Delete the ${n.title} draft?`,
      message: 'This draft and everything written in it will be removed. Nothing was sent to subscribers, so nobody is affected — but the text cannot be recovered.',
      okLabel: 'Delete draft', cancelLabel: 'Keep it',
    });
    if (!ok) return;
    try {
      await api(`newsletters?id=eq.${id}`, 'DELETE');
      toast('Draft deleted.');
      await loadNewsletterPage();
    } catch (err) {
      toast(`Could not delete: ${err.message}`, true);
    }
  };

  window.nlBackToList = async () => {
    if (_dirty) {
      const ok = await confirmModal({
        title: 'Leave without saving?',
        message: 'This edition has unsaved changes. Leaving now discards them.',
        okLabel: 'Discard changes', cancelLabel: 'Stay',
      });
      if (!ok) return;
    }
    _current = null;
    loadNewsletterPage();
  };

  /* ─── SAVE ───────────────────────────────────────────────── */

  window.nlSave = async () => {
    if (!_current || isSent()) return;
    const btn = document.getElementById('nl-save-btn');
    btn.disabled = true; btn.textContent = 'Saving...';
    try {
      await api(`newsletters?id=eq.${_current.id}`, 'PATCH', {
        content: _current.content,
        updated_at: new Date().toISOString(),
      });
      setDirty(false);
      toast('Draft saved.');
    } catch (err) {
      toast(`Error saving: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      if (!_dirty) btn.textContent = 'Save Draft';
    }
  };

  /* ─── PREVIEW ────────────────────────────────────────────── */

  const previewHTML = async () => {
    // Rendered by the same function that sends, so what is previewed is
    // what goes out — not a separate mock that could drift.
    const { data, error } = await window.supabase.functions.invoke('send-newsletter', {
      body: { newsletter_id: _current.id, preview: true },
    });
    if (error) throw new Error(error.message);
    return data?.html || '';
  };

  window.nlPreview = async () => {
    if (!_current) return;
    if (_dirty) { await window.nlSave(); }
    const frame = document.getElementById('nl-preview-frame');
    frame.srcdoc = '<p style="font-family:sans-serif;padding:20px;color:#6b7a99;">Loading preview...</p>';
    document.getElementById('nl-preview-modal').classList.add('open');
    try {
      frame.srcdoc = await previewHTML();
      /* Grow the frame to its content so the email never scrolls inside
         its own box — only the modal scrolls. Two nested scrollbars made
         it unclear which one to use. srcdoc is same-origin, so the height
         can be measured directly. */
      frame.onload = () => {
        try {
          const d = frame.contentDocument;
          frame.style.height = (d.body.scrollHeight + 20) + 'px';
        } catch (_) { frame.style.height = '1400px'; }
      };
    } catch (err) {
      frame.srcdoc = `<p style="font-family:sans-serif;padding:20px;color:#e53935;">Preview failed: ${esc(err.message)}</p>`;
    }
  };

  window.nlClosePreview = () =>
    document.getElementById('nl-preview-modal').classList.remove('open');

  const setPreviewWidth = (mobile) => {
    const f = document.getElementById('nl-preview-frame');
    f.style.maxWidth = mobile ? '380px' : '700px';
    const on  = 'padding:7px 14px;border:1px solid var(--blue);border-radius:99px;background:var(--blue);color:white;';
    const off = 'padding:7px 14px;border:1px solid var(--divider-color);border-radius:99px;background:white;color:var(--text-muted);';
    const tail = "font-family:'Inter',sans-serif;font-size:11px;font-weight:700;cursor:pointer;";
    document.getElementById('nl-pv-mobile').style.cssText  = (mobile ? on : off) + tail;
    document.getElementById('nl-pv-desktop').style.cssText = (mobile ? off : on) + tail;
    // The narrower width reflows the content taller, so re-measure once
    // the transition has finished.
    setTimeout(() => {
      try { f.style.height = (f.contentDocument.body.scrollHeight + 20) + 'px'; } catch (_) {}
    }, 250);
  };
  window.nlPreviewMobile  = () => setPreviewWidth(true);
  window.nlPreviewDesktop = () => setPreviewWidth(false);

  /* ─── TEST ───────────────────────────────────────────────── */

  window.nlTest = async () => {
    if (!_current || isSent()) return;
    if (_dirty) { await window.nlSave(); }
    const btn = document.getElementById('nl-test-btn');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const { data, error } = await window.supabase.functions.invoke('send-newsletter', {
        body: { newsletter_id: _current.id, test_email: CFG.ADMIN_EMAIL },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast(`Test sent to ${CFG.ADMIN_EMAIL}.`);
    } catch (err) {
      toast(`Test failed: ${err.message}`, true);
    } finally {
      btn.disabled = false; btn.textContent = 'Send Test to Me';
    }
  };

  /* ─── SEND ───────────────────────────────────────────────── */

  window.nlSend = async () => {
    if (!_current || isSent()) return;
    if (_dirty) { await window.nlSave(); }

    // How many people this actually reaches, counted now rather than
    // quoted from a stale number.
    let count = 0;
    try {
      const subs = await api('subscribers?status=eq.active&select=id');
      count = (subs || []).length;
    } catch (_) { /* the confirmation still works without it */ }

    // Already sent an issue this month? A warning, not a block: a special
    // edition is legitimate, a duplicate by accident is not.
    let dupWarning = '';
    try {
      const { data: prior } = await window.supabase.rpc('newsletter_sent_this_month',
        { p_issue_date: _current.issue_date });
      if (prior?.length) {
        dupWarning = `A newsletter for this month was already sent on `
          + `${fmtDate(String(prior[0].sent_at).slice(0, 10))} to ${prior[0].sent_count} subscribers. `
          + `Sending this one means subscribers receive a second edition for the same month. `;
      }
    } catch (_) { /* non-fatal */ }

    const ok = await confirmModal({
      title: `Send ${_current.title}?`,
      message: `${dupWarning}This will be sent to ${count} active subscriber${count !== 1 ? 's' : ''}. `
        + `Please confirm you have reviewed the content and every link. `
        + `Once sent, the edition is locked as a historical record and cannot be edited.`,
      okLabel: 'Confirm & send', cancelLabel: 'Cancel',
    });
    if (!ok) return;

    const btn = document.getElementById('nl-send-btn');
    btn.disabled = true; btn.textContent = 'Sending...';
    window.AdminState.emailInFlight = true;

    try {
      const { data, error } = await window.supabase.functions.invoke('send-newsletter', {
        body: { newsletter_id: _current.id },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const msg = `Sent to ${data.sent} subscriber${data.sent !== 1 ? 's' : ''}`
        + (data.failed ? `, ${data.failed} failed` : '')
        + (data.skipped ? `, ${data.skipped} already had it` : '') + '.';
      toast(msg);
      await loadNewsletterPage();
    } catch (err) {
      toast(`Send failed: ${err.message}`, true);
      btn.disabled = false; btn.textContent = 'Send Newsletter';
    } finally {
      window.AdminState.emailInFlight = false;
    }
  };

  /* ─── HANDLERS ───────────────────────────────────────────── */

  Object.assign(window.CLICK_HANDLERS, {
    nlNew:             () => window.nlNew(),
    nlOpen:            (btn) => openIssue(btn.dataset.id),
    nlBackToList:      () => window.nlBackToList(),
    nlSave:            () => window.nlSave(),
    nlPreview:         () => window.nlPreview(),
    nlClosePreview:    () => window.nlClosePreview(),
    nlPreviewMobile:   () => window.nlPreviewMobile(),
    nlPreviewDesktop:  () => window.nlPreviewDesktop(),
    nlTest:            () => window.nlTest(),
    nlSend:            () => window.nlSend(),
    nlRemove:          (btn) => listRemove(btn.dataset.path, parseInt(btn.dataset.idx, 10)),
    nlImgClear:        (btn) => window.nlImgClear(btn.dataset.path),
    nlDelete:          (btn) => window.nlDelete(btn.dataset.id),
    nlPickEvents:      () => window.nlPickEvents(),
    nlPickLadder:      () => window.nlPickLadder(),
    nlPickTournament:  () => window.nlPickTournament(),
    nlClosePick:       () => window.nlClosePick(),
    nlPickConfirm:     () => window.nlPickConfirm(),
    nlLadderChoose:    (btn) => window.nlLadderChoose(parseInt(btn.dataset.i, 10)),
    nlTournamentChoose:(btn) => window.nlTournamentChoose(parseInt(btn.dataset.i, 10)),
    nlAddUpcoming:     () => listAdd('upcoming',  { title: '', date: '', time: '', url: '', cta_label: 'Register Now' }),
    nlAddSpotlight:    () => listAdd('spotlight', { ladder: '', period: '', top_men: [], top_women: [] }),
    nlAddChampion:     () => listAdd('champions', { division: '', level: '', podium: ['', '', ''] }),
    nlAddMetric:       () => listAdd('numbers.items', { value: '', label: '' }),
    nlAddPlayer:       (btn) => listAdd(btn.dataset.path, { name: '', detail: '' }),
  });
})();
