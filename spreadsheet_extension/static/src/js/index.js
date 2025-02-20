/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import * as spreadsheet from "@odoo/o-spreadsheet";
import { GetFieldPlugin } from "./plugins/get_field_plugin";
import { SearchPlugin } from "./plugins/search_plugin";
import { IrokooSumPlugin } from "./plugins/irokoo_sum";

const { cellMenuRegistry, featurePluginRegistry, uiPluginRegistry } = spreadsheet.registries;
const { toString } = spreadsheet.helpers;

featurePluginRegistry.add("odooGetField", GetFieldPlugin);
featurePluginRegistry.add("odooSearch", SearchPlugin);
featurePluginRegistry.add("irokoo_sum_plugin", IrokooSumPlugin);

// Ajout du menu contextuel pour GET_ID
cellMenuRegistry.add("see_records", {
    name: _t("See records"),
    sequence: 177,  // Juste après see_record
    async execute(env) {
        const position = env.model.getters.getActivePosition();
        const cell = env.model.getters.getCell(position);
        const ids = cell.value.toString().split(',').map(id => parseInt(id));
        
        const action = {
            type: 'ir.actions.act_window',
            res_model: toString(cell.compiledFormula.tokens[1]),  // Le premier argument est le modèle
            domain: [['id', 'in', ids]],
            views: [[false, 'list'], [false, 'form']],
            target: 'current',
        };
        await env.services.action.doAction(action);
    },
    isVisible: (env) => {
        const position = env.model.getters.getActivePosition();
        const cell = env.model.getters.getCell(position);
        return cell?.isFormula && cell.compiledFormula.tokens[0]?.value === "IROKOO.GET_ID";
    },
    icon: "o-spreadsheet-Icon.SEE_RECORDS",
});