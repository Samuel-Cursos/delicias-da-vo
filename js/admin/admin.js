import { iniciarAuth } from "../core/auth.js";
import { formatarMoeda, limparTexto, gerarId } from "../core/utils.js";
import { produtos, observarProdutos, criarProdutosBase, salvarProduto, atualizarProduto, excluirProduto, statusEstoque } from "../services/productService.js";
import { categorias, categoriasBase, observarCategorias, normalizarCategorias, categoriaPorId } from "../services/categoryService.js";
import { registrarVendaRapida, observarVendasHoje, vendasHoje, resumoCaixa, excluirVendaComEstorno } from "../services/salesService.js";
import { lojaConfig, observarConfiguracoesLoja, salvarConfiguracoes } from "../services/configService.js";
import { promocoes, observarPromocoes, salvarPromocao, atualizarPromocao, excluirPromocao } from "../services/promotionService.js";
import { sugerirProdutoComIA } from "../services/aiProductService.js";
import { iniciarCategoriasAdmin, abrirModalCategoria, fecharModalCategoria, salvarCategoriaAdmin } from "./categoryAdmin.js";
import { createProductAdminRow, createPromoAdminCard } from "../core/templates.js";
import { storage, storageRef, uploadBytes, getDownloadURL, deleteObject } from "../core/firebase.js";
import { observarResumoPedidosSiteHoje, resumoPedidosSiteHoje } from "../services/orderService.js";
import { salgadosFesta, observarSalgadosFesta, salvarSalgadoFesta, excluirSalgadoFesta, enviarProdutosBaseParaFirestore, descreverErroFirestore, normalizarPrecoFesta, textoPrecoFesta } from "../services/partyProductService.js";
import { encomendasFesta, observarEncomendasFesta, atualizarStatusEncomendaFesta, marcarEncomendaVisualizada } from "../services/partyOrderService.js";

// API pública será exposta no final do arquivo para reduzir poluição global

let produtoEditando = null;
let vendaAtual = [];
let promocaoEditando = null;
let festaEditando = null;

iniciarAuth();

function iniciarAdminDepoisLogin() {
  observarProdutos(() => {
    renderDashboard();
    renderProdutosAdmin();
    renderVendaRapida();
    renderPromocoesAdmin();
  });

  iniciarCategoriasAdmin();
  observarSalgadosFesta((_, erro) => renderFestasAdmin(erro));
  observarEncomendasFesta((_, erro) => { renderAgendaEncomendas(erro); renderNotificacoesEncomendas(); });

  observarVendasHoje(() => {
    renderDashboard();
    renderCaixa();
  });

  observarResumoPedidosSiteHoje(() => {
    renderPedidosSiteDashboard();
  });

 observarConfiguracoesLoja(() => {
  const abaConfigAberta = document.getElementById("aba-config")?.classList.contains("active");

  if (!abaConfigAberta) {
    preencherConfiguracoesLoja();
  }
});

  observarPromocoes(() => {
    renderPromocoesAdmin();
  });
}

function abrirAba(nome, botao) {
  document.querySelectorAll(".aba").forEach(a => a.classList.remove("active"));
  document.getElementById(`aba-${nome}`).classList.add("active");

  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  if (botao) botao.classList.add("active");

  const titulos = {
    dashboard: "Dashboard",
    produtos: "Produtos",
    venda: "Venda rápida",
    caixa: "Caixa",
    promocoes: "Promoções",
    categorias: "Categorias",
    festas: "Salgados para festas",
    encomendas: "Agenda de encomendas",
    config: "Configurações"
  };

  document.getElementById("tituloAba").textContent = titulos[nome] || "Painel";
}

function abrirAbaPorNome(nome) {
  const botao = [...document.querySelectorAll('.tab-btn')].find(btn => btn.getAttribute('onclick')?.includes(`'${nome}'`));
  abrirAba(nome, botao);
}

function produtoMaisVendidoHoje() {
  const mapa = {};

  vendasHoje.forEach(venda => {
    (venda.itens || []).forEach(item => {
      if (!mapa[item.nome]) mapa[item.nome] = 0;
      mapa[item.nome] += Number(item.quantidade || 0);
    });
  });

  const ordenado = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  return ordenado[0] || null;
}


function renderPedidosSiteDashboard() {
  const totalEl = document.getElementById("statPedidosSiteHoje");
  const ultimoEl = document.getElementById("statUltimoPedidoSite");

  if (!totalEl || !ultimoEl) return;

  totalEl.textContent = resumoPedidosSiteHoje.totalPedidos || 0;

  const ultimo = resumoPedidosSiteHoje.ultimoPedido;

  if (ultimo?.numeroFormatado) {
    ultimoEl.textContent = `${ultimo.numeroFormatado} às ${ultimo.horaBR || "--:--"}`;
  } else {
    ultimoEl.textContent = "Nenhum pedido enviado hoje";
  }
}


function renderDashboard() {
  renderPedidosSiteDashboard();

  const ativos = produtos.filter(p => p.ativo !== false).length;

  const baixos = produtos.filter(p => {
    const status = statusEstoque(p);
    return (status.classe === "baixo" || status.classe === "off") && !p.sobEncomenda;
  });

  const totalHoje = vendasHoje.reduce((soma, venda) => soma + Number(venda.total || 0), 0);
  const maisVendido = produtoMaisVendidoHoje();

  const statProdutos = document.getElementById("statProdutos");
  if (!statProdutos) return;

  document.getElementById("statProdutos").textContent = produtos.length;
  document.getElementById("statAtivosTexto").textContent = `${ativos} ativos`;
  document.getElementById("statBaixo").textContent = baixos.length;
  document.getElementById("statVendasHoje").textContent = formatarMoeda(totalHoje);
  document.getElementById("statQtdVendas").textContent = `${vendasHoje.length} venda(s) registrada(s)`;
  document.getElementById("statMaisVendido").textContent = maisVendido ? maisVendido[0] : "—";
  document.getElementById("statMaisVendidoQtd").textContent = maisVendido ? `${maisVendido[1]} unidade(s)` : "Sem vendas hoje";

  const avisos = document.getElementById("avisosDashboard");
  if (avisos) {
    avisos.innerHTML = "";

    if (!baixos.length) {
      const p = document.createElement('p'); p.textContent = 'Nenhum produto em atenção no momento.'; avisos.appendChild(p);
    }

    baixos.forEach(p => {
      const el = document.createElement('p'); el.textContent = `⚠ ${p.nome}: estoque ${p.estoque || 0}`; avisos.appendChild(el);
    });
  }

  const ultimas = document.getElementById("ultimasVendasDashboard");
  if (ultimas) {
    ultimas.innerHTML = "";

    if (!vendasHoje.length) {
      const p = document.createElement('p'); p.textContent = 'Nenhuma venda registrada hoje.'; ultimas.appendChild(p);
    }

    vendasHoje.slice(0, 5).forEach(venda => {
      const itens = (venda.itens || []).map(i => `${i.quantidade}x ${i.nome}`).join(", ");
      const wrapper = document.createElement('div'); wrapper.className = 'venda-historico';
      const strong = document.createElement('strong'); strong.textContent = `${venda.hora || '--:--'} - ${formatarMoeda(venda.total)}`; wrapper.appendChild(strong);
      const small1 = document.createElement('small'); small1.textContent = itens; wrapper.appendChild(small1);
      const small2 = document.createElement('small'); small2.textContent = venda.pagamento; wrapper.appendChild(small2);
      ultimas.appendChild(wrapper);
    });
  }
}

function renderProdutosAdmin() {
  const box = document.getElementById("listaProdutosAdmin");
  if (!box) return;

  const busca = (document.getElementById("buscaAdminProduto")?.value || "").toLowerCase();

  box.innerHTML = "";

  produtos
    .filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.includes(busca))
    .forEach(p => {
      const row = createProductAdminRow(p);
      box.appendChild(row);
    });
}

