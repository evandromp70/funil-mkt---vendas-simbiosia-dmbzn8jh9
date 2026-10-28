import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// SPEC-2-004 (F2-T11): fila dos sócios e continuidade humana — CA-2-004-03/04.
//
// O que a tela mostra e por quê:
//   - Passagens AGUARDANDO e ASSUMIDAS, com classificação e resumo factual.
//   - Excedente do teto continua VISÍVEL e marcado: nada desaparece por estar acima do limite.
//   - Sem dono mapeado aparece como "sem responsável" — nunca escolhe sócio por conta própria.
//   - Assumir / Devolver / Encerrar: só com ação humana, e cada uma devolve o que aconteceu.
//   - Reforço explícito na tela: devolver NÃO remove bloqueio e NÃO envia nada.
type Passagem = {
  id: string
  pessoa: string
  produto: string
  canal: string
  classificacao: string
  status: string
  resumo: string
  dono: string
  dono_pendente: boolean
  assumida_por: string
  excedente: boolean
  created: string
}

const rotuloClassificacao = (c: string) => {
  if (c === 'pergunta') return 'Pergunta'
  if (c === 'conversa') return 'Conversa'
  if (c === 'desinteresse') return 'Desinteresse'
  return c || '—'
}

const corDoStatus = (s: string) => {
  if (s === 'assumida') return 'default'
  if (s === 'aguardando') return 'secondary'
  return 'outline'
}

export default function Passagens() {
  const { user } = useAuth()
  const [passagens, setPassagens] = useState<Passagem[]>([])
  const [teto, setTeto] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [salvando, setSalvando] = useState('')
  const [motivo, setMotivo] = useState<Record<string, string>>({})

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb.send('/backend/v1/passagens/fila', { method: 'GET' })
      setPassagens((r.passagens || []) as Passagem[])
      setTeto(Number(r.teto || 0))
      setError('')
    } catch (e) {
      setError('Não foi possível carregar a fila.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const agir = async (rota: string, p: Passagem, corpo: Record<string, unknown>) => {
    setSalvando(p.id)
    setNotice('')
    setError('')
    try {
      const r = await pb.send('/backend/v1/passagens/' + rota, {
        method: 'POST',
        body: { passagemId: p.id, ...corpo },
      })
      if (r.estado === 'no_limite') {
        setNotice(
          'Teto de ' + r.teto + ' passagens ativas atingido. Esta continua aguardando e visível.',
        )
      } else if (r.estado === 'aguardando') {
        setNotice(r.detalhe || 'Devolvida para a fila.')
      } else if (r.estado === 'resolvida') {
        setNotice('Passagem encerrada com o motivo registrado.')
      } else {
        setNotice(r.detalhe || 'Feito: ' + r.estado)
      }
      await carregar()
    } catch (e: any) {
      setError(e?.response?.message || 'Não foi possível concluir a ação.')
    } finally {
      setSalvando('')
    }
  }

  return (
    <div className="container mx-auto py-8" data-testid="passagens-page">
      <Card>
        <CardHeader>
          <CardTitle>Fila de conversas</CardTitle>
          <CardDescription>
            Quem respondeu está aqui até alguém encerrar. Teto de {teto || '—'} conversas ativas por
            responsável: o excedente continua visível e não desaparece. Assumir, devolver ou
            encerrar são atos seus — devolver não remove bloqueio e nada é enviado ao cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notice && (
            <div
              className="mb-4 rounded border border-green-600/40 bg-green-50 p-3 text-sm text-green-800"
              data-testid="aviso"
            >
              {notice}
            </div>
          )}
          {error && (
            <div
              className="mb-4 rounded border border-red-600/40 bg-red-50 p-3 text-sm text-red-800"
              data-testid="erro"
            >
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : passagens.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="vazio">
              Nenhuma conversa aguardando. Bom sinal.
            </p>
          ) : (
            <div className="space-y-4" data-testid="lista-passagens">
              {passagens.map((p) => (
                <div
                  key={p.id}
                  className="rounded border p-4"
                  data-testid={'passagem-' + p.id}
                  data-status={p.status}
                  data-excedente={p.excedente ? 'sim' : 'nao'}
                  data-dono-pendente={p.dono_pendente ? 'sim' : 'nao'}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant={corDoStatus(p.status)}>{p.status}</Badge>
                    <Badge variant="outline">{rotuloClassificacao(p.classificacao)}</Badge>
                    {p.excedente && (
                      <Badge variant="destructive" data-testid={'excedente-' + p.id}>
                        acima do teto — aguardando
                      </Badge>
                    )}
                    {p.dono_pendente && (
                      <Badge variant="secondary" data-testid={'sem-dono-' + p.id}>
                        sem responsável
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      canal: {p.canal || '—'} · {p.created?.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>

                  <p className="text-sm" data-testid={'resumo-' + p.id}>
                    {p.resumo || 'Sem resumo registrado.'}
                  </p>

                  <div className="mt-3">
                    <Label htmlFor={'motivo-' + p.id} className="text-xs">
                      Motivo do encerramento (obrigatório para encerrar)
                    </Label>
                    <Input
                      id={'motivo-' + p.id}
                      data-testid={'motivo-' + p.id}
                      className="mt-1"
                      placeholder="Ex.: conversei por telefone, retomada combinada"
                      value={motivo[p.id] || ''}
                      onChange={(ev) => setMotivo((prev) => ({ ...prev, [p.id]: ev.target.value }))}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => agir('assumir', p, {})}
                      disabled={salvando === p.id || p.status === 'assumida'}
                      data-testid={'assumir-' + p.id}
                    >
                      Assumir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => agir('devolver', p, {})}
                      disabled={salvando === p.id || p.status !== 'assumida'}
                      data-testid={'devolver-' + p.id}
                    >
                      Devolver para a fila
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => agir('resolver', p, { motivo: motivo[p.id] || '' })}
                      disabled={salvando === p.id || !(motivo[p.id] || '').trim()}
                      data-testid={'resolver-' + p.id}
                    >
                      Encerrar com motivo
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Usuário: {user?.email} · perfil: {user?.role}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
