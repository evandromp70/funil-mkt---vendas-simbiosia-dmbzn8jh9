import pb from '@/lib/pocketbase/client'

// SPEC-2-005 (F2-T12): retorno comercial local à Fábrica — CA-2-005-01.
//
// O que este serviço faz e o que NÃO faz:
//   - Monta a fixture no Funil (autoridade comercial) e baixa como arquivo.
//   - Registra que aquela exportação foi aplicada (hash), para duplicata não substituir fato.
//   - NÃO faz HTTP para a Fábrica. Quem aplica é o operador, no backend TESTE da outra ponta.
// O contrato v1 herdado é FECHADO: o envelope tem os campos de controle e o FATO vive dentro
// de `payload`. Ler direto do envelope mostra tela vazia — o dado está um nível abaixo.
export type EventoComercial = {
  contrato_versao: number
  evento_id: string
  origem: string
  ambiente: string
  tipo_evento: string
  dominio: string
  entidade_global_id: string
  revisao: number
  payload_hash: string
  ocorrido_em: string
  referencia_ator_mapeada: string
  payload: {
    contexto_global_id?: string
    pessoa_global_id?: string
    primeira_abordagem_em?: string
    bloqueio_global?: boolean
    motivo?: string
  }
}

export type FixtureComercial = {
  app_origem: string
  ambiente: string
  gerado_em: string
  total: number
  eventos: EventoComercial[]
  como_aplicar: string
}

export const exportarFixture = async (pessoaId?: string): Promise<FixtureComercial> => {
  const q = pessoaId ? '?pessoaId=' + encodeURIComponent(pessoaId) : ''
  return (await pb.send('/backend/v1/comercial/exportar-fixture' + q, {
    method: 'GET',
  })) as FixtureComercial
}

// baixa o documento como arquivo — o operador leva para a Fábrica
export const baixarFixture = (fx: FixtureComercial) => {
  const texto = JSON.stringify(fx, null, 2)
  const blob = new Blob([texto], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'fixture-comercial-' + new Date().toISOString().slice(0, 10) + '.json'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
