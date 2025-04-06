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
    // Guarda o dia original para checagem posterior
    const diaOriginal = novaData.getDate();
    novaData.setMonth(novaData.getMonth() + meses);
    // Se o mês mudou mas o dia diminuiu (ex: 31 Jan + 1 mês -> ficou 28 Fev),
    // ajusta para o último dia do mês anterior ao que foi definido.
    if (novaData.getDate() !== diaOriginal) {
         novaData.setDate(0); // Vai para o último dia do mês anterior correto
    }
    return novaData;
}

/**
 * Converte taxa de juros anual para mensal equivalente (juros compostos).
 * @param {number} percentualAnual Taxa anual (ex: 10 para 10%).
 * @returns {Decimal} Taxa mensal como objeto Decimal.
 */
function calcularTaxaMensal(percentualAnual) {
    if (typeof percentualAnual !== 'number') {
        throw new Error("Percentual de rentabilidade anual deve ser um número.");
    }
    const taxaAnualDecimal = new Decimal(percentualAnual).dividedBy(100);
    if (taxaAnualDecimal.eq(-1)) {
        // Evita logaritmo de zero ou raiz de número negativo se a taxa for -100%
        throw new Error("Taxa de rentabilidade anual não pode ser -100%.");
    }
    // (1 + taxa_anual)^(1/12) - 1
    const base = new Decimal(1).plus(taxaAnualDecimal);
     // Verifica se a base é negativa (rentabilidade < -100%), o que não é permitido para raiz par
     if (base.isNegative()) {
        throw new Error("Taxa de rentabilidade anual inferior a -100% não é suportada para cálculo de taxa mensal composta.");
    }
    const expoente = new Decimal(1).dividedBy(12);
    const taxaMensal = base.pow(expoente).minus(1);
    return taxaMensal; // Retorna como Decimal para manter precisão
}

/**
 * Função principal (modificada para busca)
 * Adiciona `options.buscaObjetivo` para retornar dados específicos.
 */
