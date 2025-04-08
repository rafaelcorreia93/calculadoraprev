require('dotenv').config(); // Carrega variáveis do .env para process.env
// Importar módulos necessários
const { Router } = require('express');
const router = Router();
const jwt = require('jsonwebtoken');


// --- Configuração ---
const PORT = process.env.PORT || 3000; // Porta do servidor
const JWT_SECRET = process.env.JWT_SECRET; // Segredo para assinar o JWT
const senhaMestre = 'Vivest@2025'

if (!JWT_SECRET) {
  console.error("ERRO FATAL: Variável de ambiente JWT_SECRET não definida.");
  process.exit(1); // Encerra se o segredo não estiver configurado
}

// --- Endpoint de Login ---
router.post('/login', (req, res) => {
  // 1. Extrair CPF e Senha do corpo da requisição
  const { cpf, senha } = req.body;

  // 2. Validação básica de entrada
  if (!cpf || !senha) {
    return res.status(400).json({ message: 'CPF e Senha são obrigatórios.' });
  }

  // Verifica se a senha corresponde
  if (senha !== senhaMestre) {
    return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  // Dados que você quer incluir no token (NUNCA inclua a senha!)
  const payload = {
    userId: usuarioEncontrado.id,
    cpf: usuarioEncontrado.cpf,
    nome: usuarioEncontrado.nome,
    // Você pode adicionar outras informações relevantes, como papéis (roles)
  };

  // Opções do token (ex: tempo de expiração)
  const opcoes = {
    expiresIn: '1h' // Token expira em 1 hora (ex: '1d', '7d', '30m')
  };

  // Gerar o token
  try {
    const token = jwt.sign(payload, JWT_SECRET, opcoes);

    // 5. Retornar o token para o cliente
    return res.status(200).json({
      message: 'Login bem-sucedido!',
      token: token
    });

  } catch (error) {
      console.error("Erro ao gerar o token JWT:", error);
      return res.status(500).json({ message: "Erro interno ao tentar gerar o token." });
  }
});

// --- Rota de Exemplo (protegida) ---
// Middleware simples para verificar o token (exemplo)
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato "Bearer TOKEN"

    if (token == null) return res.sendStatus(401); // Se não há token, não autorizado

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log("Erro na verificação do token:", err.message);
            return res.sendStatus(403); // Se o token for inválido/expirado, proibido
        }
        req.user = user; // Adiciona os dados do usuário decodificado à requisição
        next(); // Passa para a próxima rota/middleware
    });
};

router.get('/dados-protegidos', verificarToken, (req, res) => {
    // O middleware verificarToken já validou o token
    // Os dados do usuário estão em req.user (o payload do token)
    res.json({
        message: "Estes são dados protegidos!",
        usuario: req.user // Retorna os dados do payload do token
    });
});

module.exports = router; // Exporta o roteador