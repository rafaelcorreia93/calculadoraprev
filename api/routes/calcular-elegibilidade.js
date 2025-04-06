// Importar funções específicas do date-fns
const { parseISO, differenceInYears, isValid, addYears } = require('date-fns');
const { Router } = require('express');
const router = Router();

// Constantes para as regras
const REQUIRED_AGE = 55;
const REQUIRED_MEMBERSHIP_YEARS = 5; // 60 meses / 12 meses/ano

// --- Rota da API para verificar elegibilidade ---
router.post('/checar-elegibilidade', (req, res) => {
    const { dateOfBirth, planMembershipYears } = req.body;

    // Validação básica das entradas
    if (!dateOfBirth || typeof planMembershipYears === 'undefined') {
        return res.status(400).json({ error: 'Campos "dateOfBirth" (YYYY-MM-DD) e "planMembershipYears" são obrigatórios.' });
    }
    if (typeof planMembershipYears !== 'number' || planMembershipYears < 0) {
         return res.status(400).json({ error: '"planMembershipYears" deve ser um número não negativo.' });
    }

    let dobDate;
    try {
        dobDate = parseISO(dateOfBirth);
        if (!isValid(dobDate)) {
             throw new Error('Data inválida');
        }
    } catch (error) {
        return res.status(400).json({ error: 'Formato inválido para "dateOfBirth". Use YYYY-MM-DD.' });
    }

    // Lógica de Cálculo da Elegibilidade
    try {
        const currentDate = new Date();
        const age = differenceInYears(currentDate, dobDate);
        const membershipMonths = planMembershipYears * 12;

        const isAgeEligible = age >= REQUIRED_AGE;
        const isMembershipEligible = planMembershipYears >= REQUIRED_MEMBERSHIP_YEARS; // Usando anos para facilitar cálculo futuro
        const isEligible = isAgeEligible && isMembershipEligible;

        // Prepara a resposta base
        const responseDetails = {
            requiredAge: REQUIRED_AGE,
            calculatedAge: age,
            ageMet: isAgeEligible,
            requiredMembershipYears: REQUIRED_MEMBERSHIP_YEARS,
            calculatedMembershipYears: planMembershipYears,
            calculatedMembershipMonths: membershipMonths, // Ainda útil informar
            membershipMet: isMembershipEligible,
        };

        let nextEligibleAge = null; // Inicializa como null

        // Se não for elegível, calcula a idade da próxima elegibilidade
        if (!isEligible) {
            // Anos que faltam para atingir a IDADE mínima (0 se já atingiu)
            const yearsToMeetAge = Math.max(0, REQUIRED_AGE - age);

            // Anos que faltam para atingir o TEMPO DE VÍNCULO mínimo (0 se já atingiu)
            const yearsToMeetMembership = Math.max(0, REQUIRED_MEMBERSHIP_YEARS - planMembershipYears);

            // O tempo total de espera é o MÁXIMO dos dois tempos faltantes
            // (precisa esperar até que AMBAS as condições sejam atendidas)
            const totalYearsToWait = Math.max(yearsToMeetAge, yearsToMeetMembership);

            // Calcula a idade que a pessoa terá após esperar esses anos
            // Soma a idade atual + os anos de espera.
            // Usamos Math.ceil para garantir que pegamos o início do ano em que completa a condição.
            // Ex: Falta 0.5 ano -> espera até completar esse ano -> idade + 1 (arredondado para cima)
            // Mas se for um número exato, como 2 anos, age + 2. A idade é calculada no início do ano.
            // Simplificação: A idade será a idade atual + o tempo de espera. Se o tempo de espera for fracionado,
            // a elegibilidade ocorrerá durante aquele ano. Vamos retornar a idade inteira que terá *quando* ficar elegível.
            // Ex: Age 54, Memb 10. yearsToMeetAge = 1, yearsToMeetMembership = 0. totalWait = 1. NextAge = 54+1=55.
            // Ex: Age 60, Memb 4. yearsToMeetAge = 0, yearsToMeetMembership = 1. totalWait = 1. NextAge = 60+1=61.
            // Ex: Age 50, Memb 3. yearsToMeetAge = 5, yearsToMeetMembership = 2. totalWait = 5. NextAge = 50+5=55.
             // Ex: Age 54.5 (calculado como 54), Memb 4.5. yearsToMeetAge = 1, yearsToMeetMembership = 0.5. totalWait = 1. NextAge = 54+1=55.
            // O calculo differenceInYears já dá a idade completa, então somar os anos de espera funciona.
             nextEligibleAge = age + totalYearsToWait;


            // Adiciona a informação à resposta
             responseDetails.nextEligibleAge = Math.ceil(nextEligibleAge); // Arredonda para cima para ser mais claro (será elegível *aos* X anos)
             // Opcional: Calcular a data exata
             // const eligibilityDate = addYears(currentDate, totalYearsToWait);
             // responseDetails.estimatedEligibilityDate = eligibilityDate.toISOString().split('T')[0]; // Formato YYYY-MM-DD
        }

        // Enviar a Resposta
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