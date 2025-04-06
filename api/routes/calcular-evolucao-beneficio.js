// Importar funções específicas do date-fns
const { Router } = require('express');
const router = Router();

// Helper para formatar Date para YYYY-MM
function formatarDataYYYYMM(date) {
    if (!(date instanceof Date) || isNaN(date)) return null;
    const ano = date.getFullYear();
    const mes = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${ano}-${mes}`;
}

// Helper para parsear YYYY-MM para Date
function parsearDataYYYYMM(dataStr) {
    if (!dataStr || typeof dataStr !== 'string' || !/^\d{4}-\d{2}$/.test(dataStr)) return null;
    const [ano, mes] = dataStr.split('-').map(Number);
    const dataObj = new Date(ano, mes - 1, 1);
    if (dataObj.getFullYear() !== ano || dataObj.getMonth() !== mes - 1) return null;
    return dataObj;
}


// --- Função de Simulação de Evolução (Atualizada com Rentabilidade e Arredondamento da Taxa) ---
function simularEvolucaoBeneficio(
    saldoInicial,
    formaRecebimento,
    parametroRecebimento,
    idadeInicialAnos,
    dataInicioBeneficioStr,
    idadeLimite,
    taxaRendimentoAnualPercentual
) {
    // --- Validações Robustas ---
    if (typeof saldoInicial !== 'number' || saldoInicial <= 0) return { erro: "Saldo inválido." };
    if (!['valor_fixo', 'percentual_saldo', 'prazo_definido'].includes(formaRecebimento)) return { erro: "Forma de recebimento inválida." };
    if (typeof parametroRecebimento !== 'number' || parametroRecebimento <= 0) {
        if (formaRecebimento !== 'percentual_saldo' || parametroRecebimento < 0) return { erro: "Parâmetro de recebimento inválido." };
    }
    if (typeof idadeInicialAnos !== 'number' || !Number.isInteger(idadeInicialAnos) || idadeInicialAnos < 0) return { erro: "Idade inicial inválida." };
    if (typeof idadeLimite !== 'number' || !Number.isInteger(idadeLimite) || idadeLimite <= idadeInicialAnos) return { erro: "Idade limite inválida." };
    if (typeof taxaRendimentoAnualPercentual !== 'number' || taxaRendimentoAnualPercentual < 0) {
        return { erro: "Taxa de rendimento anual inválida (deve ser número >= 0)." };
    }

    const dataInicio = parsearDataYYYYMM(dataInicioBeneficioStr);
    if (!dataInicio) return { erro: "Data de início inválida (formato YYYY-MM)." };

    // --- Cálculo da Taxa Mensal Equivalente ---
    const taxaAnualDecimal = taxaRendimentoAnualPercentual / 100.0;
    const taxaMensalDecimal = taxaAnualDecimal === 0 ? 0.0 : (1 + taxaAnualDecimal)**(1/12) - 1;
    const taxaMensalPercentual = taxaMensalDecimal * 100; // Mantém precisão interna para cálculos

    // --- Inicialização da Simulação ---
    let saldoRemanescente = saldoInicial;
    let idadeAtualAnos = idadeInicialAnos;
    let idadeAtualMesesAno = 0;
    let mesSimulacao = 0;
    const historicoMensal = [];
    let motivoFimSimulacao = "";
    let saldoFinalAposLimiteIdade = null;
    let dataAtual = new Date(dataInicio);
    let dataFimBeneficioStr = null;

    // --- Pré-cálculo para 'prazo_definido' (AGORA considera juros) ---
    let beneficioFixoPrazoDefinido = 0;
    if (formaRecebimento === 'prazo_definido') {
        const anos = parametroRecebimento;
        const totalParcelas = anos * 13; // n
        if (totalParcelas <= 0) return { erro: "Prazo definido resulta em 0 parcelas." };

        try {
            if (taxaMensalDecimal === 0) {
                if (!isFinite(saldoInicial / totalParcelas)) throw new Error("Divisão inválida");
                beneficioFixoPrazoDefinido = parseFloat((saldoInicial / totalParcelas).toFixed(2));
            } else {
                const i = taxaMensalDecimal;
                const n = totalParcelas;
                const fator_juros_n = (1 + i)**n;
                if (!isFinite(fator_juros_n)) throw new Error("Cálculo de fator de juros resultou em infinito (taxa/prazo altos?).");
                const numerador = saldoInicial * (i * fator_juros_n);
                const denominador = fator_juros_n - 1;
                if (denominador === 0) throw new Error("Divisão por zero no cálculo PMT.");
                if (!isFinite(numerador / denominador)) throw new Error("Cálculo PMT resultou em valor inválido.");
                beneficioFixoPrazoDefinido = parseFloat((numerador / denominador).toFixed(2));
            }
             if (isNaN(beneficioFixoPrazoDefinido) || beneficioFixoPrazoDefinido < 0) {
                 throw new Error("Valor da parcela calculado é inválido.");
             }
        } catch (error) {
             console.error("Erro ao calcular PMT para prazo_definido:", error);
             return { erro: `Erro ao calcular parcela para prazo definido: ${error.message}` };
        }
    }

    // --- Loop da Simulação Mensal ---
    const MAX_ITERATIONS = (idadeLimite - idadeInicialAnos + 1) * 13 * 3;
    let iterationCount = 0;

    while (saldoRemanescente > 0 && idadeAtualAnos < idadeLimite && iterationCount < MAX_ITERATIONS) {
        iterationCount++;
        mesSimulacao++;
        const mesDataStr = formatarDataYYYYMM(dataAtual);

        // 1. Aplicar Rendimento Mensal
        let rendimentoMes = 0;
        if (taxaMensalDecimal > 0 && saldoRemanescente > 0) {
            rendimentoMes = parseFloat((saldoRemanescente * taxaMensalDecimal).toFixed(2)); // Rendimento é calculado com taxa precisa, arredondado para R$
             if (!isFinite(rendimentoMes) || isNaN(rendimentoMes)) {
                 motivoFimSimulacao = "Erro no cálculo do rendimento mensal."; break;
             }
             saldoRemanescente = parseFloat((saldoRemanescente + rendimentoMes).toFixed(2));
             if (!isFinite(saldoRemanescente) || isNaN(saldoRemanescente)) {
                  motivoFimSimulacao = "Erro no saldo após rendimento."; break;
             }
        }

        // 2. Calcular Benefício para o Mês Atual
        let beneficioMesCalculado = 0;
        if (formaRecebimento === 'valor_fixo') {
            beneficioMesCalculado = parametroRecebimento;
        } else if (formaRecebimento === 'percentual_saldo') {
            beneficioMesCalculado = parseFloat((saldoRemanescente * (parametroRecebimento / 100.0)).toFixed(2));
        } else if (formaRecebimento === 'prazo_definido') {
            beneficioMesCalculado = beneficioFixoPrazoDefinido;
        }
        if (isNaN(beneficioMesCalculado) || beneficioMesCalculado < 0) {
            motivoFimSimulacao = "Erro no cálculo do benefício mensal."; break;
        }

        // 3. Verificar Saldo e Calcular Saque Real
        let valorSaqueReal = 0;
        let saldoAntesSaque = saldoRemanescente; // Guarda o saldo antes do saque para o histórico
        if (saldoRemanescente <= 0) {
             valorSaqueReal = 0;
             if(!motivoFimSimulacao) motivoFimSimulacao = "Saldo esgotado (antes do saque)";
             saldoRemanescente = 0;
        }
         else if (beneficioMesCalculado >= saldoRemanescente) {
            valorSaqueReal = saldoRemanescente;
            saldoRemanescente = 0;
            if(!motivoFimSimulacao) motivoFimSimulacao = "Saldo esgotado (neste saque)";
        } else {
            valorSaqueReal = beneficioMesCalculado;
            saldoRemanescente = parseFloat((saldoRemanescente - valorSaqueReal).toFixed(2));
            if (!isFinite(saldoRemanescente) || isNaN(saldoRemanescente)) {
                 motivoFimSimulacao = "Erro no saldo após saque."; break;
            }
        }

        // Define a data final (do último evento processado)
        dataFimBeneficioStr = mesDataStr;

        // Registrar o histórico do mês
        historicoMensal.push({
            mes: mesSimulacao,
            dataMes: mesDataStr,
            idadeAnos: idadeAtualAnos,
            idadeMesesAno: idadeAtualMesesAno + 1,
            saldoAntesRendimento: parseFloat((saldoAntesSaque - rendimentoMes).toFixed(2)), // Saldo no exato início do mês
            rendimentoMes: rendimentoMes,
            saldoAposRendimento: saldoAntesSaque, // Saldo após rendimento, antes do saque
            beneficioSolicitado: beneficioMesCalculado,
            beneficioSacado: valorSaqueReal,
            saldoRemanescente: saldoRemanescente // Saldo final do mês
        });

        // Sair do loop se o saldo acabou ou erro ocorreu
        if (saldoRemanescente <= 0 || motivoFimSimulacao.startsWith("Erro")) {
             if (saldoRemanescente <= 0 && !motivoFimSimulacao) motivoFimSimulacao = "Saldo esgotado";
            break;
        }

        // 4. Avançar para o Próximo Mês/Ciclo
        dataAtual.setMonth(dataAtual.getMonth() + 1);
        idadeAtualMesesAno++;
        if (idadeAtualMesesAno >= 13) {
            idadeAtualAnos++;
            idadeAtualMesesAno = 0;
            if (idadeAtualAnos >= idadeLimite) {
                motivoFimSimulacao = "Idade limite atingida";
                saldoFinalAposLimiteIdade = saldoRemanescente;
                break;
            }
        }
    } // Fim do while

    // Tratamento de Fim de Loop por Iterações ou Condição Não Prevista
    if (iterationCount >= MAX_ITERATIONS) {
        console.warn("Simulação atingiu o número máximo de iterações.");
        if (!motivoFimSimulacao) motivoFimSimulacao = "Limite máximo de iterações atingido.";
        if(idadeAtualAnos >= idadeLimite && saldoFinalAposLimiteIdade === null) saldoFinalAposLimiteIdade = saldoRemanescente;
    } else if (!motivoFimSimulacao) {
        if (saldoRemanescente <= 0) motivoFimSimulacao = "Saldo esgotado";
        else if (idadeAtualAnos >= idadeLimite) {
            motivoFimSimulacao = "Idade limite atingida";
            saldoFinalAposLimiteIdade = saldoRemanescente;
        } else motivoFimSimulacao = "Condição de parada não determinada";
    }

    if(historicoMensal.length === 0){ dataFimBeneficioStr = null; }

    // Retorna o resultado da simulação
    return {
        parametrosIniciais: {
            saldoInicial,
            formaRecebimento,
            parametroRecebimento,
            idadeInicialAnos,
            dataInicioBeneficio: dataInicioBeneficioStr,
            idadeLimite,
            taxaRendimentoAnualPercentual: taxaRendimentoAnualPercentual,
            // --- ALTERAÇÃO APLICADA AQUI ---
            taxaRendimentoMensalEquivalentePercentual: parseFloat(taxaMensalPercentual.toFixed(9)) // Ajustado para 9 casas decimais
            // ------------------------------
        },
        motivoFimSimulacao: motivoFimSimulacao,
        dataFimBeneficio: dataFimBeneficioStr,
        saldoFinalAposLimiteIdade: saldoFinalAposLimiteIdade,
        totalMesesSimulados: mesSimulacao,
        idadeFinalAlcancada: { anos: idadeAtualAnos, mesesAno: idadeAtualMesesAno + 1 },
        historicoMensal: historicoMensal
    };
}

// --- Rota da API para Simulação (Atualizada) ---
router.post('/calcular-evolucao', (req, res) => {
    console.log('Recebida requisição POST em /api/simular-evolucao');
    console.log('Corpo da requisição:', req.body);

    const {
        saldoTotalAcumulado,
        formaRecebimento,
        parametroRecebimento,
        idadeAtual,
        dataInicioBeneficio,
        idadeLimite,
        taxaRendimentoAnualPercentual // Novo campo esperado
    } = req.body;

    // Validação de presença dos campos (inclui o novo campo)
    const camposObrigatorios = ['saldoTotalAcumulado', 'formaRecebimento', 'parametroRecebimento', 'idadeAtual', 'dataInicioBeneficio', 'idadeLimite', 'taxaRendimentoAnualPercentual'];
    const camposAusentes = camposObrigatorios.filter(campo => req.body[campo] === undefined || req.body[campo] === null); // Permite 0 para taxa

    if (camposAusentes.length > 0) {
        console.log(`Erro: Campos obrigatórios ausentes: ${camposAusentes.join(', ')}`);
        return res.status(400).json({ erro: `Campos obrigatórios ausentes: ${camposAusentes.join(', ')}` });
    }

     // Chama a função de simulação (agora com a taxa de rendimento)
    const resultadoSimulacao = simularEvolucaoBeneficio(
        saldoTotalAcumulado,
        formaRecebimento,
        parametroRecebimento,
        idadeAtual,
        dataInicioBeneficio,
        idadeLimite,
        taxaRendimentoAnualPercentual // Passa a taxa
    );

    if (resultadoSimulacao.erro) {
        console.log('Erro retornado pela função de simulação:', resultadoSimulacao.erro);
        return res.status(400).json(resultadoSimulacao);
    } else {
        console.log('Simulação bem-sucedida.');
        return res.status(200).json(resultadoSimulacao);
    }
});



module.exports = router; // Exporta o roteador