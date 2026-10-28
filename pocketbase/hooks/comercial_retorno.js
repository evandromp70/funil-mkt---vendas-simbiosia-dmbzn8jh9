// SPEC-2-005 (F2-T12): retorno comercial local à Fábrica — CA-2-005-01.
//
// Rotas:
//   POST /backend/v1/comercial/registrar-abordagem  — grava o FATO comercial (primeira abordagem)
//   GET  /backend/v1/comercial/exportar-fixture     — emite a fixture local (sem HTTP entre apps)
//
// REGRAS DURAS (provadas em tests/retorno_abordagem.test.mjs):
//   1. PRIMEIRA abordagem: o primeiro instante confirmado é PRESERVADO. Reprocessar não move a
//      data — "primeira" quer dizer primeira.
//   2. Falha, agendamento ou aprovação NÃO produzem fato confirmado. Só confirmação simulada.
//   3. A fixture é DADO LOCAL exportado: nenhum HTTP é feito para a Fábrica. Quem aplica é o
//      operador, offline, no backend TESTE da Fábrica (sync_aplicar, herdado da Fase 1).
//   4. IDs locais (PocketBase, usuários) NUNCA atravessam: o que viaja é a identidade GLOBAL.
//   5. Comercial é domínio próprio: registrar abordagem NÃO recalcula pontuação nem mexe em
//      cadastro.
//
// SEM spread de objeto (a VM rejeita `...` e derruba a rota com 500).

routerAdd(
  'POST',
  '/backend/v1/comercial/registrar-abordagem',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')

    const body = e.requestInfo().body || {}
    const leadId = String(body.leadId || '')
    const confirmadoEm = String(body.confirmado_em || '').trim()
    if (!leadId) return e.badRequestError('leadId é obrigatório')

    // só fato CONFIRMADO na modalidade simulada desta fase
    if (String(body.modo || 'simulado') !== 'simulado')
      return e.badRequestError('Nesta fase só existe confirmação simulada.')
    if (!confirmadoEm)
      return e.badRequestError('confirmado_em é obrigatório: agendamento não é fato confirmado.')

    let lead
    try {
      lead = $app.findRecordById('leads', leadId)
    } catch (_) {
      return e.notFoundError('Lead não encontrado')
    }

    // identidade GLOBAL da pessoa (nunca o id local)
    let pessoaGlobal = ''
    let pessoaId = String(lead.getString('pessoa') || '')
    if (pessoaId) {
      try {
        const p = $app.findRecordById('pessoas', pessoaId)
        const g = String(p.getString('sync_global_id') || '').trim()
        pessoaGlobal = g || p.id
      } catch (_) {}
    }

    // contexto comercial (autoridade do Funil)
    let contextoGlobal = ''
    let contextoId = ''
    if (pessoaId) {
      try {
        const ctxs = $app.findRecordsByFilter(
          'contextos_comerciais',
          "pessoa = {:p} && ambiente = 'teste'",
          '-created',
          1,
          0,
          { p: pessoaId },
        )
        if (ctxs.length > 0) {
          contextoId = ctxs[0].id
          contextoGlobal = String(ctxs[0].getString('sync_global_id') || '') || ctxs[0].id
        }
      } catch (_) {}
    }

    // ---------- 1. PRIMEIRA abordagem: preserva o primeiro instante ----------
    const jaTinha = String(lead.getString('primeira_abordagem_em') || '')
    let primeiraAbordagem = jaTinha
    let primeiraMudou = false
    if (!jaTinha) {
      primeiraAbordagem = confirmadoEm
      primeiraMudou = true
      try {
        lead.set('primeira_abordagem_em', confirmadoEm)
        $app.save(lead)
      } catch (err) {
        return e.internalServerError('Falha ao gravar primeira abordagem: ' + String(err))
      }
    }

    // ---------- revisão comercial (incrementa a cada fato novo) ----------
    // O contador vive em sistema_config por simplicidade e auditabilidade nesta fase.
    let revisao = 1
    try {
      const cfg = $app.findRecordsByFilter('sistema_config', "ambiente = 'teste'", '', 1, 0, {})
      if (cfg.length > 0) {
        revisao = Number(cfg[0].get('comercial_revisao_seq') || 0) + 1
        cfg[0].set('comercial_revisao_seq', revisao)
        $app.save(cfg[0])
      }
    } catch (_) {}

    return e.json(200, {
      estado: 'registrado',
      leadId: leadId,
      pessoa_global_id: pessoaGlobal,
      contexto_global_id: contextoGlobal,
      contextoId: contextoId,
      primeira_abordagem_em: primeiraAbordagem,
      primeira_estavel: jaTinha ? true : false,
      comercial_revisao: revisao,
      ambiente: 'teste',
      fonte: 'funil',
      detalhe: jaTinha
        ? 'A primeira abordagem já existia e foi PRESERVADA — reprocessar não move a data.'
        : 'Primeira abordagem registrada.',
    })
  },
  $apis.requireAuth(),
)

