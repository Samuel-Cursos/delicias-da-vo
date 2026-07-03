import { iniciarAuth } from "../core/auth.js";
import { APP_CONFIG } from "../core/config.js";
import { formatarMoeda, limparTexto, salvarLocal, carregarLocal } from "../core/utils.js";
import { produtos, observarProdutos, statusEstoque } from "../services/productService.js";
import { categorias, categoriasBase, observarCategorias } from "../services/categoryService.js";
import { lojaConfig, observarConfiguracoesLoja } from "../services/configService.js";
import { promocoes, observarPromocoes, promocaoAtivaParaProduto } from "../services/promotionService.js";
import { createProductCard } from "../core/templates.js";

let categoriaAtual = "todos";
let carrinho = carregarLocal(APP_CONFIG.storageCarrinho, []);
let pendingSaborProdutoId = null;

iniciarAuth();

observarProdutos(() => {
  renderCategoriasSite();
  renderizarProdutos(categoriaAtual);
  renderPromocoesSite();
  atualizarCarrinho();
});

observarCategorias(() => {
  renderCategoriasSite();
  renderizarProdutos(categoriaAtual);
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

  if (Array.isArray(produto.variacoes) && produto.variacoes.length) {
    const disponiveis = produto.variacoes.filter(v => v.ativa !== false && (v.sobEncomenda || Number(v.estoque || 0) > 0));
    const precoBase = disponiveis.length
      ? Math.min(...disponiveis.map(v => Number(v.preco || produto.preco || 0)))
      : Number(produto.preco || 0);
    return promo ? Number(promo.precoPromocional || precoBase) : Number(precoBase);
  }

  return promo ? Number(promo.precoPromocional || produto.preco) : Number(produto.preco || 0);
}

function cardProduto(produto) {
  const status = statusEstoque(produto);
  const promo = promocaoAtivaParaProduto(produto.id);
  const precoFinal = precoProduto(produto);

  return createProductCard(produto, {
    promo: Boolean(promo),
    statusClass: status.classe,
    badgeText: promo ? 'Promoção' : status.texto,
    description: promo?.descricao || produto.descricao || '',
    showOldPrice: Boolean(promo),
    price: precoFinal,
    available: status.disponivel,
    buttonText: Array.isArray(produto.variacoes) && produto.variacoes.length ? 'Escolher' : undefined
  });
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
    const vazio = document.createElement('div');
    vazio.className = 'promo-vazio';
    vazio.textContent = 'Nenhuma promoção ativa no momento.';
    box.appendChild(vazio);
    return;
  }

  ativas.forEach(promo => {
    const produto = produtos.find(p => p.id === promo.produtoId);
    if (!produto || produto.ativo === false) return;

    const card = createProductCard(produto, {
      promo: true,
      badgeText: 'Promoção',
      description: promo.descricao || produto.descricao || '',
      showOldPrice: true,
      price: promo.precoPromocional,
      available: true
    });

    box.appendChild(card);
  });
}

function renderizarGrupo(container, categoria, titulo, descricao) {
  const lista = produtos.filter(p => p.ativo !== false && p.categoria === categoria);

  if (!lista.length) return;

  const bloco = document.createElement('section');
  bloco.className = 'categoria-bloco';
  const h3 = document.createElement('h3'); h3.textContent = titulo; bloco.appendChild(h3);
  if (descricao) {
    const p = document.createElement('p'); p.textContent = descricao; bloco.appendChild(p);
  }
  const grid = document.createElement('div'); grid.className = 'produtos-grid'; bloco.appendChild(grid);

  lista.forEach(produto => grid.appendChild(cardProduto(produto)));

  container.appendChild(bloco);
}

function renderizarProdutos(categoria = "todos") {
  categoriaAtual = categoria;

  const container = document.getElementById("listaProdutos");
  container.innerHTML = "";

  if (categoria !== 'todos') {
    const bloco = document.createElement('section'); bloco.className = 'categoria-bloco';
    const grid = document.createElement('div'); grid.className = 'produtos-grid'; bloco.appendChild(grid);

    produtos
      .filter(p => p.ativo !== false && p.categoria === categoria)
      .forEach(p => grid.appendChild(cardProduto(p)));

    container.appendChild(bloco);
    return;
  }

  const categoriasVisiveis = categorias.length ? categorias : categoriasBase;
  const categoriasAtivas = categoriasVisiveis.filter(c => c.ativa !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

  categoriasAtivas.forEach(cat => renderizarGrupo(container, cat.id, `${cat.emoji || '🏷️'} ${cat.nome}`, cat.descricao || ''));
}

function renderCategoriasSite() {
  const container = document.getElementById('categoriasSite');
  if (!container) return;

  const categoriasVisiveis = categorias.length ? categorias : categoriasBase;
  const categoriasAtivas = categoriasVisiveis.filter(c => c.ativa !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  container.innerHTML = '';

  const todosBtn = document.createElement('button');
  todosBtn.className = `categoria ${categoriaAtual === 'todos' ? 'ativa' : ''}`;
  todosBtn.textContent = 'Todos';
  todosBtn.addEventListener('click', event => filtrarCategoriaImpl(event, 'todos'));
  container.appendChild(todosBtn);

  categoriasAtivas.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `categoria ${categoriaAtual === cat.id ? 'ativa' : ''}`;
    btn.textContent = `${cat.emoji || '🏷️'} ${cat.nome}`;
    btn.addEventListener('click', event => filtrarCategoriaImpl(event, cat.id));
    container.appendChild(btn);
  });
}

