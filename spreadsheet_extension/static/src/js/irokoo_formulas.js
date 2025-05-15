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

functionRegistry.add("IROKOO.GET_IDS", {
    description: _t("Get IDs from a model based on domain conditions"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'res.partner')")),
        arg("order (string)", _t("Field to order by")),
        arg("direction (string)", _t("Order direction (e.g. 'asc', 'desc')")),
        arg("limit (number)", _t("Maximum number of records to return (0 for no limit)")),
        arg("field1 (string)", _t("First field to search on")),
        arg("operator1 (string)", _t("First operator (e.g. 'ilike', '=', '>', '<')")),
        arg("value1 (string)", _t("First value to search for")),
    ],
    category: "Odoo",
    returns: ["STRING"],
    compute: function (...args) {
        if (args.length < 7 || (args.length - 4) % 3 !== 0) {
            throw new EvaluationError(_t("Invalid number of arguments"));
        }
    
        const model = toString(args[0]);
        const orderField = toString(args[1]);
        const orderDirection = toString(args[2]);
        const limit = toNumber(args[3], this.locale);
        const domain = [];
    
        for (let i = 4; i < args.length; i += 3) {
            const field = toString(args[i]);
            const operator = toString(args[i + 1]);
            const value = toString(args[i + 2]);
            
            if (field && operator && value) {
                domain.push([field, operator, value]);
            }
        }
    
        const result = this.getters.searchRecords(model, domain, { 
            order: [[orderField, orderDirection]],
            limit: limit > 0 ? limit : false
        });
        
        console.log("GET_IDS avant retour:", result);
        
        if (!result.value) {
            console.warn("Aucun ID trouvé pour GET_IDS");
            return { value: "", requiresRefresh: true };
        }

        return {
            value: result.value || "",
            format: "@",
            requiresRefresh: result.requiresRefresh,
        };
    },
});

functionRegistry.add("IROKOO.GET_SUM", {
    description: _t("Sum a field for records returned by IROKOO.GET_IDS"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'res.partner')")),
        arg("field (string)", _t("The field to sum")),
        arg("ids (string)", _t("Comma-separated list of IDs (from IROKOO.GET_IDS)")),
    ],
    category: "Odoo",
    returns: ["NUMBER"],
    compute: function (...args) {
        console.log("GET_SUM args:", args);
        
        if (args.length !== 3) {
            throw new EvaluationError(_t("IROKOO.GET_SUM requires exactly 3 arguments"));
        }

        const model = toString(args[0]);
        const field = toString(args[1]);
        const ids = toString(args[2]);

        console.log("GET_SUM processed args:", { model, field, ids });
        const result = this.getters.sumRecords(model, field, ids);
        
        // Si on a besoin d'un refresh, on propage cette info
        if (result.requiresRefresh) {
            return { value: result.value, requiresRefresh: true };
        }
        
        // Sinon on retourne la valeur formatée
        return {
            value: result.value,
            format: "#,##0.00", // Format nombre avec 2 décimales
        };
    }
});