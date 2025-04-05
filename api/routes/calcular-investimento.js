// Importar funções específicas do date-fns
const { Router } = require('express');
const { parseISO, differenceInMonths, differenceInYears, isValid, isBefore } = require('date-fns');
const router = Router();

/**
 * Função para calcular o valor futuro da previdência privada usando datas.
 * @param {number} vp - Valor Presente (aporte inicial)
 * @param {number} pmt - Valor do aporte mensal regular (que dobra em Dezembro)
 * @param {number} r_anual - Taxa de rentabilidade anual estimada (ex: 0.04 para 4%)
 * @param {string} dataInicio - Data de início do investimento (formato YYYY-MM-DD)
 * @param {string} dataFim - Data de fim do investimento (formato YYYY-MM-DD)
 * @param {number} pmt_extra - Valor do aporte extra opcional (0 se não houver)
 * @param {string} freq_extra - Periodicidade do aporte extra ("6 meses", "12 meses", "Nenhum")
 * @returns {object} Objeto com os valores futuros calculados ou um erro.
 */
function calcularPrevidenciaPorData(vp, pmt, r_anual, dataInicio, dataFim, pmt_extra, freq_extra) {
    try {
        // --- Validações de Datas ---
        const startDate = parseISO(dataInicio);
        const endDate = parseISO(dataFim);

        if (!isValid(startDate) || !isValid(endDate)) {
            throw new Error("Formato de data inválido. Use YYYY-MM-DD.");
        }
        if (!isBefore(startDate, endDate)) {
            throw new Error("A data de fim deve ser posterior à data de início.");
        }

         // --- Validações Numéricas Básicas ---
         if (isNaN(vp) || vp < 0 ||
             isNaN(pmt) || pmt < 0 ||
             isNaN(r_anual) || // r_anual pode ser 0 ou mais
             isNaN(pmt_extra) || pmt_extra < 0) {
             throw new Error("Valores de entrada numéricos (vp, pmt, r_anual, pmt_extra) inválidos ou negativos não permitidos.");
         }
         const validFreq = ["6 meses", "12 meses", "Nenhum"];
         if (!validFreq.includes(freq_extra)) {
             throw new Error("Frequência do aporte extra inválida. Use '6 meses', '12 meses' ou 'Nenhum'.");
         }

        // --- Passo 1: Calcular Taxas e Períodos a partir das Datas ---
        const y_calculado = differenceInYears(endDate, startDate); // Número de anos *completos*
        const n_calculado = differenceInMonths(endDate, startDate); // Número de meses *completos*

        // Se não houver nem 1 mês completo, o valor futuro é apenas o inicial.
        if (n_calculado <= 0) {
            return {
                success: true,
                valorFuturoTotal: parseFloat(vp.toFixed(2)),
                detalhes: {
                    vf_aporteInicial: parseFloat(vp.toFixed(2)),
                    vf_aportesRegulares: 0,
                    vf_aportesExtrasDezembro: 0,
                    vf_aportesExtrasOpcionais: 0
                },
                parametrosEntrada: { vp, pmt, r_anual, dataInicio, dataFim, pmt_extra, freq_extra },
                periodosCalculados: { anosCompletos: y_calculado, mesesCompletos: n_calculado }
            };
        }


        let i = 0; // Taxa mensal
        if (r_anual > 0) {
            i = Math.pow(1 + r_anual, 1 / 12) - 1;
        }

        // --- Passo 2: Calcular o Valor Futuro do Aporte Inicial (VF_VP) ---
        let vf_vp = 0;
         if (vp > 0) {
            vf_vp = vp * Math.pow(1 + i, n_calculado);
         }


        // --- Passo 3: Calcular o Valor Futuro dos Aportes Mensais Regulares (VF_Regular) ---
        // Usa o número total de meses completos (n_calculado)
        let vf_regular = 0;
        if (pmt > 0) {
            if (i > 0) {
                vf_regular = pmt * ((Math.pow(1 + i, n_calculado) - 1) / i);
            } else {
                vf_regular = pmt * n_calculado;
            }
        }


        // --- Passo 4: Calcular o Valor Futuro dos Aportes Adicionais de Dezembro (VF_Extra_Dec) ---
        // Usa o número de anos *completos* (y_calculado) pois o aporte extra é anual.
        let vf_extra_dec = 0;
        if (pmt > 0 && y_calculado > 0) { // Só ocorre se houver pelo menos 1 ano completo
             if (r_anual > 0) {
                 vf_extra_dec = pmt * ((Math.pow(1 + r_anual, y_calculado) - 1) / r_anual);
             } else {
                  vf_extra_dec = pmt * y_calculado;
             }
        }


        // --- Passo 5: Calcular o Valor Futuro dos Aportes Extras Opcionais (VF_Opt_Extra) ---
        let vf_opt_extra = 0;
        if (pmt_extra > 0 && freq_extra !== "Nenhum") {
            if (freq_extra === "12 meses" && y_calculado > 0) { // Precisa de anos completos
                if (r_anual > 0) {
                    vf_opt_extra = pmt_extra * ((Math.pow(1 + r_anual, y_calculado) - 1) / r_anual);
                } else {
                    vf_opt_extra = pmt_extra * y_calculado;
                }
            } else if (freq_extra === "6 meses") {
                // Usa o número de *semestres completos*.
                // Um semestre completo ocorre a cada 6 meses completos.
                const n_semestral_calculado = Math.floor(n_calculado / 6);

                if (n_semestral_calculado > 0) {
                    let i_semestral = 0;
                    if(r_anual > 0) {
                        i_semestral = Math.pow(1 + r_anual, 0.5) - 1;
                    }

                    if (i_semestral > 0) {
                        vf_opt_extra = pmt_extra * ((Math.pow(1 + i_semestral, n_semestral_calculado) - 1) / i_semestral);
                    } else {
                        vf_opt_extra = pmt_extra * n_semestral_calculado;
                    }
                }
            }
        }

        // --- Passo 6: Calcular o Valor Futuro Total (VF_Total) ---
        const vf_total = vf_vp + vf_regular + vf_extra_dec + vf_opt_extra;

        return {
            success: true,
            valorFuturoTotal: parseFloat(vf_total.toFixed(2)),
            detalhes: {
                vf_aporteInicial: parseFloat(vf_vp.toFixed(2)),
                vf_aportesRegulares: parseFloat(vf_regular.toFixed(2)),
                vf_aportesExtrasDezembro: parseFloat(vf_extra_dec.toFixed(2)),
                vf_aportesExtrasOpcionais: parseFloat(vf_opt_extra.toFixed(2))
            },
            parametrosEntrada: { vp, pmt, r_anual, dataInicio, dataFim, pmt_extra, freq_extra },
            periodosCalculados: { anosCompletos: y_calculado, mesesCompletos: n_calculado }
        };

    } catch (error) {
        console.error("Erro no cálculo:", error);
        return { success: false, error: error.message };
    }
}

// --- Rota da API ---
router.post('/calcular-investimento', (req, res) => { // Nome da rota modificado
    const {
        vp = 0,
        pmt,
        r_anual,
        dataInicio, // Espera dataInicio
        dataFim,   // Espera dataFim
        pmt_extra = 0,
        freq_extra = "Nenhum"
    } = req.body;

    // Verifica se os parâmetros obrigatórios foram fornecidos
    if (pmt === undefined || r_anual === undefined || dataInicio === undefined || dataFim === undefined) {
        return res.status(400).json({
            success: false,
            error: "Parâmetros obrigatórios ausentes: pmt, r_anual, dataInicio, dataFim"
        });
    }

    // Realiza o cálculo usando a nova função
    const resultado = calcularPrevidenciaPorData(
        parseFloat(vp),
        parseFloat(pmt),
        parseFloat(r_anual),
        dataInicio, // Passa as strings
        dataFim,    // Passa as strings
        parseFloat(pmt_extra),
        freq_extra
    );

    if (resultado.success) {
        res.json(resultado);
    } else {
        res.status(400).json(resultado);
    }
});

module.exports = router; // Exporta o roteador