/** @odoo-module */
// @ts-check

import { EvaluationError } from "@odoo/o-spreadsheet";
import { OdooUIPlugin } from "@spreadsheet/plugins";
import { _t } from "@web/core/l10n/translation";

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
            // S'enregistrer pour les événements qui pourraient nécessiter un rafraîchissement
            config.custom.model.addEventListener("user-selection-changed", this._onSelectionChanged.bind(this));
        }
    }
    
    /**
     * Appelé lorsque la sélection change dans la feuille
     * Peut aider à déclencher des rafraîchissements
     */
    _onSelectionChanged() {
        // Pour GetFieldPlugin, nous pouvons simplement programmer un rafraîchissement périodique
        // pour s'assurer que les formules sont recalculées régulièrement
        if (!this._refreshTimerId) {
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
                console.log("GetFieldPlugin: Scheduled refresh triggered");
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
        // Créer une clé de cache unique
        const cacheKey = `${modelName}-${recordId}-${fieldName}`;
        
        // Vérifier si la valeur est en cache
        if (this._cache.has(cacheKey)) {
            return this._cache.get(cacheKey);
        }
        
        try {
            // batch.get est synchrone, pas une promesse
            const result = this.serverData.batch.get(
                modelName,
                "read",
                recordId,
                [fieldName]
            );

            if (!result) {
                console.warn("Aucun résultat trouvé");
                throw new EvaluationError(_t("Record not found"));
            }
            
            let value;
            
            // Si le résultat est un objet avec la propriété fieldName
            if (result[fieldName] !== undefined) {
                value = result[fieldName];
            }
            // Si le résultat est un tableau
            else if (Array.isArray(result) && result.length > 0 && result[0][fieldName] !== undefined) {
                value = result[0][fieldName];
            }
            else {
                throw new EvaluationError(_t("Field not found"));
            }
            
            // Gérer les champs relationnels
            if (value && typeof value === 'object' && Array.isArray(value)) {
                // Format many2one: [id, display_name] - on retourne uniquement l'id
                value = value[0];
            }
            
            // Mettre en cache
            this._cache.set(cacheKey, value);
            
            // Programmer un refresh pour s'assurer que d'autres plugins ont leurs données
            if (this._refreshTimerId === null) {
                this._scheduleRefresh();
            }
            
            return value;
            
        } catch (error) {
            throw error;
        }
    }
    
    /**
     * @override
     */
    handle(cmd) {
        switch (cmd.type) {
            case "EVALUATE_CELLS":
                // Pour GetFieldPlugin, nous n'avons plus de requêtes en attente
                // donc on ne bloque jamais l'évaluation
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