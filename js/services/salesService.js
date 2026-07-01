import { db, collection, addDoc, doc, updateDoc, onSnapshot, serverTimestamp, query, where } from "../core/firebase.js";
import { hojeISO, agoraHora } from "../core/utils.js";

export let vendasHoje = [];

export function observarVendasHoje(callback) {
  const q = query(collection(db, "vendas"), where("dataISO", "==", hojeISO()));
  return onSnapshot(q, (snapshot) => {
    vendasHoje = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })).sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
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
    const novoEstoque = Math.max(0, Number(item.estoqueAtual || 0) - Number(item.quantidade || 0));
    await updateDoc(doc(db, "produtos", item.id), { estoque: novoEstoque, atualizadoEm: serverTimestamp() });
  }

  return venda;
}

export function resumoCaixa(vendas) {
  const resumo = { Pix: 0, Dinheiro: 0, "Cartão débito": 0, "Cartão crédito": 0, Total: 0, Quantidade: vendas.length };
  vendas.forEach(venda => {
    resumo[venda.pagamento] = (resumo[venda.pagamento] || 0) + Number(venda.total || 0);
    resumo.Total += Number(venda.total || 0);
  });
  return resumo;
}
