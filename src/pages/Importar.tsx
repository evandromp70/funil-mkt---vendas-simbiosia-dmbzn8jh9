// SPEC-1-003 (task c7240db4): prévia da base antes de importar — CA-1-003-01/04.
// Escolhe o arquivo → prévia (separador, mapeamento, linhas) → confirmação.
// NENHUMA escrita antes da confirmação. Malformado/excedente é recusado na prévia.
// Fórmulas neutralizadas; nenhuma API externa.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { parseCsv, detectarSeparador, neutralizarFormula, type CsvResultado } from '@/services/csv'
import { Button } from '@/components/ui/button'
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

export default function Importar() {
  const [resultado, setResultado] = useState<CsvResultado | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [separador, setSeparador] = useState<string>('auto')
  const [mapeamento, setMapeamento] = useState<Record<number, string>>({})
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const carregarArquivo = async (arquivo: File) => {
    setErro('')
    setAviso('')
    setResultado(null)
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
    }
    setResultado(r)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Importar base (prévia)</h1>
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

      {resultado && resultado.ok && (
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

            <p className="text-xs text-muted-foreground">
              Prévia apenas — a importação em si (lote, relatório por linha, retomada) vem na
              próxima task. Nenhuma escrita foi feita.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