// Exporta a fixture que o operador aplica MANUALMENTE no backend TESTE da Fábrica.
// Nenhum HTTP é feito daqui: a rota só MONTA o documento.
routerAdd(
  'GET',
  '/backend/v1/comercial/exportar-fixture',
  (e) => {
    if (!e.auth) return e.unauthorizedError('Autenticação obrigatória')
    if (String(e.auth.getString('role')) !== 'admin')
      return e.forbiddenError('Somente admin exporta fixture.')

    const query = e.requestInfo().query || {}
    const pessoaIdFiltro = String(query.pessoaId || '')

    // ATENÇÃO: `leads` NÃO tem campo `ambiente` (o ambiente é da pessoa/empresa). Filtrar por
    // ele derrubava a rota com 500 — "unknown field ambiente". Aqui não há filtro de ambiente:
    // o escopo TESTE vem da pessoa, verificada evento a evento.
    let leads = []
    try {
      leads = $app.findRecordsByFilter('leads', "id != ''", '-created', 500, 0, {})
    } catch (err) {
      return e.internalServerError('Falha ao ler leads: ' + String(err))
    }

    const eventos = []
    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i]
      const pid = String(lead.getString('pessoa') || '')
      if (!pid) continue
      if (pessoaIdFiltro && pid !== pessoaIdFiltro) continue

      const primeira = String(lead.getString('primeira_abordagem_em') || '')
      if (!primeira) continue // sem fato confirmado → não vai na fixture

      let pessoaGlobal = ''
      try {
        const p = $app.findRecordById('pessoas', pid)
        const g = String(p.getString('sync_global_id') || '').trim()
        pessoaGlobal = g || p.id
      } catch (_) {
        continue
      }

      let contextoGlobal = ''
      try {
        const ctxs = $app.findRecordsByFilter(
          'contextos_comerciais',
          "pessoa = {:p} && ambiente = 'teste'",
          '-created',
          1,
          0,
          { p: pid },
        )
        if (ctxs.length > 0)
          contextoGlobal = String(ctxs[0].getString('sync_global_id') || '') || ctxs[0].id
      } catch (_) {}

      // proteção (SPEC-2-004): bloqueio global vai como fato comercial
      let bloqueio = false
      let motivoBloqueio = ''
      try {
        const bs = $app.findRecordsByFilter(
          'bloqueios_contato',
          "pessoa = {:p} && ambiente = 'teste'",
          '',
          1,
          0,
          { p: pid },
        )
        if (bs.length > 0) {
          bloqueio = true
          motivoBloqueio = String(bs[0].getString('motivo') || '')
        }
      } catch (_) {}

      const ev = {
        tipo_evento: 'estado_comercial',
        contexto_global_id: contextoGlobal || pessoaGlobal,
        pessoa_global_id: pessoaGlobal,
        primeira_abordagem_em: primeira,
        bloqueio_global: bloqueio,
        bloqueio_motivo: motivoBloqueio,
        comercial_revisao: 1,
        fonte: 'funil',
        ambiente: 'teste',
      }
      eventos.push(ev)
    }

    return e.json(200, {
      app_origem: 'funil',
      ambiente: 'teste',
      gerado_em: new Date().toISOString(),
      total: eventos.length,
      eventos: eventos,
      como_aplicar:
        'Aplicar manualmente no backend TESTE da Fábrica via POST /backend/v1/sync/aplicar. Nenhum HTTP é feito entre os apps por esta rota.',
    })
  },
  $apis.requireAuth(),
)
