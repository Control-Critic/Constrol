# Instagram do Control Critic: conteúdo e distribuição

Este documento tem duas partes:
- o **diagnóstico do robô antes desta mudança** (confirmado no código em 20/10/2026);
- o que mudou e **como medir**.

## 1. Diagnóstico (antes)

### Inventário
| Horário (Brasília) | Modo | O que publica | Formato |
|---|---|---|---|
| 09h20 | `manha` | Promoção do dia: o maior desconto. Primeiro os jogos em destaque com 20%+, depois qualquer um com 40%+. Não repete jogo por 7 dias. Sem promoção, publica a enquete | 1 imagem + story |
| 12h50 | `entretenimento` | Meme aprovado no admin (o mais antigo). Sem meme, enquete "Qual você prefere?" (no máximo 1 por dia) | 1 imagem + story |
| 18h50 | `diario` | "Resumo do dia": capa e até 5 notícias das últimas 26 h. Com música e ffmpeg, sai como Reels. Com 1 notícia, sai só ela. Sem notícia, a promoção | carrossel, Reels ou 1 imagem + story |
| Botão "Postar agora" | `urgente` | Notícias marcadas como urgentes | 1 imagem + story |

**O que decide o que vai ao ar:**
- não existe fila: cada horário tem um modo fixo e um plano B fixo;
- notícias com prioridade para as que têm imagem, estão em português e têm fonte;
- os controles ficam em `settings`:
  - `instagram_promos`: jogos usados na semana;
  - `instagram_versus`: pares usados e jogos dos últimos 14 dias;
  - `instagram_ultimo`: só o último post. **Não há histórico.**

**Legendas:**
- primeira linha: título da notícia ou "PROMOÇÃO DO DIA";
- depois o resumo (até 600 caracteres), "Fonte", "link na bio" e hashtags fixas e genéricas: `#games #videogames #noticiasgames #gamer #ControlCritic`.
- **Notícia, resumo e promoção terminam sem pergunta.** Só o meme ("marca aquele amigo") e a enquete ("A ou B") chamam para a ação.

### Problemas confirmados no código
1. **A maior parte do conteúdo não gera salvamento nem comentário.** Em um dia normal, 2 dos 3 posts são promoção e resumo de notícias, formatos de consumo rápido.
   - Não existe conteúdo "para guardar", como "jogo bom por menos de R$ 30" ou "antes de comprar".
   - A promoção mostra só o preço final. O `original_cents` existe no banco e não é usado: falta o preço riscado, que é o que mais chama atenção.
2. **Mesmo tipo no mesmo horário todo dia.** A rotação não existe. Às 18h50 é sempre resumo, e às 12h50, quase sempre a enquete, porque os memes aprovados são raros com a base pequena.
3. **Sem histórico nem medição.** Não dá para saber qual formato funcionou.
4. **Notícia "do dia" pode ter até 26 h**, sem regra explícita de idade máxima. O urgente aceita notícia de qualquer idade.
5. **Direitos de imagem.**
   - A arte de notícia usa como fundo a `cover_url` da notícia, que vem do site de origem (material de imprensa).
   - O correto é usar a capa do jogo servida pelo próprio site, ou fundo liso.
6. **Hashtags genéricas** (`#gamer`, `#games`), sem nicho brasileiro nem plataforma.
7. **Meme credita com `@autor`.** O nome no site não é o @ do Instagram, então pode marcar uma pessoa desconhecida.
8. **Limite da API.** Se o Instagram recusar por limite, o robô falha com erro. Ele não registra o motivo e não pula de forma limpa.
9. **Reels** só no resumo, com quadros parados. Ficam sem movimento.
10. **O "Qual você prefere?" é o único formato de opinião**, então fica repetitivo enquanto há poucos memes.

### Dados que o site realmente tem (e que podem ir para a arte)
- **Jogo:**
  - título, capa (IGDB, servida pelo site), ano, plataformas, categorias;
  - nota da comunidade (`avg_rating`, `reviews_count`);
  - nota da crítica IGDB (`igdb_rating`, `igdb_rating_count`).
- **Promoção:** preço atual, preço original, desconto, loja e fim da promoção (`ends_at`, quando houver).
- **Avaliações públicas:** nota e texto.
- **Não existem no banco:** tempo de jogo (HowLongToBeat) e compatibilidade com o Steam Deck. **Não aparecem em nenhuma arte.**

## 2. O que mudou
Veja a seção "Formatos" em `scripts/instagram/LEIA-ME.md`. Resumo:
- **Legendas** em 4 partes:
  - gancho na primeira linha;
  - contexto curto;
  - uma pergunta ou convite específico;
  - 5 a 8 hashtags que misturam marca, nicho brasileiro, plataforma e o nome do jogo.
- A chamada para o site varia. São no máximo 5 emojis.
- **Formatos novos:**
  - **jogo por menos de R$ X** (carrossel com preço riscado);
  - **antes de você comprar** (só dados reais);
  - **opinião da comunidade** (avaliações públicas, sem nome);
  - **crítica × comunidade**;
  - **superestimado ou subestimado?**;
  - **zerou ou largou?**;
  - **top 5 da crítica por gênero**;
  - **resultado do "este ou aquele"** (quando a API deixa ler os comentários);
  - **notícias em carrossel**, com slide de chamada no fim.
- **Carrossel por padrão**, como já acontecia com as notícias. Ele mostra mais de um item por post e gera mais salvamento. O "Qual você prefere?" continua com imagem única.
- **Rotação por horário.** Cada horário tem uma lista de formatos:
  - o robô escolhe o que ficou mais tempo sem sair **naquele horário**;
  - nunca repete o tipo do post anterior;
  - não repete jogo nem notícia nas últimas 48 h.
- **Notícias:** nunca com mais de 48 h, sempre a mais recente primeiro.
- **Arte de notícia sem imagem de imprensa:** usa a capa do jogo do catálogo ou fundo liso.
- **Reels:**
  - no máximo 1 por dia, no horário da noite;
  - quadros com zoom lento e transição;
  - sempre com música de `scripts/instagram/musicas/`.
- **Limite da API:** antes de publicar, o robô consulta a cota. No limite, ou se o Instagram recusar por limite, ele registra e pula sem quebrar.
- **Registro:** tabela `instagram_posts`, com painel no admin (aba **Instagram 📸**).

## 3. Medição (manual)
O app do robô não pede a permissão de *insights*. Por isso **o robô não lê métricas.** A leitura é manual, pelo app do Instagram:
1. No admin, abra **Instagram 📸**. A aba mostra os últimos 30 posts, com data, tipo, formato, o link e o id do Instagram.
2. No app do Instagram, abra o post e toque em **Ver insights**.
3. Copie **salvamentos, compartilhamentos, comentários e alcance** para a linha do post no admin e clique em **Salvar**.
4. A aba também mostra a **média de salvamentos por tipo** nos últimos 30 dias.

**Ajuste automático da rotação:**
- vale para tipos com pelo menos 3 posts medidos;
- se um tipo tem média de salvamentos de 1,5 vez ou mais a média do horário, ele passa na frente na próxima escolha daquele horário;
- ele ainda respeita "não repetir o tipo anterior";
- sem dados, vale a rotação normal.

**Revisão semanal sugerida (toda segunda):** preencher os números da semana anterior e anotar abaixo qual formato liderou em salvamento.

| Semana | Formato com mais salvamentos | Observação |
|---|---|---|
| | | |
