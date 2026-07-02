import { iniciarAuth } from "../core/auth.js";
import { formatarMoeda, limparTexto, gerarId } from "../core/utils.js";
import { produtos, observarProdutos, criarProdutosBase, salvarProduto, atualizarProduto, excluirProduto, statusEstoque } from "../services/productService.js";
import { registrarVendaRapida, observarVendasHoje, vendasHoje, resumoCaixa, excluirVendaComEstorno } from "../services/salesService.js";
import { lojaConfig, observarConfiguracoesLoja, salvarConfiguracoes } from "../services/configService.js";
import { promocoes, observarPromocoes, salvarPromocao, atualizarPromocao, excluirPromocao } from "../services/promotionService.js";
import { sugerirProdutoComIA } from "../services/aiProductService.js";

window.criarProdutosBase = criarProdutosBase;

let produtoEditando = null;
let vendaAtual = [];
let promocaoEditando = null;

iniciarAuth();

window.iniciarAdminDepoisLogin = function() {
  observarProdutos(() => {
    renderDashboard();
    renderProdutosAdmin();
    renderVendaRapida();
    renderPromocoesAdmin();
  });

  observarVendasHoje(() => {
    renderDashboard();
    renderCaixa();
  });

  observarConfiguracoesLoja(() => {
    preencherConfiguracoesLoja();
  });

  observarPromocoes(() => {
    renderPromocoesAdmin();
  });
};

window.abrirAba = function(nome, botao) {
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
    config: "Configurações"
  };

  document.getElementById("tituloAba").textContent = titulos[nome] || "Painel";
};

window.abrirAbaPorNome = function(nome) {
  const botao = [...document.querySelectorAll(".tab-btn")].find(btn => btn.getAttribute("onclick")?.includes(`'${nome}'`));
  abrirAba(nome, botao);
};

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

function renderDashboard() {
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

    if (!baixos.length) avisos.innerHTML = `<p>Nenhum produto em atenção no momento.</p>`;

    baixos.forEach(p => {
      avisos.innerHTML += `<p>⚠ ${p.nome}: estoque ${p.estoque || 0}</p>`;
    });
  }

  const ultimas = document.getElementById("ultimasVendasDashboard");
  if (ultimas) {
    ultimas.innerHTML = "";

    if (!vendasHoje.length) ultimas.innerHTML = `<p>Nenhuma venda registrada hoje.</p>`;

    vendasHoje.slice(0, 5).forEach(venda => {
      const itens = (venda.itens || []).map(i => `${i.quantidade}x ${i.nome}`).join(", ");

      ultimas.innerHTML += `
        <div class="venda-historico">
          <strong>${venda.hora || "--:--"} - ${formatarMoeda(venda.total)}</strong>
          <small>${itens}</small>
          <small>${venda.pagamento}</small>
        </div>
      `;
    });
  }
}

