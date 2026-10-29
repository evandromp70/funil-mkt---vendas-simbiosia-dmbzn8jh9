import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'

// SPEC-2-006 (F2-T15): painel interno e métricas de TESTE — CA-2-006-02/03.
//
// O QUE ESTA TELA PRECISA DEIXAR CLARO, ou o número mente:
//   - É DEMONSTRAÇÃO. Não é resultado de mercado. A tela diz isso, não só o código.
//   - Quando não há definição de oportunidade aprovada, mostra NÃO CONFIGURADA e NÃO mostra 0.
//     Zero seria uma afirmação: "nenhuma oportunidade". A verdade é "não sei".
//   - Quando não há custo registrado, mostra NÃO DISPONÍVEL. Custo zero seria mentira.
//   - O ambiente é do servidor. Não existe botão para "ver mercado" — não há mercado ainda.
type Contagens = {
  leads: number
  respostas: number
  passagens: number
  passagens_abertas: number
  oportunidades: number | null
  estado_oportunidade: string
}

type Painel = {
  ambiente: string
  natureza: string
  escopo: string
  filtros: { produto: string; coorte: string; canal: string; dono: string }
  contagens: Contagens
  definicao: { versao: number } | null
  custo: { total: number | null; estado: string; por_oportunidade: number | null }
}

type Definicao = {
  estado: string
  versao?: number
  resumo?: string
  oportunidades?: number | null
  detalhe?: string
  origem_definicao?: string
}

const COORTES = ['', 'fria', 'rede_evandro', 'inbound', 'clientes']

const rotuloCoorte = (c: string) => {
  if (!c) return 'Todas as coortes'
  if (c === 'rede_evandro') return 'Rede Evandro'
  if (c === 'fria') return 'Fria'
  if (c === 'inbound') return 'Inbound'
  if (c === 'clientes') return 'Clientes'
  return c
}

