import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const STATI = ['attivo', 'sospeso', 'scaduto', 'cessato']

const STATO_STYLE = {
  attivo:  { background: '#D5F5E3', color: '#1E8449' },
  sospeso: { background: '#FEF9E7', color: '#856404' },
  scaduto: { background: '#FDEBD0', color: '#B9770E' },
  cessato: { background: '#FADBD8', color: '#C0392B' },
}

const FORM_VUOTO = {
  ragione_sociale: '', email: '', piano: 'amici', stato: 'attivo',
  max_aziende: 2, incl_rischi: true, incl_procedure: true, incl_governance: true,
  data_scadenza: '', note: '',
}

export default function GestioneLicenze({ onLogout }) {
  const [gestori, setGestori] = useState([])
  const [aziendePerGestore, setAziendePerGestore] = useState({}) // user_id -> [{id,nome}]
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState(null)

  const [modal, setModal] = useState(null) // null | 'nuovo' | {...gestore in modifica}
  const [form, setForm] = useState(FORM_VUOTO)
  const [emailCerca, setEmailCerca] = useState('')
  const [cercaLoading, setCercaLoading] = useState(false)
  const [cercaErrore, setCercaErrore] = useState(null)
  const [utenteTrovato, setUtenteTrovato] = useState(null) // profilo trovato per il nuovo gestore
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErrore(null)
    const [{ data: g, error: eG }, { data: ua }, { data: az }] = await Promise.all([
      supabase.from('gestori').select('*').order('ragione_sociale'),
      supabase.from('utente_aziende').select('utente_id, azienda_id'),
      supabase.from('aziende').select('id, nome'),
    ])
    if (eG) { setErrore(eG.message); setLoading(false); return }
    setGestori(g || [])
    const aziendeById = Object.fromEntries((az || []).map(a => [a.id, a]))
    const mappa = {}
    ;(ua || []).forEach(r => {
      if (!mappa[r.utente_id]) mappa[r.utente_id] = []
      const a = aziendeById[r.azienda_id]
      if (a) mappa[r.utente_id].push(a)
    })
    setAziendePerGestore(mappa)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function apriNuovo() {
    setModal('nuovo'); setForm(FORM_VUOTO)
    setEmailCerca(''); setUtenteTrovato(null); setCercaErrore(null)
  }

  function apriModifica(g) {
    setModal(g)
    setForm({
      ragione_sociale: g.ragione_sociale || '', email: g.email || '',
      piano: g.piano || 'base', stato: g.stato || 'attivo',
      max_aziende: g.max_aziende ?? '', incl_rischi: !!g.incl_rischi,
      incl_procedure: !!g.incl_procedure, incl_governance: !!g.incl_governance,
      data_scadenza: g.data_scadenza || '', note: g.note || '',
    })
  }

  async function cercaUtente() {
    if (!emailCerca.trim()) return
    setCercaLoading(true); setCercaErrore(null); setUtenteTrovato(null)
    const { data, error } = await supabase.from('profili')
      .select('id, nome, email').ilike('email', emailCerca.trim()).maybeSingle()
    setCercaLoading(false)
    if (error) { setCercaErrore(error.message); return }
    if (!data) { setCercaErrore('Nessun utente registrato nel Toolkit con questa email. Deve prima accedere almeno una volta.'); return }
    if (gestori.some(g => g.user_id === data.id)) { setCercaErrore('Questo utente ha già un account gestore.'); return }
    setUtenteTrovato(data)
    setForm(f => ({ ...f, ragione_sociale: data.nome || '', email: data.email || '' }))
  }

  async function salva() {
    setSaving(true); setErrore(null)
    const payload = {
      ragione_sociale: form.ragione_sociale.trim() || null,
      email: form.email.trim() || null,
      piano: form.piano,
      stato: form.stato,
      max_aziende: form.max_aziende === '' ? null : Number(form.max_aziende),
      incl_rischi: form.incl_rischi,
      incl_procedure: form.incl_procedure,
      incl_governance: form.incl_governance,
      data_scadenza: form.data_scadenza || null,
      note: form.note.trim() || null,
    }
    let err
    if (modal === 'nuovo') {
      if (!utenteTrovato) { setSaving(false); return }
      ;({ error: err } = await supabase.from('gestori').insert({ ...payload, user_id: utenteTrovato.id }))
    } else {
      ;({ error: err } = await supabase.from('gestori').update(payload).eq('id', modal.id))
    }
    setSaving(false)
    if (err) { setErrore(err.message); return }
    setModal(null); load()
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>🔑 Gestione Licenze</h2>
          <p style={{ color: '#666', fontSize: 13.5 }}>Toolkit Rischio 360° — area riservata</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={apriNuovo}>+ Nuovo gestore</button>
          <button className="btn" onClick={onLogout}>Esci</button>
        </div>
      </div>

      {errore && <div className="alert alert-error" style={{ marginBottom: 14 }}>{errore}</div>}

      <div className="card">
        {loading ? <div className="spinner" /> : gestori.length === 0 ? (
          <div className="empty-state"><p>Nessun gestore registrato.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ragione sociale</th><th>Email</th><th>Piano</th><th>Stato</th>
                  <th>Aziende</th><th>Moduli</th><th>Scadenza</th><th></th>
                </tr>
              </thead>
              <tbody>
                {gestori.map(g => {
                  const aziende = aziendePerGestore[g.user_id] || []
                  const st = STATO_STYLE[g.stato] || STATO_STYLE.attivo
                  return (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600 }}>{g.ragione_sociale || '—'}</td>
                      <td style={{ fontSize: 12.5, color: '#666' }}>{g.email || '—'}</td>
                      <td>{g.piano || '—'}</td>
                      <td><span className="badge" style={{ background: st.background, color: st.color }}>{g.stato}</span></td>
                      <td style={{ fontSize: 12.5 }} title={aziende.map(a => a.nome).join(', ')}>
                        {aziende.length}{g.max_aziende != null ? ` / ${g.max_aziende}` : ''}
                      </td>
                      <td style={{ fontSize: 11, color: '#666' }}>
                        {[g.incl_rischi && 'Rischi', g.incl_procedure && 'Procedure', g.incl_governance && 'Governance'].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{g.data_scadenza ? new Date(g.data_scadenza).toLocaleDateString('it-IT') : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-sm" onClick={() => apriModifica(g)}>Modifica</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => !saving && setModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{modal === 'nuovo' ? 'Nuovo gestore' : `Modifica: ${modal.ragione_sociale || modal.email}`}</h3>
              <button className="btn btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>

            {modal === 'nuovo' && !utenteTrovato && (
              <div style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Email dell'utente già registrato nel Toolkit</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-control" type="email" value={emailCerca} onChange={e => setEmailCerca(e.target.value)} placeholder="cliente@esempio.it" />
                    <button className="btn btn-primary" onClick={cercaUtente} disabled={cercaLoading}>{cercaLoading ? '…' : 'Cerca'}</button>
                  </div>
                </div>
                {cercaErrore && <div className="alert alert-error">{cercaErrore}</div>}
              </div>
            )}

            {(modal !== 'nuovo' || utenteTrovato) && (
              <>
                <div className="form-group">
                  <label className="form-label">Ragione sociale</label>
                  <input className="form-control" value={form.ragione_sociale} onChange={e => setForm(f => ({ ...f, ragione_sociale: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-control" value={form.email} disabled={modal === 'nuovo'} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Piano</label>
                    <input className="form-control" value={form.piano} onChange={e => setForm(f => ({ ...f, piano: e.target.value }))} placeholder="es. amici, base, pro" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Stato</label>
                    <select className="form-control" value={form.stato} onChange={e => setForm(f => ({ ...f, stato: e.target.value }))}>
                      {STATI.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Limite aziende (vuoto = illimitato)</label>
                    <input className="form-control" type="number" min="0" value={form.max_aziende} onChange={e => setForm(f => ({ ...f, max_aziende: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Scadenza</label>
                    <input className="form-control" type="date" value={form.data_scadenza} onChange={e => setForm(f => ({ ...f, data_scadenza: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Moduli inclusi</label>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[['incl_rischi', 'Rischi'], ['incl_procedure', 'Procedure'], ['incl_governance', 'Governance']].map(([k, l]) => (
                      <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} /> {l}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Note</label>
                  <textarea className="form-control" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                {errore && <div className="alert alert-error">{errore}</div>}
                <div className="modal-footer">
                  <button className="btn" onClick={() => setModal(null)} disabled={saving}>Annulla</button>
                  <button className="btn btn-primary" onClick={salva} disabled={saving}>{saving ? 'Salvataggio...' : 'Salva'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
