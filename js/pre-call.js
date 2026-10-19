// Tela antes de entrar na call: confere o navegador e as permissões, deixa escolher microfone, saída de som
// e câmera, e mostra o volume do microfone ao vivo. As escolhas ficam salvas neste aparelho.
import { esc } from './app.js';
import { prefsAudio, salvarPrefsAudio } from './audio-mic.js';

const PULAR = 'cc_pre_call_pular';

export function suporteCall() {
  return {
    microfone: !!navigator.mediaDevices?.getUserMedia,
    conexao: typeof RTCPeerConnection !== 'undefined',
    tela: !!navigator.mediaDevices?.getDisplayMedia,
    saida: typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype,
  };
}

async function permissao(nome) {
  try { return (await navigator.permissions.query({ name: nome })).state; } catch { return 'desconhecida'; }
}

// Devolve true para entrar, false se a pessoa cancelou
export async function preEntrar({ forcar = false } = {}) {
  const sup = suporteCall();
  if (!sup.microfone || !sup.conexao) {
    alert('Este navegador não suporta calls. Use o Chrome, Edge, Firefox ou Safari atualizados.');
    return false;
  }
  try { if (!forcar && localStorage.getItem(PULAR) === '1') return true; } catch { /* ignora */ }

  const prefs = prefsAudio();
  const dlg = document.createElement('dialog');
  dlg.className = 'pre-call';
  dlg.setAttribute('aria-labelledby', 'pc-titulo');
  dlg.innerHTML = `<form method="dialog">
    <h2 id="pc-titulo" style="margin-top:0">🎧 Antes de entrar</h2>
    <p class="muted" id="pc-perm" role="status"></p>
    <label for="pc-mic">Microfone</label><select id="pc-mic"><option value="">Padrão do sistema</option></select>
    <div class="medidor" aria-hidden="true"><div id="pc-nivel"></div></div>
    <p class="muted" style="font-size:.85rem;margin:4px 0 10px">Fale algo: a barra deve se mexer.</p>
    ${sup.saida ? '<label for="pc-saida">Saída de som</label><select id="pc-saida"><option value="">Padrão do sistema</option></select><button type="button" class="btn sec pequeno" id="pc-testar" style="margin-top:6px">🔊 Testar som</button>' : '<p class="muted" style="font-size:.85rem">A saída de som segue a do sistema neste navegador.</p>'}
    <ul class="pc-suporte">
      <li>${sup.tela ? '✅' : '⚠️'} Compartilhar tela ${sup.tela ? '' : '(indisponível neste aparelho)'}</li>
    </ul>
    <label class="check" style="margin-top:8px"><input type="checkbox" id="pc-pular"> Não mostrar de novo neste aparelho</label>
    <div class="controles" style="margin-top:14px"><button class="btn" value="ok" id="pc-entrar">Entrar na call</button><button class="btn sec" value="cancel">Cancelar</button></div>
  </form>`;
  document.body.append(dlg);
  dlg.showModal();

  let stream = null, ctx = null, quadro = 0;
  const parar = () => { cancelAnimationFrame(quadro); stream?.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => {}); stream = null; };
  const medir = async (deviceId) => {
    parar();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      dlg.querySelector('#pc-perm').textContent = '✅ Microfone liberado.';
    } catch (e) {
      dlg.querySelector('#pc-perm').textContent = e.name === 'NotAllowedError'
        ? '⛔ O microfone está bloqueado. Clique no cadeado da barra de endereço → Microfone → Permitir, e recarregue.'
        : e.name === 'NotFoundError' ? '⚠️ Nenhum microfone encontrado. Conecte um fone com microfone.' : '⚠️ Não foi possível abrir o microfone.';
      dlg.querySelector('#pc-entrar').disabled = e.name === 'NotFoundError';
      return;
    }
    ctx = new AudioContext();
    const an = ctx.createAnalyser(); an.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const loop = () => { an.getByteFrequencyData(buf); const m = buf.reduce((a, b) => a + b, 0) / buf.length; dlg.querySelector('#pc-nivel').style.width = `${Math.min(100, m * 1.6)}%`; quadro = requestAnimationFrame(loop); };
    loop();
    // Com permissão, os nomes dos aparelhos aparecem
    const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const encher = (sel, tipo, atual) => {
      if (!sel) return;
      sel.innerHTML = '<option value="">Padrão do sistema</option>' + devs.filter((d) => d.kind === tipo && d.deviceId && d.deviceId !== 'default')
        .map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === atual ? 'selected' : ''}>${esc(d.label || `${tipo === 'audioinput' ? 'Microfone' : 'Saída'} ${i + 1}`)}</option>`).join('');
    };
    encher(dlg.querySelector('#pc-mic'), 'audioinput', deviceId || prefs.mic);
    encher(dlg.querySelector('#pc-saida'), 'audiooutput', prefs.saida);
  };
  const estado = await permissao('microphone');
  dlg.querySelector('#pc-perm').textContent = estado === 'denied' ? '⛔ O microfone está bloqueado para este site.' : 'Pedindo acesso ao microfone...';
  await medir(prefs.mic || '');
  dlg.querySelector('#pc-mic').onchange = (e) => medir(e.target.value);
  dlg.querySelector('#pc-testar')?.addEventListener('click', async () => {
    const a = new Audio('data:audio/wav;base64,' + bipe());
    try { const saida = dlg.querySelector('#pc-saida').value; if (saida) await a.setSinkId(saida); await a.play(); } catch { /* sem saída escolhida */ }
  });

  const ok = await new Promise((r) => dlg.addEventListener('close', () => r(dlg.returnValue === 'ok'), { once: true }));
  parar();
  if (ok) {
    salvarPrefsAudio({ ...prefsAudio(), mic: dlg.querySelector('#pc-mic').value || '', saida: dlg.querySelector('#pc-saida')?.value || '' });
    try { if (dlg.querySelector('#pc-pular').checked) localStorage.setItem(PULAR, '1'); } catch { /* ignora */ }
  }
  dlg.remove();
  return ok;
}

// Bipe curto (0,25 s, 660 Hz) gerado na hora, para testar a saída de som sem baixar arquivo
function bipe() {
  const taxa = 8000, n = taxa / 4, dados = new Uint8Array(44 + n), v = new DataView(dados.buffer);
  const txt = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  txt(0, 'RIFF'); v.setUint32(4, 36 + n, true); txt(8, 'WAVE'); txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true); v.setUint32(28, taxa, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); txt(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) dados[44 + i] = 128 + Math.round(60 * Math.sin(2 * Math.PI * 660 * i / taxa) * Math.min(1, (n - i) / 400));
  let bin = ''; for (const b of dados) bin += String.fromCharCode(b);
  return btoa(bin);
}
