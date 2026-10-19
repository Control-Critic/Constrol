# Configurações do GitHub que exigem ação manual

Estas configurações não podem ser feitas por arquivo no repositório. Faça-as em **Settings** do `Control-Critic/Constrol`.

1. **Proteção da `main`** (Settings → Branches → Add rule, ou Rulesets):
   - exigir Pull Request antes de mesclar, com 1 aprovação;
   - exigir os checks verdes: `checar`, `banco` e `analisar` (CodeQL);
   - bloquear force push e exclusão da branch;
   - opcional: exigir revisão dos CODEOWNERS.
2. **CODEOWNERS:** o arquivo `.github/CODEOWNERS` usa a equipe `@Control-Critic/admins`. Crie essa equipe em Organization → Teams com os administradores, ou troque pelo seu usuário do GitHub, por exemplo `@seu-usuario`.
3. **Secret scanning e push protection** (Settings → Code security): ativar **Secret scanning** e **Push protection**. Em repositório público, eles são gratuitos.
4. **Dependabot alerts e security updates:** ativar na mesma tela. O arquivo `.github/dependabot.yml` já agenda os PRs semanais.
5. **Ambientes protegidos** (Settings → Environments), recomendado:
   - criar um ambiente `producao` com aprovação obrigatória, para os robôs que publicam (Instagram);
   - mover para ele os segredos `IG_TOKEN` e `IG_USER_ID`.
6. **Permissões padrão do GITHUB_TOKEN** (Settings → Actions → General → Workflow permissions): escolher "Read repository contents". Os workflows já declaram `permissions: contents: read`.
