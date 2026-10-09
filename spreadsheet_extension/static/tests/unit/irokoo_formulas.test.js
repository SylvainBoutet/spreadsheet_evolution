/** @odoo-module */

import { nextTick } from "@web/../tests/helpers/utils";
import { setCellContent } from "@spreadsheet/../tests/utils/commands";
import { getEvaluatedCell } from "@spreadsheet/../tests/utils/getters";
import { createModelWithDataSource } from "@spreadsheet/../tests/utils/model";

function getServerData() {
    return {
        models: {
            "irk.product": {
                fields: {
                    name: { string: "Name", type: "char" },
                },
                records: [
                    { id: 37, display_name: "xphone", name: "xphone" },
                    { id: 41, display_name: "xpad", name: "xpad" },
                ],
            },
            "irk.partner": {
                fields: {
                    name: { string: "Name", type: "char" },
                    foo: { string: "Foo", type: "integer" },
                    probability: { string: "Probability", type: "float" },
                    product_id: { string: "Product", type: "many2one", relation: "irk.product" },
                },
                records: [
                    { id: 1, display_name: "A", name: "A", foo: 12, probability: 10, product_id: 37 },
                    { id: 2, display_name: "B", name: "B", foo: 1, probability: 11, product_id: 41 },
                    { id: 3, display_name: "C", name: "C", foo: 17, probability: 95, product_id: 41 },
                    { id: 4, display_name: "D", name: "D", foo: 2, probability: 15, product_id: 41 },
                ],
            },
        },
        views: {},
    };
}

function createModel() {
    return createModelWithDataSource({ serverData: getServerData() });
}

/**
 * The formulas fetch their data asynchronously: let the mocked server answer
 * and the spreadsheet re-evaluate until no request is pending anymore.
 */
async function waitForFormulasData(model) {
    const dataSources = model.config.custom.dataSources;
    let idleTicks = 0;
    for (let i = 0; i < 50 && idleTicks < 3; i++) {
        await nextTick();
        idleTicks = dataSources.pendingPromises.size ? 0 : idleTicks + 1;
    }
}

/**
 * Evaluate a formula in A1 and return its result, with the error message if any.
 */
async function evaluateFormula(formula) {
    const model = await createModel();
    setCellContent(model, "A1", formula);
    await waitForFormulasData(model);
    const cell = getEvaluatedCell(model, "A1");
    return cell.type === "error" ? `${cell.value}: ${cell.error.message}` : cell.value;
}

QUnit.module("IROKOO formulas", {}, () => {
    QUnit.test("IROKOO.GET_FIELD returns a field value", async (assert) => {
        // The result is formatted as text
        assert.strictEqual(
            await evaluateFormula('=IROKOO.GET_FIELD("irk.partner", 1, "foo")'),
            "12"
        );
    });

    QUnit.test("IROKOO.GET_FIELD returns the id of a many2one field", async (assert) => {
        assert.strictEqual(
            await evaluateFormula('=IROKOO.GET_FIELD("irk.partner", 2, "product_id")'),
            "41"
        );
    });

    QUnit.test("IROKOO.GET_FIELD requires all its parameters", async (assert) => {
        assert.strictEqual(
            await evaluateFormula('=IROKOO.GET_FIELD("irk.partner", 0, "foo")'),
            "#ERROR: All parameters are required"
        );
    });

    QUnit.test("IROKOO.GET_IDS returns the ids matching the filters, sorted", async (assert) => {
        assert.strictEqual(
            await evaluateFormula('=IROKOO.GET_IDS("irk.partner", "foo", "asc", 0, "product_id=41")'),
            "2,4,3"
        );
    });

    QUnit.test("IROKOO.GET_IDS applies the limit and the direction", async (assert) => {
        // The mocked server only understands the upper case direction
        assert.strictEqual(
            await evaluateFormula('=IROKOO.GET_IDS("irk.partner", "foo", "DESC", 2, "product_id=41")'),
            "3,4"
        );
    });

    QUnit.test("IROKOO.GET_IDS displays a message when nothing matches", async (assert) => {
        assert.strictEqual(
            await evaluateFormula('=IROKOO.GET_IDS("irk.partner", "id", "asc", 0, "foo>100")'),
            "No results found"
        );
    });

    QUnit.test("IROKOO.GET_SUM sums a field for a list of ids", async (assert) => {
        assert.strictEqual(
            await evaluateFormula('=IROKOO.GET_SUM("irk.partner", "foo", "1,3")'),
            29
        );
    });

    QUnit.test("IROKOO.GET_SUM sums a field for the ids returned by IROKOO.GET_IDS", async (assert) => {
        const model = await createModel();
        setCellContent(model, "A1", '=IROKOO.GET_IDS("irk.partner", "id", "asc", 0, "product_id=41")');
        setCellContent(model, "A2", '=IROKOO.GET_SUM("irk.partner", "foo", A1)');
        await waitForFormulasData(model);
        assert.strictEqual(getEvaluatedCell(model, "A1").value, "2,3,4");
        assert.strictEqual(getEvaluatedCell(model, "A2").value, 20);
        assert.strictEqual(getEvaluatedCell(model, "A2").format, "#,##0.00");
    });

    QUnit.test("IROKOO.GET_GROUPED_IDS groups and sorts by the aggregated value", async (assert) => {
        assert.strictEqual(
            await evaluateFormula(
                '=IROKOO.GET_GROUPED_IDS("irk.partner", "product_id", "foo", "sum", "", 0)'
            ),
            "41,37"
        );
    });

    QUnit.test("IROKOO.GET_GROUPED_IDS counts and applies the limit", async (assert) => {
        assert.strictEqual(
            await evaluateFormula(
                '=IROKOO.GET_GROUPED_IDS("irk.partner", "product_id", "foo", "count", "", 1)'
            ),
            "41"
        );
    });

    QUnit.test("IROKOO.SUM_BY_DOMAIN sums a field for the records matching the filters", async (assert) => {
        assert.strictEqual(
            await evaluateFormula('=IROKOO.SUM_BY_DOMAIN("irk.partner", "probability", "product_id=41")'),
            121
        );
    });

    QUnit.test("IROKOO.COUNT_BY_DOMAIN counts the records matching the filters", async (assert) => {
        assert.strictEqual(
            await evaluateFormula('=IROKOO.COUNT_BY_DOMAIN("irk.partner", "product_id=41")'),
            3
        );
    });

    QUnit.test("IROKOO.COUNT_BY_DOMAIN supports the 'field!value' filter", async (assert) => {
        assert.strictEqual(
            await evaluateFormula('=IROKOO.COUNT_BY_DOMAIN("irk.partner", "foo!2")'),
            3
        );
    });
});
