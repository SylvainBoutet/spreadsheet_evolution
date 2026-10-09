/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import * as spreadsheet from "@odoo/o-spreadsheet";
import { EvaluationError } from "@odoo/o-spreadsheet";
import { debugLog, NO_RESULTS } from "./utils";

const { functionRegistry } = spreadsheet.registries;
const { arg, toString, toNumber } = spreadsheet.helpers;

/**
 * Odoo 17: the functions returning a value and its format are declared with
 * computeValueAndFormat, whose arguments are {value, format} objects.
 * The wrapped function receives the values only.
 */
function withArgValues(compute) {
    return function (...args) {
        return compute.apply(this, args.map((argument) => argument?.value));
    };
}

/**
 * Parse a single filter of IROKOO.SUM_BY_DOMAIN and IROKOO.COUNT_BY_DOMAIN
 * into a domain condition (numeric values are converted to numbers).
 *
 * @param {string} filterStr
 * @returns {Array|null}
 */
function parseDomainFilter(filterStr) {
    if (!filterStr || typeof filterStr !== 'string') return null;

    filterStr = filterStr.trim();
    if (filterStr === '') return null;

    let field, operator, value;

    // Explicit format "field:operator:value"
    if (filterStr.includes(':')) {
        const parts = filterStr.split(':');
        if (parts.length >= 3) {
            field = parts[0].trim();
            operator = parts[1].trim();
            value = parts.slice(2).join(':').trim(); // The value may contain ":" too

            // "in" operator with comma-separated values
            if (operator.toLowerCase() === 'in' && value.includes(',')) {
                const values = value.split(',').map(v => v.trim());
                return [field, 'in', values];
            }

            // Convert to a number when possible
            if (!isNaN(parseFloat(value))) {
                value = parseFloat(value);
            }

            return [field, operator, value];
        }
    }

    // Format "field~value" for ilike (legacy format)
    if (filterStr.includes('~')) {
        const parts = filterStr.split('~');
        field = parts[0].trim();
        value = parts.slice(1).join('~').trim();
        return [field, 'ilike', value];
    }

    // Detect a LIKE/ILIKE search with %
    const hasPercentage = filterStr.includes('%');

    // Format "field=value" (or ILIKE when the value contains %)
    if (filterStr.includes('=')) {
        const parts = filterStr.split('=');
        field = parts[0].trim();
        value = parts.slice(1).join('=').trim(); // The value may contain "=" too

        if (hasPercentage && value.includes('%')) {
            operator = 'ilike';
        } else {
            operator = '=';
        }

        // Convert to a number when possible
        if (!isNaN(parseFloat(value))) {
            value = parseFloat(value);
        }

        return [field, operator, value];
    }

    // Format "field>value" or "field<value"
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

    // Format "field!=value" or "field!value"
    if (filterStr.includes('!=')) {
        const parts = filterStr.split('!=');
        field = parts[0].trim();
        value = parts.slice(1).join('!=').trim();

        // Convert to a number when possible
        if (!isNaN(parseFloat(value))) {
            value = parseFloat(value);
        }

        return [field, '!=', value];
    } else if (filterStr.includes('!')) {
        const parts = filterStr.split('!');
        field = parts[0].trim();
        value = parts.slice(1).join('!').trim();

        // Convert to a number when possible
        if (!isNaN(parseFloat(value))) {
            value = parseFloat(value);
        }

        return [field, '!=', value];
    }

    return null;
}

