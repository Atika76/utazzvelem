window.sb = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});