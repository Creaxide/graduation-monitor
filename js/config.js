// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
// USE_MOCK = true  -> run fully in the browser on generated dummy data.
//                     No backend required. Ideal for testing the recommendation
//                     engine and UI.
// USE_MOCK = false -> use Supabase. Set the URL + anon key below, then run
//                     sql/schema.sql and sql/seed.sql.
// -----------------------------------------------------------------------------

export const USE_MOCK = false;

export const SUPABASE_URL = "https://ygbetsdjzjutehfjwauz.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnYmV0c2Rqemp1dGVoZmp3YXV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3ODc3MDcsImV4cCI6MjEwNzM2MzcwN30.fwUaN2aNzUDlZoUjZV2YSAi1tzlRnw9cwkCT3fzQXDI";