functionRegistry.add("IROKOO.GET_FIELD", {
    description: _t("Get a field value from any record"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'res.partner')")),
        arg("id (number)", _t("The record ID")),
        arg("field (string)", _t("The technical field name")),
    ],
    category: "Odoo",
    returns: ["STRING"],
    computeValueAndFormat: withArgValues(function (model, id, field) {
        const _model = toString(model);
        const _id = toNumber(id, this.locale);
        const _field = toString(field);

        if (!_model || !_id || !_field) {
            throw new EvaluationError("#ERROR", _t("All parameters are required"));
        }

        // Safe initialization that works for any user
        try {
            if (this.getters && this.getters.getFieldValue) {
                // First get access to the server data to prime the system
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();

                    // When available, try to read the current user ID
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "id");
                            debugLog(`GET_FIELD - Initialization with current user ID=${serverData.user.id}`);
                        } catch (innerE) {
                            // Ignore failures
                        }
                    }
                }

                // Also try directly with the requested model
                try {
                    // Search an existing and accessible ID in the requested model
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
                            debugLog(`GET_FIELD - Initialization with ${_model} ID=${firstId}`);
                        }
                    }
                } catch (modelE) {
                    // Ignore failures
                }
            }
        } catch (e) {
            // Ignore errors
        }

        const value = this.getters.getFieldValue(_model, _id, _field);
        // Odoo 17 does not apply the text format "@" to numbers: give the number as text
        return {
            value: typeof value === "number" ? String(value) : value,
            format: "@",
        };
    }),
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
    computeValueAndFormat: withArgValues(function (model, order, direction, limit, filters) {
        // Convert the arguments
        const _model = toString(model);
        const orderField = toString(order);
        const orderDirection = toString(direction);
        const _limit = toNumber(limit, this.locale);
        const filtersStr = toString(filters);

        // Build the domain from the filters string
        const domain = [];

        // Parse a single filter
        function parseFilter(filterStr) {
            if (!filterStr || typeof filterStr !== 'string') return null;

            filterStr = filterStr.trim();
            if (filterStr === '') return null;

            let field, operator, value;

            // Explicit format "field:operator:value"
            if (filterStr.includes(':')) {
                const parts = filterStr.split(':');
                if (parts.length >= 3) {
                    field = parts[0].trim();
                    operator = parts[1].trim();
                    value = parts.slice(2).join(':').trim(); // The value may contain ":" too
                    return [field, operator, value];
                }
            }

            // Format "field~value" for ilike (legacy format)
            if (filterStr.includes('~')) {
                const parts = filterStr.split('~');
                field = parts[0].trim();
                value = parts.slice(1).join('~').trim();
                return [field, 'ilike', value];
            }

            // Detect a LIKE/ILIKE search with %
            const hasPercentage = filterStr.includes('%');

            // Format "field=value" (or ILIKE when the value contains %)
            if (filterStr.includes('=')) {
                const parts = filterStr.split('=');
                field = parts[0].trim();
                value = parts.slice(1).join('=').trim(); // The value may contain "=" too

                if (hasPercentage && value.includes('%')) {
                    operator = 'ilike';
                } else {
                    operator = '=';
                }

                return [field, operator, value];
            }

            // Format "field>value" or "field<value"
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

            // Format "field!=value" or "field!value"
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

        // Split the filters string into single filters (separated by semicolons)
        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');

            for (const filter of filterArray) {
                const domainItem = parseFilter(filter);
                if (domainItem) {
                    domain.push(domainItem);
                }
            }
        }

        // Safe initialization that works for any user
        try {
            if (this.getters && this.getters.getFieldValue) {
                // First get access to the server data to prime the system
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();

                    // When available, try to read the current user ID
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "id");
                            debugLog(`GET_IDS - Initialization with current user ID=${serverData.user.id}`);
                        } catch (innerE) {
                            // Ignore failures
                        }
                    }
                }

                // Also try directly with the requested model and a generic ID
                try {
                    // Search an existing and accessible ID in the requested model
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
                            debugLog(`GET_IDS - Initialization with ${_model} ID=${firstId}`);
                        }
                    }
                } catch (modelE) {
                    // Ignore failures
                }
            }
        } catch (e) {
            // Ignore errors
        }

        try {
            const result = this.getters.searchRecords(_model, domain, {
                order: [[orderField, orderDirection]],
                limit: _limit > 0 ? _limit : false
            });

            if (!result.value) {
                // No result while sorting: the sort field may be a non-stored computed field
                if (orderField && orderField !== 'id' && orderField !== 'name') {
                    // Try without sorting to check whether the sort causes the problem
                    const testResult = this.getters.searchRecords(_model, domain, { limit: 1 });
                    if (testResult.value) {
                        // Results without sorting: the sort field is the problem
                        throw new EvaluationError("#ERROR", _t("Unable to sort by field '") + orderField + _t("'. It might be a computed field or not exist on the model. Please use a different field for sorting or try IROKOO.GET_GROUPED_IDS for aggregations."));
                    }
                }

                return {
                    value: NO_RESULTS,
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
            // Errors coming from elsewhere (API, etc.) are converted into EvaluationError
            if (!(error instanceof EvaluationError)) {
                throw new EvaluationError("#ERROR", _t("Error while executing search: ") + error.message);
            }
            throw error;
        }
    }),
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
    computeValueAndFormat: withArgValues(function (model, field, ids) {
        const _model = toString(model);
        const _field = toString(field);
        const idsStr = toString(ids);

        // GET_IDS returned its "no results" message
        if (idsStr === NO_RESULTS) {
            return {
                value: "No results to sum",
                format: "@",
                requiresRefresh: false
            };
        }

        // Safe initialization that works for any user
        try {
            if (this.getters && this.getters.getFieldValue) {
                // First get access to the server data to prime the system
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();

                    // When available, try to read the current user ID
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "id");
                            debugLog(`GET_SUM - Initialization with current user ID=${serverData.user.id}`);
                        } catch (innerE) {
                            // Ignore failures
                        }
                    }
                }

                // First try with an ID of the given list
                try {
                    // Take the first ID of the list when possible
                    const firstId = idsStr.split(',')[0];
                    if (firstId && !isNaN(parseInt(firstId))) {
                        this.getters.getFieldValue(_model, parseInt(firstId), "id");
                        debugLog(`GET_SUM - Initialization with ${_model} ID=${firstId}`);
                    } else {
                        // Otherwise try with a basic search
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
                                debugLog(`GET_SUM - Initialization with ${_model} ID=${availableId}`);
                            }
                        }
                    }
                } catch (innerError) {
                    // Not a problem if this fails
                    debugLog(`GET_SUM - Initialization failed:`, innerError);
                }
            }
        } catch (e) {
            // Ignore errors
        }

        const result = this.getters.sumRecords(_model, _field, idsStr);

        // Propagate the refresh request
        if (result.requiresRefresh) {
            return { value: result.value, requiresRefresh: true };
        }

        // Empty result: display a message
        if (!result.value && result.value !== 0) {
            return {
                value: "No values to sum",
                format: "@",
                requiresRefresh: false
            };
        }

        // Otherwise return the formatted value
        return {
            value: result.value,
            format: "#,##0.00", // Number format with 2 decimals
        };
    }),
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
    computeValueAndFormat: withArgValues(function (model, group_by, aggregate_field, aggregate_function, filters, limit) {
        debugLog("GET_GROUPED_IDS - Starting with model:", model);

        // Convert arguments
        const _model = toString(model);
        const _group_by = toString(group_by);
        const _aggregate_field = toString(aggregate_field);
        const _aggregate_function = toString(aggregate_function).toLowerCase();
        const filtersStr = toString(filters || "");
        const _limit = Number.isNaN(toNumber(limit, this.locale)) ? 0 : toNumber(limit, this.locale);

        // Cache keyed on the parameters to avoid redundant requests
        const cacheKey = `${_model}_${_group_by}_${_aggregate_field}_${_aggregate_function}_${filtersStr}_${_limit}`;

        // Create the cache if needed
        if (!this._groupedIdsCache) {
            this._groupedIdsCache = {};
        }

        // Use the cached result when available
        if (this._groupedIdsCache[cacheKey] &&
            this._groupedIdsCache[cacheKey].timestamp > Date.now() - 30000) { // 30 seconds cache
            debugLog("GET_GROUPED_IDS - Using cached result for:", cacheKey);
            return this._groupedIdsCache[cacheKey].result;
        }

        // Build domain from filter string
        const domain = [];

        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');

            debugLog(`GET_GROUPED_IDS - Processing ${filterArray.length} filters from: ${filtersStr}`);

            for (const filter of filterArray) {
                const trimmedFilter = filter.trim();

                debugLog(`GET_GROUPED_IDS - Processing filter: "${trimmedFilter}"`);

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

                // Handle comparison operators
                if (trimmedFilter.includes('>')) {
                    const parts = trimmedFilter.split('>');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('>').trim();
                    debugLog(`GET_GROUPED_IDS - Detected field "${field}" with > operator`);
                    domain.push([field, '>', value]);
                    continue;
                }

                if (trimmedFilter.includes('<')) {
                    const parts = trimmedFilter.split('<');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('<').trim();
                    debugLog(`GET_GROUPED_IDS - Detected field "${field}" with < operator`);
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

        debugLog("GET_GROUPED_IDS - Final domain:", JSON.stringify(domain));

        try {
            // Main search to get all records
            const result = this.getters.searchRecords(_model, domain, { limit: 2000 });

            // Loading state management
            if (result.requiresRefresh) {
                // Check whether usable partial data is available
                if (result.value && (typeof result.value === 'string' || (Array.isArray(result.value) && result.value.length > 0))) {
                    debugLog(`GET_GROUPED_IDS - Data loading, continuing with partial data`);

                    // Store this state in the cache as a partial result
                    const partialResult = {
                        value: Array.isArray(result.value) ? result.value.join(',') : result.value,
                        format: "@",
                        requiresRefresh: true
                    };

                    this._groupedIdsCache[cacheKey] = {
                        result: partialResult,
                        timestamp: Date.now() - 25000 // Quick expiration to force a refresh soon
                    };

                    // Continue with the partial data
                } else {
                    debugLog(`GET_GROUPED_IDS - Still loading data, no partial results available`);

                    // Return the cached result if any, otherwise a loading message
                    if (this._groupedIdsCache[cacheKey]) {
                        debugLog(`GET_GROUPED_IDS - Using cached result during refresh`);
                        const cachedResult = this._groupedIdsCache[cacheKey].result;
                        return {
                            value: cachedResult.value,
                            format: cachedResult.format,
                            requiresRefresh: true
                        };
                    }

                    const loadingResult = {
                        value: "Loading data...",
                        format: "@",
                        requiresRefresh: true
                    };

                    // Store this loading state in the cache
                    this._groupedIdsCache[cacheKey] = {
                        result: loadingResult,
                        timestamp: Date.now() - 25000 // Quick expiration
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
                return { value: NO_RESULTS, format: "@" };
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
                            // Some records were already processed: continue instead of reloading
                            if (Object.keys(groups).length > 0) {
                                debugLog(`GET_GROUPED_IDS - Loading error for record ${id}, continuing`);
                                continue;
                            }

                            // Otherwise request a refresh
                            debugLog(`GET_GROUPED_IDS - Loading error for group values, requesting refresh`);
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
                            // Some records were already processed: continue instead of reloading
                            if (Object.keys(groups).length > 0) {
                                debugLog(`GET_GROUPED_IDS - Loading error for record ${id}, continuing`);
                                continue;
                            }

                            // Otherwise request a refresh
                            debugLog(`GET_GROUPED_IDS - Loading error for aggregate values, requesting refresh`);
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
                        // Enough records processed: continue with what we have
                        if (Object.keys(groups).length >= Math.max(5, _limit)) {
                            debugLog(`GET_GROUPED_IDS - Loading error but enough groups, continuing`);
                            break;
                        }

                        // Some groups exist: continue with the next records
                        if (Object.keys(groups).length > 0) {
                            debugLog(`GET_GROUPED_IDS - Loading error for record ${id}, continuing with next record`);
                            continue;
                        }

                        debugLog(`GET_GROUPED_IDS - Loading error for record data, requesting refresh`);
                        return { value: "Loading record data...", format: "@", requiresRefresh: true };
                    }
                    // Otherwise just continue with next record
                    debugLog(`GET_GROUPED_IDS - Error processing record ID=${id}:`, recordError);
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
            debugLog("GET_GROUPED_IDS - Result:", groupValues);

            const finalResult = { value: groupValues.join(','), format: "@" };

            // Cache the result with a timestamp
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
                    debugLog(`GET_GROUPED_IDS - Loading data, using cached result`);
                    const cachedResult = this._groupedIdsCache[cacheKey].result;

                    return {
                        value: cachedResult.value,
                        format: cachedResult.format,
                        requiresRefresh: true
                    };
                }

                const loadingResult = {
                    value: "Loading data...",
                    format: "@",
                    requiresRefresh: true
                };

                // Store the loading state in the cache
                this._groupedIdsCache[cacheKey] = {
                    result: loadingResult,
                    timestamp: Date.now() - 25000 // Quick expiration
                };

                return loadingResult;
            }

            // Otherwise return error message
            debugLog("GET_GROUPED_IDS - Error:", e);
            const errorResult = { value: "Error: " + e.message, format: "@" };

            // Cache the error result briefly to prevent constant recalculation
            this._groupedIdsCache[cacheKey] = {
                result: errorResult,
                timestamp: Date.now() - 20000 // Cache for 10 seconds only
            };

            return errorResult;
        }
    }),
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
    computeValueAndFormat: withArgValues(function (model, field, filters) {
        const _model = toString(model);
        const _field = toString(field);
        const filtersStr = toString(filters);

        // Build the domain from the filters string
        const domain = [];

        // Process the filters
        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');

            debugLog(`SUM_BY_DOMAIN - Processing ${filterArray.length} filters from: ${filtersStr}`);

            for (const filter of filterArray) {
                const trimmedFilter = filter.trim();

                debugLog(`SUM_BY_DOMAIN - Processing filter: "${trimmedFilter}"`);

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

                // Handle comparison operators
                if (trimmedFilter.includes('>')) {
                    const parts = trimmedFilter.split('>');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('>').trim();
                    debugLog(`SUM_BY_DOMAIN - Detected field "${field}" with > operator`);
                    domain.push([field, '>', value]);
                    continue;
                }

                if (trimmedFilter.includes('<')) {
                    const parts = trimmedFilter.split('<');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('<').trim();
                    debugLog(`SUM_BY_DOMAIN - Detected field "${field}" with < operator`);
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
                const domainItem = parseDomainFilter(trimmedFilter);
                if (domainItem) {
                    domain.push(domainItem);
                }
            }
        }

        debugLog("SUM_BY_DOMAIN - Final domain:", JSON.stringify(domain));

        try {
            // Initialization with the current user to set the security context
            try {
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "name");
                        } catch (e) {
                            // Ignore
                        }
                    }
                }
            } catch (initError) {
                debugLog("Initialization error:", initError);
            }

            // 1. Get the IDs matching the domain
            const idsResult = this.getters.searchRecords(_model, domain, {
                // No limit, to take all records into account
                // No sorting needed for a sum
            });

            // Data still loading
            if (idsResult.requiresRefresh) {
                return { value: 0, format: "#,##0.00" };
            }

            // No result
            if (!idsResult.value ||
                (Array.isArray(idsResult.value) && !idsResult.value.length) ||
                (typeof idsResult.value === 'string' && !idsResult.value.trim())) {
                return { value: 0, format: "#,##0.00" };
            }

            // 2. Prepare the IDs list
            let ids;
            if (typeof idsResult.value === 'string') {
                ids = idsResult.value;
            } else if (Array.isArray(idsResult.value)) {
                ids = idsResult.value.join(',');
            }

            // No valid ID
            if (!ids || ids === '') {
                return { value: 0, format: "#,##0.00" };
            }

            // Only warn when the number of IDs is really large
            const maxIds = 2000;
            if (ids.includes(',')) {
                const idArray = ids.split(',');
                if (idArray.length > maxIds) {
                    debugLog(`SUM_BY_DOMAIN: ${idArray.length} IDs found, performance may be affected.`);
                }
            }

            // 3. Sum the values - manual computation if sumRecords is not available or fails
            let manualCalculation = false;

            // Check whether sumRecords exists
            if (!this.getters.sumRecords) {
                manualCalculation = true;
            } else {
                // Try sumRecords (standard method)
                try {
                    const sumResult = this.getters.sumRecords(_model, _field, ids);

                    // Refresh needed: try the manual computation
                    if (sumResult.requiresRefresh) {
                        manualCalculation = true;
                    } else {
                        // Empty or zero result: check whether it is a real 0 or a problem
                        if ((!sumResult.value && sumResult.value !== 0) ||
                            (sumResult.value === 0 && ids.split(',').length > 5)) {
                            // Many IDs but a result of 0 is suspicious: try the manual computation
                            manualCalculation = true;
                        } else {
                            // Otherwise return the formatted sumRecords value
                            return {
                                value: sumResult.value,
                                format: "#,##0.00", // Number format with 2 decimals
                            };
                        }
                    }
                } catch (sumError) {
                    manualCalculation = true;
                }
            }

            // Manual computation when needed
            if (manualCalculation) {
                let total = 0;

                // Get the IDs as an array
                const idArray = ids.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));

                // Compute the sum manually
                for (const id of idArray) {
                    try {
                        const val = this.getters.getFieldValue(_model, id, _field);
                        if (typeof val === 'number') {
                            total += val;
                        } else if (typeof val === 'string' && !isNaN(parseFloat(val))) {
                            total += parseFloat(val);
                        }
                    } catch (e) {
                        // Ignore errors on single values
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
    }),
});

