// Importar funções específicas do date-fns
const { parseISO, differenceInYears, isValid, addYears } = require('date-fns');
const { Router } = require('express');
const router = Router();

// Valores padrão para as regras (caso não sejam enviados na requisição)
const DEFAULT_REQUIRED_AGE = 55;
const DEFAULT_REQUIRED_MEMBERSHIP_YEARS = 5; // 60 meses

// --- Rota da API para verificar elegibilidade ---
router.post('/checar-elegibilidade', (req, res) => {
    // 1. Obter dados do corpo da requisição
    const { dateOfBirth, planMembershipYears } = req.body;
    // Obter os requisitos da requisição OU usar os padrões
    const inputRequiredAge = req.body.requiredAge;
    const inputRequiredMembershipYears = req.body.requiredMembershipYears;

    // 2. Validação e Definição dos Requisitos a Usar
    let requiredAgeToUse = inputRequiredAge ?? DEFAULT_REQUIRED_AGE; // Usa o input ou o padrão
    let requiredMembershipYearsToUse = inputRequiredMembershipYears ?? DEFAULT_REQUIRED_MEMBERSHIP_YEARS; // Usa o input ou o padrão

    // Validação básica dos campos principais
    if (!dateOfBirth || typeof planMembershipYears === 'undefined') {
        return res.status(400).json({ error: 'Campos "dateOfBirth" (YYYY-MM-DD) e "planMembershipYears" são obrigatórios.' });
    }
    if (typeof planMembershipYears !== 'number' || planMembershipYears < 0) {
         return res.status(400).json({ error: '"planMembershipYears" deve ser um número não negativo.' });
    }

    // Validação dos campos de requisitos (se foram fornecidos)
    if (inputRequiredAge !== undefined && (typeof inputRequiredAge !== 'number' || inputRequiredAge < 0)) {
        return res.status(400).json({ error: '"requiredAge" (se fornecido) deve ser um número não negativo.' });
    }
    if (inputRequiredMembershipYears !== undefined && (typeof inputRequiredMembershipYears !== 'number' || inputRequiredMembershipYears < 0)) {
        return res.status(400).json({ error: '"requiredMembershipYears" (se fornecido) deve ser um número não negativo.' });
    }

    // Validação do formato da data de nascimento
    let dobDate;
    try {
        dobDate = parseISO(dateOfBirth);
        if (!isValid(dobDate)) {
             throw new Error('Data inválida');
        }
    } catch (error) {
        return res.status(400).json({ error: 'Formato inválido para "dateOfBirth". Use YYYY-MM-DD.' });
    }

    // 3. Lógica de Cálculo da Elegibilidade (agora usando as variáveis de requisito)
    try {
        const currentDate = new Date();
        const age = differenceInYears(currentDate, dobDate);
        const membershipMonths = planMembershipYears * 12; // Pode continuar calculando meses para informação

        // Usa os valores definidos (input ou padrão)
        const isAgeEligible = age >= requiredAgeToUse;
        const isMembershipEligible = planMembershipYears >= requiredMembershipYearsToUse;
        const isEligible = isAgeEligible && isMembershipEligible;

        // Prepara a resposta base, refletindo os requisitos usados
        const responseDetails = {
            requiredAge: requiredAgeToUse, // Informa o requisito usado
            calculatedAge: age,
            ageMet: isAgeEligible,
            requiredMembershipYears: requiredMembershipYearsToUse, // Informa o requisito usado
            calculatedMembershipYears: planMembershipYears,
            calculatedMembershipMonths: membershipMonths,
            membershipMet: isMembershipEligible,
        };

        let nextEligibleAge = null;

        // Se não for elegível, calcula a idade da próxima elegibilidade usando os requisitos atuais
        if (!isEligible) {
            const yearsToMeetAge = Math.max(0, requiredAgeToUse - age);
            const yearsToMeetMembership = Math.max(0, requiredMembershipYearsToUse - planMembershipYears);
            const totalYearsToWait = Math.max(yearsToMeetAge, yearsToMeetMembership);

            nextEligibleAge = age + totalYearsToWait;
            responseDetails.nextEligibleAge = Math.ceil(nextEligibleAge);
        }

        // 4. Enviar a Resposta
        res.status(200).json({
            isEligible: isEligible,
            details: responseDetails
        });

    } catch (error) {
        console.error("Erro no cálculo de elegibilidade:", error);
        res.status(500).json({ error: 'Erro interno ao calcular a elegibilidade.' });
    }
});

module.exports = router; // Exporta o roteador