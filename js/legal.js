import { $, montarLayout } from './app.js';

await montarLayout();
const ATUALIZADO = '15/10/2026';
const pagina = location.pathname.split('/').pop();

// MODELO: revisar com a equipe/orientador (e, se o projeto crescer, com um advogado) antes de considerar definitivo.
const PRIVACIDADE = `
  <h1>Política de Privacidade</h1>
  <p class="muted">Última atualização: ${ATUALIZADO}</p>
  <p>Esta política explica como o Control Critic coleta, usa e protege seus dados pessoais, conforme a
  Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).</p>

  <h2>1. Quem é o responsável</h2>
  <p>O Control Critic é um projeto mantido pela equipe Control Critic. Para qualquer assunto sobre seus dados,
  use a página <a href="contato.html">Fale Conosco</a> e escolha o assunto "Privacidade".</p>

  <h2>2. Quais dados coletamos</h2>
  <ul>
    <li><strong>Conta:</strong> e-mail e senha (a senha é guardada criptografada pelo nosso provedor de autenticação, Supabase).</li>
    <li><strong>Perfil:</strong> nome de usuário, foto, banner, bio, categorias favoritas e, se você quiser, IDs de PSN, Xbox, Discord e Steam.</li>
    <li><strong>Atividade:</strong> avaliações, posts, comunidades, partidas, biblioteca, lista de desejos e quem você segue.</li>
    <li><strong>Fale Conosco:</strong> nome, e-mail, idade (opcional) e a mensagem.</li>
    <li><strong>Importação da Steam:</strong> se você usar, lemos a lista de jogos e horas jogadas do seu perfil público da Steam.</li>
  </ul>
  <p>Não coletamos dados de pagamento. As chamadas de voz e vídeo acontecem direto entre os navegadores dos participantes
  e <strong>não são gravadas</strong> nem passam pelos nossos servidores.</p>

  <h2>3. Para que usamos</h2>
  <ul>
    <li>Fazer o site funcionar: login, perfil, avaliações, comunidades e notificações (base legal: execução do serviço que você pediu).</li>
    <li>Recomendar jogos com base nos seus gostos (legítimo interesse; você pode limpar suas categorias favoritas e biblioteca quando quiser).</li>
    <li>Moderar o conteúdo e manter a comunidade segura (legítimo interesse e cumprimento de obrigação legal).</li>
    <li>Responder suas mensagens do Fale Conosco.</li>
  </ul>
  <p>Não vendemos seus dados e não usamos para publicidade.</p>

  <h2>4. O que fica público</h2>
  <p>Seu nome de usuário, foto, banner, bio, contas de jogo que você preencheu, nível, avaliações, biblioteca, posts e
  comunidades aparecem para outras pessoas. Seu e-mail <strong>nunca</strong> é exibido.</p>

  <h2>5. Com quem compartilhamos</h2>
  <ul>
    <li><strong>Supabase</strong> (banco de dados, login e arquivos) e <strong>Netlify</strong> (hospedagem), que processam dados em nosso nome.</li>
    <li><strong>Discord:</strong> só se você clicar em um convite ou se a comunidade exibir o widget do servidor.</li>
    <li><strong>Steam:</strong> só se você usar a importação da biblioteca.</li>
  </ul>
  <p>Esses serviços podem armazenar dados fora do Brasil, com as garantias previstas em seus próprios termos.</p>

  <h2>6. Por quanto tempo guardamos</h2>
  <p>Enquanto sua conta existir. Ao excluir a conta, apagamos seu perfil, avaliações, posts, biblioteca, notificações e imagens enviadas.
  Mensagens do Fale Conosco são apagadas pela equipe depois de respondidas, em até 12 meses.</p>

  <h2>7. Seus direitos</h2>
  <p>Você pode, a qualquer momento:</p>
  <ul>
    <li><strong>Acessar e baixar</strong> seus dados: Perfil → "Baixar meus dados".</li>
    <li><strong>Corrigir</strong> seus dados: Perfil → "Editar perfil".</li>
    <li><strong>Excluir</strong> sua conta e seus dados: Perfil → "Excluir minha conta".</li>
    <li>Pedir informações sobre o uso dos seus dados ou revogar consentimentos, pelo <a href="contato.html">Fale Conosco</a>.</li>
  </ul>

  <h2>8. Crianças e adolescentes</h2>
  <p>O Control Critic é destinado a maiores de 13 anos. Menores de 18 anos devem usar o site com conhecimento e autorização dos pais ou responsáveis.</p>

  <h2>9. Segurança</h2>
  <p>Usamos conexão criptografada (HTTPS), senhas criptografadas e regras de acesso no banco de dados que impedem que um usuário
  leia ou altere dados privados de outro. Nenhum sistema é 100% seguro; se ocorrer um incidente relevante, avisaremos os afetados.</p>

  <h2>10. Cookies e armazenamento local</h2>
  <p>Usamos apenas o armazenamento do navegador necessário para manter você logado e para o app funcionar offline. Não usamos cookies de rastreamento.</p>

  <h2>11. Mudanças</h2>
  <p>Se esta política mudar de forma importante, avisaremos no site.</p>`;

