// Cloudflare Pages Function: gives the app a readable free address (<name>.pages.dev).
// Everything — the React build, /api/*, config.json — still comes from our CloudFront distribution on AWS;
// this only forwards requests to it, unchanged, and passes responses (including redirects) back.
export async function onRequest({ request, env }) {
  const url = new URL(request.url)
  const target = new URL(url.pathname + url.search, env.ORIGIN)
  return fetch(new Request(target, request), { redirect: 'manual' })
}
