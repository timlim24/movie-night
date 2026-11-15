// Sign-in with Cognito managed login: OAuth 2.0 authorization code flow + PKCE, no client secret.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getConfig } from './config'

type Tokens = { idToken: string; refreshToken?: string; expiresAt: number }
export type Claims = { sub: string; email?: string; name?: string; picture?: string }

const TOKENS_KEY = 'mn.tokens'
const PKCE_KEY = 'mn.pkce'

const redirectUri = () => `${window.location.origin}/auth/callback`

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  arr.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(len = 64): string {
  return b64url(crypto.getRandomValues(new Uint8Array(len))).slice(0, len)
}

function decode(jwt: string): Claims & { exp: number } {
  const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(part)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  )
  return JSON.parse(json)
}

function readTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null
  }
}

function writeTokens(t: Tokens | null) {
  try {
    if (t) localStorage.setItem(TOKENS_KEY, JSON.stringify(t))
    else localStorage.removeItem(TOKENS_KEY)
  } catch {
    /* private mode: tokens live in memory only */
  }
  memory = t
}

let memory: Tokens | null = readTokens()
let refreshing: Promise<string | null> | null = null

async function tokenRequest(body: Record<string, string>) {
  const { cognitoDomain, clientId } = getConfig()
  const res = await fetch(`${cognitoDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, ...body }),
  })
  if (!res.ok) throw new Error(`token endpoint ${res.status}`)
  return (await res.json()) as { id_token: string; refresh_token?: string; expires_in: number }
}

export async function startLogin(opts: { provider?: 'Google'; signup?: boolean; returnTo?: string } = {}) {
  const { cognitoDomain, clientId } = getConfig()
  const verifier = randomString(64)
  const state = randomString(24)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, returnTo: opts.returnTo ?? '/' }))
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope: 'openid email profile',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  if (opts.provider) params.set('identity_provider', opts.provider)
  const path = opts.signup && !opts.provider ? 'signup' : 'oauth2/authorize'
  window.location.assign(`${cognitoDomain}/${path}?${params}`)
}

export async function finishLogin(search: string): Promise<string> {
  const q = new URLSearchParams(search)
  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || 'null') as
    | { verifier: string; state: string; returnTo: string }
    | null
  if (q.get('error')) throw new Error(q.get('error_description') || q.get('error') || 'login failed')
  if (!saved || q.get('state') !== saved.state || !q.get('code')) throw new Error('Сесія входу застаріла, спробуй ще раз')
  sessionStorage.removeItem(PKCE_KEY)
  const t = await tokenRequest({
    grant_type: 'authorization_code',
    code: q.get('code')!,
    redirect_uri: redirectUri(),
    code_verifier: saved.verifier,
  })
  writeTokens({ idToken: t.id_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 })
  window.dispatchEvent(new Event('mn-auth'))
  return saved.returnTo || '/'
}

export async function getIdToken(force = false): Promise<string | null> {
  const t = memory
  if (!t) return null
  if (!force && t.expiresAt - Date.now() > 60_000) return t.idToken
  if (!t.refreshToken) return null
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken })
    .then((r) => {
      writeTokens({ idToken: r.id_token, refreshToken: t.refreshToken, expiresAt: Date.now() + r.expires_in * 1000 })
      return r.id_token
    })
    .catch(() => {
      writeTokens(null)
      window.dispatchEvent(new Event('mn-auth'))
      return null
    })
    .finally(() => (refreshing = null))
  return refreshing
}

export function logout() {
  const { cognitoDomain, clientId } = getConfig()
  writeTokens(null)
  const params = new URLSearchParams({ client_id: clientId, logout_uri: `${window.location.origin}/` })
  window.location.assign(`${cognitoDomain}/logout?${params}`)
}

type AuthState = { claims: Claims | null; signedIn: boolean }
const AuthContext = createContext<AuthState>({ claims: null, signedIn: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const read = useCallback((): AuthState => {
    const t = memory
    return t ? { claims: decode(t.idToken), signedIn: true } : { claims: null, signedIn: false }
  }, [])
  const [state, setState] = useState<AuthState>(read)
  useEffect(() => {
    const on = () => setState(read())
    window.addEventListener('mn-auth', on)
    return () => window.removeEventListener('mn-auth', on)
  }, [read])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
