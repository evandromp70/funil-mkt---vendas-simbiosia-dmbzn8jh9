// SPEC-1-004 (task 7183cf59): catálogo de produtos FAROL — CA-1-004-01.
// Admin cadastra/edita/ativa; operador só lê (escrita negada no backend — PRODUTO-ACL).
// Produto novo nasce rascunho/inativo; ativação é manual do admin nesta task.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getProdutos,
  criarProduto,
  atualizarProduto,
  alternarAtivo,
  validarProduto,
  ROTULO_DEGRAU,
  ROTULO_ATENDIMENTO,
  DEGRAUS,
  TIPOS_ATENDIMENTO,
  type Produto,
  type Degrau,
  type TipoAtendimento,
} from '@/services/produtos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Formulario = {
  nome: string
  degrau: Degrau | ''
  area: string
  dor: string
  descricao: string
  tipo_atendimento: TipoAtendimento | ''
  preco: string
  faixa_preco: string
}

const VAZIO: Formulario = {
  nome: '',
  degrau: '',
  area: '',
  dor: '',
  descricao: '',
  tipo_atendimento: '',
  preco: '',
  faixa_preco: '',
}

export default function Produtos() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [form, setForm] = useState<Formulario>(VAZIO)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [editandoId, setEditandoId] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [processando, setProcessando] = useState(false)

  const carregar = async () => {
    try {
      setProdutos(await getProdutos())
    } catch (e) {
      setErro('Falha ao carregar o catálogo: ' + String((e as Error).message ?? e))
    }
  }
  useEffect(() => {
    void carregar()
  }, [])

  const limparForm = () => {
    setForm(VAZIO)
    setErros({})
    setEditandoId('')
  }

  const salvar = async () => {
    setErro('')
    setAviso('')
    const dados = {
      nome: form.nome,
      degrau: form.degrau || undefined,
      area: form.area || undefined,
      dor: form.dor || undefined,
      descricao: form.descricao || undefined,
      tipo_atendimento: form.tipo_atendimento || undefined,
      preco: form.preco ? Number(form.preco) : undefined,
      faixa_preco: form.faixa_preco || undefined,
    }
    const e = validarProduto(dados)
    if (Object.keys(e).length > 0) {
      setErros(e)
      return
    }
    setProcessando(true)
    try {
      if (editandoId) {
        await atualizarProduto(editandoId, dados)
        setAviso('Produto atualizado.')
      } else {
        await criarProduto(dados)
        setAviso(
          'Produto cadastrado como rascunho (inativo) — ative quando a régua estiver aprovada.',
        )
      }
      limparForm()
      await carregar()
    } catch (err) {
      setErro('Falha ao salvar: ' + String((err as Error).message ?? err))
    } finally {
      setProcessando(false)
    }
  }

  const editar = (p: Produto) => {
    setEditandoId(p.id)
    setErros({})
    setErro('')
    setAviso('')
    setForm({
      nome: p.nome,
      degrau: p.degrau,
      area: p.area ?? '',
      dor: p.dor ?? '',
      descricao: p.descricao ?? '',
      tipo_atendimento: p.tipo_atendimento ?? '',
      preco: p.preco !== undefined && p.preco !== null ? String(p.preco) : '',
      faixa_preco: p.faixa_preco ?? '',
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Produtos FAROL</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Voltar ao funil
        </Link>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editandoId ? 'Editar produto' : 'Novo produto'}
          </CardTitle>
          <CardDescription>
            O catálogo é lido por toda a equipe, mas só o administrador altera. Produto novo nasce
            como rascunho (inativo).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: FAROL Essencial — Vendas"
              />
              {erros.nome && <p className="text-xs text-red-600">{erros.nome}</p>}
            </div>
            <div className="space-y-1">
              <Label>Degrau</Label>
              <Select
                value={form.degrau || undefined}
                onValueChange={(v) => setForm({ ...form, degrau: v as Degrau })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {DEGRAUS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {ROTULO_DEGRAU[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erros.degrau && <p className="text-xs text-red-600">{erros.degrau}</p>}
            </div>
            <div className="space-y-1">
              <Label>Área</Label>
              <Input
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                placeholder="Ex.: Vendas"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Dor que atende</Label>
              <Input
                value={form.dor}
                onChange={(e) => setForm({ ...form, dor: e.target.value })}
                placeholder="Ex.: Falta de previsibilidade no funil"
              />
            </div>
            <div className="space-y-1">
              <Label>Tipo de atendimento</Label>
              <Select
                value={form.tipo_atendimento || undefined}
                onValueChange={(v) => setForm({ ...form, tipo_atendimento: v as TipoAtendimento })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ATENDIMENTO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ROTULO_ATENDIMENTO[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {erros.tipo_atendimento && (
                <p className="text-xs text-red-600">{erros.tipo_atendimento}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Preço (opcional)</Label>
              <Input
                type="number"
                min={0}
                value={form.preco}
                onChange={(e) => setForm({ ...form, preco: e.target.value })}
                placeholder="Ex.: 97"
              />
              {erros.preco && <p className="text-xs text-red-600">{erros.preco}</p>}
            </div>
            <div className="space-y-1">
              <Label>Faixa de preço (opcional)</Label>
              <Input
                value={form.faixa_preco}
                onChange={(e) => setForm({ ...form, faixa_preco: e.target.value })}
                placeholder="Ex.: R$ 39–199"
              />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <Label>Descrição (opcional)</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void salvar()} disabled={processando}>
              {processando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Cadastrar produto'}
            </Button>
            {editandoId && (
              <Button variant="ghost" onClick={limparForm}>
                Cancelar edição
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo ({produtos.length})</CardTitle>
          <CardDescription>
            Rascunho = inativo até a régua ser aprovada. A régua de cada produto é configurada nas
            próximas etapas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1 pr-2">Nome</th>
                  <th className="py-1 pr-2">Degrau</th>
                  <th className="py-1 pr-2">Área</th>
                  <th className="py-1 pr-2">Atendimento</th>
                  <th className="py-1 pr-2">Preço</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-1 pr-2 font-medium">{p.nome}</td>
                    <td className="py-1 pr-2">{ROTULO_DEGRAU[p.degrau]}</td>
                    <td className="py-1 pr-2">{p.area || '—'}</td>
                    <td className="py-1 pr-2">
                      {p.tipo_atendimento ? ROTULO_ATENDIMENTO[p.tipo_atendimento] : '—'}
                    </td>
                    <td className="py-1 pr-2">
                      {p.preco !== undefined && p.preco !== null
                        ? `R$ ${p.preco}`
                        : p.faixa_preco || '—'}
                    </td>
                    <td className="py-1 pr-2">
                      {p.ativo ? (
                        <Badge className="bg-green-100 text-green-800">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Rascunho</Badge>
                      )}
                    </td>
                    <td className="py-1 pr-2">
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => editar(p)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={processando}
                          onClick={() => void alternarAtivo(p.id, !p.ativo).then(carregar)}
                        >
                          {p.ativo ? 'Inativar' : 'Ativar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {produtos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-3 text-center text-muted-foreground">
                      Nenhum produto cadastrado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
