import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

type Notif = {
  id: string; room_id: string | null; title: string; message: string
  is_read: boolean; created_at: string
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()

  const { data } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications').select('id, room_id, title, message, is_read, created_at')
        .order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data as Notif[]
    },
    enabled: !!user,
  })

  useEffect(() => {
    if (!user) return
    const ch = supabase.channel(`notif-page-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ['notifications', user.id] }))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, qc])

  async function open(n: Notif) {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      qc.invalidateQueries({ queryKey: ['notifications', user?.id] })
    }
    if (n.room_id) nav(`/rooms/${n.room_id}/settlements`)
  }

  async function markAll() {
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user!.id).eq('is_read', false)
    qc.invalidateQueries({ queryKey: ['notifications', user?.id] })
  }

  return (
    <div className="mx-auto max-w-md space-y-3 p-5 pb-20">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted">← Back</Link>
        <button onClick={markAll} className="text-sm font-semibold text-brand">Mark all read</button>
      </div>
      <h1 className="text-2xl font-extrabold">Notifications</h1>
      {data?.length === 0 && <p className="text-muted">No notifications yet.</p>}
      {data?.map((n) => (
        <button key={n.id} onClick={() => open(n)}
          className={`block w-full rounded-3xl p-4 text-left shadow ${n.is_read ? 'bg-white' : 'bg-lavender ring-2 ring-brand'}`}>
          <p className="font-bold">{n.title}{!n.is_read && ' · NEW'}</p>
          <p className="text-sm">{n.message}</p>
          <p className="mt-1 text-[11px] text-muted">
            {new Date(n.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </button>
      ))}
    </div>
  )
}