export default function Metricas() {
  const { user } = useAuth()
  const [painel, setPainel] = useState<Painel | null>(null)
  const [definicao, setDefinicao] = useState<Definicao | null>(null)
  const [coorte, setCoorte] = useState('')
  const [canal, setCanal] = useState('')
  const [dono, setDono] = useState('')
  const [usuarios, setUsuarios] = useState<{ id: string; name: string; email: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const ehAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!ehAdmin) return
    pb.collection('users')
      .getFullList({ sort: 'name', requestKey: null })
      .then((r) => setUsuarios(r as unknown as { id: string; name: string; email: string }[]))
      .catch(() => setUsuarios([]))
  }, [ehAdmin])

  const carregar = async () => {
    setLoading(true)
    setErro('')
    try {
      const qs = []
      if (coorte) qs.push('coorte=' + encodeURIComponent(coorte))
      if (canal) qs.push('canal=' + encodeURIComponent(canal))
      if (dono) qs.push('dono=' + encodeURIComponent(dono))
      const q = qs.length ? '?' + qs.join('&') : ''

      const [p, d] = await Promise.all([
        pb.send('/backend/v1/metrica/painel' + q, { method: 'GET' }),
        pb.send('/backend/v1/metrica/definicao', { method: 'GET' }),
      ])
      setPainel(p as Painel)
      setDefinicao(d as Definicao)
    } catch (e: any) {
      setErro(e?.response?.message || 'Não foi possível carregar as métricas.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v))

  return (
    <div className="space-y-6" data-testid="metricas-page">
      <div>
        <h1 className="text-2xl font-bold text-[#10454f]">Métricas internas</h1>
        <p className="text-sm text-muted-foreground" data-testid="aviso-natureza">
          Demonstração controlada. Estes números são de <strong>ambiente de teste</strong> e não
          representam resultado de mercado.
        </p>
      </div>

      {erro && (
        <div
          className="rounded border border-red-600/40 bg-red-50 p-3 text-sm text-red-800"
          data-testid="erro"
        >
          {erro}
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>
            Você vê apenas o que é seu. Administrador vê todos os responsáveis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="f-coorte" className="text-xs text-muted-foreground">
                Coorte
              </label>
              <select
                id="f-coorte"
                data-testid="filtro-coorte"
                className="mt-1 block w-44 rounded border bg-background p-2 text-sm"
                value={coorte}
                onChange={(e) => setCoorte(e.target.value)}
              >
                {COORTES.map((c) => (
                  <option key={c} value={c}>
                    {rotuloCoorte(c)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="f-canal" className="text-xs text-muted-foreground">
                Canal
              </label>
              <input
                id="f-canal"
                data-testid="filtro-canal"
                className="mt-1 block w-40 rounded border bg-background p-2 text-sm"
                placeholder="email, whatsapp…"
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
              />
            </div>

            {ehAdmin && (
              <div>
                <label htmlFor="f-dono" className="text-xs text-muted-foreground">
                  Responsável
                </label>
                <select
                  id="f-dono"
                  data-testid="filtro-dono"
                  className="mt-1 block w-56 rounded border bg-background p-2 text-sm"
                  value={dono}
                  onChange={(e) => setDono(e.target.value)}
                >
                  <option value="">Todos os responsáveis</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Button onClick={carregar} disabled={loading} data-testid="aplicar-filtros">
              {loading ? 'Carregando…' : 'Aplicar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Definição de oportunidade */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Definição de oportunidade qualificada</CardTitle>
        </CardHeader>
        <CardContent>
          {definicao?.estado === 'configurada' ? (
            <div className="space-y-1 text-sm" data-testid="definicao-configurada">
              <Badge data-testid="definicao-versao">versão {definicao.versao}</Badge>
              <p className="text-muted-foreground">{definicao.resumo || 'Sem resumo.'}</p>
              {definicao.origem_definicao && (
                <p className="font-mono text-xs text-muted-foreground">
                  origem: {definicao.origem_definicao}
                </p>
              )}
            </div>
          ) : (
            <div
              className="rounded border border-amber-600/40 bg-amber-50 p-3 text-sm text-amber-900"
              data-testid="definicao-nao-configurada"
            >
              <p className="font-semibold">Não configurada</p>
              <p className="mt-1">
                {definicao?.detalhe ||
                  'Ainda não há definição de oportunidade qualificada aprovada. Enquanto não houver, nenhuma resposta ou passagem é contada como oportunidade.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contagens */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl" data-testid="contagem-leads">
              {num(painel?.contagens.leads)}
            </CardTitle>
            <CardDescription>Leads</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl" data-testid="contagem-respostas">
              {num(painel?.contagens.respostas)}
            </CardTitle>
            <CardDescription>Respostas recebidas</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl" data-testid="contagem-passagens-abertas">
              {num(painel?.contagens.passagens_abertas)}
            </CardTitle>
            <CardDescription>
              Conversas aguardando você
              <span className="block text-xs">de {num(painel?.contagens.passagens)} no total</span>
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            {painel?.contagens.estado_oportunidade === 'configurada' ? (
              <CardTitle className="text-2xl" data-testid="contagem-oportunidades">
                {num(painel?.contagens.oportunidades)}
              </CardTitle>
            ) : (
              <CardTitle
                className="text-base text-amber-700"
                data-testid="oportunidades-nao-configurada"
              >
                não configurada
              </CardTitle>
            )}
            <CardDescription>
              Oportunidades qualificadas
              {painel?.definicao ? ' (v' + painel.definicao.versao + ')' : ''}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Custo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Custos de teste</CardTitle>
          <CardDescription>
            Sem custo registrado o valor não é exibido. Custo zero seria uma informação falsa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {painel?.custo.estado === 'disponivel' ? (
            <div className="flex flex-wrap gap-6 text-sm" data-testid="custo-disponivel">
              <div>
                <p className="text-muted-foreground">Total no período</p>
                <p className="text-lg font-semibold" data-testid="custo-total">
                  {painel.custo.total}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Por oportunidade</p>
                <p className="text-lg font-semibold" data-testid="custo-por-oportunidade">
                  {num(painel.custo.por_oportunidade)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-700" data-testid="custo-nao-disponivel">
              Não disponível — nenhum custo registrado para o ambiente de teste.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground" data-testid="rodape-painel">
        ambiente: {painel?.ambiente || '—'} · natureza: {painel?.natureza || '—'} · escopo:{' '}
        {painel?.escopo || '—'}
      </p>
    </div>
  )
}
