require('dotenv').config(); // Carrega variáveis do .env para process.env
// Importar módulos necessários
const { Router } = require('express');
const router = Router();
const jwt = require('jsonwebtoken');
const hash = require('./gerarHash'); // Importa Hash

// --- Configuração ---
const PORT = process.env.PORT || 3000; // Porta do servidor
const apiUrlProdutos = 'https://vivest-hmg.azure-api.net/apis/api-cadastro-dados-cadastrais/ListaProdutos/';
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

  // retorna ok
  return res.status(200).json({
    message: 'Login bem-sucedido!'
  });

});

// --- Endpoint de Dados Prev e Token ---
router.post('/generateToken', async (req, res) => {
    const cpf = req.body.cpf;
    const token = await hash.gerarToken();

    // Consultar dados de produto
    const responseProdutos = await fetch(apiUrlProdutos+ cpf, {
      method: 'GET', // Opcional, GET é o padrão
      headers: {
          'Accept': 'application/json',
          'Ocp-Apim-Subscription-Key': process.env.subsciption,
          'Authorization': 'Bearer '+ token
      }
    });
    if (!responseProdutos.ok) {
      // Se não foi OK, tenta ler o corpo do erro como texto
      const errorBody = await responseProdutos.text();
      console.error(`Erro ${responseProdutos.status} da API: ${errorBody}`);
      // Lança um erro para ser pego pelo catch externo
      throw new Error(`Erro da API externa: ${responseProdutos.status} - ${errorBody.substring(0, 100)}`);
    }
    const responseProdutosObj = await responseProdutos.json();
    if(!responseProdutosObj.data.length) {
        console.log('sem produto');
        res.json({'res': 'sem produto'});
    } else {
        // Extrair dados da previdência
        const produtoPrev = responseProdutosObj.data.find(item => {
          return item && item.produto === 'Previdencia';
        });
        if(produtoPrev) {
                // Dados que você quer incluir no token (NUNCA inclua a senha!)
        const payload = {
          cpf: cpf,
          empresa: produtoPrev.codigoEmpresa,
          matricula: produtoPrev.matricula.toString(),
          codPlano: produtoPrev.codigoPlano
        };
  
        // Opções do token (ex: tempo de expiração)
        const opcoes = {
          expiresIn: '30d' // Token expira em 1 hora (ex: '1d', '7d', '30m')
        };
  
        // Gerar o token
        try {
          const token = jwt.sign(payload, JWT_SECRET, opcoes);
  
          // 5. Retornar o token para o cliente
          return res.status(200).json({
            message: 'Dados carregados com sucesso!',
            token: token,
            produto: produtoPrev
          });
  
        } catch (error) {
            console.error("Erro ao gerar o token JWT:", error);
            return res.status(500).json({ message: "Erro interno ao tentar gerar o token." });
        }
        } else {
            return res.status(401).json({ message: 'Sem produto prev.' });
        }
  
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