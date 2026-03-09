const DEFAULT_ADMIN_EMAIL = "cegweb26@gmail.com";

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function getAuthSession() {
  if (!supabaseClient?.auth) return null;
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error('Session hiba:', error);
    return null;
  }
  return data.session || null;
}


function getStoredSettings() {
  try {
    return JSON.parse(localStorage.getItem('utazzvelem_settings_v2') || '{}');
  } catch {
    return {};
  }
}

function getConfiguredAdminEmail() {
  const settings = getStoredSettings();
  return normalizeEmail(settings.adminEmail || DEFAULT_ADMIN_EMAIL);
}

function isAdminEmail(email) {
  return normalizeEmail(email) === getConfiguredAdminEmail();
}

async function requireAdminAuth() {
  const session = await getAuthSession();
  const email = session?.user?.email || '';
  if (!session || !isAdminEmail(email)) {
    if (session && supabaseClient?.auth) {
      try { await supabaseClient.auth.signOut(); } catch {}
    }
    window.location.href = 'admin-login.html';
    return null;
  }
  return session;
}

async function updateAdminNavigation() {
  const session = await getAuthSession();
  const email = session?.user?.email || '';
  const isAdmin = !!session && isAdminEmail(email);

  document.querySelectorAll('[data-admin-link]').forEach((link) => {
    link.hidden = !isAdmin;
  });

  document.querySelectorAll('[data-admin-login-link]').forEach((link) => {
    link.hidden = true;
  });

  document.querySelectorAll('[data-logout-button]').forEach((button) => {
    button.hidden = !isAdmin;
    button.addEventListener('click', async () => {
      try {
        await supabaseClient.auth.signOut();
      } catch (error) {
        console.error('Kilépési hiba:', error);
      }
      window.location.href = 'index.html';
    });
  });

  document.querySelectorAll('[data-admin-email-display]').forEach((el) => {
    el.textContent = getConfiguredAdminEmail() || DEFAULT_ADMIN_EMAIL;
  });

  return { session, isAdmin, email };
}

async function initAdminLoginPage() {
  const form = document.getElementById('adminLoginForm');
  if (!form || !supabaseClient?.auth) return;

  const current = await getAuthSession();
  if (current?.user?.email && isAdminEmail(current.user.email)) {
    window.location.href = 'admin.html';
    return;
  }

  const message = document.getElementById('adminLoginMessage');
  const modeInput = document.getElementById('authMode');
  const modeLabel = document.getElementById('authModeLabel');
  const switchButton = document.getElementById('authModeSwitch');

  let mode = 'signin';

  function renderMode() {
    if (mode === 'signin') {
      modeLabel.textContent = 'Admin belépés';
      switchButton.textContent = 'Első használat? Fiók létrehozása';
    } else {
      modeLabel.textContent = 'Admin fiók létrehozása';
      switchButton.textContent = 'Már van fiók? Belépés';
    }
    modeInput.value = mode;
    message.textContent = '';
  }

  switchButton.addEventListener('click', () => {
    mode = mode === 'signin' ? 'signup' : 'signin';
    renderMode();
  });

  renderMode();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const selectedMode = String(formData.get('mode') || 'signin');

    if (!isAdminEmail(email)) {
      message.textContent = `Ehhez az admin belépéshez csak a beállított admin e-mail használható: ${getConfiguredAdminEmail() || DEFAULT_ADMIN_EMAIL}`;
      return;
    }

    if (password.length < 6) {
      message.textContent = 'A jelszó legyen legalább 6 karakter hosszú.';
      return;
    }

    message.textContent = selectedMode === 'signin' ? 'Belépés folyamatban...' : 'Fiók létrehozása folyamatban...';

    try {
      if (selectedMode === 'signup') {
        const { error } = await supabaseClient.auth.signUp({ email, password, options: { emailRedirectTo: new URL('admin-login.html', window.location.href).href } });
        if (error) throw error;
        message.textContent = 'A fiók elkészült. Ha a Supabase e-mail megerősítést kér, nyisd meg a leveledet, utána jelentkezz be.';
        mode = 'signin';
        renderMode();
        return;
      }

      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = 'admin.html';
    } catch (error) {
      console.error('Admin auth hiba:', error);
      const text = String(error?.message || 'Sikertelen belépés.');
      if (text.toLowerCase().includes('email not confirmed')) {
        message.textContent = 'Az e-mail még nincs megerősítve. Ellenőrizd a postafiókodat, vagy a Supabase-ben kapcsold ki az e-mail megerősítést.';
      } else {
        message.textContent = text;
      }
    }
  });
}
