// SPEC-2-004 (F2-T09 / CA-2-004-01): pausa por resposta e passagem única — RESPOSTA-PAUSA.
//
// O QUE ESTA MIGRAÇÃO CRIA E POR QUÊ:
//
// 1. `pausas_resposta` — registro da pausa causada por uma resposta da pessoa.
//    Por que coleção própria e não um campo em cadencias_ativas: a pausa tem de sobreviver
//    à cadência e bloquear toques de QUALQUER canal/produto. Uma pausa é fato da PESSOA,
//    não da cadência. Guarda origem (evento), classificação e motivo.
//
// 2. `passagens` — a passagem única para o humano. Índice ÚNICO PARCIAL sobre
//    (pessoa, evento_id) garante que o mesmo evento não cria segunda passagem, nem por
//    concorrência. Duas requisições simultâneas: o banco decide, não um if.
//
// 3. `eventos_teste.classificacao` — a classificação da resposta (pergunta/conversa/
//    desinteresse/saida). Nesta fase vem de fixture determinística; nenhuma inferência externa.
//
// CLASSIFICAÇÃO → EFEITO (CA-2-004-01):
//   pergunta | conversa | desinteresse  → pausa + passagem única (humano assume)
//   saida                                → NÃO é desta task (F2-T10: bloqueio global)
//   outro/ausente                        → registra evento, não pausa
//
// REGRA DURA: desinteresse simples NÃO vira opt-out nesta task. Só 'saida' bloqueia (F2-T10).
migrate(
  (app) => {
    // ---------- 1. pausas_resposta ----------
    if (!app.hasTable('pausas_resposta')) {
      const col = new Collection({
        name: 'pausas_resposta',
        type: 'base',
        fields: [
          { name: 'pessoa', type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId('pessoas').id },
          { name: 'evento', type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId('eventos_teste').id },
          // evento_id em texto: a chave de idempotência do evento, para unicidade sem depender de relation
          { name: 'evento_id', type: 'text', required: true },
          { name: 'classificacao', type: 'select', required: true, maxSelect: 1, values: ['pergunta', 'conversa', 'desinteresse'] },
          { name: 'estado', type: 'select', required: true, maxSelect: 1, values: ['ativa', 'encerrada'] },
          { name: 'canal', type: 'text' },
          { name: 'motivo', type: 'text' },
          { name: 'motivo_codigo', type: 'text' },
          { name: 'ocorrido_em', type: 'date' },
          { name: 'recebido_em', type: 'date' },
          { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId('users').id },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste'] },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // UMA pausa ativa por pessoa: a proteção é da pessoa, não do canal
          "CREATE UNIQUE INDEX idx_pausa_ativa_pessoa ON pausas_resposta (pessoa, ambiente) WHERE estado = 'ativa'",
          // mesmo evento nunca cria segunda pausa
          'CREATE UNIQUE INDEX idx_pausa_evento ON pausas_resposta (evento_id, ambiente)',
        ],
      })
      app.save(col)
    }

    // ---------- 2. passagens ----------
    if (!app.hasTable('passagens')) {
      const col = new Collection({
        name: 'passagens',
        type: 'base',
        fields: [
          { name: 'pessoa', type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId('pessoas').id },
          { name: 'evento', type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId('eventos_teste').id },
          { name: 'evento_id', type: 'text', required: true },
          { name: 'produto', type: 'relation', required: false, maxSelect: 1, collectionId: app.findCollectionByNameOrId('produtos').id },
          { name: 'canal', type: 'text' },
          { name: 'classificacao', type: 'select', required: true, maxSelect: 1, values: ['pergunta', 'conversa', 'desinteresse'] },
          // status: aguardando (na fila) → assumida (humano pegou) → resolvida (encerrada)
          { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['aguardando', 'assumida', 'resolvida'] },
          { name: 'resumo', type: 'text' },
          { name: 'motivo', type: 'text' },
          { name: 'motivo_codigo', type: 'text' },
          // dono mapeado; vazio = pendente de revisão administrativa (nunca chuta sócio)
          { name: 'dono', type: 'relation', required: false, maxSelect: 1, collectionId: app.findCollectionByNameOrId('users').id },
          { name: 'dono_pendente', type: 'bool' },
          { name: 'assumida_por', type: 'relation', required: false, maxSelect: 1, collectionId: app.findCollectionByNameOrId('users').id },
          { name: 'assumida_em', type: 'date' },
          { name: 'resolvida_em', type: 'date' },
          { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: app.findCollectionByNameOrId('users').id },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste'] },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // PASSAGEM ÚNICA: o mesmo evento nunca gera duas passagens — garantia do banco
          'CREATE UNIQUE INDEX idx_passagem_evento ON passagens (evento_id, ambiente)',
        ],
      })
      app.save(col)
    }

    // ---------- 3. classificação no evento ----------
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
      if (app.hasTable('pausas_resposta')) app.delete(app.findCollectionByNameOrId('pausas_resposta'))
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
