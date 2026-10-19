# Como contribuir

O Control Critic é feito em **HTML, CSS e JavaScript puro**, sem framework e sem build, com Supabase e Netlify.

## Fluxo
1. Crie uma branch a partir da `main`, com um nome descritivo (ex.: `fix/notas-catalogo`). Use uma branch por assunto.
2. Faça commits pequenos, com mensagem em português explicando o porquê.
3. Antes de abrir o PR:
   ```bash
   npm ci
   npm run check        # sintaxe, testes e links
   npm run check:html   # validação dos HTML
   ```
4. Se mexeu no banco:
   - acrescente uma migração idempotente em `supabase/migrations/AAAAMMDD_NN_nome.sql`;
   - atualize o `supabase/schema.sql`;
   - cubra a regra em `tests/rls.sql`.
5. Se mudou arquivos do site, aumente a versão `cc-vNN` no `sw.js`.
6. Abra o PR com:
   - resumo;
   - testes executados;
   - mudanças de banco;
   - passos manuais;
   - riscos;
   - rollback.

   Nada é mesclado sem revisão.

## Regras
- Não use framework nem build.
- Mantenha a identidade visual: fundo escuro, amarelo `#FFD33C`, títulos em Anton e o mascote Adelino.
- Dados vindos do usuário ou do banco entram no HTML só por `esc()`, `urlSegura()`, `cssUrl()` ou `corSegura()` (`js/seguro.js`). Quando der, use `textContent`.
- Nunca coloque segredos em código, logs, PRs ou issues.
- Textos em português do Brasil, com plural correto (`plural()`).
