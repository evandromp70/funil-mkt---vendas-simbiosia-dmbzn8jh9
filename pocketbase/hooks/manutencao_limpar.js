// Hook NEUTRALIZADO — a limpeza já foi executada em 28/10/2026 e a base está zerada.
//
// Por que o arquivo ainda existe: deletar o arquivo e aplicar falhou na etapa de integração
// ("file not found on pod") e o hook continuou VIVO no servidor — a rota respondia normalmente.
// Enquanto o arquivo não sai do ar de forma limpa, esta versão não apaga nada: qualquer chamada
// devolve 410 Gone. É a trava de segurança: mesmo que alguém chame a rota, não há efeito.
//
// PRÓXIMO PASSO OBRIGATÓRIO: remover este arquivo com o projeto em estado consistente e
// confirmar 404 na rota.

routerAdd(
  'POST',
  '/backend/v1/manutencao/limpar',
  (e) => {
    return e.json(410, {
      erro: 'Rota de manutenção desativada',
      detalhe:
        'A limpeza foi executada em 28/10/2026. Este hook deve ser removido da base de código.',
    })
  },
  $apis.requireAuth(),
)
