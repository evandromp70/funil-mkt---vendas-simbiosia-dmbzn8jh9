// SPEC-2-002 (F2-T04): uma cadência ativa por pessoa — CA-2-002-02.
// Migração ADITIVA: cria cadencias_ativas e acrescenta regra de prioridade na política.
//
// A GARANTIA DURA desta task é o ÍNDICE ÚNICO PARCIAL abaixo. Consultar antes de inserir não
// sobrevive a duas requisições concorrentes; o índice sobrevive — a segunda recebe erro de
// constraint do próprio banco. O WHERE é essencial: permite histórico (concluida/cancelada/
// substituida) e só uma ATIVA por identidade efetiva.
migrate(
  (app) => {
    const regraAdmin = "@request.auth.id != '' && @request.auth.role = 'admin'"

    if (!app.hasTable('cadencias_ativas')) {
      const c = new Collection({
        name: 'cadencias_ativas',
        type: 'base',
        // 4 olhos: leitura pela API só para quem opera; escrita é sempre por hook
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          // derivado: sync_global_id da pessoa, ou o id local — resolvido no hook
          { name: 'identidade_efetiva', type: 'text', required: true },
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
            collectionId: app.findCollectionByNameOrId('produtos').id,
            maxSelect: 1,
          },
          {
            name: 'contexto',
            type: 'relation',
            collectionId: app.findCollectionByNameOrId('contextos_comerciais').id,
            maxSelect: 1,
          },
          {
            name: 'estado',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['ativa', 'concluida', 'cancelada', 'substituida'],
          },
          { name: 'motivo', type: 'text' },
          { name: 'motivo_codigo', type: 'text' },
          { name: 'politica_versao', type: 'number' },
          // registro da decisão quando houve substituição por regra de prioridade.
          // TEXTO e não relation: auto-referência exigiria a coleção já existir; o id basta
          // para a auditoria e não cria dependência circular na criação.
          { name: 'substitui', type: 'text' },
          {
            name: 'owner',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['teste'],
          },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          // *** A GARANTIA: uma ativa por identidade efetiva ***
          "CREATE UNIQUE INDEX idx_cadencia_uma_ativa ON cadencias_ativas (identidade_efetiva) WHERE estado = 'ativa'",
          'CREATE INDEX idx_cadencia_pessoa ON cadencias_ativas (pessoa)',
          'CREATE INDEX idx_cadencia_produto ON cadencias_ativas (produto)',
        ],
      })
      app.save(c)
    }

    // produtos.ordem: usado pela regra ordem_catalogo. Aditivo e opcional — não altera nenhum
    // produto existente (ausente = 9999 na comparação).
    try {
      const prod = app.findCollectionByNameOrId('produtos')
      if (!prod.fields.some((f) => f.name === 'ordem')) {
        prod.fields.add(new NumberField({ name: 'ordem', required: false }))
        app.save(prod)
      }
    } catch (_) {}

    // Regra de prioridade entre produtos — VAZIA por padrão.
    // Sem valor, conflito entre produtos fica PENDENTE (não invento ordem de negócio).
    try {
      const pol = app.findCollectionByNameOrId('politicas_coorte')
      if (!pol.fields.some((f) => f.name === 'regra_prioridade_produto')) {
        pol.fields.add(
          new SelectField({
            name: 'regra_prioridade_produto',
            required: false,
            maxSelect: 1,
            // só regras que os dados suportam: produtos tem created e ordem; pontuacao liga lead, não pessoa
            values: ['produto_mais_recente', 'ordem_catalogo', 'manual'],
          }),
        )
        app.save(pol)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const pol = app.findCollectionByNameOrId('politicas_coorte')
      const f = pol?.fields?.find?.((x) => x.name === 'regra_prioridade_produto')
      if (f) {
        pol.fields.remove(f.id || f.name)
        app.save(pol)
      }
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('cadencias_ativas'))
    } catch (_) {}
  },
)
