# Desempenho (fase 13)

Medido com Chromium em celular emulado (412×900), latência de 150 ms e cerca de 2 Mbps. Cada número é a mediana de 3 cargas. Antes e depois foram medidos no mesmo servidor local.

| Página | CLS antes | CLS depois | LCP antes | LCP depois |
|---|---|---|---|---|
| Início | 0,308 | **0,041** | 1,24 s | 1,26 s |
| Jogos | 0,383 | **0,023** | 2,72 s | 2,38 s |
| Jogo (Elden Ring) | 0,465 | **0,006** | 3,28 s | 3,43 s* |

Na produção (Netlify, com CDN de imagens), o "antes" medido foi:
- Início: CLS 0,31 e LCP 1,6 s;
- Jogos: CLS 0,30 e LCP 2,5 s;
- Jogo: CLS 0,46 e LCP 3,1 s.

\* O LCP da página de jogo depende da capa e dos dados do Supabase. A variação entre as medições ficou dentro do ruído. A capa agora tem `fetchpriority="high"`.

**CLS** abaixo de 0,1 é considerado "bom" pelo Google. As três páginas saíram de "ruim" para "bom".

## O que causava os "pulos" e o que foi feito
1. **Rodapé:** era montado pelo JS e aparecia no topo da página vazia, depois era empurrado para baixo. Agora o `main` ocupa a altura da tela desde o início.
2. **Cabeçalho:** também montado pelo JS, empurrava a página. Agora cada HTML tem um espaço reservado (`.topo-reserva`) da mesma altura, trocado pelo cabeçalho real.
3. **Capa do jogo:** sem proporção definida, empurrava o título. Agora tem `aspect-ratio: 16/9`.
4. **Categorias do catálogo:** chegavam depois e empurravam a grade. Agora têm espaço reservado.
5. **Fontes:** saíram do `@import` dentro do CSS, que carregava em cadeia, para `<link>` com `preconnect` no HTML. Também há `preconnect` para o Supabase.

## Já existia (verificado)
- Imagens com `loading="lazy"` e CDN do Netlify (WebP no tamanho certo).
- Busca do catálogo com debounce e, desde a fase 8, cancelamento da requisição anterior.
- Realtime só nas páginas que precisam (feed, mensagens e presença).

## Não medido
**INP** (resposta ao toque) precisa de interação real. Para medir, use o Chrome DevTools → Performance ou o relatório do Search Console depois do deploy.
