require('dotenv').config(); // Carrega variáveis do .env para process.env
// Importar módulos necessários
const { Router } = require('express');
const router = Router();
const jwt = require('jsonwebtoken');


// --- Configuração ---
const PORT = process.env.PORT || 3000; // Porta do servidor
const JWT_SECRET = process.env.JWT_SECRET; // Segredo para assinar o JWT

if (!JWT_SECRET) {
  console.error("ERRO FATAL: Variável de ambiente JWT_SECRET não definida.");
  process.exit(1); // Encerra se o segredo não estiver configurado
}

// --- Dados de Exemplo (Simulação de Banco de Dados) ---
// Em um cenário real, você buscaria isso em um banco de dados
// e compararia a senha usando bcrypt.compare()
const usuariosSimulados = [
  { cpf: "83683615834", senha: "Vivest@2025", id: 1, nome: "ABIGAIL APARECIDA ALONSO" },
  { cpf: "59543280800", senha: "123456", id: 2, nome: "JOAO BATISTA MARQUES" }
];

// --- Endpoint de Login ---
router.post('/login', (req, res) => {
  // 1. Extrair CPF e Senha do corpo da requisição
  const { cpf, senha } = req.body;

  console.log(`Tentativa de login recebida para CPF: ${cpf}`); // Log para depuração

  // 2. Validação básica de entrada
  if (!cpf || !senha) {
    return res.status(400).json({ message: 'CPF e Senha são obrigatórios.' });
  }

  // 3. Simulação da Autenticação
  // Encontra o usuário pelo CPF (em um app real, faria SELECT no DB)
  const usuarioEncontrado = usuariosSimulados.find(user => user.cpf === cpf);

  // Verifica se o usuário existe E se a senha corresponde
  // IMPORTANTE: NUNCA compare senhas em texto plano assim em produção!
  // Use bibliotecas como bcrypt para hash e comparação segura.
  if (!usuarioEncontrado || usuarioEncontrado.senha !== senha) {
     console.log(`Falha na autenticação para CPF: ${cpf}`); // Log para depuração
     // Retorna 401 Unauthorized se as credenciais estiverem incorretas
     // Não dê informações específicas sobre o que falhou (CPF ou senha)
     return res.status(401).json({ message: 'Credenciais inválidas.' });
  }

  // 4. Autenticação bem-sucedida: Gerar o Token JWT
  console.log(`Autenticação bem-sucedida para CPF: ${cpf}`); // Log para depuração

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