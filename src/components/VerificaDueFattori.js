import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Verifica in due passaggi (TOTP), obbligatoria per tutti gli utenti. Dopo email e password la sessione e' di
// livello aal1: il database risponde solo a sessioni aal2 (controllo_mfa), quindi prima di ogni altra operazione:
//  - chi non ha ancora un fattore lo attiva (codice QR da inquadrare con un'app di autenticazione);
//  - chi ce l'ha inserisce il codice di 6 cifre.
// Al successo la libreria emette MFA_CHALLENGE_VERIFIED con la sessione aal2 e il portale prosegue.

export async function livelloAccesso() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) return null
  return data?.currentLevel || null
}

const APP = 'Google Authenticator, Microsoft Authenticator, l\'app Password dell\'iPhone o un\'altra app di autenticazione'

export default function VerificaDueFattori({ email, onVerificato, onEsci }) {
  const [stato, setStato] = useState('caricamento') // caricamento | attivazione | codice | errore
  const [fattore, setFattore] = useState(null) // { id, qr, segreto }
  const [codice, setCodice] = useState('')
  const [errore, setErrore] = useState('')
  const [invio, setInvio] = useState(false)
  const [mostraSegreto, setMostraSegreto] = useState(false)
  const campo = useRef(null)

  useEffect(() => {
    let attivo = true
    ;(async () => {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (!attivo) return
      if (error) { setErrore(error.message); setStato('errore'); return }
      const verificato = (data?.totp || []).find((f) => f.status === 'verified')
      if (verificato) {
        setFattore({ id: verificato.id })
        setStato('codice')
        return
      }
      // attivazioni lasciate a meta' in precedenza: si eliminano prima di crearne una nuova
      for (const f of data?.all || []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data: nuovo, error: errEnroll } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Pmi 360° ${new Date().toISOString().slice(0, 10)}` })
      if (!attivo) return
      if (errEnroll) { setErrore(errEnroll.message); setStato('errore'); return }
      setFattore({ id: nuovo.id, qr: nuovo.totp.qr_code, segreto: nuovo.totp.secret })
      setStato('attivazione')
    })()
    return () => { attivo = false }
  }, [])

  useEffect(() => { if (stato === 'codice' || stato === 'attivazione') campo.current?.focus() }, [stato])

  const verifica = async (e) => {
    e?.preventDefault()
    if (!/^\d{6}$/.test(codice)) return
    setInvio(true)
    setErrore('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fattore.id, code: codice })
    setInvio(false)
    if (error) {
      setCodice('')
      setErrore('Codice non valido o scaduto. Controlla che l\'ora del telefono sia corretta e inserisci il codice che vedi adesso nell\'app.')
      campo.current?.focus()
      return
    }
    onVerificato()
  }

  const campoCodice = (
    <form onSubmit={verifica} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
      <input
        ref={campo}
        className="form-control"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="123456"
        aria-label="Codice di 6 cifre"
        value={codice}
        onChange={(e) => setCodice(e.target.value.replace(/\D/g, '').slice(0, 6))}
        style={{ width: 150, fontSize: 22, letterSpacing: 6, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
      />
      <button className="btn btn-primary" type="submit" disabled={codice.length !== 6 || invio}>{invio ? 'Verifica…' : 'Verifica e accedi'}</button>
    </form>
  )

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>{email}</div>
        {stato === 'caricamento' && <div className="spinner" style={{ margin: '24px auto' }} />}

        {stato === 'attivazione' && (
          <>
            <h2 style={{ color: '#1A3A5C', marginBottom: 8 }}>Attiva la verifica in due passaggi</h2>
            <p style={{ color: '#555', fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>
              Per proteggere i dati delle aziende, l'accesso a Pmi 360° richiede, oltre alla password, un codice generato dal tuo telefono. Si fa una volta sola:
            </p>
            <ol style={{ fontSize: 14, color: '#333', lineHeight: 1.6, paddingLeft: 20, marginBottom: 12 }}>
              <li>apri sul telefono {APP};</li>
              <li>aggiungi un nuovo account e inquadra questo codice QR;</li>
              <li>scrivi qui sotto il codice di 6 cifre che compare nell'app.</li>
            </ol>
            <div style={{ textAlign: 'center', margin: '8px 0' }}>
              <img src={fattore.qr} alt="Codice QR da inquadrare con l'app di autenticazione" width={190} height={190} style={{ background: '#fff', padding: 8, borderRadius: 8, border: '1px solid #e3e8ee' }} />
            </div>
            <div style={{ fontSize: 12.5, color: '#666', textAlign: 'center', marginBottom: 8 }}>
              {mostraSegreto ? (
                <>Codice da inserire a mano nell'app: <code style={{ userSelect: 'all', fontSize: 13 }}>{fattore.segreto}</code></>
              ) : (
                <button type="button" className="btn btn-sm" style={{ background: 'none', border: 'none', color: '#2B5FA5', textDecoration: 'underline' }} onClick={() => setMostraSegreto(true)}>
                  Non riesci a inquadrarlo? Mostra il codice da inserire a mano
                </button>
              )}
            </div>
            {campoCodice}
          </>
        )}

        {stato === 'codice' && (
          <>
            <h2 style={{ color: '#1A3A5C', marginBottom: 8 }}>Codice di verifica</h2>
            <p style={{ color: '#555', fontSize: 14, lineHeight: 1.55 }}>Apri l'app di autenticazione sul telefono e scrivi il codice di 6 cifre di Pmi 360°.</p>
            {campoCodice}
            <p style={{ color: '#777', fontSize: 12.5, lineHeight: 1.5, marginTop: 14 }}>
              Hai perso o cambiato il telefono? Chiedi al gestore della tua azienda, o a assistenza@pmi360.it, di azzerare la verifica: al prossimo accesso la riattiverai con il nuovo telefono.
            </p>
          </>
        )}

        {errore && <div className="alert alert-error" style={{ marginTop: 12 }}>{errore}</div>}
        {stato === 'errore' && <p style={{ fontSize: 13, color: '#555' }}>Riprova tra qualche istante. Se il problema continua scrivi ad assistenza@pmi360.it.</p>}

        <div style={{ marginTop: 18, borderTop: '1px solid #eee', paddingTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={onEsci}>Esci</button>
        </div>
      </div>
    </div>
  )
}