function preencherSelectCategorias() {
  const select = document.getElementById("produtoCategoria");
  if (!select) return;

  select.innerHTML = "";

  const ordenadas = normalizarCategorias(categorias.length ? categorias : categoriasBase).filter(categoria => categoria.ativa !== false);

  ordenadas.forEach(categoria => {
    const option = document.createElement("option");
    option.value = categoria.id;
    option.textContent = `${categoria.emoji || "🏷️"} ${categoria.nome}`;
    select.appendChild(option);
  });
}

function atualizarCampoSelecaoProduto() {
  const select = document.getElementById("produtoCategoria");
  const label = document.getElementById("produtoSaboresLabel");
  if (!select || !label) return;

  const categoria = categoriaPorId(select.value);
  const titulo = categoria?.tituloSelecao || "Escolha uma opção";
  const textoCurto = titulo
    .replace(/^escolha\s+(o|a|um|uma)\s+/i, "")
    .replace(/^selecione\s+(o|a|um|uma)\s+/i, "")
    .trim();

  const nomeCampo = textoCurto ? textoCurto.charAt(0).toUpperCase() + textoCurto.slice(1) : "Opções";

  const input = label.querySelector("input");
  label.firstChild.textContent = `${nomeCampo} `;
  label.querySelector("small").textContent = "separe por vírgula";
  label.appendChild(input);
}

function criarVariacaoAdminItem(variacao = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'variacao-item';
  wrapper.dataset.variacaoId = variacao.id || gerarId(variacao.nome || 'variacao');

  const nomeLabel = document.createElement('label');
  nomeLabel.textContent = 'Nome da variação';
  const nomeInput = document.createElement('input');
  nomeInput.type = 'text';
  nomeInput.dataset.key = 'nome';
  nomeInput.value = variacao.nome || '';
  nomeLabel.appendChild(nomeInput);

  const ingredientesLabel = document.createElement('label');
  ingredientesLabel.className = 'full variacao-ingredientes-label';
  ingredientesLabel.textContent = 'Ingredientes desta opção';

  const ingredientesInput = document.createElement('textarea');
  ingredientesInput.dataset.key = 'ingredientes';
  ingredientesInput.placeholder = 'Ex: frango, milho, temperos';
  ingredientesInput.value = Array.isArray(variacao.ingredientes)
    ? variacao.ingredientes.join(', ')
    : (variacao.ingredientes || '');

  ingredientesLabel.appendChild(ingredientesInput);

  const precoLabel = document.createElement('label');
  precoLabel.textContent = 'Preço';
  const precoInput = document.createElement('input');
  precoInput.type = 'number';
  precoInput.step = '0.01';
  precoInput.dataset.key = 'preco';
  precoInput.value = variacao.preco != null ? variacao.preco : '';
  precoLabel.appendChild(precoInput);

  const estoqueLabel = document.createElement('label');
  estoqueLabel.textContent = 'Estoque';
  const estoqueInput = document.createElement('input');
  estoqueInput.type = 'number';
  estoqueInput.dataset.key = 'estoque';
  estoqueInput.placeholder = 'Opcional';
  estoqueInput.value = variacao.estoque != null ? variacao.estoque : '';
  estoqueLabel.appendChild(estoqueInput);

  const minLabel = document.createElement('label');
  minLabel.textContent = 'Mínimo';
  const minInput = document.createElement('input');
  minInput.type = 'number';
  minInput.dataset.key = 'minimo';
  minInput.value = variacao.minimo != null ? variacao.minimo : 0;
  minLabel.appendChild(minInput);

  const ativaLabel = document.createElement('label');
  ativaLabel.className = 'check';
  const ativaInput = document.createElement('input');
  ativaInput.type = 'checkbox';
  ativaInput.dataset.key = 'ativa';
  ativaInput.checked = variacao.ativa !== false;
  ativaLabel.appendChild(ativaInput);
  ativaLabel.appendChild(document.createTextNode(' Variação ativa'));

  const sobLabel = document.createElement('label');
  sobLabel.className = 'check';
  const sobInput = document.createElement('input');
  sobInput.type = 'checkbox';
  sobInput.dataset.key = 'sob-encomenda';
  sobInput.checked = variacao.sobEncomenda === true;
  sobLabel.appendChild(sobInput);
  sobLabel.appendChild(document.createTextNode(' Sob encomenda'));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const btnRemover = document.createElement('button');
  btnRemover.type = 'button';
  btnRemover.textContent = 'Remover';
  btnRemover.addEventListener('click', () => wrapper.remove());
  actions.appendChild(btnRemover);

  wrapper.appendChild(nomeLabel);
  wrapper.appendChild(ingredientesLabel);
  wrapper.appendChild(precoLabel);
  wrapper.appendChild(estoqueLabel);
  wrapper.appendChild(minLabel);
  wrapper.appendChild(ativaLabel);
  wrapper.appendChild(sobLabel);
  wrapper.appendChild(actions);

  return wrapper;
}

function renderVariacoesAdmin() {
  const container = document.getElementById('variacoesAdminList');
  if (!container) return;
  container.innerHTML = '';

  const variacoes = produtoEditando?.variacoes || [];
  variacoes.forEach(variacao => container.appendChild(criarVariacaoAdminItem(variacao)));
}

function lerVariacoesAdmin() {
  const container = document.getElementById('variacoesAdminList');
  if (!container) return [];

  return Array.from(container.querySelectorAll('.variacao-item')).map(item => {
    const nome = item.querySelector('input[data-key="nome"]').value.trim();
    const preco = Number(item.querySelector('input[data-key="preco"]').value || 0);
    const ingredientes = limparTexto(item.querySelector('[data-key="ingredientes"]')?.value || "")
      .split(",")
      .map(i => limparTexto(i))
      .filter(Boolean);
    const estoqueValor = item.querySelector('input[data-key="estoque"]').value;
    const estoque = estoqueValor === "" ? 0 : Number(estoqueValor || 0);
    const minimo = Number(item.querySelector('input[data-key="minimo"]').value || 0);
    const ativa = item.querySelector('input[data-key="ativa"]').checked;
    const sobEncomenda = item.querySelector('input[data-key="sob-encomenda"]').checked;

    return {
      id: item.dataset.variacaoId || gerarId(nome || 'variacao'),
      nome,
      preco,
      ingredientes,
      estoque,
      minimo,
      ativa,
      sobEncomenda
    };
  }).filter(v => v.nome && v.preco > 0);
}

function abrirModalProduto(id = null) {
  produtoEditando = id ? produtos.find(p => p.id === id) : null;

  preencherSelectCategorias();

  document.getElementById("modalTitulo").textContent = produtoEditando ? "Editar produto" : "Novo produto";
  document.getElementById("produtoNome").value = produtoEditando?.nome || "";
  document.getElementById("produtoCategoria").value = produtoEditando?.categoria || "salgados";
  atualizarCampoSelecaoProduto();
  document.getElementById("produtoPreco").value = produtoEditando?.preco || "";
  document.getElementById("produtoEmoji").value = produtoEditando?.emoji || "";
  document.getElementById("produtoDescricao").value = produtoEditando?.descricao || "";

  const ingredientesEditando = Array.isArray(produtoEditando?.ingredientes)
    ? produtoEditando.ingredientes.join(", ")
    : (produtoEditando?.ingredientes || "");
  const ingredientesCampo = document.getElementById("produtoIngredientes");
  if (ingredientesCampo) ingredientesCampo.value = ingredientesEditando;

  document.getElementById("produtoSabores").value = produtoEditando?.sabores?.join(", ") || "";
  document.getElementById("produtoEstoque").value = produtoEditando?.estoque ?? 40;
  document.getElementById("produtoMinimo").value = produtoEditando?.minimo ?? 5;
  document.getElementById("produtoAtivo").checked = produtoEditando?.ativo ?? true;
  document.getElementById("produtoDestaque").checked = produtoEditando?.destaque ?? false;
  document.getElementById("produtoSobEncomenda").checked = produtoEditando?.sobEncomenda ?? false;

  // imagem preview & file input
  const fileEl = document.getElementById('produtoImagemFile');
  const preview = document.getElementById('produtoImagemPreview');
  if (fileEl) {
    fileEl.value = '';
    fileEl.onchange = () => {
      const f = fileEl.files && fileEl.files[0];
      if (f && preview) preview.src = URL.createObjectURL(f);
    };
  }
  if (preview) preview.src = produtoEditando?.imagem || '';

  renderVariacoesAdmin();

  const btnAdicionar = document.getElementById('btnAdicionarVariacao');
  if (btnAdicionar) {
    btnAdicionar.onclick = () => {
      const lista = document.getElementById('variacoesAdminList');
      if (lista) lista.appendChild(criarVariacaoAdminItem());
    };
  }

  const statusIA = document.getElementById("statusIA");
  if (statusIA) statusIA.textContent = "";

  document.getElementById("modalProduto").classList.add("aberto");
}