const TERMOS = `
  <h1>Termos de Uso</h1>
  <p class="muted">Última atualização: ${ATUALIZADO}</p>
  <p>Ao criar uma conta ou usar o Control Critic, você concorda com estes termos.</p>

  <h2>1. O serviço</h2>
  <p>O Control Critic é uma rede social de jogos: avaliações, comunidades, chamadas de voz, notícias e promoções.
  Preços e notícias vêm de fontes externas (Steam, IGDB e blogs oficiais) e podem estar desatualizados; confira sempre na loja antes de comprar.</p>

  <h2>2. Sua conta</h2>
  <ul>
    <li>Você precisa ter pelo menos 13 anos. Menores de 18 precisam de autorização dos responsáveis.</li>
    <li>Você é responsável pela sua senha e por tudo o que é feito com a sua conta.</li>
    <li>Use um nome de usuário que não se passe por outra pessoa ou marca.</li>
  </ul>

  <h2>3. Regras da comunidade</h2>
  <p>Não é permitido publicar ou fazer, inclusive em calls:</p>
  <ul>
    <li>Ofensas, discurso de ódio, discriminação, assédio ou ameaças.</li>
    <li>Conteúdo sexual, violento de forma gratuita ou impróprio para menores.</li>
    <li>Spam, golpes, venda de contas, links maliciosos ou pirataria.</li>
    <li>Dados pessoais de outras pessoas sem autorização.</li>
    <li>Compartilhar na tela conteúdo que viole direitos autorais ou estas regras.</li>
  </ul>
  <p>Use o botão <strong>Denunciar</strong> quando vir algo assim. A equipe pode ocultar conteúdo, remover comunidades e suspender contas que descumprirem as regras.</p>

  <h2>4. Seu conteúdo</h2>
  <p>O que você publica continua sendo seu. Ao publicar, você permite que o Control Critic exiba esse conteúdo no site.
  Você pode apagar suas avaliações, posts e sua conta a qualquer momento.</p>

  <h2>5. Serviços de terceiros</h2>
  <p>Links para lojas, Discord e outros sites levam a serviços com regras próprias. Não somos responsáveis por compras ou interações feitas neles.</p>

  <h2>6. Disponibilidade</h2>
  <p>O Control Critic é um projeto em desenvolvimento, oferecido "como está". Podemos mudar, pausar ou encerrar funções sem aviso prévio.</p>

  <h2>7. Privacidade</h2>
  <p>O tratamento dos seus dados está descrito na <a href="privacidade.html">Política de Privacidade</a>.</p>

  <h2>8. Contato</h2>
  <p>Dúvidas? Fale com a gente pelo <a href="contato.html">Fale Conosco</a>.</p>`;

// Texto técnico redigido pela equipe; precisa de revisão jurídica antes de valer como documento oficial.
const DIRETRIZES = `
  <h1>Diretrizes da comunidade</h1>
  <p class="muted">Última atualização: 19/10/2026</p>
  <p>O Control Critic é para jogar, avaliar e trocar ideia. Para continuar bom para todo mundo, siga estas regras.
  Elas valem para posts, comentários, avaliações, stories, mensagens, grupos, comunidades e calls.</p>

  <h2>✅ O que a gente quer</h2>
  <ul>
    <li>Discordar à vontade de jogos e notas, sem atacar pessoas.</li>
    <li>Avisar spoilers no começo do texto.</li>
    <li>Memes e zoeira, desde que não humilhem ninguém.</li>
  </ul>

  <h2>🚫 O que não é permitido</h2>
  <ul>
    <li><strong>Assédio, ameaça ou perseguição</strong>, inclusive por mensagem ou em call.</li>
    <li><strong>Discurso de ódio</strong> por raça, cor, etnia, religião, gênero, orientação sexual, deficiência ou origem.</li>
    <li><strong>Conteúdo sexual ou violento explícito</strong>. O site é para maiores de 13 anos.</li>
    <li><strong>Golpes, phishing e venda de contas</strong>; pedir senha, código ou dados de cartão.</li>
    <li><strong>Spam</strong>: propaganda repetida, links suspeitos, flood.</li>
    <li>Expor dados pessoais de outras pessoas (endereço, telefone, documentos, fotos sem permissão).</li>
    <li>Se passar por outra pessoa, marca ou pela equipe do Control Critic.</li>
    <li>Cheats, piratarias e qualquer coisa ilegal.</li>
  </ul>

  <h2>🛡️ Suas ferramentas</h2>
  <ul>
    <li><strong>Denunciar</strong> (🚩): em posts, comentários, avaliações, mensagens, perfis e comunidades. Quem foi denunciado não fica sabendo quem denunciou.</li>
    <li><strong>Bloquear</strong> (🚫, no perfil da pessoa): vocês deixam de ser amigos e de se seguir, e ela não pode mais falar com você nem comentar seus posts.</li>
    <li><strong>Mensagens só entre amigos</strong>: desconhecidos não conseguem mandar mensagem direta para você.</li>
  </ul>

  <h2>⚖️ Como a equipe age</h2>
  <p>Denúncias graves (assédio, golpe, conteúdo impróprio) são analisadas primeiro. Conforme o caso, a equipe pode
  ocultar o conteúdo, avisar, suspender por um período ou banir a conta. Toda decisão fica registrada.</p>
  <p>Se a sua conta foi suspensa e você acha que foi um engano, use o pedido de revisão que aparece no aviso de suspensão.
  Você pode pedir uma revisão por semana.</p>

  <p class="muted" style="margin-top:18px">Dúvidas? Fale com a gente pelo <a href="contato.html">Fale Conosco</a>.</p>`;

$('#conteudo').insertAdjacentHTML('beforeend', `<article class="cartao legal" style="max-width:860px;margin:0 auto">${pagina === 'termos.html' ? TERMOS : pagina === 'diretrizes.html' ? DIRETRIZES : PRIVACIDADE}</article>`);
