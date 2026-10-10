import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import GestioneLicenze from './pages/GestioneLicenze'
import LogAccessi from './pages/LogAccessi'
import VerificaDueFattori, { livelloAccesso } from './components/VerificaDueFattori'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [proprietario, setProprietario] = useState(undefined) // undefined=verifica in corso, true/false=esito
  const [vista, setVista] = useState('licenze') // 'licenze' | 'accessi'
  const [richiedeMfa, setRichiedeMfa] = useState(false) // sessione senza il secondo passaggio (aal1)

  useEffect(() => {
    // Verifica in due passaggi obbligatoria: il database risponde solo a sessioni aal2
    const aggiorna = async (session) => {
      setRichiedeMfa(!!session && (await livelloAccesso()) !== 'aal2')
      setSession(session)
      if (!session) setProprietario(undefined)
    }
    supabase.auth.getSession().then(({ data: { session } }) => aggiorna(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { aggiorna(session) })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || richiedeMfa) return
    supabase.rpc('is_proprietario').then(({ data }) => setProprietario(!!data))
  }, [session, richiedeMfa])

  async function logout() {
    await supabase.auth.signOut()
  }

  if (session === undefined) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" />
    </div>
  )

  if (!session) return <Login />

  if (richiedeMfa) return <VerificaDueFattori email={session.user.email} onVerificato={() => setRichiedeMfa(false)} onEsci={logout} />

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

  if (vista === 'accessi') return <LogAccessi onIndietro={() => setVista('licenze')} />
  return <GestioneLicenze onLogout={logout} onAccessi={() => setVista('accessi')} />
}
