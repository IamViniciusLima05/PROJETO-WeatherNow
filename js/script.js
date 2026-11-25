/* WeatherNow — previsão do tempo com a API gratuita da Open-Meteo (sem chave) */

const $ = (s) => document.querySelector(s);
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const banco = {
  ler(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } },
  salvar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PREVISAO = 'https://api.open-meteo.com/v1/forecast';
const PADRAO = { nome: 'Porto Alegre', regiao: 'Rio Grande do Sul, Brasil', lat: -30.0331, lon: -51.23 };

const estado = {
  unidade: banco.ler('wn_unidade', 'c'),
  cidade: banco.ler('wn_cidade', PADRAO),
  favoritas: banco.ler('wn_favoritas', []),
  dados: null,
  sugestoes: [],
  selecionada: -1
};

/* Códigos de tempo da OMS → texto e tipo de ícone */
const CONDICOES = {
  0: ['Céu limpo', 'sol'], 1: ['Predominantemente limpo', 'sol'], 2: ['Parcialmente nublado', 'poucas'], 3: ['Nublado', 'nuvem'],
  45: ['Neblina', 'neblina'], 48: ['Neblina com geada', 'neblina'],
  51: ['Garoa fraca', 'garoa'], 53: ['Garoa', 'garoa'], 55: ['Garoa forte', 'garoa'], 56: ['Garoa congelante', 'garoa'], 57: ['Garoa congelante', 'garoa'],
  61: ['Chuva fraca', 'chuva'], 63: ['Chuva', 'chuva'], 65: ['Chuva forte', 'chuva'], 66: ['Chuva congelante', 'chuva'], 67: ['Chuva congelante', 'chuva'],
  71: ['Neve fraca', 'neve'], 73: ['Neve', 'neve'], 75: ['Neve forte', 'neve'], 77: ['Grãos de neve', 'neve'],
  80: ['Pancadas de chuva', 'chuva'], 81: ['Pancadas de chuva', 'chuva'], 82: ['Pancadas fortes', 'chuva'],
  85: ['Pancadas de neve', 'neve'], 86: ['Pancadas de neve', 'neve'],
  95: ['Trovoadas', 'trovoada'], 96: ['Trovoadas com granizo', 'trovoada'], 99: ['Trovoadas com granizo', 'trovoada']
};
const condicao = (c) => CONDICOES[c] || ['—', 'nuvem'];

