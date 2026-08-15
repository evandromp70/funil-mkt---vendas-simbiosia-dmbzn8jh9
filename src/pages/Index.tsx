import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  createLead,
  deleteLead,
  getLeads,
  getUsuarios,
  atribuirLote,
  Lead,
  Usuario,
  ETAPA_LABEL,
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

const ETAPA_VARIANT: Record<string, 'secondary' | 'default' | 'outline' | 'destructive'> = {
  lista: 'secondary',
  qualificacao: 'secondary',
  contato: 'outline',
  cadencia: 'outline',
  alinhamento: 'default',
  conversao: 'default',
  ganho: 'default',
  perdido: 'destructive',
}

type Ordenacao = 'recentes' | 'antigos' | 'alfabetica' | 'score_desc' | 'score_asc' | 'etapa'

const ORDENACAO_LABEL: Record<Ordenacao, string> = {
  recentes: 'Mais recentes',
  antigos: 'Mais antigos',
  alfabetica: 'Ordem alfabética (A–Z)',
  score_desc: 'Score (maior → menor)',
  score_asc: 'Score (menor → maior)',
  etapa: 'Etapa da jornada',
}

export default function Index() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [contatoNome, setContatoNome] = useState('')
  const [contatoEmail, setContatoEmail] = useState('')
  const [contatoTelefone, setContatoTelefone] = useState('')
  const [origem, setOrigem] = useState<'inbound' | 'outbound' | ''>('')
  const [observacoes, setObservacoes] = useState('')

  // busca / filtro / ordenação
  const [busca, setBusca] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroOrigem, setFiltroOrigem] = useState('')
  const [filtroDono, setFiltroDono] = useState('')
  const [filtroSegmento, setFiltroSegmento] = useState('')
  const [filtroUf, setFiltroUf] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('recentes')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // seleção múltipla + atribuição em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [vendedorAlvo, setVendedorAlvo] = useState('')
  const [atribuindo, setAtribuindo] = useState(false)

  const ehAdmin = user?.role === 'admin'
  const vendedores = usuarios.filter((u) => u.role === 'vendedor')

  const loadLeads = async () => {
    setLoading(true)
    try {
      const data = await getLeads()
      setLeads(data)
      setError('')
    } catch (e) {
      setError('Não foi possível carregar os leads.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
    if (user?.role === 'admin') {
      getUsuarios()
        .then(setUsuarios)
        .catch(() => {})
    }
  }, [user?.role])

  const leadsFiltrados = useMemo(() => {
    let lista = [...leads]
    const q = busca.trim().toLowerCase()
    if (q) {
      lista = lista.filter(
        (l) =>
          l.nome_empresa.toLowerCase().includes(q) ||
          (l.contato_nome || '').toLowerCase().includes(q) ||
          (l.contato_email || '').toLowerCase().includes(q),
      )
    }
    if (filtroEtapa) {
      lista = lista.filter((l) => l.etapa === filtroEtapa)
    }
    if (filtroOrigem) {
      lista = lista.filter((l) => l.origem === filtroOrigem)
    }
    if (filtroDono && ehAdmin) {
      lista = lista.filter((l) => l.owner === filtroDono)
    }
    if (filtroSegmento) {
      lista = lista.filter((l) => (l.segmento || '').toLowerCase() === filtroSegmento.toLowerCase())
    }
    if (filtroUf) {
      lista = lista.filter((l) => (l.uf || '').toUpperCase() === filtroUf.toUpperCase())
    }
    const ordemEtapa: Record<string, number> = {
      lista: 0,
      qualificacao: 1,
      contato: 2,
      cadencia: 3,
      alinhamento: 4,
      conversao: 5,
      ganho: 6,
      perdido: 7,
    }
    switch (ordenacao) {
      case 'antigos':
        lista.sort((a, b) => a.created.localeCompare(b.created))
        break
      case 'alfabetica':
        lista.sort((a, b) => a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR'))
        break
      case 'score_desc':
        lista.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        break
      case 'score_asc':
        lista.sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
        break
      case 'etapa':
        lista.sort(
          (a, b) =>
            (ordemEtapa[a.etapa] ?? 99) - (ordemEtapa[b.etapa] ?? 99) ||
            a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR'),
        )
        break
      case 'recentes':
      default:
        lista.sort((a, b) => b.created.localeCompare(a.created))
        break
    }
    return lista
  }, [
    leads,
    busca,
    filtroEtapa,
    filtroOrigem,
    filtroDono,
    filtroSegmento,
    filtroUf,
    ordenacao,
    ehAdmin,
  ])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nomeEmpresa || !origem) {
      setError('Preencha empresa e origem.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createLead({
        owner: user.id,
        nome_empresa: nomeEmpresa,
        contato_nome: contatoNome,
        contato_email: contatoEmail,
        contato_telefone: contatoTelefone,
        origem,
        etapa: 'lista',
        observacoes,
      })
      setNomeEmpresa('')
      setContatoNome('')
      setContatoEmail('')
      setContatoTelefone('')
      setOrigem('')
      setObservacoes('')
      await loadLeads()
    } catch (e) {
      setError('Não foi possível salvar o lead.')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (id: string) => {
    if (!confirm('Excluir este lead?')) return
    try {
      await deleteLead(id)
      await loadLeads()
    } catch (e) {
      setError('Não foi possível excluir.')
    }
  }

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) {
        novo.delete(id)
      } else {
        novo.add(id)
      }
      return novo
    })
  }

  const onAtribuirLote = async () => {
    if (selecionados.size === 0 || !vendedorAlvo) {
      setError('Selecione leads e um vendedor.')
      return
    }
    if (
      !confirm(
        `Atribuir ${selecionados.size} lead(s) a ${vendedores.find((v) => v.id === vendedorAlvo)?.name || 'vendedor'}?`,
      )
    ) {
      return
    }
    setAtribuindo(true)
    setError('')
    try {
      const data = await atribuirLote(Array.from(selecionados), vendedorAlvo)
      setNotice(`${data.atribuidos} lead(s) atribuído(s) com sucesso.`)
      setTimeout(() => setNotice(''), 4000)
      setSelecionados(new Set())
      setVendedorAlvo('')
      await loadLeads()
    } catch (e) {
      setError('Não foi possível atribuir os leads.')
    } finally {
      setAtribuindo(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#10454f]">Funil de MKT &amp; Vendas</h1>
        <p className="text-muted-foreground">
          Acompanhe a jornada dos leads: lista → qualificação → contato → cadência → alinhamento →
          conversão.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo lead</CardTitle>
          <CardDescription>
            Registre um lead que entrou pelo site/LinkedIn (inbound) ou que você importou de uma
            lista (outbound).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="empresa">Empresa *</Label>
              <Input
                id="empresa"
                placeholder="Nome da empresa"
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contato">Nome do contato</Label>
              <Input
                id="contato"
                placeholder="Nome"
                value={contatoNome}
                onChange={(e) => setContatoNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="contato@empresa.com.br"
                value={contatoEmail}
                onChange={(e) => setContatoEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                placeholder="(11) 99999-9999"
                value={contatoTelefone}
                onChange={(e) => setContatoTelefone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Origem *</Label>
              <Select value={origem} onValueChange={(v) => setOrigem(v as 'inbound' | 'outbound')}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inbound">Inbound (site/LinkedIn)</SelectItem>
                  <SelectItem value="outbound">Outbound (lista)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="obs">Observações</Label>
              <Textarea
                id="obs"
                placeholder="Contexto, dor, próximo passo..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
            {notice && <p className="text-sm text-green-700 sm:col-span-2">{notice}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" className="bg-[#10454f] hover:bg-[#0d3942]" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar lead'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads cadastrados</CardTitle>
          <CardDescription>
            {leads.length} no sistema · {leadsFiltrados.length} exibidos. Dados persistem após
            recarregar a página.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Busca, filtros e ordenação */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>Buscar lead</Label>
              <Input
                placeholder="Nome da empresa, contato, e-mail..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Etapa</Label>
              <Select value={filtroEtapa} onValueChange={(v) => setFiltroEtapa(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {Object.entries(ETAPA_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Origem</Label>
              <Select value={filtroOrigem} onValueChange={(v) => setFiltroOrigem(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ehAdmin && (
              <div className="space-y-1">
                <Label>Dono</Label>
                <Select value={filtroDono} onValueChange={(v) => setFiltroDono(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Segmento</Label>
              <Select value={filtroSegmento} onValueChange={(v) => setFiltroSegmento(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {Array.from(new Set(leads.map((l) => l.segmento).filter(Boolean))).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Região (UF)</Label>
              <Select value={filtroUf} onValueChange={(v) => setFiltroUf(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {Array.from(new Set(leads.map((l) => l.uf).filter(Boolean))).map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ordenar por</Label>
              <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDENACAO_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Barra de atribuição em lote (admin) */}
          {ehAdmin && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-slate-50 p-3">
              <span className="text-sm font-medium">
                {selecionados.size > 0 ? `${selecionados.size} selecionado(s)` : 'Selecione leads'}
              </span>
              <Select value={vendedorAlvo} onValueChange={(v) => setVendedorAlvo(v)}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Atribuir a..." />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name || v.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="default"
                size="sm"
                onClick={onAtribuirLote}
                disabled={atribuindo || selecionados.size === 0 || !vendedorAlvo}
                className="bg-[#bde038] text-[#10454f] hover:bg-[#a5cc2c]"
              >
                {atribuindo ? 'Atribuindo...' : 'Atribuir aos selecionados'}
              </Button>
              {selecionados.size > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>
                  Limpar seleção
                </Button>
              )}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : leadsFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {busca || filtroEtapa || filtroOrigem
                ? 'Nenhum lead encontrado com esses critérios.'
                : 'Nenhum lead ainda. Cadastre o primeiro acima.'}
            </p>
          ) : (
            <div className="space-y-3">
              {leadsFiltrados.map((lead) => (
                <div
                  key={lead.id}
                  className={`flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:border-[#10454f]/40 hover:bg-slate-100/60 ${
                    selecionados.has(lead.id) ? 'border-[#10454f] bg-[#10454f]/5' : ''
                  }`}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                >
                  {ehAdmin && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={selecionados.has(lead.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelecionado(lead.id)}
                    />
                  )}
                  <div>
                    <Link
                      to={`/leads/${lead.id}`}
                      className="font-medium hover:text-[#10454f]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {lead.nome_empresa}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {lead.contato_nome || '—'}{' '}
                      {lead.contato_email ? `· ${lead.contato_email}` : ''}
                    </p>
                    {(lead.segmento || lead.uf || lead.cidade) && (
                      <p className="text-xs text-muted-foreground">
                        {[lead.segmento, lead.cidade, lead.uf].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={lead.origem === 'inbound' ? 'default' : 'secondary'}>
                        {lead.origem === 'inbound' ? 'Inbound' : 'Outbound'}
                      </Badge>
                      <Badge variant={ETAPA_VARIANT[lead.etapa] ?? 'secondary'}>
                        {ETAPA_LABEL[lead.etapa] ?? lead.etapa}
                      </Badge>
                      {lead.score != null && <Badge variant="outline">Score {lead.score}</Badge>}
                      {lead.lista_origem && (
                        <Badge variant="outline" className="text-[10px]">
                          {lead.lista_origem}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => onDelete(lead.id)}
                  >
                    Excluir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
