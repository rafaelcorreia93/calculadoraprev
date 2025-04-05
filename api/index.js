const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // Porta da API

// Middleware para parsear JSON no corpo da requisição
app.use(express.json());

/**
 * Função para calcular o valor futuro da previdência privada.
 * @param {number} vp - Valor Presente (aporte inicial)
 * @param {number} pmt - Valor do aporte mensal regular (que dobra em Dezembro)
 * @param {number} r_anual - Taxa de rentabilidade anual estimada (ex: 0.04 para 4%)
 * @param {number} y - Número de anos de investimento
 * @param {number} pmt_extra - Valor do aporte extra opcional (0 se não houver)
 * @param {string} freq_extra - Periodicidade do aporte extra ("6 meses", "12 meses", "Nenhum")
 * @returns {object} Objeto com os valores futuros calculados ou um erro.
 */
function calcularPrevidencia(vp, pmt, r_anual, y, pmt_extra, freq_extra) {
    try {
        // --- Validações Básicas ---
        if (isNaN(vp) || vp < 0 ||
            isNaN(pmt) || pmt < 0 ||
            isNaN(r_anual) || // r_anual pode ser 0 ou mais
            isNaN(y) || y <= 0 ||
            isNaN(pmt_extra) || pmt_extra < 0) {
            throw new Error("Valores de entrada numéricos inválidos ou negativos/zeros não permitidos onde aplicável.");
        }
        const validFreq = ["6 meses", "12 meses", "Nenhum"];
        if (!validFreq.includes(freq_extra)) {
            throw new Error("Frequência do aporte extra inválida. Use '6 meses', '12 meses' ou 'Nenhum'.");
        }

        // --- Passo 1: Calcular Taxas e Períodos ---
        let i = 0; // Taxa mensal
        if (r_anual > 0) {
            // Usar precisão total para cálculos intermediários
            i = Math.pow(1 + r_anual, 1 / 12) - 1;
        }
        const n = y * 12; // Número total de meses

        // --- Passo 2: Calcular o Valor Futuro do Aporte Inicial (VF_VP) ---
        let vf_vp = 0;
        if (vp > 0) {
            vf_vp = vp * Math.pow(1 + i, n);
             // Caso r_anual seja 0, i será 0, (1+i)^n será 1, então vf_vp = vp
        }


        // --- Passo 3: Calcular o Valor Futuro dos Aportes Mensais Regulares (VF_Regular) ---
        let vf_regular = 0;
        if (pmt > 0) {
            if (i > 0) {
                vf_regular = pmt * ((Math.pow(1 + i, n) - 1) / i);
            } else { // Caso r_anual seja 0% -> i = 0
                vf_regular = pmt * n; // Juros simples (ou ausência de juros)
            }
        }

        // --- Passo 4: Calcular o Valor Futuro dos Aportes Adicionais de Dezembro (VF_Extra_Dec) ---
        let vf_extra_dec = 0;
        if (pmt > 0) {
            if (r_anual > 0) {
                vf_extra_dec = pmt * ((Math.pow(1 + r_anual, y) - 1) / r_anual);
            } else { // Caso r_anual seja 0%
                 vf_extra_dec = pmt * y;
            }
        }

        // --- Passo 5: Calcular o Valor Futuro dos Aportes Extras Opcionais (VF_Opt_Extra) ---
        let vf_opt_extra = 0;
        if (pmt_extra > 0 && freq_extra !== "Nenhum") {
            if (freq_extra === "12 meses") {
                if (r_anual > 0) {
                    vf_opt_extra = pmt_extra * ((Math.pow(1 + r_anual, y) - 1) / r_anual);
                } else { // Caso r_anual seja 0%
                    vf_opt_extra = pmt_extra * y;
                }
            } else if (freq_extra === "6 meses") {
                const n_semestral = y * 2;
                let i_semestral = 0;
                if(r_anual > 0) {
                    i_semestral = Math.pow(1 + r_anual, 0.5) - 1;
                }

                if (i_semestral > 0) {
                    vf_opt_extra = pmt_extra * ((Math.pow(1 + i_semestral, n_semestral) - 1) / i_semestral);
                } else { // Caso r_anual seja 0% -> i_semestral = 0
                    vf_opt_extra = pmt_extra * n_semestral;
                }
            }
        }

        // --- Passo 6: Calcular o Valor Futuro Total (VF_Total) ---
        const vf_total = vf_vp + vf_regular + vf_extra_dec + vf_opt_extra;

        // Retorna os resultados detalhados e o total, arredondando para 2 casas decimais
        return {
            success: true,
            valorFuturoTotal: parseFloat(vf_total.toFixed(2)),
            detalhes: {
                vf_aporteInicial: parseFloat(vf_vp.toFixed(2)),
                vf_aportesRegulares: parseFloat(vf_regular.toFixed(2)),
                vf_aportesExtrasDezembro: parseFloat(vf_extra_dec.toFixed(2)),
                vf_aportesExtrasOpcionais: parseFloat(vf_opt_extra.toFixed(2))
            },
             // Inclui os parâmetros de entrada para referência
            parametrosEntrada: {
                vp, pmt, r_anual, y, pmt_extra, freq_extra
            }
        };

    } catch (error) {
        console.error("Erro no cálculo:", error);
        return { success: false, error: error.message };
    }
}

// --- Rota da API ---
app.post('/calcular', (req, res) => {
    // Extrai os dados do corpo da requisição JSON
    const {
        vp = 0,         // Valor Presente (default 0)
        pmt,            // Aporte Mensal Regular (obrigatório)
        r_anual,        // Taxa Anual (obrigatória - ex: 0.04)
        y,              // Anos (obrigatório)
        pmt_extra = 0,  // Aporte Extra Opcional (default 0)
        freq_extra = "Nenhum" // Frequência Extra (default "Nenhum")
    } = req.body;

    // Verifica se os parâmetros obrigatórios foram fornecidos
    if (pmt === undefined || r_anual === undefined || y === undefined) {
        return res.status(400).json({
            success: false,
            error: "Parâmetros obrigatórios ausentes: pmt, r_anual, y"
        });
    }

    // Realiza o cálculo
    const resultado = calcularPrevidencia(
        parseFloat(vp),
        parseFloat(pmt),
        parseFloat(r_anual),
        parseInt(y),
        parseFloat(pmt_extra),
        freq_extra
    );

    // Retorna o resultado ou o erro
    if (resultado.success) {
        res.json(resultado);
    } else {
        res.status(400).json(resultado); // Bad Request para erros de cálculo/validação
    }
});

// Rota raiz para verificar se a API está online
app.get('/', (req, res) => {
    res.send('API de Cálculo de Previdência Privada Online!');
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor da API rodando em http://localhost:${port}`);
});