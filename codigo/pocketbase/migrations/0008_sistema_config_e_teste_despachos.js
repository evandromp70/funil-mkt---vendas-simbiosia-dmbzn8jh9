// SPEC-1-001 (task 20c86bd2): coleções de controle do ambiente de demonstração.
// Migração ADITIVA: cria sistema_config (registro único) e teste_despachos (observador de
// tentativas de despacho externo em backend TESTE). Não altera coleções nem campos legados.

migrate(
  (app) => {
    // ---------- sistema_config (registro único) ----------
    if (!app.hasTable('sistema_config')) {
      const collection = new Collection({
        name: 'sistema_config',
        type: 'base',
        listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        createRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        updateRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        deleteRule: null,
        fields: [
          {
            name: 'ambiente',
            type: 'select',
            required: true,
            values: ['teste', 'producao'],
            maxSelect: 1,
          },
          { name: 'pausa_geral', type: 'bool', required: true },
          { name: 'envio_real_habilitado', type: 'bool', required: true },
          {
            name: 'integracoes_externas_habilitadas',
            type: 'bool',
            required: true,
          },
          { name: 'fase_validada', type: 'number', required: true, onlyInt: true, min: 0 },
          { name: 'timezone', type: 'text', required: true },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE INDEX idx_sistema_config_ambiente ON sistema_config (ambiente)'],
      })
      app.save(collection)

      // registro único de controle — ambiente de demonstração, tudo em pausa
      const record = new Record(collection)
      record.set('ambiente', 'teste')
      record.set('pausa_geral', true)
      record.set('envio_real_habilitado', false)
      record.set('integracoes_externas_habilitadas', false)
      record.set('fase_validada', 0)
      record.set('timezone', 'America/Sao_Paulo')
      app.save(record)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('sistema_config'))
    } catch (_) {}
  },
)

migrate(
  (app) => {
    // ---------- teste_despachos (observador de tentativas — só backend TESTE) ----------
    if (!app.hasTable('teste_despachos')) {
      const collection = new Collection({
        name: 'teste_despachos',
        type: 'base',
        // escrita NUNCA pela API: só hooks (regras de escrita nulas = superuser/hook)
        listRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        viewRule: "@request.auth.id != '' && @request.auth.role = 'admin'",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'correlation_id', type: 'text', required: true },
          { name: 'rota', type: 'text', required: true },
          {
            name: 'tipo',
            type: 'select',
            required: true,
            values: ['ai', 'http', 'canal'],
            maxSelect: 1,
          },
          { name: 'tentativas', type: 'number', required: true, onlyInt: true, min: 0 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_teste_despachos_correlation ON teste_despachos (correlation_id)',
        ],
      })
      app.save(collection)
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('teste_despachos'))
    } catch (_) {}
  },
)
