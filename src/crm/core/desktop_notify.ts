// ============================================================
//  NOTIFICACIONES DE ESCRITORIO (Web Notifications API)
//  Avisos del SISTEMA OPERATIVO (centro de notificaciones de Windows)
//  mientras el CRM esté abierto en el navegador — sirven aunque la
//  pestaña esté en segundo plano o el navegador minimizado.
//
//  Límites conocidos:
//   · Requiere HTTPS (o localhost) y permiso explícito del usuario.
//   · Si el navegador está CERRADO no llega nada: para eso harían falta
//     Web Push + Service Worker + un backend que las dispare.
//   · El permiso y la preferencia son POR NAVEGADOR Y EQUIPO (localStorage),
//     no viajan con la cuenta.
// ============================================================
// Ícono del aviso: Windows lo recorta a un CUADRADO, así que se usa el logo
// cuadrado de /public (225×225) y no el apaisado de 1600×900, que salía cortado.
const ICON = `${import.meta.env.BASE_URL}ccracks_logo.png`

const KEY = 'crm_desktop_notif'
const prefKey = (userId?: string) => `${KEY}_${userId ?? ''}`

/** ¿El navegador soporta notificaciones del sistema? */
export const desktopSupported = () => typeof window !== 'undefined' && 'Notification' in window

/** Estado del permiso: 'granted' | 'denied' | 'default' | 'unsupported'. */
export const desktopPermission = (): NotificationPermission | 'unsupported' =>
  desktopSupported() ? Notification.permission : 'unsupported'

/** ¿Están activadas para este usuario en este equipo? (permiso + preferencia). */
export const desktopEnabled = (userId?: string): boolean => {
  if (!desktopSupported() || Notification.permission !== 'granted') return false
  try { return localStorage.getItem(prefKey(userId)) === '1' } catch { return false }
}

/** Guarda la preferencia del usuario (el permiso del navegador es aparte). */
export const setDesktopEnabled = (userId: string | undefined, on: boolean) => {
  try { localStorage.setItem(prefKey(userId), on ? '1' : '0') } catch { /* ignore */ }
}

/** Pide el permiso al navegador. OJO: debe dispararse desde un CLIC del usuario. */
export async function requestDesktopPermission(): Promise<NotificationPermission> {
  if (!desktopSupported()) return 'denied'
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

/** Lanza un aviso del sistema. `tag` evita que se repita el mismo aviso. */
export function desktopNotify(opts: { title: string; body?: string; tag?: string }) {
  if (!desktopSupported() || Notification.permission !== 'granted') return
  try {
    const n = new Notification(opts.title, { body: opts.body, tag: opts.tag, icon: ICON })
    // Al hacer clic, trae al frente la ventana del CRM.
    n.onclick = () => { window.focus(); n.close() }
  } catch { /* ignore */ }
}
