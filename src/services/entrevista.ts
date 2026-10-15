// SPEC-1-004 (task 46c0fd51): entrevista de produtos e critérios — CA-1-004-03.
// Roteiro fixo do fluxo da SPEC + função pura de completude (pendências legíveis).
// A entrevista registra decisões do José; confirmação só com zero pendências;
// confirmar NÃO ativa produto nem régua (aprovação é a task b0c25923).

export type PerguntaRoteiro = { chave: string; pergunta: string; guia?: string }

// roteiro fixo (fluxo 1 da SPEC: dor/área → decisor → segmento/porte → campos/fontes →
// critérios → pesos → eliminatórias → faixas → abordagem)
export const ROTEIRO: PerguntaRoteiro[] = [
  { chave: 'dor_area', pergunta: 'Qual a dor que o produto atende e em qual área?' },
  { chave: 'decisor', pergunta: 'Quem é o decisor típico da compra?' },
  {
    chave: 'segmento_porte',
    pergunta: 'Quais segmentos, porte e idade de empresa são relevantes?',
  },
  { chave: 'localizacao', pergunta: 'Há recorte de localização (UF/cidade/região)?' },
  {
    chave: 'campos_fontes',
    pergunta: 'Quais campos de negócio estão disponíveis e de que fonte vêm?',
  },
  { chave: 'criterios', pergunta: 'Quais critérios qualificam um lead para este produto?' },
  { chave: 'pesos', pergunta: 'Qual o peso ou pontos de cada critério?' },
  { chave: 'eliminatorias', pergunta: 'Há regras eliminatórias (o que desqualifica)?' },
  { chave: 'faixas', pergunta: 'Quais as faixas de pontuação (A/B/C/D) e seus limites?' },
  { chave: 'abordagem', pergunta: 'Como é a abordagem de venda deste produto?' },
]

export type AvaliacaoEntrevista = { completa: boolean; pendencias: string[] }

// função pura: respostas em branco/ausentes viram pendências; completa = zero pendências
export const avaliarEntrevista = (respostas: Record<string, string>): AvaliacaoEntrevista => {
  const pendencias: string[] = []
  for (const p of ROTEIRO) {
    const r = (respostas?.[p.chave] ?? '').trim()
    if (!r) pendencias.push(p.chave)
  }
  return { completa: pendencias.length === 0, pendencias }
}
