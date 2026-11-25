// Painel "Testar com um lead": o usuário preenche como seria um lead e vê a nota e a faixa
// que ele teria na régua que está sendo editada. Não grava nada.
import { useMemo, useState } from 'react'
import { Check, Minus, X } from 'lucide-react'
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
import type { Criterio } from '@/services/regua'
import { campoPorChave, type LimitesFaixa } from '@/services/camposRegua'
import { amostraIdeal, camposUsados, rotuloCampo, simular, type Amostra } from '@/services/simuladorRegua'
import { BadgeFaixa, BarraFaixas } from '@/components/produtos/visual'

const VAZIO = '__vazio'

export default function SimuladorRegua({
  criterios,
  eliminatorias,
  limites,
}: {
  criterios: Criterio[]
  eliminatorias: Criterio[]
  limites: LimitesFaixa
}) {
  const [amostra, setAmostra] = useState<Amostra>({})
  const campos = useMemo(() => camposUsados(criterios, eliminatorias), [criterios, eliminatorias])
  const resultado = useMemo(
    () => simular(criterios, eliminatorias, limites, amostra),
    [criterios, eliminatorias, limites, amostra],
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Testar com um lead</CardTitle>
        <CardDescription>
          Preencha como seria um lead e veja a nota que ele teria. Nada é gravado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={criterios.length === 0}
            onClick={() => setAmostra(amostraIdeal(criterios))}
          >
            Lead que cumpre tudo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAmostra({})}>
            Limpar
          </Button>
        </div>

        {campos.length === 0 ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Adicione um critério à esquerda para poder testar.
          </p>
        ) : (
          <div className="space-y-3">
            {campos.map((campo) => {
              const def = campoPorChave(campo)
              const valor = amostra[campo] ?? ''
              return (
                <div key={campo} className="space-y-1">
                  <Label className="text-xs">{rotuloCampo(campo)}</Label>
                  {def?.opcoes ? (
                    <Select
                      value={valor === '' ? VAZIO : valor}
                      onValueChange={(v) =>
                        setAmostra({ ...amostra, [campo]: v === VAZIO ? '' : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={VAZIO}>Não informado</SelectItem>
                        {def.opcoes.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={valor}
                      onChange={(e) => setAmostra({ ...amostra, [campo]: e.target.value })}
                      placeholder="Não informado"
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="space-y-3 border-t pt-4">
          {resultado.status === 'eliminada' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">Lead eliminado, sem nota.</p>
              <p className="mt-1 text-xs">Motivo: {resultado.eliminadaPor}</p>
            </div>
          )}

          {resultado.status === 'vazia' && (
            <p className="text-sm text-muted-foreground">
              Dê peso maior que zero a pelo menos um critério para calcular a nota.
            </p>
          )}

          {resultado.status === 'calculada' && (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Nota</p>
                  <p className="text-4xl font-semibold leading-none tracking-tight">
                    {resultado.nota}
                    <span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>
                  </p>
                </div>
                <BadgeFaixa faixa={resultado.faixa} className="px-3 py-1 text-sm" />
              </div>
              <BarraFaixas limites={limites} marcador={resultado.nota} />
              <ul className="space-y-1.5">
                {resultado.itens.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 text-xs">
                    {i.resultado === 'cumprido' && (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    )}
                    {i.resultado === 'nao_cumprido' && (
                      <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    )}
                    {i.resultado === 'sem_dado' && (
                      <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="flex-1">
                      {i.texto}
                      {i.resultado === 'sem_dado' && (
                        <span className="text-muted-foreground"> (sem dado, não pontua)</span>
                      )}
                    </span>
                    <span
                      className={
                        i.resultado === 'cumprido'
                          ? 'font-medium text-emerald-700'
                          : 'text-muted-foreground'
                      }
                    >
                      {i.resultado === 'cumprido' ? `+${i.peso}` : '0'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
