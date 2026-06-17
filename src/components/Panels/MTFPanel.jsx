import { useEffect, useState } from 'react'
import { useChartStore } from '../../store/chartStore'
import { getHistory } from '../../data/DataManager'
import { scanStrategies } from '../../components/Strategies/strategies'

const TFS = ['15m', '1h', '4h', '1d']
const GRADE_COLOR = { 'A++': 'text-gold', 'A+': 'text-green', 'A': 'text-cyan', 'B': 'text-txt-sec' }

// Top signal grade + direction per timeframe for the active symbol.
export default function MTFPanel() {
  const symbol = useChartStore(s => s.symbol)
  const assetClass = useChartStore(s => s.assetClass)
  const [rows, setRows] = useState({})

  useEffect(() => {
    let alive = true
    setRows({})
    ;(async () => {
      for (const tf of TFS) {
        try {
          const bars = await getHistory(assetClass, symbol, tf, 500)
          const sig = scanStrategies(bars)[0]
          if (!alive) return
          setRows(r => ({ ...r, [tf]: sig ? { grade: sig.grade, dir: sig.direction } : { grade: '—', dir: '' } }))
        } catch { if (alive) setRows(r => ({ ...r, [tf]: { grade: '—', dir: '' } })) }
      }
    })()
    return () => { alive = false }
  }, [symbol, assetClass])

  return (
    <div>
      <div className="text-txt-sec text-xs uppercase tracking-wide mb-1">MTF · {symbol.replace('USDT', '')}</div>
      <table className="w-full mono text-xs">
        <tbody>
          {TFS.map(tf => {
            const r = rows[tf]
            return (
              <tr key={tf} className="border-b border-border/50">
                <td className="py-1 text-txt-sec">{tf}</td>
                <td className={`py-1 text-right font-bold ${GRADE_COLOR[r?.grade] || 'text-txt-muted'}`}>{r ? r.grade : '…'}</td>
                <td className={`py-1 text-right ${r?.dir === 'LONG' ? 'text-green' : r?.dir === 'SHORT' ? 'text-red' : 'text-txt-muted'}`}>{r?.dir || ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
