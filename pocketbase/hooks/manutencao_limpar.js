// Hook DESATIVADO — mantido apenas porque a plataforma exige o arquivo para o build passar.
//
// A limpeza foi executada em 28/10/2026 e a base está zerada. Esta rota devolve 410 e não
// executa mais nada. Apagar o arquivo faz o apply falhar na etapa de integração
// ("file not found on pod") e a versão NÃO sobe — por isso ele segue aqui, inerte.
//
// Se um dia a plataforma permitir remover hooks sem quebrar o build, este é o primeiro candidato.

routerAdd(
  'POST',
  '/backend/v1/manutencao/limpar',
  (e) => {
    return e.json(410, {
      erro: 'Rota de manutenção desativada',
      detalhe: 'A limpeza foi executada em 28/10/2026. Hook inerte — não apaga nada.',
    })
  },
  $apis.requireAuth(),
)
