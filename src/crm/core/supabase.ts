// ============================================================
//  Cliente de Supabase
//  Las llaves se leen de variables de entorno (Vite → import.meta.env).
//  Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local
//  (Settings → API en el panel de Supabase).
// ============================================================
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  // Aviso claro en consola si faltan las llaves (evita errores crípticos).
  console.error(
    '[supabase] Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. ' +
      'Créalas en CCRACKS-Front/.env.local y reinicia el dev server.',
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')
