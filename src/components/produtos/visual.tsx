// Peças visuais compartilhadas da régua: cores das faixas, selo e barra de faixas.
import { Badge } from '@/components/ui/badge'
import type { LimitesFaixa } from '@/services/camposRegua'

export const COR_FAIXA: Record<string, string> = {
  A: 'border-emerald-200 bg-emerald-100 text-emerald-800',
  B: 'border-sky-200 bg-sky-100 text-sky-800',
  C: 'border-amber-200 bg-amber-100 text-amber-800',
  D: 'border-slate-200 bg-slate-100 text-slate-700',
}

export const COR_BARRA_FAIXA: Record<string, string> = {
  A: 'bg-emerald-500',
  B: 'bg-sky-500',
  C: 'bg-amber-500',
  D: 'bg-slate-400',
}

// Uma cor por critério, para ligar a linha à barra de distribuição.
export const CORES_CRITERIO = [
  'bg-indigo-500',
  'bg-teal-500',
  'bg-fuchsia-500',
  'bg-orange-500',
  'bg-lime-600',
  'bg-cyan-600',
  'bg-rose-500',
  'bg-violet-500',
]

export function BadgeFaixa({ faixa, className }: { faixa: string | null; className?: string }) {
  if (!faixa)
    return (
      <Badge variant="secondary" className={className}>
        Sem faixa
      </Badge>
    )
  return (
    <Badge variant="outline" className={`${COR_FAIXA[faixa] ?? ''} ${className ?? ''}`}>
      Faixa {faixa}
    </Badge>
  )
}

const pct = (n: number) => `${Math.max(0, Math.min(100, n))}%`

// Régua de 0 a 100 com as quatro faixas coloridas, proporcionais aos limites.
export function BarraFaixas({
  limites,
  marcador,
}: {
  limites: LimitesFaixa
  marcador?: number | null
}) {
  const trechos: Array<{ letra: string; largura: number }> = [
    { letra: 'D', largura: limites.C },
    { letra: 'C', largura: limites.B - limites.C },
    { letra: 'B', largura: limites.A - limites.B },
    { letra: 'A', largura: 100 - limites.A },
  ]
  return (
    <div className="relative">
      <div className="flex h-8 w-full overflow-hidden rounded-lg text-xs font-semibold text-white">
        {trechos.map((t) => (
          <div
            key={t.letra}
            className={`flex items-center justify-center ${COR_BARRA_FAIXA[t.letra]}`}
            style={{ width: pct(t.largura) }}
          >
            {t.largura >= 8 ? t.letra : ''}
          </div>
        ))}
      </div>
      {marcador !== undefined && marcador !== null && (
        <div
          className="pointer-events-none absolute -top-1 bottom-[-4px] w-0.5 bg-foreground"
          style={{ left: pct(marcador) }}
        />
      )}
    </div>
  )
}
