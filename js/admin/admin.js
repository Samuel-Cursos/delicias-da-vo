import { iniciarAuth } from "../core/auth.js";
import { formatarMoeda, limparTexto, gerarId } from "../core/utils.js";
import { produtos, observarProdutos, criarProdutosBase, salvarProduto, atualizarProduto, excluirProduto, statusEstoque } from "../services/productService.js";
import { registrarVendaRapida, observarVendasHoje, vendasHoje, resumoCaixa } from "../services/salesService.js";

window.criarProdutosBase = criarProdutosBase;

let produtoEditando = null;
let vendaAtual = [];

iniciarAuth();

window.iniciarAdminDepoisLogin = function() {
  observarProdutos(() => {
    renderDashboard();
    renderProdutosAdmin();
    renderVendaRapida();
  });

  observarVendasHoje(() => {
    renderDashboard();
    renderCaixa();
  });
};

window.abrirAba = function(nome, botao) {
  document.querySelectorAll(".aba").forEach(a => a.classList.remove("active"));
  document.getElementById(`aba-${nome}`).classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  botao.classList.add("active");
  const titulos = { dashboard: "Dashboard", produtos: "Produtos", venda: "Venda rápida", caixa: "Caixa" };
  document.getElementById("tituloAba").textContent = titulos[nome] || "Painel";
};

function renderDashboard() {
  const ativos = produtos.filter(p => p.ativo !== false).length;
  const baixos = produtos.filter(p => {
    const status = statusEstoque(p);
    return (status.classe === "baixo" || status.classe === "off") && !p.sobEncomenda;
  });

  const totalHoje = vendasHoje.reduce((soma, venda) => soma + Number(venda.total || 0), 0);

  document.getElementById("statProdutos").textContent = produtos.length;
  document.getElementById("statAtivos").textContent = ativos;
  document.getElementById("statBaixo").textContent = baixos.length;
  document.getElementById("statVendasHoje").textContent = formatarMoeda(totalHoje);

  const avisos = document.getElementById("avisosDashboard");
  if (avisos) {
    avisos.innerHTML = "";
    if (!baixos.length) avisos.innerHTML = `<p>Nenhum produto em atenção no momento.</p>`;
    baixos.forEach(p => avisos.innerHTML += `<p>⚠ ${p.nome}: estoque ${p.estoque || 0}</p>`);
  }

  const ultimas = document.getElementById("ultimasVendasDashboard");
  if (ultimas) {
    ultimas.innerHTML = "";
    if (!vendasHoje.length) ultimas.innerHTML = `<p>Nenhuma venda registrada hoje.</p>`;
    vendasHoje.slice(0, 5).forEach(venda => {
      const itens = (venda.itens || []).map(i => `${i.quantidade}x ${i.nome}`).join(", ");
      ultimas.innerHTML += `<div class="venda-historico"><strong>${venda.hora || "--:--"} - ${formatarMoeda(venda.total)}</strong><small>${itens}</small><small>${venda.pagamento}</small></div>`;
    });
  }
}

window.renderProdutosAdmin = function() {
  const box = document.getElementById("listaProdutosAdmin");
  if (!box) return;

  const busca = (document.getElementById("buscaAdminProduto")?.value || "").toLowerCase();
  box.innerHTML = "";

  produtos.filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.includes(busca)).forEach(p => {
    const status = statusEstoque(p);
    box.innerHTML += `<div class="produto-admin"><div><strong>${p.emoji || "🍽️"} ${p.nome}</strong><p>${p.categoria} · ${formatarMoeda(p.preco)}</p><span class="badge ${status.classe}">${status.texto}</span></div><div><p>Estoque: <strong>${p.sobEncomenda ? "Sob encomenda" : (p.estoque || 0)}</strong></p><p>Mínimo: ${p.minimo || 0}</p></div><div class="actions"><button onclick="abrirModalProduto('${p.id}')">Editar</button><button onclick="alternarAtivo('${p.id}')">${p.ativo === false ? "Ativar" : "Desativar"}</button><button onclick="excluirProdutoAdmin('${p.id}')">Excluir</button></div></div>`;
  });
};

