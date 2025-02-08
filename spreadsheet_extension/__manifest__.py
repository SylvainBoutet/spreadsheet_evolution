{
    "name": "Spreadsheet Extension",
    "author": "Sylvain Boutet",
    "website": "http://www.chti-tech.eu",
    "category": "Tools",
    "version": "18.0.0.0.1",
    "description": """
    Addons Spreadsheet
    """,
    "license": "LGPL-3",
    "depends": [
        "spreadsheet",
    ],
    "data": [

    ],
    'assets': {
        'spreadsheet.o_spreadsheet': [
            (
                'after',
                'spreadsheet/static/src/o_spreadsheet/o_spreadsheet.js',
                'spreadsheet_extension/static/src/js/**/*',
            ),
        ],
    },
}