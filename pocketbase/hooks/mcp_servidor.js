// MCP (Model Context Protocol) sobre HTTP — endpoint único, JSON-RPC 2.0.
//
//   POST /backend/v1/mcp
//   headers: Authorization: Bearer sk_live_...   OU   X-API-Key: sk_live_...
//   body:    {"jsonrpc":"2.0","id":1,"method":"initialize", ...}
//
// A chave é validada por SHA-256 contra api_keys.key_hash (a chave em claro nunca
// é guardada). Chave inexistente, inativa ou revogada → 401. Cada uso atualiza
// ultimo_uso_em. Escopos: leitura (só tools de leitura), leitura_escrita
// (leitura + criação/edição), admin (tudo, inclusive sistema_config).
//
// Métodos MCP suportados: initialize, notifications/initialized, ping,
// tools/list, tools/call. Desconhecido → -32601; params inválidos → -32602;
// negado por escopo → -32603 com "escopo insuficiente".
//
// 23 ferramentas: 14 de leitura + 9 de escrita.
//
// ATENÇÃO (Skip Cloud): declarações de topo do arquivo NÃO são visíveis dentro
// dos callbacks das rotas (VM própria por callback) — por isso TODA a definição
// e a execução das tools vive inline dentro do callback abaixo.
routerAdd(
  'POST',
  '/backend/v1/mcp',
  (e) => {
    const info = e.requestInfo()
    const headers = info.headers || {}
    const authHeader = String(headers.authorization || '')
    const apiKeyHeader = String(headers['x-api-key'] || '')
    let token = ''
    if (authHeader.toLowerCase().indexOf('bearer ') === 0) token = authHeader.substring(7).trim()
    else if (authHeader) token = authHeader.trim()
    if (!token && apiKeyHeader) token = apiKeyHeader.trim()
    const json401 = (mensagem) =>
      e.json(401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: mensagem } })
    if (!token) return json401('Chave de API ausente — envie Authorization: Bearer ou X-API-Key')

    // ---- valida a chave ----
    const hash = $security.sha256(token)
    let k = null
    try {
      const encontradas = $app.findRecordsByFilter('api_keys', 'key_hash = {:h}', '', 1, 0, {
        h: hash,
      })
      if (encontradas.length > 0) k = encontradas[0]
    } catch (_) {
      k = null
    }
    if (!k) return json401('Chave de API inválida')
    if (!k.getBool('ativa')) return json401('Chave de API revogada ou inativa')

    try {
      k.set('ultimo_uso_em', new Date().toISOString())
      $app.save(k)
    } catch (_) {}

    const escopo = String(k.getString('escopo') || 'leitura')
    const donoId = String(k.getString('owner') || '')
    let ehAdminUser = false
    try {
      ehAdminUser = $app.findRecordById('users', donoId).getString('role') === 'admin'
    } catch (_) {
      ehAdminUser = false
    }
    // admin efetivo: escopo admin E o dono da chave é admin
    const nivel = escopo === 'admin' && ehAdminUser ? 'admin' : escopo
    const podeEscrever = nivel === 'leitura_escrita' || nivel === 'admin'
    const podeAdmin = nivel === 'admin'
    const podeTudo = ehAdminUser // visibilidade de dados: admin vê tudo

    const body = info.body && typeof info.body === 'object' ? info.body : {}
    const metodo = String(body.method || '')
    const idRpc = body.id === undefined ? null : body.id
    const params = body.params && typeof body.params === 'object' ? body.params : {}

    const erroRpc = (codigo, mensagem, dados) => {
      const err = { code: codigo, message: mensagem }
      if (dados !== undefined) err.data = dados
      return e.json(200, { jsonrpc: '2.0', id: idRpc, error: err })
    }

    // ---- catálogo de tools (definição + execução inline) ----
    const LEITURA = [
      'leads_listar',
      'leads_obter',
      'leads_contagem_etapas',
      'listas_listar',
      'contatos_listar',
      'cadencias_listar',
      'qualificacoes_listar',
      'produtos_listar',
      'produtos_obter',
      'pontuacoes_consultar',
      'contextos_consultar',
      'metas_consultar',
      'sistema_config_consultar',
      'resumo_funil',
    ]
    const ESCRITA = [
      'leads_criar',
      'leads_atualizar',
      'leads_mover_etapa',
      'listas_criar',
      'listas_adicionar_membro',
      'contatos_registrar',
      'cadencias_criar_toque',
      'cadencias_atualizar_status',
      'qualificacoes_registrar',
    ]

    const jsSchema = (p) => JSON.stringify(p)
    const definicao = (nome, desc, schema, lida) => ({
      name: nome,
      description: desc,
      inputSchema: typeof schema === 'string' ? JSON.parse(schema) : schema,
      _leitura: !!lida,
    })

    // ============================================================
    // As 23 ferramentas. Para o arquivo completo com os schemas de
    // entrada de cada uma, ver a versão executável no Skip 50182.
    // Aqui ficam as definições e o roteamento; a lógica de execução
    // segue o mesmo padrão: valida argumento, checa dono, opera.
    // ============================================================
    const ferramentas = [
      definicao('leads_listar', 'Lista leads do funil com filtros opcionais por etapa, origem, responsável e busca textual. Retorna os campos principais de cada lead.', jsSchema({ type: 'object', properties: { etapa: { type: 'string', enum: ['lista','qualificacao','contato','cadencia','alinhamento','conversao','ganho','perdido'], description: 'Filtra por etapa do funil' }, origem: { type: 'string', enum: ['inbound','outbound'], description: 'Filtra por origem' }, owner: { type: 'string', description: 'Filtra por id do responsável (vendedor)' }, busca: { type: 'string', description: 'Busca textual no nome da empresa/contato' }, limite: { type: 'integer', minimum: 1, maximum: 200, default: 50 } } }), true),
      definicao('leads_obter', 'Obtém um lead pelo id, com seus dados completos (empresa, contato, etapa, score, UF/segmento).', jsSchema({ type: 'object', required: ['id'], properties: { id: { type: 'string', description: 'Id do lead' } } }), true),
      definicao('leads_criar', 'Cria um novo lead. Exige nome da empresa e origem; owner é o dono da chave (ou informado por admin).', jsSchema({ type: 'object', required: ['nome_empresa','origem'], properties: { nome_empresa: { type: 'string' }, origem: { type: 'string', enum: ['inbound','outbound'] }, contato_nome: { type: 'string' }, contato_email: { type: 'string' }, contato_telefone: { type: 'string' }, segmento: { type: 'string' }, uf: { type: 'string' }, cidade: { type: 'string' }, observacoes: { type: 'string' }, owner: { type: 'string', description: 'Id do responsável (só admin)' } } }), false),
      definicao('leads_atualizar', 'Atualiza campos de um lead existente (contato, segmento, observações etc.). Não altera etapa — use leads_mover_etapa.', jsSchema({ type: 'object', required: ['id'], properties: { id: { type: 'string' }, nome_empresa: { type: 'string' }, contato_nome: { type: 'string' }, contato_email: { type: 'string' }, contato_telefone: { type: 'string' }, segmento: { type: 'string' }, uf: { type: 'string' }, cidade: { type: 'string' }, observacoes: { type: 'string' } } }), false),
      definicao('leads_mover_etapa', 'Move um lead para outra etapa do funil.', jsSchema({ type: 'object', required: ['id','etapa'], properties: { id: { type: 'string' }, etapa: { type: 'string', enum: ['lista','qualificacao','contato','cadencia','alinhamento','conversao','ganho','perdido'] }, observacoes: { type: 'string' } } }), false),
      definicao('leads_contagem_etapas', 'Conta quantos leads há em cada etapa do funil.', jsSchema({ type: 'object', properties: { owner: { type: 'string' }, origem: { type: 'string', enum: ['inbound','outbound'] } } }), true),
      definicao('listas_listar', 'Lista as listas de leads (nome, origem, segmento, descrição).', jsSchema({ type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 200, default: 100 } } }), true),
      definicao('listas_criar', 'Cria uma nova lista de leads (nome e origem obrigatórios).', jsSchema({ type: 'object', required: ['nome','origem'], properties: { nome: { type: 'string' }, origem: { type: 'string', enum: ['inbound','outbound'] }, segmento: { type: 'string' }, descricao: { type: 'string' } } }), false),
      definicao('listas_adicionar_membro', 'Adiciona um lead como membro de uma lista.', jsSchema({ type: 'object', required: ['lista','lead'], properties: { lista: { type: 'string' }, lead: { type: 'string' } } }), false),
      definicao('contatos_listar', 'Lista os contatos registrados de um lead.', jsSchema({ type: 'object', required: ['lead'], properties: { lead: { type: 'string' } } }), true),
      definicao('contatos_registrar', 'Registra um contato feito com o lead.', jsSchema({ type: 'object', required: ['lead','canal','direcao'], properties: { lead: { type: 'string' }, canal: { type: 'string', enum: ['email','linkedin','whatsapp','telefone','evento'] }, direcao: { type: 'string', enum: ['inbound','outbound'] }, mensagem: { type: 'string' }, resposta: { type: 'string' }, data_contato: { type: 'string' } } }), false),
      definicao('cadencias_listar', 'Lista os toques de cadência de um lead.', jsSchema({ type: 'object', required: ['lead'], properties: { lead: { type: 'string' } } }), true),
      definicao('cadencias_criar_toque', 'Agenda/cria um toque de cadência para o lead.', jsSchema({ type: 'object', required: ['lead','toque','canal'], properties: { lead: { type: 'string' }, toque: { type: 'integer', minimum: 1, maximum: 99 }, canal: { type: 'string', enum: ['email','linkedin','whatsapp','telefone'] }, status: { type: 'string', enum: ['agendado','enviado','respondido','ignorado','cancelado'], default: 'agendado' }, rascunho_ia: { type: 'string' }, data_envio: { type: 'string' } } }), false),
      definicao('cadencias_atualizar_status', 'Atualiza o status de um toque de cadência existente.', jsSchema({ type: 'object', required: ['id','status'], properties: { id: { type: 'string' }, status: { type: 'string', enum: ['agendado','enviado','respondido','ignorado','cancelado'] }, data_envio: { type: 'string' } } }), false),
      definicao('qualificacoes_listar', 'Lista as qualificações registradas de um lead.', jsSchema({ type: 'object', required: ['lead'], properties: { lead: { type: 'string' } } }), true),
      definicao('qualificacoes_registrar', 'Registra uma qualificação: notas 0–10 por critério, decisão e score total 0–100.', jsSchema({ type: 'object', required: ['lead'], properties: { lead: { type: 'string' }, fit: { type: 'integer', minimum: 0, maximum: 10 }, dor: { type: 'integer', minimum: 0, maximum: 10 }, orcamento: { type: 'integer', minimum: 0, maximum: 10 }, timing: { type: 'integer', minimum: 0, maximum: 10 }, acesso: { type: 'integer', minimum: 0, maximum: 10 }, decisao: { type: 'string', enum: ['qualificado','nao_qualificado','revisar'] }, score_total: { type: 'integer', minimum: 0, maximum: 100 }, notas: { type: 'string' } } }), false),
      definicao('produtos_listar', 'Lista os produtos do catálogo.', jsSchema({ type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 200, default: 100 } } }), true),
      definicao('produtos_obter', 'Obtém um produto pelo id.', jsSchema({ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }), true),
      definicao('pontuacoes_consultar', 'Consulta as pontuações calculadas de um lead.', jsSchema({ type: 'object', required: ['lead'], properties: { lead: { type: 'string' } } }), true),
      definicao('contextos_consultar', 'Consulta o estado comercial de uma pessoa ou lead.', jsSchema({ type: 'object', properties: { pessoa: { type: 'string' }, lead: { type: 'string' }, produto: { type: 'string' } } }), true),
      definicao('metas_consultar', 'Consulta as metas do usuário da chave.', jsSchema({ type: 'object', properties: { user: { type: 'string' } } }), true),
      definicao('sistema_config_consultar', 'Consulta a configuração do sistema. Exige escopo admin.', jsSchema({ type: 'object', properties: {} }), true),
      definicao('resumo_funil', 'Resumo geral do funil: leads por etapa, contatos na semana, toques agendados.', jsSchema({ type: 'object', properties: { owner: { type: 'string' } } }), true),
    ]

    // filtra por escopo
    const visiveis = []
    for (let i = 0; i < ferramentas.length; i++) {
      const t = ferramentas[i]
      if (t._leitura) visiveis.push(t)
      else if (podeEscrever) visiveis.push(t)
    }

    // ---------- execução das tools ----------
    // Padrão de cada uma: valida argumento obrigatório, checa dono (quando não admin),
    // opera só na coleção da sua responsabilidade, devolve { ok } ou { erro }.
    const executar = (nomeTool, args) => {
      if (nomeTool === 'leads_listar') {
        const conds = []
        const p = {}
        if (args.etapa) { conds.push('etapa = {:etapa}'); p.etapa = String(args.etapa) }
        if (args.origem) { conds.push('origem = {:origem}'); p.origem = String(args.origem) }
        if (args.owner && podeTudo) { conds.push('owner = {:owner}'); p.owner = String(args.owner) }
        if (args.busca) { conds.push('(nome_empresa ~ {:b} || contato_nome ~ {:b})'); p.b = String(args.busca) }
        if (!podeTudo) { conds.push('owner = {:dono}'); p.dono = donoId }
        const filtro = conds.join(' && ')
        const limite = Math.max(1, Math.min(200, Number(args.limite || 50)))
        let recs = []
        try {
          recs = $app.findRecordsByFilter('leads', filtro, '-created', limite, 0, p)
        } catch (err) {
          return { erro: 'Falha ao buscar leads: ' + String(err) }
        }
        const itens = []
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i]
          itens.push({ id: r.id, nome_empresa: r.getString('nome_empresa'), contato_nome: r.getString('contato_nome'), contato_email: r.getString('contato_email'), etapa: r.getString('etapa'), origem: r.getString('origem'), score: Number(r.get('score') || 0), owner: r.getString('owner'), segmento: r.getString('segmento'), uf: r.getString('uf'), criado_em: r.getString('created') })
        }
        return { total: itens.length, leads: itens }
      }
      if (nomeTool === 'leads_obter') {
        if (!args.id) return { erro: 'Informe o id do lead' }
        let r
        try { r = $app.findRecordById('leads', String(args.id)) } catch (_) { return { erro: 'Lead não encontrado' } }
        if (!podeTudo && r.getString('owner') !== donoId) return { erro: 'Lead não pertence a você' }
        return { id: r.id, nome_empresa: r.getString('nome_empresa'), contato_nome: r.getString('contato_nome'), contato_email: r.getString('contato_email'), contato_telefone: r.getString('contato_telefone'), etapa: r.getString('etapa'), origem: r.getString('origem'), score: Number(r.get('score') || 0), observacoes: r.getString('observacoes'), segmento: r.getString('segmento'), uf: r.getString('uf'), cidade: r.getString('cidade'), owner: r.getString('owner'), criado_em: r.getString('created') }
      }
      if (nomeTool === 'leads_criar') {
        if (!args.nome_empresa) return { erro: 'nome_empresa é obrigatório' }
        if (!args.origem) return { erro: 'origem é obrigatório (inbound ou outbound)' }
        const col = $app.findCollectionByNameOrId('leads')
        const rec = new Record(col)
        rec.set('owner', podeTudo && args.owner ? String(args.owner) : donoId)
        rec.set('nome_empresa', String(args.nome_empresa))
        rec.set('origem', String(args.origem))
        if (args.contato_nome) rec.set('contato_nome', String(args.contato_nome))
        if (args.contato_email) rec.set('contato_email', String(args.contato_email))
        if (args.contato_telefone) rec.set('contato_telefone', String(args.contato_telefone))
        if (args.segmento) rec.set('segmento', String(args.segmento))
        if (args.uf) rec.set('uf', String(args.uf))
        if (args.cidade) rec.set('cidade', String(args.cidade))
        if (args.observacoes) rec.set('observacoes', String(args.observacoes))
        try { $app.save(rec) } catch (err) { return { erro: 'Falha ao criar lead: ' + String(err) } }
        return { ok: true, id: rec.id, detalhe: 'Lead criado' }
      }
      if (nomeTool === 'leads_atualizar') {
        if (!args.id) return { erro: 'Informe o id do lead' }
        let r
        try { r = $app.findRecordById('leads', String(args.id)) } catch (_) { return { erro: 'Lead não encontrado' } }
        if (!podeTudo && r.getString('owner') !== donoId) return { erro: 'Lead não pertence a você' }
        if (args.nome_empresa) r.set('nome_empresa', String(args.nome_empresa))
        if (args.contato_nome) r.set('contato_nome', String(args.contato_nome))
        if (args.contato_email) r.set('contato_email', String(args.contato_email))
        if (args.contato_telefone) r.set('contato_telefone', String(args.contato_telefone))
        if (args.segmento) r.set('segmento', String(args.segmento))
        if (args.uf) r.set('uf', String(args.uf))
        if (args.cidade) r.set('cidade', String(args.cidade))
        if (args.observacoes) r.set('observacoes', String(args.observacoes))
        try { $app.save(r) } catch (err) { return { erro: 'Falha ao atualizar: ' + String(err) } }
        return { ok: true, id: r.id, detalhe: 'Lead atualizado' }
      }
      if (nomeTool === 'leads_mover_etapa') {
        if (!args.id) return { erro: 'Informe o id do lead' }
        const ETAPAS = ['lista','qualificacao','contato','cadencia','alinhamento','conversao','ganho','perdido']
        const etapa = String(args.etapa || '')
        if (ETAPAS.indexOf(etapa) === -1) return { erro: 'Etapa inválida — use uma de: ' + ETAPAS.join(', ') }
        let r
        try { r = $app.findRecordById('leads', String(args.id)) } catch (_) { return { erro: 'Lead não encontrado' } }
        if (!podeTudo && r.getString('owner') !== donoId) return { erro: 'Lead não pertence a você' }
        r.set('etapa', etapa)
        if (args.observacoes) r.set('observacoes', String(args.observacoes))
        try { $app.save(r) } catch (err) { return { erro: 'Falha ao mover etapa: ' + String(err) } }
        return { ok: true, id: r.id, etapa: etapa, detalhe: 'Lead movido para ' + etapa }
      }
      if (nomeTool === 'leads_contagem_etapas') {
        const ETAPAS = ['lista','qualificacao','contato','cadencia','alinhamento','conversao','ganho','perdido']
        const contagem = {}
        for (let i = 0; i < ETAPAS.length; i++) {
          const conds = ['etapa = {:e}']
          const p = { e: ETAPAS[i] }
          if (args.owner && podeTudo) { conds.push('owner = {:o}'); p.o = String(args.owner) }
          if (!podeTudo) { conds.push('owner = {:d}'); p.d = donoId }
          if (args.origem) { conds.push('origem = {:or}'); p.or = String(args.origem) }
          try { contagem[ETAPAS[i]] = $app.countRecords('leads', conds.join(' && '), p) } catch (_) { contagem[ETAPAS[i]] = 0 }
        }
        return { contagem: contagem }
      }
      if (nomeTool === 'listas_listar') {
        const conds = []
        const p = {}
        if (!podeTudo) { conds.push('owner = {:d}'); p.d = donoId }
        const limite = Math.max(1, Math.min(200, Number(args.limite || 100)))
        let recs = []
        try { recs = $app.findRecordsByFilter('listas', conds.join(' && '), '-created', limite, 0, p) } catch (_) { recs = [] }
        const itens = []
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i]
          itens.push({ id: r.id, nome: r.getString('nome'), origem: r.getString('origem'), segmento: r.getString('segmento'), descricao: r.getString('descricao') })
        }
        return { total: itens.length, listas: itens }
      }
      if (nomeTool === 'listas_criar') {
        if (!args.nome) return { erro: 'nome é obrigatório' }
        if (!args.origem) return { erro: 'origem é obrigatório (inbound ou outbound)' }
        const col = $app.findCollectionByNameOrId('listas')
        const rec = new Record(col)
        rec.set('owner', donoId)
        rec.set('nome', String(args.nome))
        rec.set('origem', String(args.origem))
        if (args.segmento) rec.set('segmento', String(args.segmento))
        if (args.descricao) rec.set('descricao', String(args.descricao))
        try { $app.save(rec) } catch (err) { return { erro: 'Falha ao criar lista: ' + String(err) } }
        return { ok: true, id: rec.id, detalhe: 'Lista criada' }
      }
      if (nomeTool === 'listas_adicionar_membro') {
        if (!args.lista || !args.lead) return { erro: 'Informe lista e lead' }
        let lista, lead
        try { lista = $app.findRecordById('listas', String(args.lista)) } catch (_) { return { erro: 'Lista não encontrada' } }
        try { lead = $app.findRecordById('leads', String(args.lead)) } catch (_) { return { erro: 'Lead não encontrado' } }
        if (!podeTudo && (lista.getString('owner') !== donoId || lead.getString('owner') !== donoId)) return { erro: 'Lista e lead devem pertencer a você' }
        const col = $app.findCollectionByNameOrId('lista_membros')
        const rec = new Record(col)
        rec.set('owner', donoId)
        rec.set('lista', lista.id)
        rec.set('lead', lead.id)
        rec.set('ambiente', 'teste')
        try { $app.save(rec) } catch (err) {
          const m = String(err)
          if (m.indexOf('UNIQUE') !== -1 || m.indexOf('unique') !== -1) return { erro: 'Lead já é membro desta lista' }
          return { erro: 'Falha ao adicionar membro: ' + m }
        }
        return { ok: true, id: rec.id, detalhe: 'Lead adicionado à lista' }
      }
      if (nomeTool === 'contatos_listar') {
        if (!args.lead) return { erro: 'Informe o id do lead' }
        let recs = []
        try { recs = $app.findRecordsByFilter('contatos', 'lead = {:l}', '-created', 100, 0, { l: String(args.lead) }) } catch (_) { recs = [] }
        const itens = []
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i]
          itens.push({ id: r.id, canal: r.getString('canal'), direcao: r.getString('direcao'), mensagem: r.getString('mensagem'), resposta: r.getString('resposta'), data_contato: r.getString('data_contato'), criado_em: r.getString('created') })
        }
        return { total: itens.length, contatos: itens }
      }
      if (nomeTool === 'contatos_registrar') {
        if (!args.lead) return { erro: 'Informe o id do lead' }
        const CANAIS = ['email','linkedin','whatsapp','telefone','evento']
        if (CANAIS.indexOf(String(args.canal || '')) === -1) return { erro: 'canal inválido — use: ' + CANAIS.join(', ') }
        if (['inbound','outbound'].indexOf(String(args.direcao || '')) === -1) return { erro: 'direcao inválida — inbound ou outbound' }
        let lead
        try { lead = $app.findRecordById('leads', String(args.lead)) } catch (_) { return { erro: 'Lead não encontrado' } }
        if (!podeTudo && lead.getString('owner') !== donoId) return { erro: 'Lead não pertence a você' }
        const col = $app.findCollectionByNameOrId('contatos')
        const rec = new Record(col)
        rec.set('owner', donoId)
        rec.set('lead', lead.id)
        rec.set('canal', String(args.canal))
        rec.set('direcao', String(args.direcao))
        if (args.mensagem) rec.set('mensagem', String(args.mensagem))
        if (args.resposta) rec.set('resposta', String(args.resposta))
        rec.set('data_contato', args.data_contato ? String(args.data_contato) : new Date().toISOString())
        try { $app.save(rec) } catch (err) { return { erro: 'Falha ao registrar contato: ' + String(err) } }
        return { ok: true, id: rec.id, detalhe: 'Contato registrado' }
      }
      if (nomeTool === 'cadencias_listar') {
        if (!args.lead) return { erro: 'Informe o id do lead' }
        let recs = []
        try { recs = $app.findRecordsByFilter('cadencias', 'lead = {:l}', 'toque', 100, 0, { l: String(args.lead) }) } catch (_) { recs = [] }
        const itens = []
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i]
          itens.push({ id: r.id, toque: Number(r.get('toque') || 0), canal: r.getString('canal'), status: r.getString('status'), data_envio: r.getString('data_envio'), rascunho_ia: r.getString('rascunho_ia') })
        }
        return { total: itens.length, toques: itens }
      }
      if (nomeTool === 'cadencias_criar_toque') {
        if (!args.lead) return { erro: 'Informe o id do lead' }
        const n = Number(args.toque)
        if (!Number.isInteger(n) || n < 1 || n > 99) return { erro: 'toque deve ser inteiro entre 1 e 99' }
        const CANAIS = ['email','linkedin','whatsapp','telefone']
        if (CANAIS.indexOf(String(args.canal || '')) === -1) return { erro: 'canal inválido — use: ' + CANAIS.join(', ') }
        const STATUS = ['agendado','enviado','respondido','ignorado','cancelado']
        const status = args.status ? String(args.status) : 'agendado'
        if (STATUS.indexOf(status) === -1) return { erro: 'status inválido — use: ' + STATUS.join(', ') }
        let lead
        try { lead = $app.findRecordById('leads', String(args.lead)) } catch (_) { return { erro: 'Lead não encontrado' } }
        if (!podeTudo && lead.getString('owner') !== donoId) return { erro: 'Lead não pertence a você' }
        const col = $app.findCollectionByNameOrId('cadencias')
        const rec = new Record(col)
        rec.set('owner', donoId)
        rec.set('lead', lead.id)
        rec.set('toque', n)
        rec.set('canal', String(args.canal))
        rec.set('status', status)
        if (args.rascunho_ia) rec.set('rascunho_ia', String(args.rascunho_ia))
        if (args.data_envio) rec.set('data_envio', String(args.data_envio))
        try { $app.save(rec) } catch (err) { return { erro: 'Falha ao criar toque: ' + String(err) } }
        return { ok: true, id: rec.id, detalhe: 'Toque de cadência criado (' + status + ')' }
      }
      if (nomeTool === 'cadencias_atualizar_status') {
        if (!args.id) return { erro: 'Informe o id do toque de cadência' }
        const STATUS = ['agendado','enviado','respondido','ignorado','cancelado']
        const status = String(args.status || '')
        if (STATUS.indexOf(status) === -1) return { erro: 'status inválido — use: ' + STATUS.join(', ') }
        let r
        try { r = $app.findRecordById('cadencias', String(args.id)) } catch (_) { return { erro: 'Toque de cadência não encontrado' } }
        if (!podeTudo && r.getString('owner') !== donoId) return { erro: 'Toque não pertence a você' }
        r.set('status', status)
        if (args.data_envio) r.set('data_envio', String(args.data_envio))
        try { $app.save(r) } catch (err) { return { erro: 'Falha ao atualizar status: ' + String(err) } }
        return { ok: true, id: r.id, status: status, detalhe: 'Status atualizado para ' + status }
      }
      if (nomeTool === 'qualificacoes_listar') {
        if (!args.lead) return { erro: 'Informe o id do lead' }
        let recs = []
        try { recs = $app.findRecordsByFilter('qualificacoes', 'lead = {:l}', '-created', 100, 0, { l: String(args.lead) }) } catch (_) { recs = [] }
        const itens = []
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i]
          itens.push({ id: r.id, fit: Number(r.get('fit') || 0), dor: Number(r.get('dor') || 0), orcamento: Number(r.get('orcamento') || 0), timing: Number(r.get('timing') || 0), acesso: Number(r.get('acesso') || 0), score_total: Number(r.get('score_total') || 0), decisao: r.getString('decisao'), notas: r.getString('notas') })
        }
        return { total: itens.length, qualificacoes: itens }
      }
      if (nomeTool === 'qualificacoes_registrar') {
        if (!args.lead) return { erro: 'Informe o id do lead' }
        let lead
        try { lead = $app.findRecordById('leads', String(args.lead)) } catch (_) { return { erro: 'Lead não encontrado' } }
        if (!podeTudo && lead.getString('owner') !== donoId) return { erro: 'Lead não pertence a você' }
        const DECISOES = ['qualificado','nao_qualificado','revisar']
        if (args.decisao && DECISOES.indexOf(String(args.decisao)) === -1) return { erro: 'decisao inválida — use: ' + DECISOES.join(', ') }
        const notaOk = (v) => v === undefined || v === null || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 10)
        if (!notaOk(args.fit) || !notaOk(args.dor) || !notaOk(args.orcamento) || !notaOk(args.timing) || !notaOk(args.acesso)) return { erro: 'Notas (fit, dor, orcamento, timing, acesso) devem ser inteiros 0–10' }
        if (args.score_total !== undefined && (!Number.isInteger(Number(args.score_total)) || Number(args.score_total) < 0 || Number(args.score_total) > 100)) return { erro: 'score_total deve ser inteiro 0–100' }
        const col = $app.findCollectionByNameOrId('qualificacoes')
        const rec = new Record(col)
        rec.set('owner', donoId)
        rec.set('lead', lead.id)
        if (args.fit !== undefined) rec.set('fit', Number(args.fit))
        if (args.dor !== undefined) rec.set('dor', Number(args.dor))
        if (args.orcamento !== undefined) rec.set('orcamento', Number(args.orcamento))
        if (args.timing !== undefined) rec.set('timing', Number(args.timing))
        if (args.acesso !== undefined) rec.set('acesso', Number(args.acesso))
        if (args.decisao) rec.set('decisao', String(args.decisao))
        if (args.score_total !== undefined) rec.set('score_total', Number(args.score_total))
        if (args.notas) rec.set('notas', String(args.notas))
        try { $app.save(rec) } catch (err) { return { erro: 'Falha ao registrar qualificação: ' + String(err) } }
        return { ok: true, id: rec.id, detalhe: 'Qualificação registrada' }
      }
      if (nomeTool === 'produtos_listar') {
        const limite = Math.max(1, Math.min(200, Number(args.limite || 100)))
        let recs = []
        try { recs = $app.findRecordsByFilter('produtos', '', 'ordem', limite, 0, {}) } catch (_) { recs = [] }
        const itens = []
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i]
          itens.push({ id: r.id, nome: r.getString('nome'), degrau: r.getString('degrau'), preco: Number(r.get('preco') || 0), faixa_preco: r.getString('faixa_preco'), tipo_atendimento: r.getString('tipo_atendimento'), ativo: r.getBool('ativo'), icp: String(r.getString('icp') || '') })
        }
        return { total: itens.length, produtos: itens }
      }
      if (nomeTool === 'produtos_obter') {
        if (!args.id) return { erro: 'Informe o id do produto' }
        let r
        try { r = $app.findRecordById('produtos', String(args.id)) } catch (_) { return { erro: 'Produto não encontrado' } }
        return { id: r.id, nome: r.getString('nome'), degrau: r.getString('degrau'), area: r.getString('area'), preco: Number(r.get('preco') || 0), faixa_preco: r.getString('faixa_preco'), tipo_atendimento: r.getString('tipo_atendimento'), icp: String(r.getString('icp') || ''), playbook: r.getString('playbook'), tom: r.getString('tom'), ativo: r.getBool('ativo') }
      }
      if (nomeTool === 'pontuacoes_consultar') {
        if (!args.lead) return { erro: 'Informe o id do lead' }
        const conds = ['lead = {:l}']
        const p = { l: String(args.lead) }
        if (!podeTudo) { conds.push('owner = {:d}'); p.d = donoId }
        let recs = []
        try { recs = $app.findRecordsByFilter('pontuacoes', conds.join(' && '), '-created', 100, 0, p) } catch (_) { recs = [] }
        const itens = []
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i]
          itens.push({ id: r.id, produto: r.getString('produto'), versao: Number(r.get('versao') || 0), status: r.getString('status'), valor: Number(r.get('valor') || 0), faixa: r.getString('faixa'), motivos: String(r.getString('motivos') || ''), atualizado_em: r.getString('updated') })
        }
        return { total: itens.length, pontuacoes: itens }
      }
      if (nomeTool === 'contextos_consultar') {
        if (!args.pessoa && !args.lead) return { erro: 'Informe pessoa ou lead' }
        const conds = []
        const p = {}
        if (args.pessoa) { conds.push('pessoa = {:pe}'); p.pe = String(args.pessoa) }
        if (args.produto) { conds.push('produto = {:pr}'); p.pr = String(args.produto) }
        if (args.lead) {
          let leadRec = null
          try { leadRec = $app.findRecordById('leads', String(args.lead)) } catch (_) { return { erro: 'Lead não encontrado' } }
          const pessoaId = String(leadRec.getString('pessoa') || '')
          if (!pessoaId) return { erro: 'O lead não tem pessoa vinculada — informe a pessoa diretamente' }
          conds.push('pessoa = {:pe}')
          p.pe = pessoaId
        }
        if (!podeTudo) { conds.push('owner = {:d}'); p.d = donoId }
        if (conds.length === 0) return { erro: 'Nada para buscar' }
        let recs = []
        try { recs = $app.findRecordsByFilter('contextos_comerciais', conds.join(' && '), '-updated', 50, 0, p) } catch (_) { recs = [] }
        const itens = []
        for (let i = 0; i < recs.length; i++) {
          const r = recs[i]
          itens.push({ id: r.id, pessoa: r.getString('pessoa'), produto: r.getString('produto'), lead: r.getString('lead'), estado: r.getString('estado'), motivo: r.getString('motivo'), motivo_codigo: r.getString('motivo_codigo'), etapa_legada: r.getString('etapa_legada'), atualizado_em: r.getString('updated') })
        }
        return { total: itens.length, contextos: itens }
      }
      if (nomeTool === 'metas_consultar') {
        const alvo = podeTudo && args.user ? String(args.user) : donoId
        let recs = []
        try { recs = $app.findRecordsByFilter('metas', 'user = {:u}', '-created', 5, 0, { u: alvo }) } catch (_) { recs = [] }
        if (recs.length === 0) return { user: alvo, metas: null, detalhe: 'Nenhuma meta definida para este usuário' }
        const r = recs[0]
        return { user: alvo, metas: { contatos: Number(r.get('contatos') || 0), oportunidades: Number(r.get('oportunidades') || 0), propostas: Number(r.get('propostas') || 0), forecast: Number(r.get('forecast') || 0), fechados: Number(r.get('fechados') || 0) } }
      }
      if (nomeTool === 'sistema_config_consultar') {
        let recs = []
        try { recs = $app.findRecordsByFilter('sistema_config', '', '-updated', 1, 0, {}) } catch (_) { recs = [] }
        if (recs.length === 0) return { detalhe: 'Nenhuma configuração registrada' }
        const r = recs[0]
        return { ambiente: r.getString('ambiente'), pausa_geral: r.getBool('pausa_geral'), envio_real_habilitado: r.getBool('envio_real_habilitado'), integracoes_externas_habilitadas: r.getBool('integracoes_externas_habilitadas'), timezone: r.getString('timezone') }
      }
      if (nomeTool === 'resumo_funil') {
        const ETAPAS = ['lista','qualificacao','contato','cadencia','alinhamento','conversao','ganho','perdido']
        const condsBase = []
        const pBase = {}
        if (args.owner && podeTudo) { condsBase.push('owner = {:o}'); pBase.o = String(args.owner) }
        if (!podeTudo) { condsBase.push('owner = {:d}'); pBase.d = donoId }
        const filtroBase = condsBase.join(' && ')
        const porEtapa = {}
        let totalLeads = 0
        for (let i = 0; i < ETAPAS.length; i++) {
          let n = 0
          try {
            n = $app.countRecords('leads', (filtroBase ? filtroBase + ' && ' : '') + 'etapa = {:e}', Object.assign({}, pBase, { e: ETAPAS[i] }))
          } catch (_) { n = 0 }
          porEtapa[ETAPAS[i]] = n
          totalLeads += n
        }
        const desde = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().replace('T', ' ').substring(0, 19)
        let contatosSemana = 0
        try { contatosSemana = $app.countRecords('contatos', 'created > {:d}', { d: desde }) } catch (_) { contatosSemana = 0 }
        let toquesAgendados = 0
        try { toquesAgendados = $app.countRecords('cadencias', 'status = {:s}', { s: 'agendado' }) } catch (_) { toquesAgendados = 0 }
        return { total_leads: totalLeads, por_etapa: porEtapa, contatos_ultimos_7_dias: contatosSemana, toques_agendados: toquesAgendados }
      }
      return { erro: 'Ferramenta não implementada: ' + nomeTool }
    }

    // ---- roteia os métodos MCP ----
    if (metodo === 'initialize') {
      return e.json(200, {
        jsonrpc: '2.0',
        id: idRpc,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'funil-simbiosia-mcp', version: '1.0.0' },
          instructions: 'Servidor MCP do CRM Funil MKT & Vendas Simbiosia. Use tools/list para ver as ferramentas. Escopo da chave: ' + nivel + '.',
        },
      })
    }
    if (metodo === 'notifications/initialized' || metodo === 'ping') {
      if (idRpc === null) return e.json(204, null)
      return e.json(200, { jsonrpc: '2.0', id: idRpc, result: {} })
    }
    if (metodo === 'tools/list') {
      return e.json(200, { jsonrpc: '2.0', id: idRpc, result: { tools: visiveis } })
    }
    if (metodo === 'tools/call') {
      const nomeTool = String(params.name || '')
      if (!nomeTool) return erroRpc(-32602, 'params.name é obrigatório')
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
      let ehLeitura = false
      for (let i = 0; i < LEITURA.length; i++) if (LEITURA[i] === nomeTool) ehLeitura = true
      let ehEscrita = false
      for (let i = 0; i < ESCRITA.length; i++) if (ESCRITA[i] === nomeTool) ehEscrita = true
      if (!ehLeitura && !ehEscrita) return erroRpc(-32601, 'Ferramenta desconhecida: ' + nomeTool)
      if (ehEscrita && !podeEscrever) return erroRpc(-32603, 'escopo insuficiente: a chave "' + escopo + '" só permite leitura')
      if (nomeTool === 'sistema_config_consultar' && !podeAdmin) return erroRpc(-32603, 'escopo insuficiente: sistema_config_consultar exige escopo admin')
      const saida = executar(nomeTool, args)
      if (saida && saida.erro)
        return e.json(200, { jsonrpc: '2.0', id: idRpc, result: { isError: true, content: [{ type: 'text', text: String(saida.erro) }] } })
      return e.json(200, { jsonrpc: '2.0', id: idRpc, result: { isError: false, content: [{ type: 'text', text: JSON.stringify(saida) }] } })
    }
    if (idRpc === null) return e.json(204, null)
    return erroRpc(-32601, 'Método desconhecido: ' + metodo)
  },
  // SEM $apis.requireAuth(): a autenticação aqui é pela própria API key, validada acima
)
