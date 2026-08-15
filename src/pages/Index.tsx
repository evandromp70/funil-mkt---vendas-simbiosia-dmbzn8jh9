import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { createLead, deleteLead, getLeads, Lead } from '@/services/leads'
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

const ETAPA_LABEL: Record<string, string> = {
  lista: 'Lista',
  qualificacao: 'Qualificação',
  contato: 'Contato',
  cadencia: 'Cadência',
  alinhamento: 'Alinhamento',
  conversao: 'Conversão',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

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

export default function Index() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [nomeEmpresa, setNomeEmpresa] = useState('')
  const [contatoNome, setContatoNome] = useState('')
  const [contatoEmail, setContatoEmail] = useState('')
  const [contatoTelefone, setContatoTelefone] = useState('')
  const [origem, setOrigem] = useState<'inbound' | 'outbound' | ''>('')
  const [observacoes, setObservacoes] = useState('')

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
  }, [])

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
            {leads.length} no sistema. Dados persistem após recarregar a página.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum lead ainda. Cadastre o primeiro acima.
            </p>
          ) : (
            <div className="space-y-3">
              {leads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:border-[#10454f]/40 hover:bg-slate-100/60"
                  onClick={() => navigate(`/leads/${lead.id}`)}
                >
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
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={lead.origem === 'inbound' ? 'default' : 'secondary'}>
                        {lead.origem === 'inbound' ? 'Inbound' : 'Outbound'}
                      </Badge>
                      <Badge variant={ETAPA_VARIANT[lead.etapa] ?? 'secondary'}>
                        {ETAPA_LABEL[lead.etapa] ?? lead.etapa}
                      </Badge>
                      {lead.score != null && <Badge variant="outline">Score {lead.score}</Badge>}
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
