import { useCallback, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { KeyRound, Copy, RefreshCw, Trash2, Plus, Server } from 'lucide-react'

type Chave = {
  id: string
  nome: string
  prefixo: string
  escopo: 'leitura' | 'leitura_escrita' | 'admin'
  ativa: boolean
  ultimo_uso_em: string
  criada_em: string
  dono: string
}

const ESCOPO_ROTULO: Record<string, string> = {
  leitura: 'Leitura',
  leitura_escrita: 'Leitura e escrita',
  admin: 'Admin',
}

const URL_MCP = `${pb.baseUrl}/backend/v1/mcp`

const EXEMPLO_JSON = JSON.stringify(
  {
    mcpServers: {
      'funil-simbiosia': {
        url: URL_MCP,
        headers: { Authorization: 'Bearer sk_live_SUA_CHAVE_AQUI' },
      },
    },
  },
  null,
  2,
)

const EXEMPLO_CURL = `curl -X POST ${URL_MCP} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk_live_SUA_CHAVE_AQUI" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`

export default function McpKeys() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [chaves, setChaves] = useState<Chave[]>([])
  const [carregando, setCarregando] = useState(true)
  const [dialogoNova, setDialogoNova] = useState(false)
  const [nome, setNome] = useState('')
  const [escopo, setEscopo] = useState<'leitura' | 'leitura_escrita' | 'admin'>('leitura')
  const [criando, setCriando] = useState(false)
  const [chaveGerada, setChaveGerada] = useState<string | null>(null)
  const [revogando, setRevogando] = useState<Chave | null>(null)

  const ehAdmin = user?.role === 'admin'

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await pb.send<{ total: number; itens: Chave[]; admin: boolean }>(
        '/backend/v1/keys',
        { method: 'GET' },
      )
      setChaves(res.itens || [])
    } catch (err: unknown) {
      toast({
        title: 'Erro ao carregar chaves',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }, [toast])

  useEffect(() => {
    carregar()
  }, [carregar])

  const criarChave = async () => {
    if (!nome.trim()) return
    setCriando(true)
    try {
      const res = await pb.send<{ chave: string }>('/backend/v1/keys', {
        method: 'POST',
        body: JSON.stringify({ nome: nome.trim(), escopo }),
      })
      setChaveGerada(res.chave)
      setDialogoNova(false)
      setNome('')
      setEscopo('leitura')
      carregar()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao criar chave',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    } finally {
      setCriando(false)
    }
  }

  const revogar = async () => {
    if (!revogando) return
    try {
      await pb.send(`/backend/v1/keys/${revogando.id}`, { method: 'DELETE' })
      toast({ title: 'Chave revogada', description: `${revogando.nome} não pode mais ser usada.` })
      setRevogando(null)
      carregar()
    } catch (err: unknown) {
      toast({
        title: 'Erro ao revogar',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      })
    }
  }

  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      toast({ title: 'Copiado!', description: rotulo })
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' })
    }
  }

  const dataFmt = (iso: string) =>
    iso ? new Date(iso.replace(' ', 'T')).toLocaleString('pt-BR') : '—'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <KeyRound className="h-6 w-6" /> MCP &amp; Chaves de API
          </h1>
          <p className="text-sm text-muted-foreground">
            Chaves para agentes externos (MCP) operarem o funil. A chave completa aparece uma única
            vez na criação.
          </p>
        </div>
        <Button onClick={() => setDialogoNova(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova chave
        </Button>
      </div>

      {/* lista de chaves */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>{ehAdmin ? 'Todas as chaves (admin)' : 'Suas chaves'}</span>
            <Button variant="ghost" size="sm" onClick={carregar} disabled={carregando}>
              <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chaves.length === 0 && !carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma chave criada ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Nome</th>
                    <th className="py-2 pr-4">Chave</th>
                    <th className="py-2 pr-4">Escopo</th>
                    <th className="py-2 pr-4">Criada em</th>
                    <th className="py-2 pr-4">Último uso</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {chaves.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{c.nome}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{c.prefixo}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={c.escopo === 'admin' ? 'default' : 'secondary'}>
                          {ESCOPO_ROTULO[c.escopo] || c.escopo}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-xs">{dataFmt(c.criada_em)}</td>
                      <td className="py-2 pr-4 text-xs">{dataFmt(c.ultimo_uso_em)}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={c.ativa ? 'default' : 'outline'}>
                          {c.ativa ? 'Ativa' : 'Revogada'}
                        </Badge>
                      </td>
                      <td className="py-2 text-right">
                        {c.ativa && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setRevogando(c)}
                          >
                            <Trash2 className="h-4 w-4" /> Revogar
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

      {/* como conectar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4" /> Como conectar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Endpoint MCP (JSON-RPC 2.0 via HTTP)</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-muted px-3 py-2 text-xs">
                {URL_MCP}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copiar(URL_MCP, 'Endpoint copiado')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label>Configuração para clientes MCP (ex.: Claude Desktop, Cursor)</Label>
            <div className="mt-1 flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded bg-muted p-3 text-xs">
                {EXEMPLO_JSON}
              </pre>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copiar(EXEMPLO_JSON, 'Configuração copiada')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label>Teste via curl</Label>
            <div className="mt-1 flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded bg-muted p-3 text-xs">
                {EXEMPLO_CURL}
              </pre>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copiar(EXEMPLO_CURL, 'Comando copiado')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            A autenticação usa o header <code>Authorization: Bearer sk_live_...</code> (ou{' '}
            <code>X-API-Key</code>). A chave é validada por hash no servidor; chaves de escopo{' '}
            <strong>Leitura</strong> só acessam ferramentas de consulta,{' '}
            <strong>Leitura e escrita</strong> também criam e atualizam, e <strong>Admin</strong>{' '}
            libera tudo — inclusive consultar a configuração do sistema.
          </p>
        </CardContent>
      </Card>

      {/* modal nova chave */}
      <Dialog open={dialogoNova} onOpenChange={setDialogoNova}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
            <DialogDescription>Escolha um nome e o escopo de permissão da chave.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="chave-nome">Nome</Label>
              <Input
                id="chave-nome"
                value={nome}
                onChange={(e2) => setNome(e2.target.value)}
                placeholder="Ex.: Agente Claude"
              />
            </div>
            <div>
              <Label>Escopo</Label>
              <Select value={escopo} onValueChange={(v) => setEscopo(v as typeof escopo)}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o escopo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leitura">Leitura — só consulta</SelectItem>
                  <SelectItem value="leitura_escrita">
                    Leitura e escrita — cria e atualiza
                  </SelectItem>
                  <SelectItem value="admin" disabled={!ehAdmin}>
                    Admin — tudo, incl. sistema_config
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoNova(false)}>
              Cancelar
            </Button>
            <Button onClick={criarChave} disabled={!nome.trim() || criando}>
              {criando ? 'Criando…' : 'Criar chave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* chave gerada — aparece UMA vez */}
      <Dialog open={!!chaveGerada} onOpenChange={(abrir) => !abrir && setChaveGerada(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chave criada!</DialogTitle>
            <DialogDescription>
              Copie agora: esta chave <strong>não será exibida novamente</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-3 py-2 font-mono text-xs">
              {chaveGerada}
            </code>
            <Button size="sm" onClick={() => copiar(chaveGerada || '', 'Chave copiada')}>
              <Copy className="mr-1 h-4 w-4" /> Copiar
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChaveGerada(null)}>
              Guardei — fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirmação de revogação */}
      <Dialog open={!!revogando} onOpenChange={(abrir) => !abrir && setRevogando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar chave?</DialogTitle>
            <DialogDescription>
              A chave <strong>{revogando?.nome}</strong> ({revogando?.prefixo}) deixará de funcionar
              imediatamente. Agentes conectados com ela receberão 401.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevogando(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={revogar}>
              Revogar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
