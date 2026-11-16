import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatINR } from '../lib/splitEngine'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

type Member = { user_id: string; role: string; profiles: { full_name: string } | null }
type Expense = {
  id: string; title: string; total_amount: number; category: string
  paid_by: string; created_at: string
  expense_participants: { user_id: string; allocated_amount: number }[]
}

export default function RoomPage() {
  const { roomId } = useParams()
  const { user } = useAuth()
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
      return data as unknown as Member[]
    },
  })

  const { data: expenses } = useQuery({
    queryKey: ['expenses', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, title, total_amount, category, paid_by, created_at, expense_participants(user_id, allocated_amount)')
        .eq('room_id', roomId!).eq('status', 'active')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as Expense[]
    },
  })
const qc = useQueryClient()
useEffect(() => {
  if (!roomId) return
  const ch = supabase.channel(`room-${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `room_id=eq.${roomId}` },
      () => qc.invalidateQueries({ queryKey: ['expenses', roomId] }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
      () => qc.invalidateQueries({ queryKey: ['members', roomId] }))
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}, [roomId, qc])
  if (!room) return <div className="p-10 text-center text-muted">Loading...</div>

  const nameOf = (id: string) =>
    members?.find((m) => m.user_id === id)?.profiles?.full_name ?? 'Someone'

  function myStatus(e: Expense) {
    const mine = e.expense_participants.find((p) => p.user_id === user?.id)
    if (e.paid_by === user?.id) return { text: `You paid ${formatINR(e.total_amount)}`, cls: 'text-ok' }
    if (mine) return { text: `You owe ${formatINR(mine.allocated_amount)} to ${nameOf(e.paid_by)}`, cls: 'text-owed' }
    return { text: "You're not included", cls: 'text-muted' }
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-5 pb-28">
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
        <h2 className="mb-3 font-bold">Expenses</h2>
        {expenses?.length === 0 && <p className="text-muted">No expenses yet.</p>}
        <div className="space-y-3">
          {expenses?.map((e) => {
            const s = myStatus(e)
            return (
              <div key={e.id} className="rounded-2xl bg-surface p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold">{e.title}</p>
                  <p className="font-extrabold">{formatINR(e.total_amount)}</p>
                </div>
                <p className="text-xs capitalize text-muted">
                  {e.category} · paid by {nameOf(e.paid_by)} · {e.expense_participants.length} sharing
                </p>
                <p className={`mt-1 text-sm font-semibold ${s.cls}`}>{s.text}</p>
              </div>
            )
          })}
        </div>
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
<Link to={`/rooms/${roomId}/settlements`}
  className="block rounded-3xl bg-lavender p-4 text-center font-bold text-brand">
  Settlements: who owes whom →
</Link>
      <Link to={`/rooms/${roomId}/expense/new`}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-brand px-8 py-4 font-bold text-white shadow-xl">
        + Add expense
      </Link>
    </div>
  )
}