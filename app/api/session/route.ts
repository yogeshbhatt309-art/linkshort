import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { claims } } = await supabase.auth.getClaims()
  const id = typeof claims?.sub === 'string' ? claims.sub : null
  if (!id) return NextResponse.json({ user: null })
  const email = typeof claims.email === 'string' ? claims.email : undefined
  const { data: profile } = await createAdminClient().from('profiles').select('role, display_name').eq('id', id).maybeSingle()
  return NextResponse.json({ user: { id, email, name: profile?.display_name ?? email?.split('@')[0] ?? 'Member', role: profile?.role === 'admin' ? 'admin' : 'user' } })
}
