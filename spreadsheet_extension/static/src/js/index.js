/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import * as spreadsheet from "@odoo/o-spreadsheet";
import { GetFieldPlugin } from "./plugins/get_field_plugin";
import { getFirstGetFieldFunction, getNumberOfGetFieldFormulas } from "./utils";

const { cellMenuRegistry, featurePluginRegistry } = spreadsheet.registries;
const { toString } = spreadsheet.helpers;

featurePluginRegistry.add("odooGetField", GetFieldPlugin);

cellMenuRegistry.add("see_record", {
    name: _t("See record"),
    sequence: 176,
    async execute(env) {
        const position = env.model.getters.getActivePosition();
        const cell = env.model.getters.getCell(position);
        const func = getFirstGetFieldFunction(cell.compiledFormula.tokens);
        const [model, id] = func.args;
        
        const action = {
            type: 'ir.actions.act_window',
            res_model: toString(model),
            res_id: parseInt(id),
            views: [[false, 'form']],
            target: 'current',
        };
        await env.services.action.doAction(action);
    },
    isVisible: (env) => {
        const position = env.model.getters.getActivePosition();
        const cell = env.model.getters.getCell(position);
        return cell?.isFormula && getNumberOfGetFieldFormulas(cell.compiledFormula.tokens) === 1;
    },
    icon: "o-spreadsheet-Icon.SEE_RECORDS",
});