function calcularProjecaoPrevidencia(params, options = {}) {
    const {
        saldoAcumuladoInicial,
        dataInicioBeneficio,
        dataNascimentoCliente,
        percentualRentabilidadeAnual,
        saldoMinimo = 0, // Parâmetro de entrada
        idadeMaxima = 0,
        tipoPagamento,
        parametroPagamento,
        maxAnosProjecao = 100,
        limiteMaximoPercentualSaldo = 2, // 2% por padrão
        limiteMaximoPrazo = 25,          // 25 anos por padrão
        limiteMaximoValorFixo = 50000     // R$ 50.000 por padrão
    } = params;

    // --- Validação e Inicialização ---
    // (Validações de entrada inalteradas)
    if (saldoAcumuladoInicial === undefined || typeof saldoAcumuladoInicial !== 'number' || saldoAcumuladoInicial < 0 || !dataInicioBeneficio || !dataNascimentoCliente || percentualRentabilidadeAnual === undefined || typeof percentualRentabilidadeAnual !== 'number' || !tipoPagamento || parametroPagamento === undefined || typeof parametroPagamento !== 'number') { throw new Error("Parâmetros de entrada inválidos ou faltando ou com tipos incorretos."); }
    if ((tipoPagamento === 'PRAZO_DEFINIDO' || tipoPagamento === 'PERCENTUAL_SALDO_ANUAL' || tipoPagamento === 'PERCENTUAL_SALDO_MENSAL' || tipoPagamento === 'VALOR_FIXO') && parametroPagamento < 0) { throw new Error("Parâmetro de pagamento não pode ser negativo."); }
    if (tipoPagamento === 'PRAZO_DEFINIDO' && parametroPagamento <= 0) { throw new Error("Prazo definido deve ser maior que zero anos."); }
    // Validação dos próprios limites (devem ser não negativos)
    if (typeof limiteMaximoPercentualSaldo !== 'number' || limiteMaximoPercentualSaldo < 0) throw new Error("limiteMaximoPercentualSaldo inválido.");
    if (typeof limiteMaximoPrazo !== 'number' || limiteMaximoPrazo < 0) throw new Error("limiteMaximoPrazo inválido.");
    if (typeof limiteMaximoValorFixo !== 'number' || limiteMaximoValorFixo < 0) throw new Error("limiteMaximoValorFixo inválido.");

    // --- Validação dos Limites de Pagamento ---
    switch (tipoPagamento) {
        case 'PERCENTUAL_SALDO_MENSAL':
        case 'PERCENTUAL_SALDO_ANUAL':
            if (parametroPagamento > limiteMaximoPercentualSaldo) {
                throw new Error(`O percentual do saldo informado (${parametroPagamento}%) excede o limite máximo permitido de ${limiteMaximoPercentualSaldo}%.`);
            }
            break;
        case 'PRAZO_DEFINIDO':
            if (parametroPagamento > limiteMaximoPrazo) {
                throw new Error(`O prazo informado (${parametroPagamento} anos) excede o limite máximo permitido de ${limiteMaximoPrazo} anos.`);
            }
            break;
        case 'VALOR_FIXO':
            if (parametroPagamento > limiteMaximoValorFixo) {
                throw new Error(`O valor fixo informado (R$ ${parametroPagamento.toFixed(2)}) excede o limite máximo permitido de R$ ${limiteMaximoValorFixo.toFixed(2)}.`);
            }
            break;
    }

    let saldo_atual = new Decimal(saldoAcumuladoInicial);
    const data_inicio = new Date(dataInicioBeneficio);
    const data_nasc = new Date(dataNascimentoCliente);
    let data_atual = new Date(data_inicio);

    if (isNaN(data_inicio.getTime()) || isNaN(data_nasc.getTime())) {
        throw new Error("Datas de início ou nascimento inválidas.");
    }

    const projecaoMensal = [];
    let valor_beneficio_anual_calculado_inicial = new Decimal(0); // Para % anual
    let status_beneficio = "Ativo";
    const taxa_mensal = calcularTaxaMensal(percentualRentabilidadeAnual);
    const motivoTermino = { code: null, description: null, dataTermino: null, saldoRemanescente: null, idadeTermino: null };

    let total_cotas_prazo_definido = new Decimal(0);
    let cotas_restantes_prazo_definido = new Decimal(0);
     if (tipoPagamento === 'PRAZO_DEFINIDO') {
         total_cotas_prazo_definido = new Decimal(parametroPagamento).times(13);
         cotas_restantes_prazo_definido = total_cotas_prazo_definido;
     }
      // Pré-cálculo inicial para Percentual Anual (será usado no cálculo do 1o pagamento se saldoMinimo=0)
     if (tipoPagamento === 'PERCENTUAL_SALDO_ANUAL') {
         valor_beneficio_anual_calculado_inicial = saldo_atual.times(new Decimal(parametroPagamento).dividedBy(100));
     }

    const limiteDataFinal = adicionarMes(data_inicio, maxAnosProjecao * 12);

    // --- Lógica do Saldo Mínimo Efetivo (AJUSTADA) ---
    let saldo_minimo_efetivo = new Decimal(saldoMinimo); // Começa com o valor de entrada
    let usouPrimeiroPagamentoComoMinimo = false;
    const ignorarLimites = options?.buscaObjetivo?.ignorarLimites ?? false;

    // **** SÓ APLICA A REGRA ESPECIAL SE NÃO ESTIVER IGNORANDO LIMITES ****
    if (!ignorarLimites && saldoMinimo === 0 && saldo_atual.gt(0)) {
        usouPrimeiroPagamentoComoMinimo = true;
        let primeiro_beneficio_base = new Decimal(0); 
        const d_parametro_pagamento = new Decimal(parametroPagamento); 
        const primeiro_mes = data_inicio.getMonth() + 1; 
        const saldo_inicial_decimal = new Decimal(saldoAcumuladoInicial); 
        switch (tipoPagamento) { 
            case 'VALOR_FIXO': primeiro_beneficio_base = d_parametro_pagamento; 
            break; 
            case 'PERCENTUAL_SALDO_MENSAL': primeiro_beneficio_base = saldo_inicial_decimal.times(d_parametro_pagamento.dividedBy(100)); 
            break; 
            case 'PERCENTUAL_SALDO_ANUAL': primeiro_beneficio_base = valor_beneficio_anual_calculado_inicial; 
            break; 
            case 'PRAZO_DEFINIDO': 
            if (total_cotas_prazo_definido.gt(0)) 
                { 
                    primeiro_beneficio_base = saldo_inicial_decimal.dividedBy(total_cotas_prazo_definido); 
                } else { 
                    primeiro_beneficio_base = new Decimal(0); 
                } 
            break; 
        } 
        if (primeiro_beneficio_base.lt(0)) 
            { primeiro_beneficio_base = new Decimal(0); } 
        let primeiro_beneficio_ajustado = primeiro_beneficio_base; 
        if (primeiro_mes === 12) 
            { primeiro_beneficio_ajustado = primeiro_beneficio_base.times(2); } 
        saldo_minimo_efetivo = Decimal.max(0, Decimal.min(primeiro_beneficio_ajustado, saldo_inicial_decimal));
        // console.log(`INFO: Saldo Mínimo = 0. Definido Saldo Mínimo Efetivo como o primeiro pagamento: ${saldo_minimo_efetivo.toFixed(2)}`);
    } else if (ignorarLimites && saldoMinimo === 0) {
         // Se está ignorando limites E o input foi 0, força o efetivo a 0
         saldo_minimo_efetivo = new Decimal(0);
         // console.log("INFO: Busca ativa e Saldo Mínimo = 0. Saldo Mínimo Efetivo forçado para 0.");
    }
    // Se saldoMinimo > 0, saldo_minimo_efetivo já tem esse valor.

    // --- Loop de Projeção ---
    let meses_simulados = 0;
    let valor_beneficio_anual_calculado_loop = valor_beneficio_anual_calculado_inicial; // Variável para o loop

    while (status_beneficio === "Ativo") {
        const mes_atual = data_atual.getMonth() + 1;
        const ano_atual = data_atual.getFullYear();
        const idade_cliente = calcularIdade(data_nasc, data_atual);
        if (idade_cliente === null) throw new Error("Não foi possível calcular a idade do cliente.");

        const saldo_inicial_neste_mes = saldo_atual;

        // --- 1. Verificar Condições de Término (Início do Mês) ---
        const ignorarLimites = options?.buscaObjetivo?.ignorarLimites ?? false;

        // Saldo Zerado/Negativo (Prioritário)
        if (saldo_inicial_neste_mes.lte(0)) {
            status_beneficio = "Encerrado"; motivoTermino.code = "SALDO_ZERADO_NEGATIVO";
            motivoTermino.description = `Encerrado: Saldo inicial do mês zerado ou negativo (R$ ${saldo_inicial_neste_mes.toFixed(2)}).`;
            break;
        }
        // Cotas Esgotadas (Prazo Definido)
        if (tipoPagamento === 'PRAZO_DEFINIDO' && cotas_restantes_prazo_definido.lte(0)) {
            status_beneficio = "Encerrado"; motivoTermino.code = "PRAZO_COTAS_ESGOTADAS";
            motivoTermino.description = `Encerrado: Número de cotas (${total_cotas_prazo_definido.toString()}) para o prazo definido de ${parametroPagamento} anos foi atingido.`;
            break;
        }

        // Idade e Saldo Mínimo Efetivo (se não estiver ignorando)
        if (!ignorarLimites) {
            if (idadeMaxima > 0 && idade_cliente >= idadeMaxima) {
                status_beneficio = "Encerrado"; motivoTermino.code = "IDADE_MAXIMA";
                motivoTermino.description = `Encerrado: Idade (${idade_cliente}) atingiu ou superou a máxima permitida (${idadeMaxima}).`;
                break;
            }
            // **** USA saldo_minimo_efetivo ****
            if (saldo_minimo_efetivo.gt(0) && saldo_inicial_neste_mes.lte(saldo_minimo_efetivo)) {
                status_beneficio = "Encerrado"; motivoTermino.code = "SALDO_MINIMO";
                let descMinimo = `Encerrado: Saldo inicial do mês (R$ ${saldo_inicial_neste_mes.toFixed(2)}) atingiu ou ficou abaixo do mínimo permitido (R$ ${saldo_minimo_efetivo.toFixed(2)})`;
                if (usouPrimeiroPagamentoComoMinimo) {
                    descMinimo += ' (definido pelo valor do primeiro pagamento).';
                } else {
                    descMinimo += '.';
                }
                motivoTermino.description = descMinimo;
                break;
            }
        }

        // --- 2. Calcular Valor Base do Benefício Mensal ---
        let valor_beneficio_mes_base = new Decimal(0);
        const d_parametro_pagamento = new Decimal(parametroPagamento);

        switch (tipoPagamento) {
             case 'VALOR_FIXO': valor_beneficio_mes_base = d_parametro_pagamento; break;
             case 'PERCENTUAL_SALDO_MENSAL': valor_beneficio_mes_base = saldo_inicial_neste_mes.times(d_parametro_pagamento.dividedBy(100)); break;
             case 'PERCENTUAL_SALDO_ANUAL':
                 if (mes_atual === 1) { // Recalcula valor anual em Janeiro
                    valor_beneficio_anual_calculado_loop = saldo_inicial_neste_mes.times(d_parametro_pagamento.dividedBy(100));
                 }
                 valor_beneficio_mes_base = valor_beneficio_anual_calculado_loop; // Usa o valor anual corrente
                 break;
             case 'PRAZO_DEFINIDO':
                  if (cotas_restantes_prazo_definido.gt(0)) { valor_beneficio_mes_base = saldo_inicial_neste_mes.dividedBy(cotas_restantes_prazo_definido); }
                  else { valor_beneficio_mes_base = new Decimal(0); }
                  break;
             default: throw new Error(`Tipo de pagamento desconhecido: ${tipoPagamento}`);
        }
        if (valor_beneficio_mes_base.lt(0)) { valor_beneficio_mes_base = new Decimal(0); }

        // --- 3. Ajuste 13º, Pagamento, Juros, Saldo Final (lógica inalterada) ---
        let valor_beneficio_mes_ajustado = valor_beneficio_mes_base;
        let cotas_consumidas_neste_mes = new Decimal(1);
        if (mes_atual === 12) { valor_beneficio_mes_ajustado = valor_beneficio_mes_base.times(2); cotas_consumidas_neste_mes = new Decimal(2); }
        const valor_efetivamente_pago = Decimal.max(0, Decimal.min(valor_beneficio_mes_ajustado, saldo_inicial_neste_mes));
        const saldo_apos_pagamento = saldo_inicial_neste_mes.minus(valor_efetivamente_pago);
        const juros_mes = saldo_apos_pagamento.gt(0) ? saldo_apos_pagamento.times(taxa_mensal) : new Decimal(0);
        const saldo_final_mes = saldo_apos_pagamento.plus(juros_mes);

        // --- 6. Registro (só se não for busca leve) ---
        if (!options?.buscaObjetivo?.leve) {
             projecaoMensal.push({
                 mesAno: `${String(mes_atual).padStart(2, '0')}/${ano_atual}`,
                 idadeCliente: idade_cliente,
                 saldoInicial: saldo_inicial_neste_mes.toDecimalPlaces(2).toNumber(),
                 beneficioBruto: valor_beneficio_mes_base.toDecimalPlaces(2).toNumber(),
                 beneficioPago: valor_efetivamente_pago.toDecimalPlaces(2).toNumber(),
                 juros: juros_mes.toDecimalPlaces(2).toNumber(),
                 saldoFinal: saldo_final_mes.toDecimalPlaces(2).toNumber(),
             });
        }

        // --- 7. Atualização Próximo Mês (inalterada) ---
        saldo_atual = saldo_final_mes;
        data_atual = adicionarMes(data_atual, 1);
        meses_simulados++;
        if (tipoPagamento === 'PRAZO_DEFINIDO') { cotas_restantes_prazo_definido = cotas_restantes_prazo_definido.minus(cotas_consumidas_neste_mes); }

        // --- Verificação Segurança / Parada Busca (inalterada) ---
         if (data_atual > limiteDataFinal) { status_beneficio = "Interrompido"; motivoTermino.code = "MAX_PROJECAO"; motivoTermino.description = `Interrompido: Projeção excedeu o limite de ${maxAnosProjecao} anos.`; break; }
         if (options?.buscaObjetivo?.targetMeses && meses_simulados >= options.buscaObjetivo.targetMeses) { status_beneficio = "Atingiu Target"; motivoTermino.code = "ATINGIU_TARGET_BUSCA"; break; }

    } // --- Fim Loop ---

    // --- Pós-Loop (finalização normal ou retorno para busca) ---
    // (Lógica de finalização e retorno inalterada, já usa motivoTermino preenchido no loop)
     if (options?.buscaObjetivo) {
         return { mesesDuracao: meses_simulados, saldoFinalTarget: saldo_atual, parouNoTarget: status_beneficio === "Atingiu Target", parouAntesPorSaldo: status_beneficio === "Encerrado" && motivoTermino.code === "SALDO_ZERADO_NEGATIVO" };
     }
     // Preenche motivoTermino final se o loop não parou por break
     if (status_beneficio === "Ativo") { /* ... lógica pós-loop para motivoTermino ... */ }
    const mesTermino = String(data_atual.getMonth() + 1).padStart(2, '0'); const anoTermino = data_atual.getFullYear(); motivoTermino.dataTermino = `${mesTermino}/${anoTermino}`; motivoTermino.saldoRemanescente = saldo_atual.toDecimalPlaces(2).toNumber(); const idadeFinalCliente = calcularIdade(data_nasc, data_atual); motivoTermino.idadeTermino = idadeFinalCliente; if (idadeFinalCliente === null) { motivoTermino.idadeTermino = null; }

    return { projecao: projecaoMensal, motivoTermino: motivoTermino };
}


