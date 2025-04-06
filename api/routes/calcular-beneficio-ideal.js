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


/**
 * Calcula os parâmetros ideais... (descrição anterior)
 * Usa busca binária para Valor Fixo.
 * Usa estratégia de DUPLA AMOSTRAGEM para Percentual Anual.
 */
function calcularParametroIdeal(buscaParams) {
    const {
        saldoAcumuladoInicial, dataInicioBeneficio, dataNascimentoCliente,
        percentualRentabilidadeAnual, objetivoDuracaoAnos,
        limiteMaximoPercentualSaldo = 2,
        limiteMaximoPrazo = 25,
        limiteMaximoValorFixo = 50000
    } = buscaParams;

    // ... (validações básicas de buscaParams e limites inalteradas) ...
    if (!saldoAcumuladoInicial || !dataInicioBeneficio || !dataNascimentoCliente || percentualRentabilidadeAnual === undefined || !objetivoDuracaoAnos || objetivoDuracaoAnos <= 0) { throw new Error("Parâmetros inválidos para calcularParametroIdeal."); }
    if (typeof limiteMaximoPercentualSaldo !== 'number' || limiteMaximoPercentualSaldo < 0) throw new Error("limiteMaximoPercentualSaldo inválido em buscaParams.");
    if (typeof limiteMaximoPrazo !== 'number' || limiteMaximoPrazo < 0) throw new Error("limiteMaximoPrazo inválido em buscaParams.");
    if (typeof limiteMaximoValorFixo !== 'number' || limiteMaximoValorFixo < 0) throw new Error("limiteMaximoValorFixo inválido em buscaParams.");


    const targetMeses = objetivoDuracaoAnos * 12;
    const paramsBase = {
        saldoAcumuladoInicial, dataInicioBeneficio, dataNascimentoCliente,
        percentualRentabilidadeAnual, saldoMinimo: 0, idadeMaxima: 0,
        limiteMaximoPercentualSaldo, limiteMaximoPrazo, limiteMaximoValorFixo
    };

    const MAX_ITERATIONS = 100; // Mantido para busca binária VF
    const TOLERANCE = new Decimal('0.01'); // Mantido para busca binária VF

    // --- Função Auxiliar de Busca Binária (findParam - Usada apenas para VALOR_FIXO) ---
    const findParamVF = (minParam, maxParam) => {
         let minP = new Decimal(minParam); let maxP = new Decimal(maxParam); let bestParam = null;
         for (let i = 0; i < MAX_ITERATIONS; i++) {
             if (maxP.minus(minP).abs().lt(TOLERANCE)) break;
             let midP = minP.plus(maxP).dividedBy(2); if (midP.eq(minP) || midP.eq(maxP)) break;
             const paramsSimulacao = { ...paramsBase, tipoPagamento: 'VALOR_FIXO', parametroPagamento: midP.toNumber() };
             if (midP.gt(limiteMaximoValorFixo)) { maxP = midP; continue; } // Checagem de limite
             try {
                  const resultadoBusca = calcularProjecaoPrevidencia(paramsSimulacao, { buscaObjetivo: { targetMeses: targetMeses, leve: true, ignorarLimites: true } });
                  if (resultadoBusca.parouAntesPorSaldo && resultadoBusca.mesesDuracao < targetMeses) { maxP = midP; }
                  else if (resultadoBusca.parouNoTarget && resultadoBusca.saldoFinalTarget.gt(TOLERANCE)) { minP = midP; bestParam = midP; }
                  else if (resultadoBusca.parouNoTarget && resultadoBusca.saldoFinalTarget.abs().lte(TOLERANCE)) { bestParam = midP; break; }
                  else if (resultadoBusca.mesesDuracao >= targetMeses && resultadoBusca.saldoFinalTarget.gt(TOLERANCE)) { minP = midP; bestParam = midP; }
                  else { if (resultadoBusca.parouAntesPorSaldo) { maxP = midP; } else { minP = midP; bestParam = midP; } }
              } catch (error) { if (error.message.includes("excede o limite")) { maxP = midP; } else { console.error(`Erro na simulação durante busca (VF, param=${midP.toNumber()}): ${error.message}`); return null; } }
          } // Fim for
          return bestParam ? bestParam : minP.plus(maxP).dividedBy(2);
    };

    // --- Função Auxiliar para Simulação Completa (Usada na Amostragem) ---
     const runFullSimulation = (tipo, paramValue) => {
         const paramsSim = { ...paramsBase, tipoPagamento: tipo, parametroPagamento: paramValue };
         try {
             const resultado = calcularProjecaoPrevidencia(paramsSim);
             let duracaoMeses = resultado.projecao.length;
             if (resultado.motivoTermino.code === 'MAX_PROJECAO') {
                 duracaoMeses = paramsBase.maxAnosProjecao * 12;
             }
              // Retorna a duração e o parâmetro usado
             return { param: paramValue, duracao: duracaoMeses };
         } catch (error) {
              // Se falhou por limite, retorna duração 0 ou negativa para indicar que é inválido/alto demais
             if (error.message.includes("excede o limite")) {
                  console.warn(`  - Amostra ${paramValue} ignorada: ${error.message}`);
                 return { param: paramValue, duracao: -1 }; // Indica inválido
             }
             console.error(`  - Erro ao simular amostra ${paramValue}: ${error.message}`);
             return { param: paramValue, duracao: NaN }; // Indica erro
         }
     };

    // --- Calcular Parâmetros ---

    // 1. VALOR_FIXO (Busca Binária Direta - Usando findParamVF)
    const maxValorFixoBusca = Math.min(new Decimal(saldoAcumuladoInicial).dividedBy(12).toNumber(), limiteMaximoValorFixo);
    const idealValorFixoDecimal = findParamVF(0, maxValorFixoBusca);

    // 2. PERCENTUAL_SALDO_ANUAL (Estratégia de Dupla Amostragem)
    let idealPercentualAnualDecimal = null;
    if (limiteMaximoPercentualSaldo > 0) {
        console.log(`Iniciando busca por dupla amostragem para Percentual Anual (Limite: ${limiteMaximoPercentualSaldo}%)`);
        const numSamples = 6; // Pontos por fase
        let melhorPercentualGeral = new Decimal(0);
        let menorDiferencaGeral = Infinity;

        // --- Fase 1: Amostragem Inicial ---
        console.log("Fase 1: Amostragem Inicial...");
        const sampleStep1 = new Decimal(limiteMaximoPercentualSaldo).dividedBy(numSamples - 1);
        const samplePoints1 = [];
        for (let i = 0; i < numSamples; i++) { samplePoints1.push(sampleStep1.times(i)); }

        let minDiff1 = Infinity;
        let bestSamplePerc1 = new Decimal(0);
        const sampleResults1 = [];

        for (const samplePerc1 of samplePoints1) {
            const result1 = runFullSimulation('PERCENTUAL_SALDO_ANUAL', samplePerc1.toNumber());
             if (!isNaN(result1.duracao) && result1.duracao >= 0) { // Processa apenas resultados válidos
                 const diff1 = Math.abs(result1.duracao - targetMeses);
                 console.log(`  - Amostra ${samplePerc1.toFixed(4)}%: Duração ${result1.duracao} meses, Diff ${diff1.toFixed(0)}`);
                 sampleResults1.push({ perc: samplePerc1, diff: diff1 });
                 if (diff1 < minDiff1) {
                     minDiff1 = diff1;
                     bestSamplePerc1 = samplePerc1;
                 }
                 // Atualiza o melhor geral encontrado até agora
                  if (diff1 < menorDiferencaGeral) {
                     menorDiferencaGeral = diff1;
                     melhorPercentualGeral = samplePerc1;
                 }
             }
        }
        console.log(`Fase 1: Melhor amostra encontrada: ${bestSamplePerc1.toFixed(4)}% com diferença de ${minDiff1.toFixed(0)} meses.`);

        // --- Fase 2: Amostragem Refinada ---
        const halfStep1 = sampleStep1.gt(0) ? sampleStep1.dividedBy(2) : new Decimal(0.1); // Evita divisão por zero se limite for 0, usa um step pequeno
        let newMinPerc = Decimal.max(0, bestSamplePerc1.minus(halfStep1));
        let newMaxPerc = Decimal.min(limiteMaximoPercentualSaldo, bestSamplePerc1.plus(halfStep1));
        if (newMinPerc.gte(newMaxPerc)) { // Ajuste caso intervalo seja inválido
            newMinPerc = Decimal.max(0, newMaxPerc.minus(sampleStep1.times(0.1))); // Usa 10% do step original
        }
         // Garante que newMaxPerc não exceda o limite
         newMaxPerc = Decimal.min(limiteMaximoPercentualSaldo, newMaxPerc);

        console.log(`Fase 2: Amostragem Refinada no intervalo [${newMinPerc.toFixed(4)}, ${newMaxPerc.toFixed(4)}]...`);
        const sampleStep2 = newMaxPerc.minus(newMinPerc).dividedBy(numSamples - 1);
        const samplePoints2 = [];
        // Evita step NaN/Infinity se min=max
        if (sampleStep2.isFinite() && sampleStep2.isPositive()) {
             for (let i = 0; i < numSamples; i++) {
                 samplePoints2.push(newMinPerc.plus(sampleStep2.times(i)));
             }
        } else if (newMinPerc.eq(newMaxPerc)) { // Se intervalo é um ponto só
             samplePoints2.push(newMinPerc);
        } else {
             console.warn("Intervalo da Fase 2 resultou em passo inválido. Usando melhor da Fase 1.");
             samplePoints2.push(bestSamplePerc1); // Usa apenas o melhor ponto anterior
        }


        let minDiff2 = Infinity;
        // Começa com o melhor da fase 1 como candidato inicial
        let bestRefinedPerc = melhorPercentualGeral;

        for (const samplePerc2 of samplePoints2) {
            // Evita re-simular exatamente o mesmo ponto da fase 1 se cair no array
            if (sampleResults1.some(r => r.perc.eq(samplePerc2))) {
                 console.log(`  - Pulando re-simulação de ${samplePerc2.toFixed(4)}% (já feito na Fase 1)`);
                 continue;
            }
             // Garante que o ponto está dentro do limite máximo
            if(samplePerc2.gt(limiteMaximoPercentualSaldo)) continue;

            const result2 = runFullSimulation('PERCENTUAL_SALDO_ANUAL', samplePerc2.toNumber());
            if (!isNaN(result2.duracao) && result2.duracao >= 0) {
                const diff2 = Math.abs(result2.duracao - targetMeses);
                console.log(`  - Amostra ${samplePerc2.toFixed(4)}%: Duração ${result2.duracao} meses, Diff ${diff2.toFixed(0)}`);
                if (diff2 < minDiff2) {
                    minDiff2 = diff2;
                    // Não atualiza bestRefinedPerc ainda, compara com menorDiferencaGeral
                }
                 // Atualiza o melhor geral encontrado até agora
                 if (diff2 < menorDiferencaGeral) {
                     menorDiferencaGeral = diff2;
                     melhorPercentualGeral = samplePerc2;
                 }
            }
        }
        // O resultado final é o melhor percentual geral encontrado nas duas fases
        idealPercentualAnualDecimal = melhorPercentualGeral;
         console.log(`Fase 2: Melhor percentual geral encontrado: ${idealPercentualAnualDecimal.toFixed(4)}% com diferença de ${menorDiferencaGeral.toFixed(0)} meses.`);

    } else {
        console.log("Busca para Percentual Anual ignorada (limite <= 0).");
    }


    // 3. PRAZO_DEFINIDO (Direto - Inalterado)
    let finalPrazoDefinido = objetivoDuracaoAnos;
    let prazoDefinidoCapped = false;
    if (objetivoDuracaoAnos > limiteMaximoPrazo) { finalPrazoDefinido = limiteMaximoPrazo; prazoDefinidoCapped = true; }

    // --- Aplicar Limites Finais e Formatar Resultados ---
    // (Lógica de Capping e formatação inalterada)
    let finalValorFixo = null; let valorFixoCapped = false; if (idealValorFixoDecimal) { if (idealValorFixoDecimal.gt(limiteMaximoValorFixo)) { finalValorFixo = new Decimal(limiteMaximoValorFixo); valorFixoCapped = true; } else { finalValorFixo = idealValorFixoDecimal; } }
    let finalPercentualAnual = null; let percentualAnualCapped = false; if (idealPercentualAnualDecimal) { if (idealPercentualAnualDecimal.gt(limiteMaximoPercentualSaldo)) { finalPercentualAnual = new Decimal(limiteMaximoPercentualSaldo); percentualAnualCapped = true; } else { finalPercentualAnual = idealPercentualAnualDecimal; } }

    return {
        objetivoDuracaoAnos: objetivoDuracaoAnos,
        limitesConsiderados: { percentualSaldo: limiteMaximoPercentualSaldo, prazoAnos: limiteMaximoPrazo, valorFixo: limiteMaximoValorFixo },
        resultados: {
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