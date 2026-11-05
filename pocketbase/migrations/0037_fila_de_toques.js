// SPEC-2-002 (F2-T05): fila de toques e execução simulada — CA-2-002-04.
// Migração ADITIVA. Três coleções, cada uma com UMA garantia dura em índice.
//
//   1. toques         — a fila. idempotência por (cadencia, numero_toque) via índice único.
//   2. reservas       — lease de execução. índice único PARCIAL (ativa=1): duas reservas
//                       simultâneas do mesmo toque → o banco recusa a segunda.
//   3. limites_consumo— SLOTS do limite diário. Em vez de contar e comparar (que perde a
//                       corrida), cada consumo OCUPA UM SLOT numerado com índice único.
//                       "slot" = canal:AAAAMMDD:indice. Quem cria o slot ganha; quando todos
//                       os slots do limite existem, o limite acabou. Atômico de verdade.
migrate(
  (app) => {
    // ---------------- toques ----------------
    if (!app.hasTable('toques')) {
      const c = new Collection({
        name: 'toques',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'cadencia',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('cadencias_ativas').id,
            maxSelect: 1,
          },
          {
            name: 'mensagem',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('mensagens').id,
            maxSelect: 1,
          },
          {
            name: 'pessoa',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('pessoas').id,
            maxSelect: 1,
          },
          { name: 'numero_toque', type: 'number', required: true },
          {
            name: 'canal',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['email', 'whatsapp', 'linkedin', 'telefone'],
          },
          // agendado_para: quando o toque passa a ser elegível por horário
          { name: 'agendado_para', type: 'date' },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            // pendente → reservado → confirmado | falhou | cancelado | bloqueado
            values: ['pendente', 'reservado', 'confirmado', 'falhou', 'cancelado', 'bloqueado'],
          },
          { name: 'motivo_codigo', type: 'text' },
          { name: 'motivo', type: 'text' },
          // só a CONFIRMAÇÃO de despacho simulado marca isto como true
          { name: 'primeira_abordagem', type: 'bool' },
          // sempre 'simulado' — não existe caminho real nesta fase
          { name: 'modo', type: 'select', required: true, maxSelect: 1, values: ['simulado'] },
          { name: 'correlation_id', type: 'text' },
          { name: 'confirmado_em', type: 'date' },
          { name: 'tentativas', type: 'number' },
          {
            name: 'owner',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'ambiente', type: 'select', required: true, maxSelect: 1, values: ['teste'] },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // idempotência: um toque por cadência e número
          'CREATE UNIQUE INDEX idx_toque_unico ON toques (cadencia, numero_toque)',
          'CREATE INDEX idx_toque_estado ON toques (estado)',
          'CREATE INDEX idx_toque_agenda ON toques (agendado_para)',
        ],
      })
      app.save(c)
    }

    // ---------------- reservas (lease) ----------------
    if (!app.hasTable('reservas')) {
      const c = new Collection({
        name: 'reservas',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'toque',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('toques').id,
            maxSelect: 1,
          },
          { name: 'dono_reserva', type: 'text' },
          { name: 'lease_ate', type: 'date', required: true },
          { name: 'ativa', type: 'bool' },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['ativa', 'confirmada', 'cancelada', 'expirada'],
          },
          { name: 'motivo_codigo', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // *** uma reserva ATIVA por toque — a garantia contra reserva dupla ***
          'CREATE UNIQUE INDEX idx_reserva_ativa_unica ON reservas (toque) WHERE ativa = true',
          'CREATE INDEX idx_reserva_lease ON reservas (lease_ate)',
        ],
      })
      app.save(c)
    }

    // ---------------- limites_consumo (slots) ----------------
    if (!app.hasTable('limites_consumo')) {
      const c = new Collection({
        name: 'limites_consumo',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          // slot = "<escopo>:<valor>:<data>:<indice>"  ex: canal:email:2026-10-28:7
          { name: 'slot', type: 'text', required: true },
          {
            name: 'escopo',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['canal', 'dono', 'pessoa'],
          },
          { name: 'valor', type: 'text' },
          { name: 'dia', type: 'text' },
          { name: 'indice', type: 'number' },
          {
            name: 'toque',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('toques').id,
            maxSelect: 1,
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // *** o slot é o limite: índice único garante que ninguém ocupa o mesmo ***
          'CREATE UNIQUE INDEX idx_slot_unico ON limites_consumo (slot)',
          'CREATE INDEX idx_slot_dia ON limites_consumo (dia)',
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    for (const nome of ['limites_consumo', 'reservas', 'toques']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