window.renderProdutosAdmin = function() {
  const box = document.getElementById("listaProdutosAdmin");
  if (!box) return;

  const busca = (document.getElementById("buscaAdminProduto")?.value || "").toLowerCase();

  box.innerHTML = "";

  produtos
    .filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.includes(busca))
    .forEach(p => {
      const status = statusEstoque(p);

      box.innerHTML += `
        <div class="produto-admin">
          <div>
            <strong>${p.emoji || "🍽️"} ${p.nome}</strong>
            <p>${p.categoria} · ${formatarMoeda(p.preco)}</p>
            <span class="badge ${status.classe}">${status.texto}</span>
          </div>

          <div>
            <p>Estoque: <strong>${p.sobEncomenda ? "Sob encomenda" : (p.estoque || 0)}</strong></p>
            <p>Mínimo: ${p.minimo || 0}</p>
          </div>

          <div class="actions">
            <button onclick="abrirModalProduto('${p.id}')">Editar</button>
            <button onclick="alternarAtivo('${p.id}')">${p.ativo === false ? "Ativar" : "Desativar"}</button>
            <button onclick="excluirProdutoAdmin('${p.id}')">Excluir</button>
          </div>
        </div>
      `;
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

  const statusIA = document.getElementById("statusIA");
  if (statusIA) statusIA.textContent = "";

  document.getElementById("modalProduto").classList.add("aberto");
};

window.fecharModalProduto = function() {
  produtoEditando = null;
  document.getElementById("modalProduto").classList.remove("aberto");
};

window.gerarProdutoComIA = async function() {
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
};

window.salvarProdutoAdmin = async function() {
  const nome = limparTexto(document.getElementById("produtoNome").value);
  const preco = Number(document.getElementById("produtoPreco").value || 0);

  if (!nome) {
    alert("Digite o nome do produto.");
    return;
  }

  if (preco <= 0) {
    alert("Digite um preço válido.");
    return;
  }

  const sabores = limparTexto(document.getElementById("produtoSabores").value)
    .split(",")
    .map(s => limparTexto(s))
    .filter(Boolean);

  const id = produtoEditando?.id || gerarId(nome);
  const sobEncomenda = document.getElementById("produtoSobEncomenda").checked;

  await salvarProduto({
    id,
    nome,
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

  produtos
    .filter(p => p.ativo !== false)
    .filter(p => p.nome.toLowerCase().includes(busca) || p.categoria.includes(busca))
    .forEach(p => {
      box.innerHTML += `
        <div class="venda-item">
          <div>
            <strong>${p.emoji || "🍽️"} ${p.nome}</strong>
            <p>${formatarMoeda(p.preco)} · Estoque: ${p.sobEncomenda ? "encomenda" : (p.estoque || 0)}</p>
          </div>
          <button onclick="adicionarVendaRapida('${p.id}')">Adicionar</button>
        </div>
      `;
    });

  renderVendaAtual();
};

window.adicionarVendaRapida = function(id) {
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
};

function renderVendaAtual() {
  const box = document.getElementById("itensVendaRapida");
  if (!box) return;

  box.innerHTML = "";

  if (!vendaAtual.length) box.innerHTML = `<p>Nenhum item.</p>`;

  vendaAtual.forEach(item => {
    box.innerHTML += `
      <div class="item-venda-atual">
        <div>
          <strong>${item.quantidade}x ${item.nome}</strong>
          <p>${formatarMoeda(item.preco * item.quantidade)}</p>
        </div>
        <div>
          <button onclick="alterarVendaItem('${item.id}', -1)">-</button>
          <button onclick="alterarVendaItem('${item.id}', 1)">+</button>
        </div>
      </div>
    `;
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

window.limparVendaRapida = function() {
  if (!vendaAtual.length) return;

  if (!confirm("Limpar venda atual?")) return;

  vendaAtual = [];
  renderVendaAtual();
};

window.finalizarVendaRapida = function() {
  if (!vendaAtual.length) {
    alert("Adicione pelo menos um produto.");
    return;
  }

  const pagamento = document.getElementById("formaPagamentoVenda").value;
  const observacao = limparTexto(document.getElementById("obsVenda").value);
  const total = vendaAtual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);

  const resumo = document.getElementById("resumoConfirmacaoVenda");
  resumo.innerHTML = "";

  vendaAtual.forEach(item => {
    resumo.innerHTML += `
      <div class="item-venda-atual">
        <div>
          <strong>${item.quantidade}x ${item.nome}</strong>
          <p>${formatarMoeda(item.preco * item.quantidade)}</p>
        </div>
      </div>
    `;
  });

  resumo.innerHTML += `
    <div class="confirm-total">
      <p><strong>Pagamento:</strong> ${pagamento}</p>
      ${observacao ? `<p><strong>Observação:</strong> ${observacao}</p>` : ""}
      <p><strong>Total:</strong> ${formatarMoeda(total)}</p>
    </div>
  `;

  document.getElementById("modalConfirmarVenda").classList.add("aberto");
};

window.fecharConfirmacaoVenda = function() {
  document.getElementById("modalConfirmarVenda").classList.remove("aberto");
};

window.confirmarFinalizacaoVenda = async function() {
  const pagamento = document.getElementById("formaPagamentoVenda").value;
  const observacao = limparTexto(document.getElementById("obsVenda").value);
  const total = vendaAtual.reduce((soma, item) => soma + item.preco * item.quantidade, 0);

  await registrarVendaRapida({ itens: vendaAtual, pagamento, total, observacao });

  fecharConfirmacaoVenda();

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

    hist.innerHTML += `
      <div class="venda-historico">
        <strong>${venda.hora || "--:--"} - ${formatarMoeda(venda.total)}</strong>
        <small>${itens}</small>
        <small>${venda.pagamento}${venda.observacao ? " · " + venda.observacao : ""}</small>
        <div class="venda-historico-actions">
          <button class="delete-venda" onclick="excluirVendaDoHistorico('${venda.id}')">Apagar venda</button>
        </div>
      </div>
    `;
  });
}

window.excluirVendaDoHistorico = async function(id) {
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
};

function preencherSelectProdutosPromocao() {
  const select = document.getElementById("promoProduto");
  if (!select) return;

  select.innerHTML = "";

  produtos
    .filter(p => p.ativo !== false)
    .forEach(p => {
      select.innerHTML += `<option value="${p.id}">${p.emoji || "🍽️"} ${p.nome} - ${formatarMoeda(p.preco)}</option>`;
    });
}

window.abrirModalPromocao = function(id = null) {
  promocaoEditando = id ? promocoes.find(p => p.id === id) : null;

  preencherSelectProdutosPromocao();

  document.getElementById("modalTituloPromocao").textContent = promocaoEditando ? "Editar promoção" : "Nova promoção";
  document.getElementById("promoTitulo").value = promocaoEditando?.titulo || "";
  document.getElementById("promoAtiva").value = String(promocaoEditando?.ativa ?? true);
  document.getElementById("promoProduto").value = promocaoEditando?.produtoId || "";
  document.getElementById("promoPreco").value = promocaoEditando?.precoPromocional || "";
  document.getElementById("promoDescricao").value = promocaoEditando?.descricao || "";
  document.getElementById("promoInicio").value = promocaoEditando?.inicio || "";
  document.getElementById("promoFim").value = promocaoEditando?.fim || "";

  document.getElementById("modalPromocao").classList.add("aberto");
};

window.fecharModalPromocao = function() {
  promocaoEditando = null;
  document.getElementById("modalPromocao").classList.remove("aberto");
};

window.salvarPromocaoAdmin = async function() {
  const titulo = limparTexto(document.getElementById("promoTitulo").value);
  const produtoId = document.getElementById("promoProduto").value;
  const precoPromocional = Number(document.getElementById("promoPreco").value || 0);
  const produto = produtos.find(p => p.id === produtoId);

  if (!titulo) {
    alert("Digite o título da promoção.");
    return;
  }

  if (!produto) {
    alert("Escolha um produto.");
    return;
  }

  if (precoPromocional <= 0) {
    alert("Digite um preço promocional válido.");
    return;
  }

  const id = promocaoEditando?.id || gerarId(titulo);

  await salvarPromocao({
    id,
    titulo,
    produtoId,
    produtoNome: produto.nome,
    produtoEmoji: produto.emoji || "🍽️",
    precoOriginal: produto.preco,
    precoPromocional,
    descricao: limparTexto(document.getElementById("promoDescricao").value),
    inicio: document.getElementById("promoInicio").value,
    fim: document.getElementById("promoFim").value,
    ativa: document.getElementById("promoAtiva").value === "true",
    criadoEm: promocaoEditando?.criadoEm || null
  });

  fecharModalPromocao();
};

window.renderPromocoesAdmin = function() {
  const box = document.getElementById("listaPromocoes");
  if (!box) return;

  box.innerHTML = "";

  if (!promocoes.length) {
    box.innerHTML = "<p>Nenhuma promoção cadastrada ainda.</p>";
    return;
  }

  promocoes.forEach(p => {
    box.innerHTML += `
      <div class="promocao-card">
        <div>
          <strong>${p.produtoEmoji || "🎁"} ${p.titulo}</strong>
          <p>${p.produtoNome || "Produto"}</p>
          <span class="promo-status ${p.ativa ? "promo-on" : "promo-off"}">${p.ativa ? "Ativa" : "Inativa"}</span>
        </div>

        <div>
          <span class="promo-old">${formatarMoeda(p.precoOriginal)}</span>
          <div class="promo-preco">${formatarMoeda(p.precoPromocional)}</div>
          <p>${p.inicio || "Sem início"} até ${p.fim || "sem fim"}</p>
        </div>

        <div class="actions">
          <button onclick="abrirModalPromocao('${p.id}')">Editar</button>
          <button onclick="alternarPromocao('${p.id}')">${p.ativa ? "Desativar" : "Ativar"}</button>
          <button onclick="excluirPromocaoAdmin('${p.id}')">Excluir</button>
        </div>
      </div>
    `;
  });
};

window.alternarPromocao = async function(id) {
  const promo = promocoes.find(p => p.id === id);
  if (!promo) return;

  await atualizarPromocao(id, { ativa: !promo.ativa });
};

window.excluirPromocaoAdmin = async function(id) {
  const promo = promocoes.find(p => p.id === id);
  if (!promo) return;

  if (!confirm(`Excluir a promoção "${promo.titulo}"?`)) return;

  await excluirPromocao(id);
};

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
    configStatusLoja: lojaConfig.statusLoja || "aberta"
  };

  Object.entries(campos).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.value = valor;
  });
}

window.salvarConfiguracoesLoja = async function() {
  const dados = {
    nomeLoja: limparTexto(document.getElementById("configNomeLoja").value) || "Delícias da Vó",
    slogan: limparTexto(document.getElementById("configSlogan").value),
    instagram: limparTexto(document.getElementById("configInstagram").value),
    whatsapp: limparTexto(document.getElementById("configWhatsapp").value) || "5518991178906",
    endereco: limparTexto(document.getElementById("configEndereco").value),
    horario: limparTexto(document.getElementById("configHorario").value),
    entrega: limparTexto(document.getElementById("configEntrega").value),
    retirada: limparTexto(document.getElementById("configRetirada").value),
    statusLoja: document.getElementById("configStatusLoja").value
  };

  await salvarConfiguracoes(dados);

  const status = document.getElementById("statusConfig");
  status.style.display = "block";
  status.innerHTML = "<strong>Configurações salvas!</strong><br>As alterações serão usadas no sistema.";

  setTimeout(() => status.style.display = "none", 4000);
};
