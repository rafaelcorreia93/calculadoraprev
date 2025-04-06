const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // Porta da API

// Importar cálculos
const calcularAportes = require('./routes/calcular-aportes'); // Importa aportes
const calcularInvestimento = require('./routes/calcular-investimento'); // Importa investimento
const checarElegibilidade = require('./routes/calcular-elegibilidade'); // Importa Elegibilidade
const calcularBeneficioMensal = require('./routes/calcular-primeiro-beneficio'); // Importa Beneficio
const calcularEvolucaoBeneficio = require('./routes/calcular-evolucao-beneficio'); // Importa Beneficio

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

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor da API rodando em http://localhost:${port}`);
});