// --- Nova Função: calcularParametroIdeal ---
/**
 * Calcula os parâmetros ideais... (descrição anterior)
 * Agora considera os limites máximos de pagamento.
 */
function calcularParametroIdeal(buscaParams) {
    const {
        saldoAcumuladoInicial, dataInicioBeneficio, dataNascimentoCliente,
        percentualRentabilidadeAnual, objetivoDuracaoAnos,
        // --- Receber Limites (com padrões) ---
        limiteMaximoPercentualSaldo = 2,
        limiteMaximoPrazo = 25,
        limiteMaximoValorFixo = 50000
    } = buscaParams; // Recebe os limites da chamada

    // ... (validações básicas de buscaParams inalteradas) ...
     if (!saldoAcumuladoInicial || !dataInicioBeneficio || !dataNascimentoCliente || percentualRentabilidadeAnual === undefined || !objetivoDuracaoAnos || objetivoDuracaoAnos <= 0) { throw new Error("Parâmetros inválidos para calcularParametroIdeal."); }
     // Validar limites recebidos
     if (typeof limiteMaximoPercentualSaldo !== 'number' || limiteMaximoPercentualSaldo < 0) throw new Error("limiteMaximoPercentualSaldo inválido em buscaParams.");
     if (typeof limiteMaximoPrazo !== 'number' || limiteMaximoPrazo < 0) throw new Error("limiteMaximoPrazo inválido em buscaParams.");
     if (typeof limiteMaximoValorFixo !== 'number' || limiteMaximoValorFixo < 0) throw new Error("limiteMaximoValorFixo inválido em buscaParams.");


    const targetMeses = objetivoDuracaoAnos * 12;
    const paramsBase = {
        saldoAcumuladoInicial, dataInicioBeneficio, dataNascimentoCliente,
        percentualRentabilidadeAnual, saldoMinimo: 0, idadeMaxima: 0,
        // Passa os limites para a simulação interna, caso sejam necessários lá
        limiteMaximoPercentualSaldo, limiteMaximoPrazo, limiteMaximoValorFixo
    };

    const MAX_ITERATIONS = 100;
    const TOLERANCE = new Decimal('0.01');

    // --- Função Auxiliar de Busca Binária (findParam - inalterada internamente) ---
     const findParam = (tipo, minParam, maxParam) => { /* ... lógica da busca ... */
        let minP = new Decimal(minParam); let maxP = new Decimal(maxParam); let bestParam = null;
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            if (maxP.minus(minP).abs().lt(TOLERANCE)) break;
            let midP = minP.plus(maxP).dividedBy(2); if (midP.eq(minP) || midP.eq(maxP)) break;
            const paramsSimulacao = { ...paramsBase, tipoPagamento: tipo, parametroPagamento: midP.toNumber() };
            try {
                 const resultadoBusca = calcularProjecaoPrevidencia(paramsSimulacao, { buscaObjetivo: { targetMeses: targetMeses, leve: true, ignorarLimites: true } });
                 if (resultadoBusca.parouAntesPorSaldo && resultadoBusca.mesesDuracao < targetMeses) { maxP = midP; }
                 else if (resultadoBusca.parouNoTarget && resultadoBusca.saldoFinalTarget.gt(TOLERANCE)) { minP = midP; bestParam = midP; }
                 else if (resultadoBusca.parouNoTarget && resultadoBusca.saldoFinalTarget.abs().lte(TOLERANCE)) { bestParam = midP; break; }
                 else if (resultadoBusca.mesesDuracao > targetMeses && resultadoBusca.saldoFinalTarget.gt(TOLERANCE)) { minP = midP; bestParam = midP; }
                 else { if (resultadoBusca.parouAntesPorSaldo) { maxP = midP; } else { minP = midP; bestParam = midP; } }
             } catch (error) { console.error(`Erro na simulação durante busca (${tipo}, param=${midP.toNumber()}): ${error.message}`); return null; }
         } // Fim for
         return bestParam ? bestParam : minP.plus(maxP).dividedBy(2);
     };

    // --- Executar Buscas ---
    // Ajusta o limite superior da busca para não exceder o limite do parâmetro
    const maxValorFixoBusca = Math.min(new Decimal(saldoAcumuladoInicial).dividedBy(12).toNumber(), limiteMaximoValorFixo);
    const idealValorFixoDecimal = findParam('VALOR_FIXO', 0, maxValorFixoBusca);

    const maxPercentualBusca = Math.min(50, limiteMaximoPercentualSaldo); // Limita busca a 50% ou ao limite, o que for menor
    const idealPercentualAnualDecimal = findParam('PERCENTUAL_SALDO_ANUAL', 0, maxPercentualBusca);

    // --- Aplicar Limites ao Resultado e Definir Prazo ---
    let finalValorFixo = null;
    let valorFixoCapped = false;
    if (idealValorFixoDecimal) {
        if (idealValorFixoDecimal.gt(limiteMaximoValorFixo)) {
            finalValorFixo = new Decimal(limiteMaximoValorFixo);
            valorFixoCapped = true;
        } else {
            finalValorFixo = idealValorFixoDecimal;
        }
    }

    let finalPercentualAnual = null;
    let percentualAnualCapped = false;
    if (idealPercentualAnualDecimal) {
        if (idealPercentualAnualDecimal.gt(limiteMaximoPercentualSaldo)) {
            finalPercentualAnual = new Decimal(limiteMaximoPercentualSaldo);
            percentualAnualCapped = true;
        } else {
            finalPercentualAnual = idealPercentualAnualDecimal;
        }
    }

    let finalPrazoDefinido = objetivoDuracaoAnos;
    let prazoDefinidoCapped = false;
    if (objetivoDuracaoAnos > limiteMaximoPrazo) {
        finalPrazoDefinido = limiteMaximoPrazo;
        prazoDefinidoCapped = true;
    }

    // --- Retornar Resultados ---
    return {
        objetivoDuracaoAnos: objetivoDuracaoAnos,
        limitesConsiderados: { // Informa os limites usados no cálculo
            percentualSaldo: limiteMaximoPercentualSaldo,
            prazoAnos: limiteMaximoPrazo,
            valorFixo: limiteMaximoValorFixo
        },
        resultados: { // Agrupa os resultados
            valorFixo: finalValorFixo ? finalValorFixo.toDecimalPlaces(2).toNumber() : null,
            valorFixoCapped: valorFixoCapped,
            percentualAnual: finalPercentualAnual ? finalPercentualAnual.toDecimalPlaces(4).toNumber() : null,
            percentualAnualCapped: percentualAnualCapped,
            prazoDefinido: finalPrazoDefinido,
            prazoDefinidoCapped: prazoDefinidoCapped
        }
    };
}

