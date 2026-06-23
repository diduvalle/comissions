import { createClient } from '@supabase/supabase-js'

// Chaves PÚBLICAS (publishable) — seguras no frontend.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://bhurcadussdjohbngekq.supabase.co'
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_eKHXqa4aW7SwV8zx_euepA_ngZ3U5NU'

export const supabase = createClient(url, key)
