import { reactive } from 'vue'

const pdpUrl = import.meta.env.VITE_PDP_URL.replace(/\/+$/, '')
const LOGIN_REDIRECT_KEY = 'security-baseline-login-redirect'
const SESSION_LOST_MESSAGE =
  'Tu sesión se perdió por inactividad o vencimiento. Vuelve a conectar para continuar.'
const RECOVERY_BLOCKED_MESSAGE =
  'El inicio de sesión no restableció el acceso a MessageUcoLab. Puedes volver a autenticarte; si el problema continúa, solicita revisar la integración con seguridad.'

export const sessionRecovery = reactive({
  status: 'idle',
  message: ''
})

function readLoginAttempt() {
  const stored = sessionStorage.getItem(LOGIN_REDIRECT_KEY)
  if (!stored) return null
  // Conserva el bloqueo de una redirección iniciada por la versión anterior.
  if (stored === 'pending') return { confirmed: false }
  const attempt = JSON.parse(stored)
  if (typeof attempt?.confirmed !== 'boolean') {
    throw new Error('El estado de recuperación de sesión no es válido.')
  }
  return attempt
}

function restoreLoginFragment() {
  try {
    const attempt = readLoginAttempt()
    if (typeof attempt?.returnHash !== 'string'
        || !attempt.returnHash.startsWith('#')
        || attempt.returnTo !== window.location.href
        || window.location.hash) return

    const returnUrl = new URL(window.location.href)
    returnUrl.hash = attempt.returnHash
    window.history.replaceState(window.history.state, '', returnUrl.href)
    sessionStorage.setItem(LOGIN_REDIRECT_KEY, JSON.stringify({ confirmed: attempt.confirmed }))
  } catch {
    // Recuperar la pestaña es opcional; no debe impedir el acceso autenticado.
  }
}

function blockRecovery(message = RECOVERY_BLOCKED_MESSAGE) {
  sessionRecovery.status = 'blocked'
  sessionRecovery.message = message
  return false
}

// Solo se invoca desde el botón de reconexión; nunca al recibir un 401.
export function redirectToLogin() {
  if (sessionRecovery.status === 'redirecting') return false

  // El PDP admite el origen y la ruta de retorno, pero rechaza fragmentos (#...).
  const returnUrl = new URL(window.location.href)
  const returnHash = returnUrl.hash
  returnUrl.hash = ''

  try {
    sessionStorage.setItem(LOGIN_REDIRECT_KEY, JSON.stringify({
      confirmed: false,
      returnTo: returnUrl.href,
      returnHash
    }))
  } catch {
    // La navegación es manual y no crea bucles aunque sessionStorage no esté disponible.
  }

  sessionRecovery.status = 'redirecting'
  sessionRecovery.message = 'Restableciendo el acceso mediante el inicio de sesión central…'
  const returnTo = encodeURIComponent(returnUrl.href)
  try {
    window.location.assign(
      `${pdpUrl}/oauth2/authorization/keycloak?return_to=${returnTo}`
    )
  } catch {
    return blockRecovery('No se pudo abrir el inicio de sesión central. Pulsa Volver a Conectar para intentarlo nuevamente.')
  }
  return false
}

export function recoverUnauthorized() {
  if (sessionRecovery.status === 'blocked' || sessionRecovery.status === 'redirecting') {
    return Promise.resolve(false)
  }
  let message = SESSION_LOST_MESSAGE
  try {
    if (readLoginAttempt()?.confirmed === false) message = RECOVERY_BLOCKED_MESSAGE
  } catch {
    // Un estado local ilegible no impide mostrar el aviso y reconectar manualmente.
  }
  blockRecovery(message)
  return Promise.resolve(false)
}

export function confirmProtectedAccess() {
  // Un éxito tardío de otra petición no cancela una recuperación ya iniciada.
  if (sessionRecovery.status !== 'idle') return
  try {
    const attempt = readLoginAttempt()
    if (attempt && !attempt.confirmed) {
      sessionStorage.setItem(LOGIN_REDIRECT_KEY, JSON.stringify({ ...attempt, confirmed: true }))
    }
  } catch {
    // La lectura de negocio no depende de que el navegador permita sessionStorage.
  }
}

export async function requireSession() {
  const response = await fetch(`${pdpUrl}/api/v1/session`, {
    credentials: 'include',
    cache: 'no-store'
  })

  if (response.status === 401) {
    return recoverUnauthorized()
  }

  if (!response.ok) {
    throw new Error('No fue posible consultar la sesión.')
  }

  // /session confirma al BFF, no la vigencia de la credencial frente al PEP.
  // El guard solo se confirma después de una lectura protegida exitosa.
  const session = await response.json()
  restoreLoginFragment()
  return session
}
