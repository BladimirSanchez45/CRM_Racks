// ============================================================
//  LOGIN — autenticación con Supabase Auth
// ============================================================
import * as React from 'react'
import { signIn } from '../../core/api'
import { Icon } from '../../core/icons'
import strakkLogo from '../../../assets/logos/strakk_logo.png'
import strakkLogoBlanco from '../../../assets/logos/strakk_logo_blanco.png'
import nebulaiLogo from '../../../assets/logos/nebulai_logo.png'

export function LoginPage() {
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [show, setShow] = React.useState(false)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Si tiene éxito, el listener de sesión (en data.tsx) hace el LOGIN
      // y carga los datos. Aquí solo manejamos los errores.
      await signIn(email.trim(), password)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (/invalid login credentials/i.test(msg)) setError('Correo o contraseña incorrectos.')
      else if (/email not confirmed/i.test(msg)) setError('Tu cuenta aún no está confirmada. Contacta al administrador.')
      else setError('No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap blueprint">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <img src={strakkLogo} alt="STRAKK CRM" className="brand-logo brand-logo-dark" />
          <img src={strakkLogoBlanco} alt="STRAKK CRM" className="brand-logo brand-logo-light" />
        </div>
        <div className="login-head">
          <h1>Iniciar sesión</h1>
          <p>CC Racks Industriales · Operaciones</p>
        </div>

        {error && <div className="login-error"><Icon name="alert" size={15} /> <span>{error}</span></div>}

        <label className="login-field">
          <span>Correo</span>
          <div className="login-input">
            <Icon name="mail" size={16} />
            <input type="email" value={email} autoFocus autoComplete="username"
              onChange={e => { setEmail(e.target.value); setError('') }} placeholder="tucorreo@ccracks.mx" />
          </div>
        </label>

        <label className="login-field">
          <span>Contraseña</span>
          <div className="login-input">
            <Icon name="lock" size={16} />
            <input type={show ? 'text' : 'password'} value={password} autoComplete="current-password"
              onChange={e => { setPassword(e.target.value); setError('') }} placeholder="••••••••" />
            <button type="button" className="login-eye" onClick={() => setShow(s => !s)} title={show ? 'Ocultar' : 'Mostrar'}>
              <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </div>
        </label>

        <button type="submit" className={'btn btn-primary login-btn' + (loading ? ' opacity-60' : '')} disabled={loading}>
          <Icon name="arrowRight" size={16} /> {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <div className="login-credit">
        <img src={nebulaiLogo} alt="NebulAI" />
      </div>
    </div>
  )
}
