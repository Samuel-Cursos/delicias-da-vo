import { iniciarAuth } from "../core/auth.js";
import { APP_CONFIG } from "../core/config.js";
import { formatarMoeda, limparTexto, salvarLocal, carregarLocal } from "../core/utils.js";
import { produtos, observarProdutos, statusEstoque } from "../services/productService.js";
import { lojaConfig, observarConfiguracoesLoja } from "../services/configService.js";
import { promocoes, observarPromocoes, promocaoAtivaParaProduto } from "../services/promotionService.js";

let categoriaAtual = "todos";
let carrinho = carregarLocal(APP_CONFIG.storageCarrinho, []);

iniciarAuth();

observarProdutos(() => {
  renderizarProdutos(categoriaAtual);
  renderPromocoesSite();
  atualizarCarrinho();
});

observarConfiguracoesLoja(() => {
  aplicarConfiguracoesSite();
});

observarPromocoes(() => {
  renderizarProdutos(categoriaAtual);
  renderPromocoesSite();
});

function aplicarConfiguracoesSite() {
  document.querySelectorAll(".brand strong").forEach(el => el.textContent = lojaConfig.nomeLoja || "Delícias da Vó");

  const entrega = document.getElementById("entregaTexto");
  const retirada = document.getElementById("retiradaTexto");
  const status = document.getElementById("statusLojaTexto");

  if (entrega) entrega.textContent = lojaConfig.entrega || "Taxa conforme distância";
  if (retirada) retirada.textContent = lojaConfig.retirada || "Disponível na loja";
  if (status) status.textContent = lojaConfig.statusLoja === "fechada" ? "Loja fechada no momento" : "Recebendo pedidos";
}

function precoProduto(produto) {
  const promo = promocaoAtivaParaProduto(produto.id);
  return promo ? Number(promo.precoPromocional || produto.preco) : Number(produto.preco || 0);
}

function cardProduto(produto) {
  const status = statusEstoque(produto);
  const promo = promocaoAtivaParaProduto(produto.id);
  const precoFinal = precoProduto(produto);

  return `
    <div class="produto-card">
      ${promo ? `<span class="promo-site">Promoção</span>` : `<span class="badge ${status.classe}">${status.texto}</span>`}
      <div class="emoji">${produto.emoji || "🍽️"}</div>
      <h3>${produto.nome}</h3>
      <p>${promo?.descricao || produto.descricao || ""}</p>
      ${promo ? `<span class="preco-antigo">${formatarMoeda(produto.preco)}</span>` : ""}
      <span class="preco">${formatarMoeda(precoFinal)}</span>
      <button ${!status.disponivel ? "disabled" : ""} onclick="adicionarCarrinho('${produto.id}')">
        ${status.disponivel ? "Adicionar" : "Indisponível"}
      </button>
    </div>
  `;
}

function renderPromocoesSite() {
  const box = document.getElementById("listaPromocoesSite");
  if (!box) return;

  box.innerHTML = "";

  const hoje = new Date().toISOString().slice(0, 10);

  const ativas = promocoes.filter(p => {
    if (!p.ativa) return false;

    const inicioOk = !p.inicio || p.inicio <= hoje;
    const fimOk = !p.fim || p.fim >= hoje;

    return inicioOk && fimOk;
  });

  if (!ativas.length) {
    box.innerHTML = `<div class="promo-vazio">Nenhuma promoção ativa no momento.</div>`;
    return;
  }

  ativas.forEach(promo => {
    const produto = produtos.find(p => p.id === promo.produtoId);
    if (!produto || produto.ativo === false) return;

    box.innerHTML += `
      <div class="produto-card">
        <span class="promo-site">Promoção</span>
        <div class="emoji">${produto.emoji || promo.produtoEmoji || "🎁"}</div>
        <h3>${promo.titulo || produto.nome}</h3>
        <p>${promo.descricao || produto.descricao || ""}</p>
        <span class="preco-antigo">${formatarMoeda(produto.preco)}</span>
        <span class="preco">${formatarMoeda(promo.precoPromocional)}</span>
        <button onclick="adicionarCarrinho('${produto.id}')">Adicionar</button>
      </div>
    `;
  });

  if (!box.innerHTML.trim()) {
    box.innerHTML = `<div class="promo-vazio">Nenhuma promoção ativa no momento.</div>`;
  }
}

function renderizarGrupo(container, categoria, titulo, descricao) {
  const lista = produtos.filter(p => p.ativo !== false && p.categoria === categoria);

  if (!lista.length) return;

  const bloco = document.createElement("section");
  bloco.className = "categoria-bloco";
  bloco.innerHTML = `<h3>${titulo}</h3><p>${descricao}</p><div class="produtos-grid"></div>`;

  const grid = bloco.querySelector(".produtos-grid");
  lista.forEach(produto => grid.innerHTML += cardProduto(produto));

  container.appendChild(bloco);
}

