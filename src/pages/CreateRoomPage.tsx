import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const TYPES = ['trip', 'groceries', 'flatmates', 'friends', 'family', 'event', 'other']

export default function CreateRoomPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('trip')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    const { data, error } = await supabase.rpc('create_room', {
      p_name: name, p_description: description || null, p_type: type,
    })
    setBusy(false)
    if (error) return setError(error.message)
    qc.invalidateQueries({ queryKey: ['rooms'] })
    nav(`/rooms/${data.id}`)
  }

  const input = 'w-full rounded-2xl bg-lavender/60 px-4 py-3 outline-none focus:ring-2 focus:ring-brand'

  return (
    <div className="mx-auto max-w-md p-5">
      <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white p-6 shadow">
        <h1 className="text-2xl font-extrabold">Create a room</h1>
        <input className={input} placeholder="Room name (e.g. Goa Trip)" value={name}
          onChange={(e) => setName(e.target.value)} required maxLength={60} />
        <input className={input} placeholder="Description (optional)" value={description}
          onChange={(e) => setDescription(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button type="button" key={t} onClick={() => setType(t)}
              className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${
                type === t ? 'bg-brand text-white' : 'bg-lavender text-brand'}`}>
              {t}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-owed">{error}</p>}
        <button disabled={busy} className="w-full rounded-full bg-brand py-3 font-bold text-white disabled:opacity-60">
          {busy ? 'Creating...' : 'Create room'}
        </button>
      </form>
    </div>
  )
}