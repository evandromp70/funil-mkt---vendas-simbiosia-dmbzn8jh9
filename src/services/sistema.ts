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
