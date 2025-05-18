/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import * as spreadsheet from "@odoo/o-spreadsheet";
import { EvaluationError } from "@odoo/o-spreadsheet";
import { session } from "@web/session";

// Debug flag - set to true to enable advanced debugging
const DEBUG_FORMULAS = true;

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
        
        // ASTUCE: Initialisation sécurisée qui fonctionne pour tout utilisateur
        try {
            if (this.getters && this.getters.getFieldValue) {
                // Obtenir d'abord l'accès aux données serveur pour amorcer le système
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    
                    // Si disponible, tenter d'accéder à l'ID de l'utilisateur courant
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "id");
                            console.log(`GET_FIELD - Initialisation avec utilisateur courant ID=${serverData.user.id}`);
                        } catch (innerE) {
                            // Ignorer si échec
                        }
                    }
                }
                
                // Essayer aussi directement avec le modèle demandé
                try {
                    // Rechercher un ID existant et accessible dans le modèle demandé
                    const basicSearch = this.getters.searchRecords(_model, [["id", ">", "0"]], { limit: 1 });
                    if (basicSearch && basicSearch.value) {
                        let firstId;
                        if (typeof basicSearch.value === 'string') {
                            firstId = parseInt(basicSearch.value.split(',')[0]);
                        } else if (Array.isArray(basicSearch.value) && basicSearch.value.length > 0) {
                            firstId = parseInt(basicSearch.value[0]);
                        }
                        
                        if (firstId) {
                            this.getters.getFieldValue(_model, firstId, "id");
                            console.log(`GET_FIELD - Initialisation avec ${_model} ID=${firstId}`);
                        }
                    }
                } catch (modelE) {
                    // Ignorer si échec
                }
            }
        } catch (e) {
            // Ignorer les erreurs
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
        arg("filters (string)", _t("Filters separated by semicolons (e.g. 'partner_id=10;state=posted;name=%query%')")),
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
            
            // Format "field~value" pour ilike (ancien format)
            if (filterStr.includes('~')) {
                const parts = filterStr.split('~');
                field = parts[0].trim();
                value = parts.slice(1).join('~').trim();
                return [field, 'ilike', value];
            }
            
            // Détecter si c'est une recherche de type LIKE/ILIKE avec %
            const hasPercentage = filterStr.includes('%');
            let isLikeSearch = false;
            
            // Format "field=value" (ou LIKE si contient %)
            if (filterStr.includes('=')) {
                const parts = filterStr.split('=');
                field = parts[0].trim();
                value = parts.slice(1).join('=').trim(); // Au cas où la valeur contient aussi des "="
                
                // Si la valeur contient % et que ce n'est pas au début (éviter les confusions avec les calculs %)
                if (hasPercentage && value.includes('%')) {
                    isLikeSearch = true;
                    operator = 'ilike';
                } else {
                    operator = '=';
                }
                
                return [field, operator, value];
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
        
        // ASTUCE: Initialisation sécurisée qui fonctionne pour tout utilisateur
        try {
            if (this.getters && this.getters.getFieldValue) {
                // Obtenir d'abord l'accès aux données serveur pour amorcer le système
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    
                    // Si disponible, tenter d'accéder à l'ID de l'utilisateur courant
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "id");
                            console.log(`GET_IDS - Initialisation avec utilisateur courant ID=${serverData.user.id}`);
                        } catch (innerE) {
                            // Ignorer si échec
                        }
                    }
                }
                
                // Essayer aussi directement avec le modèle demandé et un ID général
                try {
                    // Rechercher un ID existant et accessible dans le modèle demandé
                    const basicSearch = this.getters.searchRecords(_model, [["id", ">", "0"]], { limit: 1 });
                    if (basicSearch && basicSearch.value) {
                        let firstId;
                        if (typeof basicSearch.value === 'string') {
                            firstId = parseInt(basicSearch.value.split(',')[0]);
                        } else if (Array.isArray(basicSearch.value) && basicSearch.value.length > 0) {
                            firstId = parseInt(basicSearch.value[0]);
                        }
                        
                        if (firstId) {
                            this.getters.getFieldValue(_model, firstId, "id");
                            console.log(`GET_IDS - Initialisation avec ${_model} ID=${firstId}`);
                        }
                    }
                } catch (modelE) {
                    // Ignorer si échec
                }
            }
        } catch (e) {
            // Ignorer les erreurs
        }
        
        try {
            const result = this.getters.searchRecords(_model, domain, { 
                order: [[orderField, orderDirection]],
                limit: _limit > 0 ? _limit : false
            });
            
            if (!result.value) {
                // Si aucun résultat n'est trouvé et que nous avons essayé de trier, il pourrait s'agir d'un champ calculé non listé
                if (orderField && orderField !== 'id' && orderField !== 'name') {
                    // Essayons sans tri pour voir si c'est le tri qui cause le problème
                    const testResult = this.getters.searchRecords(_model, domain, { limit: 1 });
                    if (testResult.value) {
                        // Si nous obtenons des résultats sans tri, c'est que le problème vient du champ de tri
                        throw new EvaluationError(_t("Unable to sort by field '") + orderField + _t("'. It might be a computed field or not exist on the model. Please use a different field for sorting or try IROKOO.GET_GROUPED_IDS for aggregations."));
                    }
                }
                
                return { 
                    value: "No results found", 
                    format: "@",
                    requiresRefresh: false
                };
            }

            return {
                value: result.value || "",
                format: "@",
                requiresRefresh: result.requiresRefresh,
            };
        } catch (error) {
            // Si l'erreur vient d'ailleurs (API, etc.), la transformer en EvaluationError
            if (!(error instanceof EvaluationError)) {
                throw new EvaluationError(_t("Error while executing search: ") + error.message);
            }
            throw error;
        }
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
    compute: function (model, field, ids) {
        const _model = toString(model);
        const _field = toString(field);
        const idsStr = toString(ids);
        
        // Vérifier si nous avons reçu le message "Aucun résultat trouvé" de GET_IDS
        if (idsStr === "Aucun résultat trouvé") {
            return {
                value: "Aucun résultat à additionner",
                format: "@",
                requiresRefresh: false
            };
        }
        
        // ASTUCE: Initialisation sécurisée qui fonctionne pour tout utilisateur
        try {
            if (this.getters && this.getters.getFieldValue) {
                // Obtenir d'abord l'accès aux données serveur pour amorcer le système
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    
                    // Si disponible, tenter d'accéder à l'ID de l'utilisateur courant
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "id");
                            console.log(`GET_SUM - Initialisation avec utilisateur courant ID=${serverData.user.id}`);
                        } catch (innerE) {
                            // Ignorer si échec
                        }
                    }
                }
                
                // Essayer d'abord avec un ID de la liste fournie
                try {
                    // Prendre le premier ID de la liste si possible
                    const firstId = idsStr.split(',')[0];
                    if (firstId && !isNaN(parseInt(firstId))) {
                        this.getters.getFieldValue(_model, parseInt(firstId), "id");
                        console.log(`GET_SUM - Initialisation avec ${_model} ID=${firstId}`);
                    } else {
                        // Sinon essayer avec une recherche basique
                        const basicSearch = this.getters.searchRecords(_model, [["id", ">", "0"]], { limit: 1 });
                        if (basicSearch && basicSearch.value) {
                            let availableId;
                            if (typeof basicSearch.value === 'string') {
                                availableId = parseInt(basicSearch.value.split(',')[0]);
                            } else if (Array.isArray(basicSearch.value) && basicSearch.value.length > 0) {
                                availableId = parseInt(basicSearch.value[0]);
                            }
                            
                            if (availableId) {
                                this.getters.getFieldValue(_model, availableId, "id");
                                console.log(`GET_SUM - Initialisation avec ${_model} ID=${availableId}`);
                            }
                        }
                    }
                } catch (innerError) {
                    // Si cela échoue, ce n'est pas grave
                    console.log(`GET_SUM - Échec de l'initialisation:`, innerError);
                }
            }
        } catch (e) {
            // Ignorer les erreurs
        }
        
        const result = this.getters.sumRecords(_model, _field, idsStr);
        
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

