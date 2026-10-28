import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// SPEC-2-003 (F2-T08): tela de contexto e decisão do agente — CA-2-003-03 (CONTEXTO-UI-E2E).
// Mostra APENAS o contexto mínimo que o agente recebe e a decisão determinística.
// A allowlist é validada no servidor: o botão de ação proibida existe para provar a negativa.
type Contexto = {
  pessoa: { id: string; nome: string; coorte: string }
  produto: { id: string; nome: string; playbook: string; tom: string; versao: string } | null
  contexto: { estado: string } | null
  nota: { valor: number; origem: string } | null
  permissao: { exige_aprovacao: boolean; nota_minima: number; politica_versao: number }
  historico: { toques_confirmados: number }
  template_versao: string
}

type Decisao = {
  decisao?: string
  motivo_codigo?: string
  resumo?: string
  acao_permitida?: boolean
  acao_efetiva?: string
}

export default function AgenteContexto() {
  const [pessoas, setPessoas] = useState<{ id: string; nome: string }[]>([])
  const [pessoaId, setPessoaId] = useState('')
  const [ctx, setCtx] = useState<Contexto | null>(null)
  const [decisao, setDecisao] = useState<Decisao | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    pb.collection('pessoas')
      .getFullList({ sort: '-created', perPage: 30 })
      .then((r) => setPessoas(r.map((p: any) => ({ id: p.id, nome: p.nome || p.id }))))
      .catch(() => setErro('Não foi possível carregar as pessoas.'))
  }, [])

  const carregar = async () => {
    if (!pessoaId) return
    setLoading(true)
    setErro('')
    setDecisao(null)
    try {
      const r = await pb.send(
        '/backend/v1/agente/contexto?pessoaId=' + encodeURIComponent(pessoaId),
        { method: 'GET' },
      )
      setCtx(r.contexto)
    } catch (e: any) {
      setErro(e?.response?.message || 'Não foi possível carregar o contexto.')
      setCtx(null)
    } finally {
      setLoading(false)
    }
  }

  const decidir = async (acao: string) => {
    if (!pessoaId) return
    setLoading(true)
    setErro('')
    try {
      const r = await pb.send('/backend/v1/agente/decidir', {
        method: 'POST',
        body: { pessoaId, produtoId: ctx?.produto?.id || '', acao },
      })
      setDecisao(r)
    } catch (e: any) {
      setErro(e?.response?.message || 'Não foi possível decidir.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-4" data-testid="agente-page">
      <Card>
        <CardHeader>
          <CardTitle>Contexto do agente</CardTitle>
          <CardDescription>
            Este é o recorte mínimo que o agente recebe: sem e-mail, telefone ou observações. A
            decisão é determinística — sem modelo de linguagem. Ações fora da allowlist são negadas
            pelo servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[240px]">
              <label className="text-xs font-medium" htmlFor="pessoa-select">
                Pessoa
              </label>
              <select
                id="pessoa-select"
                data-testid="pessoa-select"
                className="mt-1 w-full rounded border p-2 text-sm"
                value={pessoaId}
                onChange={(e) => setPessoaId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={carregar} disabled={!pessoaId || loading} data-testid="carregar">
              Ver contexto
            </Button>
          </div>

          {erro && (
            <div className="rounded border border-red-600/40 bg-red-50 p-3 text-sm text-red-800">
              {erro}
            </div>
          )}

          {ctx && (
            <div className="space-y-3" data-testid="contexto-exibido">
              <div className="flex flex-wrap gap-2">
                <Badge data-testid="ctx-nome">{ctx.pessoa.nome}</Badge>
                <Badge variant="secondary" data-testid="ctx-coorte">
                  coorte: {ctx.pessoa.coorte}
                </Badge>
                <Badge variant="outline" data-testid="ctx-template">
                  template: {ctx.template_versao}
                </Badge>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded border p-3 text-sm" data-testid="ctx-produto">
                  <p className="font-medium">Produto</p>
                  <p>{ctx.produto ? ctx.produto.nome : '— (nenhum)'}</p>
                  {ctx.produto && (
                    <p className="text-xs text-muted-foreground">tom: {ctx.produto.tom || '—'}</p>
                  )}
                </div>
                <div className="rounded border p-3 text-sm" data-testid="ctx-permissao">
                  <p className="font-medium">Permissão</p>
                  <p>exige aprovação: {ctx.permissao.exige_aprovacao ? 'sim' : 'não'}</p>
                  <p className="text-xs text-muted-foreground">
                    política v{ctx.permissao.politica_versao || 0}
                  </p>
                </div>
                <div className="rounded border p-3 text-sm" data-testid="ctx-nota">
                  <p className="font-medium">Nota</p>
                  <p>
                    {ctx.nota ? `${ctx.nota.valor} (origem: ${ctx.nota.origem})` : '— (sem nota)'}
                  </p>
                </div>
                <div className="rounded border p-3 text-sm" data-testid="ctx-historico">
                  <p className="font-medium">Histórico</p>
                  <p>toques confirmados: {ctx.historico.toques_confirmados}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => decidir('propor_toque')}
                  disabled={loading}
                  data-testid="btn-decidir"
                >
                  Decidir: propor toque
                </Button>
                <Button
                  variant="outline"
                  onClick={() => decidir('enviar_email')}
                  disabled={loading}
                  data-testid="btn-acao-proibida"
                >
                  Tentar ação proibida
                </Button>
              </div>

              {decisao && (
                <div
                  className="rounded border border-blue-600/40 bg-blue-50 p-3 text-sm"
                  data-testid="decisao-exibida"
                >
                  <p className="font-medium" data-testid="decisao-valor">
                    decisão: {decisao.decisao}
                  </p>
                  <p data-testid="decisao-motivo">motivo: {decisao.motivo_codigo}</p>
                  <p data-testid="decisao-permitida">
                    ação permitida: {decisao.acao_permitida ? 'sim' : 'NÃO'}
                  </p>
                  <p data-testid="decisao-efetiva">ação efetiva: {decisao.acao_efetiva}</p>
                  <p className="mt-1 text-xs" data-testid="decisao-resumo">
                    {decisao.resumo}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
