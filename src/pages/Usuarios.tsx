import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getUsuarios, createUsuario, updateUsuarioRole, Usuario } from '@/services/leads'
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
import { Badge } from '@/components/ui/badge'

export default function Usuarios() {
  const { user } = useAuth()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [role, setRole] = useState<'admin' | 'vendedor'>('vendedor')

  const loadUsuarios = async () => {
    setLoading(true)
    try {
      const data = await getUsuarios()
      setUsuarios(data)
      setError('')
    } catch (e) {
      setError('Não foi possível carregar os usuários.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsuarios()
  }, [])

  const ehAdmin = user?.role === 'admin'

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !senha || !nome || !role) {
      setError('Preencha e-mail, nome, senha e nível de acesso.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createUsuario({
        email,
        password: senha,
        passwordConfirm: senha,
        name: nome,
        role,
      })
      setEmail('')
      setSenha('')
      setNome('')
      setRole('vendedor')
      setNotice('Usuário criado com sucesso.')
      setTimeout(() => setNotice(''), 4000)
      await loadUsuarios()
    } catch (e) {
      setError('Não foi possível criar o usuário (e-mail pode já existir ou senha < 8).')
    } finally {
      setSaving(false)
    }
  }

  const onMudarRole = async (u: Usuario, novoRole: 'admin' | 'vendedor') => {
    if (u.id === user?.id) {
      setError('Você não pode mudar seu próprio nível de acesso.')
      return
    }
    if (
      !confirm(`Mudar o acesso de ${u.email} para ${novoRole === 'admin' ? 'Admin' : 'Vendedor'}?`)
    ) {
      return
    }
    setError('')
    try {
      await updateUsuarioRole(u.id, novoRole)
      setNotice('Nível de acesso atualizado.')
      setTimeout(() => setNotice(''), 4000)
      await loadUsuarios()
    } catch (e) {
      setError('Não foi possível mudar o nível de acesso.')
    }
  }

  if (!ehAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-[#10454f]">Usuários</h1>
        <p className="text-muted-foreground">
          Apenas administradores (José e Evandro) podem gerenciar usuários.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#10454f]">Usuários e níveis de acesso</h1>
        <p className="text-muted-foreground">
          Cadastre vendedores para trabalharem bases de leads distintas. Vendedores veem apenas os
          próprios leads; administradores (você e Evandro) veem tudo.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo usuário</CardTitle>
          <CardDescription>Crie um acesso para um vendedor ou outro administrador.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                placeholder="Nome do vendedor"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                placeholder="vendedor@empresa.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha *</Label>
              <Input
                id="senha"
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Nível de acesso *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'vendedor')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor (vê só os próprios leads)</SelectItem>
                  <SelectItem value="admin">Admin (vê tudo, gerencia usuários)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
            {notice && <p className="text-sm text-green-700 sm:col-span-2">{notice}</p>}
            <div className="sm:col-span-2">
              <Button type="submit" className="bg-[#10454f] hover:bg-[#0d3942]" disabled={saving}>
                {saving ? 'Criando...' : 'Criar usuário'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuários ({usuarios.length})</CardTitle>
          <CardDescription>Gerencie os níveis de acesso da equipe.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : usuarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado.</p>
          ) : (
            <div className="space-y-3">
              {usuarios.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">
                      {u.name || u.email}
                      {u.id === user?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                      {u.role === 'admin' ? 'Admin' : 'Vendedor'}
                    </Badge>
                    {u.id !== user?.id && (
                      <Select
                        value={u.role}
                        onValueChange={(v) => onMudarRole(u, v as 'admin' | 'vendedor')}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vendedor">Vendedor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