function fecharModalProduto() {
  produtoEditando = null;
  document.getElementById("modalProduto").classList.remove("aberto");
}

async function gerarProdutoComIA() {
  const nome = limparTexto(document.getElementById("produtoNome").value);
  const status = document.getElementById("statusIA");

  if (!nome) {
    alert("Digite o nome do produto primeiro.");
    return;
  }

  try {
    status.textContent = "Gerando sugestão...";

    const s = await sugerirProdutoComIA(nome);

    if (s.nome) document.getElementById("produtoNome").value = s.nome;
    if (s.categoria) document.getElementById("produtoCategoria").value = s.categoria;
    if (s.emoji) document.getElementById("produtoEmoji").value = s.emoji;
    if (s.descricao) document.getElementById("produtoDescricao").value = s.descricao;
    if (s.preco) document.getElementById("produtoPreco").value = s.preco;
    if (Array.isArray(s.sabores)) document.getElementById("produtoSabores").value = s.sabores.join(", ");
    if (typeof s.sobEncomenda === "boolean") document.getElementById("produtoSobEncomenda").checked = s.sobEncomenda;
    if (typeof s.destaque === "boolean") document.getElementById("produtoDestaque").checked = s.destaque;

    status.textContent = "Sugestão aplicada. Confira antes de salvar.";
  } catch (erro) {
    console.error(erro);
    status.textContent = "";
    alert("Não foi possível usar a IA agora. Se estiver local, teste pela Vercel com GEMINI_API_KEY configurada.");
  }
}

