
require('dotenv').config(); // Carrega variáveis do .env para process.env
const CryptoJS = require('crypto-js');
const jwt = require('jsonwebtoken');
const { Router } = require('express');
const router = Router();

/**
 * Gera um hash SHA256 baseado em uma chave de API e no timestamp atual.
 *
 * @param apiKey A chave secreta da API a ser usada na geração do hash.
 * @returns Um objeto contendo o hash em maiúsculas (HEX) e o timestamp (em segundos) usado.
 * @throws Error se a apiKey não for fornecida.
 */
function generateApiHash(apiKey) {
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        throw new Error('API key inválida ou não fornecida.');
    }

    // 1. Obter o timestamp atual em segundos como string
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // 2. Concatenar a chave e o timestamp (como no script original)
    const dataToHash = `${apiKey}.${timestamp}`;
    console.log(dataToHash);
    
    // 3. Calcular o hash SHA256, converter para string Hexadecimal e depois para maiúsculas
    const hash = CryptoJS.SHA256(dataToHash)
                               .toString() // Garante saída em Hex
                               .toUpperCase();

    // 4. Retornar o hash e o timestamp
    return { hash, timestamp };
}

// URL da API que você quer chamar
const apiUrl = 'https://vivest-hmg.azure-api.net/apis/api-portal-restrito-sso/v1/Authentication';

// --- Exemplo de Requisição GET ---
async function gerarSecret(hash) {
    try {
        const response = await fetch(apiUrl+'?hash='+ hash, {
             method: 'GET', // Opcional, GET é o padrão
             headers: {
                 'Accept': 'application/json',
                 'Authorization': 'Bearer '+process.env.OG_BR
             }
        });

        // Verifica se a requisição foi bem-sucedida (status 200-299)
        if (!response.ok) {
            // Se não foi OK, tenta ler o corpo do erro como texto
            const errorBody = await response.text();
            console.error(`Erro ${response.status} da API: ${errorBody}`);
            // Lança um erro para ser pego pelo catch externo
            throw new Error(`Erro da API externa: ${response.status} - ${errorBody.substring(0, 100)}`);
        }

        // Se foi OK, processa a resposta (assumindo que é JSON)
        const data = await response.json();
        console.log('Dados recebidos da API (GET):', data);
        return data; // Retorna os dados processados

    } catch (error) {
        console.error('Erro ao fazer a requisição GET:', error);
        // Trate o erro adequadamente (ex: retornar um erro 500 no seu endpoint)
        throw error; // Re-lança para quem chamou a função saber do erro
    }
}

/**
 * Gera um token JWT assinado.
 */
function generateJwtToken(payload, secret) {
    // Validação básica do payload
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Payload inválido. Deve ser um objeto.');
    }

    // Define as opções de assinatura
    const signOptions = {
        expiresIn: '1h',
        algorithm: 'HS256'
    };

    try {
        // Assina o token com o payload, o segredo e as opções
        const token = jwt.sign(payload, secret, signOptions);
        return token;
    } catch (error) {
        console.error('Erro ao assinar o token JWT:', error);
        throw new Error('Não foi possível gerar o token de autenticação.'); // Lança um erro genérico
    }
}

async function gerarToken() {
    const ACCESS_KEY = process.env.ACCESS_KEY; // Use variáveis de ambiente!

    const { hash, timestamp } = generateApiHash(ACCESS_KEY);
    const secret = await gerarSecret(hash);
    
    const jwt = generateJwtToken({
        "sub": "1234567890",
        "name": "John Doe",
        "idSecret": secret.secret.id
      }, secret.secret.value);
    return jwt;
}
module.exports = {gerarToken}; // Exporta o funcao