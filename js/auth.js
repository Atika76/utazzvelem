window.AppAuth = (() => {
  let cachedAdminEmail = null;

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
    try {
      const { data } = await sb.from('beallitasok').select('id,admin_email').order('id', { ascending: true }).limit(1).maybeSingle();
      cachedAdminEmail = data?.admin_email || APP_CONFIG.adminEmail;
    } catch (_) {
      cachedAdminEmail = APP_CONFIG.adminEmail;
    }
    return cachedAdminEmail;
  }

  async function isAdmin(email) {
    const adminEmail = await fetchAdminEmail();
    const target = email || (await getUser())?.email;
    return !!target && String(target).toLowerCase() === String(adminEmail).toLowerCase();
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
    document.querySelectorAll('[data-user-email]').forEach(el => {
      el.textContent = user?.email || '';
    });
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
    return sb.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: APP_CONFIG.siteUrl + 'belepes.html' }
    });
  }

  async function logout() {
    await sb.auth.signOut();
    try { sessionStorage.removeItem('uv_next'); } catch(_) {}
    location.href = 'index.html';
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
        await logout();
      });
    });
  }

  function watchAuth() {
    sb.auth.onAuthStateChange(async () => {
      await updateNav();
    });
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
    watchAuth,
    setNext,
    consumeNext
  };
})();