functionRegistry.add("IROKOO.GET_GROUPED_IDS", {
    description: _t("Get values grouped by a field with aggregation"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'sale.order')")),
        arg("group_by (string)", _t("Field to group by (e.g. 'partner_id' or 'state')")),
        arg("aggregate_field (string)", _t("Field to aggregate (e.g. 'amount_untaxed')")),
        arg("aggregate_function (string)", _t("Aggregation function (sum, avg, count, min, max)")),
        arg("filters (string)", _t("Filters separated by semicolons (e.g. 'state=sale' or 'state:in:draft,sent')")),
        arg("limit (number)", _t("Maximum number of groups to return")),
    ],
    category: "Odoo",
    returns: ["STRING"],
    compute: function (model, group_by, aggregate_field, aggregate_function, filters, limit) {
        console.log("GET_GROUPED_IDS - Starting with model:", model);
        
        // Convert arguments
        const _model = toString(model);
        const _group_by = toString(group_by);
        const _aggregate_field = toString(aggregate_field);
        const _aggregate_function = toString(aggregate_function).toLowerCase();
        const filtersStr = toString(filters || "");
        const _limit = Number.isNaN(toNumber(limit, this.locale)) ? 0 : toNumber(limit, this.locale);
        
        // Utiliser un cache basé sur les paramètres pour éviter les requêtes redondantes
        const cacheKey = `${_model}_${_group_by}_${_aggregate_field}_${_aggregate_function}_${filtersStr}_${_limit}`;
        
        // Initialise le cache si pas encore créé
        if (!this._groupedIdsCache) {
            this._groupedIdsCache = {};
        }
        
        // Vérifier si nous avons déjà un résultat en cache
        if (this._groupedIdsCache[cacheKey] && 
            this._groupedIdsCache[cacheKey].timestamp > Date.now() - 30000) { // Cache de 30 secondes
            console.log("GET_GROUPED_IDS - Using cached result for:", cacheKey);
            return this._groupedIdsCache[cacheKey].result;
        }
        
        // Build domain from filter string
        const domain = [];
        
        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');
            
            console.log(`GET_GROUPED_IDS - Processing ${filterArray.length} filters from: ${filtersStr}`);
            
            for (const filter of filterArray) {
                const trimmedFilter = filter.trim();
                
                // Debug logging for each filter
                console.log(`GET_GROUPED_IDS - Processing filter: "${trimmedFilter}"`);
                
                // Support for explicit format "field:operator:value"
                if (trimmedFilter.includes(':')) {
                    const parts = trimmedFilter.split(':');
                    if (parts.length >= 3) {
                        const field = parts[0].trim();
                        const operator = parts[1].trim();
                        const valueStr = parts.slice(2).join(':').trim();
                        
                        // Support for "in" operator with comma-separated values
                        if (operator.toLowerCase() === 'in' && valueStr.includes(',')) {
                            const values = valueStr.split(',').map(v => v.trim());
                            domain.push([field, 'in', values]);
                        } else {
                            // Try to convert to number if possible
                            const parsedValue = !isNaN(Number(valueStr)) ? Number(valueStr) : valueStr;
                            domain.push([field, operator, parsedValue]);
                        }
                        continue; // Skip further processing for this filter
                    }
                }
                
                // Fix: Handle date comparison operators correctly
                if (trimmedFilter.includes('>')) {
                    const parts = trimmedFilter.split('>');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('>').trim();
                    
                    // Special handling for date fields
                    const isDateField = (field.includes('date') || field.endsWith('_at') || field.endsWith('_on'));
                    console.log(`GET_GROUPED_IDS - Detected field "${field}" with > operator, isDateField: ${isDateField}`);
                    
                    domain.push([field, '>', value]);
                    continue;
                }
                
                if (trimmedFilter.includes('<')) {
                    const parts = trimmedFilter.split('<');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('<').trim();
                    
                    // Special handling for date fields
                    const isDateField = (field.includes('date') || field.endsWith('_at') || field.endsWith('_on'));
                    console.log(`GET_GROUPED_IDS - Detected field "${field}" with < operator, isDateField: ${isDateField}`);
                    
                    domain.push([field, '<', value]);
                    continue;
                }
                
                // Legacy support for field=value format
                else if (trimmedFilter.includes('=')) {
                    const [field, value] = trimmedFilter.split('=').map(s => s.trim());
                    // Try to convert numeric values for proper domain construction
                    const parsedValue = !isNaN(Number(value)) ? Number(value) : value;
                    domain.push([field, '=', parsedValue]);
                }
            }
        }
        
        // If no filter, get all records
        if (domain.length === 0) {
            domain.push(['id', '>', '0']);
        }
        
        console.log("GET_GROUPED_IDS - Final domain:", JSON.stringify(domain));
        
        try {
            // Main search to get all records
            const result = this.getters.searchRecords(_model, domain, { limit: 2000 });
            
            // Mécanisme de gestion de l'état "loading"
            if (result.requiresRefresh) {
                // On vérifie si nous avons des données partielles utilisables
                if (result.value && (typeof result.value === 'string' || (Array.isArray(result.value) && result.value.length > 0))) {
                    console.log(`GET_GROUPED_IDS - Data loading but we have ${Array.isArray(result.value) ? result.value.length : 'some'} results, continuing with partial data`);
                    
                    // On sauvegarde cet état dans le cache comme résultat partiel
                    const partialResult = { 
                        value: Array.isArray(result.value) ? result.value.join(',') : result.value, 
                        format: "@", 
                        requiresRefresh: true 
                    };
                    
                    this._groupedIdsCache[cacheKey] = {
                        result: partialResult,
                        timestamp: Date.now() - 25000 // Expiration rapide pour forcer un refresh bientôt
                    };
                    
                    // Continuer avec les données partielles
                } else {
                    console.log(`GET_GROUPED_IDS - Still loading data, no partial results available`);
                    
                    // Retourner le résultat du cache si disponible, sinon un message de chargement
                    if (this._groupedIdsCache[cacheKey]) {
                        console.log(`GET_GROUPED_IDS - Using cached result during refresh`);
                        const cachedResult = this._groupedIdsCache[cacheKey].result;
                        return { 
                            value: cachedResult.value, 
                            format: cachedResult.format, 
                            requiresRefresh: true 
                        };
                    }
                    
                    const loadingResult = { 
                        value: "Chargement des données...", 
                        format: "@", 
                        requiresRefresh: true 
                    };
                    
                    // Sauvegarder cet état de chargement dans le cache
                    this._groupedIdsCache[cacheKey] = {
                        result: loadingResult,
                        timestamp: Date.now() - 25000 // Expiration rapide
                    };
                    
                    return loadingResult;
                }
            }
            
            // Process IDs - handle both string and array formats
            let ids = [];
            
            if (typeof result.value === 'string') {
                ids = result.value.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            } else if (Array.isArray(result.value)) {
                ids = result.value.map(id => parseInt(id)).filter(id => !isNaN(id));
            }
            
            if (!ids.length) {
                return { value: "Aucun résultat trouvé", format: "@" };
            }
            
            // Group records by the specified field
            const groups = {};
            
            // NEW: Amélioration pour les champs date
            const isDateField = (_group_by.includes('date') || _group_by.endsWith('_at') || _group_by.endsWith('_on'));
            
            for (const id of ids) {
                try {
                    // Get group field value with proper error handling
                    let groupFieldValue;
                    try {
                        groupFieldValue = this.getters.getFieldValue(_model, id, _group_by);
                    } catch (fieldError) {
                        // If we get a loading error, request refresh
                        if (fieldError.name === "LoadingDataError" || 
                            (fieldError.message && fieldError.message.includes("Loading"))) {
                            // NEW: Si nous avons déjà traité certains enregistrements, continuons plutôt que de recharger
                            if (Object.keys(groups).length > 0) {
                                console.log(`GET_GROUPED_IDS - Loading error for record ${id}, but continuing with ${Object.keys(groups).length} groups already processed`);
                                continue;
                            }
                            
                            // Sinon demander un refresh
                            console.log(`GET_GROUPED_IDS - Loading error for group values, requesting refresh`);
                            return { value: "Chargement des valeurs de groupe...", format: "@", requiresRefresh: true };
                        }
                        // Otherwise skip this record
                        continue;
                    }
                    
                    // Get aggregate field value with proper error handling
                    let aggregateValue;
                    try {
                        aggregateValue = this.getters.getFieldValue(_model, id, _aggregate_field);
                    } catch (fieldError) {
                        // If we get a loading error, request refresh
                        if (fieldError.name === "LoadingDataError" || 
                            (fieldError.message && fieldError.message.includes("Loading"))) {
                            // NEW: Si nous avons déjà traité certains enregistrements, continuons plutôt que de recharger
                            if (Object.keys(groups).length > 0) {
                                console.log(`GET_GROUPED_IDS - Loading error for record ${id}, but continuing with ${Object.keys(groups).length} groups already processed`);
                                continue;
                            }
                            
                            // Sinon demander un refresh
                            console.log(`GET_GROUPED_IDS - Loading error for aggregate values, requesting refresh`);
                            return { value: "Chargement des valeurs à agréger...", format: "@", requiresRefresh: true };
                        }
                        // Otherwise skip this record
                        continue;
                    }
                    
                    // Extract group value with thorough handling of different field types
                    let groupValue;
                    
                    if (Array.isArray(groupFieldValue) && groupFieldValue.length > 0) {
                        // Format many2one [id, name]
                        groupValue = groupFieldValue[0];
                    } else if (typeof groupFieldValue === 'object' && groupFieldValue !== null) {
                        if (groupFieldValue.id !== undefined) {
                            // Format {id: x, display_name: y}
                            groupValue = groupFieldValue.id;
                        } else if (groupFieldValue.value !== undefined) {
                            // Some fields return {value: x, ...}
                            groupValue = groupFieldValue.value;
                        } else {
                            // Just use the object as is
                            groupValue = JSON.stringify(groupFieldValue);
                        }
                    } else {
                        // Direct value (string, number, boolean)
                        groupValue = groupFieldValue;
                    }
                    
                    // Skip null/undefined values
                    if (groupValue === null || groupValue === undefined) continue;
                    
                    // Convert aggregate value to number if possible
                    let numValue = null;
                    
                    if (typeof aggregateValue === 'number') {
                        numValue = aggregateValue;
                    } else if (typeof aggregateValue === 'string' && !isNaN(parseFloat(aggregateValue))) {
                        numValue = parseFloat(aggregateValue);
                    } else if (Array.isArray(aggregateValue) && aggregateValue.length > 0) {
                        // For relational fields, count the items
                        numValue = aggregateValue.length;
                    } else if (typeof aggregateValue === 'object' && aggregateValue !== null) {
                        // For object values, try to extract a number
                        if (aggregateValue.value !== undefined && !isNaN(parseFloat(aggregateValue.value))) {
                            numValue = parseFloat(aggregateValue.value);
                        }
                    }
                    
                    // If no numeric value and function is not 'count', skip record
                    if (numValue === null && _aggregate_function !== 'count') continue;
                    
                    // Initialize group if it doesn't exist
                    const groupKey = String(groupValue);
                    if (!groups[groupKey]) {
                        groups[groupKey] = {
                            value: groupValue,
                            values: []
                        };
                    }
                    
                    // For COUNT, always count 1
                    if (_aggregate_function === 'count') {
                        groups[groupKey].values.push(1);
                    } else if (numValue !== null) {
                        groups[groupKey].values.push(numValue);
                    }
                } catch (recordError) {
                    // If we get a loading error, request refresh
                    if (recordError.name === "LoadingDataError" || 
                        (recordError.message && recordError.message.includes("Loading"))) {
                        // NEW: Si nous avons déjà traité suffisamment d'enregistrements, considérons que c'est assez
                        if (Object.keys(groups).length >= Math.max(5, _limit)) {
                            console.log(`GET_GROUPED_IDS - Loading error but we have ${Object.keys(groups).length} groups, continuing`);
                            break; // Sortir de la boucle et continuer avec ce que nous avons
                        }
                        
                        // Sinon, si nous avons déjà quelques groupes, continuons avec les prochains enregistrements
                        if (Object.keys(groups).length > 0) {
                            console.log(`GET_GROUPED_IDS - Loading error for record ${id}, continuing with next record`);
                            continue;
                        }
                        
                        console.log(`GET_GROUPED_IDS - Loading error for record data, requesting refresh`);
                        return { value: "Chargement des données d'enregistrement...", format: "@", requiresRefresh: true };
                    }
                    // Otherwise just continue with next record
                    console.log(`GET_GROUPED_IDS - Error processing record ID=${id}:`, recordError);
                    continue;
                }
            }
            
            // If no groups were created
            if (Object.keys(groups).length === 0) {
                return { value: "Aucun groupe trouvé", format: "@" };
            }
            
            // Calculate aggregated values and sort
            const aggregatedGroups = [];
            
            for (const key in groups) {
                const group = groups[key];
                let aggregatedValue = 0;
                
                if (group.values.length > 0) {
                    switch (_aggregate_function) {
                        case 'sum':
                            aggregatedValue = group.values.reduce((sum, val) => sum + val, 0);
                            break;
                        case 'avg':
                            aggregatedValue = group.values.reduce((sum, val) => sum + val, 0) / group.values.length;
                            break;
                        case 'count':
                            aggregatedValue = group.values.length;
                            break;
                        case 'min':
                            aggregatedValue = Math.min(...group.values);
                            break;
                        case 'max':
                            aggregatedValue = Math.max(...group.values);
                            break;
                        default:
                            // Default to sum
                            aggregatedValue = group.values.reduce((sum, val) => sum + val, 0);
                    }
                }
                
                aggregatedGroups.push({
                    groupValue: group.value,
                    aggregateValue: aggregatedValue
                });
            }
            
            // Sort by aggregated value (descending) and limit if necessary
            aggregatedGroups.sort((a, b) => b.aggregateValue - a.aggregateValue);
            const limitedGroups = _limit > 0 ? aggregatedGroups.slice(0, _limit) : aggregatedGroups;
            
            // Return comma-separated list of group values
            const groupValues = limitedGroups.map(g => g.groupValue);
            console.log("GET_GROUPED_IDS - Result:", groupValues);
            
            // NEW: Mettre en cache le résultat pour les futures requêtes
            if (!this._groupedIdsCache) {
                this._groupedIdsCache = {};
            }
            
            const finalResult = { value: groupValues.join(','), format: "@" };
            
            // Cache le résultat avec un timestamp
            this._groupedIdsCache[cacheKey] = {
                result: finalResult,
                timestamp: Date.now()
            };
            
            return finalResult;
            
        } catch (e) {
            // Global error handler
            
            // If data is still loading, return loading indicator
            if (e.name === "LoadingDataError" || (e.message && e.message.includes("Loading"))) {
                // Check if we have cached result
                if (this._groupedIdsCache[cacheKey]) {
                    console.log(`GET_GROUPED_IDS - Loading data, using cached result`);
                    const cachedResult = this._groupedIdsCache[cacheKey].result;
                    
                    return { 
                        value: cachedResult.value, 
                        format: cachedResult.format, 
                        requiresRefresh: true 
                    };
                }
                
                const loadingResult = { 
                    value: "Chargement des données...", 
                    format: "@", 
                    requiresRefresh: true 
                };
                
                // Sauvegarder l'état de chargement dans le cache
                this._groupedIdsCache[cacheKey] = {
                    result: loadingResult,
                    timestamp: Date.now() - 25000 // Expiration rapide
                };
                
                return loadingResult;
            }
            
            // Otherwise return error message
            console.error("GET_GROUPED_IDS - Error:", e);
            const errorResult = { value: "Erreur: " + e.message, format: "@" };
            
            // Cache the error result briefly to prevent constant recalculation
            this._groupedIdsCache[cacheKey] = {
                result: errorResult,
                timestamp: Date.now() - 20000 // Cache for 10 seconds only
            };
            
            return errorResult;
        }
    }
});

