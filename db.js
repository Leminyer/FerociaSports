/* ============================================================
   FEROCIA SPORTS CENTER — SHARED UTILITIES
   Depends on: config.js, @supabase/supabase-js (CDN, loaded via <script>)
   Provides on window:
     - supabase                 The supabase-js client instance
     - api(path, method, body)  Compat wrapper preserving the old signature
     - escapeHtml(str), esc     Safe interpolation
     - fmtDate(dateStr, opts)   Date formatter (avoids TZ shift)
     - sleep(ms)                Promise-based delay
     - todayISO()               Today as YYYY-MM-DD
     - toast(msg, isError)      Top-of-screen banner
     - confirmModal({...})      Promise-based confirmation dialog
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.FEROCIA_CONFIG;
  if (!CFG) {
    console.error('[Ferocia] config.js must load before db.js');
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('[Ferocia] @supabase/supabase-js must load before db.js');
    return;
  }

  // ─── SUPABASE CLIENT ──────────────────────────────────────
  // Single shared client. Persists session in localStorage by default.
  // The library auto-refreshes the access token a minute before it expires
  // so the user stays logged in indefinitely (until they sign out or
  // their refresh token is revoked).
  const sbClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // we don't use OAuth/magic-link redirects
    },
  });

  // Replace the namespace with our client instance so window.supabase IS the
  // client (matches the convention used in supabase-js docs).
  // Anything that needs createClient() can still use window.supabase.createClient
  // by referencing the constructor on the prototype, but we don't need that.
  window.supabase = sbClient;

  // ─── api() COMPAT WRAPPER ─────────────────────────────────
  // Preserves the old fetch-based api() signature so app.js / tournament.js
  // don't need to be rewritten. Parses the PostgREST URL fragment and
  // dispatches to the supabase-js client which handles auth tokens correctly.
  //
  // Calls like:
  //   api('players?select=*&order=first_name')
  //   api('matches?id=in.(1,2,3)', 'DELETE')
  //   api('ladders', 'POST', { name: 'X' })
  //   api('ladders?id=eq.5', 'PATCH', { status: 'closed' })
  //
  // Important compat details:
  // - GET returns array (or empty array) — same as before
  // - POST returns the inserted rows (representation) — same as before
  // - PATCH returns the updated rows or null — same as before
  // - DELETE returns null — same as before
  // - Throws Error on non-success, with .message — same as before

  async function api(path, method = 'GET', body = null) {
    method = method.toUpperCase();

    // Split "table?queryString" into table + URLSearchParams
    const qIdx = path.indexOf('?');
    const table = qIdx === -1 ? path : path.slice(0, qIdx);
    const query = qIdx === -1 ? '' : path.slice(qIdx + 1);
    const params = new URLSearchParams(query);

    // Pull out PostgREST filter / select / order / limit params
    const select = params.get('select') || '*';
    const order = params.get('order');
    const limit = params.get('limit');
    params.delete('select');
    params.delete('order');
    params.delete('limit');

    // Everything left is a filter: column=op.value (e.g. id=eq.5, id=in.(1,2,3))
    // Apply each filter to the query builder using the same operator names.
    const applyFilters = (qb) => {
      for (const [col, raw] of params.entries()) {
        const dotIdx = raw.indexOf('.');
        if (dotIdx === -1) {
          // No operator — treat as equality
          qb = qb.eq(col, raw);
          continue;
        }
        const op = raw.slice(0, dotIdx);
        const val = raw.slice(dotIdx + 1);
        switch (op) {
          case 'eq':  qb = qb.eq(col, val); break;
          case 'neq': qb = qb.neq(col, val); break;
          case 'gt':  qb = qb.gt(col, val); break;
          case 'gte': qb = qb.gte(col, val); break;
          case 'lt':  qb = qb.lt(col, val); break;
          case 'lte': qb = qb.lte(col, val); break;
          case 'like': qb = qb.like(col, val); break;
          case 'ilike': qb = qb.ilike(col, val); break;
          case 'is':  qb = qb.is(col, val === 'null' ? null : val); break;
          case 'in': {
            // val is "(1,2,3)" — strip parens and split
            const list = val.replace(/^\(/, '').replace(/\)$/, '').split(',');
            qb = qb.in(col, list);
            break;
          }
          default:
            // Fallback for unsupported ops — encode as raw filter
            qb = qb.filter(col, op, val);
        }
      }
      return qb;
    };

    // Apply order + limit to a select/update/delete builder
    const applyTrailing = (qb) => {
      if (order) {
        // PostgREST format: "col" or "col.desc" (or "col1,col2.desc")
        for (const part of order.split(',')) {
          const [col, dir] = part.split('.');
          qb = qb.order(col, { ascending: dir !== 'desc' });
        }
      }
      if (limit) qb = qb.limit(parseInt(limit, 10));
      return qb;
    };

    let qb, result;
    switch (method) {
      case 'GET': {
        qb = sbClient.from(table).select(select);
        qb = applyFilters(qb);
        qb = applyTrailing(qb);
        result = await qb;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
      }
      case 'POST': {
        // Insert one or many. We do NOT chain .select() here because some
        // tables (e.g. subscribers) have no SELECT RLS policy for anon —
        // requesting the inserted row back would cause a permission error.
        // Admin callers (tournament.js) that need the inserted row back use
        // a follow-up GET or rely on the id returned via the trigger.
        qb = sbClient.from(table).insert(body);
        result = await qb;
        if (result.error) throw new Error(result.error.message);
        return result.data || [];
      }
      case 'PATCH': {
        qb = sbClient.from(table).update(body);
        qb = applyFilters(qb);
        // Do NOT chain .select() — anon users may not have SELECT RLS policy
        // on the table being updated (e.g. subscribers). The update itself
        // is allowed by the UPDATE policy; requesting rows back is not.
        result = await qb;
        if (result.error) throw new Error(result.error.message);
        return result.data || null;
      }
      case 'DELETE': {
        qb = sbClient.from(table).delete();
        qb = applyFilters(qb);
        result = await qb;
        if (result.error) throw new Error(result.error.message);
        return null;
      }
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  // ─── ESCAPING ─────────────────────────────────────────────
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  const esc = escapeHtml;

  // ─── DATE FORMATTING ──────────────────────────────────────
  const DEFAULT_DATE_OPTS = { month: 'short', day: 'numeric', year: 'numeric' };
  function fmtDate(dateStr, opts = DEFAULT_DATE_OPTS) {
    if (!dateStr) return '';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', opts);
  }

  // ─── MISC ─────────────────────────────────────────────────
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function todayISO() { return new Date().toISOString().split('T')[0]; }

  // ─── TOAST ────────────────────────────────────────────────
  let _toastTimer = null;
  function toast(msg, isError = false) {
    const okEl = document.getElementById('success-banner');
    const errEl = document.getElementById('error-banner');
    if (!okEl && !errEl) {
      console[isError ? 'error' : 'log']('[toast]', msg);
      return;
    }
    const showEl = isError ? errEl : okEl;
    const hideEl = isError ? okEl : errEl;
    const msgEl = document.getElementById(isError ? 'error-banner-msg' : 'success-banner-msg');
    if (hideEl) hideEl.style.display = 'none';
    if (msgEl) msgEl.textContent = msg;
    if (showEl) showEl.style.display = 'block';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      if (showEl) showEl.style.display = 'none';
    }, 4000);
  }

  // ─── CONFIRM MODAL ────────────────────────────────────────
  function ensureConfirmModal() {
    let modal = document.getElementById('confirm-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal" style="max-width:440px;">
        <div class="modal-title" id="confirm-modal-title">Are you sure?</div>
        <div id="confirm-modal-msg" class="text-muted-13" style="margin-bottom:18px;line-height:1.55;"></div>
        <div class="modal-actions">
          <button type="button" class="btn btn-outline btn-sm" id="confirm-modal-cancel">Cancel</button>
          <button type="button" class="btn btn-primary btn-sm" id="confirm-modal-ok">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function confirmModal({ title = 'Are you sure?', message = '', okLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
    return new Promise((resolve) => {
      const modal = ensureConfirmModal();
      modal.querySelector('#confirm-modal-title').textContent = title;
      modal.querySelector('#confirm-modal-msg').textContent = message;
      const okBtn = modal.querySelector('#confirm-modal-ok');
      const cancelBtn = modal.querySelector('#confirm-modal-cancel');
      okBtn.textContent = okLabel;
      cancelBtn.textContent = cancelLabel;
      okBtn.className = `btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`;
      modal.classList.add('open');
      const cleanup = (result) => {
        modal.classList.remove('open');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };
      const onKey = (e) => {
        if (e.key === 'Escape') cleanup(false);
        if (e.key === 'Enter') cleanup(true);
      };
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
      setTimeout(() => okBtn.focus(), 50);
    });
  }

  // ─── EXPORT ───────────────────────────────────────────────
  Object.assign(window, {
    api,
    escapeHtml,
    esc,
    fmtDate,
    sleep,
    todayISO,
    toast,
    confirmModal,
  });
})();
