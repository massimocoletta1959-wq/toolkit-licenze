import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://vwbixmbbcutjcplskjvg.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3Yml4bWJiY3V0amNwbHNranZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MDk3NjgsImV4cCI6MjA5ODQ4NTc2OH0.Xou7GKtwcS31-poafIaxTxprS7M7jqLqUCG2dCotoQI'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