async function salvarProdutoAdmin() {
  const nome = limparTexto(document.getElementById("produtoNome").value);
  const preco = Number(document.getElementById("produtoPreco").value || 0);

  if (!nome) {
    alert("Digite o nome do produto.");
    return;
  }

  const sabores = limparTexto(document.getElementById("produtoSabores").value)
    .split(",")
    .map(s => limparTexto(s))
    .filter(Boolean);

  const variacoes = lerVariacoesAdmin();

  const ingredientes = limparTexto(document.getElementById("produtoIngredientes")?.value || "")
    .split(",")
    .map(i => limparTexto(i))
    .filter(Boolean);

  if (preco <= 0 && variacoes.length === 0) {
    alert("Digite um preço válido ou adicione variações com preço.");
    return;
  }

  const id = produtoEditando?.id || gerarId(nome);
  const sobEncomenda = document.getElementById("produtoSobEncomenda").checked;

  // montar objeto produto
  const produtoObj = {
    id,
    nome,
    categoria: document.getElementById("produtoCategoria").value,
    preco,
    emoji: document.getElementById("produtoEmoji").value || "🍽️",
    descricao: document.getElementById("produtoDescricao").value || "",
    ingredientes,
    sabores,
    estoque: sobEncomenda ? 0 : Number(document.getElementById("produtoEstoque").value || 0),
    minimo: sobEncomenda ? 0 : Number(document.getElementById("produtoMinimo").value || 0),
    ativo: document.getElementById("produtoAtivo").checked,
    destaque: document.getElementById("produtoDestaque").checked,
    sobEncomenda,
    variacoes,
    ordem: produtoEditando?.ordem || Date.now()
  };

  // upload de imagem se houver arquivo selecionado
  try {
    const fileEl = document.getElementById('produtoImagemFile');
    if (fileEl && fileEl.files && fileEl.files[0]) {
      const file = fileEl.files[0];
      const path = `produtos/${id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-]/g, '_')}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
      produtoObj.imagem = url;
    } else if (produtoEditando?.imagem) {
      produtoObj.imagem = produtoEditando.imagem;
    }
  } catch (err) {
    console.error('Erro ao enviar imagem:', err);
    alert('Falha ao enviar imagem. O produto será salvo sem alteração da imagem.');
  }

  await salvarProduto(produtoObj);
  fecharModalProduto();
}

async function alternarAtivo(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto) return;

  await atualizarProduto(id, { ativo: produto.ativo === false });
}

async function excluirProdutoAdmin(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto) return;

  if (!confirm(`Excluir ${produto.nome}?`)) return;

  await excluirProduto(id);
}

function renderVendaRapida() {
  const box = document.getElementById("listaVendaRapida");
  if (!box) return;

  const busca = (document.getElementById("buscaVenda")?.value || "").toLowerCase();

  box.innerHTML = "";

  produtos
    .filter(p => p.ativo !== false)
    .filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.includes(busca))
    .forEach(p => {
      const item = document.createElement('div'); item.className = 'venda-item';
      const info = document.createElement('div');
      const strong = document.createElement('strong'); strong.textContent = `${p.emoji || '🍽️'} ${p.nome}`; info.appendChild(strong);
      const meta = document.createElement('p'); meta.textContent = `${formatarMoeda(p.preco)} · Estoque: ${p.sobEncomenda ? 'encomenda' : (p.estoque || 0)}`; info.appendChild(meta);
      const btn = document.createElement('button'); btn.textContent = 'Adicionar'; btn.addEventListener('click', () => window.adicionarVendaRapida && window.adicionarVendaRapida(p.id));
      item.appendChild(info); item.appendChild(btn);
      box.appendChild(item);
    });

  renderVendaAtual();
}

function adicionarVendaRapida(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto) return;

  const item = vendaAtual.find(i => i.id === id);

  if (item) item.quantidade++;
  else vendaAtual.push({
    id: produto.id,
    nome: produto.nome,
    preco: produto.preco,
    quantidade: 1,
    estoqueAtual: produto.estoque || 0
  });

  renderVendaAtual();
}

function renderVendaAtual() {
  const box = document.getElementById("itensVendaRapida");
  if (!box) return;

  box.innerHTML = '';

  if (!vendaAtual.length) {
    const p = document.createElement('p'); p.textContent = 'Nenhum item.'; box.appendChild(p);
  }

  vendaAtual.forEach(item => {
    const wrapper = document.createElement('div'); wrapper.className = 'item-venda-atual';
    const left = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = `${item.quantidade}x ${item.nome}`; left.appendChild(strong);
    const meta = document.createElement('p'); meta.textContent = formatarMoeda(item.preco * item.quantidade); left.appendChild(meta);
    const right = document.createElement('div');
    const btnMinus = document.createElement('button'); btnMinus.textContent = '-'; btnMinus.addEventListener('click', () => window.alterarVendaItem && window.alterarVendaItem(item.id, -1));
    const btnPlus = document.createElement('button'); btnPlus.textContent = '+'; btnPlus.addEventListener('click', () => window.alterarVendaItem && window.alterarVendaItem(item.id, 1));
    right.appendChild(btnMinus); right.appendChild(btnPlus);
    wrapper.appendChild(left); wrapper.appendChild(right);
    box.appendChild(wrapper);
  });

  const total = vendaAtual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  document.getElementById("totalVendaRapida").textContent = formatarMoeda(total);
}

function alterarVendaItem(id, valor) {
  const item = vendaAtual.find(i => i.id === id);
  if (!item) return;

  item.quantidade += valor;

  if (item.quantidade <= 0) vendaAtual = vendaAtual.filter(i => i.id !== id);

  renderVendaAtual();
}

function limparVendaRapida() {
  if (!vendaAtual.length) return;

  if (!confirm("Limpar venda atual?")) return;

  vendaAtual = [];
  renderVendaAtual();
}

function finalizarVendaRapida() {
  if (!vendaAtual.length) {
    alert("Adicione pelo menos um produto.");
    return;
  }

  const pagamento = document.getElementById("formaPagamentoVenda").value;
  const observacao = limparTexto(document.getElementById("obsVenda").value);
  const total = vendaAtual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);

  const resumo = document.getElementById('resumoConfirmacaoVenda');
  resumo.innerHTML = '';

  vendaAtual.forEach(item => {
    const wrapper = document.createElement('div'); wrapper.className = 'item-venda-atual';
    const left = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = `${item.quantidade}x ${item.nome}`; left.appendChild(strong);
    const meta = document.createElement('p'); meta.textContent = formatarMoeda(item.preco * item.quantidade); left.appendChild(meta);
    wrapper.appendChild(left);
    resumo.appendChild(wrapper);
  });

  const confirmTotal = document.createElement('div'); confirmTotal.className = 'confirm-total';
  const pPag = document.createElement('p'); const sPag = document.createElement('strong'); sPag.textContent = 'Pagamento:'; pPag.appendChild(sPag); pPag.appendChild(document.createTextNode(' ' + pagamento)); confirmTotal.appendChild(pPag);
  if (observacao) { const pObs = document.createElement('p'); const sObs = document.createElement('strong'); sObs.textContent = 'Observação:'; pObs.appendChild(sObs); pObs.appendChild(document.createTextNode(' ' + observacao)); confirmTotal.appendChild(pObs); }
  const pTotal = document.createElement('p'); const sTotal = document.createElement('strong'); sTotal.textContent = 'Total:'; pTotal.appendChild(sTotal); pTotal.appendChild(document.createTextNode(' ' + formatarMoeda(total))); confirmTotal.appendChild(pTotal);
  resumo.appendChild(confirmTotal);

  document.getElementById("modalConfirmarVenda").classList.add("aberto");
}

function fecharConfirmacaoVenda() {
  document.getElementById("modalConfirmarVenda").classList.remove("aberto");
}

async function confirmarFinalizacaoVenda() {
  const pagamento = document.getElementById("formaPagamentoVenda").value;
  const observacao = limparTexto(document.getElementById("obsVenda").value);
  const total = vendaAtual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);

  await registrarVendaRapida({ itens: vendaAtual, pagamento, total, observacao });

  fecharConfirmacaoVenda();

  const msg = document.getElementById('mensagemVenda');
  msg.style.display = 'block';
  msg.innerHTML = '';
  const strong = document.createElement('strong'); strong.textContent = 'Venda registrada!'; msg.appendChild(strong);
  msg.appendChild(document.createElement('br'));
  msg.appendChild(document.createTextNode('Total: ' + formatarMoeda(total)));
  msg.appendChild(document.createElement('br'));
  msg.appendChild(document.createTextNode('Pagamento: ' + pagamento));
  msg.appendChild(document.createElement('br'));
  msg.appendChild(document.createTextNode('Estoque descontado automaticamente.'));

  vendaAtual = [];
  document.getElementById("obsVenda").value = "";
  renderVendaAtual();
}

function renderCaixa() {
  const box = document.getElementById("resumoCaixa");
  const hist = document.getElementById("historicoVendas");

  if (!box || !hist) return;

  const resumo = resumoCaixa(vendasHoje);

  box.innerHTML = '';
  const keys = ['Pix', 'Dinheiro', 'Cartão débito', 'Cartão crédito'];
  keys.forEach(k => {
    const card = document.createElement('div'); card.className = 'caixa-card';
    const span = document.createElement('span'); span.textContent = k; card.appendChild(span);
    const strong = document.createElement('strong'); strong.textContent = formatarMoeda(resumo[k] || 0); card.appendChild(strong);
    box.appendChild(card);
  });
  const totalCard = document.createElement('div'); totalCard.className = 'caixa-card'; totalCard.appendChild(Object.assign(document.createElement('span'), { textContent: 'Total' })); totalCard.appendChild(Object.assign(document.createElement('strong'), { textContent: formatarMoeda(resumo.Total) })); box.appendChild(totalCard);
  const vendasCard = document.createElement('div'); vendasCard.className = 'caixa-card'; vendasCard.appendChild(Object.assign(document.createElement('span'), { textContent: 'Vendas' })); vendasCard.appendChild(Object.assign(document.createElement('strong'), { textContent: resumo.Quantidade })); box.appendChild(vendasCard);

  hist.innerHTML = '';

  if (!vendasHoje.length) {
    const p = document.createElement('p'); p.textContent = 'Nenhuma venda registrada hoje.'; hist.appendChild(p);
  }

  vendasHoje.forEach(venda => {
    const itens = (venda.itens || []).map(i => `${i.quantidade}x ${i.nome}`).join(', ');
    const wrapper = document.createElement('div'); wrapper.className = 'venda-historico';
    const strong = document.createElement('strong'); strong.textContent = `${venda.hora || '--:--'} - ${formatarMoeda(venda.total)}`; wrapper.appendChild(strong);
    const small1 = document.createElement('small'); small1.textContent = itens; wrapper.appendChild(small1);
    const small2 = document.createElement('small'); small2.textContent = venda.pagamento + (venda.observacao ? ' · ' + venda.observacao : ''); wrapper.appendChild(small2);
    const actions = document.createElement('div'); actions.className = 'venda-historico-actions';
    const btn = document.createElement('button'); btn.className = 'delete-venda'; btn.textContent = 'Apagar venda'; btn.addEventListener('click', () => window.excluirVendaDoHistorico && window.excluirVendaDoHistorico(venda.id));
    actions.appendChild(btn); wrapper.appendChild(actions);
    hist.appendChild(wrapper);
  });
}

async function excluirVendaDoHistorico(id) {
  const venda = vendasHoje.find(v => v.id === id);

  if (!venda) {
    alert("Venda não encontrada.");
    return;
  }

  const itens = (venda.itens || []).map(i => `${i.quantidade}x ${i.nome}`).join(", ");

  const confirmou = confirm(
    `Apagar esta venda?\n\n${itens}\nTotal: ${formatarMoeda(venda.total)}\nPagamento: ${venda.pagamento}\n\nO estoque será restaurado para o valor anterior à venda.`
  );

  if (!confirmou) return;

  await excluirVendaComEstorno(venda);
  alert("Venda apagada e estoque restaurado.");
}

function preencherSelectProdutosPromocao() {
  const select = document.getElementById("promoProduto");
  if (!select) return;
  select.innerHTML = '';

  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '-- Selecione um produto (ou deixe em branco para aplicar por categoria) --';
  select.appendChild(noneOpt);

  produtos
    .filter(p => p.ativo !== false)
    .forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.emoji || '🍽️'} ${p.nome} - ${formatarMoeda(p.preco)}`;
      select.appendChild(opt);
    });
}

function abrirModalPromocao(id = null) {
  promocaoEditando = id ? promocoes.find(p => p.id === id) : null;

  preencherSelectProdutosPromocao();

  document.getElementById("modalTituloPromocao").textContent = promocaoEditando ? "Editar promoção" : "Nova promoção";
  document.getElementById("promoTitulo").value = promocaoEditando?.titulo || "";
  document.getElementById("promoAtiva").value = String(promocaoEditando?.ativa ?? true);
  document.getElementById("promoProduto").value = promocaoEditando?.produtoId || "";
  document.getElementById("promoCategoria").value = promocaoEditando?.categoria || "";
  document.getElementById("promoVariacao").value = promocaoEditando?.variacaoId || "";
  document.getElementById("promoPreco").value = promocaoEditando?.precoPromocional || "";
  document.getElementById("promoDescricao").value = promocaoEditando?.descricao || "";
  document.getElementById("promoInicio").value = promocaoEditando?.inicio || "";
  document.getElementById("promoFim").value = promocaoEditando?.fim || "";

  document.getElementById("modalPromocao").classList.add("aberto");
}

function fecharModalPromocao() {
  promocaoEditando = null;
  document.getElementById("modalPromocao").classList.remove("aberto");
}

