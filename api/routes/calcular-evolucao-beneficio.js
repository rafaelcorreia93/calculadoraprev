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



// --- Função de Simulação de Evolução (Atualizada com Saldo Mínimo) ---
function simularEvolucaoBeneficio(
    saldoInicial,
    formaRecebimento,
    parametroRecebimento,
    idadeInicialAnos,
    dataInicioBeneficioStr,
    idadeLimite,
    taxaRendimentoAnualPercentual,
    saldoMinimoPermitido
) {
    // --- Validações Robustas ---
    // ... (Validações como antes, incluindo saldoMinimoPermitido) ...
    if (typeof saldoInicial !== 'number' || saldoInicial <= 0) return { erro: "Saldo inicial inválido." };
    if (!['valor_fixo', 'percentual_saldo', 'prazo_definido'].includes(formaRecebimento)) return { erro: "Forma de recebimento inválida." };
    // ... etc ...
    if (typeof saldoMinimoPermitido !== 'number' || saldoMinimoPermitido < 0) return { erro: "Saldo mínimo permitido inválido." };
    const dataInicio = parsearDataYYYYMM(dataInicioBeneficioStr);
    if (!dataInicio) return { erro: "Data de início inválida (formato YYYY-MM)." };

    // --- Cálculo da Taxa Mensal Equivalente ---
    const taxaAnualDecimal = taxaRendimentoAnualPercentual / 100.0;
    const taxaMensalDecimal = taxaAnualDecimal === 0 ? 0.0 : (1 + taxaAnualDecimal)**(1/12) - 1;
    const taxaMensalPercentual = taxaMensalDecimal * 100;

    // --- Inicialização da Simulação ---
    let saldoRemanescente = saldoInicial;
    if (saldoRemanescente <= saldoMinimoPermitido) { /* ... retorno imediato como antes ... */ }

    let idadeAtualAnos = idadeInicialAnos;
    let idadeAtualMesesAno = 0;
    let mesSimulacao = 0;
    const historicoMensal = [];
    let motivoFimSimulacao = "";
    let saldoFinalAposLimiteIdade = null;
    let dataAtual = new Date(dataInicio);
    let dataFimBeneficioStr = null;

    // --- Pré-cálculo para 'prazo_definido' ---
    // (Cálculo PMT como antes, não afetado pela ordem de rentabilidade no loop)
    let beneficioFixoPrazoDefinido = 0;
    if (formaRecebimento === 'prazo_definido') { /* ... cálculo PMT como antes ... */ }

    // --- Loop da Simulação Mensal ---
    const MAX_ITERATIONS = (idadeLimite - idadeInicialAnos + 1) * 13 * 3;
    let iterationCount = 0;

    while (/* condição do while como antes: */ saldoRemanescente > saldoMinimoPermitido && idadeAtualAnos < idadeLimite && iterationCount < MAX_ITERATIONS) {
        iterationCount++;
        mesSimulacao++;
        const mesDataStr = formatarDataYYYYMM(dataAtual);
        const saldoInicioMes = saldoRemanescente; // Guarda o saldo no início exato do mês

        // --- 1. Calcular Benefício para o Mês Atual ---
        //    (Importante: 'percentual_saldo' agora usa o saldo do *início* do mês)
        let beneficioMesCalculado = 0;
        if (formaRecebimento === 'valor_fixo') {
            beneficioMesCalculado = parametroRecebimento;
        } else if (formaRecebimento === 'percentual_saldo') {
            // <<< MUDANÇA AQUI: Baseado no saldo ANTES de qualquer coisa no mês
            beneficioMesCalculado = parseFloat((saldoInicioMes * (parametroRecebimento / 100.0)).toFixed(2));
        } else if (formaRecebimento === 'prazo_definido') {
            beneficioMesCalculado = beneficioFixoPrazoDefinido;
        }
        if (isNaN(beneficioMesCalculado) || beneficioMesCalculado < 0) { motivoFimSimulacao = "Erro benefício."; break; }
        // --- Fim Cálculo Benefício ---

        // --- 2. Verificar Saldo e Calcular Saque Real ---
        //    (Subtrai do saldo ANTES de aplicar rendimento)
        let valorSaqueReal = 0;
        if (saldoRemanescente <= 0) { // Já estava zerado
             valorSaqueReal = 0;
             if(!motivoFimSimulacao) motivoFimSimulacao = "Saldo zerado antes do saque";
             saldoRemanescente = 0;
        } else if (beneficioMesCalculado >= saldoRemanescente) { // Saca tudo
            valorSaqueReal = saldoRemanescente;
            saldoRemanescente = 0;
             if(!motivoFimSimulacao) motivoFimSimulacao = "Saldo esgotado neste saque";
        } else { // Saca o valor calculado
            valorSaqueReal = beneficioMesCalculado;
            saldoRemanescente = parseFloat((saldoRemanescente - valorSaqueReal).toFixed(2));
             if (!isFinite(saldoRemanescente) || isNaN(saldoRemanescente)) { motivoFimSimulacao = "Erro saldo pós-saque."; break; }
        }
        const saldoAposSaque = saldoRemanescente; // Saldo antes de aplicar rendimento
        // --- Fim Saque ---


        // --- 3. Aplicar Rendimento Mensal ---
        //    (Aplica sobre o saldo JÁ reduzido pelo saque)
        let rendimentoMes = 0;
        if (taxaMensalDecimal > 0 && saldoAposSaque > 0) { // Só aplica se saldo pós-saque > 0
            rendimentoMes = parseFloat((saldoAposSaque * taxaMensalDecimal).toFixed(2));
             if (!isFinite(rendimentoMes) || isNaN(rendimentoMes)) { motivoFimSimulacao = "Erro rendimento."; break; }
             saldoRemanescente = parseFloat((saldoAposSaque + rendimentoMes).toFixed(2)); // Atualiza saldo final do mês
             if (!isFinite(saldoRemanescente) || isNaN(saldoRemanescente)) { motivoFimSimulacao = "Erro saldo pós-rendimento."; break; }
        }
        // Se não houve rendimento (taxa 0 ou saldo pós-saque 0), saldoRemanescente continua sendo saldoAposSaque
        const saldoFinalMes = saldoRemanescente; // Saldo final após saque e rendimento
        // --- Fim Rendimento Mensal ---


        // Define a data final (do último evento processado)
        dataFimBeneficioStr = mesDataStr;

        // Registrar o histórico do mês (com valores nos momentos corretos)
        historicoMensal.push({
            mes: mesSimulacao, dataMes: mesDataStr,
            idadeAnos: idadeAtualAnos, idadeMesesAno: idadeAtualMesesAno + 1,
            saldoInicioMes: saldoInicioMes, // Saldo no começo
            beneficioSolicitado: beneficioMesCalculado,
            beneficioSacado: valorSaqueReal,
            saldoAposSaque: saldoAposSaque, // Saldo antes do rendimento
            rendimentoMes: rendimentoMes,
            saldoRemanescente: saldoFinalMes // Saldo no fim do mês (após saque e rendimento)
        });

        // --- 4. Verificar Condições de Parada ---
        //    (Usa o saldo FINAL do mês)
        if (saldoFinalMes <= saldoMinimoPermitido || motivoFimSimulacao) {
             if (saldoFinalMes <= 0 && !motivoFimSimulacao) motivoFimSimulacao = "Saldo esgotado";
             else if (saldoFinalMes <= saldoMinimoPermitido && !motivoFimSimulacao) motivoFimSimulacao = "Saldo atingiu ou ficou abaixo do mínimo permitido";
            break; // Sai do loop
        }
        // --- Fim Verificação Parada ---


        // --- 5. Avançar para o Próximo Mês/Ciclo ---
        dataAtual.setMonth(dataAtual.getMonth() + 1);
        idadeAtualMesesAno++;
        if (idadeAtualMesesAno >= 13) {
            idadeAtualAnos++; idadeAtualMesesAno = 0;
            if (idadeAtualAnos >= idadeLimite) {
                if(!motivoFimSimulacao) motivoFimSimulacao = "Idade limite atingida";
                saldoFinalAposLimiteIdade = saldoFinalMes; // Guarda o saldo final do último mês
                break;
            }
        }
        // --- Fim Avanço ---

    } // Fim do while

    // Tratamento de Fim de Loop por Iterações ou Condição Não Prevista
    // ... (lógica de definição final do motivoFimSimulacao como antes) ...
    if (iterationCount >= MAX_ITERATIONS && !motivoFimSimulacao) { motivoFimSimulacao = "Limite máximo de iterações atingido."; if(idadeAtualAnos >= idadeLimite && saldoFinalAposLimiteIdade === null) saldoFinalAposLimiteIdade = saldoRemanescente; }
    else if (!motivoFimSimulacao) {
        if (saldoRemanescente <= 0) motivoFimSimulacao = "Saldo esgotado";
        else if (saldoRemanescente <= saldoMinimoPermitido) motivoFimSimulacao = "Saldo abaixo do mínimo";
        else if (idadeAtualAnos >= idadeLimite) { motivoFimSimulacao = "Idade limite atingida"; saldoFinalAposLimiteIdade = saldoRemanescente; }
        else motivoFimSimulacao = "Condição parada não determinada";
    }
    if(historicoMensal.length === 0){ dataFimBeneficioStr = null; }


    // Retorna o resultado da simulação
    return {
        parametrosIniciais: { /* ... como antes ... */ },
        motivoFimSimulacao: motivoFimSimulacao,
        dataFimBeneficio: dataFimBeneficioStr,
        saldoFinalAposLimiteIdade: saldoFinalAposLimiteIdade,
        saldoFinalReal: saldoRemanescente, // Saldo final real após a última operação
        totalMesesSimulados: mesSimulacao,
        idadeFinalAlcancada: { anos: idadeAtualAnos, mesesAno: idadeAtualMesesAno + 1 },
        historicoMensal: historicoMensal
    };
}




