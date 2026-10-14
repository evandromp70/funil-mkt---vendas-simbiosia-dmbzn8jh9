import pb from '@/lib/pocketbase/client'

// Configuração do sistema (registro único, leitura só admin — SPEC-1-001).
export type SistemaConfig = {
  id: string
  ambiente: 'teste' | 'producao'
  pausa_geral: boolean
  envio_real_habilitado: boolean
  integracoes_externas_habilitadas: boolean
  fase_validada: number
  timezone: string
  created: string
  updated: string
}

export const getSistemaConfig = async (): Promise<SistemaConfig | null> => {
  const result = await pb.collection('sistema_config').getList<SistemaConfig>(1, 1)
  return result.items[0] ?? null
}

// Gate de UI (SPEC-1-001, task 490ec843): função pura que decide se um recurso externo
// (IA, envio, sincronização) pode executar. Falha fechada: sem config ou config inválida,
// assume pausa — nada despacha.
export type AcaoExterna = 'ia' | 'envio' | 'sincronizacao'

export const recursoHabilitado = (
  cfg:
    | Pick<
        SistemaConfig,
        'pausa_geral' | 'envio_real_habilitado' | 'integracoes_externas_habilitadas'
      >
    | null
    | undefined,
  acao: AcaoExterna,
): boolean => {
  if (!cfg || typeof cfg.pausa_geral !== 'boolean') return false
  if (cfg.pausa_geral) return false
  switch (acao) {
    case 'ia':
      return true
    case 'envio':
      return cfg.envio_real_habilitado === true
    case 'sincronizacao':
      return cfg.integracoes_externas_habilitadas === true
    default:
      return false
  }
}
