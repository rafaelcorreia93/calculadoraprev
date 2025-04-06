// Importar funções específicas do date-fns
const { Router } = require('express');
const router = Router();

const Decimal = require('decimal.js');

// --- Configuração de Precisão (Ajuste conforme necessário) ---
// Definir precisão suficiente para cálculos intermediários.
// O número de casas decimais para arredondamento final pode ser menor.
Decimal.set({ precision: 9, rounding: Decimal.ROUND_HALF_UP }); // Ex: 20 dígitos de precisão

// --- Funções Auxiliares ---

/**
 * Calcula a idade completa em anos entre duas datas.
 * @param {Date} dataNasc Data de nascimento.
 * @param {Date} dataRef Data de referência.
 * @returns {number} Idade em anos completos.
 */
function calcularIdade(dataNasc, dataRef) {
    if (!(dataNasc instanceof Date) || !(dataRef instanceof Date) || isNaN(dataNasc) || isNaN(dataRef)) {
        throw new Error("Datas inválidas fornecidas para calcularIdade");
    }
    let idade = dataRef.getFullYear() - dataNasc.getFullYear();
    const mesRef = dataRef.getMonth();
    const diaRef = dataRef.getDate();
    const mesNasc = dataNasc.getMonth();
    const diaNasc = dataNasc.getDate();

    if (mesRef < mesNasc || (mesRef === mesNasc && diaRef < diaNasc)) {
        idade--;
    }
    return idade;
}

/**
 * Adiciona um número de meses a uma data.
 * @param {Date} data Data original.
 * @param {number} meses Número de meses a adicionar.
 * @returns {Date} Nova data com os meses adicionados.
 */
function adicionarMes(data, meses) {
    const novaData = new Date(data);
    novaData.setMonth(novaData.getMonth() + meses);
    // Tratamento para caso o dia não exista no novo mês (ex: 31 Jan + 1 mês -> 28/29 Fev)
    if (novaData.getDate() < data.getDate()) {
         novaData.setDate(0); // Vai para o último dia do mês anterior (que é o correto)
    }
    return novaData;
}

/**
 * Converte taxa de juros anual para mensal equivalente (juros compostos).
 * @param {number} percentualAnual Taxa anual (ex: 10 para 10%).
 * @returns {Decimal} Taxa mensal como objeto Decimal.
 */
function calcularTaxaMensal(percentualAnual) {
    const taxaAnualDecimal = new Decimal(percentualAnual).dividedBy(100);
    // (1 + taxa_anual)^(1/12) - 1
    const base = new Decimal(1).plus(taxaAnualDecimal);
    const expoente = new Decimal(1).dividedBy(12);
    const taxaMensal = base.pow(expoente).minus(1);
    return taxaMensal; // Retorna como Decimal para manter precisão
}

/**
 * Calcula o valor base do pagamento para Prazo Definido (usando fórmula PMT).
 * @param {Decimal} pv Valor Presente (Saldo Inicial).
 * @param {Decimal} taxaMensal Taxa de juros mensal (como Decimal).
 * @param {number} prazoAnos Prazo total em anos.
 * @returns {Decimal} Valor do pagamento base mensal (como Decimal).
 */
function calcularValorBasePrazoDefinido(pv, taxaMensal, prazoAnos) {
    const n = prazoAnos * 12; // Número de períodos base

    // Se taxa é zero ou muito próxima de zero
    if (taxaMensal.isZero() || taxaMensal.abs().lt('1e-18')) {
        // Divide pelo número total de pagamentos (13 por ano)
        const totalPagamentos = new Decimal(prazoAnos).times(13);
        if (totalPagamentos.isZero()) return new Decimal(0); // Evita divisão por zero
        return pv.dividedBy(totalPagamentos);
    } else {
        // Fórmula PMT: PV * [ i * (1 + i)^n ] / [ (1 + i)^n - 1 ]
        const i = taxaMensal;
        const onePlusI = new Decimal(1).plus(i);
        const onePlusIPowN = onePlusI.pow(n);

        const numerator = i.times(onePlusIPowN);
        const denominator = onePlusIPowN.minus(1);

        if (denominator.isZero()) {
             // Caso extremamente raro com taxas específicas, trata como sem juros
             console.warn("Denominador zero no cálculo PMT, tratando como taxa zero.");
             const totalPagamentos = new Decimal(prazoAnos).times(13);
             if (totalPagamentos.isZero()) return new Decimal(0);
             return pv.dividedBy(totalPagamentos);
        }

        const pmt = pv.times(numerator).dividedBy(denominator);
        // Conforme pseudocódigo, usamos o PMT calculado como base para Jan-Nov
        return pmt;
    }
}

