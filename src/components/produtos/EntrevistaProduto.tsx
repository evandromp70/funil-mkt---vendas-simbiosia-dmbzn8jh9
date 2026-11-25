// Entrevista do produto em três blocos, com progresso e resposta sugerida do FAROL 2027.
// A entrevista é o registro das decisões do José; confirmar não ativa produto nem régua.
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { ROTEIRO, avaliarEntrevista } from '@/services/entrevista'
import { ENTREVISTA_FAROL_2027 } from '@/services/camposRegua'
import type { Produto } from '@/services/produtos'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Registro = Record<string, unknown> & { id: string }

const BLOCOS: Array<{ titulo: string; descricao: string; chaves: string[] }> = [
  { titulo: 'Sobre o produto', descricao: 'O que ele resolve e como é vendido.', chaves: ['dor_area', 'abordagem'] },
  { titulo: 'Quem compra', descricao: 'O perfil de quem deve receber este produto.', chaves: ['decisor', 'segmento_porte', 'localizacao'] },
  { titulo: 'Como pontuar', descricao: 'As decisões que viram a régua do produto.', chaves: ['campos_fontes', 'criterios', 'pesos', 'eliminatorias', 'faixas'] },
]

const jsonTolerante = (v: unknown): Record<string, string> => {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as Record<string, string>
    } catch (_) {
      return {}
    }
  }
  return (v as Record<string, string>) ?? {}
}

export default function EntrevistaProduto({
  produto,
  registro,
  aoMudar,
}: {
  produto: Produto
  registro?: Registro
  aoMudar: () => void
}) {
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setRespostas(jsonTolerante(registro?.respostas))
  }, [produto.id, registro?.id, registro?.updated])

  const avaliacao = avaliarEntrevista(respostas)
  const respondidas = ROTEIRO.length - avaliacao.pendencias.length
  const confirmada = registro?.status === 'confirmada'

  const preencherSugestao = () => {
    const novo = { ...respostas }
    for (const [chave, texto] of Object.entries(ENTREVISTA_FAROL_2027)) {
      if (!(novo[chave] ?? '').trim()) novo[chave] = texto
    }
    setRespostas(novo)
    toast({
      title: 'Respostas sugeridas preenchidas',
      description: 'Só onde estava em branco. Revise antes de confirmar.',
    })
  }

  const salvar = async (confirmar: boolean) => {
    setSalvando(true)
    try {
      const corpo: Record<string, unknown> = {
        produto: produto.id,
        roteiro: JSON.stringify(ROTEIRO),
        respostas: JSON.stringify(respostas),
        pendencias: JSON.stringify(avaliacao.pendencias),
        status: confirmar ? 'confirmada' : 'rascunho',
        ambiente: 'teste',
        owner: pb.authStore.record?.id,
      }
      if (registro?.id) await pb.collection('entrevista_produtos').update(registro.id, corpo)
      else await pb.collection('entrevista_produtos').create(corpo)
      toast({
        title: confirmar ? 'Entrevista confirmada' : 'Rascunho salvo',
        description: confirmar
          ? 'O produto e a régua continuam inativos até a aprovação.'
          : `${respondidas} de ${ROTEIRO.length} perguntas respondidas.`,
      })
      aoMudar()
    } catch (e) {
      toast({
        title: 'Não deu certo',
        description: 'Falha na entrevista: ' + String((e as Error).message ?? e),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Entrevista do produto</CardTitle>
            <CardDescription>
              Responda com calma; dá para salvar um rascunho e voltar depois.
            </CardDescription>
          </div>
          {confirmada ? (
            <Badge className="bg-emerald-100 text-emerald-800">
              <Check className="mr-1 h-3 w-3" /> Confirmada
            </Badge>
          ) : (
            <Badge variant="secondary">{registro ? 'Rascunho' : 'Não iniciada'}</Badge>
          )}
        </div>
        <div className="pt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(respondidas / ROTEIRO.length) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {respondidas} de {ROTEIRO.length} perguntas respondidas
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {BLOCOS.map((bloco, n) => (
          <section key={bloco.titulo} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {n + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{bloco.titulo}</p>
                <p className="text-xs text-muted-foreground">{bloco.descricao}</p>
              </div>
            </div>
            {bloco.chaves.map((chave) => {
              const pergunta = ROTEIRO.find((p) => p.chave === chave)
              if (!pergunta) return null
              const feita = (respostas[chave] ?? '').trim() !== ''
              return (
                <div key={chave} className="space-y-1">
                  <Label className="flex items-center gap-1 text-sm">
                    {pergunta.pergunta}
                    {feita && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  </Label>
                  <Textarea
                    rows={2}
                    value={respostas[chave] ?? ''}
                    onChange={(e) => setRespostas({ ...respostas, [chave]: e.target.value })}
                  />
                </div>
              )
            })}
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button variant="outline" size="sm" onClick={preencherSugestao}>
            Preencher com o que o FAROL 2027 já diz
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" disabled={salvando} onClick={() => void salvar(false)}>
              Salvar rascunho
            </Button>
            <Button disabled={salvando || !avaliacao.completa} onClick={() => void salvar(true)}>
              Confirmar entrevista
            </Button>
          </div>
        </div>
        {!avaliacao.completa && (
          <p className="text-xs text-muted-foreground">
            Para confirmar, responda as {ROTEIRO.length} perguntas.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
