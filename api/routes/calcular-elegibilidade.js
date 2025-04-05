// Importar funções específicas do date-fns
const { parseISO, differenceInYears, isValid } = require('date-fns');
const { Router } = require('express');
const router = Router();

// --- Rota da API para verificar elegibilidade ---
router.post('/checar-elegibilidade', (req, res) => {
    // 1. Obter dados do corpo da requisição
    const { dateOfBirth, planMembershipYears } = req.body;

    // 2. Validação básica das entradas
    if (!dateOfBirth || typeof planMembershipYears === 'undefined') {
        return res.status(400).json({ error: 'Campos "dateOfBirth" (YYYY-MM-DD) e "planMembershipYears" são obrigatórios.' });
    }

    if (typeof planMembershipYears !== 'number' || planMembershipYears < 0) {
         return res.status(400).json({ error: '"planMembershipYears" deve ser um número não negativo.' });
    }

    let dobDate;
    try {
        dobDate = parseISO(dateOfBirth); // Tenta converter a string 'YYYY-MM-DD' para Date
        if (!isValid(dobDate)) { // Verifica se a data resultante é válida
             throw new Error('Data inválida'); // Força cair no catch
        }
    } catch (error) {
        return res.status(400).json({ error: 'Formato inválido para "dateOfBirth". Use YYYY-MM-DD.' });
    }

    // 3. Lógica de Cálculo da Elegibilidade
    try {
        const currentDate = new Date(); // Data atual

        // Calcula a idade em anos completos
        const age = differenceInYears(currentDate, dobDate);

        // Calcula o tempo de vinculação em meses
        const membershipMonths = planMembershipYears * 12;

        // Aplica as regras de elegibilidade
        const isAgeEligible = age >= 55;
        const isMembershipEligible = membershipMonths >= 60;
        const isEligible = isAgeEligible && isMembershipEligible; // Ambas devem ser verdadeiras

        // 4. Enviar a Resposta
        res.status(200).json({
            isEligible: isEligible,
            details: {
                requiredAge: 55,
                calculatedAge: age,
                ageMet: isAgeEligible,
                requiredMembershipMonths: 60,
                calculatedMembershipMonths: membershipMonths,
                membershipMet: isMembershipEligible,
            }
        });

    } catch (error) {
         // Captura erros inesperados durante o cálculo (menos provável aqui)
        console.error("Erro no cálculo de elegibilidade:", error);
        res.status(500).json({ error: 'Erro interno ao calcular a elegibilidade.' });
    }
});

module.exports = router; // Exporta o roteador