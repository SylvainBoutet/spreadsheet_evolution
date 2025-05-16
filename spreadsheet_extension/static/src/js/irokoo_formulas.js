/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import * as spreadsheet from "@odoo/o-spreadsheet";
import { EvaluationError } from "@odoo/o-spreadsheet";
const { functionRegistry } = spreadsheet.registries;
const { arg, toString, toNumber } = spreadsheet.helpers;

functionRegistry.add("IROKOO.GET_FIELD", {
    description: _t("Get a field value from any record"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'res.partner')")),
        arg("id (number)", _t("The record ID")),
        arg("field (string)", _t("The technical field name")),
    ],
    category: "Odoo",
    returns: ["STRING"],
    compute: function (model, id, field) {
        const _model = toString(model);
        const _id = toNumber(id, this.locale);
        const _field = toString(field);

        if (!_model || !_id || !_field) {
            throw new EvaluationError(_t("All parameters are required"));
        }

        return {
            value: this.getters.getFieldValue(_model, _id, _field),
            format: "@",
        };
    },
});

functionRegistry.add("IROKOO.GET_IDS", {
    description: _t("Get IDs from a model based on domain conditions"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'res.partner')")),
        arg("order (string)", _t("Field to order by")),
        arg("direction (string)", _t("Order direction (e.g. 'asc', 'desc')")),
        arg("limit (number)", _t("Maximum number of records to return (0 for no limit)")),
        arg("filters (string)", _t("Filters separated by semicolons (e.g. 'partner_id=10;state=posted;amount_total>1000')")),
    ],
    category: "Odoo",
    returns: ["STRING"],
    compute: function (model, order, direction, limit, filters) {
        // Convertir les arguments
        const _model = toString(model);
        const orderField = toString(order);
        const orderDirection = toString(direction);
        const _limit = toNumber(limit, this.locale);
        const filtersStr = toString(filters);
        
        // Construire le domaine à partir de la chaîne de filtres
        const domain = [];
        
        // Fonction pour traiter un filtre individuel
        function parseFilter(filterStr) {
            if (!filterStr || typeof filterStr !== 'string') return null;
            
            filterStr = filterStr.trim();
            if (filterStr === '') return null;
            
            let field, operator, value;
            
            // Format explicite "field:operator:value"
            if (filterStr.includes(':')) {
                const parts = filterStr.split(':');
                if (parts.length >= 3) {
                    field = parts[0].trim();
                    operator = parts[1].trim();
                    value = parts.slice(2).join(':').trim(); // Au cas où la valeur contient aussi des ":"
                    return [field, operator, value];
                }
            }
            
            // Format "field=value"
            if (filterStr.includes('=')) {
                const parts = filterStr.split('=');
                field = parts[0].trim();
                value = parts.slice(1).join('=').trim(); // Au cas où la valeur contient aussi des "="
                return [field, '=', value];
            }
            
            // Format "field>value" ou "field<value"
            if (filterStr.includes('>')) {
                const parts = filterStr.split('>');
                field = parts[0].trim();
                value = parts.slice(1).join('>').trim();
                return [field, '>', value];
            }
            
            if (filterStr.includes('<')) {
                const parts = filterStr.split('<');
                field = parts[0].trim();
                value = parts.slice(1).join('<').trim();
                return [field, '<', value];
            }
            
            // Format "field!=value" ou "field!value"
            if (filterStr.includes('!=')) {
                const parts = filterStr.split('!=');
                field = parts[0].trim();
                value = parts.slice(1).join('!=').trim();
                return [field, '!=', value];
            } else if (filterStr.includes('!')) {
                const parts = filterStr.split('!');
                field = parts[0].trim();
                value = parts.slice(1).join('!').trim();
                return [field, '!=', value];
            }
            
            return null;
        }
        
        // Découper la chaîne de filtres en filtres individuels (séparés par des points-virgules)
        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');
            
            for (const filter of filterArray) {
                const domainItem = parseFilter(filter);
                if (domainItem) {
                    domain.push(domainItem);
                }
            }
        }
        
        console.log("GET_IDS - Domaine construit:", domain);
        
        // ASTUCE: Simuler un appel à GET_FIELD pour initialiser ce qui est nécessaire
        try {
            if (this.getters && this.getters.getFieldValue) {
                // Obtenir d'abord l'accès aux données serveur pour amorcer le système
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    if (serverData && serverData.batch) {
                        console.log("GET_IDS - Obtenu accès à serverData.batch pour initialisation");
                    }
                }
                
                // Essayer avec les IDs qui pourraient être présents dans le domaine
                // Par exemple, si le domaine contient des conditions sur des IDs spécifiques
                let idToUse = 1; // ID par défaut
                
                // Chercher un ID explicite dans le domaine
                for (const condition of domain) {
                    if (condition[0] === 'id' && condition[1] === '=' && !isNaN(parseInt(condition[2]))) {
                        idToUse = parseInt(condition[2]);
                        console.log("GET_IDS - Utilisation de l'ID trouvé dans le domaine:", idToUse);
                        break;
                    }
                }
                
                // L'astuce : ignorer le résultat et ne stocker aucune référence
                // Cela déclenche l'initialisation mais sans affecter notre code si ça échoue
                this.getters.getFieldValue(_model, idToUse, "id");
                console.log("GET_IDS - Initialisation avec getFieldValue réussie");
            }
        } catch (e) {
            console.log("GET_IDS - L'initialisation a échoué, mais on continue:", e);
        }
        
        const result = this.getters.searchRecords(_model, domain, { 
            order: [[orderField, orderDirection]],
            limit: _limit > 0 ? _limit : false
        });
        
        console.log("GET_IDS avant retour:", result);
        
        if (!result.value) {
            console.warn("Aucun ID trouvé pour GET_IDS");
            // Retourner un message explicite au lieu d'une chaîne vide
            return { 
                value: "Aucun résultat trouvé", 
                format: "@",
                requiresRefresh: false  // Ne pas continuer à demander des refresh si aucun résultat
            };
        }

        return {
            value: result.value || "",
            format: "@",
            requiresRefresh: result.requiresRefresh,
        };
    },
});

