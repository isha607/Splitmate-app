import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export default function RoomPage() {
  const { roomId } = useParams()
  const [copied, setCopied] = useState(false)

  const { data: room } = useQuery({
    queryKey: ['room', roomId],
    queryFn: async () => {
      const { data, error } = await supabase.from('rooms').select('*').eq('id', roomId!).single()
      if (error) throw error
      return data
    },
  })

  const { data: members } = useQuery({
    queryKey: ['members', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_members').select('user_id, role, profiles(full_name)')
        .eq('room_id', roomId!).eq('status', 'active')
      if (error) throw error
      return data as unknown as { user_id: string; role: string; profiles: { full_name: string } | null }[]
    },
  })

  if (!room) return <div className="p-10 text-center text-muted">Loading...</div>

  return (
    <div className="mx-auto max-w-md space-y-4 p-5">
      <Link to="/" className="text-sm text-muted">← Back</Link>
      <div className="rounded-3xl bg-white p-6 shadow">
        <h1 className="text-2xl font-extrabold">{room.name}</h1>
        <p className="text-sm capitalize text-muted">{room.room_type}</p>
        <button
          onClick={() => { navigator.clipboard.writeText(room.room_code); setCopied(true) }}
          className="mt-4 w-full rounded-2xl bg-lavender py-3 text-lg font-extrabold tracking-widest text-brand">
          {room.room_code} {copied ? '✓ Copied' : '(tap to copy)'}
        </button>
      </div>
      <div className="rounded-3xl bg-white p-6 shadow">
        <h2 className="mb-3 font-bold">Members ({members?.length ?? 0})</h2>
        {members?.map((m) => (
          <div key={m.user_id} className="flex items-center gap-3 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand font-bold text-white">
              {m.profiles?.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="font-semibold">{m.profiles?.full_name}</span>
            <span className="ml-auto text-xs capitalize text-muted">{m.role}</span>
          </div>
        ))}
      </div>
    </div>
  )
}