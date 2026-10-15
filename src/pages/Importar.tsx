// SPEC-1-003 (task 0574671d): importação em lote com relatório por linha — CA-1-003-02.
// Fluxo: arquivo → prévia (c7240db4) → confirmação (lista/coorte/dono/ambiente) → relatório.
// Repetir o mesmo lote devolve o relatório existente (sem duplicar) — sinalizado na tela.
// Nenhuma escrita antes da confirmação; fórmulas neutralizadas; sem API externa.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseCsv, detectarSeparador, neutralizarFormula, type CsvResultado } from '@/services/csv'
import {
  confirmarImportacao,
  hashArquivo,
  getListas,
  getUsuarios,
  type RelatorioImportacao,
} from '@/services/importacoes'
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

const LIMITE_LINHAS = 1000
const LIMITE_BYTES = 5 * 1024 * 1024

const CAMPOS_MAPEAVEIS = [
  'razao_social',
  'cnpj',
  'nome_contato',
  'email_pessoa',
  'telefone_pessoa',
  'linkedin_pessoa',
  'cargo',
  'ignorar',
]

const CORES_STATUS: Record<string, string> = {
  nova: 'text-green-700',
  repetida: 'text-blue-700',
  incompleta: 'text-amber-700',
  erro: 'text-red-700',
}

