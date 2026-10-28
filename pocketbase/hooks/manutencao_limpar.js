// INERTE — a limpeza terminou. Este hook NÃO apaga mais nada: responde 410 em qualquer chamada.
//
// Histórico: usado em 28/10/2026 em três rodadas (limpeza inicial de 4.550 registros, resíduo
// pós-testes e resíduo das suítes F2-T09..T11 — 1.163 registros nesta última).
// Apagar o arquivo faz o `apply` falhar em "file not found on pod" e a versão não sobe;
// por isso ele fica aqui, desarmado. Não tem efeito nenhum.
//
// Candidato à remoção quando a plataforma permitir apagar hooks sem quebrar o build.

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
