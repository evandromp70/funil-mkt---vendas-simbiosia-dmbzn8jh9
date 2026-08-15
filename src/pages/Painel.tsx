import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import {
  getLeads,
  getUsuarios,
  getMetas,
  saveMeta,
  progressoMetas,
  Lead,
  Usuario,
  Metas,
  ETAPA_LABEL,
} from '@/services/leads'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type DonoStats = {
  user?: Usuario
  total: number
  porEtapa: Record<string, number>
  ganho: number
  perdido: number
  scoreTotal: number
  progresso: Record<string, number>
}

const METAS_KEYS = [
  { key: 'contatos', label: 'Contatos' },
  { key: 'oportunidades', label: 'Oportunidades' },
  { key: 'propostas', label: 'Propostas' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'fechados', label: 'Fechados' },
] as const

type Periodo = 'todos' | '30d' | '90d' | 'ano'

const PERIODO_LABEL: Record<Periodo, string> = {
  todos: 'Todo o período',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  ano: 'Último ano',
}

export default function Painel() {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [metas, setMetas] = useState<Metas[]>([])
  const [periodo, setPeriodo] = useState<Periodo>('todos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editingMeta, setEditingMeta] = useState<string | null>(null)
  const [metaDraft, setMetaDraft] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const ehAdmin = user?.role === 'admin'

  useEffect(() => {
    ;(async () => {
      try {
        const [ls, us, ms] = await Promise.all([getLeads(), getUsuarios(), getMetas()])
        setLeads(ls)
        setUsuarios(us)
        setMetas(ms)
        setError('')
      } catch (e) {
        setError('Não foi possível carregar o painel.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const leadsFiltradosPeriodo = useMemo(() => {
    if (periodo === 'todos') return leads
    const corte = new Date()
    corte.setDate(corte.getDate() - (periodo === '30d' ? 30 : periodo === '90d' ? 90 : 365))
    return leads.filter((l) => new Date(l.created) >= corte)
  }, [leads, periodo])

  const stats = useMemo(() => {
    const map = new Map<string, DonoStats>()
    for (const u of usuarios) {
      map.set(u.id, {
        user: u,
        total: 0,
        porEtapa: {},
        ganho: 0,
        perdido: 0,
        scoreTotal: 0,
        progresso: { contatos: 0, oportunidades: 0, propostas: 0, forecast: 0, fechados: 0 },
      })
    }
    const leadsDono = new Map<string, Lead[]>()
    for (const l of leadsFiltradosPeriodo) {
      const arr = leadsDono.get(l.owner) || []
      arr.push(l)
      leadsDono.set(l.owner, arr)
      const d = map.get(l.owner) || {
        user: undefined,
        total: 0,
        porEtapa: {},
        ganho: 0,
        perdido: 0,
        scoreTotal: 0,
        progresso: { contatos: 0, oportunidades: 0, propostas: 0, forecast: 0, fechados: 0 },
      }
      d.total++
      d.porEtapa[l.etapa] = (d.porEtapa[l.etapa] || 0) + 1
      if (l.etapa === 'ganho') d.ganho++
      if (l.etapa === 'perdido') d.perdido++
      d.scoreTotal += l.score ?? 0
      map.set(l.owner, d)
    }
    for (const [owner, ls] of leadsDono) {
      const d = map.get(owner)
      if (d) d.progresso = progressoMetas(ls)
    }
    const todos = [...map.values()]
    if (ehAdmin) {
      return todos.sort((a, b) => b.total - a.total)
    }
    return todos.filter((d) => d.user?.id === user?.id)
  }, [leadsFiltradosPeriodo, usuarios, ehAdmin, user?.id])

  const totais = useMemo(() => {
    let total = 0
    let ganho = 0
    for (const d of stats) {
      total += d.total
      ganho += d.ganho
    }
    return { total, ganho }
  }, [stats])

  const metaDe = (userId: string) => metas.find((m) => m.user === userId)

  const onEditarMeta = (userId: string) => {
    const m = metaDe(userId)
    setEditingMeta(userId)
    setMetaDraft({
      contatos: m?.contatos ?? 0,
      oportunidades: m?.oportunidades ?? 0,
      propostas: m?.propostas ?? 0,
      forecast: m?.forecast ?? 0,
      fechados: m?.fechados ?? 0,
    })
  }

  const onSalvarMeta = async (userId: string) => {
    setSaving(true)
    setError('')
    try {
      await saveMeta(userId, metaDraft)
      const ms = await getMetas()
      setMetas(ms)
      setEditingMeta(null)
    } catch (e) {
      setError('Não foi possível salvar a meta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#10454f]">Painel por vendedor</h1>
        <p className="text-muted-foreground">
          {ehAdmin
            ? 'Produtividade de cada membro, com metas individuais e progresso por período.'
            : 'Seus números no funil de vendas.'}
        </p>
      </div>

      {/* Filtro por período */}
      <div className="flex flex-wrap items-center gap-3">
        <Label>Período</Label>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PERIODO_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Resumo geral */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{totais.total}</CardTitle>
            <CardDescription>Leads no total</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{totais.ganho}</CardTitle>
            <CardDescription>Ganhos (fechados)</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">
              {totais.total > 0 ? Math.round((totais.ganho / totais.total) * 100) : 0}%
            </CardTitle>
            <CardDescription>Taxa de conversão</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : stats.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum dado disponível. Atribua leads a vendedores para ver o painel.
        </p>
      ) : (
        <div className="space-y-4">
          {stats.map((d) => {
            const nome = d.user?.name || d.user?.email || 'Sem dono'
            const scoreMedio = d.total > 0 ? Math.round(d.scoreTotal / d.total) : 0
            const conversao = d.total > 0 ? Math.round((d.ganho / d.total) * 100) : 0
            const meta = metaDe(d.user?.id || '')
            const editando = editingMeta === d.user?.id
            return (
              <Card key={d.user?.id || 'sem-dono'}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{nome}</CardTitle>
                    <CardDescription>
                      {d.user?.email} ·{' '}
                      <Badge variant={d.user?.role === 'admin' ? 'default' : 'secondary'}>
                        {d.user?.role === 'admin' ? 'Admin' : 'Vendedor'}
                      </Badge>
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[#10454f]">{d.total}</p>
                    <p className="text-xs text-muted-foreground">leads</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2">
                    {Object.entries(ETAPA_LABEL).map(([etapa, label]) => {
                      const qtd = d.porEtapa[etapa] || 0
                      return (
                        <Badge
                          key={etapa}
                          variant={
                            etapa === 'ganho' ? 'default' : qtd > 0 ? 'outline' : 'secondary'
                          }
                          className={qtd > 0 ? '' : 'opacity-40'}
                        >
                          {label}: {qtd}
                        </Badge>
                      )
                    })}
                    <Badge variant="outline">Score médio: {scoreMedio}</Badge>
                    <Badge variant="outline">Conversão: {conversao}%</Badge>
                  </div>

                  {/* Metas individuais */}
                  <div className="mt-4 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[#10454f]">Metas</p>
                      {ehAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            editando
                              ? onSalvarMeta(d.user?.id || '')
                              : onEditarMeta(d.user?.id || '')
                          }
                          disabled={saving}
                        >
                          {editando ? 'Salvar' : 'Editar metas'}
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-5">
                      {METAS_KEYS.map(({ key, label }) => {
                        const alvo = meta?.[key] ?? 0
                        const prog = d.progresso[key] ?? 0
                        const pct = alvo > 0 ? Math.min(100, Math.round((prog / alvo) * 100)) : 0
                        const atingiu = alvo > 0 && prog >= alvo
                        return (
                          <div key={key} className="rounded border p-2 text-center">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            {editando ? (
                              <Input
                                type="number"
                                min={0}
                                className="mt-1 h-8 text-center"
                                value={metaDraft[key] ?? 0}
                                onChange={(e) =>
                                  setMetaDraft((p) => ({ ...p, [key]: Number(e.target.value) }))
                                }
                              />
                            ) : (
                              <p className={`text-lg font-bold ${atingiu ? 'text-green-600' : ''}`}>
                                {prog}
                                {alvo > 0 && (
                                  <span className="text-sm font-normal text-muted-foreground">
                                    {' '}
                                    / {alvo}
                                  </span>
                                )}
                              </p>
                            )}
                            {!editando && alvo > 0 && (
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${atingiu ? 'bg-green-500' : 'bg-[#10454f]'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
