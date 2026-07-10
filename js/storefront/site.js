import { iniciarAuth } from "../core/auth.js";
import { APP_CONFIG } from "../core/config.js";
import { formatarMoeda, limparTexto, salvarLocal, carregarLocal } from "../core/utils.js";
import { produtos, observarProdutos, statusEstoque } from "../services/productService.js";
import { categorias, categoriasBase, observarCategorias, normalizarCategorias, categoriaPorId } from "../services/categoryService.js";
import { lojaConfig, observarConfiguracoesLoja } from "../services/configService.js";
import { promocoes, observarPromocoes, promocaoAtivaParaProduto } from "../services/promotionService.js";
import { createProductCard } from "../core/templates.js";
import { gerarPedidoSite } from "../services/orderService.js";
import { salgadosFesta, observarSalgadosFesta } from "../services/partyProductService.js";

let categoriaAtual = "todos";
let carrinho = carregarLocal(APP_CONFIG.storageCarrinho, []);
let pendingSaborProdutoId = null;

iniciarAuth();
iniciarSplashScreen();
observarSalgadosFesta((_, erro) => renderSalgadosFesta(erro));

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
  renderCardapioDiaSite();
});

observarPromocoes(() => {
  renderizarProdutos(categoriaAtual);
  renderPromocoesSite();
});

function iniciarSplashScreen() {
  const splash = document.getElementById("splashScreen");
  if (!splash) return;

  const tempoMinimo = 2600;

  window.setTimeout(() => {
    splash.classList.add("splash-saindo");

    window.setTimeout(() => {
      splash.remove();
    }, 1000);
  }, tempoMinimo);
}


function aplicarConfiguracoesSite() {
  document.querySelectorAll(".brand strong").forEach(el => {
    el.textContent = lojaConfig.nomeLoja || "Delícias da Vó";
  });

  const entrega = document.getElementById("entregaTexto");
  const retirada = document.getElementById("retiradaTexto");
  const status = document.getElementById("statusLojaTexto");

  if (entrega) entrega.textContent = lojaConfig.entrega || "Taxa conforme distância";
  if (retirada) retirada.textContent = lojaConfig.retirada || "Disponível na loja";

  if (status) {
  const resultado = calcularStatusAtendimento();
  status.innerHTML = "";
  status.textContent = resultado.texto;
}
}


