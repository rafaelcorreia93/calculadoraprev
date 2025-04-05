// server.js
const express = require('express');
const { calcularPrevidenciaComBonus } = require('./calculator'); // Importa a função

const app = express();
const PORT = process.env.PORT || 3000; // Usa a porta do ambiente ou 3000

// Middleware para entender JSON no corpo das requisições
app.use(express.json());

// Rota da API para o cálculo
app.post('/api/previdencia/calcular', (req, res) => {
    // 1. Extrair dados do corpo da requisição
    const { vp, pmt, taxaAnual, anos } = req.body;

    // 2. Validação básica de presença dos dados
    if (vp === undefined || pmt === undefined || taxaAnual === undefined || anos === undefined) {
        return res.status(400).json({
            error: 'Requisição inválida. Faltando parâmetros.',
            required_params: ['vp (Valor Presente)', 'pmt (Aporte Mensal)', 'taxaAnual (Ex: 0.08 para 8%)', 'anos (Número de anos)']
         });
    }

    // 3. Chamar a função de cálculo
    // Certifique-se que os valores são números antes de passar
    const resultado = calcularPrevidenciaComBonus(
        Number(vp),
        Number(pmt),
        Number(taxaAnual),
        Number(anos)
    );

    // 4. Verificar se houve erro no cálculo (validação interna na função)
    if (resultado.error) {
        // Se a função de cálculo retornou um erro, envia como Bad Request
        return res.status(400).json({ error: resultado.error });
    }

    // 5. Enviar a resposta de sucesso
    res.status(200).json({
        message: 'Cálculo realizado com sucesso!',
        parametrosEntrada: { vp, pmt, taxaAnual, anos },
        resultado: resultado // Inclui o valorTotal e os detalhes
    });
});

// Rota de "health check" ou inicial
app.get('/', (req, res) => {
    res.send('API de Cálculo de Previdência está rodando!');
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Endpoint de cálculo: POST http://localhost:${PORT}/api/previdencia/calcular`);
});