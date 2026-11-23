// Fill these in from Supabase → Project Settings → API. The anon key is meant to be public:
// row-level security in supabase/migrations/001_techbench.sql keeps every record and photo
// private to the signed-in account. Leave both blank to run on this device only (no sync).
window.TB_CONFIG = {
  supabaseUrl: '',        // e.g. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: '',    // the "anon public" key
  reportFunction: 'report'
};
