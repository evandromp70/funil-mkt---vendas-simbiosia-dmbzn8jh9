// SPEC-2-001 (F2-T02): contexto comercial pessoa × produto e linha do tempo — CA-2-001-02/03.
// Migração ADITIVA: cria contextos_comerciais e transicoes_comerciais. NÃO apaga nem reescreve
// nenhum dado existente: leads, pontuacoes, qualificacoes e histórico ficam intactos.
// O mapeamento das etapas legadas é feito por job posterior, também aditivo.
//
// Por que coleção nova em vez de reusar `pontuacoes`:
//   pontuacoes é NOTA (append-only, imutável, por versão de régua). Estado comercial é outra
//   responsabilidade: muda por comando, tem motivo e auditoria. Misturar as duas faria a nota
//   perder a imutabilidade e o estado perder a rastreabilidade.
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const regraDono =
      "@request.auth.id != '' && (@request.auth.role = 'admin' || owner = @request.auth.id)"

    // ---------- contextos_comerciais: um por pessoa × produto × ambiente ----------
    if (!app.hasTable('contextos_comerciais')) {
      const c = new Collection({
        name: 'contextos_comerciais',
        type: 'base',
        // leitura: dono ou admin. Escrita: SÓ hooks internos ($app.save) — ver 0033.
        listRule: regraDono,
        viewRule: regraDono,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          {
            name: 'pessoa',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('pessoas').id,
            maxSelect: 1,
          },
          {
            name: 'produto',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('produtos').id,
            maxSelect: 1,
          },
          {
            name: 'lead',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('leads').id,
            maxSelect: 1,
          },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
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
            ],
          },
          { name: 'motivo', type: 'text' },
          {
            name: 'motivo_codigo',
            type: 'select',
            maxSelect: 1,
            values: [
              'migracao_legado',
              'dados_completos',
              'nota_calculada',
              'aprovacao_pendente',
              'mensagem_aprovada',
              'resposta_recebida',
              'passagem_humana',
              'pausa_manual',
              'tentativas_esgotadas',
              'fechamento',
              'pedido_saida',
            ],
          },
          {
            name: 'etapa_legada',
            type: 'select',
            maxSelect: 1,
            values: [
              'lista',
              'qualificacao',
              'contato',
              'cadencia',
              'alinhamento',
              'conversao',
              'ganho',
              'perdido',
            ],
          },
          { name: 'revisao', type: 'number', onlyInt: true, min: 0 },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste', 'producao'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_contexto_pessoa_produto ON contextos_comerciais (pessoa, produto, ambiente)',
          'CREATE INDEX idx_contexto_owner ON contextos_comerciais (owner)',
        ],
      })
      app.save(c)
    }

    // ---------- transicoes_comerciais: linha do tempo, append-only ----------
    if (!app.hasTable('transicoes_comerciais')) {
      const c = new Collection({
        name: 'transicoes_comerciais',
        type: 'base',
        // leitura: dono ou admin. Escrita: SÓ hooks internos. DELETE proibido para todos —
        // a linha do tempo não se reescreve (SPEC-2-001, item 4).
        listRule: regraDono,
        viewRule: regraDono,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'contexto',
            type: 'relation',
            required: true,
            collectionId: app.findCollectionByNameOrId('contextos_comerciais').id,
            // sem cascadeDelete: apagar contexto não pode apagar história silenciosamente
            maxSelect: 1,
          },
          {
            name: 'owner',
            type: 'relation',
            required: true,
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          {
            name: 'de',
            type: 'select',
            maxSelect: 1,
            values: [
              '',
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
            ],
          },
          {
            name: 'para',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: [
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
            ],
          },
          { name: 'motivo', type: 'text', required: true },
          {
            name: 'motivo_codigo',
            type: 'select',
            maxSelect: 1,
            values: [
              'migracao_legado',
              'dados_completos',
              'nota_calculada',
              'aprovacao_pendente',
              'mensagem_aprovada',
              'resposta_recebida',
              'passagem_humana',
              'pausa_manual',
              'tentativas_esgotadas',
              'fechamento',
              'pedido_saida',
            ],
          },
          { name: 'revisao_esperada', type: 'number', onlyInt: true, min: 0 },
          { name: 'evento_id', type: 'text' },
          { name: 'ator', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste', 'producao'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // idempotência: o mesmo evento não gera duas transições
          'CREATE UNIQUE INDEX idx_transicao_evento ON transicoes_comerciais (contexto, evento_id) WHERE evento_id != ""',
          'CREATE INDEX idx_transicao_contexto ON transicoes_comerciais (contexto)',
        ],
      })
      app.save(c)
    }
  },
  (app) => {
    // down: remove as coleções novas. Nada legado é tocado.
    for (const nome of ['transicoes_comerciais', 'contextos_comerciais']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {}
    }
  },
)
