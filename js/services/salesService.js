import { db, collection, addDoc, doc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, where } from "../core/firebase.js";
import { hojeISO, agoraHora } from "../core/utils.js";

export let vendasHoje = [];

export function observarVendasHoje(callback) {
  const q = query(collection(db, "vendas"), where("dataISO", "==", hojeISO()));

  return onSnapshot(q, (snapshot) => {
    vendasHoje = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));

    callback(vendasHoje);
  });
}

export async function registrarVendaRapida({ itens, pagamento, total, observacao }) {
  const venda = {
    tipo: "fisica",
    itens,
    pagamento,
    total,
    observacao: observacao || "",
    dataISO: hojeISO(),
    hora: agoraHora(),
    criadoEm: serverTimestamp()
  };

  await addDoc(collection(db, "vendas"), venda);

  for (const item of itens) {
    const produtoRef = doc(db, "produtos", item.id);
    const produtoSnap = await getDoc(produtoRef);
    if (!produtoSnap.exists()) continue;

    if (item.variacaoId) {
      const produtoData = produtoSnap.data();
      const variacoes = Array.isArray(produtoData.variacoes) ? produtoData.variacoes : [];
      const index = variacoes.findIndex(v => v.id === item.variacaoId);
      if (index >= 0) {
        const novoEstoque = Math.max(0, Number(variacoes[index].estoque || 0) - Number(item.quantidade || 0));
        await updateDoc(produtoRef, {
          [`variacoes.${index}.estoque`]: novoEstoque,
          atualizadoEm: serverTimestamp()
        });
        continue;
      }
    }

    const novoEstoque = Math.max(0, Number(item.estoqueAtual || 0) - Number(item.quantidade || 0));
    await updateDoc(produtoRef, {
      estoque: novoEstoque,
      atualizadoEm: serverTimestamp()
    });
  }

  return venda;
}

export async function excluirVendaComEstorno(venda) {
  if (!venda || !venda.id) {
    throw new Error("Venda inválida.");
  }

  for (const item of venda.itens || []) {
    const produtoRef = doc(db, "produtos", item.id);
    const produtoSnap = await getDoc(produtoRef);
    if (!produtoSnap.exists()) continue;

    if (item.variacaoId) {
      const produtoData = produtoSnap.data();
      const variacoes = Array.isArray(produtoData.variacoes) ? produtoData.variacoes : [];
      const index = variacoes.findIndex(v => v.id === item.variacaoId);
      if (index >= 0) {
        await updateDoc(produtoRef, {
          [`variacoes.${index}.estoque`]: Number(item.estoqueAtual || 0),
          atualizadoEm: serverTimestamp()
        });
        continue;
      }
    }

    const estoqueRestaurado = Number(item.estoqueAtual || 0);
    await updateDoc(produtoRef, {
      estoque: estoqueRestaurado,
      atualizadoEm: serverTimestamp()
    });
  }

  await deleteDoc(doc(db, "vendas", venda.id));
}

export function resumoCaixa(vendas) {
  const resumo = {
    Pix: 0,
    Dinheiro: 0,
    "Cartão débito": 0,
    "Cartão crédito": 0,
    Total: 0,
    Quantidade: vendas.length
  };

  vendas.forEach(venda => {
    resumo[venda.pagamento] = (resumo[venda.pagamento] || 0) + Number(venda.total || 0);
    resumo.Total += Number(venda.total || 0);
  });

  return resumo;
}
