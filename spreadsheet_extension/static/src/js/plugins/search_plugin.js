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
     * @returns {string}
     */
    searchRecords(modelName, domain) {
        if (!domain) {
            return "";
        }
    
        try {
            const cacheKey = `${modelName}-${JSON.stringify(domain)}`;
            
            if (this._cache.has(cacheKey)) {
                return this._cache.get(cacheKey);
            }

            // Lancer la recherche
            const searchPromise = this.serverData.orm.search(modelName, domain);
            
            // Gérer la promesse
            searchPromise.then(ids => {
                if (Array.isArray(ids)) {
                    const value = ids.join(',');
                    this._cache.set(cacheKey, value);
                    // Forcer une mise à jour sans utiliser this.env
                    if (this.config && this.config.custom && this.config.custom.model) {
                        this.config.custom.model.notify();
                    }
                }
            }).catch(error => {
                console.error("Search error in promise:", error);
            });

            // Retourner une valeur vide en attendant
            return "";
            
        } catch (error) {
            console.error("Search error:", error);
            throw new EvaluationError(_t("Search failed"));
        }
    }
}