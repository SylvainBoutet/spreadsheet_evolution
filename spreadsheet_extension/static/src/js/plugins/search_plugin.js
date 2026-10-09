/** @odoo-module */
// @ts-check

import { OdooEvaluationPlugin } from "@spreadsheet/plugins";
import { debugLog } from "../utils";

export class SearchPlugin extends OdooEvaluationPlugin {
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
        this._formulaValues = new Map();
        this._refreshTimerId = null;

        if (config?.custom?.model) {
            config.custom.model.on('update', this._onUpdate.bind(this));
            config.custom.model.on('formula_changed', this._onFormulaChanged.bind(this));

            // Listen to the spreadsheet events
            this.config = config;
            config.custom.model.addEventListener("user-selection-changed", this._onSelectionChanged.bind(this));
        }
    }

    /**
     * Called when the selection changes in the sheet, may trigger a refresh
     */
    _onSelectionChanged() {
        // Pending promises: force a new evaluation
        if (Object.keys(this._promises).length > 0) {
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
                debugLog("Scheduled refresh triggered");
            }
            this._refreshTimerId = null;
        }, 100);
    }

    _onUpdate(event) {
        if (event?.type === 'UPDATE_CELL') {
            const cell = event.cell;
            const formula = this.getters.getFormula(cell);
            if (formula && formula.includes('IROKOO.GET_IDS')) {
                debugLog("Formula changed:", formula);
                const oldValue = this._formulaValues.get(cell);
                if (oldValue !== formula) {
                    this._formulaValues.set(cell, formula);
                    // Clear the cache of this cell only
                    const cellCache = Object.keys(this._cache).filter(key => key.startsWith(cell));
                    cellCache.forEach(key => delete this._cache[key]);
                    const cellPromises = Object.keys(this._promises).filter(key => key.startsWith(cell));
                    cellPromises.forEach(key => delete this._promises[key]);

                    if (this.config?.custom?.model) {
                        this._scheduleRefresh();
                    }
                }
            }
        }
    }

    _onFormulaChanged(event) {
        debugLog("Formula changed event:", event);
        // Do not clear the whole cache, all the data would be lost
        if (this.config?.custom?.model) {
            this._scheduleRefresh();
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
     * @returns {{value: string, requiresRefresh: boolean}}
     */
    searchRecords(modelName, domain, options = {}) {
        debugLog("searchRecords called with:", { modelName, domain, options });

        // Get the active cell
        this._currentCell = this.getters.getActiveCell?.();

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

            // The active cell is part of the cache key
            const cacheKey = `${this._currentCell}-${modelName}-${JSON.stringify(processedDomain)}-${JSON.stringify(options)}`;

            if (cacheKey in this._cache) {
                debugLog("Returning cached value:", this._cache[cacheKey]);
                return { value: this._cache[cacheKey], requiresRefresh: false };
            }

            if (cacheKey in this._promises) {
                debugLog("Request pending, returning refresh");
                return { value: "", requiresRefresh: true };
            }

            debugLog("Making new request");
            // @ts-ignore
            const promise = this.serverData.orm
                .call(modelName, "search", [processedDomain], {
                    // @ts-ignore
                    order: options.order ? `${options.order[0][0]} ${options.order[0][1]}` : false,
                    // @ts-ignore
                    limit: options.limit || false,
                })
                .then((result) => {
                    debugLog("Got result:", result);
                    const value = Array.isArray(result) ? result.join(',') : "";
                    this._cache[cacheKey] = value;
                    delete this._promises[cacheKey];

                    // Trigger a delayed evaluation so that all pending promises are done
                    this._scheduleRefresh();

                    return { value, requiresRefresh: false };
                })
                .catch((error) => {
                    // Cache the failure as an empty result so that the request is not sent again
                    this._cache[cacheKey] = "";
                    delete this._promises[cacheKey];
                    return { value: "", requiresRefresh: false };
                });

            this._promises[cacheKey] = promise;
            // Let the data provider re-evaluate the spreadsheet once the result is received
            this.serverData.startLoadingCallback(promise);
            return { value: "", requiresRefresh: true };

        } catch (error) {
            return { value: "", requiresRefresh: false };
        }
    }

    /**
     * @override
     */
    handle(cmd) {
        switch (cmd.type) {
            case "EVALUATE_CELLS":
                // Pending promises: ask for a new evaluation
                if (Object.keys(this._promises).length > 0) {
                    return true;
                }
                break;
            case "UPDATE_CELL":
                // Clear the cache of the updated cell only
                if (cmd.cell) {
                    const cellCache = Object.keys(this._cache).filter(key => key.startsWith(cmd.cell));
                    cellCache.forEach(key => delete this._cache[key]);
                    const cellPromises = Object.keys(this._promises).filter(key => key.startsWith(cmd.cell));
                    cellPromises.forEach(key => delete this._promises[key]);
                }
                return false; // Continue the processing
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
            this.config.custom.model.off('update', this._onUpdate);
            this.config.custom.model.off('formula_changed', this._onFormulaChanged);
            this.config.custom.model.removeEventListener("user-selection-changed", this._onSelectionChanged);
        }
        super.destroy?.();
    }

    async compute(formula) {
        const [action, ...args] = formula;
        debugLog(`${action} args:`, args);

        if (!this.dataReady) {
            // Trigger the display like GET_FIELD does
            if (!this.isInitialized) {
                this._initializeData();
            }
            return { value: '', requiresRefresh: true };
        }

        switch (action) {
            case 'GET_IDS': {
                const idArgs = this._processArgs(args);
                return this._getIds(idArgs);
            }
            case 'GET_SUM':
                return { value: 0, requiresRefresh: false };
            default:
                return { value: "", requiresRefresh: false };
        }
    }

    /**
     * Process the GET_IDS function to get the IDs matching the criteria
     * @param {Object} args search arguments
     * @returns {Object} search result
     */
    _getIds(args) {
        // @ts-ignore
        const { model, order, direction, limit, domain } = args;

        debugLog("_getIds called with:", args);

        return this.searchRecords(model, domain, {
            order: [[order, direction]],
            limit: limit > 0 ? limit : false,
        });
    }

    /**
     * Process the arguments of a formula
     * @param {Array} args arguments to process
     * @returns {Object} formatted arguments
     */
    _processArgs(args) {
        // GET_IDS
        if (args.length >= 4) {
            const [model, order, direction, limit, ...domainArgs] = args;
            const domain = [];

            for (let i = 0; i < domainArgs.length; i += 3) {
                if (i + 2 < domainArgs.length) {
                    const field = domainArgs[i];
                    const operator = domainArgs[i + 1];
                    const value = domainArgs[i + 2];

                    if (field && operator && value) {
                        domain.push([field, operator, value]);
                    }
                }
            }

            return { model, order, direction, limit, domain };
        }

        // GET_SUM
        if (args.length === 3) {
            const [model, field, ids] = args;
            return { model, field, ids };
        }

        return {};
    }

    async _initializeData() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        try {
            this.dataReady = true;
            this._refreshAllData();
        } catch (error) {
            this.isInitialized = false;
        }
    }

    _refreshAllData() {
        // Trigger a global refresh
        if (this.config?.custom?.model) {
            this.config.custom.model.dispatch("EVALUATE_CELLS");
        }
    }
}
