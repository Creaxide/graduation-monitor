// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
// USE_MOCK = true  -> run fully in the browser on generated dummy data.
//                     No backend required. Ideal for testing the recommendation
//                     engine and UI.
// USE_MOCK = false -> use Supabase. Set the URL + anon key below, then run
//                     sql/schema.sql and sql/seed.sql.
// -----------------------------------------------------------------------------

export const USE_MOCK = true;

export const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-PUBLIC-ANON-KEY";
