// Alert delivery: sound, browser toast (via store), optional webhook/Telegram.
import { create } from 'zustand'

let audioCtx = null
export function beep(freq = 880, ms = 160) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator(), g = audioCtx.createGain()
    o.type = 'sine'; o.frequency.value = freq
    o.connect(g); g.connect(audioCtx.destination)
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000)
    o.start(); o.stop(audioCtx.currentTime + ms / 1000)
  } catch { /* autoplay blocked until user interacts */ }
}

export const useAlertStore = create((set, get) => ({
  toasts: [],
  config: { sound: true, soundMinGrade: 'A+', webhook: '', telegramToken: '', telegramChat: '' },
  setConfig(patch) { set(s => ({ config: { ...s.config, ...patch } })) },

  // price-level alerts (the price-scale + button)
  priceAlerts: [],
  addPriceAlert(symbol, price) {
    const id = `pa-${symbol}-${Math.round(price * 100)}-${get().priceAlerts.length}`
    set(s => ({ priceAlerts: [...s.priceAlerts, { id, symbol, price }] }))
    get().push({ grade: 'A', title: `🔔 Alert set · ${symbol}`, body: `Will alert when ${symbol} crosses ${price}` })
    return id
  },
  removePriceAlert(id) { set(s => ({ priceAlerts: s.priceAlerts.filter(a => a.id !== id) })) },
  checkPrice(symbol, prev, price) {
    if (prev == null || price == null) return
    for (const a of get().priceAlerts) {
      if (a.symbol !== symbol) continue
      if ((prev < a.price && price >= a.price) || (prev > a.price && price <= a.price)) {
        get().push({ grade: 'A+', title: `🔔 ${symbol} crossed ${a.price}`, body: `Price alert hit: ${symbol} @ ${price}` })
        beep(660); get().removePriceAlert(a.id)
      }
    }
  },

  push(toast) {
    const id = `${toast.time || ''}-${Math.round(performance.now())}-${get().toasts.length}`
    set(s => ({ toasts: [{ id, ...toast }, ...s.toasts].slice(0, 6) }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 8000)
  },
  dismiss(id) { set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })) },

  // fire alerts for newly-detected signals
  fire(signals) {
    const { config } = get()
    const order = { 'A++': 5, 'A+': 4, 'A': 3, 'B': 2, 'C': 1 }
    for (const s of signals) {
      get().push({ grade: s.grade, title: `${s.grade} ${s.direction} · ${s.strategy}`, body: s.reason, time: s.time })
      if (config.sound && order[s.grade] >= order[config.soundMinGrade]) beep(s.direction === 'LONG' ? 880 : 440)
      if (config.webhook) sendWebhook(config.webhook, s)
      if (config.telegramToken && config.telegramChat) sendTelegram(config, s)
    }
  },
}))

function sendWebhook(url, signal) {
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(signal) }).catch(() => {})
}
function sendTelegram(cfg, s) {
  const text = `🔥 ${s.grade} ${s.direction}\n${s.strategy}\n${s.reason}`
  fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: cfg.telegramChat, text }),
  }).catch(() => {})
}
