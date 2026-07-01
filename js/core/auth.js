import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, doc, getDoc, setDoc, serverTimestamp } from "./firebase.js";
import { APP_CONFIG } from "./config.js";

window.usuarioAtual = null;
window.isAdmin = false;

async function salvarUsuario(user) {
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      nome: user.displayName || "",
      email: user.email || "",
      foto: user.photoURL || "",
      tipo: APP_CONFIG.admins.includes(user.email) ? "admin" : "cliente",
      criadoEm: serverTimestamp()
    });
  }
}

window.loginGoogle = async function () {
  try {
    const resultado = await signInWithPopup(auth, googleProvider);
    await salvarUsuario(resultado.user);
  } catch (erro) {
    console.error(erro);
    alert("Erro ao entrar com Google.");
  }
};

window.sairConta = async function () { await signOut(auth); };

export function iniciarAuth() {
  onAuthStateChanged(auth, async (user) => {
    window.usuarioAtual = user;
    window.isAdmin = user ? APP_CONFIG.admins.includes(user.email) : false;

    const area = document.getElementById("areaUsuario");
    const adminArea = document.getElementById("adminUsuario");

    if (!user) {
      if (area) area.innerHTML = `<button onclick="loginGoogle()" class="btn-login-google">Entrar com Google</button>`;
      if (adminArea) adminArea.innerHTML = `<button onclick="loginGoogle()" class="btn-login-google">Entrar como administrador</button>`;
      document.body.classList.remove("admin-liberado");
      return;
    }

    await salvarUsuario(user);

    if (area) {
      area.innerHTML = `<div class="user-chip"><img src="${user.photoURL || ""}"><span>${user.displayName || user.email}</span>${window.isAdmin ? `<a href="pages/admin.html">ADM</a>` : ""}<button onclick="sairConta()">Sair</button></div>`;
    }

    if (adminArea) {
      if (!window.isAdmin) {
        adminArea.innerHTML = `<div class="admin-blocked"><strong>Acesso negado</strong><p>Este e-mail não é administrador.</p><button onclick="sairConta()">Sair</button></div>`;
        document.body.classList.remove("admin-liberado");
        return;
      }
      adminArea.innerHTML = `<div class="user-chip"><img src="${user.photoURL || ""}"><span>ADM: ${user.displayName || user.email}</span><button onclick="sairConta()">Sair</button></div>`;
      document.body.classList.add("admin-liberado");
      if (typeof window.iniciarAdminDepoisLogin === "function") window.iniciarAdminDepoisLogin();
    }
  });
}
