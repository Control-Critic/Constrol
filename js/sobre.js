import { $, montarLayout } from './app.js';

await montarLayout();
$('#conteudo').insertAdjacentHTML('beforeend', `
  <section class="hero">
    <div>
      <h1>Quem Somos</h1>
      <p>Olá, somos a Control Critic! Nossa equipe é composta por quatro integrantes: Gustavo Barros Tenório,
      Giovanni Henrique de Lima Franco Matos, Adler Pereira de Lima e Danilo Silva Bernardino.</p>
      <p>Temos como objetivo entreter, informar e facilitar as buscas sobre os jogos favoritos da comunidade.
      Aqui você pode encontrar e criar comunidades dos seus jogos favoritos, avaliar o que jogou, acompanhar
      notícias e promoções e entrar em call com quem curte o mesmo tema!</p>
      <a class="btn" href="comunidades.html">Conhecer as comunidades</a>
    </div>
    <img src="img/Adelino.png" alt="Adelino, mascote do Control Critic">
  </section>
  <div class="grade" style="margin-top:20px">
    <div class="cartao"><h2 class="h3">⭐ Avalie</h2><p class="muted">Dê sua nota, escreva sua crítica e ganhe XP.</p></div>
    <div class="cartao"><h2 class="h3">📰 Informe-se</h2><p class="muted">Notícias oficiais e promoções atualizadas automaticamente.</p></div>
    <div class="cartao"><h2 class="h3">👥 Conecte-se</h2><p class="muted">Comunidades com mural, call de voz, compartilhamento de tela e Discord.</p></div>
  </div>`);
