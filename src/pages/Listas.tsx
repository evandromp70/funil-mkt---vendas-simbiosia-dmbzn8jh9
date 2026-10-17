// SPEC-1-006 (task 2e26d650): módulo de Listas no Funil — CA-1-006-01.
// Mesmo app, mesmo backend: lista → contato (LeadDetail, com notas por produto) → nota.
// Filtro vazio = estado vazio com contagem zero. Desvincular não apaga lead.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getListas,
  getMembros,
  criarLista,
  vincularLead,
  desvincular,
  vincularImportados,
  type Lista,
  type Membro,
} from '@/services/listas'
import { getLeads } from '@/services/leads'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const COORTE_LABEL: Record<string, string> = {
  rede_jose: 'Rede José',
  rede_evandro: 'Rede Evandro',
  clientes_atendidos: 'Clientes atendidos',
  inbound: 'Inbound',
  fria: 'Fria',
}
const FONTE_LABEL: Record<string, string> = {
  rfb: 'Receita (RFB)',
  planilha: 'Planilha',
  api: 'API',
  misto: 'Misto',
  legado: 'Legado',
}
const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  em_preparacao: 'Em preparação',
  pronta: 'Pronta',
}

export default function Listas() {
  const [listas, setListas] = useState<Lista[]>([])
  const [selecionada, setSelecionada] = useState<Lista | null>(null)
  const [membros, setMembros] = useState<Membro[]>([])
  const [leads, setLeads] = useState<Array<{ id: string; nome_empresa: string }>>([])
  const [leadVincular, setLeadVincular] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [loading, setLoading] = useState(true)
  const [ocupado, setOcupado] = useState('')

  // form de criação
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [coorte, setCoorte] = useState('')
  const [fonte, setFonte] = useState<Lista['fonte']>('planilha')
  const [ambiente, setAmbiente] = useState<Lista['ambiente']>('teste')

  const carregar = async () => {
    setErro('')
    try {
      const ls = await getListas()
      setListas(ls)
      return ls
    } catch (e) {
      setErro('Falha ao carregar listas: ' + String((e as Error).message ?? e))
      return []
    }
  }

  useEffect(() => {
    void (async () => {
      await carregar()
      setLoading(false)
    })()
  }, [])

  const abrirLista = async (l: Lista) => {
    setSelecionada(l)
    setAviso('')
    setErro('')
    try {
      const ms = await getMembros(l.id)
      setMembros(ms)
    } catch (_) {
      setMembros([])
    }
  }

  const onCriar = async () => {
    setErro('')
    setAviso('')
    if (!nome.trim()) {
      setErro('A lista precisa de um nome.')
      return
    }
    setOcupado('criar')
    try {
      const nova = await criarLista({
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        coorte: coorte || undefined,
        fonte,
        ambiente,
      })
      setNome('')
      setDescricao('')
      setCoorte('')
      const ls = await carregar()
      const l = ls.find((x) => x.id === nova.id) ?? (nova as Lista)
      await abrirLista(l)
      setAviso('Lista criada.')
    } catch (e) {
      setErro('Falha ao criar lista: ' + String((e as Error).message ?? e))
    } finally {
      setOcupado('')
    }
  }

  const onVincular = async () => {
    if (!selecionada || !leadVincular) return
    setOcupado('vincular')
    setErro('')
    try {
      await vincularLead(selecionada.id, leadVincular, selecionada.ambiente)
      setLeadVincular('')
      await abrirLista(selecionada)
      setAviso('Lead vinculado.')
    } catch (e) {
      const msg = String((e as Error).message ?? e)
      setErro(
        msg.includes('unique') || msg.includes('UNIQUE')
          ? 'Este lead já está na lista.'
          : 'Falha ao vincular: ' + msg,
      )
    } finally {
      setOcupado('')
    }
  }

  const onVincularImportados = async () => {
    if (!selecionada) return
    setOcupado('importados')
    setErro('')
    setAviso('')
    try {
      const r = await vincularImportados(selecionada.id, selecionada.ambiente)
      await abrirLista(selecionada)
      setAviso('Vínculos criados: ' + r.criados + ' de ' + r.candidatos + ' candidato(s).')
    } catch (e) {
      setErro('Falha ao vincular importados: ' + String((e as Error).message ?? e))
    } finally {
      setOcupado('')
    }
  }

  const onDesvincular = async (membroId: string) => {
    if (!selecionada) return
    setOcupado(membroId)
    setErro('')
    try {
      await desvincular(membroId)
      await abrirLista(selecionada)
      setAviso('Vínculo removido — o lead e o histórico continuam intactos.')
    } catch (e) {
      setErro('Falha ao desvincular: ' + String((e as Error).message ?? e))
    } finally {
      setOcupado('')
    }
  }

  const carregarLeads = async () => {
    try {
      const ls = await getLeads()
      setLeads(ls.slice(0, 200).map((l) => ({ id: l.id, nome_empresa: l.nome_empresa })))
    } catch (_) {
      setLeads([])
    }
  }
  useEffect(() => {
    void carregarLeads()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Listas</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:text-[#10454f]">
          ← Voltar aos leads
        </Link>
      </div>

      {erro && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {aviso}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova lista</CardTitle>
          <CardDescription>
            Mesmo app, mesmo cadastro: a lista é um vínculo com os leads, nunca uma cópia.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1 lg:col-span-2">
            <Label>Nome</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Fria — Vendas SP"
            />
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label>Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="space-y-1">
            <Label>Coorte</Label>
            <Select value={coorte} onValueChange={setCoorte}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COORTE_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Fonte</Label>
            <Select value={fonte} onValueChange={(v) => setFonte(v as Lista['fonte'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FONTE_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ambiente</Label>
            <Select value={ambiente} onValueChange={(v) => setAmbiente(v as Lista['ambiente'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teste">Teste</SelectItem>
                <SelectItem value="producao">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="bg-[#10454f] hover:bg-[#0d3942]"
              disabled={ocupado !== ''}
              onClick={() => void onCriar()}
            >
              {ocupado === 'criar' ? 'Criando…' : 'Criar lista'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listas ({listas.length})</CardTitle>
          <CardDescription>Clique para ver os membros e navegar até os contatos.</CardDescription>
        </CardHeader>
        <CardContent>
          {listas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma lista ainda — 0 listas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Coorte</th>
                    <th className="py-2 pr-3">Fonte</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Ambiente</th>
                    <th className="py-2 pr-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {listas.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="py-2 pr-3 font-medium">{l.nome}</td>
                      <td className="py-2 pr-3">
                        {l.coorte ? (COORTE_LABEL[l.coorte] ?? l.coorte) : '—'}
                      </td>
                      <td className="py-2 pr-3">{FONTE_LABEL[l.fonte] ?? l.fonte}</td>
                      <td className="py-2 pr-3">{STATUS_LABEL[l.status] ?? l.status}</td>
                      <td className="py-2 pr-3">{l.ambiente === 'teste' ? 'Teste' : 'Produção'}</td>
                      <td className="py-2 pr-3">
                        <Button variant="ghost" size="sm" onClick={() => void abrirLista(l)}>
                          {selecionada?.id === l.id ? 'Aberta' : 'Abrir'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selecionada && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Membros de “{selecionada.nome}” ({membros.length})
            </CardTitle>
            <CardDescription>
              Ambiente {selecionada.ambiente === 'teste' ? 'Teste' : 'Produção'} · abrir o contato
              leva ao lead com as notas por produto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 min-w-[240px]">
                <Label>Vincular lead</Label>
                <Select value={leadVincular} onValueChange={setLeadVincular}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o lead" />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.nome_empresa}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="secondary"
                disabled={ocupado !== '' || !leadVincular}
                onClick={() => void onVincular()}
              >
                {ocupado === 'vincular' ? 'Vinculando…' : 'Vincular'}
              </Button>
              <Button
                variant="outline"
                disabled={ocupado !== ''}
                onClick={() => void onVincularImportados()}
              >
                {ocupado === 'importados' ? 'Vinculando…' : 'Vincular importados'}
              </Button>
            </div>

            {membros.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum membro ainda — 0 membros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3">Lead</th>
                      <th className="py-2 pr-3">Vínculo</th>
                      <th className="py-2 pr-3">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membros.map((m) => {
                      const lead = (m.expand?.lead ?? {}) as { id?: string; nome_empresa?: string }
                      return (
                        <tr key={m.id} className="border-b">
                          <td className="py-2 pr-3">{lead.nome_empresa ?? m.lead}</td>
                          <td className="py-2 pr-3 text-muted-foreground">
                            {m.origem_importacao ? 'Importação' : 'Manual'}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex gap-1">
                              {lead.id && (
                                <Button variant="ghost" size="sm" asChild>
                                  <Link to={`/leads/${lead.id}`}>Ver contato</Link>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={ocupado !== ''}
                                onClick={() => void onDesvincular(m.id)}
                              >
                                {ocupado === m.id ? 'Removendo…' : 'Desvincular'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