functionRegistry.add("IROKOO.SUM_BY_DOMAIN", {
    description: _t("Sum a field for records matching a domain"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'sale.order')")),
        arg("field (string)", _t("The field to sum (e.g. 'amount_untaxed')")),
        arg("filters (string)", _t("Filters separated by semicolons (e.g. 'partner_id=10;state=posted')")),
    ],
    category: "Odoo",
    returns: ["NUMBER"],
    compute: function (model, field, filters) {
        const _model = toString(model);
        const _field = toString(field);
        const filtersStr = toString(filters);
        
        // Construire le domaine à partir de la chaîne de filtres
        const domain = [];
        
        // Réutiliser la même logique de parsing des filtres que dans GET_IDS
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
                    
                    // Si c'est un opérateur 'in' avec valeurs séparées par virgules
                    if (operator.toLowerCase() === 'in' && value.includes(',')) {
                        const values = value.split(',').map(v => v.trim());
                        return [field, 'in', values];
                    }
                    
                    // Tenter de convertir en nombre si possible
                    if (!isNaN(parseFloat(value))) {
                        value = parseFloat(value);
                    }
                    
                    return [field, operator, value];
                }
            }
            
            // Format "field~value" pour ilike (ancien format)
            if (filterStr.includes('~')) {
                const parts = filterStr.split('~');
                field = parts[0].trim();
                value = parts.slice(1).join('~').trim();
                return [field, 'ilike', value];
            }
            
            // Détecter si c'est une recherche de type LIKE/ILIKE avec %
            const hasPercentage = filterStr.includes('%');
            let isLikeSearch = false;
            
            // Format "field=value" (ou LIKE si contient %)
            if (filterStr.includes('=')) {
                const parts = filterStr.split('=');
                field = parts[0].trim();
                value = parts.slice(1).join('=').trim(); // Au cas où la valeur contient aussi des "="
                
                // Si la valeur contient % et que ce n'est pas au début (éviter les confusions avec les calculs %)
                if (hasPercentage && value.includes('%')) {
                    isLikeSearch = true;
                    operator = 'ilike';
                } else {
                    operator = '=';
                }
                
                // Tenter de convertir en nombre si possible
                if (!isNaN(parseFloat(value))) {
                    value = parseFloat(value);
                }
                
                return [field, operator, value];
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
                
                // Tenter de convertir en nombre si possible
                if (!isNaN(parseFloat(value))) {
                    value = parseFloat(value);
                }
                
                return [field, '!=', value];
            } else if (filterStr.includes('!')) {
                const parts = filterStr.split('!');
                field = parts[0].trim();
                value = parts.slice(1).join('!').trim();
                
                // Tenter de convertir en nombre si possible
                if (!isNaN(parseFloat(value))) {
                    value = parseFloat(value);
                }
                
                return [field, '!=', value];
            }
            
            return null;
        }
        
        // Traiter les filtres
        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');
            
            console.log(`SUM_BY_DOMAIN - Processing ${filterArray.length} filters from: ${filtersStr}`);
            
            for (const filter of filterArray) {
                const trimmedFilter = filter.trim();
                
                // Debug logging for each filter
                console.log(`SUM_BY_DOMAIN - Processing filter: "${trimmedFilter}"`);
                
                // Support for explicit format "field:operator:value"
                if (trimmedFilter.includes(':')) {
                    const parts = trimmedFilter.split(':');
                    if (parts.length >= 3) {
                        const field = parts[0].trim();
                        const operator = parts[1].trim();
                        const valueStr = parts.slice(2).join(':').trim();
                        
                        // Support for "in" operator with comma-separated values
                        if (operator.toLowerCase() === 'in' && valueStr.includes(',')) {
                            const values = valueStr.split(',').map(v => v.trim());
                            domain.push([field, 'in', values]);
                        } else {
                            // Try to convert to number if possible
                            const parsedValue = !isNaN(Number(valueStr)) ? Number(valueStr) : valueStr;
                            domain.push([field, operator, parsedValue]);
                        }
                        continue; // Skip further processing for this filter
                    }
                }
                
                // Fix: Handle date comparison operators correctly
                if (trimmedFilter.includes('>')) {
                    const parts = trimmedFilter.split('>');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('>').trim();
                    
                    // Special handling for date fields
                    const isDateField = (field.includes('date') || field.endsWith('_at') || field.endsWith('_on'));
                    console.log(`SUM_BY_DOMAIN - Detected field "${field}" with > operator, isDateField: ${isDateField}`);
                    
                    domain.push([field, '>', value]);
                    continue;
                }
                
                if (trimmedFilter.includes('<')) {
                    const parts = trimmedFilter.split('<');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('<').trim();
                    
                    // Special handling for date fields
                    const isDateField = (field.includes('date') || field.endsWith('_at') || field.endsWith('_on'));
                    console.log(`SUM_BY_DOMAIN - Detected field "${field}" with < operator, isDateField: ${isDateField}`);
                    
                    domain.push([field, '<', value]);
                    continue;
                }
                
                // Legacy support for field=value format
                else if (trimmedFilter.includes('=')) {
                    const [field, value] = trimmedFilter.split('=').map(s => s.trim());
                    // Try to convert numeric values for proper domain construction
                    const parsedValue = !isNaN(Number(value)) ? Number(value) : value;
                    domain.push([field, '=', parsedValue]);
                    continue;
                }
                
                // Format with other operators
                const domainItem = parseFilter(trimmedFilter);
                if (domainItem) {
                    domain.push(domainItem);
                }
            }
        }
        
        console.log("SUM_BY_DOMAIN - Final domain:", JSON.stringify(domain));
        
        try {
            // Initialisation avec l'utilisateur courant pour établir le contexte de sécurité
            try {
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "name");
                        } catch (e) {
                            // Ignorer
                        }
                    }
                }
            } catch (initError) {
                console.log("Erreur d'initialisation:", initError);
            }
            
            // 1. Récupérer les IDs correspondant au domaine
            const idsResult = this.getters.searchRecords(_model, domain, { 
                // Pas de limite pour prendre en compte tous les enregistrements
                // Pas de tri nécessaire pour une somme
            });
            
            // Si données en cours de chargement
            if (idsResult.requiresRefresh) {
                return { value: 0, format: "#,##0.00" };
            }
            
            // Si aucun résultat
            if (!idsResult.value || 
                (Array.isArray(idsResult.value) && !idsResult.value.length) || 
                (typeof idsResult.value === 'string' && !idsResult.value.trim())) {
                return { value: 0, format: "#,##0.00" };
            }
            
            // 2. Préparer la liste d'IDs
            let ids;
            if (typeof idsResult.value === 'string') {
                ids = idsResult.value;
            } else if (Array.isArray(idsResult.value)) {
                ids = idsResult.value.join(',');
            }
            
            // Si aucun ID valide
            if (!ids || ids === '') {
                return { value: 0, format: "#,##0.00" };
            }
            
            // Limiter le nombre d'IDs seulement si vraiment excessif
            const maxIds = 2000; // Augmentation significative de la limite
            if (ids.includes(',')) {
                const idArray = ids.split(',');
                if (idArray.length > maxIds) {
                    console.log(`SUM_BY_DOMAIN: Attention - ${idArray.length} IDs trouvés, la performance peut être affectée.`);
                    // On ne limite plus les IDs - mais on log un avertissement
                    // ids = idArray.slice(0, maxIds).join(',');
                }
            }
            
            // 3. Sommer les valeurs - méthode manuelle si sumRecords n'est pas disponible ou échoue
            let manualCalculation = false;
            
            // Vérifier si sumRecords existe
            if (!this.getters.sumRecords) {
                manualCalculation = true;
            } else {
                // Essayer d'utiliser sumRecords (méthode standard)
                try {
                    const sumResult = this.getters.sumRecords(_model, _field, ids);
                    
                    // Si on a besoin d'un refresh, on va essayer le calcul manuel
                    if (sumResult.requiresRefresh) {
                        manualCalculation = true;
                    } else {
                        // Si le résultat est vide ou égal à 0, vérifier si c'est un vrai 0 ou un problème
                        if ((!sumResult.value && sumResult.value !== 0) || 
                            (sumResult.value === 0 && ids.split(',').length > 5)) {
                            // Si on a beaucoup d'IDs mais un résultat de 0, c'est suspect - essayer en manuel
                            manualCalculation = true;
                        } else {
                            // Sinon on retourne la valeur formatée de sumRecords
                            return {
                                value: sumResult.value,
                                format: "#,##0.00", // Format nombre avec 2 décimales
                            };
                        }
                    }
                } catch (sumError) {
                    manualCalculation = true;
                }
            }
            
            // Calcul manuel si nécessaire
            if (manualCalculation) {
                let total = 0;
                let count = 0;
                
                // Récupérer les IDs sous forme de tableau
                const idArray = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
                
                // Calculer la somme manuellement
                for (const id of idArray) {
                    try {
                        const val = this.getters.getFieldValue(_model, id, _field);
                        if (typeof val === 'number') {
                            total += val;
                            count++;
                        } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
                            total += parseFloat(val);
                            count++;
                        }
                    } catch (e) {
                        // Ignorer les erreurs sur les valeurs individuelles
                    }
                }
                
                return {
                    value: total,
                    format: "#,##0.00",
                };
            }
            
        } catch (error) {
            return { value: 0, format: "#,##0.00" };
        }
    }
});

