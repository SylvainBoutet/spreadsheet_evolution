{
    "name": "Spreadsheet Extension",
    "author": "Sylvain Boutet",
    "website": "http://www.chti-tech.eu",
    "category": "Tools",
    "version": "18.0.0.0.1",
    "description": """
    Module éducatif pour étendre les spreadsheets Odoo avec des formules personnalisées.
    
    ⚠️ ATTENTION : Module fourni à des fins éducatives uniquement.
    Aucun support officiel n'est assuré par l'auteur.
    
    Fonctionnalités :
    - Formules IROKOO.GET_FIELD pour accéder aux champs
    - Formules IROKOO.GET_IDS pour rechercher des enregistrements  
    - Formules IROKOO.GET_SUM pour calculer des sommes
    - Formules IROKOO.GET_GROUPED_IDS pour les regroupements
    
    Voir README.md et EXAMPLES.md pour la documentation complète.
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
    'auto_install': False,
    'installable': True,
    'application': True,
}