import supabase from '../config/supabase'

/** Web Push registration. Silently no-ops when VAPID isn't configured. */

const urlBase64ToUint8Array = (base64) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

export async function enablePush(hunterId) {
  if (!pushSupported()) throw new Error('This browser cannot receive push notifications.')

  const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapid) throw new Error('Push is not configured on this deployment yet.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was declined.')

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing || await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  })

  const json = sub.toJSON()
  await supabase.from('push_subscriptions').upsert({
    hunter_id: hunterId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 250),
  }, { onConflict: 'endpoint' })

  return true
}

export async function disablePush(hunterId) {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  await supabase.from('push_subscriptions').delete().eq('hunter_id', hunterId)
}

/** Immediate local notification — used for in-tab quest deadlines. */
export function localNotify(title, body, severity = 'INFO') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(`[SYSTEM] ${title}`, { body, icon: '/favicon.svg', tag: `sys-${severity}` })
  } catch { /* some browsers require the SW path; ignore */ }
}
