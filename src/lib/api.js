import supabase from '../config/supabase'

/**
 * Every AI call goes through the one server endpoint. The browser never sees
 * the Gemini key, and never gets to decide an outcome — it sends intent and
 * the server re-reads the facts from Postgres before grading anything.
 */
export async function ai(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Your session expired. Sign in again.')

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

export async function notify(payload) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Your session expired. Sign in again.')
  const res = await fetch('/api/notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Could not send that notification')
  return body
}
