// SPEC-1-002 (task ea6db5dc): tela de cadastro único — empresa e pessoa separadas.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getEmpresas,
  criarEmpresa,
  getPessoas,
  criarPessoa,
  normalizarEmail,
  normalizarTelefone,
  normalizarLinkedin,
  getConflitos,
  resolverConflito,
  getOrigensPessoa,
  getBloqueiosPessoa,
  registrarPedidoSaida,
  elegibilidadeFria,
  getFusoes,
  fundirPessoas,
  reverterFusao,
  type BloqueioPessoa,
  type ConflitoCadastro,
  type Empresa,
  type FusaoCadastro,
  type OrigemPessoa,
  type Pessoa,
} from '@/services/cadastro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function Cadastro() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [conflitos, setConflitos] = useState<ConflitoCadastro[]>([])
  const [fusoes, setFusoes] = useState<FusaoCadastro[]>([])
  const [origensPorPessoa, setOrigensPorPessoa] = useState<Record<string, OrigemPessoa[]>>({})
  const [fusaoOrigem, setFusaoOrigem] = useState('')
  const [fusaoDestino, setFusaoDestino] = useState('')
  const [bloqueiosPorPessoa, setBloqueiosPorPessoa] = useState<Record<string, BloqueioPessoa[]>>({})
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  // formulário empresa
  const [razao, setRazao] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [setor, setSetor] = useState('')

  // formulário pessoa
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [linkedin, setLinkedin] = useState('')

  const carregarConflitos = async () => {
    try {
      setConflitos(await getConflitos())
      setFusoes(await getFusoes())
    } catch (e) {
      setErro('Não foi possível carregar conflitos: ' + String(e))
    }
  }

  const carregar = async () => {
    try {
      const [es, ps] = await Promise.all([getEmpresas(), getPessoas()])
      setEmpresas(es)
      setPessoas(ps)
      await carregarConflitos()
      // origens e bloqueios por pessoa (para o status de fria)
      const origs: Record<string, OrigemPessoa[]> = {}
      const bls: Record<string, BloqueioPessoa[]> = {}
      await Promise.all(
        ps.map(async (p) => {
          try {
            origs[p.id] = await getOrigensPessoa(p.id)
            bls[p.id] = await getBloqueiosPessoa(p.id)
          } catch (_) {
            origs[p.id] = []
            bls[p.id] = []
          }
        }),
      )
      setOrigensPorPessoa(origs)
      setBloqueiosPorPessoa(bls)
    } catch (e) {
      setErro('Não foi possível carregar o cadastro: ' + String(e))
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const salvarEmpresa = async () => {
    setErro('')
    setAviso('')
    if (!razao.trim()) {
      setErro('Razão social é obrigatória.')
      return
    }
    try {
      await criarEmpresa({
        razao_social: razao.trim(),
        cnpj_norm: cnpj.replace(/\D/g, '') || undefined,
        setor: setor.trim() || undefined,
      })
      setRazao('')
      setCnpj('')
      setSetor('')
      setAviso('Empresa cadastrada.')
      await carregar()
    } catch (e) {
      setErro('Erro ao cadastrar empresa: ' + String(e))
    }
  }

  const salvarPessoa = async () => {
    setErro('')
    setAviso('')
    if (!nome.trim()) {
      setErro('Nome é obrigatório.')
      return
    }
    try {
      await criarPessoa({
        nome: nome.trim(),
        email_norm: normalizarEmail(email) || undefined,
        telefone_norm: normalizarTelefone(telefone) || undefined,
        linkedin_norm: normalizarLinkedin(linkedin) || undefined,
      })
      setNome('')
      setEmail('')
      setTelefone('')
      setLinkedin('')
      setAviso('Pessoa cadastrada.')
      await carregar()
    } catch (e) {
      setErro('Erro ao cadastrar pessoa: ' + String(e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cadastro único</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Voltar ao funil
        </Link>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}

      <Tabs defaultValue="empresas">
        <TabsList>
          <TabsTrigger value="empresas">Empresas ({empresas.length})</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas ({pessoas.length})</TabsTrigger>
          <TabsTrigger value="conflitos">
            Conflitos ({conflitos.filter((c) => c.status === 'pendente').length})
          </TabsTrigger>
          <TabsTrigger value="fusoes">Fusões ({fusoes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="empresas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nova empresa</CardTitle>
              <CardDescription>
                Razão social é obrigatória. CNPJ identifica a empresa — sem ele, não há fusão
                automática (a SPEC proíbe fundir por nome).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Razão social *</Label>
                <Input
                  value={razao}
                  onChange={(e) => setRazao(e.target.value)}
                  placeholder="Razão social"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>CNPJ</Label>
                  <Input
                    value={cnpj}
                    onChange={(e) => setCnpj(e.target.value)}
                    placeholder="Somente dígitos (opcional)"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Setor</Label>
                  <Input
                    value={setor}
                    onChange={(e) => setSetor(e.target.value)}
                    placeholder="Ex.: Indústria"
                  />
                </div>
              </div>
              <Button onClick={salvarEmpresa}>Cadastrar empresa</Button>
            </CardContent>
          </Card>

          <div className="mt-4 space-y-2">
            {empresas.map((e) => (
              <Card key={e.id}>
                <CardContent className="py-3">
                  <p className="font-medium">{e.razao_social}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.cnpj_norm ? 'CNPJ: ' + e.cnpj_norm : 'sem CNPJ'}
                    {e.setor ? ' · ' + e.setor : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
            {empresas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pessoas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nova pessoa</CardTitle>
              <CardDescription>
                Identidade por contato individual normalizado (e-mail/telefone/LinkedIn). E-mails
                genéricos (contato@, comercial@) não identificam pessoa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Nome da pessoa"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>E-mail</Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="individual@empresa.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    placeholder="Com DDI, se houver"
                  />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn</Label>
                  <Input
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="URL do perfil"
                  />
                </div>
              </div>
              <Button onClick={salvarPessoa}>Cadastrar pessoa</Button>
            </CardContent>
          </Card>

          <div className="mt-4 space-y-2">
            {pessoas.map((p) => {
              const eleg = elegibilidadeFria(
                p,
                origensPorPessoa[p.id] ?? [],
                bloqueiosPorPessoa[p.id] ?? [],
              )
              const rotulo =
                eleg.status === 'excluida'
                  ? 'Protegida (conhecida)'
                  : eleg.status === 'bloqueada'
                    ? eleg.motivo === 'pedido_saida'
                      ? 'Bloqueada (pedido de saída)'
                      : 'Bloqueada (relacionamento)'
                    : 'Elegível para lista fria'
              return (
                <Card key={p.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{p.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.email_norm || 'sem e-mail'}
                          {p.telefone_norm ? ' · ' + p.telefone_norm : ''}
                          {p.relacionamento_conhecido ? ' · conhecido' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{rotulo}</span>
                        {eleg.status !== 'bloqueada' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await registrarPedidoSaida(p.id)
                              await carregar()
                            }}
                          >
                            Registrar pedido de saída
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {pessoas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma pessoa cadastrada.</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="conflitos">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fila de conflitos de identidade</CardTitle>
              <CardDescription>
                Um mesmo identificador individual (e-mail/telefone/LinkedIn) apareceu em mais de uma
                pessoa. Nada foi fundido — decida caso a caso. "Pessoas distintas" mantém os dois
                cadastros; a fusão em si vem na task de fusão reversível.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {conflitos.map((c) => (
                <div key={c.id} className="rounded border p-3">
                  <p className="text-sm font-medium">
                    {c.identificador_tipo}: {c.identificador_norm}{' '}
                    {c.status !== 'pendente' && (
                      <span className="ml-1 text-xs text-muted-foreground">({c.status})</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.detalhe}</p>
                  {c.status === 'pendente' && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await resolverConflito(c.id, 'distintos')
                          await carregarConflitos()
                        }}
                      >
                        Marcar pessoas distintas
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {conflitos.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum conflito registrado.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="fusoes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Fusões de cadastro (auditadas e reversíveis)
              </CardTitle>
              <CardDescription>
                Fundir move os vínculos (leads, origens, bloqueios) para a pessoa destino e marca a
                origem como fundida — nada é apagado. A reversão restaura os vínculos; se houver
                alteração posterior, exige revisão em vez de sobrescrever.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2 items-end">
                <div className="space-y-1">
                  <Label>Pessoa origem (duplicata)</Label>
                  <Select value={fusaoOrigem} onValueChange={setFusaoOrigem}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Escolha a duplicata" />
                    </SelectTrigger>
                    <SelectContent>
                      {pessoas
                        .filter((p) => !p.fundida_em)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome} {p.email_norm ? `(${p.email_norm})` : '(sem e-mail)'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Pessoa destino (a que fica)</Label>
                  <Select value={fusaoDestino} onValueChange={setFusaoDestino}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Escolha a que fica" />
                    </SelectTrigger>
                    <SelectContent>
                      {pessoas
                        .filter((p) => !p.fundida_em && p.id !== fusaoOrigem)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome} {p.email_norm ? `(${p.email_norm})` : '(sem e-mail)'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={async () => {
                    setErro('')
                    try {
                      await fundirPessoas(fusaoOrigem.trim(), fusaoDestino.trim())
                      setFusaoOrigem('')
                      setFusaoDestino('')
                      setAviso('Fusão aplicada.')
                      await carregar()
                    } catch (e2) {
                      setErro('Erro ao fundir: ' + String(e2))
                    }
                  }}
                >
                  Fundir
                </Button>
              </div>
              {fusoes.map((f) => (
                <div key={f.id} className="rounded border p-3">
                  <p className="text-sm font-medium">
                    {f.status} · {f.entidade_origem} {f.id_origem.slice(0, 8)}… →{' '}
                    {f.id_destino.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-muted-foreground">{f.motivo}</p>
                  {f.status === 'aplicada' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={async () => {
                        setErro('')
                        try {
                          await reverterFusao(f.id)
                          setAviso('Fusão revertida.')
                          await carregar()
                        } catch (e2) {
                          setErro('Reversão com revisão: ' + String(e2))
                          await carregar()
                        }
                      }}
                    >
                      Reverter
                    </Button>
                  )}
                </div>
              ))}
              {fusoes.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma fusão registrada.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
