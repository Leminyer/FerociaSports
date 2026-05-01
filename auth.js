/* ============================================================
   FEROCIA SPORTS CENTER — AUTH MODULE
   Depends on: config.js, db.js (which loads supabase-js)
   Provides on window.auth:
     - getSession()            Returns the current session or null
     - waitForAuth()           Promise that resolves when we know if user is signed in
     - showLoginModal()        Display the email+password modal
     - hideLoginModal()        Hide it
     - signOut()               Sign out and reload
     - onAuthStateChange(fn)   Subscribe to login/logout events
     - requireAuth(onAuthed)   Show login modal if not authed; call cb when authed
   ============================================================ */

(function () {
  'use strict';

  if (!window.supabase || !window.supabase.auth || typeof window.supabase.auth.signInWithPassword !== 'function') {
    console.error('[Ferocia auth] db.js (supabase client) must load and initialize before auth.js');
    return;
  }

  const sb = window.supabase;

  // ─── DOM: LOGIN MODAL ──────────────────────────────────────
  // Built once on first showLoginModal() call. Self-contained so we
  // don't have to add HTML to every page that imports auth.js.

  function ensureLoginModal() {
    let modal = document.getElementById('auth-login-modal');
    if (modal) return modal;

    const style = document.createElement('style');
    style.textContent = `
      #auth-login-modal {
        position: fixed; inset: 0; z-index: 10000;
        background: var(--blue, #174CCC);
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        font-family: 'Montserrat', sans-serif;
      }
      #auth-login-modal[hidden] { display: none !important; }
      #auth-login-modal .auth-card {
        background: white; border-radius: 16px; padding: 36px 32px;
        width: 100%; max-width: 380px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      #auth-login-modal h2 {
        font-size: 18px; font-weight: 800; color: #0d1f4a;
        margin: 0 0 4px 0; text-align: center;
      }
      #auth-login-modal .auth-sub {
        font-size: 11px; font-weight: 800; letter-spacing: 2px;
        text-transform: uppercase; color: #6b7a99;
        text-align: center; margin-bottom: 24px;
      }
      #auth-login-modal label {
        display: block; font-size: 10px; font-weight: 800;
        letter-spacing: 0.8px; text-transform: uppercase;
        color: #6b7a99; margin-bottom: 5px;
      }
      #auth-login-modal input {
        width: 100%; padding: 11px 14px; border: 1px solid #d6dff5;
        border-radius: 8px; font-size: 14px;
        font-family: 'Montserrat', sans-serif; outline: none;
        margin-bottom: 14px; box-sizing: border-box;
      }
      #auth-login-modal input:focus {
        border-color: #174CCC;
        box-shadow: 0 0 0 2px rgba(23,76,204,0.15);
      }
      #auth-login-modal .auth-error {
        display: none; font-size: 12px; color: #F26024;
        font-weight: 700; margin-bottom: 12px; text-align: center;
        padding: 10px; background: #fde8d8; border-radius: 6px;
      }
      #auth-login-modal button {
        width: 100%; padding: 12px;
        background: #174CCC; color: white; border: none;
        border-radius: 8px; font-size: 13px; font-weight: 800;
        letter-spacing: 1px; text-transform: uppercase;
        cursor: pointer; font-family: 'Montserrat', sans-serif;
        transition: opacity .15s;
      }
      #auth-login-modal button:hover { opacity: .88; }
      #auth-login-modal button:disabled { opacity: .5; cursor: not-allowed; }
    `;
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.id = 'auth-login-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="auth-card">
        <h2>Ferocia Sports Center</h2>
        <div class="auth-sub">Admin Sign In</div>
        <form id="auth-login-form" novalidate>
          <label for="auth-email">Email</label>
          <input type="email" id="auth-email" autocomplete="username" required>
          <label for="auth-password">Password</label>
          <input type="password" id="auth-password" autocomplete="current-password" required>
          <div class="auth-error" id="auth-error"></div>
          <button type="submit" id="auth-submit-btn">Sign in</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#auth-login-form').addEventListener('submit', handleLogin);
    return modal;
  }

  function showLoginModal() {
    const modal = ensureLoginModal();
    modal.hidden = false;
    setTimeout(() => {
      const emailInput = modal.querySelector('#auth-email');
      if (emailInput && !emailInput.value) emailInput.focus();
    }, 50);
  }

  function hideLoginModal() {
    const modal = document.getElementById('auth-login-modal');
    if (modal) modal.hidden = true;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    const errEl = document.getElementById('auth-error');
    const btn = document.getElementById('auth-submit-btn');

    const email = emailEl.value.trim();
    const password = passEl.value;

    errEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // onAuthStateChange in app.js will hide the modal and boot the app
    } catch (err) {
      const msg = (err && err.message) || 'Sign in failed.';
      // Friendlier error for the most common failure
      errEl.textContent =
        /invalid login credentials/i.test(msg)
          ? 'Incorrect email or password.'
          : msg;
      errEl.style.display = 'block';
      passEl.value = '';
      passEl.focus();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }

  // ─── SESSION HELPERS ───────────────────────────────────────

  async function getSession() {
    const { data, error } = await sb.auth.getSession();
    if (error) {
      console.error('[Ferocia auth] getSession error:', error);
      return null;
    }
    return data.session;
  }

  // Wait until we know whether a session exists. Resolves with session-or-null.
  // Use this on page boot before deciding to show login or app.
  let _readyPromise = null;
  function waitForAuth() {
    if (_readyPromise) return _readyPromise;
    _readyPromise = (async () => {
      // getSession() reads from localStorage synchronously via the lib —
      // returns the persisted session if any. No network call here.
      return await getSession();
    })();
    return _readyPromise;
  }

  // Subscribe to login/logout events. Returns an unsubscribe function.
  function onAuthStateChange(fn) {
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      fn(session, _event);
    });
    return () => data?.subscription?.unsubscribe?.();
  }

  async function signOut() {
    try {
      await sb.auth.signOut();
    } catch (err) {
      console.error('[Ferocia auth] signOut error:', err);
    }
    // Force reload so all in-memory state is cleared.
    window.location.reload();
  }

  // High-level helper used by app.js / tournament.js.
  // Calls onAuthed() when a session is available; otherwise shows the
  // login modal and waits. Once login succeeds, fires onAuthed().
  async function requireAuth(onAuthed) {
    const session = await waitForAuth();
    if (session) {
      onAuthed(session);
    } else {
      showLoginModal();
    }

    // Subscribe to future auth events — but only fire onAuthed for a genuine
    // new sign-in, NOT for token refresh events (TOKEN_REFRESHED) which
    // Supabase fires when the user returns to the tab after a period away.
    // Firing onAuthed on every token refresh resets app state (e.g. the
    // ladder dropdown) which is the bug we are fixing here.
    let booted = !!session; // already booted if we had a session above
    onAuthStateChange((newSession, event) => {
      if (event === 'SIGNED_IN' && newSession && !booted) {
        booted = true;
        hideLoginModal();
        onAuthed(newSession);
      } else if (event === 'SIGNED_OUT') {
        window.location.reload();
      }
    });
  }

  // ─── EXPORT ────────────────────────────────────────────────

  window.auth = {
    getSession,
    waitForAuth,
    showLoginModal,
    hideLoginModal,
    signOut,
    onAuthStateChange,
    requireAuth,
  };
})();
