import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import GestioneLicenze from './pages/GestioneLicenze'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [proprietario, setProprietario] = useState(undefined) // undefined=verifica in corso, true/false=esito

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (!session) setProprietario(undefined)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    supabase.rpc('is_proprietario').then(({ data }) => setProprietario(!!data))
  }, [session])

  async function logout() {
    await supabase.auth.signOut()
  }

  if (session === undefined) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" />
    </div>
  )

  if (!session) return <Login />

  if (proprietario === undefined) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" />
    </div>
  )

  if (!proprietario) return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⛔</div>
        <h2 style={{ marginBottom: 8 }}>Accesso non autorizzato</h2>
        <p style={{ color: '#666', marginBottom: 20 }}>Questo account non ha i permessi per la Gestione Licenze.</p>
        <button className="btn" onClick={logout}>Esci</button>
      </div>
    </div>
  )

  return <GestioneLicenze onLogout={logout} />
}
