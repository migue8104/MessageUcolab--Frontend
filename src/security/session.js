const pdpUrl = import.meta.env.VITE_PDP_URL.replace(/\/+$/, '')
const LOGIN_REDIRECT_KEY = 'security-baseline-login-redirect'

function getLoginRedirectPending() {
  try {
    return sessionStorage.getItem(LOGIN_REDIRECT_KEY) === 'pending'
  } catch {
    return false
  }
}

function setLoginRedirectPending(pending) {
  try {
    if (pending) sessionStorage.setItem(LOGIN_REDIRECT_KEY, 'pending')
    else sessionStorage.removeItem(LOGIN_REDIRECT_KEY)
  } catch {
    // Session storage may be disabled; login flow still works without the loop guard.
  }
}

export function redirectToLogin() {
  const returnTo = encodeURIComponent(window.location.href)
  window.location.assign(
    `${pdpUrl}/oauth2/authorization/keycloak?return_to=${returnTo}`
  )
}

export async function requireSession() {
  const response = await fetch(`${pdpUrl}/api/v1/session`, {
    credentials: 'include'
  })

  if (response.status === 401) {
    if (getLoginRedirectPending()) {
      setLoginRedirectPending(false)
      throw new Error(
        'El login terminó, pero el PDP todavía no reconoce una sesión. Revisa la cookie y la URL de retorno.'
      )
    }

    setLoginRedirectPending(true)
    redirectToLogin()
    return false
  }

  if (!response.ok) {
    throw new Error('No fue posible consultar la sesión.')
  }

  setLoginRedirectPending(false)
  return response.json()
}
