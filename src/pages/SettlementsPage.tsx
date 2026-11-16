import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatINR } from '../lib/splitEngine'

type Debt = {
  expense_id: string; debtor_id: string; creditor_id: string
  owed: number; paid: number; remaining: number
}
type Pending = {
  id: string; expense_id: string; payer_id: string; receiver_id: string; amount: number
}
type Member = { user_id: string; profiles: { full_name: string } | null }
type Dialog =
  | { kind: 'pay'; debt: Debt }
  | { kind: 'confirm'; pending: Pending }
  | null

export default function SettlementsPage() {
  const { roomId } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('upi')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { data: members } = useQuery({
    queryKey: ['members', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_members').select('user_id, profiles(full_name)')
        .eq('room_id', roomId!).eq('status', 'active')
      if (error) throw error
      return data as unknown as Member[]
    },
  })

  const { data: expenses } = useQuery({
    queryKey: ['expense-titles', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses').select('id, title').eq('room_id', roomId!)
      if (error) throw error
      return data
    },
  })

  const { data: debts } = useQuery({
    queryKey: ['debts', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_debts').select('*').eq('room_id', roomId!)
      if (error) throw error
      return data as Debt[]
    },
  })

  const { data: pendings } = useQuery({
    queryKey: ['pending', roomId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements').select('id, expense_id, payer_id, receiver_id, amount')
        .eq('room_id', roomId!).eq('status', 'pending')
      if (error) throw error
      return data as Pending[]
    },
  })

  // Realtime: sabke screen pe turant update
  useEffect(() => {
    if (!roomId) return
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['debts', roomId] })
      qc.invalidateQueries({ queryKey: ['pending', roomId] })
      qc.invalidateQueries({ queryKey: ['expense-titles', roomId] })
    }
    const ch = supabase.channel(`settle-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: `room_id=eq.${roomId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `room_id=eq.${roomId}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [roomId, qc])

  const nameOf = (id: string) =>
    id === user?.id ? 'You' : members?.find((m) => m.user_id === id)?.profiles?.full_name ?? 'Someone'
  const titleOf = (id: string) => expenses?.find((e) => e.id === id)?.title ?? 'Expense'
  const pendingFor = (d: Debt) =>
    (pendings ?? []).filter((p) => p.expense_id === d.expense_id && p.payer_id === d.debtor_id)
  const pendingSum = (d: Debt) => pendingFor(d).reduce((s, p) => s + p.amount, 0)

  const status = (d: Debt) =>
    d.remaining === 0 ? 'PAID' : d.paid > 0 ? 'PARTIALLY PAID' : 'PENDING'
  const badge = (s: string) =>
    s === 'PAID' ? 'bg-ok/15 text-ok' : s === 'PARTIALLY PAID' ? 'bg-pending/20 text-pending' : 'bg-owed/15 text-owed'

  const iOwe = (debts ?? []).filter((d) => d.debtor_id === user?.id)
  const owedToMe = (debts ?? []).filter((d) => d.creditor_id === user?.id)
  const totalOwe = iOwe.reduce((s, d) => s + d.remaining, 0)
  const totalOwed = owedToMe.reduce((s, d) => s + d.remaining, 0)

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['debts', roomId] })
    qc.invalidateQueries({ queryKey: ['pending', roomId] })
  }

  async function submitPay() {
    if (dialog?.kind !== 'pay') return
    const paise = Math.round((parseFloat(amount) || 0) * 100)
    setBusy(true); setError('')
    const { error } = await supabase.rpc('create_settlement', {
      p_expense: dialog.debt.expense_id,
      p_payer: dialog.debt.debtor_id,
      p_amount: paise,
      p_method: method,
    })
    setBusy(false)
    if (error) return setError(error.message)
    setDialog(null); refreshAll()
  }

  async function submitConfirm() {
    if (dialog?.kind !== 'confirm') return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('confirm_settlement', { p_id: dialog.pending.id })
    setBusy(false)
    if (error) return setError(error.message)
    setDialog(null); refreshAll()
  }

  const card = 'rounded-2xl bg-surface p-4 space-y-2'

  return (
    <div className="mx-auto max-w-md space-y-4 p-5 pb-20">
      <Link to={`/rooms/${roomId}`} className="text-sm text-muted">← Back</Link>
      <h1 className="text-2xl font-extrabold">Settlements</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-owed/10 p-4">
          <p className="text-xs font-semibold text-owed">You owe</p>
          <p className="text-xl font-extrabold text-owed">{formatINR(totalOwe)}</p>
        </div>
        <div className="rounded-3xl bg-ok/10 p-4">
          <p className="text-xs font-semibold text-ok">You are owed</p>
          <p className="text-xl font-extrabold text-ok">{formatINR(totalOwed)}</p>
        </div>
      </div>

      {/* YOU OWE */}
      <div className="space-y-3 rounded-3xl bg-white p-5 shadow">
        <h2 className="font-bold">You owe</h2>
        {iOwe.length === 0 && <p className="text-sm text-muted">Nothing to pay 🎉</p>}
        {iOwe.map((d) => {
          const s = status(d)
          const waiting = pendingSum(d)
          return (
            <div key={d.expense_id} className={card}>
              <div className="flex items-center justify-between">
                <p className="font-bold">{titleOf(d.expense_id)}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge(s)}`}>{s}</span>
              </div>
              <p className="text-sm text-muted">
                You owe {formatINR(d.owed)} to {nameOf(d.creditor_id)} · Paid {formatINR(d.paid)}
              </p>
              {d.remaining > 0 && (
                <p className="text-sm font-semibold text-owed">{formatINR(d.remaining)} remaining to pay</p>
              )}
              {waiting > 0 && (
                <p className="text-sm font-semibold text-pending">
                  {formatINR(waiting)} waiting for {nameOf(d.creditor_id)} to confirm
                </p>
              )}
              {d.remaining - waiting > 0 && (
                <button
                  onClick={() => { setDialog({ kind: 'pay', debt: d }); setAmount(String((d.remaining - waiting) / 100)); setError('') }}
                  className="w-full rounded-full bg-brand py-2.5 font-bold text-white">
                  Mark as Paid
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* YOU ARE OWED */}
      <div className="space-y-3 rounded-3xl bg-white p-5 shadow">
        <h2 className="font-bold">You are owed</h2>
        {owedToMe.length === 0 && <p className="text-sm text-muted">Nobody owes you yet.</p>}
        {owedToMe.map((d) => {
          const s = status(d)
          const mine = pendingFor(d)
          return (
            <div key={`${d.expense_id}-${d.debtor_id}`} className={card}>
              <div className="flex items-center justify-between">
                <p className="font-bold">{titleOf(d.expense_id)}</p>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge(s)}`}>{s}</span>
              </div>
              <p className="text-sm text-muted">
                {nameOf(d.debtor_id)} owes you {formatINR(d.owed)} · Paid {formatINR(d.paid)}
              </p>
              {d.remaining > 0 && (
                <p className="text-sm font-semibold text-owed">{formatINR(d.remaining)} remaining</p>
              )}
              {mine.map((p) => (
                <button key={p.id}
                  onClick={() => { setDialog({ kind: 'confirm', pending: p }); setError('') }}
                  className="w-full rounded-full bg-ok py-2.5 font-bold text-white">
                  Confirm Received {formatINR(p.amount)}
                </button>
              ))}
            </div>
          )
        })}
      </div>

      {/* DIALOG */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-6">
            {dialog.kind === 'pay' ? (
              <>
                <h3 className="text-lg font-extrabold">Mark as paid</h3>
                <p className="text-sm text-muted">
                  Kitna bheja {nameOf(dialog.debt.creditor_id)} ko? Wo confirm karenge tab balance clear hoga.
                </p>
                <input value={amount} inputMode="decimal"
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="w-full rounded-2xl bg-lavender/60 px-4 py-3 outline-none focus:ring-2 focus:ring-brand" />
                <div className="flex flex-wrap gap-2">
                  {[['upi', 'UPI'], ['bank_transfer', 'Bank'], ['cash', 'Cash'], ['other', 'Other']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setMethod(v)}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${method === v ? 'bg-brand text-white' : 'bg-lavender text-brand'}`}>{l}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-extrabold">Confirm payment</h3>
                <p>Have you received {formatINR(dialog.pending.amount)} from {nameOf(dialog.pending.payer_id)}?</p>
              </>
            )}
            {error && <p className="text-sm text-owed">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDialog(null)} className="rounded-full bg-lavender py-3 font-bold text-brand">Cancel</button>
              <button disabled={busy} onClick={dialog.kind === 'pay' ? submitPay : submitConfirm}
                className="rounded-full bg-brand py-3 font-bold text-white disabled:opacity-60">
                {busy ? '...' : dialog.kind === 'pay' ? 'Send' : 'Yes, Received'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}