function filtrarCategoriaImpl(event, categoria) {
  document.querySelectorAll('.categoria').forEach(btn => btn.classList.remove('ativa'));
  if (event && event.target) event.target.classList.add('ativa');
  renderizarProdutos(categoria);
}

function pesquisarProdutosImpl() {
  const termo = limparTexto(document.getElementById('buscaProduto').value).toLowerCase();
  const container = document.getElementById('listaProdutos');

  container.innerHTML = '';
  const bloco = document.createElement('section'); bloco.className = 'categoria-bloco';
  const grid = document.createElement('div'); grid.className = 'produtos-grid'; bloco.appendChild(grid);

  produtos
    .filter(p => p.ativo !== false)
    .filter(p =>
      p.nome.toLowerCase().includes(termo) ||
      (p.descricao || '').toLowerCase().includes(termo) ||
      p.categoria.includes(termo)
    )
    .forEach(p => grid.appendChild(cardProduto(p)));

  container.appendChild(bloco);
}

function abrirCarrinhoImpl() { document.getElementById('carrinho').classList.add('aberto'); }
function fecharCarrinhoImpl() { document.getElementById('carrinho').classList.remove('aberto'); }

function adicionarCarrinhoImpl(id) {
  const produto = produtos.find(p => p.id === id);
  if (!produto) return;

  const precoFinal = precoProduto(produto);

  // normalizar sabores: aceitar string separado por vírgula ou array
  let sabores = produto.sabores;
  if (typeof sabores === 'string') {
    sabores = sabores.split(',').map(s => limparTexto(s)).filter(Boolean);
  }

  // se o produto tem variações, abrir modal de variação
  if (Array.isArray(produto.variacoes) && produto.variacoes.length) {
    abrirModalSabores(produto);
    return;
  }

  // se o produto tem sabores, abrir modal para escolher
  if (Array.isArray(sabores) && sabores.length > 0) {
    console.debug('abrindo modal de sabores para', produto.id, sabores);
    // garantir que abrirModalSabores receba a lista normalizada
    abrirModalSabores(Object.assign({}, produto, { sabores }));
    return;
  }

  // sem sabores: adicionar direto
  const item = carrinho.find(i => i.id === id && !i.variacaoId && !i.sabor);

  if (item) item.quantidade++;
  else carrinho.push({ id: produto.id, nome: produto.nome, preco: precoFinal, quantidade: 1, estoqueAtual: Number(produto.estoque || 0) });

  atualizarCarrinho();
  abrirCarrinhoImpl();

}

window.filtrarCategoria = filtrarCategoriaImpl;
window.pesquisarProdutos = pesquisarProdutosImpl;
window.abrirCarrinho = abrirCarrinhoImpl;
window.fecharCarrinho = fecharCarrinhoImpl;
window.adicionarCarrinho = adicionarCarrinhoImpl;

function atualizarCarrinho() {
  const box = document.getElementById("itensCarrinho");
  box.innerHTML = "";

  if (!carrinho.length) {
    const p = document.createElement('p'); p.textContent = 'Seu carrinho está vazio.'; box.appendChild(p);
  }

  carrinho.forEach(item => {
    const wrapper = document.createElement('div'); wrapper.className = 'item-cart';
    const strong = document.createElement('strong');
    strong.textContent = `${item.quantidade}x ${item.nome}${item.sabor ? ' (' + item.sabor + ')' : ''}`;
    wrapper.appendChild(strong);
    const small = document.createElement('small'); small.textContent = formatarMoeda(item.preco * item.quantidade); wrapper.appendChild(small);
    const actions = document.createElement('div'); actions.className = 'item-actions';
    const btnMinus = document.createElement('button'); btnMinus.textContent = '-'; btnMinus.addEventListener('click', () => window.alterarItem && window.alterarItem(item.id, -1, item.variacaoId, item.sabor));
    const btnPlus = document.createElement('button'); btnPlus.textContent = '+'; btnPlus.addEventListener('click', () => window.alterarItem && window.alterarItem(item.id, 1, item.variacaoId, item.sabor));
    actions.appendChild(btnMinus); actions.appendChild(btnPlus); wrapper.appendChild(actions);
    box.appendChild(wrapper);
  });

  const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  const quantidade = carrinho.reduce((soma, item) => soma + item.quantidade, 0);

  document.getElementById("totalPedido").textContent = formatarMoeda(total);
  document.getElementById("contadorItens").textContent = quantidade;

  salvarLocal(APP_CONFIG.storageCarrinho, carrinho);
}

