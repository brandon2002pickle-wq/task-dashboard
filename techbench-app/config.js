// Supabase project for Tech Bench. The publishable key is meant to be public: row-level security
// in supabase/migrations/001_techbench.sql keeps every record and photo private to the signed-in
// account. Repository variables SUPABASE_URL / SUPABASE_ANON_KEY, if set, override this at deploy.
window.TB_CONFIG = {
  supabaseUrl: 'https://msbkremdhfexxrziejrm.supabase.co',
  supabaseAnonKey: 'sb_publishable_JPSH7rqCjYvcX4Ko5l_kEg_fYTnnULV',
  reportFunction: 'report'
};
