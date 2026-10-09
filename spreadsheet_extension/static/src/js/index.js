/** @odoo-module */

import * as spreadsheet from "@odoo/o-spreadsheet";
import { GetFieldPlugin } from "./plugins/get_field_plugin";
import { SearchPlugin } from "./plugins/search_plugin";
import { SumPlugin } from "./plugins/sum_plugin";

const { evaluationPluginRegistry } = spreadsheet.registries;

evaluationPluginRegistry.add("odooGetField", GetFieldPlugin);
evaluationPluginRegistry.add("odooSearch", SearchPlugin);
evaluationPluginRegistry.add("odooSum", SumPlugin);