async function salvarPromocaoAdmin() {
  const titulo = limparTexto(document.getElementById("promoTitulo").value);
  const produtoId = document.getElementById("promoProduto").value;
  const categoria = document.getElementById("promoCategoria").value;
  const variacaoId = document.getElementById("promoVariacao").value;
  const precoPromocional = Number(document.getElementById("promoPreco").value || 0);
  const produto = produtos.find(p => p.id === produtoId);

  if (!titulo) {
    alert("Digite o título da promoção.");
    return;
  }

  if (!produtoId && !categoria) {
    alert("Escolha um produto ou uma categoria.");
    return;
  }

  if (variacaoId && !produtoId) {
    alert("Selecione um produto antes da variação.");
    return;
  }

  if (precoPromocional <= 0) {
    alert("Digite um preço promocional válido.");
    return;
  }

  const id = promocaoEditando?.id || gerarId(titulo);
  const variacaoOriginal = produto?.variacoes?.find(v => v.id === variacaoId);
  const precoOriginal = variacaoOriginal ? Number(variacaoOriginal.preco || produto.preco) : Number(produto?.preco || 0);

  await salvarPromocao({
    id,
    titulo,
    produtoId: produtoId || null,
    categoria: categoria || null,
    variacaoId: variacaoId || null,
    produtoNome: produto?.nome || null,
    produtoEmoji: produto?.emoji || "🍽️",
    precoOriginal,
    precoPromocional,
    descricao: limparTexto(document.getElementById("promoDescricao").value),
    inicio: document.getElementById("promoInicio").value,
    fim: document.getElementById("promoFim").value,
    ativa: document.getElementById("promoAtiva").value === "true",
    criadoEm: promocaoEditando?.criadoEm || null
  });

  fecharModalPromocao();
}

function renderPromocoesAdmin() {
  const box = document.getElementById("listaPromocoes");
  if (!box) return;

  box.innerHTML = "";

  if (!promocoes.length) {
    const p = document.createElement('p'); p.textContent = 'Nenhuma promoção cadastrada ainda.'; box.appendChild(p); return;
  }

  promocoes.forEach(promo => {
    const card = createPromoAdminCard(promo, formatarMoeda);
    box.appendChild(card);
  });
}

async function alternarPromocao(id) {
  const promo = promocoes.find(p => p.id === id);
  if (!promo) return;

  await atualizarPromocao(id, { ativa: !promo.ativa });
}

async function excluirPromocaoAdmin(id) {
  const promo = promocoes.find(p => p.id === id);
  if (!promo) return;

  if (!confirm(`Excluir a promoção "${promo.titulo}"?`)) return;

  await excluirPromocao(id);
}
const diasAtendimento = [
  { id: "segunda", nome: "Segunda" },
  { id: "terca", nome: "Terça" },
  { id: "quarta", nome: "Quarta" },
  { id: "quinta", nome: "Quinta" },
  { id: "sexta", nome: "Sexta" },
  { id: "sabado", nome: "Sábado" },
  { id: "domingo", nome: "Domingo" }
];

let timerSalvarHorarios = null;

function renderHorariosAtendimento() {
  const box = document.getElementById("horariosAtendimento");
  if (!box) return;

  box.innerHTML = "";

  const horarios = lojaConfig.horariosAtendimento || {};

  diasAtendimento.forEach(dia => {
    const configDia = horarios[dia.id] || {
      fechado: false,
      periodos: [
        { inicio: "", fim: "" },
        { inicio: "", fim: "" }
      ]
    };

    const fechado = configDia.fechado === true;
    const periodos = configDia.periodos || [];

    box.innerHTML += `
      <div class="horario-dia">
        <div class="horario-dia-top">
          <strong>${dia.nome}</strong>
          <button type="button" class="secondary-btn" onclick="copiarHorarioParaTodos('${dia.id}')">Copiar para todos</button>
          <label class="check">
            <input type="checkbox" id="horario-${dia.id}-fechado" ${fechado ? "checked" : ""}>
            Fechado
          </label>
        </div>

        <div class="horario-periodos">
          <label>Início 1
            <input type="time" id="horario-${dia.id}-inicio-1" value="${periodos[0]?.inicio || ""}">
          </label>

          <label>Fim 1
            <input type="time" id="horario-${dia.id}-fim-1" value="${periodos[0]?.fim || ""}">
          </label>

          <label>Início 2
            <input type="time" id="horario-${dia.id}-inicio-2" value="${periodos[1]?.inicio || ""}">
          </label>

          <label>Fim 2
            <input type="time" id="horario-${dia.id}-fim-2" value="${periodos[1]?.fim || ""}">
          </label>
        </div>
      </div>
    `;
  });
}

function coletarHorariosAtendimento() {
  const horarios = {};

  diasAtendimento.forEach(dia => {
    const fechado = document.getElementById(`horario-${dia.id}-fechado`)?.checked || false;

    const inicio1 = document.getElementById(`horario-${dia.id}-inicio-1`)?.value || "";
    const fim1 = document.getElementById(`horario-${dia.id}-fim-1`)?.value || "";
    const inicio2 = document.getElementById(`horario-${dia.id}-inicio-2`)?.value || "";
    const fim2 = document.getElementById(`horario-${dia.id}-fim-2`)?.value || "";

    const periodos = [];

    if (inicio1 && fim1) periodos.push({ inicio: inicio1, fim: fim1 });
    if (inicio2 && fim2) periodos.push({ inicio: inicio2, fim: fim2 });

    horarios[dia.id] = {
      fechado,
      periodos
    };
  });

  return horarios;
}

function aplicarHorarioDeUmDiaParaTodos(diaOrigem) {
  const inicio1 = document.getElementById(`horario-${diaOrigem}-inicio-1`)?.value || "";
  const fim1 = document.getElementById(`horario-${diaOrigem}-fim-1`)?.value || "";
  const inicio2 = document.getElementById(`horario-${diaOrigem}-inicio-2`)?.value || "";
  const fim2 = document.getElementById(`horario-${diaOrigem}-fim-2`)?.value || "";
  const fechado = document.getElementById(`horario-${diaOrigem}-fechado`)?.checked || false;

  diasAtendimento.forEach(dia => {
    document.getElementById(`horario-${dia.id}-inicio-1`).value = inicio1;
    document.getElementById(`horario-${dia.id}-fim-1`).value = fim1;
    document.getElementById(`horario-${dia.id}-inicio-2`).value = inicio2;
    document.getElementById(`horario-${dia.id}-fim-2`).value = fim2;
    document.getElementById(`horario-${dia.id}-fechado`).checked = fechado;
  });

  salvarHorariosAutomaticamente();
}

function copiarHorarioParaTodos(diaOrigem) {
  aplicarHorarioDeUmDiaParaTodos(diaOrigem);
}

function copiarSegundaParaTodos() {
  aplicarHorarioDeUmDiaParaTodos("segunda");
}

function salvarHorariosAutomaticamente() {
  clearTimeout(timerSalvarHorarios);

  const status = document.getElementById("statusHorarioAuto");
  if (status) status.textContent = "Salvando horários...";

  timerSalvarHorarios = setTimeout(async () => {
    try {
      const horarios = coletarHorariosAtendimento();

      await salvarConfiguracoes({
        ...lojaConfig,
        horariosAtendimento: horarios
      });

      lojaConfig.horariosAtendimento = horarios;

      if (status) status.textContent = "✅ Horários salvos automaticamente";
    } catch (erro) {
      console.error("Erro ao salvar horários:", erro);
      if (status) status.textContent = "❌ Erro ao salvar horários";
    }
  }, 700);
}

