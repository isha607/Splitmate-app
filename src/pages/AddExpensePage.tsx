import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatINR, rupeesToPaise, splitEqual } from '../lib/splitEngine'

type Member = { user_id: string; profiles: { full_name: string } | null }

const CATEGORIES = ['food', 'groceries', 'transport', 'accommodation', 'shopping',
  'entertainment', 'bills', 'medical', 'other']

export default function AddExpensePage() {
  const { roomId } = useParams()
  const { user } = useAuth()
  const nav = useNavigate()
  const qc = useQueryClient()

  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('food')
  const [paidBy, setPaidBy] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
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

  const name = (m: Member) => m.profiles?.full_name ?? 'Member'
  const selected = (members ?? []).filter((m) => !excluded.has(m.user_id))
  const totalPaise = Math.round((parseFloat(amount) || 0) * 100)
  const payer = paidBy || user?.id || ''

  const shares = useMemo(() => {
    if (totalPaise <= 0 || selected.length === 0) return null
    try { return splitEqual(totalPaise, selected.map((m) => m.user_id)) } catch { return null }
  }, [totalPaise, selected.length, excluded]) // eslint-disable-line

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!shares) return setError('Enter an amount and select at least one person')
    setBusy(true)
    const { error } = await supabase.rpc('create_expense', {
      p_room: roomId,
      p_title: title,
      p_description: null,
      p_total: rupeesToPaise(parseFloat(amount)),
      p_category: category,
      p_paid_by: payer,
      p_split_method: 'equal',
      p_shares: shares.map((s) => ({ user_id: s.id, amount: s.amount })),
    })
    setBusy(false)
    if (error) return setError(error.message)
    qc.invalidateQueries({ queryKey: ['expenses', roomId] })
    nav(`/rooms/${roomId}`)
  }

  const input = 'w-full rounded-2xl bg-lavender/60 px-4 py-3 outline-none focus:ring-2 focus:ring-brand'

  return (
    <div className="mx-auto max-w-md space-y-4 p-5 pb-28">
      <Link to={`/rooms/${roomId}`} className="text-sm text-muted">← Back</Link>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-6 shadow">
        <h1 className="text-2xl font-extrabold">Add expense</h1>

        <input className={input} placeholder="What was it for? (e.g. Dinner)" value={title}
          onChange={(e) => setTitle(e.target.value)} required maxLength={100} />
        <input className={input} placeholder="Amount in ₹" inputMode="decimal" value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} required />

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button type="button" key={c} onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize ${
                category === c ? 'bg-brand text-white' : 'bg-lavender text-brand'}`}>{c}</button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-muted">Paid by</label>
          <select className={input} value={payer} onChange={(e) => setPaidBy(e.target.value)}>
            {members?.map((m) => <option key={m.user_id} value={m.user_id}>{name(m)}</option>)}
          </select>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">Who shared this?</p>
            <p className="text-sm font-semibold text-brand">
              {selected.length} of {members?.length ?? 0} selected
            </p>
          </div>
          <div className="space-y-2">
            {members?.map((m) => {
              const on = !excluded.has(m.user_id)
              const share = shares?.find((s) => s.id === m.user_id)
              return (
                <button type="button" key={m.user_id} onClick={() => toggle(m.user_id)}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ${
                    on ? 'bg-lavender ring-2 ring-brand' : 'bg-surface opacity-60'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md border-2 text-sm font-bold ${
                    on ? 'border-brand bg-brand text-white' : 'border-muted'}`}>{on ? '✓' : ''}</span>
                  <span className="font-semibold">{name(m)}</span>
                  <span className="ml-auto font-bold">
                    {share ? formatINR(share.amount) : 'Not included'}
                  </span>
                </button>
              )
            })}
          </div>
          {shares && (
            <p className="mt-2 text-xs text-muted">
              Total {formatINR(totalPaise)} split equally. Any leftover paise is added to the first
              people so the shares add up exactly.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-owed">{error}</p>}
        <button disabled={busy || !shares}
          className="w-full rounded-full bg-brand py-3 font-bold text-white disabled:opacity-50">
          {busy ? 'Saving...' : 'Save expense'}
        </button>
      </form>
    </div>
  )
}