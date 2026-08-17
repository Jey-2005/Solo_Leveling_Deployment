import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

/* Remove the pre-bundle splash once React has something to paint. */
const boot = document.getElementById('boot')
if (boot) boot.remove()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

/* Service worker: push delivery and offline shell. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Registration failing should never break the app. */
    })
  })
}
