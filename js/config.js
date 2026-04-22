// For local dev without Docker, Supabase features are disabled (offline mode).
// This file is overwritten at container startup by entrypoint.sh from config.js.template.
window.APP_CONFIG = {
  supabaseUrl: "",
  supabaseKey: "",
  appToken: ""
};
