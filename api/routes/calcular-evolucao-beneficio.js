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
 * Função principal para calcular a projeção de previdência.
 */
function calcularProjecaoPrevidencia(params) {
    const {
        saldoAcumuladoInicial,
        dataInicioBeneficio,
        dataNascimentoCliente,
        percentualRentabilidadeAnual,
        saldoMinimo = 0,
        idadeMaxima = 0,
        tipoPagamento,
        parametroPagamento,
        maxAnosProjecao = 100
    } = params;

    // --- Validação e Inicialização ---
    if (saldoAcumuladoInicial === undefined || typeof saldoAcumuladoInicial !== 'number' || saldoAcumuladoInicial < 0 ||
        !dataInicioBeneficio || !dataNascimentoCliente ||
        percentualRentabilidadeAnual === undefined || typeof percentualRentabilidadeAnual !== 'number' ||
        !tipoPagamento || parametroPagamento === undefined || typeof parametroPagamento !== 'number') {
        throw new Error("Parâmetros de entrada inválidos ou faltando ou com tipos incorretos.");
    }

    let saldo_atual = new Decimal(saldoAcumuladoInicial);
    const data_inicio = new Date(dataInicioBeneficio);
    const data_nasc = new Date(dataNascimentoCliente);
    let data_atual = new Date(data_inicio);

    if (isNaN(data_inicio.getTime()) || isNaN(data_nasc.getTime())) {
        throw new Error("Datas de início ou nascimento inválidas.");
    }

    const projecaoMensal = [];
    let valor_beneficio_anual_calculado_inicial = new Decimal(0);
    let status_beneficio = "Ativo";
    const d_saldo_minimo = new Decimal(saldoMinimo);
    const taxa_mensal = calcularTaxaMensal(percentualRentabilidadeAnual);

    // Objeto para armazenar o motivo do término e detalhes adicionais
    const motivoTermino = {
        code: null,
        description: null,
        dataTermino: null,        // Mês/Ano seguinte ao último pagamento
        saldoRemanescente: null, // Saldo final após último mês
        idadeTermino: null        // Idade na data de término
    };

    // --- Pré-cálculos ---
    // --- Pré-cálculos Específicos para Prazo Definido (Nova Regra) ---
    let total_cotas_prazo_definido = new Decimal(0);
    let cotas_restantes_prazo_definido = new Decimal(0);
    if (tipoPagamento === 'PRAZO_DEFINIDO') {
        total_cotas_prazo_definido = new Decimal(parametroPagamento).times(13);
        cotas_restantes_prazo_definido = total_cotas_prazo_definido; // Começa com o total
    }
    if (tipoPagamento === 'PERCENTUAL_SALDO_ANUAL') {
        if (parametroPagamento < 0) throw new Error("Percentual deve ser não-negativo.");
        valor_beneficio_anual_calculado_inicial = saldo_atual.times(new Decimal(parametroPagamento).dividedBy(100));
    }
     if (tipoPagamento === 'PERCENTUAL_SALDO_MENSAL' && parametroPagamento < 0) {
         throw new Error("Percentual deve ser não-negativo.");
     }
     if (tipoPagamento === 'VALOR_FIXO' && parametroPagamento < 0) {
         throw new Error("Valor fixo deve ser não-negativo.");
     }

    const limiteDataFinal = adicionarMes(data_inicio, maxAnosProjecao * 12);

    // --- Lógica do Saldo Mínimo Efetivo ---
    let saldo_minimo_efetivo = new Decimal(saldoMinimo); // Começa com o valor de entrada
    let usouPrimeiroPagamentoComoMinimo = false;

    if (saldoMinimo === 0 && saldo_atual.gt(0)) { // Só calcula se saldo inicial > 0
        usouPrimeiroPagamentoComoMinimo = true;
        let primeiro_beneficio_base = new Decimal(0);
        const d_parametro_pagamento = new Decimal(parametroPagamento);
        const primeiro_mes = data_inicio.getMonth() + 1;
        const saldo_inicial_decimal = new Decimal(saldoAcumuladoInicial);

        // Calcular base do primeiro benefício
        switch (tipoPagamento) {
            case 'VALOR_FIXO':
                primeiro_beneficio_base = d_parametro_pagamento;
                break;
            case 'PERCENTUAL_SALDO_MENSAL':
                primeiro_beneficio_base = saldo_inicial_decimal.times(d_parametro_pagamento.dividedBy(100));
                break;
            case 'PERCENTUAL_SALDO_ANUAL':
                primeiro_beneficio_base = valor_beneficio_anual_calculado_inicial; // Usa o valor pré-calculado
                break;
            case 'PRAZO_DEFINIDO':
                if (total_cotas_prazo_definido.gt(0)) {
                    primeiro_beneficio_base = saldo_inicial_decimal.dividedBy(total_cotas_prazo_definido);
                } else {
                    primeiro_beneficio_base = new Decimal(0);
                }
                break;
        }
        if (primeiro_beneficio_base.lt(0)) { primeiro_beneficio_base = new Decimal(0); }

        // Ajustar para 13º se o primeiro mês for Dezembro
        let primeiro_beneficio_ajustado = primeiro_beneficio_base;
        if (primeiro_mes === 12) {
            primeiro_beneficio_ajustado = primeiro_beneficio_base.times(2);
        }

        // Limitar pelo saldo inicial e definir como saldo mínimo efetivo
        saldo_minimo_efetivo = Decimal.max(0, Decimal.min(primeiro_beneficio_ajustado, saldo_inicial_decimal));
        console.log(`INFO: Saldo Mínimo = 0. Definido Saldo Mínimo Efetivo como o primeiro pagamento: ${saldo_minimo_efetivo.toFixed(2)}`);
    }
    // Se saldoMinimo=0 e saldoInicial=0, saldo_minimo_efetivo continua 0.

    // --- Loop de Projeção ---
    let meses_simulados = 0;
    let valor_beneficio_anual_calculado_loop = valor_beneficio_anual_calculado_inicial; // Variável para o loop
    while (status_beneficio === "Ativo") {

        const mes_atual = data_atual.getMonth() + 1;
        const ano_atual = data_atual.getFullYear();
        const idade_cliente = calcularIdade(data_nasc, data_atual);
        if (idade_cliente === null) { // Checa se cálculo da idade falhou
             throw new Error("Não foi possível calcular a idade do cliente.");
        }

        const saldo_inicial_neste_mes = saldo_atual;

        // --- 1. Verificar Condições de Término (Início do Mês) ---

        if (saldo_inicial_neste_mes.lte(0)) {
            // Mesmo para prazo definido, se o saldo zerar antes, encerra.
            status_beneficio = "Encerrado";
            motivoTermino.code = "SALDO_ZERADO_NEGATIVO";
            motivoTermino.description = `Encerrado: Saldo inicial do mês zerado ou negativo (R$ ${saldo_inicial_neste_mes.toFixed(2)}).`;
            break;
       }

        // Verificar Cotas Esgotadas para Prazo Definido
        if (tipoPagamento === 'PRAZO_DEFINIDO' && cotas_restantes_prazo_definido.lte(0)) {
            status_beneficio = "Encerrado";
            motivoTermino.code = "PRAZO_COTAS_ESGOTADAS"; // Novo código
            motivoTermino.description = `Encerrado: Número de cotas (${total_cotas_prazo_definido.toString()}) para o prazo definido de ${parametroPagamento} anos foi atingido.`;
            break;
       }

        // Pular verificação de idade e saldo mínimo para PRAZO_DEFINIDO
        if (tipoPagamento !== 'PRAZO_DEFINIDO') {
            if (idadeMaxima > 0 && idade_cliente >= idadeMaxima) {
                status_beneficio = "Encerrado";
                motivoTermino.code = "IDADE_MAXIMA";
                motivoTermino.description = `Encerrado: Idade (${idade_cliente}) atingiu ou superou a máxima permitida (${idadeMaxima}).`;
                break; // Sai do loop
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
        // if (saldo_inicial_neste_mes.lte(0)) { OLD

        //      let pagamentoEsperado = false;
        //      if (tipoPagamento === 'VALOR_FIXO' && parametroPagamento > 0) pagamentoEsperado = true;
        //      if (tipoPagamento === 'PRAZO_DEFINIDO' && valor_base_prazo_definido.gt(0)) pagamentoEsperado = true;
        //      if (tipoPagamento === 'PERCENTUAL_SALDO_ANUAL' && valor_beneficio_anual_calculado.gt(0)) pagamentoEsperado = true;

        //     if (saldo_inicial_neste_mes.lt(0) || (saldo_inicial_neste_mes.isZero() && pagamentoEsperado)) {
        //         status_beneficio = "Encerrado";
        //         motivoTermino.code = "SALDO_ZERADO_NEGATIVO";
        //         motivoTermino.description = `Encerrado: Saldo inicial do mês zerado ou negativo (R$ ${saldo_inicial_neste_mes.toFixed(2)}).`;
        //         break;
        //     }
        // }

        // --- 2. Calcular Valor Base do Benefício Mensal ---
        // (Lógica inalterada)
        let valor_beneficio_mes_base = new Decimal(0);
        const d_parametro_pagamento = new Decimal(parametroPagamento);

        switch (tipoPagamento) {
            case 'VALOR_FIXO':
                valor_beneficio_mes_base = d_parametro_pagamento;
                break;
            case 'PERCENTUAL_SALDO_MENSAL':
                valor_beneficio_mes_base = saldo_inicial_neste_mes.times(d_parametro_pagamento.dividedBy(100));
                break;
            case 'PERCENTUAL_SALDO_ANUAL':
                if (mes_atual === 1) {
                    valor_beneficio_anual_calculado_loop = saldo_inicial_neste_mes.times(d_parametro_pagamento.dividedBy(100));
                }
                valor_beneficio_mes_base = valor_beneficio_anual_calculado_loop;
                break;
            case 'PRAZO_DEFINIDO':
                // ---- NOVA REGRA MENSAL ----
                if (cotas_restantes_prazo_definido.gt(0)) {
                    // Saldo Atual / Cotas Restantes
                    valor_beneficio_mes_base = saldo_inicial_neste_mes.dividedBy(cotas_restantes_prazo_definido);
                } else {
                    // Segurança: se cotas restantes for zero ou menos, o benefício é zero.
                    valor_beneficio_mes_base = new Decimal(0);
                }
                // ---- FIM NOVA REGRA ----
                break;
            default:
                 throw new Error(`Tipo de pagamento desconhecido: ${tipoPagamento}`);
        }
         if (valor_beneficio_mes_base.lt(0)) {
             valor_beneficio_mes_base = new Decimal(0);
         }


        // --- 3. Ajustar Benefício (13º) e Calcular Pagamento Efetivo ---
        // (Lógica inalterada)
        let valor_beneficio_mes_ajustado = valor_beneficio_mes_base;
        let cotas_consumidas_neste_mes = new Decimal(1); // Padrão é 1 cota por mês

        if (mes_atual === 12) {
            valor_beneficio_mes_ajustado = valor_beneficio_mes_base.times(2);
            cotas_consumidas_neste_mes = new Decimal(2); // Dezembro consome 2 cotas
        }
        const valor_efetivamente_pago = Decimal.max(0, Decimal.min(valor_beneficio_mes_ajustado, saldo_inicial_neste_mes));
        const saldo_apos_pagamento = saldo_inicial_neste_mes.minus(valor_efetivamente_pago);

        // --- 4. Calcular Juros do Mês ---
        const juros_mes = saldo_apos_pagamento.gt(0) ? saldo_apos_pagamento.times(taxa_mensal) : new Decimal(0);

        // --- 5. Calcular Saldo Final do Mês ---
        const saldo_final_mes = saldo_apos_pagamento.plus(juros_mes);

        // --- 6. Registrar Dados do Mês ---
        projecaoMensal.push({
            mesAno: `${String(mes_atual).padStart(2, '0')}/${ano_atual}`,
            idadeCliente: idade_cliente,
            saldoInicial: saldo_inicial_neste_mes.toDecimalPlaces(2).toNumber(),
            beneficioBruto: valor_beneficio_mes_base.toDecimalPlaces(2).toNumber(),
            beneficioPago: valor_efetivamente_pago.toDecimalPlaces(2).toNumber(),
            juros: juros_mes.toDecimalPlaces(2).toNumber(),
            saldoFinal: saldo_final_mes.toDecimalPlaces(2).toNumber(),
        });

        // --- 7. Atualizar para Próximo Mês ---
        saldo_atual = saldo_final_mes; // Atualiza com alta precisão
        data_atual = adicionarMes(data_atual, 1); // Avança para o próximo mês

        // Atualizar cotas restantes para Prazo Definido
        if (tipoPagamento === 'PRAZO_DEFINIDO') {
            cotas_restantes_prazo_definido = cotas_restantes_prazo_definido.minus(cotas_consumidas_neste_mes);
        }

        // --- Verificação de segurança ---
        if (data_atual > limiteDataFinal) {
             status_beneficio = "Interrompido";
             motivoTermino.code = "MAX_PROJECAO";
             motivoTermino.description = `Interrompido: Projeção excedeu o limite de ${maxAnosProjecao} anos.`;
             break; // Sai do loop
        }

    } // --- Fim do Loop While ---

    // --- Pós-Loop: Preencher detalhes finais do motivoTermino ---

    // OLD
    // if (status_beneficio === "Ativo") {
    //     motivoTermino.code = "COMPLETO";
    //     motivoTermino.description = "Projeção concluída sem atingir condição explícita de término.";
    //     if (tipoPagamento === 'PRAZO_DEFINIDO') {
    //          const mesesProjetados = projecaoMensal.length;
    //          const mesesEsperados = parametroPagamento * 12;
    //          motivoTermino.description = `Projeção concluída: Prazo definido (${parametroPagamento} anos) ou condição de término não atingida dentro do prazo/limite.`;
    //     }
    // }


    // --- Pós-Loop: Preencher detalhes finais do motivoTermino ---
    if (status_beneficio === "Ativo") {
        // Se o loop terminou sem um break, significa que algo inesperado ocorreu
        // ou talvez o maxAnosProjecao foi atingido sem ser pego pela checagem de segurança?
        // Ou o prazo definido terminou exatamente na última iteração sem break (pouco provável com >=)
        motivoTermino.code = "INDEFINIDO"; // Ou "COMPLETO_INESPERADO"
        motivoTermino.description = "Projeção concluída sem atingir condição explícita de término ou prazo.";
         // Se foi prazo definido, a checagem no início do loop deveria ter pego
        if (tipoPagamento === 'PRAZO_DEFINIDO') {
              // Verifica se as cotas realmente acabaram (considerando arredondamento ou < 1)
              if (cotas_restantes_prazo_definido.lte(0.5)) { // Usar uma pequena tolerância
                    motivoTermino.code = "PRAZO_COTAS_ESGOTADAS";
                    motivoTermino.description = `Encerrado: Número de cotas (${total_cotas_prazo_definido.toString()}) para o prazo definido de ${parametroPagamento} anos foi atingido.`;
              }
         }
    }

    // Formata a data de término (mês/ano seguinte ao último pagamento)
    const mesTermino = tipoPagamento === 'PRAZO_DEFINIDO' ? String(data_atual.getMonth()).padStart(2, '0') : String(data_atual.getMonth() + 1).padStart(2, '0');
    const anoTermino = data_atual.getFullYear();
    motivoTermino.dataTermino = `${mesTermino}/${anoTermino}`;

    // Define o saldo remanescente (saldo_atual contém o valor final)
    motivoTermino.saldoRemanescente = saldo_atual.toDecimalPlaces(2).toNumber();

    // Calcula a idade na data de término
    // Recalcula a idade com a data_atual final
    const idadeFinalCliente = calcularIdade(data_nasc, data_atual);
    motivoTermino.idadeTermino = idadeFinalCliente;
     // Se a idade não puder ser calculada, defina como null ou indique erro
    if (idadeFinalCliente === null) {
         console.error("Não foi possível calcular a idade final do cliente.");
         motivoTermino.idadeTermino = null; // Ou algum valor indicativo de erro
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