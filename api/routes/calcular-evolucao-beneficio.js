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



// --- Função de Simulação de Evolução (Frequência de Recálculo Configurável) ---
function simularEvolucaoBeneficio(
    saldoInicial,
    formaRecebimento,
    parametroRecebimento,
    idadeInicialAnos,
    dataInicioBeneficioStr,
    idadeLimite,
    taxaRendimentoAnualPercentual,
    saldoMinimoPermitido,
    recalculoPercentualFrequencia // Novo parâmetro: 'mensal' ou 'anual'
) {
    // --- Validações Robustas ---
    // ... (Validações anteriores mantidas) ...
    if (typeof saldoMinimoPermitido !== 'number' || saldoMinimoPermitido < 0) return { erro: "Saldo mínimo permitido inválido." };

    // ---> NOVA VALIDAÇÃO: Frequência de Recálculo (só se aplica a percentual_saldo) <---
    const frequenciasValidas = ['mensal', 'anual'];
    if (formaRecebimento === 'percentual_saldo') {
        if (!recalculoPercentualFrequencia || !frequenciasValidas.includes(recalculoPercentualFrequencia)) {
            return { erro: `Frequência de recálculo inválida ou ausente ('${recalculoPercentualFrequencia}'). Use 'mensal' ou 'anual' para forma 'percentual_saldo'.` };
        }
    }
    // --------------------------------------------------------------------------------

    const dataInicio = parsearDataYYYYMM(dataInicioBeneficioStr);
    if (!dataInicio) return { erro: "Data de início inválida (formato YYYY-MM)." };

    // --- Cálculo da Taxa Mensal Equivalente ---
    // ... (como antes) ...
    const taxaAnualDecimal = taxaRendimentoAnualPercentual / 100.0;
    const taxaMensalDecimal = taxaAnualDecimal === 0 ? 0.0 : (1 + taxaAnualDecimal)**(1/12) - 1;
    const taxaMensalPercentual = taxaMensalDecimal * 100;


    // --- Inicialização da Simulação ---
    let saldoRemanescente = saldoInicial;
    if (saldoRemanescente <= saldoMinimoPermitido) { /* ... retorno imediato ... */ }

    let idadeAtualAnos = idadeInicialAnos; let idadeAtualMesesAno = 0; let mesSimulacao = 0; const historicoMensal = []; let motivoFimSimulacao = ""; let saldoFinalAposLimiteIdade = null; let dataAtual = new Date(dataInicio); let dataFimBeneficioStr = null;
    let beneficioPercentualAtual = 0; // Usado para ambos os modos de percentual
    let beneficioFixoPrazoDefinido = 0;

    // --- Pré-cálculo ---
    if (formaRecebimento === 'prazo_definido') {
        /* ... cálculo PMT como antes ... */
    } else if (formaRecebimento === 'percentual_saldo') {
        // Calcula o valor INICIAL do benefício percentual (válido para 1º mês/ano)
        beneficioPercentualAtual = parseFloat((saldoInicial * (parametroRecebimento / 100.0)).toFixed(2));
        if (isNaN(beneficioPercentualAtual) || beneficioPercentualAtual < 0) { return { erro: "Erro cálculo benefício percentual inicial." }; }
    }

    // --- Loop da Simulação Mensal ---
    const MAX_ITERATIONS = (idadeLimite - idadeInicialAnos + 1) * 13 * 3; let iterationCount = 0;
    while (/* condição while como antes */ saldoRemanescente > saldoMinimoPermitido && idadeAtualAnos < idadeLimite && iterationCount < MAX_ITERATIONS) {
        iterationCount++; mesSimulacao++; const mesDataStr = formatarDataYYYYMM(dataAtual); const saldoInicioMes = saldoRemanescente;

        // --- 1. Calcular/Atualizar Benefício para o Mês Atual ---
        let beneficioMesCalculado = 0;
        if (formaRecebimento === 'valor_fixo') {
            beneficioMesCalculado = parametroRecebimento;
        } else if (formaRecebimento === 'percentual_saldo') {
            // ---> LÓGICA CONDICIONAL BASEADA NA FREQUÊNCIA <---
            if (recalculoPercentualFrequencia === 'anual') {
                // Recalcula APENAS no início do ciclo anual (exceto no primeiríssimo mês)
                if (idadeAtualMesesAno === 0 && mesSimulacao > 1) {
                    beneficioPercentualAtual = parseFloat((saldoInicioMes * (parametroRecebimento / 100.0)).toFixed(2));
                    if (isNaN(beneficioPercentualAtual) || beneficioPercentualAtual < 0) { motivoFimSimulacao = "Erro recalcular benefício anual."; break; }
                    console.log(`INFO (Anual): Recalculado benefício para ${mesDataStr}: R$ ${beneficioPercentualAtual.toFixed(2)}`);
                }
                // Usa o valor atual (calculado inicialmente ou anualmente)
                beneficioMesCalculado = beneficioPercentualAtual;
            } else { // Frequência é 'mensal'
                // Recalcula TODO MÊS
                beneficioPercentualAtual = parseFloat((saldoInicioMes * (parametroRecebimento / 100.0)).toFixed(2));
                 if (isNaN(beneficioPercentualAtual) || beneficioPercentualAtual < 0) { motivoFimSimulacao = "Erro recalcular benefício mensal."; break; }
                 beneficioMesCalculado = beneficioPercentualAtual;
                 // console.log(`INFO (Mensal): Calculado benefício para ${mesDataStr}: R$ ${beneficioMesCalculado.toFixed(2)}`); // Log opcional
            }
            // -------------------------------------------------
        } else if (formaRecebimento === 'prazo_definido') {
            beneficioMesCalculado = beneficioFixoPrazoDefinido;
        }
        if (isNaN(beneficioMesCalculado) || beneficioMesCalculado < 0) { if (!motivoFimSimulacao) motivoFimSimulacao = "Erro benefício calculado."; break; }
        // --- Fim Cálculo Benefício ---


        // --- 2. Saque (como antes) ---
        let valorSaqueReal = 0; const saldoAposSaque = 0; // Definir depois
        // ... (lógica de saque igual à versão anterior) ...
        if (saldoRemanescente <= 0) { valorSaqueReal = 0; if(!motivoFimSimulacao) motivoFimSimulacao = "Saldo zerado antes"; saldoRemanescente = 0; }
        else if (beneficioMesCalculado >= saldoRemanescente) { valorSaqueReal = saldoRemanescente; saldoRemanescente = 0; if(!motivoFimSimulacao) motivoFimSimulacao = "Esgotado neste saque"; }
        else { valorSaqueReal = beneficioMesCalculado; saldoRemanescente = parseFloat((saldoRemanescente - valorSaqueReal).toFixed(2)); if (!isFinite(saldoRemanescente) || isNaN(saldoRemanescente)) { motivoFimSimulacao = "Erro saldo pós-saque."; break; } }
        saldoAposSaque = saldoRemanescente; // Agora sim, saldo após saque


        // --- 3. Rendimento (como antes) ---
        let rendimentoMes = 0;
        // ... (lógica de rendimento igual à versão anterior, sobre saldoAposSaque) ...
        if (taxaMensalDecimal > 0 && saldoAposSaque > 0) { rendimentoMes = parseFloat((saldoAposSaque * taxaMensalDecimal).toFixed(2)); /* ... checagens ... */ saldoRemanescente = parseFloat((saldoAposSaque + rendimentoMes).toFixed(2)); /* ... checagens ... */ }
        const saldoFinalMes = saldoRemanescente;


        // Define data fim
        dataFimBeneficioStr = mesDataStr;

        // Registrar histórico
        historicoMensal.push({ /* ... campos como antes ... */ });

        // --- 4. Verificar Parada (como antes) ---
        if (saldoFinalMes <= saldoMinimoPermitido || motivoFimSimulacao) { /* ... define motivo e break ... */ }

        // --- 5. Avançar tempo (como antes) ---
        dataAtual.setMonth(dataAtual.getMonth() + 1); idadeAtualMesesAno++;
        if (idadeAtualMesesAno >= 13) { idadeAtualAnos++; idadeAtualMesesAno = 0; if (idadeAtualAnos >= idadeLimite) { /* ... define motivo e break ... */ } }

    } // Fim do while

    // Tratamento Fim Loop
    // ... (lógica como antes) ...

    // Retorna resultado
    return {
        parametrosIniciais: {
            saldoInicial, formaRecebimento, parametroRecebimento,
            idadeInicialAnos, dataInicioBeneficio: dataInicioBeneficioStr, idadeLimite,
            taxaRendimentoAnualPercentual,
            taxaRendimentoMensalEquivalentePercentual: parseFloat(taxaMensalPercentual.toFixed(9)),
            saldoMinimoPermitido,
            // ---> Adiciona a frequência usada (se aplicável) <---
            recalculoPercentualFrequencia: formaRecebimento === 'percentual_saldo' ? recalculoPercentualFrequencia : null
        },
        motivoFimSimulacao: motivoFimSimulacao,
        dataFimBeneficio: dataFimBeneficioStr,
        saldoFinalAposLimiteIdade: saldoFinalAposLimiteIdade,
        saldoFinalReal: saldoRemanescente,
        totalMesesSimulados: mesSimulacao,
        idadeFinalAlcancada: { anos: idadeAtualAnos, mesesAno: idadeAtualMesesAno + 1 },
        historicoMensal: historicoMensal
    };
}