function renderCardapioDiaSite() {
  const section = document.getElementById("cardapioDiaSite");
  if (!section) return;

  const cardapio = lojaConfig.cardapioDia || {};
  const itens = Array.isArray(cardapio.itens) ? cardapio.itens.filter(Boolean) : [];

  if (!cardapio.ativo || !itens.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";

  const titulo = document.getElementById("cardapioDiaTitulo");
  const observacao = document.getElementById("cardapioDiaObservacao");
  const lista = document.getElementById("cardapioDiaItens");

  if (titulo) titulo.textContent = cardapio.titulo || "Cardápio de hoje";

  if (observacao) {
    observacao.textContent = cardapio.observacao || "";
    observacao.style.display = cardapio.observacao ? "block" : "none";
  }

  if (lista) {
    lista.innerHTML = "";

    itens.forEach(item => {
      const el = document.createElement("span");
      el.textContent = item;
      lista.appendChild(el);
    });
  }
}


function calcularStatusAtendimento() {
  const horarios = lojaConfig.horariosAtendimento || {};
  const agora = new Date();

  const dias = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const diaAtual = dias[agora.getDay()];
  const horaAtual = agora.toTimeString().slice(0, 5);

  const configHoje = horarios[diaAtual];

  if (!configHoje || configHoje.fechado || !configHoje.periodos?.length) {
    return { aberto: false, texto: "🔴 Fechado no momento" };
  }

  for (const periodo of configHoje.periodos) {
    if (horaAtual >= periodo.inicio && horaAtual <= periodo.fim) {
  const [horaFim, minutoFim] = periodo.fim.split(":").map(Number);
  const fim = new Date();
  fim.setHours(horaFim, minutoFim, 0, 0);

  const minutosParaFechar = Math.round((fim - agora) / 60000);

  if (minutosParaFechar <= 30 && minutosParaFechar > 0) {
    return {
      aberto: true,
      texto: `🟡 Fechando em breve · fecha às ${periodo.fim}`
    };
  }

  return {
    aberto: true,
    texto: `🟢 Aberto agora até ${periodo.fim}`
  };
}

    if (horaAtual < periodo.inicio) {
      return {
        aberto: false,
        texto: `🔴 Fechado · abrimos hoje às ${periodo.inicio}`
      };
    }
  }

  return { aberto: false, texto: "🔴 Fechado no momento" };
}

function precoProduto(produto) {
  const promo = promocaoAtivaParaProduto(produto.id);

  if (Array.isArray(produto.variacoes) && produto.variacoes.length) {
    const disponiveis = produto.variacoes.filter(v =>
      v.ativa !== false && (v.sobEncomenda || Number(v.estoque || 0) > 0)
    );

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

  const categoriasAtivas = normalizarCategorias(categorias.length ? categorias : categoriasBase).filter(c => c.ativa !== false);

  categoriasAtivas.forEach(cat => renderizarGrupo(container, cat.id, `${cat.emoji || '🏷️'} ${cat.nome}`, cat.descricao || ''));
}

function renderCategoriasSite() {
  const container = document.getElementById('categoriasSite');
  if (!container) return;

  const categoriasAtivas = normalizarCategorias(categorias.length ? categorias : categoriasBase).filter(c => c.ativa !== false);
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
      (p.categoria || '').includes(termo)
    )
    .forEach(p => grid.appendChild(cardProduto(p)));

  container.appendChild(bloco);
}

function abrirCarrinhoImpl() { document.getElementById('carrinho').classList.add('aberto'); }
function fecharCarrinhoImpl() { document.getElementById('carrinho').classList.remove('aberto'); }


function chaveCarrinho(produtoId, variacaoId = "", sabor = "") {
  return `${produtoId}__${variacaoId || ""}__${sabor || ""}`;
}

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
  const chave = chaveCarrinho(produto.id);
  const item = carrinho.find(i => (i.chave || chaveCarrinho(i.id, i.variacaoId, i.sabor)) === chave);

  if (item) item.quantidade++;
  else carrinho.push({ chave, id: produto.id, nome: produto.nome, preco: precoFinal, quantidade: 1, estoqueAtual: Number(produto.estoque || 0), observacao: "" });

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
    strong.textContent = `${item.quantidade}x ${item.nome}`;
    wrapper.appendChild(strong);
    if (item.sabor) {
      const saborSpan = document.createElement('span');
      saborSpan.className = 'item-sabor';
      saborSpan.textContent = `Opção: ${item.sabor}`;
      wrapper.appendChild(saborSpan);
    }

    if (item.ingredientes) {
      const ingredientesSpan = document.createElement('span');
      ingredientesSpan.className = 'item-ingredientes';
      ingredientesSpan.textContent = `Ingredientes: ${item.ingredientes}`;
      wrapper.appendChild(ingredientesSpan);
    }

    const obs = document.createElement('textarea');
    obs.className = 'obs-item';
    obs.placeholder = 'Observação deste item. Ex: sem tomate, sem cebola...';
    obs.value = item.observacao || '';
    obs.addEventListener('input', () => {
      item.observacao = obs.value;
      salvarLocal(APP_CONFIG.storageCarrinho, carrinho);
    });
    wrapper.appendChild(obs);

    const small = document.createElement('small'); small.textContent = formatarMoeda(item.preco * item.quantidade); wrapper.appendChild(small);
    const actions = document.createElement('div'); actions.className = 'item-actions';
    const btnMinus = document.createElement('button'); btnMinus.textContent = '-'; btnMinus.addEventListener('click', () => window.alterarItem && window.alterarItem(item.chave || chaveCarrinho(item.id, item.variacaoId, item.sabor), -1));
    const btnPlus = document.createElement('button'); btnPlus.textContent = '+'; btnPlus.addEventListener('click', () => window.alterarItem && window.alterarItem(item.chave || chaveCarrinho(item.id, item.variacaoId, item.sabor), 1));
    actions.appendChild(btnMinus); actions.appendChild(btnPlus); wrapper.appendChild(actions);
    box.appendChild(wrapper);
  });

  const total = carrinho.reduce((soma, item) => soma + item.preco * item.quantidade, 0);
  const quantidade = carrinho.reduce((soma, item) => soma + item.quantidade, 0);

  document.getElementById("totalPedido").textContent = formatarMoeda(total);
  document.getElementById("contadorItens").textContent = quantidade;

  salvarLocal(APP_CONFIG.storageCarrinho, carrinho);
}

