// routes/calculation.js
const { Router } = require('express');

const router = Router();

// --- Lógica do Cálculo ---
function calcularBeneficioMensal(saldoTotalAcumulado, formaRecebimento, parametroRecebimento) {
    // Validação básica de tipos
    if (typeof saldoTotalAcumulado !== 'number' || saldoTotalAcumulado <= 0) {
        return { erro: "Saldo total acumulado deve ser um número positivo." };
    }
    if (typeof formaRecebimento !== 'string') {
        return { erro: "Forma de recebimento deve ser uma string." };
    }
    if (typeof parametroRecebimento !== 'number' ) {
         return { erro: "Parâmetro de recebimento deve ser um número." };
    }

    const formasValidas = ['valor_fixo', 'percentual_saldo', 'prazo_definido'];
    if (!formasValidas.includes(formaRecebimento)) {
        return { erro: `Forma de recebimento '${formaRecebimento}' inválida. Use uma de: ${formasValidas.join(', ')}` };
    }

     if (parametroRecebimento <= 0) {
         if (formaRecebimento === 'valor_fixo' || formaRecebimento === 'prazo_definido') {
             return { erro: `Parâmetro de recebimento (${parametroRecebimento}) deve ser positivo para a forma '${formaRecebimento}'.` };
         } else if (formaRecebimento === 'percentual_saldo' && parametroRecebimento < 0) {
              return { erro: `Parâmetro de recebimento (${parametroRecebimento}) não pode ser negativo para a forma '${formaRecebimento}'.` };
         }
     }

    let beneficioCalculado = 0.0;
    let observacao = null; // Para adicionar notas específicas

    try {
        if (formaRecebimento === 'valor_fixo') {
            beneficioCalculado = parametroRecebimento;
            console.log(`Forma: Valor Fixo. Benefício Mensal Solicitado: R$ ${beneficioCalculado.toFixed(2)}`);

        } else if (formaRecebimento === 'percentual_saldo') {
            const percentual = parametroRecebimento / 100.0;
            beneficioCalculado = saldoTotalAcumulado * percentual;
            console.log(`Forma: Percentual do Saldo (${parametroRecebimento}%). Benefício Mensal (calculado sobre saldo inicial): R$ ${beneficioCalculado.toFixed(2)}`);
            observacao = "Valor referente ao primeiro mês. O valor pode variar nos meses seguintes.";

        } else if (formaRecebimento === 'prazo_definido') {
            const anos = parametroRecebimento;
            // --- AJUSTE AQUI: Multiplica por 13 parcelas por ano ---
            const totalParcelas = anos * 13;
            // ------------------------------------------------------

            if (totalParcelas === 0) {
                return { erro: "Prazo definido resulta em 0 parcelas." };
            }
             if (saldoTotalAcumulado === Infinity || totalParcelas === Infinity || !isFinite(saldoTotalAcumulado / totalParcelas)) {
                 return { erro: "Cálculo resultaria em valor infinito ou inválido." };
             }

            beneficioCalculado = saldoTotalAcumulado / totalParcelas;
            console.log(`Forma: Prazo Definido (${anos} anos, 13 parcelas/ano). Benefício por Parcela (estimativa simples): R$ ${beneficioCalculado.toFixed(2)}`);
            observacao = `Calculado para ${totalParcelas} parcelas totais (${anos} anos x 13 parcelas/ano).`;
        }

        // Arredonda para 2 casas decimais e converte para número
        const beneficioFinal = parseFloat(beneficioCalculado.toFixed(2));

        if (isNaN(beneficioFinal)) {
             return { erro: "Resultado do cálculo não é um número válido."}
        }

        // Retorna sucesso
        const resultado = {
            formaRecebimento: formaRecebimento,
            parametroRecebimento: parametroRecebimento,
            beneficioMensalCalculado: beneficioFinal // Mantemos o nome por consistência, mas representa o valor da parcela
        };
        if(observacao){
            resultado.observacao = observacao; // Adiciona a observação se houver
        }
        return resultado;


    } catch (error) {
        console.error("Erro inesperado no cálculo:", error);
        // Retorna erro genérico do servidor
        return { erro: "Ocorreu um erro interno ao calcular o benefício.", detalhes: error.message };
    }
}

// --- Rota da API ---
router.post('/calcular-beneficio', (req, res) => {
    console.log('Recebida requisição POST em /api/calcular-beneficio');
    console.log('Corpo da requisição:', req.body);

    // Extrai os dados do corpo da requisição
    const { saldoTotalAcumulado, formaRecebimento, parametroRecebimento } = req.body;

    // Validação básica de presença dos campos
    if (saldoTotalAcumulado === undefined || formaRecebimento === undefined || parametroRecebimento === undefined) {
        console.log('Erro: Campos obrigatórios ausentes na requisição.');
        return res.status(400).json({ erro: "Campos obrigatórios ausentes: saldoTotalAcumulado, formaRecebimento, parametroRecebimento" });
    }

    // Chama a função de cálculo
    const resultado = calcularBeneficioMensal(saldoTotalAcumulado, formaRecebimento, parametroRecebimento);

    // Verifica se houve erro no cálculo
    if (resultado.erro) {
        console.log('Erro retornado pela função de cálculo:', resultado.erro);
        // Se a função retornou um erro conhecido, envia como Bad Request (400)
        // Se for um erro interno inesperado, poderia ser um 500, mas vamos manter 400 por simplicidade se a função capturou
        const statusCode = resultado.detalhes ? 500 : 400;
        return res.status(statusCode).json(resultado); // Envia o objeto de erro como resposta JSON
    } else {
        console.log('Cálculo bem-sucedido:', resultado);
        // Se o cálculo foi bem-sucedido, envia o resultado com status OK (200)
        return res.status(200).json(resultado); // Envia o objeto de resultado como resposta JSON
    }
});


module.exports = router; // Exporta o roteador