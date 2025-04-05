// calculator.js

/**
 * Calcula a taxa mensal equivalente a partir da taxa anual, arredondada para 9 casas.
 * @param {number} r_anual - Taxa de juros anual (ex: 0.08 para 8%).
 * @returns {number} Taxa de juros mensal.
 */
function calcularTaxaMensal(r_anual) {
    if (r_anual < -1) { // Taxa não pode ser menor que -100%
        return NaN; // Retorna Not a Number para indicar erro
    }
    if (r_anual === 0) {
        return 0;
    }
    // (1 + r_anual)^(1/12) - 1
    const taxa = Math.pow(1 + r_anual, 1 / 12) - 1;
    // Arredonda para 9 casas decimais e converte de volta para número
    return parseFloat(taxa.toFixed(9));
}

/**
 * Calcula o Valor Futuro de um investimento de previdência com aportes dobrados em Dezembro.
 * @param {number} vp - Valor Presente (aporte inicial).
 * @param {number} pmt - Valor do aporte mensal regular.
 * @param {number} r_anual - Taxa de rentabilidade anual estimada (ex: 0.08 para 8%).
 * @param {number} y - Número de anos de investimento.
 * @returns {object} Objeto contendo o valor futuro total e os componentes, ou um erro.
 */
function calcularPrevidenciaComBonus(vp, pmt, r_anual, y) {
    // --- Validações básicas ---
    if (isNaN(vp) || isNaN(pmt) || isNaN(r_anual) || isNaN(y)) {
        return { error: "Todos os valores devem ser numéricos." };
    }
    if (vp < 0 || pmt < 0 || y <= 0) {
        return { error: "VP, PMT e Anos (Y) não podem ser negativos (Anos deve ser > 0)." };
    }
     if (r_anual < -1) {
        return { error: "Taxa anual não pode ser menor que -100%." };
    }

    // --- Cálculos ---
    const i = calcularTaxaMensal(r_anual);
    if (isNaN(i)) {
         return { error: "Erro ao calcular taxa mensal (taxa anual inválida?)." };
    }

    const n = y * 12; // Número total de meses

    // 1. Valor Futuro do Aporte Inicial (VF_VP)
    const vf_vp = vp * Math.pow(1 + i, n);

    // 2. Valor Futuro dos Aportes Mensais Regulares (VF_Regular)
    // VF = PMT * [((1 + i)^n - 1) / i]
    let vf_regular = 0;
    if (i !== 0) {
        const fatorCompostoMensal = Math.pow(1 + i, n);
        vf_regular = pmt * ((fatorCompostoMensal - 1) / i);
    } else {
        // Caso especial: taxa de juros zero
        vf_regular = pmt * n;
    }


    // 3. Valor Futuro dos Aportes Adicionais de Dezembro (VF_Extra)
    // VF = PMT * [((1 + r_anual)^Y - 1) / r_anual]
    let vf_extra = 0;
    if (r_anual !== 0) {
        const fatorCompostoAnual = Math.pow(1 + r_anual, y);
         vf_extra = pmt * ((fatorCompostoAnual - 1) / r_anual);
    } else {
         // Caso especial: taxa de juros zero
         vf_extra = pmt * y;
    }

    // 4. Valor Futuro Total
    const vf_total = vf_vp + vf_regular + vf_extra;

    // Arredonda o resultado final para 2 casas decimais (comum para valores monetários)
    const vf_total_arredondado = parseFloat(vf_total.toFixed(2));
    const vf_vp_arredondado = parseFloat(vf_vp.toFixed(2));
    const vf_regular_arredondado = parseFloat(vf_regular.toFixed(2));
    const vf_extra_arredondado = parseFloat(vf_extra.toFixed(2));

    return {
        valorFuturoTotal: vf_total_arredondado,
        detalhes: {
             taxaMensalAplicada: i,
             numeroMeses: n,
             vfAporteInicial: vf_vp_arredondado,
             vfAportesRegulares: vf_regular_arredondado,
             vfAportesExtrasDezembro: vf_extra_arredondado
        }
    };
}

// Exporta a função principal de cálculo
module.exports = { calcularPrevidenciaComBonus };