functionRegistry.add("IROKOO.GET_SUM", {
    description: _t("Sum a field for records returned by IROKOO.GET_IDS"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'res.partner')")),
        arg("field (string)", _t("The field to sum")),
        arg("ids (string)", _t("Comma-separated list of IDs (from IROKOO.GET_IDS)")),
    ],
    category: "Odoo",
    returns: ["NUMBER"],
    compute: function (...args) {
        console.log("GET_SUM args:", args);
        
        if (args.length !== 3) {
            throw new EvaluationError(_t("IROKOO.GET_SUM requires exactly 3 arguments"));
        }

        const model = toString(args[0]);
        const field = toString(args[1]);
        const ids = toString(args[2]);
        
        // Vérifier si nous avons reçu le message "Aucun résultat trouvé" de GET_IDS
        if (ids === "Aucun résultat trouvé") {
            return {
                value: "Aucun résultat à additionner",
                format: "@",
                requiresRefresh: false
            };
        }
        
        // ASTUCE: Simuler un appel à GET_FIELD pour initialiser ce qui est nécessaire
        try {
            if (this.getters && this.getters.getFieldValue) {
                // Obtenir d'abord l'accès aux données serveur pour amorcer le système
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    if (serverData && serverData.batch) {
                        console.log("GET_SUM - Obtenu accès à serverData.batch pour initialisation");
                    }
                }
                
                // Essayer ensuite un appel à getFieldValue sur un ID qui devrait exister
                try {
                    // Utiliser un ID qui existe probablement
                    let idToUse = 1; // ID par défaut
                    
                    // Prendre le premier ID de la liste si possible
                    const firstId = ids.split(',')[0];
                    if (firstId && !isNaN(parseInt(firstId))) {
                        idToUse = parseInt(firstId);
                        console.log("GET_SUM - Utilisation du premier ID de la liste:", idToUse);
                    }
                    
                    // L'astuce : demander l'ID plutôt que n'importe quel champ
                    // L'ID existe toujours et est moins susceptible de causer des erreurs
                    this.getters.getFieldValue(model, idToUse, "id");
                    console.log("GET_SUM - Initialisation avec getFieldValue réussie");
                } catch (innerError) {
                    // Si cela échoue, ce n'est pas grave, l'initialisation a probablement déjà eu lieu
                    console.log("GET_SUM - Appel à getFieldValue échoué mais l'initialisation a peut-être réussi");
                }
            }
        } catch (e) {
            console.log("GET_SUM - L'initialisation a échoué, mais on continue:", e);
        }
        
        console.log("GET_SUM processed args:", { model, field, ids });
        const result = this.getters.sumRecords(model, field, ids);
        
        // Si on a besoin d'un refresh, on propage cette info
        if (result.requiresRefresh) {
            return { value: result.value, requiresRefresh: true };
        }
        
        // Si le résultat est vide ou égal à 0, afficher un message approprié
        if (!result.value && result.value !== 0) {
            return {
                value: "Aucune valeur à additionner",
                format: "@",
                requiresRefresh: false
            };
        }
        
        // Sinon on retourne la valeur formatée
        return {
            value: result.value,
            format: "#,##0.00", // Format nombre avec 2 décimales
        };
    }
});