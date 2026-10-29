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

    // HASH DO PAYLOAD — tem de ser EXATAMENTE o algoritmo da Fábrica, senão ela recusa com
    // "payload_hash diverge do payload". Não é um hash qualquer: é a canonização JSON com
    // chaves ordenadas + FNV-1a combinado, truncado em 64 caracteres hex.
    // INLINE no callback: a VM do PocketBase não enxerga função top-level (ReferenceError).
    const hashCanonico = (valor) => {
      const jsonCanonico = (v) => {
        const t = typeof v
        if (v === null || t === 'undefined') return 'null'
        if (t === 'number') return isFinite(v) ? String(v) : 'null'
        if (t === 'boolean') return v ? 'true' : 'false'
        if (t === 'string') return JSON.stringify(v)
        if (Array.isArray(v)) {
          const itens = []
          for (let i = 0; i < v.length; i++) itens.push(jsonCanonico(v[i]))
          return '[' + itens.join(',') + ']'
        }
        const chaves = Object.keys(v).sort()
        const pares = []
        for (let k = 0; k < chaves.length; k++) {
          const c = chaves[k]
          const val = v[c]
          if (val === undefined) continue
          pares.push(JSON.stringify(c) + ':' + jsonCanonico(val))
        }
        return '{' + pares.join(',') + '}'
      }
      const texto = jsonCanonico(valor)
      let h1 = 0x811c9dc5
      let h2 = 0x1000193
      for (let i = 0; i < texto.length; i++) {
        const c = texto.charCodeAt(i)
        h1 = (h1 ^ c) >>> 0
        h1 = Math.imul(h1, 0x01000193) >>> 0
        h2 = (h2 + Math.imul(c, i + 1)) >>> 0
      }
      let saida = ''
      for (let k = 0; k < 8; k++) {
        saida += ((h1 ^ (h2 + Math.imul(k, 0x9e3779b9))) >>> 0).toString(16).padStart(8, '0')
      }
      return saida.substring(0, 64)
    }

    // Referência de ator para o mapeamento aprovado na Fábrica (sync_mapeamentos).
    // Nesta fase o ator é o SISTEMA, não uma pessoa: não existe usuário local atravessando.
    const REFERENCIA_ATOR = 'sistema:funil'

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

      // CONTRATO v1 HERDADO (Fase 1) — o formato é fechado e a Fábrica recusa o que não declara:
      //   campos de fora: ambiente, tipo_evento, entidade_global_id, dominio, revisao,
      //                   payload_hash, payload, ocorrido_em, referencia_ator_mapeada
      //   dentro de payload: contexto_global_id, pessoa_global_id, primeira_abordagem_em /
      //                   bloqueio_global + motivo
      // Descobri isso aplicando de verdade: meu primeiro formato era "campo não declarado:
      // bloqueio_global". Cada domínio tem seu tipo_evento — estado_comercial e protecao_global
      // são eventos SEPARADOS, não um só com tudo dentro.
      const contextoGid = contextoGlobal || pessoaGlobal

      // 1) fato comercial: primeira abordagem
      const payloadComercial = {
        contexto_global_id: contextoGid,
        pessoa_global_id: pessoaGlobal,
        primeira_abordagem_em: primeira,
      }
      // Envelope do contrato v1 — dois padrões que a Fábrica exige e que eu não podia inventar:
      //   entidade_global_id: FAB:<ambiente>:<tipo>:<chave>  (tipos: empresa|pessoa|contexto|produto)
      //   evento_id:          funil:<ambiente>:evento:<chave>
      // A chave é determinística, então reexportar o mesmo fato NÃO cria evento novo — é o que
      // torna a aplicação idempotente. O sync_global_id do Funil é preservado dentro da chave.
      const chaveIdentidade = 'pessoa:teste:' + pessoaGlobal
      const entidadeFAB = 'FAB:teste:pessoa:' + pessoaGlobal
      eventos.push({
        contrato_versao: 1,
        evento_id: 'funil:teste:evento:comercial-' + chaveIdentidade,
        origem: 'funil',
        ambiente: 'teste',
        tipo_evento: 'estado_comercial',
        entidade_global_id: entidadeFAB,
        dominio: 'comercial',
        revisao: 1,
        payload_hash: hashCanonico(payloadComercial),
        payload: payloadComercial,
        ocorrido_em: primeira,
        // ATOR: a Fábrica exige um mapeamento aprovado (sync_mapeamentos) por referência de ator.
        // Sem ele o evento fica PENDENTE — comportamento correto, não erro. Esta referência é
        // fixa porque, nesta fase, o ator é o próprio sistema, não uma pessoa.
        referencia_ator_mapeada: REFERENCIA_ATOR,
      })

      // 2) proteção: só quando existe bloqueio (domínio próprio, evento próprio)
      if (bloqueio) {
        const payloadProtecao = {
          contexto_global_id: contextoGid,
          pessoa_global_id: pessoaGlobal,
          bloqueio_global: true,
          motivo: motivoBloqueio,
        }
        eventos.push({
          contrato_versao: 1,
          evento_id: 'funil:teste:evento:protecao-' + chaveIdentidade,
          origem: 'funil',
          ambiente: 'teste',
          tipo_evento: 'protecao_global',
          entidade_global_id: entidadeFAB,
          dominio: 'protecao',
          revisao: 1,
          payload_hash: hashCanonico(payloadProtecao),
          payload: payloadProtecao,
          ocorrido_em: primeira,
          referencia_ator_mapeada: REFERENCIA_ATOR,
        })
      }
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
