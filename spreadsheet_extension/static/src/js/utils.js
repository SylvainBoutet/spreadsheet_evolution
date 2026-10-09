/** @odoo-module */

import { tokenize } from "@odoo/o-spreadsheet";

// Debug flag: set to true to log the formulas and plugins activity in the browser console
export const DEBUG_FORMULAS = false;

// Value displayed by IROKOO.GET_IDS and IROKOO.GET_GROUPED_IDS when nothing matches
export const NO_RESULTS = "No results found";

/**
 * Server access of the formulas plugins, built on the data sources of the
 * spreadsheet model (Odoo 17): the ORM, and a callback that re-evaluates the
 * spreadsheet once a request is done.
 *
 * @param {object} config plugin configuration
 * @returns {{orm: any, startLoadingCallback: (promise: Promise<any>) => void} | undefined}
 */
export function getServerData(config) {
    const dataSources = config?.custom?.dataSources;
    const orm = config?.custom?.env?.services.orm;
    if (!dataSources || !orm) {
        return undefined;
    }
    return {
        orm: orm.silent,
        startLoadingCallback: (promise) => dataSources.notifyWhenPromiseResolves(promise),
    };
}

/**
 * Log in the browser console only when DEBUG_FORMULAS is enabled.
 */
export function debugLog(...args) {
    if (DEBUG_FORMULAS) {
        console.log(...args);
    }
}

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

export function getFirstGetIdsFunction(tokens) {
    return getGetIdsFunctions(tokens)[0];
}

export function getNumberOfGetIdsFormulas(tokens) {
    return getGetIdsFunctions(tokens).length;
}

function getGetIdsFunctions(tokens) {
    const functions = [];
    for (const token of tokens) {
        if (token.type === "FUNCTION" && token.value === "IROKOO.GET_IDS") {
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
