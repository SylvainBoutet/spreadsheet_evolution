/** @odoo-module */
// @ts-check

import { EvaluationError } from "@odoo/o-spreadsheet";
import { OdooUIPlugin } from "@spreadsheet/plugins";
import { _t } from "@web/core/l10n/translation";
import { toString } from "@spreadsheet/helpers/helpers";

export class IrokooSumPlugin extends OdooUIPlugin {
    static getters = /** @type {const} */ ([
        "sumRecords",
    ]);

    constructor(config) {
        super(config);
        /** @type {import("@spreadsheet/data_sources/server_data").ServerData} */
        this._serverData = config.custom.odooDataProvider?.serverData;
        this._cache = new Map();
        this._pendingRequests = new Map();
    }

    get serverData() {
        if (!this._serverData) {
            throw new Error(
                "'serverData' is not defined, please make sure a 'OdooDataProvider' instance is provided to the model."
            );
        }
        return this._serverData;
    }

    /**
     * Sum field values for records based on domain
     * @param {string} modelName name of the model
     * @param {string} fieldName name of the field to sum
     * @param {any} ids IDs to sum
     * @returns {Object}
     */
    sumRecords(modelName, fieldName, ids) {
        console.log("=== sumRecords START ===");
        console.log("Raw inputs:", { modelName, fieldName, ids });

        if (!modelName || !fieldName || !ids) {
            console.log("Missing required parameters");
            return { value: 0, requiresRefresh: false };
        }

        try {
            const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            console.log("Parsed ID list:", idList);
            
            if (idList.length === 0) {
                console.log("No valid IDs after parsing");
                return { value: 0, requiresRefresh: false };
            }

            const domain = [['id', 'in', idList]];
            console.log("Search domain:", domain);

            const cacheKey = `${modelName}-${fieldName}-${ids}`;
            console.log("Cache key:", cacheKey);
            
            if (this._cache.has(cacheKey)) {
                const cachedValue = this._cache.get(cacheKey);
                console.log("Returning cached value:", cachedValue);
                return { 
                    value: cachedValue, 
                    requiresRefresh: false 
                };
            }

            if (this._pendingRequests.has(cacheKey)) {
                console.log("Request pending, returning temporary value");
                return { value: 0, requiresRefresh: true };
            }

            console.log("Making ORM call to search_read");
            const promise = this.serverData.orm.call(modelName, "search_read", [
                domain,
                [fieldName]
            ])
            .then(records => {
                console.log("Received records:", records);
                const sum = records.reduce((acc, record) => {
                    console.log("Current record:", record);
                    console.log("Current field value:", record[fieldName]);
                    return acc + (parseFloat(record[fieldName]) || 0);
                }, 0);
                
                console.log("Calculated sum:", sum);
                this._cache.set(cacheKey, sum);
                this._pendingRequests.delete(cacheKey);
                
                if (this.config?.custom?.model) {
                    console.log("Dispatching EVALUATE_CELLS");
                    this.config.custom.model.dispatch("EVALUATE_CELLS");
                }
            })
            .catch(error => {
                console.error("ORM call error:", error);
                this._pendingRequests.delete(cacheKey);
            });

            this._pendingRequests.set(cacheKey, promise);
            console.log("Request pending, returning temporary value");
            return { value: 0, requiresRefresh: true };
            
        } catch (error) {
            console.error("Unexpected error in sumRecords:", error);
            return { value: 0, requiresRefresh: false };
        }
    }

    /**
     * @override
     */
    handle(cmd) {
        switch (cmd.type) {
            case "EVALUATE_CELLS":
                if (this._pendingRequests.size > 0) {
                    return true;
                }
                break;
        }
        return false;
    }
} 