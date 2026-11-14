import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function AuthPage() {
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } =
      mode === 'signup'
        ? await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
          })
        : await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  const input =
    'w-full rounded-2xl bg-lavender/60 px-4 py-3 outline-none focus:ring-2 focus:ring-brand'

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#C9B8F5] to-lavender flex items-center justify-center p-5">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-xl">
        <h1 className="text-3xl font-extrabold text-brand">SplitMate</h1>
        <p className="mt-1 text-muted">Split expenses. Not friendships.</p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === 'signup' && (
            <input
              className={input}
              placeholder="Your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          )}
          <input
            className={input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className={input}
            type="password"
            placeholder="Password (min 6 characters)"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-owed">{error}</p>}
          <button
            disabled={busy}
            className="w-full rounded-full bg-brand py-3 font-bold text-white disabled:opacity-60"
          >
            {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="mt-4 w-full text-sm text-muted"
        >
          {mode === 'login' ? "New here? Create an account" : 'Already have an account? Log in'}
        </button>
      </div>
    </div>
  )
}