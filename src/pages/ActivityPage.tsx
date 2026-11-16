import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatINR } from '../lib/splitEngine'

type Log = {
  id: string; user_id: string | null; action_type: string; message: string
  amount: number | null; created_at: string
}

const tint: Record<string, string> = {
  expense_added: 'bg-lavender',
  payment_marked: 'bg-pending/20',
  payment_confirmed: 'bg-ok/15',
  member_joined: 'bg-surface',
}

export default function ActivityPage() {
  const { roomId } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: logs } = useQuery({
    queryKey: ['activity', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs').select('id, user_id, action_type, message, amount, created_at')
        .eq('room_id', roomId!).order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data as Log[]
    },
  })

  useEffect(() => {
    if (!roomId) return
    const ch = supabase.channel(`activity-${roomId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `room_id=eq.${roomId}` },
        () => qc.invalidateQueries({ queryKey: ['activity', roomId] }))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [roomId, qc])

  return (
    <div className="mx-auto max-w-md space-y-3 p-5 pb-20">
      <Link to={`/rooms/${roomId}`} className="text-sm text-muted">← Back</Link>
      <h1 className="text-2xl font-extrabold">Activity</h1>
      {logs?.length === 0 && <p className="text-muted">Nothing yet.</p>}
      {logs?.map((l) => {
        const mine = l.user_id === user?.id
        return (
          <div key={l.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-3xl px-4 py-3 ${tint[l.action_type] ?? 'bg-surface'}`}>
              <p className="text-sm font-semibold">{l.message}</p>
              {l.amount != null && <p className="font-extrabold">{formatINR(l.amount)}</p>}
              <p className="mt-1 text-[11px] text-muted">
                {new Date(l.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}