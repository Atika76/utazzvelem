window.AppAuth = (() => {
  let cachedAdminEmail = null;

  function setNext(url) {
    try {
      sessionStorage.setItem("uv_next", url || "index.html");
    } catch (_) {}
  }

  function consumeNext(fallback = "index.html") {
    try {
      const v = sessionStorage.getItem("uv_next");
      sessionStorage.removeItem("uv_next");
      return v || fallback;
    } catch (_) {
      return fallback;
    }
  }

  async function getSession() {
    const { data } = await sb.auth.getSession();
    return data.session;
  }

  async function getUser() {
    const { data } = await sb.auth.getUser();
    return data.user;
  }

  async function fetchAdminEmail(force = false) {
    if (cachedAdminEmail && !force) return cachedAdminEmail;

    try {
      const { data, error } = await sb
        .from("beallitasok")
        .select("admin_email")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        cachedAdminEmail = APP_CONFIG.adminEmail;
      } else {
        cachedAdminEmail = data?.admin_email || APP_CONFIG.adminEmail;
      }
    } catch (_) {
      cachedAdminEmail = APP_CONFIG.adminEmail;
    }

    return cachedAdminEmail;
  }

  async function isAdmin(email) {
    const adminEmail = await fetchAdminEmail();
    const target = email || (await getUser())?.email;

    return !!target &&
      String(target).toLowerCase() === String(adminEmail).toLowerCase();
  }

  async function updateNav() {
    const session = await getSession();
    const user = session?.user || null;
    const admin = user ? await isAdmin(user.email) : false;

    document.querySelectorAll('[data-auth="guest"]').forEach((el) => {
      el.classList.toggle("hidden", !!user);
    });

    document.querySelectorAll('[data-auth="user"]').forEach((el) => {
      el.classList.toggle("hidden", !user);
    });

    document.querySelectorAll('[data-auth="admin"]').forEach((el) => {
      el.classList.toggle("hidden", !admin);
    });

    document.querySelectorAll("[data-user-email]").forEach((el) => {
      el.textContent = user?.email || "";
    });

    return { session, user, admin };
  }

  async function signIn(email, password) {
    return sb.auth.signInWithPassword({
      email: String(email || "").trim(),
      password: String(password || "")
    });
  }

  async function signUp(email, password, name = "") {
    return sb.auth.signUp({
      email: String(email || "").trim(),
      password: String(password || ""),
      options: {
        data: { name: String(name || "").trim() },
        emailRedirectTo: APP_CONFIG.siteUrl + "belepes.html"
      }
    });
  }

  async function signInWithFacebook() {
    return sb.auth.signInWithOAuth({
      provider: "facebook",
      options: {
        redirectTo: APP_CONFIG.siteUrl + "belepes.html"
      }
    });
  }

  async function logout() {
    try {
      await sb.auth.signOut();
    } catch (err) {
      console.error("Kilépési hiba:", err);
    }

    try {
      sessionStorage.removeItem("uv_next");
    } catch (_) {}

    document.querySelectorAll('[data-auth="guest"]').forEach((el) => {
      el.classList.remove("hidden");
    });

    document.querySelectorAll('[data-auth="user"]').forEach((el) => {
      el.classList.add("hidden");
    });

    document.querySelectorAll('[data-auth="admin"]').forEach((el) => {
      el.classList.add("hidden");
    });

    window.location.replace("index.html");
  }

  async function requireAuth(next = "index.html") {
    const session = await getSession();

    if (session?.user) return true;

    setNext(next || location.pathname.split("/").pop() || "index.html");
    window.location.href = "belepes.html";
    return false;
  }

  async function requireAdmin() {
    const session = await getSession();

    if (!session?.user) {
      setNext("admin.html");
      window.location.href = "belepes.html";
      return false;
    }

    const admin = await isAdmin(session.user.email);

    if (!admin) {
      window.location.href = "index.html";
      return false;
    }

    return true;
  }

  function bindLogout() {
    document.querySelectorAll("[data-logout]").forEach((el) => {
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        await logout();
      });
    });
  }

  function bindFacebookLogin() {
    const btn = document.getElementById("facebookLoginBtn");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      try {
        await signInWithFacebook();
      } catch (err) {
        console.error("Facebook belépési hiba:", err);
        const loginMsg = document.getElementById("loginMsg");
        if (loginMsg) {
          loginMsg.textContent = "Nem sikerült a Facebook belépés.";
        }
      }
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
    bindFacebookLogin,
    watchAuth,
    setNext,
    consumeNext
  };
})();

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await AppAuth.updateNav();
  } catch (err) {
    console.error("Menüfrissítési hiba:", err);
  }

  AppAuth.bindLogout();
  AppAuth.bindFacebookLogin();
  AppAuth.watchAuth();
});
