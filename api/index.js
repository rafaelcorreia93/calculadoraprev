const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // Porta da API
const path = require('path');
const cors = require('cors'); // <--- 1. Importe o CORS

// Configura o dotenv para carregar o arquivo .env da pasta raiz (um nível acima de 'api')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// --- Configuração do CORS ---
// Define as opções do CORS. Neste caso, permite apenas a origem específica.
const corsOptions = {
    origin: 'http://localhost:8081', // <--- Permite requisições APENAS desta origem
    optionsSuccessStatus: 200 // Alguns navegadores legados (IE11, vários SmartTVs) engasgam com 204
  };
  
  app.use(cors(corsOptions)); // <--- 2. Use o middleware CORS com as opções ANTES das rotas

// Importar cálculos
const calcularAportes = require('./routes/calcular-aportes'); // Importa aportes
const calcularInvestimento = require('./routes/calcular-investimento'); // Importa investimento
const checarElegibilidade = require('./routes/calcular-elegibilidade'); // Importa Elegibilidade
const calcularBeneficioMensal = require('./routes/calcular-primeiro-beneficio'); // Importa Beneficio
const calcularEvolucaoBeneficio = require('./routes/calcular-evolucao-beneficio'); // Importa Beneficio
const calcularBeneficioIdeal = require('./routes/calcular-beneficio-ideal'); // Importa Beneficio
const login = require('./routes/login'); // Importa Login
const consultaPrevidencia = require('./routes/consulta-previdencia');
const consultaCadastro = require('./routes/consulta-cadastro');


// Middleware para parsear JSON no corpo da requisição
app.use(express.json());

// --- Rotas da API ---

// Rota raiz para verificar se a API está online
app.get('/', (req, res) => {
    res.send('API de Cálculo de Previdência Privada Online!');
});

// Rotas de Negócio
app.use('/api', calcularAportes);
app.use('/api', calcularInvestimento);
app.use('/api', checarElegibilidade);
app.use('/api', calcularBeneficioMensal);
app.use('/api', calcularEvolucaoBeneficio);
app.use('/api', calcularBeneficioIdeal);
app.use('/api', login);
app.use('/api', consultaPrevidencia);
app.use('/api', consultaCadastro);

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor da API rodando em http://localhost:${port}`);
});