functionRegistry.add("IROKOO.COUNT_BY_DOMAIN", {
    description: _t("Count records matching a domain"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'sale.order')")),
        arg("filters (string)", _t("Filters separated by semicolons (e.g. 'partner_id=10;state=posted')")),
    ],
    category: "Odoo",
    returns: ["NUMBER"],
    compute: function (model, filters) {
        const _model = toString(model);
        const filtersStr = toString(filters);
        
        // Construire le domaine à partir de la chaîne de filtres
        const domain = [];
        
        // Traiter les filtres
        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');
            
            console.log(`COUNT_BY_DOMAIN - Processing ${filterArray.length} filters from: ${filtersStr}`);
            
            for (const filter of filterArray) {
                const trimmedFilter = filter.trim();
                
                // Debug logging for each filter
                console.log(`COUNT_BY_DOMAIN - Processing filter: "${trimmedFilter}"`);
                
                // Support for explicit format "field:operator:value"
                if (trimmedFilter.includes(':')) {
                    const parts = trimmedFilter.split(':');
                    if (parts.length >= 3) {
                        const field = parts[0].trim();
                        const operator = parts[1].trim();
                        const valueStr = parts.slice(2).join(':').trim();
                        
                        // Support for "in" operator with comma-separated values
                        if (operator.toLowerCase() === 'in' && valueStr.includes(',')) {
                            const values = valueStr.split(',').map(v => v.trim());
                            domain.push([field, 'in', values]);
                        } else {
                            // Try to convert to number if possible
                            const parsedValue = !isNaN(Number(valueStr)) ? Number(valueStr) : valueStr;
                            domain.push([field, operator, parsedValue]);
                        }
                        continue; // Skip further processing for this filter
                    }
                }
                
                // Fix: Handle date comparison operators correctly
                if (trimmedFilter.includes('>')) {
                    const parts = trimmedFilter.split('>');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('>').trim();
                    
                    // Special handling for date fields
                    const isDateField = (field.includes('date') || field.endsWith('_at') || field.endsWith('_on'));
                    console.log(`COUNT_BY_DOMAIN - Detected field "${field}" with > operator, isDateField: ${isDateField}`);
                    
                    domain.push([field, '>', value]);
                    continue;
                }
                
                if (trimmedFilter.includes('<')) {
                    const parts = trimmedFilter.split('<');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('<').trim();
                    
                    // Special handling for date fields
                    const isDateField = (field.includes('date') || field.endsWith('_at') || field.endsWith('_on'));
                    console.log(`COUNT_BY_DOMAIN - Detected field "${field}" with < operator, isDateField: ${isDateField}`);
                    
                    domain.push([field, '<', value]);
                    continue;
                }
                
                // Legacy support for field=value format
                else if (trimmedFilter.includes('=')) {
                    const [field, value] = trimmedFilter.split('=').map(s => s.trim());
                    // Try to convert numeric values for proper domain construction
                    const parsedValue = !isNaN(Number(value)) ? Number(value) : value;
                    domain.push([field, '=', parsedValue]);
                    continue;
                }
                
                // Format with other operators - réutiliser la fonction parseFilter de SUM_BY_DOMAIN
                const domainItem = parseFilter(trimmedFilter);
                if (domainItem) {
                    domain.push(domainItem);
                }
            }
        }
        
        console.log("COUNT_BY_DOMAIN - Final domain:", JSON.stringify(domain));
        
        try {
            // Initialisation avec l'utilisateur courant pour établir le contexte de sécurité
            try {
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "name");
                        } catch (e) {
                            // Ignorer
                        }
                    }
                }
            } catch (initError) {
                console.log("Erreur d'initialisation:", initError);
            }
            
            // 1. Récupérer les IDs correspondant au domaine
            const idsResult = this.getters.searchRecords(_model, domain, {});
            
            // Si données en cours de chargement
            if (idsResult.requiresRefresh) {
                return { value: 0, format: "#,##0" };
            }
            
            // Si aucun résultat
            if (!idsResult.value || 
                (Array.isArray(idsResult.value) && !idsResult.value.length) || 
                (typeof idsResult.value === 'string' && !idsResult.value.trim())) {
                return { value: 0, format: "#,##0" };
            }
            
            // 2. Compter les IDs
            let count = 0;
            if (typeof idsResult.value === 'string') {
                // Si c'est une chaîne, compter les virgules + 1
                const trimmedValue = idsResult.value.trim();
                count = trimmedValue ? trimmedValue.split(',').length : 0;
            } else if (Array.isArray(idsResult.value)) {
                // Si c'est un tableau, prendre sa longueur
                count = idsResult.value.length;
            }
            
            return {
                value: count,
                format: "#,##0", // Format nombre entier sans décimales
            };
            
        } catch (error) {
            console.error("COUNT_BY_DOMAIN - Error:", error);
            return { value: 0, format: "#,##0" };
        }
    }
});


