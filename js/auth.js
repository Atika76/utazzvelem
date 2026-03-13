window.AppAuth = (() => {
  let cachedAdminEmail = null;
  let cachedRole = null;
  const ADMIN_CACHE_KEY = 'fv_admin_email_cache_v1';
  const ADMIN_CACHE_TTL = 10 * 60 * 1000;

  function setNext(url) {
    try { sessionStorage.setItem('uv_next', url || 'index.html'); } catch(_) {}
  }

  function consumeNext(fallback='index.html') {
    try {
      const v = sessionStorage.getItem('uv_next');
      sessionStorage.removeItem('uv_next');
      return v || fallback;
    } catch(_) { return fallback; }
  }

  async function getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function getUser() {
    const { data } = await sb.auth.getUser();
    return data.user;
  }

  function readCachedAdminEmail() {
    if (cachedAdminEmail) return cachedAdminEmail;
    try {
      const raw = localStorage.getItem(ADMIN_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.email || !parsed?.ts) return null;
      if (Date.now() - Number(parsed.ts) > ADMIN_CACHE_TTL) return null;
      cachedAdminEmail = parsed.email;
      return cachedAdminEmail;
    } catch (_) {
      return null;
    }
  }

  function writeCachedAdminEmail(email) {
    cachedAdminEmail = email || APP_CONFIG.adminEmail;
    try {
      localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({ email: cachedAdminEmail, ts: Date.now() }));
    } catch (_) {}
    return cachedAdminEmail;
  }

  async function fetchAdminEmail(force=false) {
    if (!force) {
      const cached = readCachedAdminEmail();
      if (cached) return cached;
    }
    try {
      const { data } = await sb.from('beallitasok').select('id,admin_email').order('id', { ascending: true }).limit(1).maybeSingle();
      return writeCachedAdminEmail(data?.admin_email || APP_CONFIG.adminEmail);
    } catch (_) {
      return writeCachedAdminEmail(APP_CONFIG.adminEmail);
    }
  }

  function isAdminEmail(email, adminEmail) {
    return !!email && String(email).toLowerCase() === String(adminEmail || APP_CONFIG.adminEmail).toLowerCase();
  }

  async function isAdmin(email) {
    const target = email || (await getUser())?.email;
    const adminEmail = readCachedAdminEmail() || await fetchAdminEmail();
    return isAdminEmail(target, adminEmail);
  }

  async function resolveRole(user) {
    if (!user?.email) return { admin: false, adminEmail: readCachedAdminEmail() || APP_CONFIG.adminEmail };
    const adminEmail = readCachedAdminEmail() || await fetchAdminEmail();
    const admin = isAdminEmail(user.email, adminEmail);
    cachedRole = admin ? 'admin' : 'user';
    return { admin, adminEmail };
  }

  function getDisplayName(user) {
    const metaName = user?.user_metadata?.name || user?.user_metadata?.full_name;
    if (metaName && String(metaName).trim()) return String(metaName).trim();
    if (user?.email) return String(user.email).split('@')[0];
    return '';
  }

  function ensureToast() {
    let box = document.getElementById('authStatusMessage');
    if (!box) {
      box = document.createElement('div');
      box.id = 'authStatusMessage';
      box.className = 'auth-status hidden';
      document.body.appendChild(box);
    }
    return box;
  }

  function showToast(message) {
    const box = ensureToast();
    box.textContent = message;
    box.classList.remove('hidden');
    clearTimeout(window.__uvToastTimer);
    window.__uvToastTimer = setTimeout(() => {
      box.classList.add('hidden');
      box.textContent = '';
    }, 2200);
  }

  async function updateNav(sessionOverride = null) {
    const session = sessionOverride || await getSession();
    const user = session?.user || null;
    const { admin } = await resolveRole(user);

    document.querySelectorAll('[data-auth="guest"]').forEach(el => {
      el.classList.toggle('hidden', !!user);
    });
    document.querySelectorAll('[data-auth="user"]').forEach(el => {
      el.classList.toggle('hidden', !user);
    });
    document.querySelectorAll('[data-auth="admin"]').forEach(el => {
      el.classList.toggle('hidden', !admin);
    });
    document.querySelectorAll('[data-user-label]').forEach(el => {
      if (!user) {
        el.textContent = '';
        el.classList.add('hidden');
        return;
      }
      if (admin) {
        el.textContent = '';
        el.classList.add('hidden');
      } else {
        el.textContent = getDisplayName(user);
        el.classList.remove('hidden');
      }
    });
    return { session, user, admin };
  }

  async function signIn(email, password) {
    const result = await sb.auth.signInWithPassword({ email, password });
    const user = result?.data?.user || result?.data?.session?.user || null;
    if (user?.email) await resolveRole(user);
    return result;
  }

  async function signUp(email, password, name='') {
    return sb.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: APP_CONFIG.siteUrl + 'belepes.html'
      }
    });
  }

  async function signInWithFacebook() {
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'facebook',
      options: {
        redirectTo: APP_CONFIG.siteUrl + 'belepes.html',
        skipBrowserRedirect: true
      }
    });
    if (error) throw error;
    if (data?.url) {
      window.location.assign(data.url);
    }
    return { data, error: null };
  }

  async function logout() {
    try { await sb.auth.signOut(); } catch (err) { console.error('Kilépési hiba:', err); }
    try {
      sessionStorage.removeItem('uv_next');
      sessionStorage.setItem('uv_logout_notice', 'Sikeres kijelentkezés.');
    } catch(_) {}
    cachedRole = null;

    document.querySelectorAll('[data-auth="guest"]').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('[data-auth="user"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[data-auth="admin"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[data-user-label]').forEach(el => {
      el.textContent = '';
      el.classList.add('hidden');
    });

    window.location.replace('index.html');
  }

  async function requireAuth(next='index.html') {
    const session = await getSession();
    if (session?.user) return true;
    setNext(next || location.pathname.split('/').pop() || 'index.html');
    location.href = 'belepes.html';
    return false;
  }

  async function requireAdmin() {
    const session = await getSession();
    if (!session?.user) {
      setNext('admin.html');
      location.href = 'belepes.html';
      return false;
    }
    if (!await isAdmin(session.user.email)) {
      location.href = 'index.html';
      return false;
    }
    return true;
  }

  function bindLogout() {
    document.querySelectorAll('[data-logout]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await logout();
        return false;
      });
    });
  }

  function bindFacebookLogin() {
    const btn = document.getElementById('facebookLoginBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const loginMsg = document.getElementById('loginMsg');
      if (loginMsg) loginMsg.textContent = 'Facebook belépés indítása...';
      try {
        await signInWithFacebook();
      } catch (err) {
        console.error('Facebook belépési hiba:', err);
        if (loginMsg) {
          const msg = String(err?.message || '');
          loginMsg.textContent = msg.toLowerCase().includes('provider')
            ? 'A Facebook belépés még nincs bekapcsolva a Supabase-ben. Előbb engedélyezni kell a Facebook providert.'
            : 'Nem sikerült a Facebook belépés.';
        }
      }
    });
  }

  function watchAuth() {
    sb.auth.onAuthStateChange(async (_event, session) => {
      await updateNav(session || null);
    });
  }

  function showLogoutMessageIfNeeded() {
    try {
      const msg = sessionStorage.getItem('uv_logout_notice');
      if (msg) {
        showToast(msg || 'Sikeres kijelentkezés.');
        sessionStorage.removeItem('uv_logout_notice');
      }
    } catch(_) {}
  }

  return {
    getSession,
    getUser,
    updateNav,
    signIn,
    signUp,
    signInWithFacebook,
    logout,
    requireAuth,
    requireAdmin,
    isAdmin,
    fetchAdminEmail,
    resolveRole,
    bindLogout,
    bindFacebookLogin,
    watchAuth,
    setNext,
    consumeNext,
    showLogoutMessageIfNeeded
  };
})();

document.addEventListener('DOMContentLoaded', async () => {
  try { await AppAuth.updateNav(); } catch(_) {}
  AppAuth.bindLogout();
  AppAuth.bindFacebookLogin();
  AppAuth.watchAuth();
  AppAuth.showLogoutMessageIfNeeded();
});
