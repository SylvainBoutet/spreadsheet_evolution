import { describe, expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";
import { setCellContent } from "@spreadsheet/../tests/helpers/commands";
import { defineSpreadsheetModels } from "@spreadsheet/../tests/helpers/data";
import { getEvaluatedCell } from "@spreadsheet/../tests/helpers/getters";
import { createModelWithDataSource } from "@spreadsheet/../tests/helpers/model";
import { defineModels, fields, models } from "@web/../tests/web_test_helpers";

describe.current.tags("headless");

class IrkProduct extends models.Model {
    _name = "irk.product";

    name = fields.Char();

    _records = [
        { id: 37, name: "xphone" },
        { id: 41, name: "xpad" },
    ];
}

class IrkPartner extends models.Model {
    _name = "irk.partner";

    name = fields.Char();
    foo = fields.Integer();
    probability = fields.Float();
    product_id = fields.Many2one({ relation: "irk.product" });

    _records = [
        { id: 1, name: "A", foo: 12, probability: 10, product_id: 37 },
        { id: 2, name: "B", foo: 1, probability: 11, product_id: 41 },
        { id: 3, name: "C", foo: 17, probability: 95, product_id: 41 },
        { id: 4, name: "D", foo: 2, probability: 15, product_id: 41 },
    ];
}

defineSpreadsheetModels();
defineModels([IrkProduct, IrkPartner]);

/**
 * The formulas fetch their data asynchronously: let the mocked server answer
 * and the spreadsheet re-evaluate until no request is pending anymore.
 */
async function waitForFormulasData(model) {
    const dataProvider = model.config.custom.odooDataProvider;
    let idleFrames = 0;
    for (let i = 0; i < 50 && idleFrames < 3; i++) {
        await animationFrame();
        idleFrames = dataProvider.pendingPromises.size ? 0 : idleFrames + 1;
    }
}

/**
 * Evaluate a formula in A1 and return its result, with the error message if any.
 */
async function evaluateFormula(formula) {
    const { model } = await createModelWithDataSource();
    setCellContent(model, "A1", formula);
    await waitForFormulasData(model);
    const cell = getEvaluatedCell(model, "A1");
    return cell.type === "error" ? `${cell.value}: ${cell.message}` : cell.value;
}

test("IROKOO.GET_FIELD returns a field value", async () => {
    // The result is formatted as text
    expect(await evaluateFormula('=IROKOO.GET_FIELD("irk.partner", 1, "foo")')).toBe("12");
});

test("IROKOO.GET_FIELD returns the id of a many2one field", async () => {
    expect(await evaluateFormula('=IROKOO.GET_FIELD("irk.partner", 2, "product_id")')).toBe("41");
});

test("IROKOO.GET_FIELD requires all its parameters", async () => {
    expect(await evaluateFormula('=IROKOO.GET_FIELD("irk.partner", 0, "foo")')).toBe(
        "#ERROR: All parameters are required"
    );
});

test("IROKOO.GET_IDS returns the ids matching the filters, sorted", async () => {
    expect(
        await evaluateFormula('=IROKOO.GET_IDS("irk.partner", "foo", "asc", 0, "product_id=41")')
    ).toBe("2,4,3");
});

test("IROKOO.GET_IDS applies the limit and the direction", async () => {
    // The mocked server only understands the upper case direction
    expect(
        await evaluateFormula('=IROKOO.GET_IDS("irk.partner", "foo", "DESC", 2, "product_id=41")')
    ).toBe("3,4");
});

test("IROKOO.GET_IDS displays a message when nothing matches", async () => {
    expect(
        await evaluateFormula('=IROKOO.GET_IDS("irk.partner", "id", "asc", 0, "foo>100")')
    ).toBe("No results found");
});

test("IROKOO.GET_SUM sums a field for a list of ids", async () => {
    expect(await evaluateFormula('=IROKOO.GET_SUM("irk.partner", "foo", "1,3")')).toBe(29);
});

test("IROKOO.GET_SUM sums a field for the ids returned by IROKOO.GET_IDS", async () => {
    const { model } = await createModelWithDataSource();
    setCellContent(model, "A1", '=IROKOO.GET_IDS("irk.partner", "id", "asc", 0, "product_id=41")');
    setCellContent(model, "A2", '=IROKOO.GET_SUM("irk.partner", "foo", A1)');
    await waitForFormulasData(model);
    expect(getEvaluatedCell(model, "A1").value).toBe("2,3,4");
    expect(getEvaluatedCell(model, "A2").value).toBe(20);
    expect(getEvaluatedCell(model, "A2").format).toBe("#,##0.00");
});

test("IROKOO.GET_GROUPED_IDS groups and sorts by the aggregated value", async () => {
    expect(
        await evaluateFormula(
            '=IROKOO.GET_GROUPED_IDS("irk.partner", "product_id", "foo", "sum", "", 0)'
        )
    ).toBe("41,37");
});

test("IROKOO.GET_GROUPED_IDS counts and applies the limit", async () => {
    expect(
        await evaluateFormula(
            '=IROKOO.GET_GROUPED_IDS("irk.partner", "product_id", "foo", "count", "", 1)'
        )
    ).toBe("41");
});

test("IROKOO.SUM_BY_DOMAIN sums a field for the records matching the filters", async () => {
    expect(
        await evaluateFormula('=IROKOO.SUM_BY_DOMAIN("irk.partner", "probability", "product_id=41")')
    ).toBe(121);
});

test("IROKOO.COUNT_BY_DOMAIN counts the records matching the filters", async () => {
    expect(await evaluateFormula('=IROKOO.COUNT_BY_DOMAIN("irk.partner", "product_id=41")')).toBe(3);
});

test("IROKOO.COUNT_BY_DOMAIN supports the 'field!value' filter", async () => {
    expect(await evaluateFormula('=IROKOO.COUNT_BY_DOMAIN("irk.partner", "foo!2")')).toBe(3);
});
