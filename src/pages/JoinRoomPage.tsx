import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

type Preview = { name: string; room_type: string; member_count: number }

export default function JoinRoomPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')

  async function lookup() {
    setError(''); setPreview(null)
    const { data, error } = await supabase.rpc('preview_room', { p_code: code })
    if (error) return setError(error.message)
    if (!data?.length) return setError('No active room with that code')
    setPreview(data[0])
  }

  async function join() {
    const { data, error } = await supabase.rpc('join_room', { p_code: code })
    if (error) return setError(error.message)
    qc.invalidateQueries({ queryKey: ['rooms'] })
    nav(`/rooms/${data}`)
  }

  return (
    <div className="mx-auto max-w-md p-5">
      <div className="space-y-3 rounded-3xl bg-white p-6 shadow">
        <h1 className="text-2xl font-extrabold">Join a room</h1>
        <input className="w-full rounded-2xl bg-lavender/60 px-4 py-3 uppercase tracking-widest outline-none focus:ring-2 focus:ring-brand"
          placeholder="Room code" value={code} onChange={(e) => setCode(e.target.value)} />
        {!preview && (
          <button onClick={lookup} className="w-full rounded-full bg-brand py-3 font-bold text-white">Find room</button>
        )}
        {preview && (
          <div className="space-y-3 rounded-2xl bg-lavender p-4">
            <p className="text-lg font-extrabold">{preview.name}</p>
            <p className="text-sm capitalize text-muted">{preview.room_type} · {preview.member_count} members</p>
            <p className="text-xs text-muted">Joining doesn't add you to any past expenses.</p>
            <button onClick={join} className="w-full rounded-full bg-brand py-3 font-bold text-white">Join room</button>
          </div>
        )}
        {error && <p className="text-sm text-owed">{error}</p>}
      </div>
    </div>
  )
}