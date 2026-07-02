export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ erro: "Método não permitido." });
  }

  try {
    const { nome } = req.body || {};

    if (!nome || !String(nome).trim()) {
      return res.status(400).json({ erro: "Informe o nome do produto." });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        erro: "GEMINI_API_KEY não configurada na Vercel."
      });
    }

    const prompt = `
Você é um assistente de cadastro para uma lanchonete brasileira chamada Delícias da Vó.

Produto informado: "${nome}"

Responda APENAS JSON válido, sem markdown.

Formato:
{
  "nome": "Nome corrigido",
  "categoria": "salgados | paes | bebidas | outros",
  "emoji": "emoji adequado",
  "descricao": "descrição curta e vendedora",
  "preco": número,
  "sabores": ["sabor 1", "sabor 2"],
  "sobEncomenda": true ou false,
  "destaque": true ou false
}

Regras:
- Categoria deve ser exatamente uma das opções.
- Use preço realista para lanchonete simples no interior de SP.
- Se não fizer sentido ter sabores, use [].
`;

    const resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.35,
            responseMimeType: "application/json"
          }
        })
      }
    );

    const data = await resposta.json();

    if (!resposta.ok) {
      return res.status(500).json({ erro: "Erro ao chamar Gemini.", detalhe: data });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({ erro: "Gemini não retornou texto." });
    }

    return res.status(200).json(JSON.parse(text));
  } catch (erro) {
    return res.status(500).json({
      erro: "Erro interno ao gerar sugestão.",
      detalhe: String(erro?.message || erro)
    });
  }
}