functionRegistry.add("IROKOO.COUNT_BY_DOMAIN", {
    description: _t("Count records matching a domain"),
    args: [
        arg("model (string)", _t("The technical model name (e.g. 'sale.order')")),
        arg("filters (string)", _t("Filters separated by semicolons (e.g. 'partner_id=10;state=posted')")),
    ],
    category: "Odoo",
    returns: ["NUMBER"],
    computeValueAndFormat: withArgValues(function (model, filters) {
        const _model = toString(model);
        const filtersStr = toString(filters);

        // Build the domain from the filters string
        const domain = [];

        // Process the filters
        if (filtersStr && filtersStr.trim() !== '') {
            const filterArray = filtersStr.split(';');

            debugLog(`COUNT_BY_DOMAIN - Processing ${filterArray.length} filters from: ${filtersStr}`);

            for (const filter of filterArray) {
                const trimmedFilter = filter.trim();

                debugLog(`COUNT_BY_DOMAIN - Processing filter: "${trimmedFilter}"`);

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

                // Handle comparison operators
                if (trimmedFilter.includes('>')) {
                    const parts = trimmedFilter.split('>');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('>').trim();
                    debugLog(`COUNT_BY_DOMAIN - Detected field "${field}" with > operator`);
                    domain.push([field, '>', value]);
                    continue;
                }

                if (trimmedFilter.includes('<')) {
                    const parts = trimmedFilter.split('<');
                    const field = parts[0].trim();
                    const value = parts.slice(1).join('<').trim();
                    debugLog(`COUNT_BY_DOMAIN - Detected field "${field}" with < operator`);
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

                // Format with other operators (same parsing as IROKOO.SUM_BY_DOMAIN)
                const domainItem = parseDomainFilter(trimmedFilter);
                if (domainItem) {
                    domain.push(domainItem);
                }
            }
        }

        debugLog("COUNT_BY_DOMAIN - Final domain:", JSON.stringify(domain));

        try {
            // Initialization with the current user to set the security context
            try {
                if (this.getters.getOdooServerData) {
                    const serverData = this.getters.getOdooServerData();
                    if (serverData && serverData.user && serverData.user.id) {
                        try {
                            this.getters.getFieldValue("res.users", serverData.user.id, "name");
                        } catch (e) {
                            // Ignore
                        }
                    }
                }
            } catch (initError) {
                debugLog("Initialization error:", initError);
            }

            // 1. Get the IDs matching the domain
            const idsResult = this.getters.searchRecords(_model, domain, {});

            // Data still loading
            if (idsResult.requiresRefresh) {
                return { value: 0, format: "#,##0" };
            }

            // No result
            if (!idsResult.value ||
                (Array.isArray(idsResult.value) && !idsResult.value.length) ||
                (typeof idsResult.value === 'string' && !idsResult.value.trim())) {
                return { value: 0, format: "#,##0" };
            }

            // 2. Count the IDs
            let count = 0;
            if (typeof idsResult.value === 'string') {
                // String: number of commas + 1
                const trimmedValue = idsResult.value.trim();
                count = trimmedValue ? trimmedValue.split(',').length : 0;
            } else if (Array.isArray(idsResult.value)) {
                // Array: its length
                count = idsResult.value.length;
            }

            return {
                value: count,
                format: "#,##0", // Integer number format
            };

        } catch (error) {
            debugLog("COUNT_BY_DOMAIN - Error:", error);
            return { value: 0, format: "#,##0" };
        }
    }),
});