router.post('/beneficio-ideal', (req, res) => {
    // 1. Extrair e Validar Parâmetros de Entrada
    const buscaParams = req.body;
    const {
        saldoAcumuladoInicial,
        dataInicioBeneficio,
        dataNascimentoCliente,
        percentualRentabilidadeAnual,
        objetivoDuracaoAnos
    } = buscaParams;

    // Validação básica (adicione validações mais robustas conforme necessário)
    const errors = [];
    if (saldoAcumuladoInicial === undefined || typeof saldoAcumuladoInicial !== 'number' || saldoAcumuladoInicial <= 0) {
        errors.push("saldoAcumuladoInicial é obrigatório, deve ser um número positivo.");
    }
    if (!dataInicioBeneficio || isNaN(new Date(dataInicioBeneficio).getTime())) {
        errors.push("dataInicioBeneficio é obrigatória e deve ser uma data válida (formato ISO 8601 recomendado).");
    }
    if (!dataNascimentoCliente || isNaN(new Date(dataNascimentoCliente).getTime())) {
        errors.push("dataNascimentoCliente é obrigatória e deve ser uma data válida (formato ISO 8601 recomendado).");
    }
    if (percentualRentabilidadeAnual === undefined || typeof percentualRentabilidadeAnual !== 'number') {
        errors.push("percentualRentabilidadeAnual é obrigatório e deve ser um número.");
    }
    if (objetivoDuracaoAnos === undefined || typeof objetivoDuracaoAnos !== 'number' || objetivoDuracaoAnos <= 0) {
        errors.push("objetivoDuracaoAnos é obrigatório, deve ser um número positivo.");
    }

    if (errors.length > 0) {
        console.log("Erros de validação:", errors);
        return res.status(400).json({
            message: "Parâmetros de entrada inválidos.",
            errors: errors
        });
    }

    // 2. Chamar a Função de Cálculo
    try {
        console.log("Chamando calcularParametroIdeal com:", buscaParams);
        const resultadosIdeais = calcularParametroIdeal(buscaParams);
        console.log("Resultado do cálculo:", resultadosIdeais);

        // 3. Retornar o Resultado
        res.status(200).json(resultadosIdeais);

    } catch (error) {
        // 4. Lidar com Erros do Cálculo
        console.error("Erro durante o cálculo dos parâmetros ideais:", error);
        res.status(500).json({
            message: "Erro interno ao calcular os parâmetros ideais.",
            error: error.message // Envia a mensagem de erro específica
        });
    }
});
module.exports = router; // Exporta o roteador