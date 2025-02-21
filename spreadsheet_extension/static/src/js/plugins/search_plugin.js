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
        this._cache = {};
        this._promises = {};
        this._currentCell = null;
        this.isInitialized = false;
        this.pendingRequests = new Map();
        this.cachedResults = new Map();
        this.dataReady = false;

        if (config?.custom?.model) {
            config.custom.model.on('update', this._onUpdate.bind(this));
            config.custom.model.on('formula_changed', this._onFormulaChanged.bind(this));
        }
    }

    _onUpdate(event) {
        if (event?.type === 'UPDATE_CELL') {
            const cell = event.cell;
            const formula = this.getters.getFormula(cell);
            if (formula && formula.includes('IROKOO.GET_ID')) {
                console.log("Formula changed:", formula);
                const oldValue = this._formulaValues.get(cell);
                if (oldValue !== formula) {
                    this._formulaValues.set(cell, formula);
                    this._cache = {};
                    this._promises = {};
                    if (this.config?.custom?.model) {
                        this.config.custom.model.dispatch("EVALUATE_CELLS");
                    }
                }
            }
        }
    }

    _onFormulaChanged(event) {
        console.log("Formula changed event:", event);
        this._cache = {};
        this._promises = {};
        if (this.config?.custom?.model) {
            this.config.custom.model.dispatch("EVALUATE_CELLS");
        }
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
     * @returns {Promise<{value: string, requiresRefresh: boolean}> | {value: string, requiresRefresh: boolean}}
     */
    searchRecords(modelName, domain, options = {}) {
        console.log("searchRecords called with:", { modelName, domain, options });
        
        // Obtenir la cellule active
        this._currentCell = this.getters.getActiveCell();
        
        if (!domain) {
            return { value: "", requiresRefresh: false };
        }
    
        try {
            const processedDomain = domain.map(condition => {
                const [field, operator, value] = condition;
                if (operator === "=" && !isNaN(value)) {
                    return [field, operator, parseInt(value)];
                }
                return condition;
            });

            // Inclure la cellule active dans la clé de cache
            const cacheKey = `${this._currentCell}-${modelName}-${JSON.stringify(processedDomain)}-${JSON.stringify(options)}`;

            if (cacheKey in this._cache) {
                console.log("Returning cached value:", this._cache[cacheKey]);
                return { value: this._cache[cacheKey], requiresRefresh: false };
            }

            if (cacheKey in this._promises) {
                console.log("Request pending, returning refresh");
                return { value: "", requiresRefresh: true };
            }

            console.log("Making new request");
            const promise = this.serverData.orm
                .call(modelName, "search", [processedDomain], {
                    order: options.order ? `${options.order[0][0]} ${options.order[0][1]}` : false,
                    limit: options.limit || false,
                })
                .then((result) => {
                    console.log("Got result:", result);
                    const value = Array.isArray(result) ? result.join(',') : "";
                    this._cache[cacheKey] = value;
                    delete this._promises[cacheKey];
                    
                    if (this.config?.custom?.model) {
                        this.config.custom.model.dispatch("EVALUATE_CELLS");
                    }
                    
                    return { value, requiresRefresh: false };
                })
                .catch((error) => {
                    console.error("Search error:", error);
                    delete this._promises[cacheKey];
                    return { value: "", requiresRefresh: false };
                });

            this._promises[cacheKey] = promise;
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
        console.log("Handle called with:", cmd.type);
        switch (cmd.type) {
            case "EVALUATE_CELLS":
                return Object.keys(this._promises).length > 0;
            case "UPDATE_CELL":
                // Vider uniquement le cache pour la cellule modifiée
                if (cmd.cell) {
                    const cellCache = Object.keys(this._cache).filter(key => key.startsWith(cmd.cell));
                    cellCache.forEach(key => delete this._cache[key]);
                    const cellPromises = Object.keys(this._promises).filter(key => key.startsWith(cmd.cell));
                    cellPromises.forEach(key => delete this._promises[key]);
                }
                return true;
        }
        return false;
    }

    /**
     * @override
     */
    destroy() {
        if (this.config?.custom?.model) {
            this.config.custom.model.off('update', this._onUpdate);
            this.config.custom.model.off('formula_changed', this._onFormulaChanged);
        }
        super.destroy();
    }

    async compute(formula) {
        const [action, ...args] = formula;
        console.log(`${action} args:`, args);

        if (!this.dataReady) {
            // Simuler le comportement de GET_FIELD pour déclencher l'affichage
            if (!this.isInitialized) {
                this._initializeData();
            }
            return { value: '', requiresRefresh: true };
        }

        switch (action) {
            case 'GET_ID':
                const idArgs = this._processArgs(args);
                return this._getId(idArgs);
            case 'GET_SUM':
                const sumArgs = this._processArgs(args);
                return this._getSum(sumArgs);
            default:
                return this._performSearch(...args);
        }
    }

    async _initializeData() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        try {
            await Promise.all([
                this._loadSaleOrders(),
                this._loadPartners(),
            ]);
            
            this.dataReady = true;
            this._refreshAllData();
        } catch (error) {
            console.error("Error initializing data:", error);
            this.isInitialized = false;
        }
    }

    _refreshAllData() {
        // Déclencher un rafraîchissement global
        this.trigger('REFRESH');
    }

    // ... rest of the code ...
}