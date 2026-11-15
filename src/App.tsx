import { Link, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './context/AuthContext'
import AuthPage from './pages/AuthPage'
import CreateRoomPage from './pages/CreateRoomPage'
import JoinRoomPage from './pages/JoinRoomPage'
import RoomPage from './pages/RoomPage'
import AddExpensePage from './pages/AddExpensePage'

function HomePage() {
  return (
    <main className="p-10 text-center">
      <h1 className="mb-6 text-3xl font-bold">Splitmate</h1>
      <nav className="flex justify-center gap-4">
        <Link to="/rooms/new">Create a room</Link>
        <Link to="/rooms/join">Join a room</Link>
      </nav>
    </main>
  )
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="p-10 text-center text-muted">Loading...</div>
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/" element={<Protected><HomePage /></Protected>} />
      <Route path="/rooms/new" element={<Protected><CreateRoomPage /></Protected>} />
      <Route path="/rooms/join" element={<Protected><JoinRoomPage /></Protected>} />
      <Route path="/rooms/:roomId/expense/new" element={<Protected><AddExpensePage /></Protected>} />
      <Route path="/rooms/:roomId" element={<Protected><RoomPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}