function renderizarProdutos(categoria = "todos") {
  categoriaAtual = categoria;

  const container = document.getElementById("listaProdutos");
  container.innerHTML = "";

  if (categoria !== "todos") {
    const bloco = document.createElement("section");
    bloco.className = "categoria-bloco";
    bloco.innerHTML = `<div class="produtos-grid"></div>`;

    const grid = bloco.querySelector(".produtos-grid");

    produtos
      .filter(p => p.ativo !== false && p.categoria === categoria)
      .forEach(p => grid.innerHTML += cardProduto(p));

    container.appendChild(bloco);
    return;
  }

  renderizarGrupo(container, "salgados", "🥟 Salgados", "Salgados fresquinhos da Delícias da Vó.");
  renderizarGrupo(container, "paes", "🍞 Pães", "Pães caseiros e recheados.");
  renderizarGrupo(container, "bebidas", "🥤 Bebidas", "Para acompanhar seu pedido.");
  renderizarGrupo(container, "outros", "🍽️ Outros", "Outras opções do cardápio.");
}

window.filtrarCategoria = function(event, categoria) {
  document.querySelectorAll(".categoria").forEach(btn => btn.classList.remove("ativa"));
  event.target.classList.add("ativa");
  renderizarProdutos(categoria);
};

window.pesquisarProdutos = function() {
  const termo = limparTexto(document.getElementById("buscaProduto").value).toLowerCase();
  const container = document.getElementById("listaProdutos");

  container.innerHTML = `<section class="categoria-bloco"><div class="produtos-grid"></div></section>`;

  const grid = container.querySelector(".produtos-grid");

  produtos
    .filter(p => p.ativo !== false)
    .filter(p =>
      p.nome.toLowerCase().includes(termo) ||
      (p.descricao || "").toLowerCase().includes(termo) ||
      p.categoria.includes(termo)
    )
    .forEach(p => grid.innerHTML += cardProduto(p));
};

window.abrirCarrinho = () => document.getElementById("carrinho").classList.add("aberto");
window.fecharCarrinho = () => document.getElementById("carrinho").classList.remove("aberto");

window.adicionarCarrinho = function(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto) return;

  const precoFinal = precoProduto(produto);

  const item = carrinho.find(i => i.id === id);

  if (item) item.quantidade++;
  else carrinho.push({
    id: produto.id,
    nome: produto.nome,
    preco: precoFinal,
    quantidade: 1
  });

  atualizarCarrinho();
  abrirCarrinho();

};

function atualizarCarrinho() {
  const box = document.getElementById("itensCarrinho");
  box.innerHTML = "";

  if (!carrinho.length) box.innerHTML = `<p>Seu carrinho está vazio.</p>`;

  carrinho.forEach(item => {
    box.innerHTML += `
      <div class="item-cart">
        <strong>${item.quantidade}x ${item.nome}</strong>
        <small>${formatarMoeda(item.preco * item.quantidade)}</small>
        <div class="item-actions">
          <button onclick="alterarItem('${item.id}', -1)">-</button>
          <button onclick="alterarItem('${item.id}', 1)">+</button>
        </div>
      </div>
    `;
  });

  const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  const quantidade = carrinho.reduce((soma, item) => soma + item.quantidade, 0);

  document.getElementById("totalPedido").textContent = formatarMoeda(total);
  document.getElementById("contadorItens").textContent = quantidade;

  salvarLocal(APP_CONFIG.storageCarrinho, carrinho);
}

window.alterarItem = function(id, valor) {
  const item = carrinho.find(i => i.id === id);
  if (!item) return;

  item.quantidade += valor;

  if (item.quantidade <= 0) {
    carrinho = carrinho.filter(i => i.id !== id);
  }

  atualizarCarrinho();
};

window.finalizarPedido = function() {
  if (!carrinho.length) {
    alert("Adicione pelo menos um produto.");
    return;
  }

  const nome = limparTexto(document.getElementById("nomeCliente").value);
  const telefone = limparTexto(document.getElementById("telefoneCliente").value);
  const tipo = document.getElementById("tipoPedido").value;
  const endereco = limparTexto(document.getElementById("enderecoCliente").value);
  const pagamento = document.getElementById("pagamento").value;

  if (!nome) {
    alert("Digite seu nome.");
    return;
  }

  if (tipo === "Entrega" && !endereco) {
    alert("Digite o endereço.");
    return;
  }

  const linhas = carrinho
    .map(item => `${item.quantidade}x ${item.nome} - ${formatarMoeda(item.preco * item.quantidade)}`)
    .join("%0A");

  const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);

  let msg = `Olá, vim pelo site da ${lojaConfig.nomeLoja || "Delícias da Vó"}.%0A%0A`;
  msg += `*Pedido:*%0A${linhas}%0A%0A`;
  msg += `*Total:* ${formatarMoeda(total)}%0A`;
  msg += `*Nome:* ${nome}%0A`;

  if (telefone) msg += `*WhatsApp:* ${telefone}%0A`;

  msg += `*Tipo:* ${tipo}%0A`;

  if (tipo === "Entrega") msg += `*Endereço:* ${endereco}%0A`;

  msg += `*Pagamento:* ${pagamento}%0A`;

  const numero = lojaConfig.whatsapp || APP_CONFIG.whatsapp;
  window.open(`https://wa.me/${numero}?text=${msg}`, "_blank");
};
