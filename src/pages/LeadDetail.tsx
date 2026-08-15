import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  getLead,
  updateLead,
  getQualificacoes,
  createQualificacao,
  getContatos,
  createContato,
  getCadencias,
  createCadencia,
  getAlinhamentos,
  createAlinhamento,
  gerarRascunhoContato,
  sugerirProximoToque,
  analisarQualificacao,
  Lead,
  Qualificacao,
  Contato,
  Cadencia,
  Alinhamento,
  ETAPA_LABEL,
  FLUXO,
} from '@/services/leads'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [lead, setLead] = useState<Lead | null>(null)
  const [qualificacoes, setQualificacoes] = useState<Qualificacao[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [cadencias, setCadencias] = useState<Cadencia[]>([])
  const [alinhamentos, setAlinhamentos] = useState<Alinhamento[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [aiLoading, setAiLoading] = useState('')

  // campos de edição
  const [obs, setObs] = useState('')

  // contato
  const [contatoCanal, setContatoCanal] = useState<
    'email' | 'linkedin' | 'whatsapp' | 'telefone' | 'evento'
  >('email')
  const [contatoMensagem, setContatoMensagem] = useState('')
  const [contatoResposta, setContatoResposta] = useState('')
  const [rascunhoContato, setRascunhoContato] = useState('')

  // cadência
  const [cadToque, setCadToque] = useState(1)
  const [cadCanal, setCadCanal] = useState<'email' | 'linkedin' | 'whatsapp' | 'telefone'>('email')
  const [cadStatus, setCadStatus] = useState<
    'agendado' | 'enviado' | 'respondido' | 'ignorado' | 'cancelado'
  >('agendado')
  const [cadRascunho, setCadRascunho] = useState('')
  const [sugestaoToque, setSugestaoToque] = useState('')

  // qualificação
  const [qFit, setQFit] = useState<number>(0)
  const [qDor, setQDor] = useState<number>(0)
  const [qOrcamento, setQOrcamento] = useState<number>(0)
  const [qTiming, setQTiming] = useState<number>(0)
  const [qAcesso, setQAcesso] = useState<number>(0)
  const [qDecisao, setQDecisao] = useState<'qualificado' | 'nao_qualificado' | 'revisar'>('revisar')
  const [qNotas, setQNotas] = useState('')
  const [analiseIA, setAnaliseIA] = useState('')

  // alinhamento
  const [aData, setAData] = useState('')
  const [aPauta, setAPauta] = useState('')
  const [aDecisoes, setADecisoes] = useState('')
  const [aProximo, setAProximo] = useState('')

  const loadAll = async () => {
    if (!id) return
    setLoading(true)
    try {
      const [l, qs, cs, cads, als] = await Promise.all([
        getLead(id),
        getQualificacoes(id),
        getContatos(id),
        getCadencias(id),
        getAlinhamentos(id),
      ])
      setLead(l)
      setQualificacoes(qs)
      setContatos(cs)
      setCadencias(cads)
      setAlinhamentos(als)
      setObs(l.observacoes ?? '')
      setError('')
    } catch (e) {
      setError('Não foi possível carregar o lead.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (loading) return <p className="text-muted-foreground">Carregando...</p>
  if (!lead) return <p className="text-red-600">Lead não encontrado.</p>

  const isOwner = user?.id === lead.owner
  const idx = FLUXO.findIndex((f) => f.etapa === lead.etapa)
  const nextEtapa = idx >= 0 && idx < FLUXO.length - 1 ? FLUXO[idx + 1].etapa : null

  const saveObs = async () => {
    setError('')
    try {
      await updateLead(lead.id, { observacoes: obs })
      setNotice('Observações salvas.')
      setTimeout(() => setNotice(''), 2000)
      await loadAll()
    } catch (e) {
      setError('Não foi possível salvar observações.')
    }
  }

  const avancar = async () => {
    if (!nextEtapa) return
    setError('')
    try {
      await updateLead(lead.id, { etapa: nextEtapa })
      await loadAll()
    } catch (e) {
      setError('Não foi possível avançar a etapa.')
    }
  }

  const marcarPerdido = async () => {
    setError('')
    try {
      await updateLead(lead.id, { etapa: 'perdido' })
      await loadAll()
    } catch (e) {
      setError('Não foi possível marcar como perdido.')
    }
  }

  const handleGerarContato = async () => {
    setAiLoading('contato')
    setError('')
    setRascunhoContato('')
    try {
      const res = await gerarRascunhoContato(lead.id)
      setRascunhoContato(res.rascunho)
    } catch (e) {
      setError('Não foi possível gerar o rascunho de contato.')
    } finally {
      setAiLoading('')
    }
  }

  const handleSalvarContato = async () => {
    setError('')
    try {
      await createContato({
        lead: lead.id,
        canal: contatoCanal,
        direcao: lead.origem === 'inbound' ? 'inbound' : 'outbound',
        mensagem: contatoMensagem || rascunhoContato,
        resposta: contatoResposta,
        data_contato: new Date().toISOString(),
      })
      setContatoMensagem('')
      setContatoResposta('')
      setRascunhoContato('')
      setNotice('Contato registrado.')
      setTimeout(() => setNotice(''), 2000)
      await loadAll()
    } catch (e) {
      setError('Não foi possível registrar o contato.')
    }
  }

  const handleSugerirToque = async () => {
    setAiLoading('toque')
    setError('')
    setSugestaoToque('')
    try {
      const res = await sugerirProximoToque(lead.id)
      setSugestaoToque(res.sugestao)
    } catch (e) {
      setError('Não foi possível sugerir o próximo toque.')
    } finally {
      setAiLoading('')
    }
  }

  const handleSalvarCadencia = async () => {
    setError('')
    try {
      await createCadencia({
        lead: lead.id,
        toque: cadToque,
        canal: cadCanal,
        status: cadStatus,
        rascunho_ia: cadRascunho || sugestaoToque,
        data_envio: new Date().toISOString(),
      })
      setCadRascunho('')
      setSugestaoToque('')
      setCadToque((t) => t + 1)
      setNotice('Toque de cadência registrado.')
      setTimeout(() => setNotice(''), 2000)
      await loadAll()
    } catch (e) {
      setError('Não foi possível registrar o toque de cadência.')
    }
  }

  const handleAnalisarQualificacao = async () => {
    setAiLoading('qualificacao')
    setError('')
    setAnaliseIA('')
    try {
      const res = await analisarQualificacao(lead.id)
      setAnaliseIA(res.analise)
    } catch (e) {
      setError('Não foi possível analisar a qualificação.')
    } finally {
      setAiLoading('')
    }
  }

  const scoreTotal = qFit + qDor + qOrcamento + qTiming + qAcesso

  const handleSalvarQualificacao = async () => {
    setError('')
    try {
      await createQualificacao({
        lead: lead.id,
        fit: qFit,
        dor: qDor,
        orcamento: qOrcamento,
        timing: qTiming,
        acesso: qAcesso,
        score_total: scoreTotal,
        decisao: qDecisao,
        notas: qNotas,
      })
      await updateLead(lead.id, { score: scoreTotal })
      setQNotas('')
      setNotice('Qualificação salva.')
      setTimeout(() => setNotice(''), 2000)
      await loadAll()
    } catch (e) {
      setError('Não foi possível salvar a qualificação.')
    }
  }

  const handleSalvarAlinhamento = async () => {
    setError('')
    try {
      await createAlinhamento({
        lead: lead.id,
        data_reuniao: aData ? new Date(aData).toISOString() : undefined,
        pauta: aPauta,
        decisoes: aDecisoes,
        proximo_passo: aProximo,
      })
      setAData('')
      setAPauta('')
      setADecisoes('')
      setAProximo('')
      setNotice('Alinhamento registrado.')
      setTimeout(() => setNotice(''), 2000)
      await loadAll()
    } catch (e) {
      setError('Não foi possível registrar o alinhamento.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-muted-foreground hover:text-[#10454f]">
            ← Voltar aos leads
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[#10454f]">{lead.nome_empresa}</h1>
          <p className="text-muted-foreground">
            {lead.contato_nome || '—'} {lead.contato_email ? `· ${lead.contato_email}` : ''}{' '}
            {lead.contato_telefone ? `· ${lead.contato_telefone}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={lead.origem === 'inbound' ? 'default' : 'secondary'}>
            {lead.origem === 'inbound' ? 'Inbound' : 'Outbound'}
          </Badge>
          <Badge variant={lead.etapa === 'perdido' ? 'destructive' : 'default'}>
            {ETAPA_LABEL[lead.etapa] ?? lead.etapa}
          </Badge>
          {lead.score != null && <Badge variant="outline">Score {lead.score}</Badge>}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {/* Avanço de etapa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jornada do lead</CardTitle>
          <CardDescription>
            Etapa atual: <strong>{ETAPA_LABEL[lead.etapa]}</strong>. Avance conforme o fluxo
            acontece.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {FLUXO.map((f) => {
              const done = FLUXO.indexOf(f) < idx
              const current = f.etapa === lead.etapa
              return (
                <Badge key={f.etapa} variant={current ? 'default' : done ? 'secondary' : 'outline'}>
                  {f.label}
                </Badge>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {nextEtapa && (
              <Button onClick={avancar} className="bg-[#10454f] hover:bg-[#0d3942]">
                Avançar para {ETAPA_LABEL[nextEtapa]}
              </Button>
            )}
            {lead.etapa !== 'perdido' && (
              <Button variant="outline" onClick={marcarPerdido}>
                Marcar como perdido
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Observações */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Observações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Contexto, dor, próximo passo..."
            rows={3}
          />
          <Button variant="outline" onClick={saveObs}>
            Salvar observações
          </Button>
        </CardContent>
      </Card>

      {/* Lista — preparação da lista (HA) */}
      {lead.etapa === 'lista' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preparação da lista</CardTitle>
            <CardDescription>
              O lead entrou na lista (inbound ou outbound). Revise as informações acima e avance
              para a qualificação quando estiver pronto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Dica: aproveite para registrar na observação o setor, porte e a dor identificada —
              isso ajuda a IA na qualificação.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Qualificação — HA */}
      {(lead.etapa === 'qualificacao' || lead.etapa === 'lista') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Qualificação (apoio de IA)</CardTitle>
            <CardDescription>
              Avalie fit, dor, orçamento, timing e acesso (0–10). A IA pode ajudar na análise; você
              revisa e decide.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="space-y-1">
                <Label>Fit</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={qFit}
                  onChange={(e) => setQFit(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Dor</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={qDor}
                  onChange={(e) => setQDor(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Orçamento</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={qOrcamento}
                  onChange={(e) => setQOrcamento(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Timing</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={qTiming}
                  onChange={(e) => setQTiming(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Acesso</Label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  value={qAcesso}
                  onChange={(e) => setQAcesso(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Score total: <strong>{scoreTotal}</strong> / 100
            </div>
            <div className="space-y-1">
              <Label>Decisão</Label>
              <Select
                value={qDecisao}
                onValueChange={(v) =>
                  setQDecisao(v as 'qualificado' | 'nao_qualificado' | 'revisar')
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualificado">Qualificado</SelectItem>
                  <SelectItem value="nao_qualificado">Não qualificado</SelectItem>
                  <SelectItem value="revisar">Revisar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Textarea
                value={qNotas}
                onChange={(e) => setQNotas(e.target.value)}
                placeholder="Por que essa nota? O que falta?"
                rows={3}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={handleAnalisarQualificacao}
                disabled={aiLoading === 'qualificacao'}
              >
                {aiLoading === 'qualificacao' ? 'Analisando...' : '🤖 Analisar com IA'}
              </Button>
              <Button
                onClick={handleSalvarQualificacao}
                className="bg-[#10454f] hover:bg-[#0d3942]"
              >
                Salvar qualificação
              </Button>
            </div>
            {analiseIA && (
              <div className="rounded-lg border bg-slate-50 p-4 text-sm whitespace-pre-wrap">
                <p className="mb-1 font-semibold">Análise da IA (revise antes de usar):</p>
                {analiseIA}
              </div>
            )}
            {qualificacoes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Histórico de qualificações</p>
                {qualificacoes.map((q) => (
                  <div key={q.id} className="rounded-lg border p-3 text-sm">
                    <p>
                      Fit {q.fit} · Dor {q.dor} · Orçamento {q.orcamento} · Timing {q.timing} ·
                      Acesso {q.acesso} — <strong>Score {q.score_total}</strong> · {q.decisao}
                    </p>
                    {q.notas && <p className="mt-1 text-muted-foreground">{q.notas}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contato — H + HA no rascunho */}
      {(lead.etapa === 'contato' ||
        lead.etapa === 'cadencia' ||
        lead.etapa === 'alinhamento' ||
        lead.etapa === 'conversao') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato</CardTitle>
            <CardDescription>
              Registre o primeiro contato ou as interações. A IA pode gerar um rascunho; você revisa
              e envia.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Canal</Label>
                <Select
                  value={contatoCanal}
                  onValueChange={(v) =>
                    setContatoCanal(v as 'email' | 'linkedin' | 'whatsapp' | 'telefone' | 'evento')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="evento">Evento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Mensagem enviada</Label>
                <Textarea
                  value={contatoMensagem}
                  onChange={(e) => setContatoMensagem(e.target.value)}
                  placeholder="O que foi enviado?"
                  rows={2}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Resposta recebida</Label>
              <Textarea
                value={contatoResposta}
                onChange={(e) => setContatoResposta(e.target.value)}
                placeholder="O que o lead respondeu?"
                rows={2}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={handleGerarContato}
                disabled={aiLoading === 'contato'}
              >
                {aiLoading === 'contato' ? 'Gerando...' : '🤖 Gerar rascunho com IA'}
              </Button>
              <Button onClick={handleSalvarContato} className="bg-[#10454f] hover:bg-[#0d3942]">
                Salvar contato
              </Button>
            </div>
            {rascunhoContato && (
              <div className="rounded-lg border bg-slate-50 p-4 text-sm whitespace-pre-wrap">
                <p className="mb-1 font-semibold">Rascunho da IA (revise antes de enviar):</p>
                {rascunhoContato}
              </div>
            )}
            {contatos.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Histórico de contatos</p>
                {contatos.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 text-sm">
                    <p>
                      <Badge variant="outline">{c.canal}</Badge>{' '}
                      <span className="text-muted-foreground">({c.direcao})</span>
                    </p>
                    {c.mensagem && <p className="mt-1">Enviado: {c.mensagem}</p>}
                    {c.resposta && (
                      <p className="mt-1 text-muted-foreground">Resposta: {c.resposta}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cadência — HA */}
      {lead.etapa === 'cadencia' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cadência (apoio de IA)</CardTitle>
            <CardDescription>
              Sequência de toques de follow-up. A IA sugere o próximo toque; você revisa e registra.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Nº do toque</Label>
                <Input
                  type="number"
                  min={1}
                  value={cadToque}
                  onChange={(e) => setCadToque(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label>Canal</Label>
                <Select
                  value={cadCanal}
                  onValueChange={(v) =>
                    setCadCanal(v as 'email' | 'linkedin' | 'whatsapp' | 'telefone')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={cadStatus}
                  onValueChange={(v) =>
                    setCadStatus(
                      v as 'agendado' | 'enviado' | 'respondido' | 'ignorado' | 'cancelado',
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendado">Agendado</SelectItem>
                    <SelectItem value="enviado">Enviado</SelectItem>
                    <SelectItem value="respondido">Respondido</SelectItem>
                    <SelectItem value="ignorado">Ignorado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Mensagem (rascunho)</Label>
              <Textarea
                value={cadRascunho}
                onChange={(e) => setCadRascunho(e.target.value)}
                placeholder="Mensagem deste toque"
                rows={3}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={handleSugerirToque}
                disabled={aiLoading === 'toque'}
              >
                {aiLoading === 'toque' ? 'Sugerindo...' : '🤖 Sugerir próximo toque com IA'}
              </Button>
              <Button onClick={handleSalvarCadencia} className="bg-[#10454f] hover:bg-[#0d3942]">
                Salvar toque
              </Button>
            </div>
            {sugestaoToque && (
              <div className="rounded-lg border bg-slate-50 p-4 text-sm whitespace-pre-wrap">
                <p className="mb-1 font-semibold">Sugestão da IA (revise antes de usar):</p>
                {sugestaoToque}
              </div>
            )}
            {cadencias.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Histórico de cadência</p>
                {cadencias.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3 text-sm">
                    <p>
                      <Badge variant="outline">Toque {c.toque}</Badge>{' '}
                      <Badge variant="outline">{c.canal}</Badge>{' '}
                      <Badge variant="outline">{c.status}</Badge>
                    </p>
                    {c.rascunho_ia && <p className="mt-1 text-muted-foreground">{c.rascunho_ia}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Alinhamento — H */}
      {(lead.etapa === 'alinhamento' || lead.etapa === 'conversao') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alinhamento (reunião / 1ª conversa)</CardTitle>
            <CardDescription>
              Registre a reunião, decisões e o próximo passo. Reunião agendada já conta como marco
              no funil.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Data da reunião</Label>
                <Input type="date" value={aData} onChange={(e) => setAData(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Pauta</Label>
                <Input
                  value={aPauta}
                  onChange={(e) => setAPauta(e.target.value)}
                  placeholder="Pauta da reunião"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Decisões</Label>
              <Textarea
                value={aDecisoes}
                onChange={(e) => setADecisoes(e.target.value)}
                placeholder="O que ficou decidido?"
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label>Próximo passo</Label>
              <Textarea
                value={aProximo}
                onChange={(e) => setAProximo(e.target.value)}
                placeholder="Próximo passo acordado"
                rows={2}
              />
            </div>
            <Button onClick={handleSalvarAlinhamento} className="bg-[#10454f] hover:bg-[#0d3942]">
              Salvar alinhamento
            </Button>
            {alinhamentos.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Histórico</p>
                {alinhamentos.map((a) => (
                  <div key={a.id} className="rounded-lg border p-3 text-sm">
                    <p>
                      {a.data_reuniao
                        ? new Date(a.data_reuniao).toLocaleString('pt-BR')
                        : 'Data não informada'}
                    </p>
                    {a.pauta && (
                      <p className="mt-1">
                        <strong>Pauta:</strong> {a.pauta}
                      </p>
                    )}
                    {a.decisoes && (
                      <p className="mt-1">
                        <strong>Decisões:</strong> {a.decisoes}
                      </p>
                    )}
                    {a.proximo_passo && (
                      <p className="mt-1">
                        <strong>Próximo:</strong> {a.proximo_passo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Conversão — H */}
      {lead.etapa === 'conversao' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversão</CardTitle>
            <CardDescription>
              Proposta e negociação. Quando fechar, avance para Ganho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use o campo Observações para registrar proposta, valor, condições e objeções. Avance
              para <strong>Ganho</strong> quando o contrato assinar.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ganho / Perdido — terminal */}
      {(lead.etapa === 'ganho' || lead.etapa === 'perdido') && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Lead {lead.etapa === 'ganho' ? 'ganho 🎉' : 'perdido'}
            </CardTitle>
            <CardDescription>
              {lead.etapa === 'ganho'
                ? 'Parabéns! Registre o motivo do ganho e o valor nas observações para o histórico.'
                : 'Registre o motivo da perda nas observações — isso alimenta a revisão do funil.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isOwner && (
        <p className="text-sm text-muted-foreground">
          Você não é o responsável por este lead (somente leitura de detalhes).
        </p>
      )}
    </div>
  )
}
