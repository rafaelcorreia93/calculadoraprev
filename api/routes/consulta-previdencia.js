require('dotenv').config(); // Carrega variáveis do .env para process.env
const { Router } = require('express');
const router = Router();
const hash = require('./gerarHash'); // Importa Hash

const apiUrlProdutos = 'https://vivest-hmg.azure-api.net/apis/api-cadastro-dados-cadastrais/ListaProdutos/';
const apiUrlDetalhe = 'https://vivest-hmg.azure-api.net/apis/api-cadastro-dados-cadastrais/v1/previdencia/participante/Planos/detalhe';
const apiUrlCadastro = 'https://vivest-hmg.azure-api.net/apis/api-cadastro-dados-cadastrais/v1/previdencia/Participante';

// --- Rota ---
router.post('/dados-previdencia', async (req, res) => {

    const token = await hash.gerarToken();
    
    try {
            const responseDetalheProdutos = await fetch(apiUrlDetalhe, {
                method: 'POST', // Opcional, GET é o padrão
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer '+ token,
                    'Ocp-Apim-Subscription-Key': process.env.subsciption
                },
                body: JSON.stringify(req.body)
           });
           if (!responseDetalheProdutos.ok) {
                console.log('deu erro na detalhe');
                
            }
    
           const detalhesProduto = await responseDetalheProdutos.json();
           
            res.json(detalhesProduto.data);
        
        
    } catch (error) {
        console.error("Erro ao gerar o hash:", error);
        // Retorne um erro apropriado no seu endpoint da API
    }
});
module.exports = router; // Exporta o roteador