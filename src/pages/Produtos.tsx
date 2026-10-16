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
import { ROTEIRO, avaliarEntrevista } from '@/services/entrevista'
import {
  validarRegua,
  hashRegua,
  OPERADORES,
  type Criterio,
  type Faixa,
  type Regua,
  type Termo,
  type Grupo,
} from '@/services/regua'
import pb from '@/lib/pocketbase/client'
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
  const [entrevistaProdutoId, setEntrevistaProdutoId] = useState('')
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [entrevistaId, setEntrevistaId] = useState('')
  const [entrevistaStatus, setEntrevistaStatus] = useState('')
  const [reguaProdutoId, setReguaProdutoId] = useState('')
  const [reguaMetodo, setReguaMetodo] = useState<'ponderado' | 'pontos'>('ponderado')
  const [reguaCriterios, setReguaCriterios] = useState<Criterio[]>([])
  const [reguaEliminatorias, setReguaEliminatorias] = useState<Criterio[]>([])
  const [reguaFaixas, setReguaFaixas] = useState<Faixa[]>([
    { letra: 'A', de: 0, ate: 50, borda_inclusiva: true },
    { letra: 'B', de: 50, ate: 75, borda_inclusiva: false },
    { letra: 'C', de: 75, ate: 90, borda_inclusiva: false },
    { letra: 'D', de: 90, ate: 100, borda_inclusiva: true },
  ])
  const [reguaVersoes, setReguaVersoes] = useState<Array<Record<string, unknown>>>([])
  const [reguaEditandoId, setReguaEditandoId] = useState('')
  const [errosRegua, setErrosRegua] = useState<Record<string, string>>({})
  // SPEC-1-005 (task 2faac03b): jobs de repontuação do produto (régua aprovada cria job)
  const [jobsVersoes, setJobsVersoes] = useState<Array<Record<string, unknown>>>([])
  const [jobProcessando, setJobProcessando] = useState('')

  const abrirRegua = async (p: Produto) => {
    setReguaProdutoId(p.id)
    setErro('')
    setAviso('')
    setErrosRegua({})
    try {
      const versoes = await pb.collection('regras_produto').getFullList({
        filter: pb.filter('produto = {:p}', { p: p.id }),
        sort: '-versao',
      })
      setReguaVersoes(versoes as unknown as Array<Record<string, unknown>>)
      try {
        const jobs = await pb.collection('jobs_pontuacao').getFullList({
          filter: pb.filter('produto = {:p}', { p: p.id }),
          sort: '-versao',
        })
        setJobsVersoes(jobs as unknown as Array<Record<string, unknown>>)
      } catch (_) {
        setJobsVersoes([])
      }
      const rascunho = versoes.find((v) => v.status === 'rascunho')
      const aprovada = versoes.find((v) => v.status === 'aprovada')
      const base = rascunho ?? aprovada
      if (base) {
        setReguaEditandoId(base.id)
        setReguaMetodo((base.metodo as 'ponderado' | 'pontos') ?? 'ponderado')
        setReguaCriterios(jsonTolerante(base.criterios))
        setReguaEliminatorias(jsonTolerante(base.regras_eliminatorias))
        setReguaFaixas(jsonTolerante(base.faixas))
      } else {
        setReguaEditandoId('')
        setReguaMetodo('ponderado')
        setReguaCriterios([])
        setReguaEliminatorias([])
      }
    } catch (e) {
      setErro('Falha ao carregar a régua: ' + String((e as Error).message ?? e))
    }
  }

  const salvarRegua = async (aprovar: boolean) => {
    if (!reguaProdutoId) return
    setErro('')
    setAviso('')
    const regua: Regua = {
      metodo: reguaMetodo,
      criterios: reguaCriterios,
      regras_eliminatorias: reguaEliminatorias,
      faixas: reguaFaixas,
    }
    const e = validarRegua(regua)
    if (Object.keys(e).length > 0 && !aprovar) {
      // rascunho pode salvar incompleto? A SPEC exige validação para aprovar; rascunho
      // também é validado (contrato do backend) — mostra os erros
      setErrosRegua(e)
      return
    }
    setProcessando(true)
    try {
      // Régua nova SEMPRE nasce rascunho (contrato do backend); aprovar é um update
      // explícito em seguida — é o que registra autor/data da aprovação no histórico.
      const corpo: Record<string, unknown> = {
        produto: reguaProdutoId,
        metodo: reguaMetodo,
        criterios: JSON.stringify(reguaCriterios),
        regras_eliminatorias: JSON.stringify(reguaEliminatorias),
        faixas: JSON.stringify(reguaFaixas),
        status: 'rascunho',
        ambiente: 'teste',
        owner: pb.authStore.record?.id,
      }
      const aprovarCriada = async (id: string) => {
        if (aprovar) await pb.collection('regras_produto').update(id, { status: 'aprovada' })
      }
      if (reguaEditandoId) {
        const atual = reguaVersoes.find((v) => v.id === reguaEditandoId)
        if (atual && atual.status === 'aprovada') {
          // editar aprovada cria rascunho novo (v+1) — a anterior permanece íntegra
          const criada = await pb.collection('regras_produto').create(corpo)
          await aprovarCriada(criada.id)
          setAviso(
            aprovar
              ? 'Régua aprovada e registrada (hash no histórico).'
              : 'Rascunho novo criado — a versão aprovada anterior permanece íntegra.',
          )
        } else {
          await pb
            .collection('regras_produto')
            .update(reguaEditandoId, aprovar ? { ...corpo, status: 'aprovada' } : corpo)
          setAviso(aprovar ? 'Régua aprovada e registrada (hash no histórico).' : 'Rascunho salvo.')
        }
      } else {
        const criada = await pb.collection('regras_produto').create(corpo)
        await aprovarCriada(criada.id)
        setAviso(aprovar ? 'Régua aprovada e registrada (hash no histórico).' : 'Rascunho salvo.')
      }
      await abrirRegua(produtos.find((p) => p.id === reguaProdutoId)!)
    } catch (err) {
      setErro('Falha na régua: ' + String((err as Error).message ?? err))
    } finally {
      setProcessando(false)
    }
  }

  // SPEC-1-005 (task 2faac03b): executar/reverter o job de repontuação (só admin no backend)
  const operarJob = async (jobId: string, acao: 'executar' | 'reverter') => {
    setErro('')
    setAviso('')
    setJobProcessando(jobId + acao)
    try {
      const r = await pb.send('/backend/v1/scoring/repontuar', {
        method: 'POST',
        body: JSON.stringify({ jobId, acao, maxLotes: 20 }),
      })
      const res = r as Record<string, unknown>
      setAviso(
        acao === 'executar'
          ? 'Job executado: ' +
              String(res.status) +
              ' — processados ' +
              String(res.processados) +
              ', ignorados ' +
              String(res.ignorados) +
              ', erros ' +
              String(res.erros) +
              '.'
          : 'Job revertido — ' +
              String(res.restaurados) +
              ' ponteiro(s) restaurado(s); linhas permanecem no histórico.',
      )
      await abrirRegua(produtos.find((p) => p.id === reguaProdutoId)!)
    } catch (err) {
      setErro('Falha no job: ' + String((err as Error).message ?? err))
    } finally {
      setJobProcessando('')
    }
  }

  const arquivarVersao = async (id: string) => {
    setErro('')
    try {
      await pb.collection('regras_produto').update(id, { status: 'arquivada' })
      setAviso('Versão arquivada — histórico preservado.')
      await abrirRegua(produtos.find((p) => p.id === reguaProdutoId)!)
    } catch (err) {
      setErro('Falha ao arquivar: ' + String((err as Error).message ?? err))
    }
  }

  const atualizarCriterio = (idx: number, campo: string, valor: unknown) => {
    const nova = [...reguaCriterios]
    nova[idx] = { ...nova[idx], [campo]: valor } as Criterio
    setReguaCriterios(nova)
  }

  // texto cru do campo Valor (o parse só acontece no blur — digitar não pode quebrar a página)
  const [valoresTexto, setValoresTexto] = useState<Record<string, string>>({})

  // parse seguro: JSON válido (número, lista, bool, null) vira valor estruturado;
  // qualquer outra coisa fica como texto puro — NUNCA lança erro
  // SPEC-1-005: campos JSON do PocketBase chegam JÁ desserializados (objeto/array) —
  // JSON.parse em cima disso lança "[object Object]" is not valid JSON. Parse tolerante.
  const jsonTolerante = (v: unknown, fallback: unknown = []): unknown => {
    if (typeof v === 'string') {
      try {
        return JSON.parse(v)
      } catch (_) {
        return fallback
      }
    }
    return v ?? fallback
  }

  const parseValorSeguro = (texto: string): unknown => {
    const t = texto.trim()
    if (!t) return ''
    try {
      return JSON.parse(t)
    } catch (_) {
      return texto
    }
  }

  // valor → texto cru para o input (string sem aspas; resto em JSON)
  const textoDoValor = (valor: unknown): string => {
    if (valor === undefined || valor === null) return ''
    if (typeof valor === 'string') return valor
    try {
      return JSON.stringify(valor)
    } catch (_) {
      return ''
    }
  }

  const confirmarValor = (idCriterio: string, idx: number) => {
    const texto = valoresTexto[idCriterio]
    if (texto === undefined) return // saiu sem digitar — nada a fazer
    atualizarCriterio(idx, 'valor', parseValorSeguro(texto))
    const novo = { ...valoresTexto }
    delete novo[idCriterio]
    setValoresTexto(novo)
  }

  const adicionarTermo = () => {
    setReguaCriterios([
      ...reguaCriterios,
      { id: 't' + Date.now(), tipo: 'termo', campo: '', operador: 'eq', valor: '', peso: 10 },
    ])
  }

  const adicionarGrupo = () => {
    setReguaCriterios([
      ...reguaCriterios,
      { id: 'g' + Date.now(), tipo: 'grupo', combinacao: 'AND', filhos: [], peso: 10 },
    ])
  }

  const abrirEntrevista = async (p: Produto) => {
    setEntrevistaProdutoId(p.id)
    setErro('')
    setAviso('')
    try {
      const existentes = await pb.collection('entrevista_produtos').getFullList({
        filter: pb.filter('produto = {:p}', { p: p.id }),
      })
      if (existentes.length > 0) {
        setEntrevistaId(existentes[0].id)
        setEntrevistaStatus(existentes[0].status)
        setRespostas(jsonTolerante(existentes[0].respostas, {}))
      } else {
        setEntrevistaId('')
        setEntrevistaStatus('')
        setRespostas({})
      }
    } catch (e) {
      setErro('Falha ao carregar a entrevista: ' + String((e as Error).message ?? e))
    }
  }

  const salvarEntrevista = async (confirmar: boolean) => {
    if (!entrevistaProdutoId) return
    setErro('')
    setAviso('')
    setProcessando(true)
    try {
      const avaliacao = avaliarEntrevista(respostas)
      const corpo: Record<string, unknown> = {
        produto: entrevistaProdutoId,
        roteiro: JSON.stringify(ROTEIRO),
        respostas: JSON.stringify(respostas),
        pendencias: JSON.stringify(avaliacao.pendencias),
        status: confirmar ? 'confirmada' : 'rascunho',
        ambiente: 'teste',
        owner: pb.authStore.record?.id,
      }
      if (entrevistaId) {
        await pb.collection('entrevista_produtos').update(entrevistaId, corpo)
      } else {
        const criada = await pb.collection('entrevista_produtos').create(corpo)
        setEntrevistaId(criada.id)
        setEntrevistaStatus(criada.status)
      }
      setEntrevistaStatus(confirmar ? 'confirmada' : 'rascunho')
      setAviso(
        confirmar
          ? 'Entrevista confirmada e registrada — o produto e a régua continuam inativos até a aprovação.'
          : 'Respostas salvas como rascunho, com as pendências registradas.',
      )
    } catch (e) {
      setErro('Falha na entrevista: ' + String((e as Error).message ?? e))
    } finally {
      setProcessando(false)
    }
  }

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

      {entrevistaProdutoId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Entrevista do produto {produtos.find((p) => p.id === entrevistaProdutoId)?.nome ?? ''}
              {entrevistaStatus === 'confirmada' && (
                <Badge className="ml-2 bg-green-100 text-green-800">Confirmada</Badge>
              )}
              {entrevistaStatus === 'rascunho' && (
                <Badge variant="secondary" className="ml-2">
                  Rascunho
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Roteiro da entrevista conduzida com o Maestro. Respostas parciais são salvas com
              pendências; a confirmação exige todas as respostas e NÃO ativa o produto nem a régua
              (aprovação vem na etapa seguinte).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ROTEIRO.map((pergunta) => (
              <div key={pergunta.chave} className="space-y-1">
                <Label>{pergunta.pergunta}</Label>
                <Input
                  value={respostas[pergunta.chave] ?? ''}
                  onChange={(e) => setRespostas({ ...respostas, [pergunta.chave]: e.target.value })}
                />
              </div>
            ))}
            {(() => {
              const avaliacao = avaliarEntrevista(respostas)
              return (
                <>
                  {!avaliacao.completa && (
                    <p className="text-xs text-amber-700">
                      Pendências: {avaliacao.pendencias.length} pergunta(s) sem resposta.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => void abrirEntrevista(p)}>
                      Entrevista
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void abrirRegua(p)}>
                      Régua
                    </Button>{' '}
                    <Button
                      disabled={processando || !avaliacao.completa}
                      onClick={() => void salvarEntrevista(true)}
                    >
                      Confirmar entrevista
                    </Button>
                  </div>
                </>
              )
            })()}
          </CardContent>
        </Card>
      )}

      {reguaProdutoId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Régua do produto {produtos.find((p) => p.id === reguaProdutoId)?.nome ?? ''}
            </CardTitle>
            <CardDescription>
              Critérios (termo simples ou grupo E/OU com peso no termo), eliminatórias e faixas
              A/B/C/D. Editar uma versão aprovada cria um rascunho novo — a anterior permanece
              íntegra. Aprovar exige validação verde e registra autor/data. Sem código — critérios
              são dados estruturados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Método</Label>
                <Select
                  value={reguaMetodo}
                  onValueChange={(v) => setReguaMetodo(v as 'ponderado' | 'pontos')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ponderado">Ponderado (soma dos pesos)</SelectItem>
                    <SelectItem value="pontos">Pontos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Critérios</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={adicionarTermo}>
                    + Termo
                  </Button>
                  <Button variant="outline" size="sm" onClick={adicionarGrupo}>
                    + Grupo E/OU
                  </Button>
                </div>
              </div>
              {reguaCriterios.map((c, i) => (
                <div
                  key={c.id}
                  className="grid grid-cols-1 gap-2 rounded-md border p-2 sm:grid-cols-6"
                >
                  <div className="sm:col-span-1">
                    <Label className="text-xs">Tipo</Label>
                    <Input value={c.tipo === 'grupo' ? 'Grupo E/OU' : 'Termo'} disabled />
                  </div>
                  {c.tipo === 'grupo' ? (
                    <>
                      <div className="sm:col-span-1">
                        <Label className="text-xs">Combinação</Label>
                        <Select
                          value={(c as Grupo).combinacao}
                          onValueChange={(v) => atualizarCriterio(i, 'combinacao', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AND">E (todos)</SelectItem>
                            <SelectItem value="OR">OU (ao menos um)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-xs">Filhos (campo:operador:valor; ...)</Label>
                        <Input
                          value={(c as Grupo).filhos
                            .map((f) => `${f.campo}:${f.operador}:${JSON.stringify(f.valor)}`)
                            .join('; ')}
                          onChange={(e) => {
                            const filhos = e.target.value
                              .split(';')
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map((s) => {
                                const [campo, operador, ...resto] = s.split(':')
                                let valor: unknown = resto.join(':')
                                try {
                                  valor = JSON.parse(resto.join(':'))
                                } catch (_) {
                                  // valor textual sem JSON — fica como string
                                }
                                return {
                                  campo: (campo ?? '').trim(),
                                  operador: (operador ?? 'eq').trim(),
                                  valor,
                                }
                              })
                            atualizarCriterio(i, 'filhos', filhos)
                          }}
                          placeholder={'porte:gte:50; segmento:in:["industria"]'}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Campo</Label>
                        <Input
                          value={(c as Termo).campo}
                          onChange={(e) => atualizarCriterio(i, 'campo', e.target.value)}
                          placeholder="porte"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-xs">Operador</Label>
                        <Select
                          value={(c as Termo).operador}
                          onValueChange={(v) => atualizarCriterio(i, 'operador', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERADORES.map((o) => (
                              <SelectItem key={o} value={o}>
                                {o}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="sm:col-span-1">
                        <Label className="text-xs">Valor</Label>
                        <Input
                          value={
                            valoresTexto[c.id] ??
                            (typeof (c as Termo).valor === 'string'
                              ? ((c as Termo).valor as string)
                              : JSON.stringify((c as Termo).valor))
                          }
                          onChange={(e) =>
                            setValoresTexto({ ...valoresTexto, [c.id]: e.target.value })
                          }
                          onBlur={() => confirmarValor(c.id, i)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmarValor(c.id, i)
                          }}
                          placeholder={'texto, 50, ["industria"]'}
                        />
                      </div>
                    </>
                  )}
                  <div className="sm:col-span-1">
                    <Label className="text-xs">Peso</Label>
                    <Input
                      type="number"
                      min={0}
                      value={c.peso}
                      onChange={(e) => atualizarCriterio(i, 'peso', Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              {reguaFaixas.map((f, i) => (
                <div key={f.letra} className="space-y-1 rounded-md border p-2">
                  <Label className="text-xs">Faixa {f.letra}</Label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={f.de}
                      onChange={(e) => {
                        const nova = [...reguaFaixas]
                        nova[i] = { ...f, de: Number(e.target.value) }
                        setReguaFaixas(nova)
                      }}
                    />
                    <Input
                      type="number"
                      value={f.ate}
                      onChange={(e) => {
                        const nova = [...reguaFaixas]
                        nova[i] = { ...f, ate: Number(e.target.value) }
                        setReguaFaixas(nova)
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {Object.keys(errosRegua).length > 0 && (
              <ul className="list-inside list-disc text-xs text-red-600">
                {Object.entries(errosRegua).map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={processando}
                onClick={() => {
                  const e = validarRegua({
                    metodo: reguaMetodo,
                    criterios: reguaCriterios,
                    regras_eliminatorias: reguaEliminatorias,
                    faixas: reguaFaixas,
                  })
                  setErrosRegua(e)
                  if (Object.keys(e).length === 0) void salvarRegua(false)
                }}
              >
                Salvar rascunho
              </Button>
              <Button
                disabled={processando}
                onClick={() => {
                  const e = validarRegua({
                    metodo: reguaMetodo,
                    criterios: reguaCriterios,
                    regras_eliminatorias: reguaEliminatorias,
                    faixas: reguaFaixas,
                  })
                  setErrosRegua(e)
                  if (Object.keys(e).length === 0) void salvarRegua(true)
                }}
              >
                Aprovar régua
              </Button>
            </div>

            {jobsVersoes.length > 0 && (
              <div className="overflow-x-auto border-t pt-2">
                <p className="text-xs font-medium">Repontuação (job por versão aprovada)</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 pr-2">Versão</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1 pr-2">Processados</th>
                      <th className="py-1 pr-2">Ignorados</th>
                      <th className="py-1 pr-2">Erros</th>
                      <th className="py-1 pr-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobsVersoes.map((j) => (
                      <tr key={String(j.id)} className="border-b">
                        <td className="py-1 pr-2 font-medium">v{String(j.versao)}</td>
                        <td className="py-1 pr-2">{String(j.status)}</td>
                        <td className="py-1 pr-2">{String(j.processados ?? 0)}</td>
                        <td className="py-1 pr-2">{String(j.ignorados ?? 0)}</td>
                        <td className="py-1 pr-2">{String(j.erros ?? 0)}</td>
                        <td className="py-1 pr-2">
                          {(j.status === 'pendente' || j.status === 'executando') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={jobProcessando !== ''}
                              onClick={() => void operarJob(String(j.id), 'executar')}
                            >
                              {jobProcessando === String(j.id) + 'executar'
                                ? 'Executando…'
                                : 'Executar'}
                            </Button>
                          )}
                          {j.status === 'concluido' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={jobProcessando !== ''}
                              onClick={() => void operarJob(String(j.id), 'reverter')}
                            >
                              {jobProcessando === String(j.id) + 'reverter'
                                ? 'Revertendo…'
                                : 'Reverter'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reguaVersoes.length > 0 && (
              <div className="overflow-x-auto border-t pt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 pr-2">Versão</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1 pr-2">Hash</th>
                      <th className="py-1 pr-2">Aprovada em</th>
                      <th className="py-1 pr-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reguaVersoes.map((v) => (
                      <tr key={String(v.id)} className="border-b">
                        <td className="py-1 pr-2 font-medium">v{String(v.versao)}</td>
                        <td className="py-1 pr-2">{String(v.status)}</td>
                        <td className="py-1 pr-2 font-mono">{String(v.hash).substring(0, 12)}…</td>
                        <td className="py-1 pr-2">{String(v.aprovado_em ?? '—')}</td>
                        <td className="py-1 pr-2">
                          {v.status === 'rascunho' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void arquivarVersao(String(v.id))}
                            >
                              Arquivar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                        <Button variant="ghost" size="sm" onClick={() => void abrirEntrevista(p)}>
                          Entrevista
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void abrirRegua(p)}>
                          Régua
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
