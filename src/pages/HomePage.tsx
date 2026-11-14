import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function HomePage() {
  const { user } = useAuth()
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  return (
    <div className="mx-auto max-w-md p-5">
      <div className="rounded-3xl bg-white p-6 shadow">
        <h1 className="text-2xl font-extrabold">Hi {profile?.full_name ?? '...'} 👋</h1>
        <p className="text-muted">{profile?.email}</p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-5 rounded-full bg-lavender px-5 py-2 font-semibold text-brand"
        >
          Log out
        </button>
      </div>
    </div>
  )
}