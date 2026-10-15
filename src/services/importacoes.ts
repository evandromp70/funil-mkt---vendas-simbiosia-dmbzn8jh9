// SPEC-1-003 (task 0574671d): confirmação do lote e relatório por linha — CA-1-003-02.
// O frontend envia as linhas da prévia + mapeamento + lista/coorte/dono/ambiente.
// Repetir o mesmo lote devolve o relatório existente (repetido: true) — sem duplicar.
import pb from '@/lib/pocketbase/client'

export type LinhaRelatorio = {
  numero: number
  status: 'nova' | 'repetida' | 'incompleta' | 'erro'
  erros?: string
  pessoa?: string
  empresa?: string
  lead?: string
}

export type RelatorioImportacao = {
  repetido: boolean
  importacaoId: string
  status: string
  total: number
  novas: number
  repetidas: number
  incompletas: number
  erros: number
  criados?: { empresas: number; pessoas: number; leads: number }
  linhas: LinhaRelatorio[]
}

export const confirmarImportacao = (payload: {
  nome_arquivo: string
  arquivo_hash: string
  mapeamento: Record<number, string>
  linhas: Array<Record<string, string>>
  lista: string
  coorte: string
  dono: string
  ambiente: string
}): Promise<RelatorioImportacao> =>
  pb.send('/backend/v1/importacoes/confirmar', { method: 'POST', body: payload })

// hash do arquivo no cliente (SHA-256) — chave do lote
export const hashArquivo = async (texto: string): Promise<string> => {
  const dados = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest('SHA-256', dados)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// listas e usuários para os seletores da confirmação
export const getListas = async () => pb.collection('listas').getFullList({ sort: '-created' })
export const getUsuarios = async () =>
  pb.collection('users').getFullList({ sort: '-created', fields: 'id,name,email,role' })
