/** @odoo-module */

import * as spreadsheet from "@odoo/o-spreadsheet";
import { GetFieldPlugin } from "./plugins/get_field_plugin";
import { SearchPlugin } from "./plugins/search_plugin";
import { SumPlugin } from "./plugins/sum_plugin";

const { featurePluginRegistry } = spreadsheet.registries;

featurePluginRegistry.add("odooGetField", GetFieldPlugin);
featurePluginRegistry.add("odooSearch", SearchPlugin);
featurePluginRegistry.add("odooSum", SumPlugin);
