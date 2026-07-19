/* ============================================================
   FEROCIA SPORTS CENTER — ADMIN: ORDERS
   Depends on: config.js, db.js, admin-state.js
   Load order: admin-state.js -> admin-orders.js -> app.js

   Extracted from app.js's ORDERS section (Phase 1 of the app.js
   modularization). Self-contained — uses only the global helpers
   already provided by db.js (api, esc, fmtDate, toast); no reference
   to AdminState, since the Orders page never touched ladder state.
   ============================================================ */

(function () {
  'use strict';

  const loadOrdersPage = async () => {
    const el     = document.getElementById('orders-list');
    const countEl= document.getElementById('orders-count');
    if (!el) return;
    el.innerHTML = '<div class="loading">Loading orders...</div>';

    try {
      const statusFilter = document.getElementById('orders-status-filter')?.value;
      let endpoint = 'orders?select=*&order=created_at.desc';
      if (statusFilter) endpoint += `&status=eq.${statusFilter}`;

      const orders = await api(endpoint);
      if (countEl) countEl.textContent = orders.length;

      if (!orders.length) {
        el.innerHTML = '<div class="empty">No orders yet.</div>';
        return;
      }

      el.innerHTML = orders.map((o) => {
        const date    = fmtDate(o.created_at.split('T')[0], { month:'short', day:'numeric', year:'numeric' });
        const total   = '$' + ((o.amount_total || 0) / 100).toFixed(2);
        const ship    = o.shipping_address
          ? `${o.shipping_address.city || ''}, ${o.shipping_address.state || ''}`
          : 'Pickup';
        const items   = Array.isArray(o.line_items)
          ? o.line_items.map(i => `${i.name} ×${i.quantity}`).join(', ')
          : '—';
        const statusColor = o.status === 'fulfilled'
          ? 'var(--teal)' : o.status === 'paid'
          ? 'var(--blue)' : 'var(--orange)';

        return `<div class="list-row">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">
            <div style="flex:1;min-width:0;">
              <div class="text-bold text-14">${esc(o.customer_name || 'Unknown')}</div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${esc(o.customer_email)}</div>
              <div style="font-size:12px;font-weight:500;color:var(--text-muted);margin-top:4px;">${esc(items)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">📍 ${esc(ship)} · 📅 ${date}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0;">
              <div style="font-size:16px;font-weight:800;color:var(--blue);">${total}</div>
              <span style="font-size:11px;font-weight:800;color:${statusColor};text-transform:uppercase;letter-spacing:.5px;">${o.status}</span>
              ${o.status === 'paid' ? `<button class="btn btn-outline btn-sm" data-action="markFulfilled" data-orderid="${o.id}">Mark Fulfilled</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
    } catch (err) {
      el.innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`;
    }
  };

  const markFulfilled = async (btn) => {
    const id = parseInt(btn.dataset.orderid, 10);
    try {
      await api(`orders?id=eq.${id}`, 'PATCH', { status: 'fulfilled' });
      toast('Order marked as fulfilled.');
      await loadOrdersPage();
    } catch (err) {
      toast(`Error: ${err.message}`, true);
    }
  };

  // ── Register with the shared infrastructure (admin-state.js) ─────────
  window.AdminPageLoaders.orders = loadOrdersPage;
  Object.assign(window.CLICK_HANDLERS, {
    markFulfilled: (btn) => markFulfilled(btn),
  });
})();
