import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Loud, early failure beats a cryptic network error later.
  console.error(
    'Missing Supabase env vars. Copy .env.local.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const isConfigured = Boolean(url && anonKey)

// createClient throws on an empty URL/key, which would blank the whole app before
// we can show the "not configured" screen. Fall back to harmless placeholders;
// isConfigured stays false so App renders the setup instructions instead.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
)