/**
 * Função principal para calcular a projeção de previdência.
 * @param {object} params Parâmetros de entrada.
 * @param {number} params.saldoAcumuladoInicial Saldo inicial em R$.
 * @param {string|Date} params.dataInicioBeneficio Data de início (string ISO ou Date).
 * @param {string|Date} params.dataNascimentoCliente Data de nascimento (string ISO ou Date).
 * @param {number} params.percentualRentabilidadeAnual Rentabilidade anual (ex: 5 para 5%).
 * @param {number} params.saldoMinimo Saldo mínimo para encerramento (0 se não aplicável).
 * @param {number} params.idadeMaxima Idade máxima para encerramento (0 se não aplicável).
 * @param {'VALOR_FIXO'|'PERCENTUAL_SALDO_MENSAL'|'PERCENTUAL_SALDO_ANUAL'|'PRAZO_DEFINIDO'} params.tipoPagamento Tipo de regra de pagamento.
 * @param {number} params.parametroPagamento Valor/Percentual/Prazo conforme tipoPagamento.
 * @param {number} [params.maxAnosProjecao=100] Limite de anos para evitar loops infinitos.
 * @returns {object} Objeto com a projeção e o motivo do término.
 */
function calcularProjecaoPrevidencia(params) {
    // --- Validação e Inicialização ---
    const {
        saldoAcumuladoInicial,
        dataInicioBeneficio,
        dataNascimentoCliente,
        percentualRentabilidadeAnual,
        saldoMinimo = 0,
        idadeMaxima = 0,
        tipoPagamento,
        parametroPagamento,
        maxAnosProjecao = 100 // Adiciona um limite de segurança
    } = params;

    // Validações básicas (adicione mais conforme necessário)
    if (saldoAcumuladoInicial === undefined || saldoAcumuladoInicial < 0 ||
        !dataInicioBeneficio || !dataNascimentoCliente ||
        percentualRentabilidadeAnual === undefined ||
        !tipoPagamento || parametroPagamento === undefined) {
        throw new Error("Parâmetros de entrada inválidos ou faltando.");
    }

    let saldo_atual = new Decimal(saldoAcumuladoInicial);
    const data_inicio = new Date(dataInicioBeneficio);
    const data_nasc = new Date(dataNascimentoCliente);
    let data_atual = new Date(data_inicio); // Começa na data de início

    if (isNaN(data_inicio) || isNaN(data_nasc)) {
        throw new Error("Datas de início ou nascimento inválidas.");
    }

    const projecaoMensal = [];
    let valor_beneficio_anual_calculado = new Decimal(0); // Usado para tipo 2b
    let status_beneficio = "Ativo";
    const motivoTermino = { code: null, description: null }; // Para armazenar o motivo

    const taxa_mensal = calcularTaxaMensal(percentualRentabilidadeAnual);
    const d_saldo_minimo = new Decimal(saldoMinimo);

    // --- Pré-cálculos ---
    let valor_base_prazo_definido = new Decimal(0);
    if (tipoPagamento === 'PRAZO_DEFINIDO') {
        if (parametroPagamento <= 0) throw new Error("Prazo definido deve ser maior que zero.");
        valor_base_prazo_definido = calcularValorBasePrazoDefinido(saldo_atual, taxa_mensal, parametroPagamento);
    }
    if (tipoPagamento === 'PERCENTUAL_SALDO_ANUAL') {
        if (parametroPagamento < 0) throw new Error("Percentual deve ser não-negativo.");
        // Calcula sobre o saldo inicial antes do primeiro pagamento
        valor_beneficio_anual_calculado = saldo_atual.times(new Decimal(parametroPagamento).dividedBy(100));
    }
     if (tipoPagamento === 'PERCENTUAL_SALDO_MENSAL' && parametroPagamento < 0) {
         throw new Error("Percentual deve ser não-negativo.");
     }
     if (tipoPagamento === 'VALOR_FIXO' && parametroPagamento < 0) {
         throw new Error("Valor fixo deve ser não-negativo.");
     }

    const limiteDataFinal = adicionarMes(data_inicio, maxAnosProjecao * 12); // Data limite de segurança

    // --- Loop de Projeção ---
    while (status_beneficio === "Ativo") {

        const mes_atual = data_atual.getMonth() + 1; // 1 a 12
        const ano_atual = data_atual.getFullYear();
        const idade_cliente = calcularIdade(data_nasc, data_atual);

        const saldo_inicial_neste_mes = saldo_atual; // Guarda o saldo no início do mês

        // --- 1. Verificar Condições de Término (Início do Mês) ---
        if (idadeMaxima > 0 && idade_cliente >= idadeMaxima) {
            status_beneficio = "Encerrado";
            motivoTermino.code = "IDADE_MAXIMA";
            motivoTermino.description = `Encerrado: Idade (${idade_cliente}) atingiu ou superou a máxima permitida (${idadeMaxima}).`;
            break;
        }
        // Verifica saldo mínimo ANTES de qualquer operação no mês
        // Usamos '> 0' para permitir que saldoMinimo = 0 desative a regra
        if (d_saldo_minimo.gt(0) && saldo_inicial_neste_mes.lte(d_saldo_minimo)) {
            status_beneficio = "Encerrado";
            motivoTermino.code = "SALDO_MINIMO";
            motivoTermino.description = `Encerrado: Saldo inicial do mês (R$ ${saldo_inicial_neste_mes.toFixed(2)}) atingiu ou ficou abaixo do mínimo permitido (R$ ${d_saldo_minimo.toFixed(2)}).`;
            break;
        }
        // Se saldo já está zerado ou negativo no início do mês.
        // Usamos lte (less than or equal) para pegar o caso de ser exatamente zero.
        if (saldo_inicial_neste_mes.lte(0)) {
            // Se saldo é 0 e o benefício tb seria 0 (ex: % sobre saldo 0), não precisa encerrar ainda, mas não haverá pagamento nem juros.
            // No entanto, se o saldo é negativo, ou se o saldo é 0 mas haveria um pagamento fixo ou prazo definido, encerra.
             if (saldo_inicial_neste_mes.lt(0) ||
                 (saldo_inicial_neste_mes.isZero() && (tipoPagamento === 'VALOR_FIXO' || tipoPagamento === 'PRAZO_DEFINIDO') && parametroPagamento > 0) ||
                 (saldo_inicial_neste_mes.isZero() && tipoPagamento === 'PERCENTUAL_SALDO_ANUAL' && valor_beneficio_anual_calculado.gt(0))
                 )
                {
                    status_beneficio = "Encerrado";
                    motivoTermino.code = "SALDO_ZERADO_NEGATIVO";
                    motivoTermino.description = `Encerrado: Saldo inicial do mês zerado (R$ ${saldo_inicial_neste_mes.toFixed(2)}) ou negativo.`;
                    break;
                }
        }

        // --- 2. Calcular Valor Base do Benefício Mensal ---
        let valor_beneficio_mes_base = new Decimal(0);
        const d_parametro_pagamento = new Decimal(parametroPagamento); // Converter para Decimal se necessário

        switch (tipoPagamento) {
            case 'VALOR_FIXO':
                valor_beneficio_mes_base = d_parametro_pagamento;
                break;
            case 'PERCENTUAL_SALDO_MENSAL':
                // Recalcula todo mês sobre o saldo *inicial* do mês
                valor_beneficio_mes_base = saldo_inicial_neste_mes.times(d_parametro_pagamento.dividedBy(100));
                break;
            case 'PERCENTUAL_SALDO_ANUAL':
                // Recalcula apenas em Janeiro sobre o saldo *inicial* daquele mês
                if (mes_atual === 1) {
                    valor_beneficio_anual_calculado = saldo_inicial_neste_mes.times(d_parametro_pagamento.dividedBy(100));
                }
                valor_beneficio_mes_base = valor_beneficio_anual_calculado;
                break;
            case 'PRAZO_DEFINIDO':
                valor_beneficio_mes_base = valor_base_prazo_definido;
                break;
            default:
                 throw new Error(`Tipo de pagamento desconhecido: ${tipoPagamento}`);
        }
         // Garante que o benefício base não seja negativo
         if (valor_beneficio_mes_base.lt(0)) {
             valor_beneficio_mes_base = new Decimal(0);
         }

        // --- 3. Ajustar Benefício (13º) e Calcular Pagamento Efetivo ---
        let valor_beneficio_mes_ajustado = valor_beneficio_mes_base;
        if (mes_atual === 12) {
            valor_beneficio_mes_ajustado = valor_beneficio_mes_base.times(2);
        }

        // O valor pago não pode ser maior que o saldo disponível ANTES dos juros
        // E não pode ser negativo
        const valor_efetivamente_pago = Decimal.max(0, Decimal.min(valor_beneficio_mes_ajustado, saldo_inicial_neste_mes));

        // Calcular saldo após o pagamento, antes dos juros
        const saldo_apos_pagamento = saldo_inicial_neste_mes.minus(valor_efetivamente_pago);

        // --- 4. Calcular Juros do Mês ---
        // Juros incidem sobre o saldo que permaneceu *após* o pagamento
        // Só calcula juros se o saldo após pagamento for positivo
        const juros_mes = saldo_apos_pagamento.gt(0) ? saldo_apos_pagamento.times(taxa_mensal) : new Decimal(0);

        // --- 5. Calcular Saldo Final do Mês ---
        const saldo_final_mes = saldo_apos_pagamento.plus(juros_mes);

        // --- 6. Registrar Dados do Mês ---
        // Arredonda para 2 casas decimais APENAS para o registro/exibição
        projecaoMensal.push({
            mesAno: `${String(mes_atual).padStart(2, '0')}/${ano_atual}`,
            idadeCliente: idade_cliente,
            saldoInicial: saldo_inicial_neste_mes.toDecimalPlaces(2).toNumber(),
            beneficioBruto: valor_beneficio_mes_base.toDecimalPlaces(2).toNumber(), // Valor base calculado
            beneficioPago: valor_efetivamente_pago.toDecimalPlaces(2).toNumber(),
            // saldoAposPagamento: saldo_apos_pagamento.toDecimalPlaces(2).toNumber(), // Opcional
            juros: juros_mes.toDecimalPlaces(2).toNumber(),
            saldoFinal: saldo_final_mes.toDecimalPlaces(2).toNumber(),
            // status: status_beneficio // O status só muda no início do próximo loop
        });

        // --- 7. Atualizar para Próximo Mês ---
        saldo_atual = saldo_final_mes; // Atualiza o saldo para a próxima iteração (mantém precisão Decimal)
        data_atual = adicionarMes(data_atual, 1);

        // --- Verificação de segurança ---
        if (data_atual > limiteDataFinal) {
             status_beneficio = "Interrompido";
             motivoTermino.code = "MAX_PROJECAO";
             motivoTermino.description = `Interrompido: Projeção excedeu o limite de ${maxAnosProjecao} anos.`;
             break;
        }
         // Se o saldo zerou exatamente após o pagamento e juros, o loop vai parar na proxima iteração na checagem inicial.
    } // --- Fim do Loop While ---


    // Define o motivo do término se o loop terminou naturalmente (sem break por condição específica)
    if (status_beneficio === "Ativo") {
         motivoTermino.code = "COMPLETO"; // Ou outro status apropriado
         motivoTermino.description = "Projeção concluída (sem atingir condições de término antecipado).";
         // Para prazo definido, verificar se o saldo final está próximo de zero pode ser útil
         if (tipoPagamento === 'PRAZO_DEFINIDO' && saldo_atual.abs().lt('0.01')) {
             motivoTermino.description = "Projeção concluída: Prazo definido atingido e saldo zerado.";
         } else if (tipoPagamento === 'PRAZO_DEFINIDO') {
             motivoTermino.description = `Projeção concluída: Prazo definido atingido. Saldo residual: R$ ${saldo_atual.toFixed(2)}.`;
         }
    }

    // --- Retorno ---
    return {
        projecao: projecaoMensal,
        motivoTermino: motivoTermino,
    };
}

router.post('/simular-evolucao', (req, res) => {
    try {
        // 1. Validar req.body (usar bibliotecas como Joi ou express-validator é recomendado)
        const params = req.body;

        // Exemplo de validação simples (substitua por algo robusto)
        if (!params || typeof params.saldoAcumuladoInicial !== 'number' /* ... outras validações */) {
            return res.status(400).json({ error: 'Parâmetros inválidos ou faltando.' });
        }

        // 2. Chamar a função de cálculo
        const resultado = calcularProjecaoPrevidencia(params);

        // 3. Retornar o resultado
        res.status(200).json(resultado);

    } catch (error) {
        console.error("Erro na simulação de previdência:", error);
        // Retorna erro genérico ou mais específico baseado no tipo de erro
        if (error.message.includes("inválid")) { // Erros de validação internos da função
             res.status(400).json({ error: error.message });
        } else {
             res.status(500).json({ error: 'Erro interno ao processar a simulação.' });
        }
    }
});
module.exports = router; // Exporta o roteador