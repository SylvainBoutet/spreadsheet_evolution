/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import * as spreadsheet from "@odoo/o-spreadsheet";
import { GetFieldPlugin } from "./plugins/get_field_plugin";
import { SearchPlugin } from "./plugins/search_plugin";
import { SumPlugin } from "./plugins/sum_plugin";

const { cellMenuRegistry, featurePluginRegistry, uiPluginRegistry } = spreadsheet.registries;
const { toString } = spreadsheet.helpers;

featurePluginRegistry.add("odooGetField", GetFieldPlugin);
featurePluginRegistry.add("odooSearch", SearchPlugin);
featurePluginRegistry.add("odooSum", SumPlugin);
