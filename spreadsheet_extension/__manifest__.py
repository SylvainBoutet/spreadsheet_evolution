{
    "name": "Spreadsheet Extension",
    "author": "Sylvain Boutet",
    "website": "http://www.chti-tech.eu",
    "category": "Tools",
    "version": "18.0.0.1.1",
    "description": """
Educational module that extends Odoo spreadsheets with custom formulas.

Warning: this module is provided for educational purposes only.
No official support is provided by the author.

Features:

- IROKOO.GET_FIELD formula to access field values
- IROKOO.GET_IDS formula to search records
- IROKOO.GET_SUM formula to compute sums
- IROKOO.GET_GROUPED_IDS formula for groupings

See README.md and EXAMPLES.md for the complete documentation.
""",
    "license": "LGPL-3",
    "depends": [
        "spreadsheet",
        "spreadsheet_dashboard",
    ],
    "data": [

    ],
    "demo": [
        "demo/spreadsheet_dashboard_demo.xml",
    ],
    'assets': {
        'spreadsheet.o_spreadsheet': [
            (
                'after',
                'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.js',
                'spreadsheet_extension/static/src/js/**/*',
            ),
        ],
        'web.assets_unit_tests': [
            'spreadsheet_extension/static/tests/unit/**/*',
        ],
        'web.assets_tests': [
            'spreadsheet_extension/static/tests/tours/**/*',
        ],
    },
    'auto_install': False,
    'installable': True,
    'application': True,
}
