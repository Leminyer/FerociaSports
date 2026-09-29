/* ============================================================
   FEROCIA SPORTS CENTER — APP CONFIG
   Single source of truth for API keys and service IDs.
   Load this BEFORE db.js / app.js / tournament.js / page scripts.

   IMPORTANT — about SUPABASE_KEY:
   This is the publishable (anon) key. It is safe to expose in the
   browser PROVIDED:
     1. Row Level Security is enabled on every table (see SUPABASE_SETUP.sql)
     2. RLS policies enforce admin-only writes
     3. The admin user authenticates via Supabase Auth (auth.js)
   When an authenticated user calls the API via supabase-js, the library
   attaches their session token, which RLS policies use to grant write
   access. Without a session token, the API only allows what anon-role
   policies permit (public reads, subscribe form, etc.).
   ============================================================ */

window.FEROCIA_CONFIG = Object.freeze({
  SUPABASE_URL: 'https://yyocceadorckkfbgnbqk.supabase.co',
  SUPABASE_KEY: 'sb_publishable_Lhc3oHL90kL7O0vO3kJQgQ_BqQfc4Il',

  // Stripe publishable key — LIVE MODE
  STRIPE_PK: 'pk_live_51TTCbRCTELHGVTTYSr6STPghRhsrPA7x5tUWB5ThLELUBgme5eDgbw7GEBG1UzGC0eRCzBQyiK7g228HFjqxWQEE00XrVTFSXB',

  // Shipping config
  SHIPPING: Object.freeze({
    FLAT_RATE_CENTS: 999,          // $9.99 flat rate
    FREE_THRESHOLD_CENTS: 7500,    // $75.00 free shipping threshold
  }),

  // Admin email — receives a copy of ladder notify, tournament notify, and promo emails
  // so the admin can verify the email looks correct and confirm delivery.
  // Not added to subscription confirmation emails.
  ADMIN_EMAIL: 'contact@ferociasports.com',
});
