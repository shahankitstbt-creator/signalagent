import { create } from 'zustand'

const KEY = 'protrader.posted'
const loadPosted = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }

export const useContentStore = create((set, get) => ({
  items: [], meta: null, loading: false, error: null,
  posted: loadPosted(),
  async load() {
    set({ loading: true, error: null })
    try {
      const r = await fetch('/content.json?t=' + Date.now())
      if (!r.ok) throw new Error('No content yet — it generates with each scan (npm run scan).')
      const d = await r.json()
      set({ items: d.items || [], meta: d, loading: false })
    } catch (e) { set({ loading: false, error: e.message }) }
  },
  markPosted(id, v) { const posted = { ...get().posted, [id]: v }; localStorage.setItem(KEY, JSON.stringify(posted)); set({ posted }) },
}))

// Full caption string for copy/paste or API posting.
export const fullCaption = (i) => `${i.hook}\n\n${i.body}\n\n${i.hashtags.join(' ')}\n\n${i.disclaimer}`
