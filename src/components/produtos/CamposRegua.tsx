// Seleção assistida de campo e de valor para os critérios da régua.
// Os campos conhecidos vêm de `camposRegua.ts`; "Outro campo" mantém a digitação livre.
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CAMPOS_REGUA, campoPorChave } from '@/services/camposRegua'

const OUTRO = '__outro'

export function SeletorCampo({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  const conhecido = !!campoPorChave(valor)
  const [outro, setOutro] = useState(valor !== '' && !conhecido)
  const selecionado = conhecido ? valor : outro ? OUTRO : undefined
  return (
    <div className="space-y-1">
      <Select
        value={selecionado}
        onValueChange={(v) => {
          if (v === OUTRO) {
            setOutro(true)
            aoMudar('')
          } else {
            setOutro(false)
            aoMudar(v)
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Escolha o campo" />
        </SelectTrigger>
        <SelectContent>
          {CAMPOS_REGUA.map((c) => (
            <SelectItem key={c.chave} value={c.chave}>
              {c.origem}: {c.rotulo}
            </SelectItem>
          ))}
          <SelectItem value={OUTRO}>Outro campo (digitar)</SelectItem>
        </SelectContent>
      </Select>
      {selecionado === OUTRO && (
        <Input
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          placeholder="nome do campo"
        />
      )}
    </div>
  )
}

// Atalhos com as opções do campo (quando o campo tem lista fechada).
export function OpcoesDoCampo({
  campo,
  operador,
  valor,
  aoMudar,
}: {
  campo: string
  operador: string
  valor: unknown
  aoMudar: (v: unknown) => void
}) {
  const def = campoPorChave(campo)
  if (!def || !def.opcoes) return null
  if (operador !== 'eq' && operador !== 'neq' && operador !== 'in') return null
  const emLista = operador === 'in'
  const atual: string[] = Array.isArray(valor) ? (valor as string[]) : []
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {def.opcoes.map((o) => {
        const ativo = emLista ? atual.indexOf(o) !== -1 : valor === o
        return (
          <button
            type="button"
            key={o}
            className={
              'rounded-full border px-2 py-0.5 text-xs transition-colors ' +
              (ativo
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent')
            }
            onClick={() => {
              if (emLista) aoMudar(ativo ? atual.filter((x) => x !== o) : [...atual, o])
              else aoMudar(o)
            }}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}
