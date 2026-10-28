import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

// SPEC-2-002 (F2-T06): tela de aprovação de mensagem de relacionamento — CA-2-002-03.
// A aprovação vale para o HASH do conteúdo exibido. Ao editar e salvar, a aprovação anterior
// deixa de valer e o servidor recusa a execução (verificado por pode-executar).
type Mensagem = {
  id: string
  pessoa?: string
  canal?: string
  conteudo?: string
  conteudo_hash?: string
  estado?: string
  coorte?: string
  motivo_codigo?: string
  expand?: { pessoa?: { nome?: string } }
}

export default function Aprovacoes() {
  const { user } = useAuth()
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [savingId, setSavingId] = useState('')
  const [editando, setEditando] = useState<Record<string, string>>({})
  const [execucao, setExecucao] = useState<Record<string, string>>({})

  const carregar = async () => {
    setLoading(true)
    try {
      const lista = await pb.collection('mensagens').getFullList<Mensagem>({
        sort: '-created',
        expand: 'pessoa',
        filter: pb.filter('estado = {:e} || estado = {:a}', {
          e: 'pendente_aprovacao',
          a: 'aprovada',
        }),
      })
      setMensagens(lista)
      setError('')
    } catch (e) {
      setError('Não foi possível carregar as mensagens.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const aprovar = async (m: Mensagem) => {
    setSavingId(m.id)
    setNotice('')
    setError('')
    try {
      const r = await pb.send('/backend/v1/aprovacoes/aprovar', {
        method: 'POST',
        body: { mensagemId: m.id },
      })
      setNotice(
        r.enviado === false
          ? 'Aprovação registrada para este conteúdo. Nada foi enviado.'
          : 'Aprovação registrada.',
      )
      await carregar()
    } catch (e: any) {
      setError(e?.response?.message || 'Não foi possível aprovar esta mensagem.')
    } finally {
      setSavingId('')
    }
  }

  const salvarEdicao = async (m: Mensagem) => {
    const novo = editando[m.id]
    if (novo === undefined) return
    setSavingId(m.id)
    setNotice('')
    setError('')
    try {
      const r = await pb.send('/backend/v1/mensagens/editar', {
        method: 'POST',
        body: { mensagemId: m.id, conteudo: novo },
      })
      setNotice(
        r.invalidouAprovacao
          ? 'Conteúdo alterado: a aprovação anterior deixou de valer.'
          : 'Mensagem atualizada.',
      )
      setEditando((prev) => {
        const p = { ...prev }
        delete p[m.id]
        return p
      })
      await carregar()
    } catch (e: any) {
      setError(e?.response?.message || 'Não foi possível editar a mensagem.')
    } finally {
      setSavingId('')
    }
  }

  const revogar = async (m: Mensagem) => {
    setSavingId(m.id)
    setNotice('')
    setError('')
    try {
      await pb.send('/backend/v1/aprovacoes/revogar', {
        method: 'POST',
        body: { mensagemId: m.id, motivo: 'revogada na tela de aprovações' },
      })
      setNotice('Aprovação revogada — a mensagem voltou a aguardar aprovação.')
      await carregar()
    } catch (e: any) {
      setError(e?.response?.message || 'Não foi possível revogar a aprovação.')
    } finally {
      setSavingId('')
    }
  }

  const verificarExecucao = async (m: Mensagem) => {
    try {
      const r = await pb.send(
        '/backend/v1/mensagens/pode-executar?mensagemId=' + encodeURIComponent(m.id),
        { method: 'GET' },
      )
      setExecucao((prev) => ({
        ...prev,
        [m.id]: r.podeExecutar
          ? 'PODE EXECUTAR: ' + r.motivo_codigo
          : 'NÃO PODE EXECUTAR: ' + r.motivo_codigo,
      }))
    } catch (e: any) {
      setExecucao((prev) => ({ ...prev, [m.id]: 'ERRO ao verificar' }))
    }
  }

  const corDoEstado = (estado?: string) => {
    if (estado === 'aprovada') return 'default'
    if (estado === 'pendente_aprovacao') return 'secondary'
    return 'destructive'
  }

  return (
    <div className="container mx-auto py-8" data-testid="aprovacoes-page">
      <Card>
        <CardHeader>
          <CardTitle>Aprovação de mensagens</CardTitle>
          <CardDescription>
            Cada aprovação vale para o conteúdo abaixo. Se o texto mudar, a aprovação deixa de valer
            e será preciso aprovar de novo. Aprovar não envia nada.
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
          ) : mensagens.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="vazio">
              Nenhuma mensagem aguardando aprovação.
            </p>
          ) : (
            <div className="space-y-4">
              {mensagens.map((m) => {
                const texto = editando[m.id] !== undefined ? editando[m.id] : m.conteudo || ''
                const alterado = editando[m.id] !== undefined && editando[m.id] !== m.conteudo
                return (
                  <div
                    key={m.id}
                    className="rounded border p-4"
                    data-testid={'mensagem-' + m.id}
                    data-estado={m.estado}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={corDoEstado(m.estado)}>{m.estado}</Badge>
                      <span className="text-sm font-medium">
                        {m.expand?.pessoa?.nome || m.pessoa || 'pessoa'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        canal: {m.canal} · coorte: {m.coorte || '—'}
                      </span>
                    </div>

                    <Label htmlFor={'conteudo-' + m.id} className="text-xs">
                      Conteúdo
                    </Label>
                    <textarea
                      id={'conteudo-' + m.id}
                      data-testid={'conteudo-' + m.id}
                      className="mt-1 w-full rounded border p-2 text-sm"
                      rows={4}
                      value={texto}
                      onChange={(ev) =>
                        setEditando((prev) => ({ ...prev, [m.id]: ev.target.value }))
                      }
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => aprovar(m)}
                        disabled={savingId === m.id}
                        data-testid={'aprovar-' + m.id}
                      >
                        Aprovar este conteúdo
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => salvarEdicao(m)}
                        disabled={!alterado || savingId === m.id}
                        data-testid={'salvar-' + m.id}
                      >
                        Salvar alteração
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => revogar(m)}
                        disabled={savingId === m.id || m.estado !== 'aprovada'}
                        data-testid={'revogar-' + m.id}
                      >
                        Revogar aprovação
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => verificarExecucao(m)}
                        data-testid={'verificar-' + m.id}
                      >
                        Posso executar?
                      </Button>
                    </div>

                    {execucao[m.id] && (
                      <p className="mt-2 text-xs font-medium" data-testid={'execucao-' + m.id}>
                        {execucao[m.id]}
                      </p>
                    )}
                  </div>
                )
              })}
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