function alterarItemImpl(id, valor, variacaoId, sabor) {
  let itemIndex = -1;

  if (typeof variacaoId !== 'undefined' && variacaoId !== null) {
    itemIndex = carrinho.findIndex(i => i.id === id && i.variacaoId === variacaoId && i.sabor === sabor);
  }

  if (itemIndex === -1 && typeof sabor !== 'undefined') {
    itemIndex = carrinho.findIndex(i => i.id === id && i.sabor === sabor);
  }

  if (itemIndex === -1) itemIndex = carrinho.findIndex(i => i.id === id && typeof i.sabor === 'undefined' && typeof i.variacaoId === 'undefined');
  if (itemIndex === -1) return;

  const item = carrinho[itemIndex];
  item.quantidade += valor;

  if (item.quantidade <= 0) {
    carrinho.splice(itemIndex, 1);
  }

  atualizarCarrinho();
}

// Modal de sabores
function abrirModalSabores(produto) {
  pendingSaborProdutoId = produto.id;
  const modal = document.getElementById('modalSabores');
  const list = document.getElementById('listaSaboresModal');
  if (!modal) { console.warn('modalSabores element not found'); alert('Erro: modal de variações não encontrado.'); return; }
  if (!list) { console.warn('listaSaboresModal element not found'); alert('Erro: lista de opções não encontrada.'); modal.classList.remove('aberto'); return; }
  list.innerHTML = '';

  const opcoes = Array.isArray(produto.variacoes) && produto.variacoes.length ? produto.variacoes : (produto.sabores || []);
  const titulo = document.querySelector('#modalSabores h2');
  if (titulo) titulo.textContent = Array.isArray(produto.variacoes) && produto.variacoes.length ? 'Escolha uma variação' : 'Escolha um sabor';

  if (Array.isArray(produto.variacoes) && produto.variacoes.length) {
    opcoes
      .filter(v => v.ativa !== false)
      .forEach(v => {
        const btn = document.createElement('button');
        btn.className = 'sabor-btn';
        btn.textContent = `${v.nome} – ${Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.preco)}${v.sobEncomenda ? ' (Sob encomenda)' : ` — ${v.estoque || 0} em estoque`}`;
        btn.disabled = !v.sobEncomenda && Number(v.estoque || 0) <= 0;
        btn.addEventListener('click', () => confirmarSabor(produto.id, v));
        list.appendChild(btn);
      });
  } else {
    opcoes.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'sabor-btn';
      btn.textContent = s;
      btn.addEventListener('click', () => confirmarSabor(produto.id, s));
      list.appendChild(btn);
    });
  }

  const cancelar = document.getElementById('cancelarSabor');
  if (cancelar) cancelar.onclick = fecharModalSabores;
  const fechar = document.getElementById('fecharModalSabores');
  if (fechar) fechar.onclick = fecharModalSabores;

  modal.classList.add('aberto');
}

function fecharModalSabores() {
  const modal = document.getElementById('modalSabores');
  if (!modal) return;
  modal.classList.remove('aberto');
  pendingSaborProdutoId = null;
}

function confirmarSabor(produtoId, escolha) {
  const produto = produtos.find(p => p.id === produtoId);
  if (!produto) return;

  const isVariacao = escolha && typeof escolha === 'object' && escolha.nome;
  const variacaoId = isVariacao ? escolha.id : undefined;
  const sabor = isVariacao ? escolha.nome : escolha;
  const precoFinal = isVariacao ? Number(escolha.preco || precoProduto(produto)) : precoProduto(produto);
  const estoqueAtual = isVariacao ? Number(escolha.estoque || produto.estoque || 0) : Number(produto.estoque || 0);

  const item = carrinho.find(i => i.id === produtoId && i.variacaoId === variacaoId && i.sabor === sabor);
  if (item) item.quantidade++;
  else carrinho.push({ id: produto.id, variacaoId, nome: produto.nome, preco: precoFinal, quantidade: 1, sabor, estoqueAtual });

  atualizarCarrinho();
  fecharModalSabores();
  abrirCarrinhoImpl();
}

function finalizarPedidoImpl() {
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
    .map(item => `${item.quantidade}x ${item.nome}${item.sabor ? ' (' + item.sabor + ')' : ''} - ${formatarMoeda(item.preco * item.quantidade)}`)
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

window.alterarItem = alterarItemImpl;
window.finalizarPedido = finalizarPedidoImpl;
