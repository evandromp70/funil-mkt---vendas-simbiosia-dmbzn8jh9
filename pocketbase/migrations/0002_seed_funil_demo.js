migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')

    // ---------- usuários ----------
    const getOrCreateUser = (email, name) => {
      try {
        return app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {}
      const u = new Record(users)
      u.setEmail(email)
      u.setPassword('Simbiosia@2026')
      u.setVerified(true)
      u.set('name', name)
      app.save(u)
      return u
    }

    const jose = getOrCreateUser('jose@simbiosia.com.br', 'José Aquino')
    const evandro = getOrCreateUser('evandro@simbiosia.com.br', 'Evandro Pereira')

    // ---------- leads de demonstração ----------
    const leadsCol = app.findCollectionByNameOrId('leads')

    const seedLead = (fields) => {
      try {
        const existing = app.findFirstRecordByData('leads', 'nome_empresa', fields.nome_empresa)
        return existing
      } catch (_) {}
      const r = new Record(leadsCol)
      r.set('owner', fields.owner)
      r.set('nome_empresa', fields.nome_empresa)
      r.set('contato_nome', fields.contato_nome || '')
      r.set('contato_email', fields.contato_email || '')
      r.set('contato_telefone', fields.contato_telefone || '')
      r.set('origem', fields.origem)
      r.set('etapa', fields.etapa)
      r.set('score', fields.score ?? null)
      r.set('observacoes', fields.observacoes || '')
      app.save(r)
      return r
    }

    const l1 = seedLead({
      owner: jose.id,
      nome_empresa: 'Grupo Andrade Distribuidora',
      contato_nome: 'Renata Andrade',
      contato_email: 'renata@grupoandrade.com.br',
      origem: 'outbound',
      etapa: 'cadencia',
      score: 82,
      observacoes:
        'Distribuidora de alimentos, médio porte. Diretora comercial engajada; IA para prever demanda e otimizar estoque.',
    })
    const l2 = seedLead({
      owner: jose.id,
      nome_empresa: 'Clínica Vida Plena',
      contato_nome: 'Dr. Felipe Souza',
      contato_email: 'felipe@vidaplena.com.br',
      origem: 'inbound',
      etapa: 'alinhamento',
      score: 74,
      observacoes:
        'Chegou pelo LinkedIn após post sobre IA nas empresas. Rede de 4 clínicas; quer agente de agendamento e prontuário assistido.',
    })
    const l3 = seedLead({
      owner: jose.id,
      nome_empresa: 'Metalúrgica Braseiro',
      contato_nome: 'Carlos Menezes',
      contato_email: 'carlos@braseiro.com.br',
      origem: 'outbound',
      etapa: 'contato',
      score: 58,
      observacoes:
        'Primeiro contato enviado; aguardando resposta. Interesse inicial em treinamento de liderança em IA.',
    })
    const l4 = seedLead({
      owner: jose.id,
      nome_empresa: 'Logística Rápido Norte',
      contato_nome: 'Paula Ferreira',
      contato_email: 'paula@rapidonorte.com.br',
      origem: 'outbound',
      etapa: 'lista',
      score: null,
      observacoes: 'Adicionada à lista outbound de logística. Ainda sem contato.',
    })
    const l5 = seedLead({
      owner: evandro.id,
      nome_empresa: 'Fábrica de Software Nexus',
      contato_nome: 'Bruno Lima',
      contato_email: 'bruno@nexus.dev.br',
      origem: 'inbound',
      etapa: 'qualificacao',
      score: 66,
      observacoes: 'Lead inbound do site; preencheu formulário de diagnóstico gratuito.',
    })

    // ---------- listas ----------
    const listasCol = app.findCollectionByNameOrId('listas')
    const seedLista = (nome, origem, segmento, descricao, ownerId) => {
      try {
        return app.findFirstRecordByData('listas', 'nome', nome)
      } catch (_) {}
      const r = new Record(listasCol)
      r.set('owner', ownerId)
      r.set('nome', nome)
      r.set('origem', origem)
      r.set('segmento', segmento)
      r.set('descricao', descricao)
      app.save(r)
      return r
    }
    seedLista(
      'Outbound Indústria SP',
      'outbound',
      'Indústria',
      'Médio porte, SP capital e interior. Contatos a partir da base oficial RFB.',
      jose.id,
    )
    seedLista(
      'Inbound Site + LinkedIn',
      'inbound',
      'Multissetorial',
      'Leads que chegam pelo site (diagnóstico gratuito) e LinkedIn.',
      jose.id,
    )
    seedLista(
      'Outbound Logística',
      'outbound',
      'Logística',
      'Empresas de logística e transporte, médio porte.',
      jose.id,
    )

    // ---------- qualificação (exemplo) ----------
    try {
      app.findFirstRecordByData('qualificacoes', 'lead', l1.id)
    } catch (_) {
      const q = new Record(app.findCollectionByNameOrId('qualificacoes'))
      q.set('owner', jose.id)
      q.set('lead', l1.id)
      q.set('fit', 9)
      q.set('dor', 8)
      q.set('orcamento', 8)
      q.set('timing', 8)
      q.set('acesso', 8)
      q.set('score_total', 82)
      q.set('decisao', 'qualificado')
      q.set(
        'notas',
        'Fit alto com a frente de produtos e agentes de IA. Orçamento disponível, timing imediato.',
      )
      app.save(q)
    }

    // ---------- contato (exemplo) ----------
    try {
      app.findFirstRecordByData('contatos', 'lead', l3.id)
    } catch (_) {
      const c = new Record(app.findCollectionByNameOrId('contatos'))
      c.set('owner', jose.id)
      c.set('lead', l3.id)
      c.set('canal', 'linkedin')
      c.set('direcao', 'outbound')
      c.set('mensagem', 'Convite de conexão com contexto sobre IA para indústria.')
      c.set('resposta', 'Aceitou conexão; sem resposta à mensagem ainda.')
      c.set('data_contato', '2026-08-14 10:00:00.000Z')
      app.save(c)
    }

    // ---------- cadência (exemplo) ----------
    try {
      app.findFirstRecordByData('cadencias', 'lead', l1.id)
    } catch (_) {
      const cd = new Record(app.findCollectionByNameOrId('cadencias'))
      cd.set('owner', jose.id)
      cd.set('lead', l1.id)
      cd.set('toque', 2)
      cd.set('canal', 'email')
      cd.set('status', 'enviado')
      cd.set(
        'rascunho_ia',
        'Rascunho gerado por IA: e-mail de follow-up com dado de mercado sobre previsão de demanda.',
      )
      cd.set('data_envio', '2026-08-15 09:00:00.000Z')
      app.save(cd)
    }

    // ---------- alinhamento (exemplo) ----------
    try {
      app.findFirstRecordByData('alinhamentos', 'lead', l2.id)
    } catch (_) {
      const a = new Record(app.findCollectionByNameOrId('alinhamentos'))
      a.set('owner', jose.id)
      a.set('lead', l2.id)
      a.set('data_reuniao', '2026-08-18 14:00:00.000Z')
      a.set(
        'pauta',
        'Apresentar diagnóstico gratuito e escopo de consultoria de IA para a rede de clínicas.',
      )
      a.set('decisoes', 'Agendada reunião de diagnóstico com o Dr. Felipe.')
      a.set(
        'proximo_passo',
        'Enviar material antes da reunião e preparar proposta de diagnóstico pago.',
      )
      app.save(a)
    }
  },
  (app) => {
    const names = ['alinhamentos', 'cadencias', 'contatos', 'qualificacoes', 'listas', 'leads']
    for (const name of names) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (_) {}
    }
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'evandro@simbiosia.com.br'))
    } catch (_) {}
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'jose@simbiosia.com.br'))
    } catch (_) {}
  },
)