// --- Rota da API para Simulação (Atualizada) ---
router.post('/api/simular-evolucao', (req, res) => {
    console.log('Recebida requisição POST em /api/simular-evolucao');
    console.log('Corpo da requisição:', req.body);

    const {
        saldoTotalAcumulado,
        formaRecebimento,
        parametroRecebimento,
        idadeAtual,
        dataInicioBeneficio,
        idadeLimite,
        taxaRendimentoAnualPercentual,
        saldoMinimoPermitido // Novo campo esperado
    } = req.body;

    // Validação de presença dos campos (inclui o novo campo)
    const camposObrigatorios = ['saldoTotalAcumulado', 'formaRecebimento', 'parametroRecebimento', 'idadeAtual', 'dataInicioBeneficio', 'idadeLimite', 'taxaRendimentoAnualPercentual', 'saldoMinimoPermitido'];
    const camposAusentes = camposObrigatorios.filter(campo => req.body[campo] === undefined || req.body[campo] === null);
    if (camposAusentes.length > 0) {
        return res.status(400).json({ erro: `Campos obrigatórios ausentes: ${camposAusentes.join(', ')}` });
    }

     // Chama a função de simulação (agora com o saldo mínimo)
    const resultadoSimulacao = simularEvolucaoBeneficio(
        saldoTotalAcumulado, formaRecebimento, parametroRecebimento,
        idadeAtual, dataInicioBeneficio, idadeLimite,
        taxaRendimentoAnualPercentual,
        saldoMinimoPermitido // Passa o novo parâmetro
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