# Observabilidade, CI e backup (fase 15)

## Erros do site
- O site manda erros de JavaScript e promessas rejeitadas para `registrar_erro`.
  - No máximo 5 por carregamento de página.
  - Os ruídos conhecidos (extensões, rede caída, cancelamentos) são ignorados.
- **Nunca sai:**
  - e-mails, tokens, chaves ou "Bearer";
  - parâmetros da URL;
  - números longos.
  O site limpa antes de enviar e o banco limpa de novo.
- **Agregação:** erro igual no mesmo dia vira uma linha só, com contador (`vezes`).
- **Limites:** no máximo 2.000 assinaturas novas por dia, e as linhas são apagadas depois de **30 dias** (pg_cron).
- Cada erro leva a **versão do deploy** (commit), carimbada no `js/app.js` pelo build do Netlify.
- **Painel:** Admin → **Status 🩺**:
  - robôs: última execução, duração e resultado;
  - serviços;
  - erros dos últimos 7 dias por tipo e página.

## Robôs
Cada workflow (sync, igdb, instagram, semanal e backup) registra início e fim em `robot_runs` com `scripts/registrar-robo.mjs`. Se o registro falhar, o robô não cai.

## CI
| Verificação | Onde |
|---|---|
| Sintaxe, testes, HTML e links | job `checar` |
| Schema do zero e idempotente, migrações (2x) e RLS | job `banco` |
| Acessibilidade (axe-core, WCAG 2.2 A/AA) | job `acessibilidade` |
| Segredos (gitleaks), tamanho dos arquivos públicos e `npm audit` | job `seguranca` |
| Análise de código (CodeQL) | workflow `codeql` |

## Backup
- ⚠️ **O repositório é público.** Artefatos do Actions podem ser baixados por qualquer pessoa logada no GitHub.
  - Por isso, desde esta fase, **cada tabela é cifrada** (AES-256-GCM, chave derivada com scrypt) com o segredo `BACKUP_SENHA`.
  - **Sem o segredo, o backup não roda.**
- **Integridade:** o `manifesto.json` traz o SHA-256 do conteúdo e do arquivo cifrado, além do número de linhas.
- **Incluídas:** as tabelas que antes faltavam (comentários de posts, curtidas, stories, bloqueios, apelações etc.).
- **Ficam de fora:** senhas, e-mails, inscrições de push e `app_secrets`.
- **Verificar e restaurar:** `BACKUP_SENHA=... node scripts/restaurar-backup.mjs <pasta> --verificar`, ou `--sql > restaurar.sql` para um banco de **teste**.
- **Teste de restauração feito:** backup cifrado de 3 tabelas do banco local, verificação, recusa com senha errada, SQL gerado e restaurado num banco novo, com contagens iguais (13, 46 e 8).
- **RPO** (quanto se pode perder): até **7 dias**, porque o backup é semanal.
  - Para menos, ative os backups diários do Supabase (plano Pro) ou rode o workflow manualmente antes de mudanças grandes.
- **RTO** (tempo para voltar): cerca de **1 a 2 horas**: novo projeto, `schema.sql`, restaurar o SQL e trocar as variáveis.

## Ações manuais
1. Criar o segredo **`BACKUP_SENHA`** no GitHub (Settings → Secrets → Actions), com 16 ou mais caracteres. Guarde a senha num gerenciador de senhas; sem ela, o backup não abre.
2. **Apagar os backups antigos não cifrados** em Actions → Backup do banco → cada execução → Artifacts → lixeira. **Precisa de aprovação:** é uma exclusão de dados.
3. Avaliar deixar o repositório **privado**. Isso exige revisar o plano do GitHub e os minutos do Actions.