/* Ícones desenhados em SVG */
const SOL = '<circle cx="32" cy="32" r="11" fill="#FFD34D"/><g stroke="#FFD34D" stroke-width="3.5" stroke-linecap="round"><path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M15 49l4-4M45 19l4-4"/></g>';
const LUA = '<path d="M40 12a20 20 0 1 0 12 30A16 16 0 0 1 40 12Z" fill="#F4F1DE"/>';
const NUVEM = (y = 0, cor = '#fff') => `<path transform="translate(0 ${y})" d="M20 50h26a10 10 0 0 0 0-20 14 14 0 0 0-27-3 11 11 0 0 0 1 23Z" fill="${cor}"/>`;
function icone(tipo, dia = true) {
  const astro = dia ? SOL : LUA;
  const m = {
    sol: astro,
    poucas: `<g transform="translate(-8 -10) scale(.85)">${astro}</g>${NUVEM(6)}`,
    nuvem: `${NUVEM(-6, '#cfd8e3')}<g transform="translate(6 4)">${NUVEM(0)}</g>`,
    neblina: `${NUVEM(-8)}<g stroke="#e3ebf3" stroke-width="3.5" stroke-linecap="round"><path d="M12 50h40M18 57h30"/></g>`,
    garoa: `${NUVEM(-8)}<g stroke="#8fd3ff" stroke-width="3" stroke-linecap="round"><path d="M24 50v4M34 50v4M44 50v4"/></g>`,
    chuva: `${NUVEM(-8)}<g stroke="#8fd3ff" stroke-width="3.5" stroke-linecap="round"><path d="M24 48l-3 9M34 48l-3 9M44 48l-3 9"/></g>`,
    neve: `${NUVEM(-8)}<g fill="#fff"><circle cx="24" cy="52" r="3"/><circle cx="34" cy="57" r="3"/><circle cx="44" cy="52" r="3"/></g>`,
    trovoada: `${NUVEM(-8, '#d7d3ea')}<path d="M34 44l-7 11h7l-4 9 11-14h-7l4-6Z" fill="#FFD34D"/>`
  };
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${m[tipo] || m.nuvem}</svg>`;
}

/* Conversões e formatação */
const temp = (c) => Math.round(estado.unidade === 'f' ? c * 9 / 5 + 32 : c);
const grau = (c) => `${temp(c)}°`;
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const diaSemana = (iso, i) => i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : capitalizar(new Date(iso + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long' }).replace('-feira', ''));

function mostrarErro(msg) {
  const e = $('#erro');
  e.textContent = msg; e.hidden = !msg;
}

/* Busca a previsão da cidade atual */
async function carregarPrevisao() {
  const { lat, lon } = estado.cidade;
  document.body.classList.add('carregando');
  const params = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: 'auto', forecast_days: 7,
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  });
  try {
    const r = await fetch(`${PREVISAO}?${params}`);
    if (!r.ok) throw new Error();
    estado.dados = await r.json();
    banco.salvar('wn_cache', { cidade: estado.cidade, dados: estado.dados, ts: Date.now() });
    mostrarErro('');
  } catch {
    const cache = banco.ler('wn_cache', null);
    if (cache && cache.cidade.lat === lat && cache.cidade.lon === lon) {
      estado.dados = cache.dados;
      mostrarErro('Sem conexão agora. Mostrando a última previsão salva.');
    } else {
      estado.dados = null;
      mostrarErro('Não foi possível carregar a previsão. Verifique sua internet e tente de novo.');
    }
  }
  document.body.classList.remove('carregando');
  desenhar();
}

function desenhar() {
  const c = estado.cidade;
  $('#nome-cidade').textContent = c.nome;
  $('#regiao').textContent = c.regiao || '';
  document.title = `${c.nome} | WeatherNow`;
  const fav = estado.favoritas.some((f) => mesma(f, c));
  $('#btn-fav').setAttribute('aria-pressed', fav);
  $('#btn-fav span').textContent = fav ? 'Cidade salva' : 'Salvar cidade';
  desenharFavoritas();

  const d = estado.dados;
  if (!d) {
    $('#temp').textContent = '--°'; $('#condicao').textContent = '—'; $('#minmax').textContent = '';
    $('#icone-agora').innerHTML = ''; $('#horas').innerHTML = ''; $('#dias').innerHTML = '';
    ['#sensacao', '#umidade', '#vento', '#chuva'].forEach((s) => { $(s).textContent = '--'; });
    $('#atualizado').textContent = '';
    return;
  }

  const a = d.current, dia = a.is_day === 1;
  const [texto, tipo] = condicao(a.weather_code);
  const ceu = { sol: 'limpo', poucas: 'limpo', nuvem: 'nuvem', neblina: 'nuvem', garoa: 'chuva', chuva: 'chuva', neve: 'neve', trovoada: 'tempestade' }[tipo];
  document.body.dataset.ceu = `${ceu}-${dia ? 'dia' : 'noite'}`;

  $('#icone-agora').innerHTML = icone(tipo, dia);
  $('#temp').textContent = grau(a.temperature_2m);
  $('#condicao').textContent = texto;
  $('#minmax').textContent = `Máx. ${grau(d.daily.temperature_2m_max[0])} · Mín. ${grau(d.daily.temperature_2m_min[0])}`;
  $('#sensacao').textContent = grau(a.apparent_temperature);
  $('#umidade').textContent = `${a.relative_humidity_2m}%`;
  $('#vento').textContent = `${Math.round(a.wind_speed_10m)} km/h`;
  $('#chuva').textContent = `${d.daily.precipitation_probability_max[0] ?? 0}%`;
  const hora = a.time.slice(11, 16);
  $('#atualizado').textContent = `Horário local da cidade: ${hora}`;

  // Próximas 24 horas a partir da hora atual da cidade
  const h = d.hourly, inicio = Math.max(0, h.time.findIndex((t) => t.slice(0, 13) === a.time.slice(0, 13)));
  $('#horas').innerHTML = h.time.slice(inicio, inicio + 24).map((t, i) => {
    const k = inicio + i, [tx, tp] = condicao(h.weather_code[k]);
    const prob = h.precipitation_probability?.[k];
    return `<li class="${i === 0 ? 'agora-h' : ''}" title="${escapar(tx)}"><span>${i === 0 ? 'Agora' : t.slice(11, 13) + 'h'}</span>${icone(tp, h.is_day[k] === 1)}<b>${grau(h.temperature_2m[k])}</b>${prob ? `<span>${prob}%</span>` : '<span>&nbsp;</span>'}</li>`;
  }).join('');

  // 7 dias, com a barra mostrando a faixa de temperatura relativa à semana
  const dd = d.daily, menor = Math.min(...dd.temperature_2m_min), maior = Math.max(...dd.temperature_2m_max), faixa = (maior - menor) || 1;
  $('#dias').innerHTML = dd.time.map((t, i) => {
    const [tx, tp] = condicao(dd.weather_code[i]);
    const ini = ((dd.temperature_2m_min[i] - menor) / faixa) * 100, fim = ((dd.temperature_2m_max[i] - menor) / faixa) * 100;
    const p = dd.precipitation_probability_max[i];
    return `<li><span class="dia">${diaSemana(t, i)}</span><span title="${escapar(tx)}">${icone(tp)}</span><span class="prob">${p ? p + '%' : ''}</span>
      <span class="faixa"><span class="min">${grau(dd.temperature_2m_min[i])}</span><span class="barra"><i style="left:${ini}%;right:${100 - fim}%"></i></span><span class="max">${grau(dd.temperature_2m_max[i])}</span></span></li>`;
  }).join('');
}

/* Cidades salvas */
const mesma = (a, b) => Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
function desenharFavoritas() {
  $('#favoritas').innerHTML = estado.favoritas.map((f, i) =>
    `<button type="button" data-i="${i}" class="${mesma(f, estado.cidade) ? 'ativa' : ''}">${escapar(f.nome)}<span class="x" data-remover="${i}" role="button" aria-label="Remover ${escapar(f.nome)}">×</span></button>`).join('');
}
$('#favoritas').addEventListener('click', (e) => {
  const rem = e.target.closest('[data-remover]');
  if (rem) {
    estado.favoritas.splice(+rem.dataset.remover, 1);
    banco.salvar('wn_favoritas', estado.favoritas); desenhar(); return;
  }
  const b = e.target.closest('[data-i]');
  if (b) escolherCidade(estado.favoritas[+b.dataset.i]);
});
$('#btn-fav').addEventListener('click', () => {
  const i = estado.favoritas.findIndex((f) => mesma(f, estado.cidade));
  if (i >= 0) estado.favoritas.splice(i, 1);
  else estado.favoritas.push(estado.cidade);
  banco.salvar('wn_favoritas', estado.favoritas.slice(0, 8));
  desenhar();
});

function escolherCidade(c) {
  estado.cidade = c;
  banco.salvar('wn_cidade', c);
  fecharSugestoes();
  $('#cidade').value = '';
  $('#nome-cidade').textContent = c.nome;
  carregarPrevisao();
}

/* Autocompletar com a API de geocodificação */
let timerBusca = null, buscaAtual = 0;
$('#cidade').addEventListener('input', (e) => {
  clearTimeout(timerBusca);
  const termo = e.target.value.trim();
  if (termo.length < 2) { fecharSugestoes(); return; }
  timerBusca = setTimeout(() => buscarCidades(termo), 300);
});
async function buscarCidades(termo) {
  const id = ++buscaAtual;
  try {
    const r = await fetch(`${GEO}?${new URLSearchParams({ name: termo, count: 6, language: 'pt', format: 'json' })}`);
    const j = await r.json();
    if (id !== buscaAtual) return;
    estado.sugestoes = (j.results || []).map((x) => ({
      nome: x.name, regiao: [x.admin1, x.country].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude
    }));
  } catch {
    if (id !== buscaAtual) return;
    estado.sugestoes = null;
  }
  estado.selecionada = -1;
  desenharSugestoes();
}
function desenharSugestoes() {
  const ul = $('#sugestoes');
  if (estado.sugestoes === null) ul.innerHTML = '<li class="vazio">Sem conexão para buscar cidades.</li>';
  else if (!estado.sugestoes.length) ul.innerHTML = '<li class="vazio">Nenhuma cidade encontrada.</li>';
  else ul.innerHTML = estado.sugestoes.map((s, i) => `<li role="option" data-i="${i}" aria-selected="${i === estado.selecionada}">${escapar(s.nome)}<small>${escapar(s.regiao)}</small></li>`).join('');
  ul.hidden = false;
}
function fecharSugestoes() { $('#sugestoes').hidden = true; estado.sugestoes = []; }
$('#sugestoes').addEventListener('mousedown', (e) => {
  const li = e.target.closest('[data-i]');
  if (li) { e.preventDefault(); escolherCidade(estado.sugestoes[+li.dataset.i]); }
});
$('#cidade').addEventListener('keydown', (e) => {
  const lista = estado.sugestoes || [];
  if (e.key === 'ArrowDown' && lista.length) { e.preventDefault(); estado.selecionada = (estado.selecionada + 1) % lista.length; desenharSugestoes(); }
  if (e.key === 'ArrowUp' && lista.length) { e.preventDefault(); estado.selecionada = (estado.selecionada - 1 + lista.length) % lista.length; desenharSugestoes(); }
  if (e.key === 'Escape') fecharSugestoes();
});
$('#cidade').addEventListener('blur', () => setTimeout(fecharSugestoes, 150));
$('#form-busca').addEventListener('submit', async (e) => {
  e.preventDefault();
  const lista = estado.sugestoes || [];
  if (lista.length) { escolherCidade(lista[Math.max(0, estado.selecionada)]); return; }
  const termo = $('#cidade').value.trim();
  if (termo.length >= 2) {
    await buscarCidades(termo);
    if (estado.sugestoes?.length) escolherCidade(estado.sugestoes[0]);
  }
});

/* Localização do aparelho */
$('#gps').addEventListener('click', () => {
  if (!navigator.geolocation) { mostrarErro('Seu navegador não permite usar a localização.'); return; }
  navigator.geolocation.getCurrentPosition(
    (p) => escolherCidade({ nome: 'Minha localização', regiao: `${p.coords.latitude.toFixed(2)}, ${p.coords.longitude.toFixed(2)}`, lat: p.coords.latitude, lon: p.coords.longitude }),
    () => mostrarErro('Não foi possível pegar sua localização. Busque a cidade pelo nome.'),
    { timeout: 10000 }
  );
});

/* °C / °F */
document.querySelectorAll('[data-un]').forEach((b) => b.addEventListener('click', () => {
  estado.unidade = b.dataset.un;
  banco.salvar('wn_unidade', estado.unidade);
  document.querySelectorAll('[data-un]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  desenhar();
}));
document.querySelectorAll('[data-un]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.un === estado.unidade));

carregarPrevisao();
setInterval(() => { if (!document.hidden) carregarPrevisao(); }, 15 * 60 * 1000);
