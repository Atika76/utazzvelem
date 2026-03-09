function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isAdminEmail(email) {
  return normalizeEmail(email) === normalizeEmail(ADMIN_EMAIL);
}

async function getAuthSession() {
  if (!supabaseClient?.auth) return null;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) return null;
  return data.session || null;
}

async function getCurrentUser() {
  if (!supabaseClient?.auth) return null;
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) return null;
  return data.user || null;
}

let authReady = false;
let isLoggingOut = false;

function markAuthReady() {
  if (authReady) return;
  authReady = true;
  document.body.classList.add('auth-ready');
}

async function updateNavigationByAuth() {
  const session = await getAuthSession();
  const email = session?.user?.email || '';
  const isAdmin = !!session && isAdminEmail(email);

  document.querySelectorAll('[data-guest-link]').forEach((el) => { el.hidden = !!session; });
  document.querySelectorAll('[data-user-badge]').forEach((el) => { el.hidden = !session; });
  document.querySelectorAll('[data-user-email]').forEach((el) => { el.textContent = email; });
  document.querySelectorAll('[data-admin-link]').forEach((el) => { el.hidden = !isAdmin; });
  document.querySelectorAll('[data-admin-email-display]').forEach((el) => { el.textContent = ADMIN_EMAIL; });
  document.querySelectorAll('[data-logout-button]').forEach((btn) => {
    btn.onclick = async () => {
      if (isLoggingOut) return;
      isLoggingOut = true;
      try {
        await supabaseClient.auth.signOut({ scope: 'local' });
      } catch (error) {
        console.warn('Kijelentkezési hiba:', error);
      }
      window.location.replace('index.html');
    };
  });

  markAuthReady();
  return { session, email, isAdmin };
}

async function requireAdminAccess() {
  const state = await updateNavigationByAuth();
  if (state.isAdmin) return true;

  if (state.session) {
    window.location.replace('index.html?admin=denied');
  } else {
    window.location.replace('belepes.html?next=admin');
  }
  return false;
}

async function requireAuthenticatedAccess() {
  const state = await updateNavigationByAuth();
  if (state.session) return true;
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  window.location.replace(`belepes.html?next=${encodeURIComponent(currentPage)}`);
  return false;
}

async function getRedirectAfterLogin() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  const session = await getAuthSession();
  const email = session?.user?.email || '';

  if (next === 'admin') {
    return isAdminEmail(email) ? 'admin.html' : 'index.html?admin=denied';
  }

  if (next && /\.html$/i.test(next)) {
    return next;
  }

  return 'index.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  await updateNavigationByAuth();

  if (document.body.hasAttribute('data-require-auth')) {
    const allowed = await requireAuthenticatedAccess();
    if (!allowed) return;
  }

  if (document.body.hasAttribute('data-require-admin')) {
    const allowed = await requireAdminAccess();
    if (!allowed) return;
  }

  if (document.body.hasAttribute('data-auth-page')) {
    await initAuthPage();
  }

  supabaseClient?.auth?.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') {
      document.body.classList.remove('auth-ready');
      authReady = false;
    }
    await updateNavigationByAuth();
  });
});
