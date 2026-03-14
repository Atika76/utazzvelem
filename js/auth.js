window.AppAuth = (() => {
  let cachedAdminEmail = null;
  const ADMIN_CACHE_KEY = 'fv_admin_email_cache';

  const ONESIGNAL_APP_ID = '04a02749-13bd-4060-9559-f0808ee9f927';
  const ONESIGNAL_PROMPT_KEY = 'fv_onesignal_prompt_shown';
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
              serviceWorkerPath: 'OneSignalSDKWorker.js',
              serviceWorkerUpdaterPath: 'OneSignalSDKUpdaterWorker.js',
              notifyButton: { enable: false },
              allowLocalhostAsSecureOrigin: true,
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

  function detectPushState() {
    const ua = navigator.userAgent || '';
    const browser = /Edg\//.test(ua) ? 'edge' : /Chrome\//.test(ua) && !/Edg\//.test(ua) ? 'chrome' : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? 'safari' : 'other';
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
    const hasNotificationApi = typeof window !== 'undefined' && 'Notification' in window;
    const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    const permission = hasNotificationApi ? Notification.permission : 'unsupported';

    let mode = 'promptable';
    if (!hasNotificationApi || !hasServiceWorker) mode = 'unsupported';
    else if (isIOS && !isStandalone) mode = 'ios_needs_pwa';
    else if (permission === 'granted') mode = 'granted';
    else if (permission === 'denied') mode = 'denied';

    return { browser, isIOS, isStandalone, hasNotificationApi, hasServiceWorker, permission, mode };
  }

  function getPushBarContent(state) {
    if (state.mode === 'unsupported') {
      return {
        title: 'A push értesítések ezen az eszközön vagy böngészőben most nem támogatottak.',
        btn: 'Mit kell tenni?',
        help: 'Próbáld Chrome vagy Edge böngészőben, HTTPS alatt. Mobilon szükség van értesítést támogató böngészőre és engedélyezett service workerre.'
      };
    }
    if (state.mode === 'ios_needs_pwa') {
      return {
        title: 'iPhone-on a push értesítésekhez tedd ki az oldalt a kezdőképernyőre.',
        btn: 'iPhone beállítások',
        help: 'Safari → Megosztás → Főképernyőhöz adás. Ezután a kezdőképernyőről nyisd meg a FuvarVelünk oldalt, és ott engedélyezd az értesítéseket.'
      };
    }
    if (state.mode === 'denied') {
      const browserLabel = state.browser === 'edge' ? 'Edge' : state.browser === 'chrome' ? 'Chrome' : 'böngésző';
      return {
        title: 'A push értesítések jelenleg le vannak tiltva ebben a böngészőben.',
        btn: 'Mutasd a lépéseket',
        help: `${browserLabel}: kattints a lakat ikonra a címsorban → Webhelyengedélyek / Site permissions → Értesítések → Engedélyezés. Ha tiltólistán van az oldal, töröld a tiltást, majd frissítsd az oldalt.`
      };
    }
    return {
      title: 'Kapcsold be a push értesítéseket, hogy azonnal lásd a foglalásokat, jóváhagyásokat és fizetéseket.',
      btn: 'Push értesítések bekapcsolása',
      help: 'Ha nem ugrik fel engedélykérés, valószínűleg a böngésző korábban letiltotta. Ebben az esetben a webhely engedélyeinél kell visszakapcsolni az értesítéseket.'
    };
  }

  function renderPushBar(state) {
    const content = getPushBarContent(state);
    let bar = document.getElementById('pushEnableBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pushEnableBar';
      bar.className = 'push-enable-bar';
      bar.innerHTML = `
        <div class="push-enable-main">
          <div class="push-enable-text"></div>
          <div class="push-enable-help hidden"></div>
        </div>
        <div class="push-enable-actions">
          <button type="button" class="btn btn-primary push-enable-btn"></button>
          <button type="button" class="btn push-enable-close">Bezárás</button>
        </div>
      `;
      document.body.appendChild(bar);
    }

    bar.dataset.mode = state.mode;
    const text = bar.querySelector('.push-enable-text');
    const help = bar.querySelector('.push-enable-help');
    const btn = bar.querySelector('.push-enable-btn');
    const closeBtn = bar.querySelector('.push-enable-close');

    if (text) text.textContent = content.title;
    if (help) {
      help.textContent = content.help;
      help.classList.add('hidden');
    }
    if (btn) {
      btn.textContent = content.btn;
      btn.disabled = false;
    }

    if (closeBtn && !closeBtn.dataset.bound) {
      closeBtn.dataset.bound = '1';
      closeBtn.addEventListener('click', () => {
        try { sessionStorage.setItem(ONESIGNAL_PROMPT_KEY, 'dismissed'); } catch (_) {}
        bar.remove();
      });
    }

    return bar;
  }

  async function ensurePushPromptButton(OneSignal, email) {
    try {
      const state = detectPushState();
      if (state.mode === 'granted') {
        const old = document.getElementById('pushEnableBar');
        if (old) old.remove();
        try { sessionStorage.removeItem(ONESIGNAL_PROMPT_KEY); } catch (_) {}
        return;
      }

      const dismissed = (() => {
        try { return sessionStorage.getItem(ONESIGNAL_PROMPT_KEY) === 'dismissed'; } catch (_) { return false; }
      })();
      if (dismissed && state.mode !== 'denied') return;

      const bar = renderPushBar(state);
      const btn = bar.querySelector('.push-enable-btn');
      const help = bar.querySelector('.push-enable-help');

      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', async () => {
          const currentState = detectPushState();
          bar.dataset.mode = currentState.mode;

          if (currentState.mode === 'unsupported' || currentState.mode === 'ios_needs_pwa' || currentState.mode === 'denied') {
            help?.classList.toggle('hidden');
            if (currentState.mode === 'denied') showToast('A böngészőben kell újra engedélyezni az értesítéseket.');
            return;
          }

          try {
            btn.disabled = true;
            btn.textContent = 'Engedélykérés...';
            if (OneSignal.Notifications?.requestPermission) {
              await OneSignal.Notifications.requestPermission();
            }
            const latest = detectPushState();
            if (latest.mode === 'granted') {
              try {
                await OneSignal.login(email);
                if (OneSignal.User?.addTag) {
                  await OneSignal.User.addTag('email', email);
                }
              } catch (_) {}
              try { sessionStorage.removeItem(ONESIGNAL_PROMPT_KEY); } catch (_) {}
              bar.remove();
              showToast('Push értesítések engedélyezve.');
            } else {
              const refreshed = renderPushBar(latest);
              const refreshedHelp = refreshed.querySelector('.push-enable-help');
              if (latest.mode === 'denied') refreshedHelp?.classList.remove('hidden');
              showToast(latest.mode === 'denied'
                ? 'A böngésző letiltotta az értesítéseket. A webhely engedélyeinél kapcsold vissza.'
                : 'Az értesítések még nincsenek engedélyezve.');
            }
          } catch (err) {
            console.warn('Push gomb hiba:', err);
            const refreshed = renderPushBar(detectPushState());
            refreshed.querySelector('.push-enable-help')?.classList.remove('hidden');
          }
        });
      }
    } catch (err) {
      console.warn('Push sáv hiba:', err);
    }
  }

  async function syncOneSignalUser(user) {
    if (!ONESIGNAL_APP_ID) return;
    try {
      const OneSignal = await ensureOneSignalSdk();
      if (!OneSignal) return;

      const email = String(user?.email || '').trim().toLowerCase();
      if (!email) {
        try { await OneSignal.logout(); } catch (_) {}
        const old = document.getElementById('pushEnableBar');
        if (old) old.remove();
        return;
      }

      try {
        await OneSignal.login(email);
      } catch (loginErr) {
        console.warn('OneSignal login hiba:', loginErr);
      }

      try {
        if (OneSignal.User?.addTag) {
          await OneSignal.User.addTag('email', email);
          await OneSignal.User.addTag('role', (await isAdmin(email)) ? 'admin' : 'user');
        }
      } catch (tagErr) {
        console.warn('OneSignal tag mentési hiba:', tagErr);
      }

      await ensurePushPromptButton(OneSignal, email);
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
    const target = (APP_CONFIG.siteUrl || './') + 'index.html';

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

    const quickLocalLogout = () => {
      try { localStorage.removeItem('fv_user'); } catch(_) {}
      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('sb-') || key.includes('supabase')) localStorage.removeItem(key);
        });
      } catch(_) {}
    };

    quickLocalLogout();

    try { await sb.auth.signOut({ scope: 'local' }); } catch (err) { console.error('Kilépési hiba (local):', err); }

    setTimeout(() => {
      syncOneSignalUser(null).catch(() => {});
      sb.auth.signOut().catch((err) => console.error('Kilépési hiba:', err));
    }, 0);

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