function preencherConfiguracoesLoja() {
  const campos = {
    configNomeLoja: lojaConfig.nomeLoja || "Delícias da Vó",
    configSlogan: lojaConfig.slogan || "Feito com carinho",
    configInstagram: lojaConfig.instagram || "@deliciasda_vo",
    configWhatsapp: lojaConfig.whatsapp || "5518991178906",
    configEndereco: lojaConfig.endereco || "",
    configHorario: lojaConfig.horario || "",
    configEntrega: lojaConfig.entrega || "Taxa conforme distância",
    configRetirada: lojaConfig.retirada || "Retirada na loja",
    configStatusLoja: lojaConfig.statusLoja || "aberta",
    cardapioDiaTituloInput: lojaConfig.cardapioDia?.titulo || "Cardápio de hoje",
    cardapioDiaItensInput: Array.isArray(lojaConfig.cardapioDia?.itens) ? lojaConfig.cardapioDia.itens.join("\n") : "",
    cardapioDiaObsInput: lojaConfig.cardapioDia?.observacao || "Disponível enquanto durar",
  };

  Object.entries(campos).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  });

  const cardapioAtivo = document.getElementById("cardapioDiaAtivo");
  if (cardapioAtivo) cardapioAtivo.checked = lojaConfig.cardapioDia?.ativo === true;

  renderHorariosAtendimento();
}

async function salvarConfiguracoesLoja() {
  const dados = {
    nomeLoja: limparTexto(document.getElementById("configNomeLoja").value) || "Delícias da Vó",
    slogan: limparTexto(document.getElementById("configSlogan").value),
    instagram: limparTexto(document.getElementById("configInstagram").value),
    whatsapp: limparTexto(document.getElementById("configWhatsapp").value) || "5518991178906",
    endereco: limparTexto(document.getElementById("configEndereco").value),
    horario: limparTexto(document.getElementById("configHorario").value),
    entrega: limparTexto(document.getElementById("configEntrega").value),
    retirada: limparTexto(document.getElementById("configRetirada").value),
   statusLoja: document.getElementById("configStatusLoja").value,
horariosAtendimento: coletarHorariosAtendimento(),
    cardapioDia: {
      ativo: document.getElementById("cardapioDiaAtivo")?.checked || false,
      titulo: limparTexto(document.getElementById("cardapioDiaTituloInput")?.value) || "Cardápio de hoje",
      itens: (document.getElementById("cardapioDiaItensInput")?.value || "")
        .split("\n")
        .map(item => limparTexto(item))
        .filter(Boolean),
      observacao: limparTexto(document.getElementById("cardapioDiaObsInput")?.value) || ""
    }
  };

  await salvarConfiguracoes(dados);

  const status = document.getElementById('statusConfig');
  status.style.display = 'block';
  status.innerHTML = '';
  const sStrong = document.createElement('strong'); sStrong.textContent = 'Configurações salvas!'; status.appendChild(sStrong);
  status.appendChild(document.createElement('br'));
  status.appendChild(document.createTextNode('As alterações serão usadas no sistema.'));  
  setTimeout(() => status.style.display = 'none', 4000);
}
window.criarProdutosBase = criarProdutosBase;
window.iniciarAdminDepoisLogin = iniciarAdminDepoisLogin;
window.abrirAba = abrirAba;
window.abrirAbaPorNome = abrirAbaPorNome;
window.renderProdutosAdmin = renderProdutosAdmin;
window.abrirModalProduto = abrirModalProduto;
window.fecharModalProduto = fecharModalProduto;
window.gerarProdutoComIA = gerarProdutoComIA;
window.salvarProdutoAdmin = salvarProdutoAdmin;
window.alternarAtivo = alternarAtivo;
window.excluirProdutoAdmin = excluirProdutoAdmin;
window.renderVendaRapida = renderVendaRapida;
window.adicionarVendaRapida = adicionarVendaRapida;
window.alterarVendaItem = alterarVendaItem;
window.limparVendaRapida = limparVendaRapida;
window.finalizarVendaRapida = finalizarVendaRapida;
window.fecharConfirmacaoVenda = fecharConfirmacaoVenda;
window.confirmarFinalizacaoVenda = confirmarFinalizacaoVenda;
window.excluirVendaDoHistorico = excluirVendaDoHistorico;
window.abrirModalPromocao = abrirModalPromocao;
window.fecharModalPromocao = fecharModalPromocao;
window.salvarPromocaoAdmin = salvarPromocaoAdmin;
window.renderPromocoesAdmin = renderPromocoesAdmin;
window.alternarPromocao = alternarPromocao;
window.excluirPromocaoAdmin = excluirPromocaoAdmin;
window.abrirModalCategoria = abrirModalCategoria;
window.fecharModalCategoria = fecharModalCategoria;
window.salvarCategoriaAdmin = salvarCategoriaAdmin;
window.atualizarCampoSelecaoProduto = atualizarCampoSelecaoProduto;
window.salvarConfiguracoesLoja = salvarConfiguracoesLoja;
window.copiarHorarioParaTodos = copiarHorarioParaTodos;
window.copiarSegundaParaTodos = copiarSegundaParaTodos;


