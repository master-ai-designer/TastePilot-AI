(() => {
  let client = null;
  let mode = "login";
  let configError = "";
  const $ = (id) => document.getElementById(id);
  const setMessage = (text, kind = "") => {
    const el = $("authMessage");
    if (!el) return;
    el.textContent = text;
    el.dataset.kind = kind;
  };
  const getRedirectUrl = () => window.location.origin + window.location.pathname;
  async function initAuth() {
    try {
      const response = await fetch("/api/auth-config", { headers: { "Accept": "application/json" }, cache: "no-store" });
      const config = await response.json();
      if (!response.ok || !config.configured) {
        configError = "Authentication setup is not finished yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in Vercel, then redeploy.";
        return;
      }
      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        configError = "The authentication library could not load. Please refresh and try again.";
        return;
      }
      client = window.supabase.createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data: { session } } = await client.auth.getSession();
      renderSession(session);
      client.auth.onAuthStateChange((_event, sessionNow) => {
        queueMicrotask(() => renderSession(sessionNow));
      });
      const params = new URLSearchParams(window.location.search);
      if (params.has("error_description")) {
        openAuthModal();
        setMessage(params.get("error_description") || "Google sign-in could not be completed.", "error");
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      } else if (window.location.hash.includes("access_token") || params.has("code")) {
        openAuthModal();
        setMessage("Checking your sign-in…");
      }
    } catch (_error) {
      configError = "Could not connect to the authentication service. Please try again.";
    }
  }
  function renderSession(session) {
    const button = $("authOpenBtn");
    const menu = $("authUserMenu");
    const email = $("authUserEmail");
    if (!button) return;
    if (session?.user) {
      button.textContent = "MY ACCOUNT ▾";
      button.setAttribute("aria-label", "Open account menu");
      button.onclick = () => {
        const open = menu.dataset.open !== "true";
        menu.dataset.open = String(open);
        email.textContent = session.user.email || "Signed in";
      };
    } else {
      button.textContent = "SIGN IN ↗";
      button.setAttribute("aria-label", "Sign in or create an account");
      button.onclick = openAuthModal;
      if (menu) menu.dataset.open = "false";
    }
  }
  window.openAuthModal = () => {
    const overlay = $("authOverlay");
    if (!overlay) return;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    if (configError) setMessage(configError, "error");
    else setMessage("");
    setTimeout(() => $("authEmail")?.focus(), 30);
  };
  window.closeAuthModal = () => {
    $("authOverlay").hidden = true;
    document.body.style.overflow = "";
  };
  window.setAuthMode = (nextMode) => {
    mode = nextMode === "signup" ? "signup" : "login";
    $("authLoginTab").setAttribute("aria-selected", String(mode === "login"));
    $("authSignupTab").setAttribute("aria-selected", String(mode === "signup"));
    $("authTitle").textContent = mode === "login" ? "Welcome back." : "Create your account.";
    $("authSubtitle").textContent = mode === "login"
      ? "Sign in to your TastePilot account and continue your discovery."
      : "Create an account to make your TastePilot experience yours.";
    $("authSubmit").textContent = mode === "login" ? "Sign in securely ↗" : "Create account ↗";
    $("authPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
    $("authForgot").hidden = mode !== "login";
    setMessage("");
  };
  $("authOverlay")?.addEventListener("click", (event) => {
    if (event.target === $("authOverlay")) window.closeAuthModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("authOverlay").hidden) window.closeAuthModal();
    if (event.key === "Escape" && $("authUserMenu").dataset.open === "true") $("authUserMenu").dataset.open = "false";
  });
  document.addEventListener("click", (event) => {
    const menu = $("authUserMenu"), button = $("authOpenBtn");
    if (menu?.dataset.open === "true" && !menu.contains(event.target) && !button?.contains(event.target)) menu.dataset.open = "false";
  });
  $("authForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) { setMessage(configError || "Authentication is still loading. Please try again.", "error"); return; }
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const submit = $("authSubmit");
    submit.disabled = true;
    submit.textContent = mode === "login" ? "Signing in…" : "Creating account…";
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email, password,
          options: { emailRedirectTo: getRedirectUrl() }
        });
        if (error) throw error;
        if (data.session) {
          setMessage("Account created. You are signed in.", "success");
          setTimeout(window.closeAuthModal, 650);
        } else {
          setMessage("Account created. Check your email for the confirmation link before signing in.", "success");
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage("Signed in successfully.", "success");
        setTimeout(window.closeAuthModal, 450);
      }
    } catch (error) {
      const message = String(error?.message || "");
      if (/invalid login credentials/i.test(message)) setMessage("Email or password is incorrect.", "error");
      else if (/already registered|user already registered/i.test(message)) setMessage("An account with this email already exists. Try signing in.", "error");
      else if (/password should be at least|weak password/i.test(message)) setMessage("Choose a stronger password with at least 8 characters.", "error");
      else setMessage(message || "Could not complete authentication. Please try again.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = mode === "login" ? "Sign in securely ↗" : "Create account ↗";
    }
  });
  window.signInWithGoogle = async () => {
    if (!client) { setMessage(configError || "Authentication is still loading. Please try again.", "error"); return; }
    setMessage("Redirecting to Google…");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getRedirectUrl(), queryParams: { prompt: "select_account" } }
    });
    if (error) setMessage(error.message || "Google sign-in could not start.", "error");
  };
  window.sendPasswordReset = async () => {
    if (!client) { setMessage(configError || "Authentication is not configured yet.", "error"); return; }
    const email = $("authEmail").value.trim();
    if (!email) { setMessage("Enter your email address first.", "error"); $("authEmail").focus(); return; }
    setMessage("Sending password reset email…");
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: getRedirectUrl() });
    if (error) setMessage(error.message || "Could not send reset email.", "error");
    else setMessage("If an account exists for that email, a password reset link will arrive shortly.", "success");
  };
  window.signOutTastePilot = async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    $("authUserMenu").dataset.open = "false";
    if (error) { openAuthModal(); setMessage("Could not sign out. Please try again.", "error"); }
  };
  initAuth();
})();