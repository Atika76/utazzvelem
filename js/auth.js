window.AppAuth = (() => {
  let cachedAdminEmail = null;
  const ADMIN_CACHE_KEY = 'fv_admin_email_cache';

  const ONESIGNAL_APP_ID = '04a02749-13bd-4060-9559-f0808ee9f927';
  let oneSignalBootPromise = null;

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

  async function fetchAdminEmail(force=false) {
    if (cachedAdminEmail && !force) return cachedAdminEmail;
    if (!force) {
      try {
        const cached = sessionStorage.getItem(ADMIN_CACHE_KEY);
        if (cached) {
          cachedAdminEmail = cached;
          return cachedAdminEmail;
        }
      } catch(_) {}
    }
    try {
      const { data } = await sb.from('beallitasok').select('id,admin_email').order('id', { ascending: true }).limit(1).maybeSingle();
      cachedAdminEmail = data?.admin_email || APP_CONFIG.adminEmail;
    } catch (_) {
      cachedAdminEmail = APP_CONFIG.adminEmail;
    }
    try { sessionStorage.setItem(ADMIN_CACHE_KEY, cachedAdminEmail); } catch(_) {}
    return cachedAdminEmail;
  }

  async function isAdmin(email) {
    const adminEmail = await fetchAdminEmail();
    const target = email || (await getUser())?.email;
    return !!target && String(target).toLowerCase() === String(adminEmail).toLowerCase();
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

  function ensureOneSignalSdk() {
    if (!ONESIGNAL_APP_ID) return Promise.resolve(null);
    if (oneSignalBootPromise) return oneSignalBootPromise;

    oneSignalBootPromise = new Promise((resolve) => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];

      const afterLoad = () => {
        window.OneSignalDeferred.push(async function(OneSignal) {
          try {
            await OneSignal.init({
              appId: ONESIGNAL_APP_ID,
            });
            resolve(OneSignal);
          } catch (err) {
            console.warn('OneSignal init hiba:', err);
            resolve(null);
          }
        });
      };

      const existing = document.querySelector('script[data-onesignal-sdk="1"]');
      if (existing) {
        afterLoad();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
      script.defer = true;
      script.dataset.onesignalSdk = '1';
      script.onload = afterLoad;
      script.onerror = () => {
        console.warn('OneSignal SDK nem töltődött be.');
        resolve(null);
      };
      document.head.appendChild(script);
    });

    return oneSignalBootPromise;
  }

  async function syncOneSignalUser(user) {
    if (!ONESIGNAL_APP_ID) return;
    try {
      const OneSignal = await ensureOneSignalSdk();
      if (!OneSignal) return;

      const email = String(user?.email || '').trim().toLowerCase();
      if (email) {
        await OneSignal.login(email);
      } else {
        await OneSignal.logout();
      }
    } catch (err) {
      console.warn('OneSignal felhasználó-szinkron hiba:', err);
    }
  }

  async function updateNav() {
    const session = await getSession();
    const user = session?.user || null;
    const admin = await isAdmin(user?.email);

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

    await syncOneSignalUser(user);
    return { session, user, admin };
  }

  async function signIn(email, password) {
    return sb.auth.signInWithPassword({ email, password });
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
    try {
      await syncOneSignalUser(null);
    } catch (_) {}

    try { await sb.auth.signOut(); } catch (err) { console.error('Kilépési hiba:', err); }
    try {
      sessionStorage.removeItem('uv_next');
      sessionStorage.setItem('uv_logout_notice', 'Sikeres kijelentkezés.');
    } catch(_) {}

    document.querySelectorAll('[data-auth="guest"]').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('[data-auth="user"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[data-auth="admin"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[data-user-label]').forEach(el => {
      el.textContent = '';
      el.classList.add('hidden');
    });

    const target = (APP_CONFIG.siteUrl || './') + 'index.html';
    window.location.replace(target);
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
    sb.auth.onAuthStateChange(async () => {
      await updateNav();
    });
  }

  function showLogoutMessageIfNeeded() {
    try {
      const url = new URL(window.location.href);
      const msg = sessionStorage.getItem('uv_logout_notice');
      if (url.searchParams.get('logout') === '1' || msg) {
        showToast(msg || 'Sikeres kijelentkezés.');
        sessionStorage.removeItem('uv_logout_notice');
        url.searchParams.delete('logout');
        const q = url.searchParams.toString();
        history.replaceState({}, '', url.pathname + (q ? '?' + q : '') + url.hash);
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
    bindLogout,
    bindFacebookLogin,
    watchAuth,
    setNext,
    consumeNext,
    showLogoutMessageIfNeeded,
    syncOneSignalUser
  };
})();

document.addEventListener('DOMContentLoaded', async () => {
  try { await AppAuth.updateNav(); } catch(_) {}
  AppAuth.bindLogout();
  AppAuth.bindFacebookLogin();
  AppAuth.watchAuth();
  AppAuth.showLogoutMessageIfNeeded();
});