function renderFestasAdmin(erro = null) {
  const box = document.getElementById("listaFestaAdmin");
  if (!box) return;

  const busca = (document.getElementById("buscaFestaAdmin")?.value || "").trim().toLowerCase();
  const filtro = document.getElementById("filtroFestaAdmin")?.value || "todos";

  const lista = [...salgadosFesta]
    .sort((a, b) => Number(a.ordem || 99) - Number(b.ordem || 99) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
    .filter((p) => {
      const texto = `${p.nome || ""} ${(p.sabores || []).join(" ")} ${p.descricao || ""}`.toLowerCase();
      const correspondeBusca = !busca || texto.includes(busca);
      const correspondeFiltro =
        filtro === "todos" ||
        (filtro === "fritos" && p.categoria !== "assados") ||
        (filtro === "assados" && p.categoria === "assados") ||
        (filtro === "ativos" && p.ativo !== false) ||
        (filtro === "inativos" && p.ativo === false);
      return correspondeBusca && correspondeFiltro;
    });

  const total = salgadosFesta.length;
  const ativos = salgadosFesta.filter((p) => p.ativo !== false).length;
  const fritos = salgadosFesta.filter((p) => p.categoria !== "assados").length;
  const assados = salgadosFesta.filter((p) => p.categoria === "assados").length;
  const resumo = {
    festaTotalProdutos: total,
    festaTotalAtivos: ativos,
    festaTotalFritos: fritos,
    festaTotalAssados: assados,
  };
  Object.entries(resumo).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  });

  box.innerHTML = "";

  if (!lista.length) {
    const vazio = document.createElement("div");
    vazio.className = "festas-empty-state";
    vazio.innerHTML = `<span>🥟</span><strong>Nenhum produto encontrado</strong><p>Tente mudar a pesquisa ou o filtro selecionado.</p>`;
    box.appendChild(vazio);
  }

  lista.forEach((p) => {
    const ativo = p.ativo !== false;
    const assado = p.categoria === "assados";
    const sabores = Array.isArray(p.sabores) ? p.sabores : [];

    const card = document.createElement("article");
    card.className = `festa-admin-card ${ativo ? "is-active" : "is-inactive"}`;

    const topo = document.createElement("div");
    topo.className = "festa-card-top";

    const identidade = document.createElement("div");
    identidade.className = "festa-identidade";
    identidade.innerHTML = `
      <span class="festa-emoji">${p.emoji || "🥟"}</span>
      <div>
        <h3>${p.nome || "Produto sem nome"}</h3>
        <div class="festa-badges">
          <span class="festa-tipo ${assado ? "tipo-assado" : "tipo-frito"}">${assado ? "🔥 Assado" : "🍳 Frito"}</span>
          <span class="festa-status ${ativo ? "status-ativo" : "status-inativo"}">${ativo ? "● Ativo" : "● Inativo"}</span>
          <span class="festa-origem ${p.__origem === "firestore" ? "origem-firestore" : "origem-codigo"}">${p.__origem === "firestore" ? "☁️ Salvo no Firestore" : "💻 Somente no código"}</span>
        </div>
      </div>`;

    const ordem = document.createElement("span");
    ordem.className = "festa-ordem";
    ordem.title = "Ordem de exibição";
    ordem.textContent = `#${Number(p.ordem || 99)}`;
    topo.append(identidade, ordem);

    const conteudo = document.createElement("div");
    conteudo.className = "festa-card-content";

    if (p.descricao) {
      const descricao = document.createElement("p");
      descricao.className = "festa-descricao";
      descricao.textContent = p.descricao;
      conteudo.appendChild(descricao);
    }

    const quantidadeInfo = document.createElement("div");
    quantidadeInfo.className = "festa-quantidade-info";
    quantidadeInfo.innerHTML = `<span>📦 A partir de <b>${Number(p.quantidadeInicial || 50)}</b></span><span>➕ De <b>${Number(p.incrementoQuantidade || 50)} em ${Number(p.incrementoQuantidade || 50)}</b></span><span>🔢 Até <b>${Number(p.quantidadeMaxima || 500)}</b></span>`;
    conteudo.appendChild(quantidadeInfo);

    const tituloSabores = document.createElement("span");
    tituloSabores.className = "festa-sabores-titulo";
    tituloSabores.textContent = sabores.length ? `${sabores.length} sabor(es)` : "Sem sabores cadastrados";
    conteudo.appendChild(tituloSabores);

    if (sabores.length) {
      const chips = document.createElement("div");
      chips.className = "festa-sabores";
      sabores.forEach((sabor) => {
        const chip = document.createElement("span");
        chip.textContent = sabor;
        chips.appendChild(chip);
      });
      conteudo.appendChild(chips);
    }

    const acoes = document.createElement("div");
    acoes.className = "festa-card-actions";

    const editar = document.createElement("button");
    editar.className = "festa-btn festa-btn-editar";
    editar.innerHTML = "✏️ <span>Editar</span>";
    editar.onclick = () => abrirModalFesta(p.id);

    const alternar = document.createElement("button");
    alternar.className = `festa-btn ${ativo ? "festa-btn-desativar" : "festa-btn-ativar"}`;
    alternar.innerHTML = ativo ? "⏸️ <span>Desativar</span>" : "▶️ <span>Ativar</span>";
    alternar.onclick = async () => {
      try {
        await salvarSalgadoFesta({ ...p, ativo: !ativo });
      } catch (e) {
        console.error(e);
        alert(descreverErroFirestore(e));
      }
    };

    const excluir = document.createElement("button");
    excluir.className = "festa-btn festa-btn-excluir";
    excluir.innerHTML = "🗑️ <span>Excluir</span>";
    excluir.onclick = async () => {
      if (!confirm(`Excluir ${p.nome}? Esta ação não pode ser desfeita.`)) return;
      try {
        await excluirSalgadoFesta(p.id);
      } catch (e) {
        console.error(e);
        alert(descreverErroFirestore(e));
      }
    };

    acoes.append(editar, alternar, excluir);
    card.append(topo, conteudo, acoes);
    box.appendChild(card);
  });

  const st = document.getElementById("statusFestaAdmin");
  if (st) {
    st.innerHTML = erro
      ? `<span>⚠️</span><div><strong>Não foi possível acessar o Firestore</strong><p>${descreverErroFirestore(erro)} Os produtos padrão continuam aparecendo no site.</p></div>`
      : "";
    st.style.display = erro ? "flex" : "none";
  }
}
function abrirModalFesta(id = null) {
  festaEditando = salgadosFesta.find(p => p.id === id) || null;
  document.getElementById("tituloModalFesta").textContent = festaEditando ? "Editar salgado para festa" : "Novo salgado para festa";
  document.getElementById("festaNome").value = festaEditando?.nome || "";
  document.getElementById("festaEmoji").value = festaEditando?.emoji || "🥟";
  document.getElementById("festaCategoria").value = festaEditando?.categoria || "fritos";
  document.getElementById("festaOrdem").value = Number(festaEditando?.ordem ?? 99);
  document.getElementById("festaQuantidadeInicial").value = Number(festaEditando?.quantidadeInicial ?? 50);
  document.getElementById("festaIncrementoQuantidade").value = Number(festaEditando?.incrementoQuantidade ?? 50);
  document.getElementById("festaQuantidadeMaxima").value = Number(festaEditando?.quantidadeMaxima ?? 500);

  const regraPreco = normalizarPrecoFesta(festaEditando || {
    nome: document.getElementById("festaNome").value,
    categoria: document.getElementById("festaCategoria").value
  });
  const ehEmpadinha = String(festaEditando?.nome || "").toLowerCase().includes("empad");
  document.getElementById("festaTipoPreco").value = ehEmpadinha ? "unitario" : regraPreco.tipoPreco;
  document.getElementById("festaPrecoCento").value = Number(regraPreco.precoCento || (festaEditando?.categoria === "assados" ? 80 : 75));
  document.getElementById("festaPrecoUnitario").value = Number(regraPreco.precoUnitario || 1.50);
  atualizarCamposPrecoFesta();

  document.getElementById("festaDescricao").value = festaEditando?.descricao || "";
  document.getElementById("festaSabores").value = (festaEditando?.sabores || []).join(", ");
  document.getElementById("festaAtivo").checked = festaEditando?.ativo !== false;
  document.getElementById("modalFesta").classList.add("aberto");
}
function fecharModalFesta() {
  document.getElementById("modalFesta").classList.remove("aberto");
  festaEditando = null;
}
async function salvarFestaAdmin() {
  const nome = limparTexto(document.getElementById("festaNome").value);
  if (!nome) return alert("Digite o nome do produto.");

  const quantidadeInicial = Number(document.getElementById("festaQuantidadeInicial").value || 50);
  const incrementoQuantidade = Number(document.getElementById("festaIncrementoQuantidade").value || 50);
  const quantidadeMaxima = Number(document.getElementById("festaQuantidadeMaxima").value || 500);

  if (quantidadeInicial < 50 || quantidadeInicial % 50 !== 0) return alert("A quantidade inicial deve ser no mínimo 50 e sempre múltipla de 50.");
  if (incrementoQuantidade < 50 || incrementoQuantidade % 50 !== 0) return alert("O aumento precisa ser de 50 em 50 ou outro múltiplo de 50.");
  if (quantidadeMaxima < quantidadeInicial) return alert("A quantidade máxima não pode ser menor que a quantidade inicial.");

  const tipoPreco = document.getElementById("festaTipoPreco").value;
  const precoCento = Number(document.getElementById("festaPrecoCento").value || 0);
  const precoUnitario = Number(document.getElementById("festaPrecoUnitario").value || 0);

  if (tipoPreco === "cento" && precoCento <= 0) return alert("Digite o valor de 100 unidades.");
  if (tipoPreco === "unitario" && precoUnitario <= 0) return alert("Digite o valor de cada unidade.");

  const item = {
    id: festaEditando?.id || gerarId("festa-" + nome),
    nome,
    emoji: limparTexto(document.getElementById("festaEmoji").value) || "🥟",
    categoria: document.getElementById("festaCategoria").value,
    ordem: Number(document.getElementById("festaOrdem").value || 99),
    quantidadeInicial,
    incrementoQuantidade,
    quantidadeMaxima,
    tipoPreco,
    precoCento: tipoPreco === "cento" ? precoCento : 0,
    precoUnitario: tipoPreco === "unitario" ? precoUnitario : 0,
    descricao: limparTexto(document.getElementById("festaDescricao").value),
    sabores: document.getElementById("festaSabores").value.split(",").map(limparTexto).filter(Boolean),
    ativo: document.getElementById("festaAtivo").checked
  };

  try {
    await salvarSalgadoFesta(item);
    fecharModalFesta();
  } catch (e) {
    console.error(e);
    alert(descreverErroFirestore(e));
  }
}
async function migrarFestasParaFirestore() {
  const botao = document.getElementById("btnMigrarFestas");
  const retorno = document.getElementById("retornoMigracaoFestas");
  if (!confirm("Enviar os 7 produtos padrão para o Firestore? Eles serão criados ou atualizados sem duplicar.")) return;
  try {
    if (botao) { botao.disabled = true; botao.textContent = "⏳ Enviando..."; }
    if (retorno) { retorno.className = "festas-migracao-retorno"; retorno.textContent = "Enviando produtos para o banco..."; }
    const total = await enviarProdutosBaseParaFirestore();
    if (retorno) { retorno.className = "festas-migracao-retorno sucesso"; retorno.textContent = `✅ ${total} produtos salvos no Firestore. Agora todos podem ser editados normalmente.`; }
  } catch (e) {
    console.error(e);
    if (retorno) { retorno.className = "festas-migracao-retorno erro"; retorno.textContent = `❌ ${descreverErroFirestore(e)}`; }
    alert(descreverErroFirestore(e));
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = "☁️ Enviar produtos atuais para o Firestore"; }
  }
}
window.abrirModalFesta=abrirModalFesta;window.fecharModalFesta=fecharModalFesta;window.salvarFestaAdmin=salvarFestaAdmin;window.migrarFestasParaFirestore=migrarFestasParaFirestore;


