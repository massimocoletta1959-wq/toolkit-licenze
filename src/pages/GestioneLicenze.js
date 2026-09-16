import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const STATI = ['attivo', 'sospeso', 'scaduto', 'cessato']

const STATO_STYLE = {
  attivo:  { background: '#D5F5E3', color: '#1E8449' },
  sospeso: { background: '#FEF9E7', color: '#856404' },
  scaduto: { background: '#FDEBD0', color: '#B9770E' },
  cessato: { background: '#FADBD8', color: '#C0392B' },
}

const EMAIL_VALIDA = e => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test((e || '').trim())

const FORM_VUOTO = {
  ragione_sociale: '', email: '', piano: 'amici', stato: 'attivo',
  max_aziende: 2, incl_rischi: true, incl_procedure: true, incl_governance: true,
  data_scadenza: '', note: '',
}

export default function GestioneLicenze({ onLogout }) {
  const [gestori, setGestori] = useState([])
  const [aziendePerGestore, setAziendePerGestore] = useState({}) // user_id -> [{id,nome,_linkId}]
  const [preassegnazioniPerGestore, setPreassegnazioniPerGestore] = useState({}) // gestore_id -> [{id,nome,_linkId}], per chi non si è ancora registrato
  const [tutteAziende, setTutteAziende] = useState([]) // tutte le aziende esistenti, candidate per l'assegnazione
  const [etichettaAzienda, setEtichettaAzienda] = useState({}) // azienda_id -> nome di chi la ha già (per non assegnarla per errore due volte)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState(null)

  const [modal, setModal] = useState(null) // null | 'nuovo' | {...gestore in modifica}
  const [form, setForm] = useState(FORM_VUOTO)
  const [emailCerca, setEmailCerca] = useState('')
  const [cercaLoading, setCercaLoading] = useState(false)
  const [cercaErrore, setCercaErrore] = useState(null)
  const [utenteTrovato, setUtenteTrovato] = useState(null) // profilo trovato per il nuovo gestore
  const [preRegistrazione, setPreRegistrazione] = useState(false) // email non ancora registrata, si procede comunque
  const [nonTrovato, setNonTrovato] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inviata, setInviata] = useState(false)
  const [rinviando, setRinviando] = useState(null) // id del gestore a cui si sta rinviando l'invito
  const [rinviatoId, setRinviatoId] = useState(null) // id del gestore a cui è appena stato rinviato con successo
  const [aziendaScelta, setAziendaScelta] = useState('') // azienda selezionata nel picker (creazione o assegnazione)
  const [moduliScelta, setModuliScelta] = useState({ rischi: true, procedure: true, governance: true }) // moduli da concedere sulla nuova assegnazione
  const [assegnando, setAssegnando] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErrore(null)
    const [{ data: g, error: eG }, { data: ua }, { data: az }, { data: pre }] = await Promise.all([
      supabase.from('gestori').select('*').order('ragione_sociale'),
      supabase.from('utente_aziende').select('id, utente_id, azienda_id, mod_rischi, mod_procedure, mod_governance'),
      supabase.from('aziende').select('id, nome'),
      supabase.from('gestori_preassegnazioni').select('id, gestore_id, azienda_id, mod_rischi, mod_procedure, mod_governance'),
    ])
    if (eG) { setErrore(eG.message); setLoading(false); return }
    setGestori(g || [])
    setTutteAziende(az || [])
    const aziendeById = Object.fromEntries((az || []).map(a => [a.id, a]))
    const mappa = {}
    ;(ua || []).forEach(r => {
      if (!mappa[r.utente_id]) mappa[r.utente_id] = []
      const a = aziendeById[r.azienda_id]
      if (a) mappa[r.utente_id].push({ id: a.id, nome: a.nome, _linkId: r.id, mod_rischi: r.mod_rischi, mod_procedure: r.mod_procedure, mod_governance: r.mod_governance })
    })
    setAziendePerGestore(mappa)
    // Aziende già assegnate (o pre-assegnate) a un gestore, ma il cui account non è
    // ancora attivo: le teniamo in una tabella separata perché non c'è ancora uno
    // user_id con cui collegarle a utente_aziende.
    const mappaPre = {}
    ;(pre || []).forEach(r => {
      if (!mappaPre[r.gestore_id]) mappaPre[r.gestore_id] = []
      const a = aziendeById[r.azienda_id]
      if (a) mappaPre[r.gestore_id].push({ id: a.id, nome: a.nome, _linkId: r.id, mod_rischi: r.mod_rischi, mod_procedure: r.mod_procedure, mod_governance: r.mod_governance })
    })
    setPreassegnazioniPerGestore(mappaPre)
    // Un'azienda spesso viene prima creata e configurata dallo Studio con il proprio
    // account, e solo dopo assegnata al gestore del cliente: non è quindi "libera" in
    // senso stretto. Qui teniamo solo un'etichetta di chi la ha già, per scegliere con
    // consapevolezza quando la si assegna anche a un altro gestore.
    const gestoreByUserId = Object.fromEntries((g || []).filter(x => x.user_id).map(x => [x.user_id, x.ragione_sociale || x.email || 'gestore']))
    const etichette = {}
    ;(ua || []).forEach(r => {
      const lab = gestoreByUserId[r.utente_id]
      if (lab) etichette[r.azienda_id] = lab
    })
    ;(pre || []).forEach(r => {
      const gg = (g || []).find(x => x.id === r.gestore_id)
      if (gg) etichette[r.azienda_id] = (gg.ragione_sociale || gg.email || 'gestore') + ' (in attesa di registrarsi)'
    })
    setEtichettaAzienda(etichette)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function apriNuovo() {
    setModal('nuovo'); setForm(FORM_VUOTO)
    setEmailCerca(''); setUtenteTrovato(null); setCercaErrore(null)
    setPreRegistrazione(false); setInviata(false); setNonTrovato(false)
    setAziendaScelta(''); setModuliScelta({ rischi: true, procedure: true, governance: true })
  }

  function apriModifica(g) {
    setModal(g)
    setPreRegistrazione(false); setInviata(false); setUtenteTrovato(null); setNonTrovato(false)
    setAziendaScelta('')
    setModuliScelta({ rischi: !!g.incl_rischi, procedure: !!g.incl_procedure, governance: !!g.incl_governance })
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
    setCercaErrore(null); setUtenteTrovato(null); setPreRegistrazione(false); setNonTrovato(false)
    if (!EMAIL_VALIDA(emailCerca)) { setCercaErrore('Indirizzo email non valido: controlla che sia scritto correttamente (es. nome@dominio.it).'); return }
    setCercaLoading(true)
    const { data, error } = await supabase.from('profili')
      .select('id, nome, email').ilike('email', emailCerca.trim()).maybeSingle()
    setCercaLoading(false)
    if (error) { setCercaErrore(error.message); return }
    if (gestori.some(g => (g.email || '').toLowerCase() === emailCerca.trim().toLowerCase())) {
      setCercaErrore('Esiste già un account gestore (attivo o in attesa) con questa email.'); return
    }
    if (!data) {
      setCercaErrore('Nessun utente registrato nel Toolkit con questa email. Puoi comunque pre-registrarlo e invitarlo via email.')
      setNonTrovato(true)
      return
    }
    setUtenteTrovato(data)
    setForm(f => ({ ...f, ragione_sociale: data.nome || '', email: data.email || '' }))
  }

  function preRegistra() {
    setPreRegistrazione(true)
    setForm(f => ({ ...f, email: emailCerca.trim() }))
  }

  async function salva() {
    if (form.email.trim() && !EMAIL_VALIDA(form.email)) {
      setErrore('Indirizzo email non valido: controlla che sia scritto correttamente (es. nome@dominio.it).')
      return
    }
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
    const moduli = { mod_rischi: moduliScelta.rischi, mod_procedure: moduliScelta.procedure, mod_governance: moduliScelta.governance }
    let err
    if (modal === 'nuovo' && utenteTrovato) {
      ;({ error: err } = await supabase.from('gestori').insert({ ...payload, user_id: utenteTrovato.id }))
      if (!err && aziendaScelta) {
        const { error: e2 } = await supabase.from('utente_aziende').insert({ utente_id: utenteTrovato.id, azienda_id: aziendaScelta, ...moduli })
        if (e2) { setErrore('Gestore creato, ma assegnazione azienda non riuscita: ' + e2.message); setSaving(false); load(); return }
      }
    } else if (modal === 'nuovo' && preRegistrazione) {
      const { data: nuovo, error: e1 } = await supabase.from('gestori').insert(payload).select().single() // user_id resta null: verrà collegato alla registrazione
      err = e1
      if (!err && aziendaScelta) {
        const { error: e2 } = await supabase.from('gestori_preassegnazioni').insert({ gestore_id: nuovo.id, azienda_id: aziendaScelta, ...moduli })
        if (e2) { setErrore('Gestore creato, ma assegnazione azienda non riuscita: ' + e2.message); setSaving(false); load(); return }
      }
      if (!err) {
        const { error: eInvito } = await supabase.functions.invoke('invita-gestore', {
          body: { email: payload.email, ragione_sociale: payload.ragione_sociale },
        })
        if (eInvito) { setErrore('Gestore creato, ma invio invito fallito: ' + eInvito.message); setSaving(false); load(); return }
        setInviata(true)
      }
    } else if (modal === 'nuovo') {
      setSaving(false); return
    } else {
      ;({ error: err } = await supabase.from('gestori').update(payload).eq('id', modal.id))
    }
    setSaving(false)
    if (err) { setErrore(err.message); return }
    if (preRegistrazione) return // resta aperto sul messaggio di conferma invio
    setModal(null); load()
  }

  // Assegna un'altra azienda a un gestore già esistente (nella Modifica): se ha già
  // un account collegalo subito in utente_aziende, altrimenti in attesa della sua
  // prima registrazione (gestori_preassegnazioni).
  async function assegnaAzienda() {
    if (!aziendaScelta || modal === 'nuovo') return
    setAssegnando(true); setErrore(null)
    const moduli = { mod_rischi: moduliScelta.rischi, mod_procedure: moduliScelta.procedure, mod_governance: moduliScelta.governance }
    const tabella = modal.user_id ? 'utente_aziende' : 'gestori_preassegnazioni'
    const riga = modal.user_id
      ? { utente_id: modal.user_id, azienda_id: aziendaScelta, ...moduli }
      : { gestore_id: modal.id, azienda_id: aziendaScelta, ...moduli }
    const { error } = await supabase.from(tabella).insert(riga)
    setAssegnando(false)
    if (error) { setErrore(error.message); return }
    setAziendaScelta('')
    load()
  }

  async function rimuoviAssegnazione(a) {
    if (modal === 'nuovo') return
    if (!window.confirm(`Togliere "${a.nome}" a questo gestore?`)) return
    setErrore(null)
    const tabella = modal.user_id ? 'utente_aziende' : 'gestori_preassegnazioni'
    const { error } = await supabase.from(tabella).delete().eq('id', a._linkId)
    if (error) { setErrore(error.message); return }
    load()
  }

  // Cambia al volo un modulo su un'assegnazione già esistente (es. per correggerla
  // dopo che è stata creata con un altro criterio, come nel caso dell'hotel).
  async function aggiornaModuloAssegnazione(a, campo, valore) {
    setErrore(null)
    const tabella = modal.user_id ? 'utente_aziende' : 'gestori_preassegnazioni'
    const { error } = await supabase.from(tabella).update({ [campo]: valore }).eq('id', a._linkId)
    if (error) { setErrore(error.message); return }
    load()
  }

  async function rinviaInvito(g) {
    setRinviando(g.id); setErrore(null)
    const { error } = await supabase.functions.invoke('invita-gestore', {
      body: { email: g.email, ragione_sociale: g.ragione_sociale },
    })
    setRinviando(null)
    if (error) { setErrore('Invio invito fallito: ' + error.message); return }
    setRinviatoId(g.id)
    setTimeout(() => setRinviatoId(null), 4000)
  }

  async function toggleBlocco(g) {
    const nuovoStato = g.stato === 'sospeso' ? 'attivo' : 'sospeso'
    setErrore(null)
    const { error } = await supabase.from('gestori').update({ stato: nuovoStato }).eq('id', g.id)
    if (error) { setErrore(error.message); return }
    load()
  }

  async function eliminaGestore(g) {
    const nome = g.ragione_sociale || g.email || 'questo gestore'
    if (!window.confirm(`Eliminare definitivamente ${nome}?\n\nNon elimina il suo account Toolkit né le sue aziende, ma rimuove la licenza: se aveva già effettuato il login, da questo momento non potrà più accedere. L'operazione non è reversibile.`)) return
    setErrore(null)
    const { error } = await supabase.from('gestori').delete().eq('id', g.id)
    if (error) { setErrore(error.message); return }
    load()
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>🔑 Gestione Licenze</h2>
          <p style={{ color: '#666', fontSize: 13.5 }}>Toolkit Pmi 360° — area riservata</p>
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
                  const aziende = g.user_id ? (aziendePerGestore[g.user_id] || []) : (preassegnazioniPerGestore[g.id] || [])
                  const st = STATO_STYLE[g.stato] || STATO_STYLE.attivo
                  return (
                    <tr key={g.id}>
                      <td style={{ fontWeight: 600 }}>{g.ragione_sociale || '—'}</td>
                      <td style={{ fontSize: 12.5, color: '#666' }}>{g.email || '—'}</td>
                      <td>{g.piano || '—'}</td>
                      <td>
                        <span className="badge" style={{ background: st.background, color: st.color }}>{g.stato}</span>
                        {!g.user_id && <span className="badge" style={{ background: '#EAF2FC', color: '#2B5FA5', marginLeft: 4 }}>in attesa</span>}
                      </td>
                      <td style={{ fontSize: 12.5 }} title={aziende.map(a => a.nome).join(', ')}>
                        {aziende.length}{g.max_aziende != null ? ` / ${g.max_aziende}` : ''}
                      </td>
                      <td style={{ fontSize: 11, color: '#666' }}>
                        {[g.incl_rischi && 'Rischi', g.incl_procedure && 'Procedure', g.incl_governance && 'Governance'].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{g.data_scadenza ? new Date(g.data_scadenza).toLocaleDateString('it-IT') : '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!g.user_id && (
                          <button className="btn btn-sm" onClick={() => rinviaInvito(g)} disabled={rinviando === g.id} style={{ marginRight: 6 }}>
                            {rinviando === g.id ? '…' : rinviatoId === g.id ? '✓ Inviato' : '✉️ Rinvia invito'}
                          </button>
                        )}
                        <button className="btn btn-sm" onClick={() => toggleBlocco(g)} style={{ marginRight: 6 }}>
                          {g.stato === 'sospeso' ? '✓ Riattiva' : '🔒 Blocca'}
                        </button>
                        <button className="btn btn-sm" onClick={() => apriModifica(g)} style={{ marginRight: 6 }}>Modifica</button>
                        <button className="btn btn-sm btn-danger" onClick={() => eliminaGestore(g)}>🗑️ Elimina</button>
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

            {modal === 'nuovo' && !utenteTrovato && !preRegistrazione && (
              <div style={{ marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Email del nuovo gestore</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-control" type="email" value={emailCerca} onChange={e => setEmailCerca(e.target.value)} placeholder="cliente@esempio.it" />
                    <button className="btn btn-primary" onClick={cercaUtente} disabled={cercaLoading}>{cercaLoading ? '…' : 'Cerca'}</button>
                  </div>
                </div>
                {cercaErrore && <div className={`alert alert-${nonTrovato ? 'info' : 'error'}`}>{cercaErrore}</div>}
                {nonTrovato && (
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={preRegistra}>
                    ✉️ Pre-registra questa email e invia invito
                  </button>
                )}
              </div>
            )}

            {inviata && (
              <div className="alert alert-success">
                Invito inviato a <strong>{form.email}</strong>. Il gestore è già pre-configurato: appena si registra con questa email, il suo account verrà collegato automaticamente.
              </div>
            )}

            {!inviata && (modal !== 'nuovo' || utenteTrovato || preRegistrazione) && (
              <>
                <div className="form-group">
                  <label className="form-label">Ragione sociale</label>
                  <input className="form-control" value={form.ragione_sociale} onChange={e => setForm(f => ({ ...f, ragione_sociale: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-control" value={form.email} disabled={modal === 'nuovo'} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                {modal === 'nuovo' && preRegistrazione && (
                  <div className="form-group">
                    <label className="form-label">Azienda già creata da assegnargli (opzionale)</label>
                    <select className="form-control" value={aziendaScelta} onChange={e => setAziendaScelta(e.target.value)}>
                      <option value="">— Nessuna: la creerà lui dal wizard —</option>
                      {tutteAziende.map(a => (
                        <option key={a.id} value={a.id}>{a.nome}{etichettaAzienda[a.id] ? ` — già di: ${etichettaAzienda[a.id]}` : ''}</option>
                      ))}
                    </select>
                    {aziendaScelta && (
                      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                        {[['rischi', 'Rischi'], ['procedure', 'Procedure'], ['governance', 'Governance']].filter(([k]) => form['incl_' + k]).map(([k, l]) => (
                          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, cursor: 'pointer' }}>
                            <input type="checkbox" checked={moduliScelta[k]} onChange={e => setModuliScelta(m => ({ ...m, [k]: e.target.checked }))} /> {l}
                          </label>
                        ))}
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: '#8A94A0', marginTop: 4 }}>
                      Se l'azienda è già stata preparata in anticipo, il gestore la vedrà appena si registra con questa email, senza passare dal wizard. Se gliene servono altre, puoi assegnargliele in seguito da "Modifica".
                    </p>
                  </div>
                )}

                {modal !== 'nuovo' && (() => {
                  const assegnate = modal.user_id ? (aziendePerGestore[modal.user_id] || []) : (preassegnazioniPerGestore[modal.id] || [])
                  const limite = form.max_aziende === '' ? null : Number(form.max_aziende)
                  const limiteRaggiunto = limite != null && assegnate.length >= limite
                  const scelte = new Set(assegnate.map(a => a.id))
                  const disponibili = tutteAziende.filter(a => !scelte.has(a.id))
                  const moduliGestore = [['rischi', 'Rischi', 'mod_rischi'], ['procedure', 'Procedure', 'mod_procedure'], ['governance', 'Governance', 'mod_governance']]
                    .filter(([k]) => form['incl_' + k])
                  return (
                    <div className="form-group">
                      <label className="form-label">Aziende assegnate ({assegnate.length}{limite != null ? ` / ${limite}` : ''})</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                        {assegnate.length === 0 && <div style={{ fontSize: 12.5, color: '#999' }}>Nessuna azienda assegnata.</div>}
                        {assegnate.map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#F7F8FA', borderRadius: 6, flexWrap: 'wrap' }}>
                            <span style={{ flex: '1 0 auto', fontSize: 13 }}>{a.nome}</span>
                            {!modal.user_id && <span className="badge" style={{ background: '#EAF2FC', color: '#2B5FA5', fontSize: 10.5 }}>in attesa di registrazione</span>}
                            {moduliGestore.map(([k, l, campo]) => (
                              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#666', cursor: 'pointer' }}>
                                <input type="checkbox" checked={a[campo] !== false} onChange={e => aggiornaModuloAssegnazione(a, campo, e.target.checked)} /> {l}
                              </label>
                            ))}
                            <button className="btn btn-sm btn-danger" onClick={() => rimuoviAssegnazione(a)} title="Togli">✕</button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select className="form-control" style={{ flex: '1 1 200px' }} value={aziendaScelta} onChange={e => setAziendaScelta(e.target.value)} disabled={limiteRaggiunto}>
                          <option value="">— Scegli un'azienda —</option>
                          {disponibili.map(a => (
                            <option key={a.id} value={a.id}>{a.nome}{etichettaAzienda[a.id] ? ` — già di: ${etichettaAzienda[a.id]}` : ''}</option>
                          ))}
                        </select>
                        {aziendaScelta && moduliGestore.map(([k, l]) => (
                          <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                            <input type="checkbox" checked={moduliScelta[k]} onChange={e => setModuliScelta(m => ({ ...m, [k]: e.target.checked }))} /> {l}
                          </label>
                        ))}
                        <button className="btn btn-sm" onClick={assegnaAzienda} disabled={!aziendaScelta || limiteRaggiunto || assegnando}>
                          {assegnando ? '…' : '+ Assegna'}
                        </button>
                      </div>
                      {limiteRaggiunto && (
                        <p style={{ fontSize: 12, color: '#B9770E', marginTop: 4 }}>
                          Limite di {limite} aziend{limite === 1 ? 'a' : 'e'} raggiunto per questo gestore: aumenta il limite qui sotto per assegnarne altre.
                        </p>
                      )}
                    </div>
                  )
                })()}
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
                  <button className="btn btn-primary" onClick={salva} disabled={saving}>
                    {saving ? 'Salvataggio...' : preRegistrazione ? '✉️ Crea e invia invito' : 'Salva'}
                  </button>
                </div>
              </>
            )}
            {inviata && (
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => setModal(null)}>Chiudi</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