// --- Rota da API para Simulação (Atualizada) ---
router.post('/simular-evolucao', (req, res) => {
    console.log('POST /api/simular-evolucao', req.body);

    const {
        saldoTotalAcumulado,
        formaRecebimento,
        parametroRecebimento,
        idadeAtual,
        dataInicioBeneficio,
        idadeLimite,
        taxaRendimentoAnualPercentual,
        saldoMinimoPermitido,
        recalculoPercentualFrequencia // Novo campo esperado (opcional se não for percentual)
    } = req.body;

    // Validação de presença dos campos
    const camposObrigatoriosBase = ['saldoTotalAcumulado', 'formaRecebimento', 'parametroRecebimento', 'idadeAtual', 'dataInicioBeneficio', 'idadeLimite', 'taxaRendimentoAnualPercentual', 'saldoMinimoPermitido'];
    let camposObrigatorios = [...camposObrigatoriosBase];

    // ---> Validação CONDICIONAL da frequência <---
    if (formaRecebimento === 'percentual_saldo') {
        camposObrigatorios.push('recalculoPercentualFrequencia');
        if(req.body.recalculoPercentualFrequencia && !['mensal', 'anual'].includes(req.body.recalculoPercentualFrequencia)){
             return res.status(400).json({ erro: "Valor inválido para 'recalculoPercentualFrequencia'. Use 'mensal' ou 'anual'." });
        }
    }
    // ------------------------------------------

    const camposAusentes = camposObrigatorios.filter(campo => req.body[campo] === undefined || req.body[campo] === null);
    if (camposAusentes.length > 0) {
        return res.status(400).json({ erro: `Campos obrigatórios ausentes: ${camposAusentes.join(', ')}` });
    }

    // Chama a função de simulação (passando o novo parâmetro)
    const resultadoSimulacao = simularEvolucaoBeneficio(
        saldoTotalAcumulado, formaRecebimento, parametroRecebimento,
        idadeAtual, dataInicioBeneficio, idadeLimite,
        taxaRendimentoAnualPercentual, saldoMinimoPermitido,
        recalculoPercentualFrequencia // Passa a frequência
    );

    if (resultadoSimulacao.erro) { /* ... tratamento de erro ... */ }
    else { /* ... retorno de sucesso ... */ }
});


module.exports = router; // Exporta o roteador