/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import * as spreadsheet from "@odoo/o-spreadsheet";
import { EvaluationError } from "@odoo/o-spreadsheet";
import { session } from "@web/session";

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
        
        // Build domain from filter string
        const domain = [];
        
        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');
            
            for (const filter of filterArray) {
                const trimmedFilter = filter.trim();
                
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
        
        // Initialize API to ensure correct data access - this is crucial for reliability
        try {
            // First try to get server data through the API
            if (this.getters && this.getters.getOdooServerData) {
                const serverData = this.getters.getOdooServerData();
                
                // If available, try to access current user information
                if (serverData && serverData.user && serverData.user.id) {
                    try {
                        // Access user data to initialize API - this is critical for non-admin users
                        this.getters.getFieldValue("res.users", serverData.user.id, "id");
                        console.log(`GET_GROUPED_IDS - Initialized with current user ID=${serverData.user.id}`);
                        
                        // Check if we're dealing with a superuser (admin)
                        // This is just for logging, we handle all users the same
                        if (serverData.user.id === 1) {
                            console.log(`GET_GROUPED_IDS - Running as superuser`);
                        }
                    } catch (e) {
                        // Ignore errors but log them
                        console.log(`GET_GROUPED_IDS - Initialization with user failed:`, e);
                    }
                }
            }
            
            // Try a preliminary search to find an accessible record
            // This ensures that searchRecords will work properly when called later
            try {
                const preSearch = this.getters.searchRecords(_model, [["id", ">", "0"]], { limit: 1 });
                
                // Check if we need to wait for data to load
                if (preSearch.requiresRefresh) {
                    return { value: "Loading initial data...", format: "@", requiresRefresh: true };
                }
                
                // Process the returned value to get the first ID
                let firstId = null;
                if (typeof preSearch.value === 'string' && preSearch.value) {
                    firstId = parseInt(preSearch.value.split(',')[0]);
                } else if (Array.isArray(preSearch.value) && preSearch.value.length > 0) {
                    firstId = parseInt(preSearch.value[0]);
                }
                
                // If we found an ID, pre-initialize API by accessing that record
                if (firstId) {
                    this.getters.getFieldValue(_model, firstId, "id");
                    console.log(`GET_GROUPED_IDS - Initialized with ${_model} ID=${firstId}`);
                    
                    // Also pre-load the fields we'll be using for better performance
                    try {
                        this.getters.getFieldValue(_model, firstId, _group_by);
                    } catch (fieldError) {
                        // Ignore but log field loading errors
                        console.log(`GET_GROUPED_IDS - Pre-loading group_by field failed:`, fieldError);
                    }
                    
                    try {
                        this.getters.getFieldValue(_model, firstId, _aggregate_field);
                    } catch (fieldError) {
                        // Ignore but log field loading errors
                        console.log(`GET_GROUPED_IDS - Pre-loading aggregate field failed:`, fieldError);
                    }
                } else {
                    console.log(`GET_GROUPED_IDS - No accessible records found`);
                }
            } catch (e) {
                // Ignore errors but log them
                console.log(`GET_GROUPED_IDS - Pre-search failed:`, e);
            }
        } catch (e) {
            // Ignore global initialization errors but log them
            console.log(`GET_GROUPED_IDS - Global initialization failed:`, e);
        }
        
        try {
            // Main search to get all records
            const result = this.getters.searchRecords(_model, domain, { limit: 1000 });
            
            // If data is still loading, return a loading indicator
            if (result.requiresRefresh) {
                return { value: "Loading...", format: "@", requiresRefresh: true };
            }
            
            // Process IDs - handle both string and array formats
            let ids = [];
            
            if (typeof result.value === 'string') {
                ids = result.value.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            } else if (Array.isArray(result.value)) {
                ids = result.value.map(id => parseInt(id)).filter(id => !isNaN(id));
            }
            
            if (!ids.length) {
                return { value: "No results found", format: "@" };
            }
            
            // Group records by the specified field
            const groups = {};
            
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
                            return { value: "Loading group values...", format: "@", requiresRefresh: true };
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
                            return { value: "Loading aggregate values...", format: "@", requiresRefresh: true };
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
                        return { value: "Loading record data...", format: "@", requiresRefresh: true };
                    }
                    // Otherwise just continue with next record
                    console.log(`GET_GROUPED_IDS - Error processing record ID=${id}:`, recordError);
                    continue;
                }
            }
            
            // If no groups were created
            if (Object.keys(groups).length === 0) {
                return { value: "No groups found", format: "@" };
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
            
            return { value: groupValues.join(','), format: "@" };
            
        } catch (e) {
            // Global error handler
            
            // If data is still loading, return loading indicator
            if (e.name === "LoadingDataError" || (e.message && e.message.includes("Loading"))) {
                return { value: "Loading data...", format: "@", requiresRefresh: true };
            }
            
            // Otherwise return error message
            return { value: "Error: " + e.message, format: "@" };
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
                
                // Tenter de convertir en nombre si possible
                if (!isNaN(parseFloat(value))) {
                    value = parseFloat(value);
                }
                
                return [field, '>', value];
            }
            
            if (filterStr.includes('<')) {
                const parts = filterStr.split('<');
                field = parts[0].trim();
                value = parts.slice(1).join('<').trim();
                
                // Tenter de convertir en nombre si possible
                if (!isNaN(parseFloat(value))) {
                    value = parseFloat(value);
                }
                
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
            
            for (const filter of filterArray) {
                const domainItem = parseFilter(filter);
                if (domainItem) {
                    domain.push(domainItem);
                }
            }
        }
        
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


