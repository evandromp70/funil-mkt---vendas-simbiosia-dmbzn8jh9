// SPEC-2-003 (F2-T07): eventos de teste e adaptadores locais — CA-2-003-01/02/04.
// Migração ADITIVA: cria eventos_teste e adaptadores_teste. Nada existente é alterado.
//
// Por que coleção nova e não reusar sync_inbox:
//   sync_inbox é o recibo do contrato v1 Fábrica↔Funil (projeção entre apps). Evento de canal
//   de teste é outra coisa: evento sintético de captação/comunicação, com correlation_id e
//   fonte=fixture. Misturar faria o recibo de projeção perder o significado.
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"

    // ---------- eventos_teste: receptor de evento de canal de teste ----------
    if (!app.hasTable('eventos_teste')) {
      const c = new Collection({
        name: 'eventos_teste',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        // escrita SÓ por hooks internos: a API não injeta evento direto
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'evento_id', type: 'text', required: true },
          { name: 'correlation_id', type: 'text' },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste'],
          },
          {
            name: 'fonte',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['fixture'],
          },
          { name: 'tipo', type: 'text', required: true },
          { name: 'ocorrido_em', type: 'date' },
          {
            name: 'canal',
            type: 'select',
            maxSelect: 1,
            values: ['email', 'whatsapp', 'linkedin', 'telefone', 'interno'],
          },
          {
            name: 'pessoa',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('pessoas').id,
            maxSelect: 1,
          },
          { name: 'identidade_ref', type: 'text' },
          { name: 'payload_hash', type: 'text', required: true },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['aplicado', 'duplicado', 'conflito', 'rejeitado', 'pendente'],
          },
          { name: 'resultado', type: 'json' },
          {
            name: 'owner',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // idempotência: um evento por id+ambiente
          'CREATE UNIQUE INDEX idx_evento_teste_id ON eventos_teste (evento_id, ambiente)',
          'CREATE INDEX idx_evento_teste_corr ON eventos_teste (correlation_id)',
        ],
      })
      app.save(c)
    }

    // ---------- adaptadores_teste: auditoria das respostas sintéticas ----------
    if (!app.hasTable('adaptadores_teste')) {
      const c = new Collection({
        name: 'adaptadores_teste',
        type: 'base',
        listRule: regraAdmin,
        viewRule: regraAdmin,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'tipo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['captacao', 'enriquecimento', 'canal'],
          },
          { name: 'entrada', type: 'json' },
          { name: 'resposta', type: 'json' },
          {
            name: 'modo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['simulado'],
          },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste'],
          },
          {
            name: 'ator',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_adaptador_tipo ON adaptadores_teste (tipo)'],
      })
      app.save(c)
    }
  },
  (app) => {
    for (const nome of ['adaptadores_teste', 'eventos_teste']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
