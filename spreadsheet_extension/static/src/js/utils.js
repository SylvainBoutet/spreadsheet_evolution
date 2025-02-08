/** @odoo-module **/
// @ts-check

import { helpers } from "@odoo/o-spreadsheet";
const { getFunctionsFromTokens } = helpers;

/**
 * @typedef {import("@odoo/o-spreadsheet").Token} Token
 * @typedef {import("@spreadsheet/helpers/odoo_functions_helpers").OdooFunctionDescription} OdooFunctionDescription
 */

/**
 * @param {Token[]} tokens
 * @returns {number}
 */
export function getNumberOfGetFieldFormulas(tokens) {
    return getFunctionsFromTokens(tokens, ["ODOO.GET_FIELD"]).length;
}

/**
 * Get the first GET_FIELD function description of the given formula.
 *
 * @param {Token[]} tokens
 * @returns {OdooFunctionDescription | undefined}
 */
export function getFirstGetFieldFunction(tokens) {
    return getFunctionsFromTokens(tokens, ["ODOO.GET_FIELD"])[0];
}