window.abrirModalProduto = function(id = null) {
  produtoEditando = id ? produtos.find(p => p.id === id) : null;
  document.getElementById("modalTitulo").textContent = produtoEditando ? "Editar produto" : "Novo produto";
  document.getElementById("produtoNome").value = produtoEditando?.nome || "";
  document.getElementById("produtoCategoria").value = produtoEditando?.categoria || "salgados";
  document.getElementById("produtoPreco").value = produtoEditando?.preco || "";
  document.getElementById("produtoEmoji").value = produtoEditando?.emoji || "";
  document.getElementById("produtoDescricao").value = produtoEditando?.descricao || "";
  document.getElementById("produtoSabores").value = produtoEditando?.sabores?.join(", ") || "";
  document.getElementById("produtoEstoque").value = produtoEditando?.estoque ?? 40;
  document.getElementById("produtoMinimo").value = produtoEditando?.minimo ?? 5;
  document.getElementById("produtoAtivo").checked = produtoEditando?.ativo ?? true;
  document.getElementById("produtoDestaque").checked = produtoEditando?.destaque ?? false;
  document.getElementById("produtoSobEncomenda").checked = produtoEditando?.sobEncomenda ?? false;
  document.getElementById("modalProduto").classList.add("aberto");
};

window.fecharModalProduto = function() {
  produtoEditando = null;
  document.getElementById("modalProduto").classList.remove("aberto");
};

window.salvarProdutoAdmin = async function() {
  const nome = limparTexto(document.getElementById("produtoNome").value);
  const preco = Number(document.getElementById("produtoPreco").value || 0);
  if (!nome) { alert("Digite o nome do produto."); return; }
  if (preco <= 0) { alert("Digite um preço válido."); return; }

  const sabores = limparTexto(document.getElementById("produtoSabores").value).split(",").map(s => limparTexto(s)).filter(Boolean);
  const id = produtoEditando?.id || gerarId(nome);
  const sobEncomenda = document.getElementById("produtoSobEncomenda").checked;

  await salvarProduto({
    id, nome,
    categoria: document.getElementById("produtoCategoria").value,
    preco,
    emoji: document.getElementById("produtoEmoji").value || "🍽️",
    descricao: document.getElementById("produtoDescricao").value || "",
    sabores,
    estoque: sobEncomenda ? 0 : Number(document.getElementById("produtoEstoque").value || 0),
    minimo: sobEncomenda ? 0 : Number(document.getElementById("produtoMinimo").value || 0),
    ativo: document.getElementById("produtoAtivo").checked,
    destaque: document.getElementById("produtoDestaque").checked,
    sobEncomenda,
    ordem: produtoEditando?.ordem || Date.now()
  });

  fecharModalProduto();
};

window.alternarAtivo = async function(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto) return;
  await atualizarProduto(id, { ativo: produto.ativo === false });
};

window.excluirProdutoAdmin = async function(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto) return;
  if (!confirm(`Excluir ${produto.nome}?`)) return;
  await excluirProduto(id);
};

window.renderVendaRapida = function() {
  const box = document.getElementById("listaVendaRapida");
  if (!box) return;
  const busca = (document.getElementById("buscaVenda")?.value || "").toLowerCase();
  box.innerHTML = "";

  produtos.filter(p => p.ativo !== false).filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.includes(busca)).forEach(p => {
    box.innerHTML += `<div class="venda-item"><div><strong>${p.emoji || "🍽️"} ${p.nome}</strong><p>${formatarMoeda(p.preco)} · Estoque: ${p.sobEncomenda ? "encomenda" : (p.estoque || 0)}</p></div><button onclick="adicionarVendaRapida('${p.id}')">Adicionar</button></div>`;
  });

  renderVendaAtual();
};

