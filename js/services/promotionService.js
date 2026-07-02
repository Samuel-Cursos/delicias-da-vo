import { db, collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp } from "../core/firebase.js";

export let promocoes = [];

export function observarPromocoes(callback) {
  return onSnapshot(collection(db, "promocoes"), (snapshot) => {
    promocoes = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));

    callback(promocoes);
  });
}

export async function salvarPromocao(promocao) {
  await setDoc(doc(db, "promocoes", promocao.id), {
    ...promocao,
    atualizadoEm: serverTimestamp(),
    criadoEm: promocao.criadoEm || serverTimestamp()
  }, { merge: true });
}

export async function atualizarPromocao(id, dados) {
  await updateDoc(doc(db, "promocoes", id), {
    ...dados,
    atualizadoEm: serverTimestamp()
  });
}

export async function excluirPromocao(id) {
  await deleteDoc(doc(db, "promocoes", id));
}

export function promocaoAtivaParaProduto(produtoId) {
  const hoje = new Date().toISOString().slice(0, 10);

  return promocoes.find(p => {
    if (!p.ativa) return false;
    if (p.produtoId !== produtoId) return false;

    const inicioOk = !p.inicio || p.inicio <= hoje;
    const fimOk = !p.fim || p.fim >= hoje;

    return inicioOk && fimOk;
  });
}
