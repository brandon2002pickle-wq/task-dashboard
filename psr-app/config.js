// Supabase project for PSR Tool (same project as Tech Bench). The publishable key is meant to be public: row-level security
// in supabase/migrations/003_psr.sql keeps every case private to the signed-in
// account. Repository variables SUPABASE_URL / SUPABASE_ANON_KEY, if set, override this at deploy.
window.PSR_CONFIG = {
  supabaseUrl: 'https://msbkremdhfexxrziejrm.supabase.co',
  supabaseAnonKey: 'sb_publishable_JPSH7rqCjYvcX4Ko5l_kEg_fYTnnULV',
  psrFunction: 'psr'
};
