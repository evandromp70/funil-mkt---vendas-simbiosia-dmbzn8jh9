// SPEC-2-004 (F2-T09 / CA-2-004-01): pausa por resposta e passagem única — RESPOSTA-PAUSA.
//
// 1. `pausas_resposta` — a pausa é fato da PESSOA, não da cadência: precisa sobreviver à
//    cadência e bloquear toques de qualquer canal/produto. Índice único parcial garante UMA
//    pausa ativa por pessoa (concorrência resolvida pelo banco, não por if).
// 2. `passagens` — passagem única para o humano. Índice único por evento: o mesmo evento
//    nunca cria segunda passagem.
// 3. `eventos_teste.classificacao` — pergunta/conversa/desinteresse/saida. Fixture
//    determinística nesta fase, sem inferência externa.
//
// REGRA DURA: desinteresse simples NÃO vira opt-out. Só 'saida' bloqueia (F2-T10).
migrate(
  (app) => {
    if (!app.hasTable('pausas_resposta')) {
      const col = new Collection({
        name: 'pausas_resposta',
        type: 'base',
        fields: [
          {
            name: 'pessoa',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('pessoas').id,
          },
          {
            name: 'evento',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('eventos_teste').id,
          },
          { name: 'evento_id', type: 'text', required: true },
          {
            name: 'classificacao',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pergunta', 'conversa', 'desinteresse'],
          },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['ativa', 'encerrada'],
          },
          { name: 'canal', type: 'text' },
          { name: 'motivo', type: 'text' },
          { name: 'motivo_codigo', type: 'text' },
          { name: 'ocorrido_em', type: 'date' },
          { name: 'recebido_em', type: 'date' },
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('users').id,
          },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste'] },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_pausa_ativa_pessoa ON pausas_resposta (pessoa, ambiente) WHERE estado = 'ativa'",
          'CREATE UNIQUE INDEX idx_pausa_evento ON pausas_resposta (evento_id, ambiente)',
        ],
      })
      app.save(col)
    }

    if (!app.hasTable('passagens')) {
      const col = new Collection({
        name: 'passagens',
        type: 'base',
        fields: [
          {
            name: 'pessoa',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('pessoas').id,
          },
          {
            name: 'evento',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('eventos_teste').id,
          },
          { name: 'evento_id', type: 'text', required: true },
          {
            name: 'produto',
            type: 'relation',
            required: false,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('produtos').id,
          },
          { name: 'canal', type: 'text' },
          {
            name: 'classificacao',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pergunta', 'conversa', 'desinteresse'],
          },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['aguardando', 'assumida', 'resolvida'],
          },
          { name: 'resumo', type: 'text' },
          { name: 'motivo', type: 'text' },
          { name: 'motivo_codigo', type: 'text' },
          {
            name: 'dono',
            type: 'relation',
            required: false,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('users').id,
          },
          { name: 'dono_pendente', type: 'bool' },
          {
            name: 'assumida_por',
            type: 'relation',
            required: false,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('users').id,
          },
          { name: 'assumida_em', type: 'date' },
          { name: 'resolvida_em', type: 'date' },
          {
            name: 'owner',
            type: 'relation',
            required: true,
            maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('users').id,
          },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste'] },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_passagem_evento ON passagens (evento_id, ambiente)'],
      })
      app.save(col)
    }

    const ev = app.findCollectionByNameOrId('eventos_teste')
    if (!ev.fields.some((f) => f.name === 'classificacao')) {
      ev.fields.add(
        new SelectField({
          name: 'classificacao',
          required: false,
          maxSelect: 1,
          values: ['pergunta', 'conversa', 'desinteresse', 'saida'],
        }),
      )
    }
    app.save(ev)
  },
  (app) => {
    try {
      if (app.hasTable('passagens')) app.delete(app.findCollectionByNameOrId('passagens'))
    } catch (_) {}
    try {
      if (app.hasTable('pausas_resposta'))
        app.delete(app.findCollectionByNameOrId('pausas_resposta'))
    } catch (_) {}
    try {
      const ev = app.findCollectionByNameOrId('eventos_teste')
      const f = ev.fields.find((x) => x.name === 'classificacao')
      if (f) {
        ev.fields.remove(f.id || f.name)
        app.save(ev)
      }
    } catch (_) {}
  },
)
