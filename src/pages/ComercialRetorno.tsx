import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { baixarFixture, exportarFixture, type FixtureComercial } from '@/services/comercial'

// SPEC-2-005 (F2-T12): retorno comercial local à Fábrica — CA-2-005-01.
//
// Tela de EXPORTAÇÃO. O Funil é a autoridade de primeira abordagem/proteção; aqui o fato
// comercial vira um DOCUMENTO que o operador leva manualmente para o backend TESTE da Fábrica.
// Nada é enviado pela rede entre os apps — é o operador que transporta.
//
// A tela diz isso em texto, não só no código: quem opera precisa saber que não existe
// sincronização automática, senão assume que "já foi" quando ainda não foi.
type Pessoa = { id: string; nome: string; sync_global_id: string }

export default function ComercialRetorno() {
  const [fx, setFx] = useState<FixtureComercial | null>(null)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [pessoaId, setPessoaId] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    pb.collection('pessoas')
      .getFullList({ filter: "ambiente = 'teste'", sort: 'nome', requestKey: null })
      .then((r) => setPessoas(r as unknown as Pessoa[]))
      .catch(() => setPessoas([]))
  }, [])

  const gerar = async () => {
    setLoading(true)
    setErro('')
    setAviso('')
    try {
      const r = await exportarFixture(pessoaId || undefined)
      setFx(r)
      setAviso(
        r.total === 0
          ? 'Nenhum fato comercial para exportar: só entra na fixture quem já tem primeira abordagem confirmada.'
          : 'Fixture montada com ' + r.total + ' evento(s). Nada foi enviado à Fábrica.',
      )
    } catch (e: any) {
      setErro(e?.response?.message || 'Não foi possível montar a fixture.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8" data-testid="comercial-retorno-page">
      <Card>
        <CardHeader>
          <CardTitle>Retorno comercial para a Fábrica</CardTitle>
          <CardDescription>
            A primeira abordagem e a proteção nascem aqui e viajam como documento. **Não há
            sincronização automática**: você baixa o arquivo e aplica no ambiente de teste da
            Fábrica. Nenhum dado atravessa a rede entre os dois sistemas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[280px]">
              <label htmlFor="pessoa-filtro" className="text-xs text-muted-foreground">
                Filtrar por pessoa (opcional — sem filtro, exporta todas as abordagens)
              </label>
              <select
                id="pessoa-filtro"
                data-testid="pessoa-filtro"
                className="mt-1 w-full rounded border bg-background p-2 text-sm"
                value={pessoaId}
                onChange={(e) => setPessoaId(e.target.value)}
              >
                <option value="">Todas as pessoas</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={gerar} disabled={loading} data-testid="gerar-fixture">
              {loading ? 'Montando…' : 'Montar fixture'}
            </Button>
            {fx && fx.total > 0 && (
              <Button
                variant="outline"
                onClick={() => baixarFixture(fx)}
                data-testid="baixar-fixture"
              >
                Baixar arquivo
              </Button>
            )}
          </div>

          {aviso && (
            <div
              className="mb-4 rounded border border-green-600/40 bg-green-50 p-3 text-sm text-green-800"
              data-testid="aviso"
            >
              {aviso}
            </div>
          )}
          {erro && (
            <div
              className="mb-4 rounded border border-red-600/40 bg-red-50 p-3 text-sm text-red-800"
              data-testid="erro"
            >
              {erro}
            </div>
          )}

          {fx && (
            <div data-testid="resultado-fixture">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">origem: {fx.app_origem}</Badge>
                <Badge variant="outline">ambiente: {fx.ambiente}</Badge>
                <Badge data-testid="total-eventos">{fx.total} evento(s)</Badge>
              </div>

              {fx.eventos.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2">Pessoa (identidade global)</th>
                        <th className="py-2">Primeira abordagem</th>
                        <th className="py-2">Proteção</th>
                        <th className="py-2">Revisão</th>
                      </tr>
                    </thead>
                    <tbody data-testid="tabela-eventos">
                      {fx.eventos.map((ev, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-2 font-mono text-xs">{ev.pessoa_global_id}</td>
                          <td className="py-2">
                            {ev.primeira_abordagem_em?.slice(0, 19).replace('T', ' ')}
                          </td>
                          <td className="py-2">
                            {ev.bloqueio_global ? (
                              <Badge variant="destructive">
                                {ev.bloqueio_motivo || 'bloqueado'}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2">{ev.comercial_revisao}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-4 text-xs text-muted-foreground" data-testid="como-aplicar">
                {fx.como_aplicar}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
