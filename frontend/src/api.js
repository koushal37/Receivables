export async function api(path, session, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error || 'Request failed')
  return body
}