window.adicionarVendaRapida = function(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto) return;
  const item = vendaAtual.find(i => i.id === id);
  if (item) item.quantidade++;
  else vendaAtual.push({ id: produto.id, nome: produto.nome, preco: produto.preco, quantidade: 1, estoqueAtual: produto.estoque || 0 });
  renderVendaAtual();
};

function renderVendaAtual() {
  const box = document.getElementById("itensVendaRapida");
  if (!box) return;
  box.innerHTML = "";
  if (!vendaAtual.length) box.innerHTML = `<p>Nenhum item.</p>`;
  vendaAtual.forEach(item => {
    box.innerHTML += `<div class="item-venda-atual"><div><strong>${item.quantidade}x ${item.nome}</strong><p>${formatarMoeda(item.preco * item.quantidade)}</p></div><div><button onclick="alterarVendaItem('${item.id}', -1)">-</button><button onclick="alterarVendaItem('${item.id}', 1)">+</button></div></div>`;
  });
  const total = vendaAtual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  document.getElementById("totalVendaRapida").textContent = formatarMoeda(total);
}

window.alterarVendaItem = function(id, valor) {
  const item = vendaAtual.find(i => i.id === id);
  if (!item) return;
  item.quantidade += valor;
  if (item.quantidade <= 0) vendaAtual = vendaAtual.filter(i => i.id !== id);
  renderVendaAtual();
};

window.finalizarVendaRapida = async function() {
  if (!vendaAtual.length) { alert("Adicione pelo menos um produto."); return; }
  const pagamento = document.getElementById("formaPagamentoVenda").value;
  const observacao = limparTexto(document.getElementById("obsVenda").value);
  const total = vendaAtual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);

  const venda = await registrarVendaRapida({ itens: vendaAtual, pagamento, total, observacao });

  const msg = document.getElementById("mensagemVenda");
  msg.style.display = "block";
  msg.innerHTML = `<strong>Venda registrada!</strong><br>Total: ${formatarMoeda(total)}<br>Pagamento: ${pagamento}<br>Estoque descontado automaticamente.`;

  vendaAtual = [];
  document.getElementById("obsVenda").value = "";
  renderVendaAtual();
};

function renderCaixa() {
  const box = document.getElementById("resumoCaixa");
  const hist = document.getElementById("historicoVendas");
  if (!box || !hist) return;

  const resumo = resumoCaixa(vendasHoje);
  box.innerHTML = `
    <div class="caixa-card"><span>Pix</span><strong>${formatarMoeda(resumo.Pix)}</strong></div>
    <div class="caixa-card"><span>Dinheiro</span><strong>${formatarMoeda(resumo.Dinheiro)}</strong></div>
    <div class="caixa-card"><span>Cartão débito</span><strong>${formatarMoeda(resumo["Cartão débito"])}</strong></div>
    <div class="caixa-card"><span>Cartão crédito</span><strong>${formatarMoeda(resumo["Cartão crédito"])}</strong></div>
    <div class="caixa-card"><span>Total</span><strong>${formatarMoeda(resumo.Total)}</strong></div>
    <div class="caixa-card"><span>Vendas</span><strong>${resumo.Quantidade}</strong></div>
  `;

  hist.innerHTML = "";
  if (!vendasHoje.length) hist.innerHTML = `<p>Nenhuma venda registrada hoje.</p>`;
  vendasHoje.forEach(venda => {
    const itens = (venda.itens || []).map(i => `${i.quantidade}x ${i.nome}`).join(", ");
    hist.innerHTML += `<div class="venda-historico"><strong>${venda.hora || "--:--"} - ${formatarMoeda(venda.total)}</strong><small>${itens}</small><small>${venda.pagamento}${venda.observacao ? " · " + venda.observacao : ""}</small></div>`;
  });
}
