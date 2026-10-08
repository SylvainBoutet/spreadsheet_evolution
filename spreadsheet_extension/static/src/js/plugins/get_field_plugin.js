/** @odoo-module */
// @ts-check

import { EvaluationError } from "@odoo/o-spreadsheet";
import { OdooUIPlugin } from "@spreadsheet/plugins";
import { _t } from "@web/core/l10n/translation";
import { debugLog } from "../utils";

export class GetFieldPlugin extends OdooUIPlugin {
    static getters = /** @type {const} */ ([
        "getFieldValue",
    ]);

    constructor(config) {
        super(config);
        /** @type {import("@spreadsheet/data_sources/server_data").ServerData} */
        this._serverData = config.custom.odooDataProvider?.serverData;
        this._cache = new Map();
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
        // Schedule a refresh so that the formulas are recomputed regularly
        if (!this._refreshTimerId) {
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
                debugLog("GetFieldPlugin: Scheduled refresh triggered");
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
     * Gets a field value from any record
     * @param {string} modelName name of the model
     * @param {number} recordId id of the record
     * @param {string} fieldName name of the field
     * @returns {any}
     */
    getFieldValue(modelName, recordId, fieldName) {
        // Unique cache key
        const cacheKey = `${modelName}-${recordId}-${fieldName}`;

        // Return the cached value if any
        if (this._cache.has(cacheKey)) {
            return this._cache.get(cacheKey);
        }

        // batch.get is synchronous: it throws a loading error until the data is fetched
        // @ts-ignore
        const result = this.serverData.batch.get(
            modelName,
            "read",
            recordId,
            [fieldName]
        );

        if (!result) {
            throw new EvaluationError(_t("Record not found"));
        }

        let value;

        // The result is an object with the fieldName property
        if (result[fieldName] !== undefined) {
            value = result[fieldName];
        }
        // The result is an array
        else if (Array.isArray(result) && result.length > 0 && result[0][fieldName] !== undefined) {
            value = result[0][fieldName];
        }
        else {
            throw new EvaluationError(_t("Field not found"));
        }

        // Relational fields
        if (value && typeof value === 'object' && Array.isArray(value)) {
            // many2one format: [id, display_name], only the id is returned
            value = value[0];
        }

        // Store in the cache
        this._cache.set(cacheKey, value);

        // Schedule a refresh so that the other plugins get their data
        if (this._refreshTimerId === null) {
            this._scheduleRefresh();
        }

        return value;
    }

    /**
     * @override
     */
    handle(cmd) {
        switch (cmd.type) {
            case "EVALUATE_CELLS":
                // No pending request in this plugin: never block the evaluation
                return false;
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

        super.destroy();
    }
}
