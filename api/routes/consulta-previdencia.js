require('dotenv').config(); // Carrega variáveis do .env para process.env
const { Router } = require('express');
const router = Router();
const hash = require('./gerarHash'); // Importa Hash

const apiUrlProdutos = 'https://vivest-hmg.azure-api.net/apis/api-cadastro-dados-cadastrais/ListaProdutos/';
const apiUrlDetalhe = 'https://vivest-hmg.azure-api.net/apis/api-cadastro-dados-cadastrais/v1/previdencia/participante/Planos/detalhe';

// --- Rota ---
router.post('/dados-previdencia', async (req, res) => {

    const token = await hash.gerarToken();
    
    try {
        console.log('req: '+req.body.cpf);
        
        const responseProdutos = await fetch(apiUrlProdutos+ req.body.cpf, {
            method: 'GET', // Opcional, GET é o padrão
            headers: {
                'Accept': 'application/json',
                'Ocp-Apim-Subscription-Key': process.env.subsciption
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
        
        const produtoPrev = responseProdutosObj.data.find(item => {
            return item && item.produto === 'Previdencia';
          });

        const dadosParaConsultaDetalhe = {
            cpf: req.body.cpf,
            empresa: produtoPrev.codigoEmpresa,
            matricula: produtoPrev.matricula.toString(),
            codPlano: produtoPrev.codigoPlano
        }
        const teste = {
            cpf: "83683615834",
            empresa: 40,
            matricula: "596779",
            codPlano: 46
        }

        const responseDetalheProdutos = await fetch(apiUrlDetalhe, {
            method: 'POST', // Opcional, GET é o padrão
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': 'Bearer '+ token,
                'Ocp-Apim-Subscription-Key': process.env.subsciption
            },
            body: JSON.stringify(dadosParaConsultaDetalhe)
       });
       if (!responseDetalheProdutos.ok) {
            console.log('deu erro na detalhe');
            
        }

       const detalhesProduto = await responseDetalheProdutos.json();

       const dadosCompletos = {
        produto: produtoPrev,
        detalhe: detalhesProduto
       }
       
        res.json(dadosCompletos);
    
    } catch (error) {
        console.error("Erro ao gerar o hash:", error);
        // Retorne um erro apropriado no seu endpoint da API
    }
});
module.exports = router; // Exporta o roteador