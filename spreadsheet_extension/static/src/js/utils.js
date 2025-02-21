/** @odoo-module */

import { tokenize } from "@odoo/o-spreadsheet";

export function getFirstGetFieldFunction(tokens) {
    return getGetFieldFunctions(tokens)[0];
}

export function getNumberOfGetFieldFormulas(tokens) {
    return getGetFieldFunctions(tokens).length;
}

function getGetFieldFunctions(tokens) {
    const functions = [];
    for (const token of tokens) {
        if (token.type === "FUNCTION" && token.value === "IROKOO.GET_FIELD") {
            functions.push(token);
        }
    }
    return functions;
}

export function getFirstGetIdFunction(tokens) {
    return getGetIdFunctions(tokens)[0];
}

export function getNumberOfGetIdFormulas(tokens) {
    return getGetIdFunctions(tokens).length;
}

function getGetIdFunctions(tokens) {
    const functions = [];
    for (const token of tokens) {
        if (token.type === "FUNCTION" && token.value === "IROKOO.GET_ID") {
            functions.push(token);
        }
    }
    return functions;
}

export function getFirstGetSumFunction(tokens) {
    return getGetSumFunctions(tokens)[0];
}

export function getNumberOfGetSumFormulas(tokens) {
    return getGetSumFunctions(tokens).length;
}

function getGetSumFunctions(tokens) {
    const functions = [];
    for (const token of tokens) {
        if (token.type === "FUNCTION" && token.value === "IROKOO.GET_SUM") {
            functions.push(token);
        }
    }
    return functions;
}