/** @odoo-module */
// @ts-check

import { EvaluationError } from "@odoo/o-spreadsheet";
import { OdooUIPlugin } from "@spreadsheet/plugins";
import { _t } from "@web/core/l10n/translation";

export class SearchPlugin extends OdooUIPlugin {
    static getters = /** @type {const} */ ([
        "searchRecords",
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
     * Search records based on domain
     * @param {string} modelName name of the model
     * @param {Array} domain search domain
     * @returns {Object}
     */
    searchRecords(modelName, domain) {
        if (!domain) {
            return { value: "", requiresRefresh: false };
        }
    
        try {
            const cacheKey = `${modelName}-${JSON.stringify(domain)}`;
            
            if (this._cache.has(cacheKey)) {
                return { 
                    value: this._cache.get(cacheKey), 
                    requiresRefresh: false 
                };
            }

            // Si une requête est déjà en cours, on attend
            if (this._pendingRequests.has(cacheKey)) {
                return { value: "", requiresRefresh: true };
            }

            // Lancer la requête
            const promise = this.serverData.orm.call(modelName, "search", [domain])
                .then(result => {
                    if (Array.isArray(result)) {
                        const value = result.join(',');
                        this._cache.set(cacheKey, value);
                        this._pendingRequests.delete(cacheKey);
                        
                        // Forcer la réévaluation
                        if (this.config?.custom?.model) {
                            this.config.custom.model.dispatch("EVALUATE_CELLS");
                        }
                    }
                })
                .catch(error => {
                    console.error("Search error:", error);
                    this._pendingRequests.delete(cacheKey);
                });

            this._pendingRequests.set(cacheKey, promise);

            return { value: "", requiresRefresh: true };
            
        } catch (error) {
            console.error("Search error:", error);
            return { value: "", requiresRefresh: false };
        }
    }

    /**
     * @override
     */
    handle(cmd) {
        switch (cmd.type) {
            case "EVALUATE_CELLS":
                // Forcer la réévaluation si des requêtes sont en attente
                if (this._pendingRequests.size > 0) {
                    return true;
                }
                break;
        }
        return false;
    }
}