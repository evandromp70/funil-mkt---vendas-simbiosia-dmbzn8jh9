import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getLeads, getUsuarios, Lead, Usuario, ETAPA_LABEL } from '@/services/leads'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type DonoStats = {
  user?: Usuario
  total: number
  porEtapa: Record<string, number>
  ganho: number
  perdido: number
  scoreTotal: number
}

export default function Painel() {
  const { user } = useAuth()
  const [leads, setLeads] = useState<Lead[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const ehAdmin = user?.role === 'admin'

  useEffect(() => {
    ;(async () => {
      try {
        const [ls, us] = await Promise.all([getLeads(), getUsuarios()])
        setLeads(ls)
        setUsuarios(us)
        setError('')
      } catch (e) {
        setError('Não foi possível carregar o painel.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const stats = useMemo(() => {
    const map = new Map<string, DonoStats>()
    // inicia com todos os usuários (mesmo sem leads)
    for (const u of usuarios) {
      map.set(u.id, { user: u, total: 0, porEtapa: {}, ganho: 0, perdido: 0, scoreTotal: 0 })
    }
    for (const l of leads) {
      const d = map.get(l.owner) || {
        user: undefined,
        total: 0,
        porEtapa: {},
        ganho: 0,
        perdido: 0,
        scoreTotal: 0,
      }
      d.total++
      d.porEtapa[l.etapa] = (d.porEtapa[l.etapa] || 0) + 1
      if (l.etapa === 'ganho') d.ganho++
      if (l.etapa === 'perdido') d.perdido++
      d.scoreTotal += l.score ?? 0
      map.set(l.owner, d)
    }
    const todos = [...map.values()]
    if (ehAdmin) {
      // admin vê todos, ordenados por total de leads
      return todos.sort((a, b) => b.total - a.total)
    }
    // vendedor vê apenas o próprio
    return todos.filter((d) => d.user?.id === user?.id)
  }, [leads, usuarios, ehAdmin, user?.id])

  const totais = useMemo(() => {
    let total = 0
    let ganho = 0
    for (const d of stats) {
      total += d.total
      ganho += d.ganho
    }
    return { total, ganho }
  }, [stats])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#10454f]">Painel por vendedor</h1>
        <p className="text-muted-foreground">
          {ehAdmin
            ? 'Produtividade de cada membro da equipe: leads por etapa, ganhos e conversão.'
            : 'Seus números no funil de vendas.'}
        </p>
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
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
