import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setErrore(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErrore(error.message)
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔑</div>
          <h1>Gestione Licenze</h1>
          <p>Toolkit Rischio 360° — area riservata</p>
        </div>
        {errore && <div className="alert alert-error">{errore}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tuaemail@esempio.it" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={loading}>
            {loading ? 'Accesso in corso...' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}
