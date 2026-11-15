import { getIdToken } from './auth'

export type MascotId = 'popcorn' | 'reel' | 'clapper' | 'ticket' | 'soda' | 'star'
export const MASCOTS: MascotId[] = ['popcorn', 'reel', 'clapper', 'ticket', 'soda', 'star']

export type Profile = { id: string; name: string; email?: string; picture?: string | null; mascot: MascotId }

export type MovieSummary = {
  id: number
  title: string
  originalTitle: string
  year: number | null
  genreIds: number[]
  genres: string[]
  rating: number
  votes: number
  popularity: number
  poster: string | null
  backdrop: string | null
  overview: string
}

export type MovieCard = MovieSummary & {
  runtime: number | null
  tagline: string
  director: string | null
  cast: string[]
  reasons?: string[]
  rewatchBy?: string[]
}

export type LibraryItem = {
  movieId: number
  title: string
  originalTitle?: string
  year: number | null
  poster: string | null
  genreIds: number[]
  genres: string[]
  tmdbRating?: number
  myRating?: number
  rewatch: boolean
  source: 'manual' | 'letterboxd'
  addedAt: string
  watchedAt?: string
}

export type Filters = {
  genres: number[]
  maxRuntime: number | null
  yearFrom: number | null
  yearTo: number | null
  includeRewatch: boolean
}

export type RoomMember = {
  userId: string
  name: string
  picture?: string | null
  mascot: MascotId
  isHost: boolean
  progress: number
  likes: number
  lastVote?: { movieId: number; like: boolean; at: string } | null
}

export type ResultRow = { movieId: number; likes: string[]; dislikes: string[]; rating: number }

export type RoomState = {
  code: string
  status: 'lobby' | 'swiping' | 'done'
  hostId: string
  isHost: boolean
  isMember: boolean
  members: RoomMember[]
  filters: Filters
  round: number
  deckSize: number
  deck?: MovieCard[] | null
  myVotes?: Record<string, boolean>
  matches?: number[]
  results?: ResultRow[]
  everyoneDone?: boolean
  chosen?: MovieCard | null
}

export type Friend = { id: string; name: string; picture?: string | null; mascot: MascotId; roomsTogether: number; lastSeenAt?: string }
export type Genre = { id: number; name: string }
export type ImportResult = { imported: number; notFound: string[]; note?: string }

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const token = await getIdToken()
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && retry) {
    const fresh = await getIdToken(true)
    if (fresh) return request<T>(method, path, body, false)
  }
  if (!res.ok) {
    let message = `Помилка ${res.status}`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') message = data.detail
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export const api = {
  me: () => request<Profile>('GET', '/me'),
  updateMe: (patch: Partial<Pick<Profile, 'name' | 'mascot'>>) => request<Profile>('PATCH', '/me', patch),
  friends: () => request<Friend[]>('GET', '/friends'),

  search: (q: string) => request<MovieSummary[]>('GET', `/movies/search?q=${encodeURIComponent(q)}`),
  movie: (id: number) => request<MovieCard>('GET', `/movies/${id}`),
  genres: () => request<Genre[]>('GET', '/genres'),

  library: () => request<LibraryItem[]>('GET', '/library'),
  addToLibrary: (movieId: number, opts: { rating?: number; rewatch?: boolean } = {}) =>
    request<LibraryItem>('POST', '/library', { movieId, ...opts }),
  patchLibrary: (movieId: number, patch: { rewatch?: boolean; myRating?: number; clearRating?: boolean }) =>
    request<LibraryItem>('PATCH', `/library/${movieId}`, patch),
  removeFromLibrary: (movieId: number) => request<void>('DELETE', `/library/${movieId}`),
  importTitles: (items: { title: string; year?: string | number; rating?: string | number; watchedAt?: string }[]) =>
    request<ImportResult>('POST', '/library/import', { items }),
  importLetterboxd: (username: string) => request<ImportResult>('POST', '/library/letterboxd', { username }),

  createRoom: (filters: Partial<Filters>) => request<RoomState>('POST', '/rooms', { filters }),
  room: (code: string, withDeck = true) => request<RoomState>('GET', `/rooms/${code}?deck=${withDeck ? 1 : 0}`),
  joinRoom: (code: string) => request<RoomState>('POST', `/rooms/${code}/join`),
  setFilters: (code: string, filters: Filters) => request<RoomState>('PUT', `/rooms/${code}/filters`, filters),
  setRoomMascot: (code: string, mascot: MascotId) => request<RoomState>('POST', `/rooms/${code}/mascot`, { mascot }),
  start: (code: string) => request<RoomState>('POST', `/rooms/${code}/start`),
  nextRound: (code: string) => request<RoomState>('POST', `/rooms/${code}/next-round`),
  vote: (code: string, movieId: number, like: boolean) =>
    request<RoomState>('POST', `/rooms/${code}/votes`, { movieId, like }),
  choose: (code: string, movieId: number) => request<RoomState>('POST', `/rooms/${code}/choose`, { movieId }),
}
