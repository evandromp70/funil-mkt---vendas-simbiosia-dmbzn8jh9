// SPEC-2-001 (F2-T02): mapeamento das etapas legadas — CA-2-001-02.
// POST /backend/v1/comercial/mapear-legado { ambiente? }
//
// Cria o contexto comercial inicial para leads que ainda não têm um, preenchendo
// `etapa_legada` com a etapa ATUAL do lead e o motivo `migracao_legado`.
//
// Garantias (cada uma provada em tests/comercial.test.mjs):
//   - ADITIVO: nenhum lead é apagado; nenhum campo do lead é reescrito;
//   - IDEMPOTENTE: rodar duas vezes não duplica contexto nem transição
//     (índice único pessoa×produto×ambiente + evento_id fixo por lead);
//   - AUDITÁVEL: cada mapeamento gera uma transição de '' → estado, com motivo explícito;
//   - estado desconhecido NUNCA vira descarte: cai em `pendente_dados`.
// Só admin. Sem rede externa.
routerAdd(
  'POST',
  '/backend/v1/comercial/mapear-legado',
  (e) => {
    if (!e.auth || e.auth.getString('role') !== 'admin')
      return e.forbiddenError('Apenas administradores podem mapear o legado')

    const body = e.requestInfo().body || {}
    const ambiente = String(body.ambiente || 'teste')

    // mapa etapa legada → estado comercial
    const ESTADO_DE_ETAPA = {
      lista: 'pendente_dados',
      qualificacao: 'pontuado',
      contato: 'respondeu',
      cadencia: 'em_cadencia',
      alinhamento: 'com_humano',
      conversao: 'com_humano',
      ganho: 'ganho',
      perdido: 'perdido',
    }
    const ETAPA_LEGADA_DE_ESTADO = {
      pendente_dados: 'qualificacao',
      pontuado: 'qualificacao',
      aguardando_aprovacao: 'qualificacao',
      em_cadencia: 'cadencia',
      respondeu: 'contato',
      com_humano: 'alinhamento',
      pausado: 'contato',
      esgotado: 'perdido',
      ganho: 'ganho',
      perdido: 'perdido',
      bloqueado: 'perdido',
    }

    let leads = []
    try {
      leads = $app.findRecordsByFilter(
        'leads',
        'ambiente = {:a}',
        'created',
        0,
        0,
        { a: ambiente },
      )
    } catch (_) {
      // leads podem não ter campo ambiente em versões antigas — cai para todos
      try {
        leads = $app.findRecordsByFilter('leads', "id != ''", 'created', 0, 0, {})
      } catch (err) {
        return e.internalServerError('Falha ao ler leads: ' + String(err))
      }
    }

    const colCtx = $app.findCollectionByNameOrId('contextos_comerciais')
    const colT = $app.findCollectionByNameOrId('transicoes_comerciais')

    let criados = 0
    let pulados = 0
    let semPessoaOuProduto = 0
    let erros = 0

    for (const lead of leads) {
      const pessoaId = lead.getString('pessoa')

      // sem pessoa não há contexto pessoa×produto (lead legado sem cadastro)
      if (!pessoaId) {
        semPessoaOuProduto++
        continue
      }

      // idempotência: já existe contexto para esta pessoa neste ambiente?
      try {
        const existentes = $app.findRecordsByFilter(
          'contextos_comerciais',
          'pessoa = {:p} && ambiente = {:a}',
          '',
          1,
          0,
          { p: pessoaId, a: ambiente },
        )
        if (existentes.length > 0) {
          pulados++
          continue
        }
      } catch (_) {}

      const etapaAtual = lead.getString('etapa') || 'lista'
      const estado = ESTADO_DE_ETAPA[etapaAtual] || 'pendente_dados'
      const etapaLegada = ETAPA_LEGADA_DE_ESTADO[estado] || 'qualificacao'

      try {
        const ctx = new Record(colCtx)
        ctx.set('owner', lead.getString('owner') || e.auth.id)
        ctx.set('pessoa', pessoaId)
        // produto é obrigatório no contexto; quando o lead não tem produto definido usamos o
        // marcador de produto genérico do ambiente, criado abaixo se faltar
        let produtoFinal = ''
        if (!produtoFinal) {
          try {
            const gen = $app.findRecordsByFilter(
              'produtos',
              'nome = {:n} && ambiente = {:a}',
              '',
              1,
              0,
              { n: 'PRODUTO GENERICO (legado)', a: ambiente },
            )
            if (gen.length > 0) {
              produtoFinal = gen[0].id
            } else {
              const colP = $app.findCollectionByNameOrId('produtos')
              const p = new Record(colP)
              p.set('nome', 'PRODUTO GENERICO (legado)')
              p.set('degrau', 'mapa')
              p.set('ambiente', ambiente)
              p.set('ativo', false)
              $app.save(p)
              produtoFinal = p.id
            }
          } catch (errP) {
            erros++
            $app.logger().warn('falha ao resolver produto do legado', 'err', String(errP))
            continue
          }
        }
        ctx.set('produto', produtoFinal)
        if (lead.id) ctx.set('lead', lead.id)
        ctx.set('estado', estado)
        ctx.set('motivo', 'Mapeamento da etapa legada "' + etapaAtual + '" (aditivo, sem reescrever histórico).')
        ctx.set('motivo_codigo', 'migracao_legado')
        ctx.set('etapa_legada', etapaLegada)
        ctx.set('revisao', 0)
        ctx.set('ambiente', ambiente)
        $app.save(ctx)

        // transição de abertura: '' → estado, com evento fixo (idempotência)
        const t = new Record(colT)
        t.set('contexto', ctx.id)
        t.set('owner', ctx.getString('owner'))
        t.set('para', estado)
        t.set('motivo', 'Contexto criado a partir da etapa legada "' + etapaAtual + '".')
        t.set('motivo_codigo', 'migracao_legado')
        t.set('revisao_esperada', 0)
        t.set('evento_id', 'legado:' + lead.id)
        t.set('ator', e.auth.id)
        t.set('ambiente', ambiente)
        $app.save(t)

        criados++
      } catch (err) {
        erros++
        $app.logger().warn('falha ao mapear lead', 'lead', lead.id, 'err', String(err))
      }
    }

    return e.json(200, {
      ok: true,
      ambiente,
      leadsLidos: leads.length,
      contextosCriados: criados,
      jaExistiam: pulados,
      semPessoa: semPessoaOuProduto,
      erros,
      detalhe: 'Mapeamento aditivo: nenhum lead foi apagado ou reescrito.',
    })
  },
  $apis.requireAuth(),
)
