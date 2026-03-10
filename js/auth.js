window.AppAuth = (() => {
  let sessionCache = null;
  let adminEmailCache = null;

  async function getAdminEmail(force = false) {
    if (adminEmailCache && !force) return adminEmailCache;
    try {
      const { data } = await sb.from('beallitasok').select('admin_email').order('id', { ascending: true }).limit(1).maybeSingle();
      adminEmailCache = (data?.admin_email || APP_CONFIG.adminEmail || '').toLowerCase();
    } catch (_) {
      adminEmailCache = (APP_CONFIG.adminEmail || '').toLowerCase();
    }
    return adminEmailCache;
  }

  async function getSession() {
    const { data, error } = await sb.auth.getSession();
    if (error) return null;
    sessionCache = data.session || null;
    return sessionCache;
  }

  async function getUser() {
    const { data, error } = await sb.auth.getUser();
    if (error) return null;
    return data.user || null;
  }

  function getDisplayName(user) {
    const md = user?.user_metadata || {};
    return md.full_name || md.name || (user?.email ? user.email.split('@')[0] : 'Felhasználó');
  }

  async function isAdmin(emailOverride = '') {
    const user = emailOverride ? { email: emailOverride } : await getUser();
    const adminEmail = await getAdminEmail();
    return !!user && !!adminEmail && user.email?.toLowerCase() === adminEmail;
  }

  function saveNext(url) {
    try { sessionStorage.setItem('nextAfterAuth', url); } catch(_) {}
  }

  function consumeNext(defaultUrl='index.html') {
    try {
      const next = sessionStorage.getItem('nextAfterAuth');
      sessionStorage.removeItem('nextAfterAuth');
      return next || defaultUrl;
    } catch(_) { return defaultUrl; }
  }

  async function requireAuth(next='belepes.html') {
    const session = await getSession();
    if (!session) {
      saveNext(location.pathname.split('/').pop() + location.search + location.hash);
      location.href = next;
      return false;
    }
    return true;
  }

  async function requireAdmin() {
    const ok = await requireAuth('belepes.html');
    if (!ok) return false;
    const admin = await isAdmin();
    if (!admin) {
      location.href = 'index.html';
      return false;
    }
    return true;
  }

  async function signOut() {
    try { await sb.auth.signOut(); } catch (_) {}
    sessionCache = null;
    document.querySelectorAll('[data-auth="guest"]').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('[data-auth="user"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[data-auth="admin"]').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = ''; el.classList.add('hidden'); });
    location.replace('index.html?logout=1');
  }

  async function signIn(email, password) {
    return sb.auth.signInWithPassword({ email, password });
  }

  async function signUp(email, password, fullName='') {
    return sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: APP_CONFIG.siteUrl + 'belepes.html',
        data: { full_name: fullName, name: fullName }
      }
    });
  }

  function showLogoutMessage() {
    const params = new URLSearchParams(location.search);
    if (params.get('logout') !== '1') return;
    const box = document.createElement('div');
    box.className = 'container';
    box.innerHTML = '<div class="notice good" style="margin-top:18px">Sikeres kijelentkezés.</div>';
    const main = document.querySelector('main');
    if (main && main.parentNode) main.parentNode.insertBefore(box, main);
    params.delete('logout');
    const qs = params.toString();
    history.replaceState({}, '', location.pathname + (qs ? '?' + qs : ''));
  }

  async function updateNav() {
    const session = await getSession();
    const user = session?.user || null;
    const admin = user ? await isAdmin(user.email) : false;
    document.querySelectorAll('[data-auth="guest"]').forEach(el => el.classList.toggle('hidden', !!user));
    document.querySelectorAll('[data-auth="user"]').forEach(el => el.classList.toggle('hidden', !user || admin && el.hasAttribute('data-user-name')));
    document.querySelectorAll('[data-auth="admin"]').forEach(el => el.classList.toggle('hidden', !admin));
    document.querySelectorAll('[data-user-name]').forEach(el => {
      if (user && !admin) {
        el.textContent = getDisplayName(user);
        el.classList.remove('hidden');
      } else {
        el.textContent = '';
        el.classList.add('hidden');
      }
    });
    document.querySelectorAll('[data-logout]').forEach(el => {
      el.onclick = async (e) => { e.preventDefault(); await signOut(); };
    });
    return { session, admin, user };
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    sessionCache = session || null;
    await updateNav();
    if (event === 'SIGNED_IN' && location.pathname.endsWith('belepes.html')) {
      setTimeout(async () => {
        const target = (await isAdmin(session?.user?.email || '')) ? 'admin.html' : consumeNext('index.html');
        location.href = target;
      }, 250);
    }
  });

  document.addEventListener('DOMContentLoaded', () => { showLogoutMessage(); });

  return { getSession, getUser, isAdmin, requireAuth, requireAdmin, signOut, signIn, signUp, updateNav, saveNext, consumeNext, getAdminEmail, getDisplayName };
})();
