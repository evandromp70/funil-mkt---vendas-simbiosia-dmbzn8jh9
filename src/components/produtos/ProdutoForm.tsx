// Formulário de dados do produto (novo ou edição), com dicas curtas em cada campo.
import { useEffect, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import {
  criarProduto,
  atualizarProduto,
  validarProduto,
  ROTULO_DEGRAU,
  ROTULO_ATENDIMENTO,
  DEGRAUS,
  TIPOS_ATENDIMENTO,
  type Produto,
  type Degrau,
  type TipoAtendimento,
} from '@/services/produtos'
import { PRODUTO_FAROL_2027 } from '@/services/camposRegua'
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

const doProduto = (p?: Produto): Formulario =>
  p
    ? {
        nome: p.nome,
        degrau: p.degrau,
        area: p.area ?? '',
        dor: p.dor ?? '',
        descricao: p.descricao ?? '',
        tipo_atendimento: p.tipo_atendimento ?? '',
        preco: p.preco !== undefined && p.preco !== null ? String(p.preco) : '',
        faixa_preco: p.faixa_preco ?? '',
      }
    : VAZIO

export default function ProdutoForm({
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  inicial?: Produto
  aoSalvar: (idCriado?: string) => void
  aoCancelar?: () => void
}) {
  const [form, setForm] = useState<Formulario>(doProduto(inicial))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const editando = !!inicial

  useEffect(() => {
    setForm(doProduto(inicial))
    setErros({})
  }, [inicial?.id])

  const usarModelo = () => {
    setForm({
      ...VAZIO,
      nome: PRODUTO_FAROL_2027.nome,
      area: PRODUTO_FAROL_2027.area,
      dor: PRODUTO_FAROL_2027.dor,
      descricao: PRODUTO_FAROL_2027.descricao,
      tipo_atendimento: PRODUTO_FAROL_2027.tipo_atendimento,
    })
    setErros({})
    toast({
      title: 'Modelo carregado',
      description: 'Escolha o degrau, confira o texto e cadastre.',
    })
  }

  const salvar = async () => {
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
    setSalvando(true)
    try {
      if (inicial) {
        await atualizarProduto(inicial.id, dados)
        toast({ title: 'Produto atualizado' })
        aoSalvar()
      } else {
        const criado = await criarProduto(dados)
        toast({
          title: 'Produto cadastrado',
          description: 'Ele nasce inativo. Próximo passo: responder a entrevista.',
        })
        aoSalvar(criado.id)
      }
    } catch (err) {
      toast({
        title: 'Não deu certo',
        description: 'Falha ao salvar: ' + String((err as Error).message ?? err),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Nome do produto</Label>
          <Input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Ex.: FAROL 2027"
          />
          {erros.nome && <p className="text-xs text-red-600">{erros.nome}</p>}
        </div>
        <div className="space-y-1">
          <Label>Degrau da escada</Label>
          <Select
            value={form.degrau || undefined}
            onValueChange={(v) => setForm({ ...form, degrau: v as Degrau })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha o degrau" />
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
          <Label>Tipo de atendimento</Label>
          <Select
            value={form.tipo_atendimento || undefined}
            onValueChange={(v) => setForm({ ...form, tipo_atendimento: v as TipoAtendimento })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha o tipo" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_ATENDIMENTO.map((t) => (
                <SelectItem key={t} value={t}>
                  {ROTULO_ATENDIMENTO[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Consultivo envolve conversa com um sócio; baixo valor é venda direta.
          </p>
          {erros.tipo_atendimento && (
            <p className="text-xs text-red-600">{erros.tipo_atendimento}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Área</Label>
          <Input
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            placeholder="Ex.: Planejamento de IA"
          />
        </div>
        <div className="space-y-1">
          <Label>Dor que resolve</Label>
          <Input
            value={form.dor}
            onChange={(e) => setForm({ ...form, dor: e.target.value })}
            placeholder="Ex.: Falta de previsibilidade no funil"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Descrição</Label>
          <Textarea
            rows={2}
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
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
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button disabled={salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar produto'}
        </Button>
        {!editando && (
          <Button variant="outline" onClick={usarModelo}>
            Usar o modelo do FAROL 2027
          </Button>
        )}
        {aoCancelar && (
          <Button variant="ghost" onClick={aoCancelar}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
