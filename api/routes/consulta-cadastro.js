require('dotenv').config(); // Carrega variáveis do .env para process.env
const { Router } = require('express');
const router = Router();
const hash = require('./gerarHash'); // Importa Hash

const apiUrlCadastro = 'https://vivest-hmg.azure-api.net/apis/api-cadastro-dados-cadastrais/v1/previdencia/Participante';

// --- Rota ---
router.post('/dados-cadastro', async (req, res) => {

    const token = await hash.gerarToken();
    
    try {
        const responseDadosCadastrais = await fetch(apiUrlCadastro, {
            method: 'POST', // Opcional, GET é o padrão
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': 'Bearer '+ token,
                'Ocp-Apim-Subscription-Key': process.env.subsciption
            },
            body: JSON.stringify(req)
       });
       if (!responseDadosCadastrais.ok) {
            console.log('deu erro na cadastro');
            
        }

       const detalhesCadastro = await responseDadosCadastrais.json();
       
        res.json(detalhesCadastro);
    
    } catch (error) {
        console.error("Erro ao gerar o hash:", error);
        // Retorne um erro apropriado no seu endpoint da API
    }
});
module.exports = router; // Exporta o roteador