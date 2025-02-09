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

        // Si le résultat est un objet avec la propriété fieldName
        if (result[fieldName] !== undefined) {
            return result[fieldName];
        }

        // Si le résultat est un tableau
        if (Array.isArray(result) && result.length > 0 && result[0][fieldName] !== undefined) {
            return result[0][fieldName];
        }

        throw new EvaluationError(_t("Field not found"));
    }
}