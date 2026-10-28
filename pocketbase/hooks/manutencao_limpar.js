// INERTE — a limpeza terminou. Este hook NÃO apaga mais nada: responde 410 em qualquer chamada.
//
// Histórico: foi usado em 28/10/2026 para limpar a base de testes (4.874 registros no total,
// em duas rodadas). Apagar o arquivo faz o `apply` falhar em "file not found on pod" — o build
// não sobe e a mudança não é aplicada. Por isso ele fica aqui, desarmado.
//
// Se algum dia a plataforma permitir remover hooks sem quebrar o apply, este é o primeiro
// candidato à remoção. Até lá: não tem efeito nenhum.

routerAdd(
  'POST',
  '/backend/v1/manutencao/limpar',
  (e) => {
    return e.json(410, {
      erro: 'Rota de manutenção desativada',
      detalhe: 'A limpeza foi executada em 28/10/2026. Este hook é inerte — não apaga nada.',
    })
  },
  $apis.requireAuth(),
)
