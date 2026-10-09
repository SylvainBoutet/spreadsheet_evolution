/** @odoo-module */

import { registry } from "@web/core/registry";

/**
 * Return the spreadsheet model of the dashboard displayed by the dashboard action.
 */
function getDisplayedDashboardModel() {
    const stack = [odoo.__WOWL_DEBUG__.root.__owl__];
    while (stack.length) {
        const node = stack.pop();
        const component = node.component;
        if (component?.loader) {
            const dashboard = component.loader.getActiveDashboard
                ? component.loader.getActiveDashboard()
                : component.state?.activeDashboard;
            if (dashboard?.model) {
                return dashboard.model;
            }
        }
        stack.push(...Object.values(node.children || {}));
    }
    return undefined;
}

/**
 * Column B holds the IROKOO formulas, column C the expected results (same format).
 * Return the rows whose result differs from the expected one.
 */
function getMismatches(model) {
    const sheetId = model.getters.getActiveSheetId();
    const mismatches = [];
    for (let row = 1; row < 100; row++) {
        if (!model.getters.getCell({ sheetId, col: 1, row })) {
            break;
        }
        const result = model.getters.getEvaluatedCell({ sheetId, col: 1, row });
        const expected = model.getters.getEvaluatedCell({ sheetId, col: 2, row });
        // Compare the values as displayed, with their format
        if (result.type === "error" || result.formattedValue !== expected.formattedValue) {
            mismatches.push(
                `B${row + 1}: got "${result.formattedValue}"${result.message ? ` (${result.message})` : ""}, expected "${expected.formattedValue}"`
            );
        }
    }
    return mismatches;
}

/**
 * Open a dashboard from the side panel and check that every IROKOO formula
 * displays the expected result.
 */
function checkDashboardSteps(dashboardName) {
    return [
        {
            content: `Open the dashboard "${dashboardName}"`,
            trigger: `.o_search_panel_category_value[data-name="${dashboardName}"]`,
            run: "click",
        },
        {
            content: "The dashboard is selected",
            trigger: `.o_search_panel_category_value.active[data-name="${dashboardName}"]`,
        },
        {
            content: "The dashboard grid is rendered",
            trigger: ".o_spreadsheet_dashboard_action canvas",
        },
        {
            content: "Every IROKOO formula displays the expected result",
            trigger: ".o_spreadsheet_dashboard_action canvas",
            async run() {
                let mismatches = ["dashboard model not found"];
                for (let i = 0; i < 40; i++) {
                    const model = getDisplayedDashboardModel();
                    if (model && model.getters.getSheetName(model.getters.getActiveSheetId()) === dashboardName) {
                        mismatches = getMismatches(model);
                        if (!mismatches.length) {
                            return;
                        }
                    }
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
                throw new Error(`${dashboardName}: ${mismatches.join("; ")}`);
            },
        },
    ];
}

registry.category("web_tour.tours").add("spreadsheet_extension_dashboard_tour", {
    url: "/odoo/dashboards",
    steps: () => [
        ...checkDashboardSteps("IROKOO formulas test"),
        ...checkDashboardSteps("IROKOO formulas examples check"),
    ],
});
