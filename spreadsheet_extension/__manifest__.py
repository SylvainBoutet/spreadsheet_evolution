{
    "name": 'Spreadsheet Data Formulas',
    "summary": 'Pull live Odoo data into spreadsheets and dashboards with formulas: read a field, search records, then sum, count or group any model by filter.',
    "images": [
        'static/description/banner.png',
        'static/description/main_screenshot.png',
    ],
    "author": 'IROKOO | CHTI-TECH | Sylvain Boutet',
    "website": "http://www.chti-tech.eu",
    "category": "Tools",
    "version": "19.0.0.2.0",
    "description": """
Adds six IROKOO.* formulas to Odoo spreadsheets: IROKOO.GET_FIELD (a field of
a record), IROKOO.GET_IDS (the IDs of the records matching filters),
IROKOO.GET_SUM (the sum of a field over a list of IDs), IROKOO.GET_GROUPED_IDS
(groups ordered by an aggregate), IROKOO.SUM_BY_DOMAIN and
IROKOO.COUNT_BY_DOMAIN (sum and count of the records matching filters). The
formulas run with the access rights of the user who opens the spreadsheet.
Provided for educational purposes, without official support.
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
