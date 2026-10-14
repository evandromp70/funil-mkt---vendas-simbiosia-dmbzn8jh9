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
  type Empresa,
  type Pessoa,
} from '@/services/cadastro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function Cadastro() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
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

  const carregar = async () => {
    try {
      const [es, ps] = await Promise.all([getEmpresas(), getPessoas()])
      setEmpresas(es)
      setPessoas(ps)
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
            {pessoas.map((p) => (
              <Card key={p.id}>
                <CardContent className="py-3">
                  <p className="font-medium">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.email_norm || 'sem e-mail'}
                    {p.telefone_norm ? ' · ' + p.telefone_norm : ''}
                    {p.relacionamento_conhecido ? ' · conhecido' : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
            {pessoas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma pessoa cadastrada.</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