const STATUS_ENCOMENDA = {
  aguardando_confirmacao: ["Aguardando confirmação", "novo"],
  confirmado: ["Confirmado", "confirmado"],
  em_producao: ["Em produção", "producao"],
  pronto: ["Pronto", "pronto"],
  entregue: ["Entregue", "entregue"]
};

function dataEncomenda(valor) {
  if (!valor) return "Data não informada";
  const partes = String(valor).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor;
}
function dataHoraPedido(p) {
  const d = p.criadoEm?.toDate?.() || new Date(p.criadoEmMs || Date.now());
  return d.toLocaleString("pt-BR");
}
function renderNotificacoesEncomendas() {
  const novas = encomendasFesta.filter(p => !p.visualizado);
  const badge = document.getElementById("badgeEncomendas");
  if (badge) { badge.textContent = novas.length; badge.hidden = novas.length === 0; }
  const stat = document.getElementById("statNovasEncomendas");
  const sub = document.getElementById("statProximaFesta");
  if (stat) stat.textContent = novas.length;
  if (sub) sub.textContent = novas[0] ? `${novas[0].cliente?.nome || "Cliente"} • festa em ${dataEncomenda(novas[0].dataFesta)}` : "Nenhuma nova encomenda";
}
function renderAgendaEncomendas(erro = null) {
  const box = document.getElementById("listaAgendaEncomendas");
  if (!box) return;
  const busca = (document.getElementById("buscaEncomenda")?.value || "").toLowerCase();
  const filtro = document.getElementById("filtroEncomenda")?.value || "todos";
  const lista = encomendasFesta.filter(p => {
    const texto = `${p.numero} ${p.cliente?.nome || ""} ${(p.itens||[]).map(i=>`${i.nome} ${i.sabor}`).join(" ")}`.toLowerCase();
    return (!busca || texto.includes(busca)) && (filtro === "todos" || p.status === filtro);
  });
  const cont = st => encomendasFesta.filter(p=>p.status===st).length;
  document.getElementById("agendaNovas").textContent = cont("aguardando_confirmacao");
  document.getElementById("agendaConfirmadas").textContent = cont("confirmado");
  document.getElementById("agendaProducao").textContent = cont("em_producao");
  document.getElementById("agendaProntas").textContent = cont("pronto");
  const statusBox = document.getElementById("statusAgendaEncomendas");
  if (statusBox) { statusBox.style.display = erro ? "flex" : "none"; statusBox.textContent = erro ? "Não foi possível carregar as encomendas agora." : ""; }
  if (!lista.length) {
    box.innerHTML = '<div class="agenda-vazia">📭<strong>Nenhuma encomenda encontrada</strong><span>Os pedidos enviados pelo site aparecerão aqui.</span></div>';
    return;
  }
  box.innerHTML = lista.map(p => {
    const [rotulo, classe] = STATUS_ENCOMENDA[p.status] || STATUS_ENCOMENDA.aguardando_confirmacao;
    const total = Number(p.totalEstimado || 0);
    return `<article class="agenda-card ${!p.visualizado ? "nao-lida" : ""}">
      <div class="agenda-card-topo">
        <div><span class="agenda-numero">${p.numero || p.id}</span><h3>${p.cliente?.nome || "Cliente"}</h3><small>Recebido em ${dataHoraPedido(p)}</small></div>
        <span class="agenda-status ${classe}">${rotulo}</span>
      </div>
      <div class="agenda-info-grid">
        <div><span>📅 Data da festa</span><strong>${dataEncomenda(p.dataFesta)}</strong></div>
        <div><span>📱 WhatsApp</span><strong>${p.cliente?.telefone || "Não informado"}</strong></div>
        <div><span>🧺 Total</span><strong>${p.totalUnidades || 0} unidades</strong></div>
        <div><span>💰 Estimativa</span><strong>${total > 0 ? formatarMoeda(total) : "Sob consulta"}</strong></div>
      </div>
      <div class="agenda-itens">${(p.itens||[]).map(i=>`<div><span>${i.emoji || "🥟"} ${i.nome} — ${i.sabor}</span><strong>${i.quantidade}</strong></div>`).join("")}</div>
      ${p.observacoes ? `<p class="agenda-observacao"><b>Observações:</b> ${p.observacoes}</p>` : ""}
      <div class="agenda-acoes">
        <select onchange="alterarStatusEncomenda('${p.id}', this.value)">
          ${Object.entries(STATUS_ENCOMENDA).map(([valor,d])=>`<option value="${valor}" ${p.status===valor?"selected":""}>${d[0]}</option>`).join("")}
        </select>
        ${!p.visualizado ? `<button class="secondary-btn" onclick="visualizarEncomenda('${p.id}')">✓ Marcar como vista</button>` : ""}
      </div>
    </article>`;
  }).join("");
}
async function alterarStatusEncomenda(id, status) {
  try { await atualizarStatusEncomendaFesta(id, status); }
  catch(e) { console.error(e); alert("Não foi possível atualizar o status."); }
}
async function visualizarEncomenda(id) {
  try { await marcarEncomendaVisualizada(id); }
  catch(e) { console.error(e); alert("Não foi possível marcar a encomenda como vista."); }
}
window.renderAgendaEncomendas=renderAgendaEncomendas;
window.alterarStatusEncomenda=alterarStatusEncomenda;
window.visualizarEncomenda=visualizarEncomenda;


function atualizarCamposPrecoFesta() {
  const tipo = document.getElementById("festaTipoPreco")?.value || "cento";
  const campoCento = document.getElementById("campoFestaPrecoCento");
  const campoUnitario = document.getElementById("campoFestaPrecoUnitario");
  if (campoCento) campoCento.hidden = tipo !== "cento";
  if (campoUnitario) campoUnitario.hidden = tipo !== "unitario";
  atualizarPreviaPrecoFesta();
}

function atualizarPreviaPrecoFesta() {
  const previa = document.getElementById("festaPreviaPreco");
  if (!previa) return;
  const tipo = document.getElementById("festaTipoPreco")?.value || "cento";
  const moeda = valor => Number(valor || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

  if (tipo === "unitario") {
    const unitario = Number(document.getElementById("festaPrecoUnitario")?.value || 0);
    previa.innerHTML = `
      <strong>Prévia por unidade — venda mínima de 50</strong>
      <span>50 unidades<b>${moeda(unitario * 50)}</b></span>
      <span>100 unidades<b>${moeda(unitario * 100)}</b></span>
      <span>150 unidades<b>${moeda(unitario * 150)}</b></span>
      <span>200 unidades<b>${moeda(unitario * 200)}</b></span>`;
  } else {
    const cento = Number(document.getElementById("festaPrecoCento")?.value || 0);
    previa.innerHTML = `
      <strong>Prévia por cento</strong>
      <span>50 unidades<b>${moeda(cento / 2)}</b></span>
      <span>100 unidades<b>${moeda(cento)}</b></span>
      <span>150 unidades<b>${moeda(cento * 1.5)}</b></span>
      <span>200 unidades<b>${moeda(cento * 2)}</b></span>`;
  }
}
window.atualizarCamposPrecoFesta = atualizarCamposPrecoFesta;
window.atualizarPreviaPrecoFesta = atualizarPreviaPrecoFesta;
