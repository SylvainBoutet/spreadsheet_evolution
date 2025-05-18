/** @odoo-module */
// @ts-check

import { EvaluationError } from "@odoo/o-spreadsheet";
import { OdooUIPlugin } from "@spreadsheet/plugins";
import { _t } from "@web/core/l10n/translation";
import { toString } from "@spreadsheet/helpers/helpers";

export class SumPlugin extends OdooUIPlugin {
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
            // S'enregistrer pour les événements qui pourraient nécessiter un rafraîchissement
            config.custom.model.addEventListener("user-selection-changed", this._onSelectionChanged.bind(this));
        }
    }

    /**
     * Appelé lorsque la sélection change dans la feuille
     * Peut aider à déclencher des rafraîchissements
     */
    _onSelectionChanged() {
        // Vérifier s'il y a des promesses en attente et forcer une réévaluation
        if (this._pendingRequests.size > 0) {
            this._scheduleRefresh();
        }
    }

    /**
     * Planifie un refresh différé pour éviter trop d'appels consécutifs
     */
    _scheduleRefresh() {
        if (this._refreshTimerId) {
            clearTimeout(this._refreshTimerId);
        }
        
        this._refreshTimerId = setTimeout(() => {
            if (this.config?.custom?.model) {
                this.config.custom.model.dispatch("EVALUATE_CELLS");
                console.log("SumPlugin: Scheduled refresh triggered");
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
            const cacheKey = `${modelName}-${fieldName}-${ids}`;

            if (this._cache.has(cacheKey)) {
                const cachedValue = this._cache.get(cacheKey);
                console.log("Returning cached value:", cachedValue);
                return { 
                    value: cachedValue, 
                    requiresRefresh: false 
                };
            }

            if (this._pendingRequests.has(cacheKey)) {
                return { value: 0, requiresRefresh: true };
            }

            const promise = this.serverData.orm.call(modelName, "search_read", [
                domain,
                [fieldName]
            ])
            .then(records => {
                const sum = records.reduce((acc, record) => {
                    console.log("Current record:", record);
                    console.log("Current field value:", record[fieldName]);
                    return acc + (parseFloat(record[fieldName]) || 0);
                }, 0);
                
                this._cache.set(cacheKey, sum);
                this._pendingRequests.delete(cacheKey);
                
                // Programmer un refresh différé
                this._scheduleRefresh();
            })
            .catch(error => {
                this._pendingRequests.delete(cacheKey);
                // Même en cas d'erreur, tenter un refresh
                this._scheduleRefresh();
            });

            this._pendingRequests.set(cacheKey, promise);
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
        
        super.destroy();
    }
} 