# Política de segurança

## Como reportar uma vulnerabilidade
**Não abra uma issue pública.** Use uma destas opções:
- **GitHub → Security → Report a vulnerability** (aviso privado);
- o formulário de contato do site (`/contato.html`), com o assunto "Segurança".

Inclua, se possível:
- passos para reproduzir;
- impacto;
- páginas ou funções envolvidas.

**Nunca envie** senhas, tokens ou dados pessoais de terceiros. Se a falha expõe dados, descreva o tipo de dado, não o conteúdo.

## O que esperar
- Confirmação de recebimento em até 7 dias.
- Correção priorizada pela gravidade. Falhas críticas são corrigidas antes de qualquer outra mudança.
- Crédito no registro de mudanças, se você quiser.

## Escopo
- O site `control-critic.netlify.app`;
- as Netlify Functions;
- as regras do banco (Supabase/RLS);
- os robôs do GitHub Actions;
- a ponte do Discord.

**Fora do escopo:**
- ataques de negação de serviço;
- engenharia social;
- testes em contas de outras pessoas sem permissão;
- serviços de terceiros (Supabase, Netlify, Steam, Discord, Instagram).

## Boas práticas do projeto
- Segredos ficam só nas variáveis do Netlify, nos segredos do GitHub e no Supabase. Nunca no código.
- Toda mudança de banco tem migração idempotente e testes de RLS (`tests/rls.sql`).
- As funções seguem `docs/seguranca-functions.md`.
