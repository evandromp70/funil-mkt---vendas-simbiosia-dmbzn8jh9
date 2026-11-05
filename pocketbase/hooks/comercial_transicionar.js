// SPEC-2-001 (F2-T02): transição de estado comercial — CA-2-001-02/03.
// POST /backend/v1/comercial/transicionar
// { contextoId, para, motivo, motivoCodigo?, revisaoEsperada, eventoId? }
//
// Regras (cada uma tem prova em tests/comercial.test.mjs):
//   1. autenticado; vendedor só o próprio contexto (403 sem vazar existência)
//   2. revisaoEsperada ≠ revisao atual → 409 COM o estado atual (conflito, nada aplicado)
//   3. transição fora do mapa → 400, nada aplicado
//   4. eventoId repetido → devolve a transição já gravada (idempotente, não duplica)
//   5. transição + contexto gravados juntos: uma falha não deixa metade aplicada
//   6. mapa legado: grava a etapa equivalente no lead (auditável), sem reescrever histórico
//
// Lógica INLINE no callback (hooks Skip rodam em VM própria — sem referência a top-level).
routerAdd(
  'POST',
  '/backend/v1/comercial/transicionar',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const body = e.requestInfo().body || {}
    const contextoId = String(body.contextoId || '')
    const para = String(body.para || '')
    const motivo = String(body.motivo || '')
    const motivoCodigo = String(body.motivoCodigo || '')
    const revisaoEsperada = Number(body.revisaoEsperada)
    const eventoId = String(body.eventoId || '')

    if (!contextoId) return e.badRequestError('contextoId é obrigatório')
    if (!para) return e.badRequestError('para é obrigatório')
    if (!motivo.trim()) return e.badRequestError('motivo é obrigatório')
    if (!Number.isInteger(revisaoEsperada) || revisaoEsperada < 0)
      return e.badRequestError('revisaoEsperada deve ser inteiro >= 0')

    const ESTADOS = [
      'pendente_dados',
      'pontuado',
      'aguardando_aprovacao',
      'em_cadencia',
      'respondeu',
      'com_humano',
      'pausado',
      'esgotado',
      'ganho',
      'perdido',
      'bloqueado',
    ]
    if (!ESTADOS.includes(para)) return e.badRequestError('estado de destino inválido')

    // ---- mapa de transições permitidas (fonte da verdade no servidor) ----
    const MAPA = {
      pendente_dados: ['pontuado', 'bloqueado', 'com_humano', 'pausado'],
      pontuado: ['aguardando_aprovacao', 'em_cadencia', 'pendente_dados', 'bloqueado', 'com_humano'],
      aguardando_aprovacao: ['em_cadencia', 'pontuado', 'bloqueado', 'com_humano', 'pausado'],
      em_cadencia: [
        'respondeu',
        'esgotado',
        'pausado',
        'bloqueado',
        'com_humano',
        'ganho',
        'perdido',
        'aguardando_aprovacao',
      ],
      respondeu: ['com_humano', 'ganho', 'perdido', 'pausado', 'bloqueado', 'em_cadencia'],
      com_humano: ['ganho', 'perdido', 'pausado', 'em_cadencia', 'bloqueado', 'respondeu'],
      pausado: ['em_cadencia', 'com_humano', 'bloqueado', 'ganho', 'perdido', 'respondeu'],
      esgotado: ['em_cadencia', 'pausado', 'com_humano', 'bloqueado', 'perdido'],
      ganho: ['pausado', 'com_humano'],
      perdido: ['em_cadencia', 'pausado', 'com_humano'],
      bloqueado: ['pausado', 'com_humano'],
    }

    // mapa de etapa legada equivalente (para o lead continuar coerente)
    const ETAPA_LEGADA = {
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

    let ctx
    try {
      ctx = $app.findRecordById('contextos_comerciais', contextoId)
    } catch (_) {
      return e.notFoundError('Contexto não encontrado')
    }

    // 1. ACL: vendedor só o próprio; 403 sem revelar existência de contexto alheio
    const ehAdmin = e.auth.getString('role') === 'admin'
    if (!ehAdmin && ctx.getString('owner') !== e.auth.id)
      return e.forbiddenError('Sem acesso a este contexto')

    // 4. idempotência: mesmo evento já aplicado → devolve o que existe
    if (eventoId) {
      try {
        const jaFeitas = $app.findRecordsByFilter(
          'transicoes_comerciais',
          'contexto = {:c} && evento_id = {:ev}',
          '',
          1,
          0,
          { c: contextoId, ev: eventoId },
        )
        if (jaFeitas.length > 0) {
          const t = jaFeitas[0]
          return e.json(200, {
            idempotente: true,
            transicaoId: t.id,
            para: t.getString('para'),
            revisao: ctx.getInt('revisao'),
          })
        }
      } catch (_) {}
    }

    const atual = ctx.getString('estado') || 'pendente_dados'
    const revisaoAtual = ctx.getInt('revisao') || 0

    // 2. conflito de revisão: 409 com o estado atual, nada aplicado
    if (revisaoEsperada !== revisaoAtual) {
      return e.json(409, {
        erro: 'conflito_revisao',
        estadoAtual: atual,
        revisaoAtual,
        detalhe: 'O contexto mudou desde a leitura — releia e tente de novo.',
      })
    }

    // 3. transição inválida: 400, nada aplicado
    const destinos = MAPA[atual] || []
    if (!destinos.includes(para)) {
      return e.badRequestError(
        'Transição inválida: ' + atual + ' → ' + para + '. Permitidos: ' + destinos.join(', '),
      )
    }

    // ---- aplica: transição primeiro (append-only), contexto depois ----
    let transicao
    try {
      const colT = $app.findCollectionByNameOrId('transicoes_comerciais')
      transicao = new Record(colT)
      transicao.set('contexto', contextoId)
      transicao.set('owner', ctx.getString('owner'))
      transicao.set('de', atual)
      transicao.set('para', para)
      transicao.set('motivo', motivo.trim().substring(0, 500))
      if (motivoCodigo) transicao.set('motivo_codigo', motivoCodigo)
      transicao.set('revisao_esperada', revisaoEsperada)
      if (eventoId) transicao.set('evento_id', eventoId)
      transicao.set('ator', e.auth.id)
      transicao.set('ambiente', ctx.getString('ambiente') || 'teste')
      $app.save(transicao)
    } catch (err) {
      $app.logger().error('falha ao gravar transição', 'err', String(err))
      return e.internalServerError('Transição não aplicada')
    }

    try {
      ctx.set('estado', para)
      if (motivoCodigo) ctx.set('motivo_codigo', motivoCodigo)
      ctx.set('motivo', motivo.trim().substring(0, 500))
      ctx.set('revisao', revisaoAtual + 1)
      const etapaLegada = ETAPA_LEGADA[para]
      if (etapaLegada) ctx.set('etapa_legada', etapaLegada)
      $app.save(ctx)
    } catch (err) {
      // compensação: desfaz a transição para não deixar metade aplicada
      try {
        $app.delete(transicao)
      } catch (_) {}
      $app.logger().error('falha ao atualizar contexto — transição compensada', 'err', String(err))
      return e.internalServerError('Transição não aplicada (compensada)')
    }

    // 6. espelha a etapa no lead (auditável); não reescreve histórico, só o campo atual
    const leadId = ctx.getString('lead')
    let etapaLeadAplicada = ''
    if (leadId) {
      const etapaLegada = ETAPA_LEGADA[para]
      if (etapaLegada) {
        try {
          const lead = $app.findRecordById('leads', leadId)
          lead.set('etapa', etapaLegada)
          $app.save(lead)
          etapaLeadAplicada = etapaLegada
        } catch (err) {
          // falha no espelho NÃO desfaz a transição: o contexto é a fonte
          $app.logger().warn('falha ao espelhar etapa no lead', 'lead', leadId, 'err', String(err))
        }
      }
    }

    return e.json(200, {
      ok: true,
      transicaoId: transicao.id,
      de: atual,
      para: para,
      revisao: revisaoAtual + 1,
      etapaLegadaAplicada: etapaLeadAplicada,
    })
  },
  $apis.requireAuth(),
)
