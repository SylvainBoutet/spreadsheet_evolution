/** @odoo-module */
// @ts-check

import { OdooEvaluationPlugin } from "@spreadsheet/plugins";
import { debugLog } from "../utils";

export class SumPlugin extends OdooEvaluationPlugin {
    static getters = /** @type {const} */ ([
        "sumRecords",
    ]);

    constructor(config) {
        super(config);
        /** @type {import("@spreadsheet/data_sources/server_data").ServerData} */
        this._serverData = config?.custom?.odooDataProvider?.serverData;
        this._cache = new Map();
        this._pendingRequests = new Map();
        this._refreshTimerId = null;
        this.config = config;

        if (config?.custom?.model) {
            // Listen to the events that may require a refresh
            config.custom.model.addEventListener("user-selection-changed", this._onSelectionChanged.bind(this));
        }
    }

    /**
     * Called when the selection changes in the sheet, may trigger a refresh
     */
    _onSelectionChanged() {
        // Pending promises: force a new evaluation
        if (this._pendingRequests.size > 0) {
            this._scheduleRefresh();
        }
    }

    /**
     * Schedule a delayed refresh to avoid too many consecutive calls
     */
    _scheduleRefresh() {
        if (this._refreshTimerId) {
            clearTimeout(this._refreshTimerId);
        }

        this._refreshTimerId = setTimeout(() => {
            if (this.config?.custom?.model) {
                this.config.custom.model.dispatch("EVALUATE_CELLS");
                debugLog("SumPlugin: Scheduled refresh triggered");
            }
            this._refreshTimerId = null;
        }, 100);
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

        if (!modelName || !fieldName || !ids) {
            debugLog("Missing required parameters");
            return { value: 0, requiresRefresh: false };
        }

        try {
            const idList = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            debugLog("Parsed ID list:", idList);

            if (idList.length === 0) {
                debugLog("No valid IDs after parsing");
                return { value: 0, requiresRefresh: false };
            }

            const domain = [['id', 'in', idList]];
            const cacheKey = `${modelName}-${fieldName}-${ids}`;

            if (this._cache.has(cacheKey)) {
                const cachedValue = this._cache.get(cacheKey);
                debugLog("Returning cached value:", cachedValue);
                return {
                    value: cachedValue,
                    requiresRefresh: false
                };
            }

            if (this._pendingRequests.has(cacheKey)) {
                return { value: 0, requiresRefresh: true };
            }

            // @ts-ignore
            const promise = this.serverData.orm.call(modelName, "search_read", [
                domain,
                [fieldName]
            ])
            .then(records => {
                const sum = records.reduce((acc, record) => {
                    return acc + (parseFloat(record[fieldName]) || 0);
                }, 0);

                this._cache.set(cacheKey, sum);
                this._pendingRequests.delete(cacheKey);

                // Schedule a delayed refresh
                this._scheduleRefresh();
            })
            .catch(error => {
                // Cache the failure as a zero sum so that the request is not sent again
                this._cache.set(cacheKey, 0);
                this._pendingRequests.delete(cacheKey);
                // Try a refresh even on error
                this._scheduleRefresh();
            });

            this._pendingRequests.set(cacheKey, promise);
            // Let the data provider re-evaluate the spreadsheet once the result is received
            this.serverData.startLoadingCallback(promise);
            return { value: 0, requiresRefresh: true };

        } catch (error) {
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

    /**
     * @override
     */
    destroy() {
        if (this._refreshTimerId) {
            clearTimeout(this._refreshTimerId);
        }

        if (this.config?.custom?.model) {
            this.config.custom.model.removeEventListener("user-selection-changed", this._onSelectionChanged);
        }

        super.destroy?.();
    }
}
