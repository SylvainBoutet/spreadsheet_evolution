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
     * @param {Object} options options for search, including order
     * @returns {Object}
     */
    searchRecords(modelName, domain, options = {}) {
        if (!domain) {
            return { value: "", requiresRefresh: false };
        }
    
        try {
            // Convertir les valeurs en entiers pour les champs relationnels
            const processedDomain = domain.map(condition => {
                const [field, operator, value] = condition;
                // Si l'opérateur est "=" et la valeur est une chaîne numérique
                if (operator === "=" && !isNaN(value)) {
                    return [field, operator, parseInt(value)];
                }
                return condition;
            });

            const cacheKey = `${modelName}-${JSON.stringify(processedDomain)}`;
            
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

            // Lancer la requête avec le domaine traité et les options d'ordre
            const promise = this.serverData.orm.call(modelName, "search", [processedDomain], {
                order: options.order ? `${options.order[0][0]} ${options.order[0][1]}` : false,
            })
                .then(result => {
                    if (Array.isArray(result)) {
                        const value = result.join(',');
                        this._cache.set(cacheKey, value);
                        this._pendingRequests.delete(cacheKey);
                        
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