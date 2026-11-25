// Política de abordagem (23/11/2026): quem pode receber toque, em função da faixa da régua.
// A régua do produto dá a nota; esta política decide a partir de que faixa o lead pode ser
// abordado. Só a faixa mínima e o piso de nota são editáveis aqui; janela, intervalo e limites
// diários são mostrados, e a política aprovada continua imutável nesses campos (hook politica_validar).
import { useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

type Politica = {
  id: string
  coorte: string
  versao: number
  rotulo?: string
  exige_aprovacao_mensagem?: boolean
  janela_inicio?: string
  janela_fim?: string
  intervalo_min_minutos?: number
  limite_dia_por_pessoa?: number
  limite_dia_por_canal?: number
  limite_dia_por_dono?: number
  faixa_minima?: string
  nota_minima_piso?: number
}

const COORTES: Array<{ chave: string; rotulo: string }> = [
  { chave: 'fria', rotulo: 'Lista fria' },
  { chave: 'inbound', rotulo: 'Inbound (formulários)' },
  { chave: 'rede_jose', rotulo: 'Rede do José' },
  { chave: 'rede_evandro', rotulo: 'Rede do Evandro' },
  { chave: 'clientes_atendidos', rotulo: 'Clientes atendidos' },
]

const NENHUMA = 'nenhuma'

const FRASE_FAIXA: Record<string, string> = {
  A: 'só a faixa A',
  B: 'faixa B ou melhor',
  C: 'faixa C ou melhor',
  D: 'qualquer faixa (D ou melhor)',
}

function CartaoPolitica({
  politica,
  rotulo,
  ehAdmin,
  aoSalvar,
}: {
  politica?: Politica
  rotulo: string
  ehAdmin: boolean
  aoSalvar: () => void
}) {
  const [faixa, setFaixa] = useState(politica?.faixa_minima || NENHUMA)
  const [piso, setPiso] = useState(String(politica?.nota_minima_piso ?? 0))
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    setFaixa(politica?.faixa_minima || NENHUMA)
    setPiso(String(politica?.nota_minima_piso ?? 0))
  }, [politica?.id, politica?.faixa_minima, politica?.nota_minima_piso])

  if (!politica) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{rotulo}</CardTitle>
          <CardDescription>
            Sem política aprovada: ninguém desta coorte é elegível para toque.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const pisoNumero = Number(piso)
  const sujo =
    (faixa === NENHUMA ? '' : faixa) !== (politica.faixa_minima || '') ||
    pisoNumero !== (politica.nota_minima_piso ?? 0)

  const salvar = async () => {
    if (isNaN(pisoNumero) || pisoNumero < 0 || pisoNumero > 100) {
      toast({
        title: 'Piso inválido',
        description: 'Use um número de 0 a 100.',
        variant: 'destructive',
      })
      return
    }
    setSalvando(true)
    try {
      await pb.collection('politicas_coorte').update(politica.id, {
        faixa_minima: faixa === NENHUMA ? '' : faixa,
        nota_minima_piso: pisoNumero,
      })
      toast({ title: 'Política atualizada', description: rotulo })
      aoSalvar()
    } catch (e) {
      toast({
        title: 'Não deu certo',
        description: String((e as Error).message ?? e),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const frase =
    faixa === NENHUMA
      ? 'Sem exigência de faixa: a nota não barra ninguém.'
      : `Pode receber toque quem está na ${FRASE_FAIXA[faixa]}${
          pisoNumero > 0 ? ` e tem nota de pelo menos ${pisoNumero}` : ''
        }. Quem ainda não tem nota não é abordado.`

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{rotulo}</CardTitle>
          <Badge variant="secondary">versão {politica.versao}</Badge>
        </div>
        <CardDescription>
          Janela {politica.janela_inicio}–{politica.janela_fim} · intervalo de{' '}
          {politica.intervalo_min_minutos} min · por dia: {politica.limite_dia_por_pessoa} por
          pessoa, {politica.limite_dia_por_canal} por canal, {politica.limite_dia_por_dono} por dono
          · mensagem {politica.exige_aprovacao_mensagem ? 'precisa' : 'não precisa'} de aprovação
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Faixa mínima para abordar</Label>
            <Select value={faixa} onValueChange={setFaixa} disabled={!ehAdmin}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A: só os melhores</SelectItem>
                <SelectItem value="B">B ou melhor</SelectItem>
                <SelectItem value="C">C ou melhor</SelectItem>
                <SelectItem value="D">D ou melhor (qualquer faixa)</SelectItem>
                <SelectItem value={NENHUMA}>Sem exigência de faixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Nota mínima absoluta (piso)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={piso}
              disabled={!ehAdmin}
              onChange={(e) => setPiso(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">0 desliga o piso.</p>
          </div>
        </div>
        <p className="rounded-lg bg-muted/60 p-3 text-sm">{frase}</p>
        <div className="flex items-center gap-2">
          <Button disabled={!ehAdmin || !sujo || salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
          {!ehAdmin && (
            <span className="text-xs text-muted-foreground">Só administradores alteram.</span>
          )}
          {ehAdmin && !sujo && (
            <span className="text-xs text-muted-foreground">Sem alterações.</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function PoliticaPage() {
  const { user } = useAuth()
  const ehAdmin = user?.role === 'admin'
  const [politicas, setPoliticas] = useState<Record<string, Politica>>({})
  const [carregando, setCarregando] = useState(true)

  const carregar = async () => {
    try {
      const lista = await pb.collection('politicas_coorte').getFullList({
        filter: "status = 'aprovada' && ambiente = 'teste'",
        sort: '-versao',
      })
      const mapa: Record<string, Politica> = {}
      for (const p of lista as unknown as Politica[]) {
        if (!mapa[p.coorte]) mapa[p.coorte] = p
      }
      setPoliticas(mapa)
    } catch (e) {
      toast({
        title: 'Não deu certo',
        description: 'Não consegui carregar as políticas: ' + String((e as Error).message ?? e),
        variant: 'destructive',
      })
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    void carregar()
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Política de abordagem</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          A régua do produto dá a nota. Aqui você decide a partir de que faixa um lead pode receber
          toque. Quem está abaixo da faixa mínima, ou ainda não tem nota, não é abordado.
        </p>
      </div>
      {carregando && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!carregando && (
        <div className="grid gap-4 lg:grid-cols-2">
          {COORTES.map((c) => (
            <CartaoPolitica
              key={c.chave}
              politica={politicas[c.chave]}
              rotulo={c.rotulo}
              ehAdmin={ehAdmin}
              aoSalvar={() => void carregar()}
            />
          ))}
        </div>
      )}
    </div>
  )
}
