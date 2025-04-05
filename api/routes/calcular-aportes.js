// routes/calculation.js
const { Router } = require('express');
const { 
    parseISO, // Converte string ISO (YYYY-MM-DD) para Date
    isBefore, // Compara se data1 é anterior a data2
    isEqual,  // Compara se datas são iguais
    isAfter, // Adicionado para clareza na lógica esporádica
    startOfMonth, // Obtém o primeiro dia do mês
    addMonths,  // Adiciona meses a uma data
    getMonth   // Obtém o mês (0 = Janeiro, 11 = Dezembro)
} = require('date-fns');

const router = Router();

// --- Função Auxiliar para Validação ---
function validateInput(body) {
    const { startDate, endDate, contributions, sporadicContribution } = body;
    const errors = [];

    // Validação Datas e Contribuições Regulares (igual a antes)
    if (!startDate || typeof startDate !== 'string') errors.push('startDate (YYYY-MM-DD) é obrigatório.');
    if (!endDate || typeof endDate !== 'string') errors.push('endDate (YYYY-MM-DD) é obrigatório.');
    if (!contributions || typeof contributions !== 'object') errors.push('contributions (objeto) é obrigatório.');
    else {
        const requiredPmt = ['pmt_bp', 'pmt_bs', 'pmt_vp', 'pmt_vs'];
        requiredPmt.forEach(key => {
            if (typeof contributions[key] !== 'number' || contributions[key] < 0) {
                errors.push(`contributions.${key} (número >= 0) é obrigatório.`);
            }
        });
    }

    let parsedStartDate, parsedEndDate;
    try {
        parsedStartDate = parseISO(startDate);
        if (isNaN(parsedStartDate.getTime())) throw new Error();
    } catch (e) {
        errors.push('startDate inválido. Use o formato YYYY-MM-DD.');
    }
    try {
        parsedEndDate = parseISO(endDate);
         if (isNaN(parsedEndDate.getTime())) throw new Error();
    } catch (e) {
        errors.push('endDate inválido. Use o formato YYYY-MM-DD.');
    }

    if (parsedStartDate && parsedEndDate && isBefore(parsedEndDate, parsedStartDate)) {
         errors.push('endDate não pode ser anterior a startDate.');
    }

    // Validação Aporte Esporádico (Atualizada para valor único)
    let validSporadicFrequency = null;
    let validatedSporadicValue = null; // Alterado de sporadicValues
    if (sporadicContribution !== null && sporadicContribution !== undefined) {
        if (typeof sporadicContribution !== 'object') {
            errors.push('sporadicContribution, se fornecido, deve ser um objeto.');
        } else {
            const { frequency, value } = sporadicContribution; // Alterado de values para value
            if (!frequency || (frequency !== '6months' && frequency !== '12months')) {
                errors.push('sporadicContribution.frequency é obrigatório e deve ser "6months" ou "12months".');
            } else {
                 validSporadicFrequency = frequency;
            }

            // Verifica o campo 'value' como número
            if (typeof value !== 'number' || value < 0) {
                errors.push('sporadicContribution.value (número >= 0) é obrigatório.');
            } else {
                validatedSporadicValue = value; // Armazena o valor único validado
            }
        }
    }

    return { errors, parsedStartDate, parsedEndDate, validSporadicFrequency, validatedSporadicValue }; // Retorna validatedSporadicValue
}


// --- Rota POST para Cálculo ---
router.post('/calcular-aportes', (req, res) => {
    // 1. Validar Entradas
    const { errors, parsedStartDate, parsedEndDate, validSporadicFrequency, validatedSporadicValue } = validateInput(req.body);
    if (errors.length > 0) {
        return res.status(400).json({ message: "Erro na requisição", errors });
    }

    const { contributions } = req.body;

    // 2. Lógica de Cálculo (Meses Regulares e Dezembros)
    let n_total = 0;
    let n_decembers = 0;
    let currentDate = startOfMonth(parsedStartDate);

    while (isBefore(currentDate, parsedEndDate) || isEqual(startOfMonth(currentDate), startOfMonth(parsedEndDate))) {
        n_total++;
        if (getMonth(currentDate) === 11) { // Dezembro
            n_decembers++;
        }
        currentDate = addMonths(currentDate, 1);
        if (n_total > 12000) { /* Safety break */ return res.status(500).json({ message: "Erro: limite de iteração excedido."}); }
    }

    // 3. Lógica de Cálculo (Ocorrências Esporádicas)
    let n_sporadic = 0;
    let sporadicIntervalMonths = 0;

    if (validSporadicFrequency) {
        sporadicIntervalMonths = validSporadicFrequency === '6months' ? 6 : 12;
        let nextSporadicDate = addMonths(parsedStartDate, sporadicIntervalMonths);

        while (isBefore(nextSporadicDate, parsedEndDate) || isEqual(nextSporadicDate, parsedEndDate)) {
            if (isAfter(nextSporadicDate, parsedStartDate) || isEqual(nextSporadicDate, parsedStartDate)) {
               n_sporadic++;
            }
            nextSporadicDate = addMonths(nextSporadicDate, sporadicIntervalMonths);
            if (n_sporadic > 1000) { /* Safety break */ return res.status(500).json({ message: "Erro: limite de iteração esporádica excedido."}); }
        }
    }


    // 4. Calcular Totais Finais (Separando Esporádico) ---- ALTERAÇÃO PRINCIPAL AQUI ----
    const regularFactor = n_total + n_decembers;
    const results = {};
    const portfolioKeys = [
        { regular: 'pmt_bp', result: 'basicParticipant' },
        { regular: 'pmt_bs', result: 'basicSponsor' },
        { regular: 'pmt_vp', result: 'voluntaryParticipant' },
        { regular: 'pmt_vs', result: 'voluntarySponsor' }
    ];

    // Calcula o valor esporádico por ocorrência (0 se não fornecido)
    const sporadicContributionPerOccurrence = validatedSporadicValue !== null ? validatedSporadicValue : 0;
    // Calcula o TOTAL esporádico acumulado no período
    const totalSporadicAmount = sporadicContributionPerOccurrence * n_sporadic;

    // Calcula o total das carteiras REGULARES (SEM SOMAR o esporádico aqui)
    portfolioKeys.forEach(keys => {
        results[keys.result] = contributions[keys.regular] * regularFactor;
    });

    // Adiciona o total esporádico como uma entrada separada no resultado
    results.sporadicTotal = totalSporadicAmount;
    // ---- FIM DA ALTERAÇÃO PRINCIPAL ----


    // 5. Montar e Enviar Resposta
    const response = {
        period: {
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            totalMonthsCounted: n_total,
            decemberMonthsCounted: n_decembers,
            regularCalculationFactor: regularFactor,
            sporadicContributionsCounted: n_sporadic,
            sporadicFrequencyUsed: validSporadicFrequency || 'N/A',
        },
        inputsProvided: {
             regularContributions: contributions,
             sporadicContribution: req.body.sporadicContribution || null
        },
        calculatedSporadicValuePerOccurrence: sporadicContributionPerOccurrence,
        totalContributions: results // Agora inclui 'sporadicTotal'
    };

    res.status(200).json(response);
});

module.exports = router; // Exporta o roteador