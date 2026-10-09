/** @odoo-module */
// @ts-check

import { EvaluationError } from "@odoo/o-spreadsheet";
import { OdooEvaluationPlugin } from "@spreadsheet/plugins";
import { LoadingDataError } from "@spreadsheet/o_spreadsheet/errors";
import { _t } from "@web/core/l10n/translation";
import { debugLog } from "../utils";

export class GetFieldPlugin extends OdooEvaluationPlugin {
    static getters = /** @type {const} */ ([
        "getFieldValue",
    ]);

    constructor(config) {
        super(config);
        /** @type {import("@spreadsheet/data_sources/server_data").ServerData} */
        this._serverData = config.custom.odooDataProvider?.serverData;
        this._cache = new Map();
        // Fields waiting to be read, by model: { ids: Set, fields: Set }
        this._pendingReads = {};
        this._pendingKeys = new Set();
        this._readScheduled = false;
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

        // Return the cached value (or error) if any
        if (this._cache.has(cacheKey)) {
            const cached = this._cache.get(cacheKey);
            if (cached instanceof EvaluationError) {
                throw cached;
            }
            return cached;
        }

        // Only the requested fields are read: reading all the fields of a record
        // fails for the users who cannot access some of them
        if (!this._pendingKeys.has(cacheKey)) {
            this._pendingKeys.add(cacheKey);
            const pending = (this._pendingReads[modelName] ||= { ids: new Set(), fields: new Set() });
            pending.ids.add(recordId);
            pending.fields.add(fieldName);
            this._scheduleRead();
        }
        throw new LoadingDataError();
    }

    /**
     * Read the pending fields in one request per model, once the current
     * evaluation is done.
     */
    _scheduleRead() {
        if (this._readScheduled) {
            return;
        }
        this._readScheduled = true;
        queueMicrotask(() => {
            this._readScheduled = false;
            const pendingReads = this._pendingReads;
            this._pendingReads = {};
            for (const [modelName, { ids, fields }] of Object.entries(pendingReads)) {
                const promise = this._read(modelName, [...ids], [...fields]);
                // Let the data provider re-evaluate the spreadsheet once the values are received
                // @ts-ignore
                this.serverData.startLoadingCallback(promise);
            }
        });
    }

    /**
     * Read the fields of the records and store the values (or the errors) in the cache.
     * When the request fails, each field then each record is read separately to isolate the error.
     */
    async _read(modelName, ids, fieldNames) {
        // @ts-ignore
        const orm = this.serverData.orm;
        try {
            const records = await orm.call(modelName, "read", [ids, fieldNames]);
            this._storeRecords(modelName, ids, fieldNames, records);
        } catch (error) {
            if (fieldNames.length > 1) {
                await Promise.all(fieldNames.map((fieldName) => this._read(modelName, ids, [fieldName])));
                return;
            }
            if (ids.length > 1) {
                await Promise.all(ids.map((id) => this._read(modelName, [id], fieldNames)));
                return;
            }
            const message = error.data?.message || error.message;
            for (const id of ids) {
                this._storeValue(modelName, id, fieldNames[0], new EvaluationError(message));
            }
        }
    }

    _storeRecords(modelName, ids, fieldNames, records) {
        const recordsById = new Map(records.map((record) => [record.id, record]));
        for (const id of ids) {
            const record = recordsById.get(id);
            for (const fieldName of fieldNames) {
                if (!record) {
                    this._storeValue(modelName, id, fieldName, new EvaluationError(_t("Record not found")));
                } else if (record[fieldName] === undefined) {
                    this._storeValue(modelName, id, fieldName, new EvaluationError(_t("Field not found")));
                } else {
                    let value = record[fieldName];
                    // Relational fields
                    if (value && typeof value === 'object' && Array.isArray(value)) {
                        // many2one format: [id, display_name], only the id is returned
                        value = value[0];
                    }
                    this._storeValue(modelName, id, fieldName, value);
                }
            }
        }
    }

    _storeValue(modelName, recordId, fieldName, value) {
        const cacheKey = `${modelName}-${recordId}-${fieldName}`;
        this._cache.set(cacheKey, value);
        this._pendingKeys.delete(cacheKey);
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

        super.destroy?.();
    }
}
