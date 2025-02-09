/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import * as spreadsheet from "@odoo/o-spreadsheet";
import { EvaluationError } from "@odoo/o-spreadsheet";
const { functionRegistry } = spreadsheet.registries;
const { arg, toString, toNumber } = spreadsheet.helpers;

functionRegistry.add("IROKOO.GET_FIELD", {
    description: _t("Get a field value from any record"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'res.partner')")),
        arg("id (number)", _t("The record ID")),
        arg("field (string)", _t("The technical field name")),
    ],
    category: "Odoo",
    returns: ["STRING"],
    compute: function (model, id, field) {
        const _model = toString(model);
        const _id = toNumber(id, this.locale);
        const _field = toString(field);

        if (!_model || !_id || !_field) {
            throw new EvaluationError(_t("All parameters are required"));
        }

        return {
            value: this.getters.getFieldValue(_model, _id, _field),
            format: "@",
        };
    },
});

functionRegistry.add("IROKOO.GET_ID", {
    description: _t("Get IDs from a model based on domain conditions"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'res.partner')")),
        arg("field1 (string)", _t("First field to search on")),
        arg("operator1 (string)", _t("First operator (e.g. 'ilike', '=', '>', '<')")),
        arg("value1 (string)", _t("First value to search for")),
    ],
    category: "Odoo",
    returns: ["STRING"],
    compute: function (...args) {
        if (args.length < 4 || args.length % 3 !== 1) {
            throw new EvaluationError(_t("Invalid number of arguments"));
        }
    
        const model = toString(args[0]);
        const domain = [];
    
        for (let i = 1; i < args.length; i += 3) {
            const field = toString(args[i]);
            const operator = toString(args[i + 1]);
            const value = toString(args[i + 2]);
            
            if (field && operator && value) {
                domain.push([field, operator, value]);
            }
        }
    
        const result = this.getters.searchRecords(model, domain);
        console.log("GET_ID avant retour:", result);

        return {
            value: result.value || "",
            format: "@",
            requiresRefresh: result.requiresRefresh,
        };
    },
});