function alterarItemImpl(chave, valor) {
  const itemIndex = carrinho.findIndex(i => (i.chave || chaveCarrinho(i.id, i.variacaoId, i.sabor)) === chave);
  if (itemIndex === -1) return;

  const item = carrinho[itemIndex];
  item.quantidade += valor;

  if (item.quantidade <= 0) {
    carrinho.splice(itemIndex, 1);
  }

  atualizarCarrinho();
}

// Modal de sabores

function textoIngredientes(valor) {
  if (Array.isArray(valor)) return valor.filter(Boolean).join(", ");
  return valor || "";
}

function ingredientesDaEscolha(escolha) {
  if (escolha && typeof escolha === "object") {
    return textoIngredientes(escolha.ingredientes);
  }

  return "";
}

function criarLinhaIngredientesModal(ingredientesTexto) {
  if (!ingredientesTexto) return null;

  const div = document.createElement("div");
  div.className = "ingredientes-opcao";
  div.innerHTML = `<strong>Ingredientes:</strong> ${ingredientesTexto}`;
  return div;
}


function abrirModalSabores(produto) {
  pendingSaborProdutoId = produto.id;
  const modal = document.getElementById('modalSabores');
  const list = document.getElementById('listaSaboresModal');
  if (!modal) { console.warn('modalSabores element not found'); alert('Erro: modal de variações não encontrado.'); return; }
  if (!list) { console.warn('listaSaboresModal element not found'); alert('Erro: lista de opções não encontrada.'); modal.classList.remove('aberto'); return; }
  list.innerHTML = '';

  const opcoes = Array.isArray(produto.variacoes) && produto.variacoes.length ? produto.variacoes : (produto.sabores || []);
  const titulo = document.querySelector('#modalSabores h2');
  if (titulo) {
    const categoria = categoriaPorId(produto.categoria);
    titulo.textContent = categoria?.tituloSelecao || (Array.isArray(produto.variacoes) && produto.variacoes.length ? 'Escolha uma variação' : 'Escolha um sabor');
  }

  if (Array.isArray(produto.variacoes) && produto.variacoes.length) {
    opcoes
      .filter(v => v.ativa !== false)
      .forEach(v => {
        const btn = document.createElement('button');
        btn.className = 'sabor-btn';
        btn.innerHTML = `<strong>${v.nome}</strong><small>${Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v.preco)}${v.sobEncomenda ? ' · Sob encomenda' : ''}</small>`;

        const ingredientesTexto = textoIngredientes(v.ingredientes);
        const ingredientesEl = criarLinhaIngredientesModal(ingredientesTexto);
        if (ingredientesEl) btn.appendChild(ingredientesEl);

        btn.disabled = v.ativa === false;
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
  const ingredientesOpcao = ingredientesDaEscolha(escolha);

  const chave = chaveCarrinho(produto.id, variacaoId, sabor);
  const item = carrinho.find(i => (i.chave || chaveCarrinho(i.id, i.variacaoId, i.sabor)) === chave);
  if (item) item.quantidade++;
  else carrinho.push({ chave, id: produto.id, variacaoId, nome: produto.nome, preco: precoFinal, quantidade: 1, sabor, ingredientes: ingredientesOpcao, estoqueAtual, observacao: "" });

  atualizarCarrinho();
  fecharModalSabores();
  abrirCarrinhoImpl();
}


function textoWhatsApp(valor) {
  return encodeURIComponent(valor);
}

function montarMensagemPedidoWhatsApp(pedido) {
  const linhasItens = pedido.itens.map(item => {
    const opcao = item.sabor ? `\n   Opção: ${item.sabor}` : "";
    const ingredientes = item.ingredientes ? `\n   Ingredientes: ${item.ingredientes}` : "";
    const observacao = item.observacao ? `\n   Obs: ${item.observacao}` : "";
    return `• ${item.quantidade}x ${item.nome}${opcao}${ingredientes}${observacao}\n  ${formatarMoeda(item.subtotal)}`;
  }).join("\n\n");

  const tipoEntrega = pedido.tipo === "Entrega" ? "🚚 ENTREGA" : "🏪 RETIRADA NA LOJA";
  const endereco = pedido.tipo === "Entrega"
    ? `\n📍 Endereço\n${pedido.endereco}\n`
    : "";

  return `━━━━━━━━━━━━━━━━━━━━━━
🍽️ DELÍCIAS DA VÓ

📦 Pedido ${pedido.numeroFormatado}
📅 ${pedido.dataBR}
🕒 ${pedido.horaBR}

━━━━━━━━━━━━━━━━━━━━━━

👤 CLIENTE
${pedido.cliente.nome}

📱 WhatsApp
${pedido.cliente.telefone || "Não informado"}

━━━━━━━━━━━━━━━━━━━━━━

🛒 PEDIDO

${linhasItens}

━━━━━━━━━━━━━━━━━━━━━━

${tipoEntrega}
${endereco}
💳 PAGAMENTO
${pedido.pagamento}

━━━━━━━━━━━━━━━━━━━━━━

💰 TOTAL
${formatarMoeda(pedido.total)}

━━━━━━━━━━━━━━━━━━━━━━

Obrigado pela preferência ❤️`;
}

function setBotaoFinalizarPedido(texto, desabilitado = false) {
  const botao = document.querySelector(".btn-whatsapp");
  if (!botao) return;

  botao.textContent = texto;
  botao.disabled = desabilitado;
}


async function finalizarPedidoImpl() {
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

  setBotaoFinalizarPedido("⏳ Preparando pedido...", true);

  try {
    const itens = carrinho.map(item => ({
      id: item.id,
      variacaoId: item.variacaoId || "",
      nome: item.nome,
      sabor: item.sabor || "",
      ingredientes: item.ingredientes || "",
      observacao: limparTexto(item.observacao || ""),
      quantidade: Number(item.quantidade || 0),
      preco: Number(item.preco || 0),
      subtotal: Number(item.preco || 0) * Number(item.quantidade || 0)
    }));

    const total = itens.reduce((soma, item) => soma + item.subtotal, 0);

    setBotaoFinalizarPedido("📦 Gerando número...", true);

    const pedido = await gerarPedidoSite({
      origem: "site",
      loja: lojaConfig.nomeLoja || "Delícias da Vó",
      cliente: {
        nome,
        telefone
      },
      tipo,
      endereco: tipo === "Entrega" ? endereco : "",
      pagamento,
      itens,
      total
    });

    const mensagem = montarMensagemPedidoWhatsApp(pedido);
    const numero = lojaConfig.whatsapp || APP_CONFIG.whatsapp;

    setBotaoFinalizarPedido("✅ Abrindo WhatsApp...", true);

    window.open(`https://wa.me/${numero}?text=${textoWhatsApp(mensagem)}`, "_blank");

    setTimeout(() => {
      setBotaoFinalizarPedido("Enviar pelo WhatsApp", false);
    }, 1200);

  } catch (erro) {
    console.error("Erro ao finalizar pedido:", erro);
    alert("Não foi possível gerar o número do pedido. Tente novamente.");
    setBotaoFinalizarPedido("Enviar pelo WhatsApp", false);
  }
};

window.alterarItem = alterarItemImpl;
window.finalizarPedido = finalizarPedidoImpl;


let encomendaFesta = carregarLocal("deliciasFestaPedido", []);
function abrirAreaFestas(){ document.getElementById("areaPrincipal").hidden=true; document.getElementById("areaFestas").hidden=false; document.getElementById("btnFestasTopo").textContent="🏠 Cardápio principal"; document.getElementById("btnFestasTopo").onclick=voltarCardapioPrincipal; window.scrollTo({top:0,behavior:"smooth"}); renderSalgadosFesta(); }
function voltarCardapioPrincipal(){ document.getElementById("areaFestas").hidden=true; document.getElementById("areaPrincipal").hidden=false; const b=document.getElementById("btnFestasTopo"); b.textContent="🎉 Salgados para Festas"; b.onclick=abrirAreaFestas; window.scrollTo({top:0,behavior:"smooth"}); }
function opcoesQuantidadeFesta(produto) {
  const inicial = Math.max(50, Number(produto.quantidadeInicial || 50));
  const incremento = Math.max(50, Number(produto.incrementoQuantidade || 50));
  const maxima = Math.max(inicial, Number(produto.quantidadeMaxima || 500));
  const valores = [];
  for (let quantidade = inicial; quantidade <= maxima; quantidade += incremento) valores.push(quantidade);
  return valores.length ? valores : [50, 100, 150, 200];
}

function renderSalgadosFesta(erro = null) {
  const fritos = document.getElementById("festaFritos");
  const assados = document.getElementById("festaAssados");
  if (!fritos || !assados) return;

  fritos.innerHTML = "";
  assados.innerHTML = "";

  salgadosFesta.filter(p => p.ativo !== false).forEach(p => {
    const card = document.createElement("article");
    card.className = `festa-produto-card ${p.categoria}`;
    const sabores = Array.isArray(p.sabores) && p.sabores.length ? p.sabores : ["Tradicional"];
    const opcoesSabores = sabores.map(x => `<option value="${x.replace(/"/g, '&quot;')}">${x}</option>`).join("");
    const quantidades = opcoesQuantidadeFesta(p);
    const opcoesQuantidades = quantidades.map((q, i) => `<option value="${q}" ${i === 0 ? "selected" : ""}>${q} unidades</option>`).join("");

    card.innerHTML = `
      <div class="festa-card-decor" aria-hidden="true">✦</div>
      <div class="festa-card-top">
        <span class="festa-emoji">${p.emoji || "🥟"}</span>
        <span class="festa-tipo">${p.categoria === "assados" ? "🔥 Assado" : "🍳 Frito"}</span>
      </div>
      <h3>${p.nome}</h3>
      <p class="festa-card-descricao">${p.descricao || "Feito com carinho para sua festa."}</p>
      <div class="festa-configurador">
        <div class="festa-configurador-title"><span>✨</span><div><b>Monte sua encomenda</b><small>Escolha o sabor e a quantidade</small></div></div>
        <label><span>Sabor</span><select class="festa-select-sabor">${opcoesSabores}</select></label>
        <label><span>Quantidade</span><select class="festa-select-quantidade">${opcoesQuantidades}</select></label>
        <small class="festa-regra-quantidade">Acréscimos de ${Number(p.incrementoQuantidade || 50)} em ${Number(p.incrementoQuantidade || 50)} unidades.</small>
      </div>
      <button class="btn primary festa-add-btn">＋ Adicionar à encomenda</button>`;

    card.querySelector("button").onclick = () => {
      const sabor = card.querySelector(".festa-select-sabor").value;
      const quantidade = Number(card.querySelector(".festa-select-quantidade").value);
      adicionarFesta(p, sabor, quantidade);
    };
    (p.categoria === "assados" ? assados : fritos).appendChild(card);
  });

  const st = document.getElementById("statusFestas");
  if (st) {
    st.textContent = erro ? "O catálogo padrão está disponível. Os produtos novos voltarão quando a conexão for restabelecida." : "";
    st.style.display = erro ? "block" : "none";
  }
  renderResumoFesta();
}
function adicionarFesta(p, sabor, qtd) {
  const id = p.id + "__" + sabor;
  const item = encomendaFesta.find(i => i.id === id);
  const incremento = Math.max(50, Number(p.incrementoQuantidade || 50));
  if (item) item.quantidade += qtd;
  else encomendaFesta.push({ id, produtoId:p.id, nome:p.nome, sabor, quantidade:qtd, incremento });
  salvarLocal("deliciasFestaPedido", encomendaFesta);
  renderResumoFesta();
}
function alterarFesta(i, delta) {
  const item = encomendaFesta[i];
  if (!item) return;
  const incremento = Math.max(50, Number(item.incremento || 50));
  item.quantidade += delta > 0 ? incremento : -incremento;
  if (item.quantidade <= 0) encomendaFesta.splice(i, 1);
  salvarLocal("deliciasFestaPedido", encomendaFesta);
  renderResumoFesta();
}
function renderResumoFesta() {
  const box = document.getElementById("resumoFestaPedido");
  if (!box) return;
  if (!encomendaFesta.length) {
    box.innerHTML = '<div class="festa-vazio"><span>🎈</span><div><b>Sua encomenda está vazia</b><p>Escolha um salgado, um sabor e a quantidade para começar.</p></div></div>';
    return;
  }
  const total = encomendaFesta.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  box.innerHTML = `<div class="festa-resumo-cabecalho"><div><span>🧺</span><div><b>Sua encomenda</b><small>${encomendaFesta.length} opção(ões) escolhida(s)</small></div></div><strong>${total} unidades</strong></div>` + encomendaFesta.map((i, n) => `
    <div class="festa-resumo-item">
      <div class="festa-resumo-identidade"><span class="festa-resumo-icone">🥟</span><div><b>${i.nome}</b><span>${i.sabor}</span></div></div>
      <div class="festa-resumo-controles"><button aria-label="Diminuir" onclick="alterarFesta(${n},-1)">−</button><strong>${i.quantidade}</strong><button aria-label="Aumentar" onclick="alterarFesta(${n},1)">+</button></div>
    </div>`).join("");
}
function enviarEncomendaFesta(){if(!encomendaFesta.length)return alert("Adicione pelo menos um salgado."); const nome=limparTexto(document.getElementById("nomeFestaCliente").value); if(!nome)return alert("Digite seu nome."); const data=document.getElementById("dataFesta").value; const obs=limparTexto(document.getElementById("obsFesta").value); const itens=encomendaFesta.map(i=>`• ${i.quantidade}x ${i.nome} — ${i.sabor}`).join("\n"); const msg=`Olá! Vim pelo site da Delícias da Vó e gostaria de encomendar salgados para festa.\n\nCliente: ${nome}\n${data?`Data da festa: ${data}\n`:""}\n${itens}${obs?`\n\nObservações: ${obs}`:""}\n\nAguardo a confirmação do pedido e do valor.`; window.open(`https://wa.me/${lojaConfig.whatsapp||APP_CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`,"_blank");}
window.abrirAreaFestas=abrirAreaFestas; window.voltarCardapioPrincipal=voltarCardapioPrincipal; window.alterarFesta=alterarFesta; window.enviarEncomendaFesta=enviarEncomendaFesta;
