import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Registro accessi al portale Pmi 360° di gestori, membri e incaricati d'organo.
// I dati arrivano da funzioni riservate al proprietario (admin_riepilogo_accessi,
// admin_log_accessi): l'app registra un "accesso" all'apertura (al massimo uno
// ogni 30 minuti per utente) e un'"uscita" quando si esce.

const RUOLI = {
  proprietario: { label: 'Proprietario', bg: '#F4ECF7', fg: '#6C3483' },
  gestore:      { label: 'Gestore',      bg: '#EBF4FC', fg: '#2B5FA5' },
  incaricato:   { label: 'Incaricato',   bg: '#FEF5E7', fg: '#B9770E' },
  membro:       { label: 'Membro',       bg: '#EAFAF1', fg: '#1E8449' },
}

const dataOra = (d) => d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function quanto(d) {
  if (!d) return ''
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (min < 60) return `${Math.max(min, 0)} min fa`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} ore fa`
  return `${Math.round(h / 24)} giorni fa`
}

// Browser e sistema leggibili dall'user agent
function dispositivo(ua) {
  if (!ua) return '—'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return [br, os].filter(Boolean).join(' · ') || ua.slice(0, 40)
}

export default function LogAccessi({ onIndietro }) {
  const [utenti, setUtenti] = useState([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState(null)
  const [filtroRuolo, setFiltroRuolo] = useState('')
  const [cerca, setCerca] = useState('')
  const [sel, setSel] = useState(null)          // utente di cui vedere il dettaglio (null = tutti)
  const [eventi, setEventi] = useState([])
  const [giorni, setGiorni] = useState(30)
  const [loadingEventi, setLoadingEventi] = useState(false)

  const carica = useCallback(async () => {
    setLoading(true); setErrore(null)
    const { data, error } = await supabase.rpc('admin_riepilogo_accessi')
    if (error) setErrore(error.message)
    setUtenti(data || [])
    setLoading(false)
  }, [])
  useEffect(() => { carica() }, [carica])

  const caricaEventi = useCallback(async () => {
    setLoadingEventi(true)
    const { data, error } = await supabase.rpc('admin_log_accessi', { p_user: sel?.user_id || null, p_giorni: giorni })
    if (error) setErrore(error.message)
    setEventi(data || [])
    setLoadingEventi(false)
  }, [sel, giorni])
  useEffect(() => { caricaEventi() }, [caricaEventi])

  const q = cerca.trim().toLowerCase()
  const filtrati = utenti.filter(u =>
    (!filtroRuolo || (u.ruoli || []).includes(filtroRuolo)) &&
    (!q || [u.email, u.nome, u.aziende].some(x => (x || '').toLowerCase().includes(q))))

  const attivi7 = utenti.filter(u => u.ultimo_accesso && Date.now() - new Date(u.ultimo_accesso) < 7 * 864e5).length
  const conSessione = utenti.filter(u => Number(u.sessioni_attive) > 0).length

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>📊 Registro accessi</h2>
          <p style={{ color: '#666', fontSize: 13.5 }}>Accessi al portale Pmi 360° di gestori, membri e incaricati d'organo</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => { carica(); caricaEventi() }}>↻ Aggiorna</button>
          <button className="btn" onClick={onIndietro}>← Licenze</button>
        </div>
      </div>

      {errore && <div className="alert alert-error" style={{ marginBottom: 14 }}>{errore}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[['Utenti registrati', utenti.length], ['Attivi negli ultimi 7 giorni', attivi7], ['Con sessione aperta', conSessione]].map(([l, n]) => (
          <div key={l} className="card" style={{ marginBottom: 0, padding: '14px 16px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1A3A5C' }}>{n}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{l}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="form-control" style={{ maxWidth: 280 }} placeholder="Cerca email, nome, azienda…" value={cerca} onChange={e => setCerca(e.target.value)} />
          <select className="form-control" style={{ maxWidth: 200 }} value={filtroRuolo} onChange={e => setFiltroRuolo(e.target.value)}>
            <option value="">Tutti i ruoli</option>
            {Object.entries(RUOLI).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </select>
        </div>
        {loading ? <div className="spinner" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Utente</th><th>Ruoli</th><th>Aziende</th><th>Ultimo accesso</th><th>Accessi 30 gg</th><th>Sessioni</th><th></th>
              </tr></thead>
              <tbody>
                {filtrati.map(u => (
                  <tr key={u.user_id} style={{ background: sel?.user_id === u.user_id ? '#F4F8FC' : undefined }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.email}</div>
                      {u.nome && <div style={{ fontSize: 12, color: '#666' }}>{u.nome}</div>}
                    </td>
                    <td>
                      {(u.ruoli || []).length === 0 ? <span style={{ fontSize: 12, color: '#999' }}>senza ruolo</span> : u.ruoli.map(r => (
                        <span key={r} className="badge" style={{ background: RUOLI[r]?.bg, color: RUOLI[r]?.fg, marginRight: 4 }}>{RUOLI[r]?.label || r}</span>
                      ))}
                      {u.licenza && u.licenza !== 'attivo' && <span className="badge" style={{ background: '#FDEDEC', color: '#C0392B' }}>licenza {u.licenza}</span>}
                    </td>
                    <td style={{ fontSize: 12, color: '#555', maxWidth: 240 }}>{u.aziende || '—'}</td>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                      {u.ultimo_accesso ? <>{dataOra(u.ultimo_accesso)}<div style={{ fontSize: 11, color: '#999' }}>{quanto(u.ultimo_accesso)}</div></> : <span style={{ color: '#999' }}>mai</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{u.accessi_30gg}</td>
                    <td style={{ textAlign: 'center' }}>{Number(u.sessioni_attive) > 0 ? <span title="Sessioni aperte">🟢 {u.sessioni_attive}</span> : '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-sm" onClick={() => setSel(sel?.user_id === u.user_id ? null : u)}>{sel?.user_id === u.user_id ? 'Tutti' : 'Dettaglio'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <strong style={{ flex: 1, color: '#1A3A5C' }}>{sel ? `Eventi di ${sel.email}` : 'Ultimi eventi di tutti gli utenti'}</strong>
          <select className="form-control" style={{ maxWidth: 160 }} value={giorni} onChange={e => setGiorni(Number(e.target.value))}>
            {[7, 30, 90, 365].map(g => <option key={g} value={g}>Ultimi {g} giorni</option>)}
          </select>
          {sel && <button className="btn btn-sm" onClick={() => setSel(null)}>Mostra tutti</button>}
        </div>
        {loadingEventi ? <div className="spinner" /> : eventi.length === 0 ? (
          <div className="empty-state"><p>Nessun evento nel periodo.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data e ora</th>{!sel && <th>Utente</th>}<th>Evento</th><th>Indirizzo IP</th><th>Dispositivo</th></tr></thead>
              <tbody>
                {eventi.map((e, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{dataOra(e.created_at)}</td>
                    {!sel && <td style={{ fontSize: 12.5 }}>{e.email}</td>}
                    <td><span className="badge" style={e.evento === 'uscita' ? { background: '#F2F3F4', color: '#666' } : { background: '#EAFAF1', color: '#1E8449' }}>{e.evento === 'uscita' ? 'Uscita' : 'Accesso'}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{e.ip || '—'}</td>
                    <td style={{ fontSize: 12, color: '#555' }} title={e.user_agent || ''}>{dispositivo(e.user_agent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
          Un accesso viene registrato all'apertura del portale (al massimo uno ogni 30 minuti per utente). Lo storico parte da oggi; gli accessi precedenti sono ricostruiti dalle sessioni ancora aperte.
        </div>
      </div>
    </div>
  )
}
