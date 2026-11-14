import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function HomePage() {
  const { user } = useAuth()

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles').select('full_name').eq('id', user!.id).single()
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  const { data: rooms } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms').select('id, name, room_type, room_code')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  return (
    <div className="mx-auto max-w-md space-y-4 p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Hi {profile?.full_name ?? '...'} 👋</h1>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-muted">Log out</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/rooms/new" className="rounded-full bg-brand py-3 text-center font-bold text-white">+ Create room</Link>
        <Link to="/rooms/join" className="rounded-full bg-lavender py-3 text-center font-bold text-brand">Join room</Link>
      </div>

      <h2 className="pt-2 font-bold">Your rooms</h2>
      {rooms?.length === 0 && <p className="text-muted">No rooms yet. Create one or join with a code.</p>}
      {rooms?.map((r) => (
        <Link key={r.id} to={`/rooms/${r.id}`} className="block rounded-3xl bg-white p-5 shadow">
          <p className="text-lg font-extrabold">{r.name}</p>
          <p className="text-sm text-muted capitalize">{r.room_type} · {r.room_code}</p>
        </Link>
      ))}
    </div>
  )
}