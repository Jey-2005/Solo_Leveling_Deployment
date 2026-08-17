import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error(
    '[system] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. ' +
    'Copy .env.example to .env and fill them in.'
  )
}

export const supabase = createClient(url, key, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  global: { headers: { 'x-client': 'solo-leveling-system' } },
})

export default supabase
