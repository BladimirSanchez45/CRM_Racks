// ============================================================
//  LOGIN — autenticación (demo, sin backend)
// ============================================================
import * as React from 'react'
import { useStore } from '../../core/data'
import { Icon } from '../../core/icons'
import strakkLogo from '../../../assets/logos/strakk_logo.png'
import strakkLogoBlanco from '../../../assets/logos/strakk_logo_blanco.png'
import nebulaiLogo from '../../../assets/logos/nebulai_logo.png'

export function LoginPage() {
  const { state, dispatch } = useStore()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [show, setShow] = React.useState(false)
  const [error, setError] = React.useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const user = state.users.find(u => u.email.trim().toLowerCase() === email.trim().toLowerCase() && u.password === password)
    if (!user) { setError('Correo o contraseña incorrectos.'); return }
    if (!user.active) { setError('Este usuario está desactivado. Contacta al administrador.'); return }
    dispatch({ type: 'LOGIN', user })
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

        <button type="submit" className="btn btn-primary login-btn"><Icon name="arrowRight" size={16} /> Entrar</button>

        <div className="login-demo">
          <div className="login-demo-title">Accesos de prueba</div>
          <div className="login-demo-row"><span className="badge-role role-admin">Admin</span> admin@ccracks.mx · admin123</div>
          <div className="login-demo-row"><span className="badge-role role-ventas">Ventas</span> carlos@ccracks.mx · ventas123</div>
        </div>
      </form>

      <div className="login-credit">
        <img src={nebulaiLogo} alt="NebulAI" />
      </div>
    </div>
  )
}
