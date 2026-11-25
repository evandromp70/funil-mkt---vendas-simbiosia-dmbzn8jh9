// 0049 — collection api_keys para o servidor MCP (Model Context Protocol).
//
// A chave completa (sk_live_<32 hex>) NUNCA é guardada: guardamos só o SHA-256 dela
// em key_hash (único) e um prefixo exibível (ex.: "sk_abc12...") para o usuário
// reconhecer a chave no painel. Rotas de uso ficam em pocketbase/hooks/mcp_servidor.js.
migrate(
  (app) => {
    // idempotente: se já existe, nada a fazer
    try {
      app.findCollectionByNameOrId('api_keys')
      return
    } catch (_) {}

    const usersId = '_pb_users_auth_'

    const col = new Collection({
      name: 'api_keys',
      type: 'base',
      // só o dono lista/vê; admin (role) vê tudo
      listRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || owner = @request.auth.id)",
      viewRule:
        "@request.auth.id != '' && (@request.auth.role = 'admin' || owner = @request.auth.id)",
      // criação/revogação passam pelas rotas /backend/v1/keys (hooks), não pela API de registros
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: usersId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'nome', type: 'text', required: true, min: 1, max: 100 },
        { name: 'prefixo', type: 'text', required: true, min: 6, max: 20 },
        { name: 'key_hash', type: 'text', required: true, min: 64, max: 64 },
        {
          name: 'escopo',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['leitura', 'leitura_escrita', 'admin'],
        },
        { name: 'ativa', type: 'bool', required: false },
        { name: 'ultimo_uso_em', type: 'date', required: false },
        {
          name: 'criado_por',
          type: 'relation',
          required: true,
          collectionId: usersId,
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys (key_hash)',
        'CREATE INDEX idx_api_keys_owner ON api_keys (owner)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('api_keys'))
    } catch (_) {}
  },
)
