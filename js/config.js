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

export const SUPABASE_URL = "https://otmwtrgbbqhdvhsplfuq.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im90bXd0cmdiYnFoZHZoc3BsZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MDAwMjcsImV4cCI6MjEwNzI3NjAyN30.vbN8S1zc3C0q04GkUQw6QnYXe0LwZWLxeZVwFQWCSxA";
