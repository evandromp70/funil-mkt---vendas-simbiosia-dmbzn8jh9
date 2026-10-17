// SPEC-1-006 (task 2e26d650): serviço de listas unificadas — CA-1-006-01.
// Listas e membros vivem no MESMO backend do Funil; navegação lista → contato → nota
// usa IDs únicos (lead). Desvincular NUNCA apaga lead/histórico (só o vínculo).
import pb from '@/lib/pocketbase/client'

export type Lista = {
  id: string
  owner: string
  nome: string
  origem: 'inbound' | 'outbound'
  segmento?: string
  descricao?: string
  coorte?: string
  produto_alvo?: string
  filtros?: Record<string, unknown>
  fonte: 'rfb' | 'planilha' | 'api' | 'misto' | 'legado'
  status: 'rascunho' | 'em_preparacao' | 'pronta'
  ambiente: 'teste' | 'producao'
  created: string
  updated: string
}

export type Membro = {
  id: string
  owner: string
  lista: string
  lead: string
  origem_importacao?: string
  ambiente: 'teste' | 'producao'
  created: string
  updated: string
  // expand
  expand?: { lead?: Record<string, unknown>; origem_importacao?: Record<string, unknown> }
}

export const getListas = async () =>
  (await pb.collection('listas').getFullList({ sort: '-created' })) as unknown as Lista[]

export const getLista = async (id: string) =>
  (await pb.collection('listas').getOne(id)) as unknown as Lista

export const getMembros = async (listaId: string) =>
  (await pb.collection('lista_membros').getFullList({
    filter: pb.filter('lista = {:l}', { l: listaId }),
    sort: '-created',
    expand: 'lead',
  })) as unknown as Membro[]

export const criarLista = (data: {
  nome: string
  descricao?: string
  coorte?: string
  produto_alvo?: string
  fonte: Lista['fonte']
  status?: Lista['status']
  ambiente: Lista['ambiente']
}) =>
  pb.collection('listas').create({
    owner: (pb.authStore.record?.id as string) ?? '',
    origem: 'outbound',
    status: 'rascunho',
    ...data,
  }) as unknown as Promise<Lista>

export const vincularLead = (listaId: string, leadId: string, ambiente: Lista['ambiente']) =>
  pb.collection('lista_membros').create({
    owner: (pb.authStore.record?.id as string) ?? '',
    lista: listaId,
    lead: leadId,
    ambiente,
  }) as unknown as Promise<Membro>

export const desvincular = (membroId: string) => pb.collection('lista_membros').delete(membroId)

// vínculo idempotente dos leads importados: cria vínculo para cada lead com
// lista_origem = lista que ainda não tem vínculo vivo nesta lista
export const vincularImportados = async (listaId: string, ambiente: Lista['ambiente']) => {
  const leads = await pb.collection('leads').getFullList({
    filter: pb.filter('lista_origem = {:l}', { l: listaId }),
    fields: 'id',
  })
  const membros = await pb.collection('lista_membros').getFullList({
    filter: pb.filter('lista = {:l}', { l: listaId }),
    fields: 'lead',
  })
  const vinculados = new Set(membros.map((m) => String(m.lead)))
  let criados = 0
  for (const lead of leads) {
    if (vinculados.has(String(lead.id))) continue
    try {
      await vincularLead(listaId, String(lead.id), ambiente)
      criados++
    } catch (_) {
      // corrida/índice único: vínculo já existe — ignora
    }
  }
  return { candidatos: leads.length, criados }
}