export default function Importar() {
  const [resultado, setResultado] = useState<CsvResultado | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [separador, setSeparador] = useState<string>('auto')
  const [mapeamento, setMapeamento] = useState<Record<number, string>>({})
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [processando, setProcessando] = useState(false)
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null)
  const [listaId, setListaId] = useState('') // opcional
  const [coorte, setCoorte] = useState('fria')
  const [donoId, setDonoId] = useState('')
  const [ambiente, setAmbiente] = useState('teste')
  const [listas, setListas] = useState<Array<{ id: string; nome: string }>>([])
  const [usuarios, setUsuarios] = useState<Array<{ id: string; nome: string }>>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const carregarArquivo = async (arquivo: File) => {
    setErro('')
    setAviso('')
    setResultado(null)
    setRelatorio(null)
    setMapeamento({})
    if (arquivo.size > LIMITE_BYTES) {
      setErro('Arquivo excede o limite de 5 MB (demonstração).')
      return
    }
    const texto = await arquivo.text()
    const sep = separador === 'auto' ? detectarSeparador(texto) : separador
    const r = parseCsv(texto, { separador: sep, limiteLinhas: LIMITE_LINHAS })
    if (r.ok) {
      const mapa: Record<number, string> = {}
      r.cabecalho.forEach((c, i) => {
        const norm = c.trim().toLowerCase()
        if (CAMPOS_MAPEAVEIS.includes(norm)) mapa[i] = norm
        else if (/razao|empresa|fantasia/.test(norm)) mapa[i] = 'razao_social'
        else if (/cnpj/.test(norm)) mapa[i] = 'cnpj'
        else if (/nome|contato/.test(norm)) mapa[i] = 'nome_contato'
        else if (/mail/.test(norm)) mapa[i] = 'email_pessoa'
        else if (/tele|fone|whats/.test(norm)) mapa[i] = 'telefone_pessoa'
        else if (/linkedin/.test(norm)) mapa[i] = 'linkedin_pessoa'
        else if (/cargo|funcao/.test(norm)) mapa[i] = 'cargo'
        else mapa[i] = 'ignorar'
      })
      setMapeamento(mapa)
      // contexto da confirmação: listas e usuários
      try {
        const [ls, us] = await Promise.all([getListas(), getUsuarios()])
        setListas(ls.map((l) => ({ id: l.id, nome: (l as { nome: string }).nome })))
        setUsuarios(
          us.map((u) => ({
            id: u.id,
            nome:
              (u as { name?: string; email?: string }).name ||
              (u as { email?: string }).email ||
              u.id,
          })),
        )
        const eu = us.find((u) => u.id === (inputRef.current?.dataset?.uid ?? ''))
        if (eu) setDonoId(eu.id)
      } catch (_) {}
    }
    setResultado(r)
  }

  const confirmar = async () => {
    if (!resultado || !resultado.ok || !inputRef.current?.files?.[0]) return
    setErro('')
    setProcessando(true)
    try {
      const arquivo = inputRef.current.files[0]
      const texto = await arquivo.text()
      const hash = await hashArquivo(texto)
      const linhas = resultado.linhas.map((celulas) => {
        const obj: Record<string, string> = {}
        celulas.forEach((c, i) => {
          obj[String(i)] = c
        })
        return obj
      })
      const rel = await confirmarImportacao({
        nome_arquivo: nomeArquivo,
        arquivo_hash: hash,
        mapeamento,
        linhas,
        lista: listaId,
        coorte,
        dono: donoId,
        ambiente,
      })
      setRelatorio(rel)
      setAviso(
        rel.repetido
          ? 'Este lote já tinha sido importado — mostrando o relatório original (nada foi duplicado).'
          : 'Importação concluída. Importar o mesmo arquivo de novo devolve este mesmo relatório.',
      )
    } catch (e) {
      setErro('Falha na confirmação: ' + String((e as Error).message ?? e))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Importar base</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Voltar ao funil
        </Link>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {aviso && <p className="text-sm text-green-700">{aviso}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Escolha o arquivo CSV</CardTitle>
          <CardDescription>
            UTF-8, até 5 MB ou {LIMITE_LINHAS} linhas (demonstração). Vírgula ou ponto-e-vírgula,
            com aspas e campos multilinha. Nada é escrito antes da sua confirmação — esta etapa é só
            prévia.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Separador</Label>
            <Select
              value={separador}
              onValueChange={(v) => {
                setSeparador(v)
                if (inputRef.current?.files?.[0]) void carregarArquivo(inputRef.current.files[0])
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Detectar automaticamente</SelectItem>
                <SelectItem value=",">Vírgula (,)</SelectItem>
                <SelectItem value=";">Ponto e vírgula (;)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setNomeArquivo(f.name)
                void carregarArquivo(f)
              }
            }}
          />
          {nomeArquivo && <p className="text-xs text-muted-foreground">Arquivo: {nomeArquivo}</p>}
        </CardContent>
      </Card>

      {resultado && !resultado.ok && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-red-600">Prévia recusada: {resultado.motivo}</p>
            <p className="text-xs text-muted-foreground">
              Nenhuma linha foi lida para importação. Corrija o arquivo e tente de novo.
            </p>
          </CardContent>
        </Card>
      )}

      {resultado && resultado.ok && !relatorio && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              2. Prévia — {resultado.totalLinhas} linha(s) de dados
            </CardTitle>
            <CardDescription>
              Separador detectado: {resultado.separador === ',' ? 'vírgula' : 'ponto e vírgula'}.
              Confira o mapeamento das colunas antes de confirmar a importação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {resultado.cabecalho.map((col, i) => (
                <div key={i} className="space-y-1">
                  <Label>
                    Coluna {i + 1}: {col.trim() || '(sem nome)'}
                  </Label>
                  <Select
                    value={mapeamento[i] ?? 'ignorar'}
                    onValueChange={(v) => setMapeamento({ ...mapeamento, [i]: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPOS_MAPEAVEIS.map((campo) => (
                        <SelectItem key={campo} value={campo}>
                          {campo === 'ignorar' ? 'Ignorar coluna' : campo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-2">#</th>
                    {resultado.cabecalho.map((c, i) => (
                      <th key={i} className="py-1 pr-2">
                        {String(c).trim().substring(0, 20) || '—'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resultado.linhas.slice(0, 5).map((linha, ri) => (
                    <tr key={ri} className="border-b">
                      <td className="py-1 pr-2 text-muted-foreground">{ri + 1}</td>
                      {linha.map((celula, ci) => (
                        <td key={ci} className="py-1 pr-2">
                          {neutralizarFormula(String(celula)).substring(0, 30)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultado.totalLinhas > 5 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Mostrando 5 de {resultado.totalLinhas} linhas.
                </p>
              )}
            </div>

            <div className="space-y-3 border-t pt-3">
              <p className="text-sm font-medium">3. Confirmação do lote</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label>Coorte</Label>
                  <Select value={coorte} onValueChange={setCoorte}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fria">Fria</SelectItem>
                      <SelectItem value="rede_jose">Rede do José</SelectItem>
                      <SelectItem value="rede_evandro">Rede do Evandro</SelectItem>
                      <SelectItem value="clientes_atendidos">Clientes atendidos</SelectItem>
                      <SelectItem value="inbound">Inbound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Dono</Label>
                  <Select value={donoId || undefined} onValueChange={setDonoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Lista (opcional)</Label>
                  <Select value={listaId || undefined} onValueChange={setListaId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Nenhuma</SelectItem>
                      {listas.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Ambiente</Label>
                  <Select value={ambiente} onValueChange={setAmbiente}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teste">Teste</SelectItem>
                      <SelectItem value="producao">Produção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => void confirmar()} disabled={processando || !donoId}>
                {processando ? 'Importando…' : 'Confirmar importação'}
              </Button>
              {!donoId && (
                <p className="text-xs text-muted-foreground">
                  Escolha o dono do lote para habilitar a confirmação.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {relatorio && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Relatório por linha</CardTitle>
            <CardDescription>
              {relatorio.total} linha(s): {relatorio.novas} nova(s) · {relatorio.repetidas}{' '}
              repetida(s) · {relatorio.incompletas} incompleta(s) · {relatorio.erros} erro(s)
              {relatorio.criados
                ? ` — criados: ${relatorio.criados.empresas} empresa(s), ${relatorio.criados.pessoas} pessoa(s), ${relatorio.criados.leads} lead(s)`
                : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Resultado</th>
                    <th className="py-1 pr-2">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorio.linhas.map((l) => (
                    <tr key={l.numero} className="border-b">
                      <td className="py-1 pr-2 text-muted-foreground">{l.numero}</td>
                      <td className={'py-1 pr-2 font-medium ' + (CORES_STATUS[l.status] ?? '')}>
                        {l.status}
                      </td>
                      <td className="py-1 pr-2 text-muted-foreground">{l.erros || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Repetir o mesmo arquivo com o mesmo mapeamento devolve este relatório — nenhuma pessoa
              é duplicada. A retomada e o desfazer do lote vêm na próxima task.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
