import json

from odoo import Command
from odoo.tests import HttpCase, new_test_user, tagged
from odoo.tools import file_open
from odoo.tools.binary import BinaryBytes


@tagged('post_install', '-at_install')
class TestSpreadsheetExtension(HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.user = new_test_user(
            cls.env, login='irokoo_dashboard_user', groups='base.group_user',
        )
        Partner = cls.env['res.partner']
        cls.partner_alpha = Partner.create({
            'name': 'IRK Alpha', 'ref': 'IRKTEST', 'city': 'Lille', 'partner_latitude': 10.5,
        })
        cls.partner_beta = Partner.create({
            'name': 'IRK Beta', 'ref': 'IRKTEST', 'city': 'Lille', 'partner_latitude': 20.25,
        })
        cls.partner_gamma = Partner.create({
            'name': 'IRK Gamma', 'ref': 'IRKTEST', 'city': 'Paris', 'partner_latitude': 5.0,
        })
        ids = ','.join(str(p.id) for p in (cls.partner_alpha, cls.partner_beta, cls.partner_gamma))
        # Column B: IROKOO formulas, column C: expected results
        rows = [
            ('Formula', 'Expected'),
            (f'=IROKOO.GET_FIELD("res.partner", {cls.partner_alpha.id}, "name")', 'IRK Alpha'),
            ('=IROKOO.GET_IDS("res.partner", "name", "asc", 0, "ref=IRKTEST")', ids),
            ('=IROKOO.GET_SUM("res.partner", "partner_latitude", B3)', '35.75'),
            ('=IROKOO.GET_GROUPED_IDS("res.partner", "city", "partner_latitude", "sum", "ref=IRKTEST", 0)',
             'Lille,Paris'),
            ('=IROKOO.SUM_BY_DOMAIN("res.partner", "partner_latitude", "ref=IRKTEST")', '35.75'),
            ('=IROKOO.COUNT_BY_DOMAIN("res.partner", "ref~IRKTEST")', '3'),
        ]
        cells = {}
        for index, (formula, expected) in enumerate(rows, start=1):
            cells[f'B{index}'] = {'content': formula}
            cells[f'C{index}'] = {'content': expected}
        data = {
            'version': 21,
            'sheets': [{
                'id': 'sheet1',
                'name': 'IROKOO formulas test',
                'colNumber': 26,
                'rowNumber': 100,
                'cells': cells,
            }],
        }
        group = cls.env['spreadsheet.dashboard.group'].create({
            'name': 'IROKOO tests',
            'sequence': 1,
        })
        cls._create_dashboard(group, 'IROKOO formulas test', data)
        cls._create_dashboard(group, 'IROKOO formulas examples check', cls._get_demo_data_with_expected())

    @classmethod
    def _create_dashboard(cls, group, name, data):
        return cls.env['spreadsheet.dashboard'].create({
            'name': name,
            'dashboard_group_id': group.id,
            'spreadsheet_binary_data': BinaryBytes(json.dumps(data).encode()),
            'group_ids': [Command.link(cls.env.ref('base.group_user').id)],
            'is_published': True,
        })

    @classmethod
    def _get_demo_data_with_expected(cls):
        """Spreadsheet of the demo dashboard, with the results expected for
        its formulas (computed from the database) in column C."""
        with file_open('spreadsheet_extension/demo/irokoo_formulas_dashboard.json') as demo_file:
            data = json.load(demo_file)
        Country = cls.env['res.country']
        land_countries = Country.search([('name', 'ilike', 'land')], order='name asc')
        first_land_countries = land_countries[:5]
        # IROKOO.GET_GROUPED_IDS: groups in the order of a JavaScript object
        # (integer keys first, ascending), then sorted by count, descending
        counts = {}
        for country in Country.search([('phone_code', '>', 300)], limit=2000):
            key = country.currency_id.id or 'false'
            counts[key] = counts.get(key, 0) + 1
        keys = sorted(k for k in counts if k != 'false') + [k for k in counts if k == 'false']
        top_currencies = sorted(keys, key=lambda k: -counts[k])[:3]
        expected = {
            'C2': cls.env.ref('base.fr').name,
            'C3': ','.join(str(i) for i in first_land_countries.ids),
            'C4': str(sum(first_land_countries.mapped('phone_code'))),
            'C5': ','.join(str(k) for k in top_currencies),
            'C6': str(sum(Country.search([('code', 'in', ['FR', 'BE', 'DE'])]).mapped('phone_code'))),
            'C7': str(len(land_countries)),
            'C8': cls.env['res.company'].browse(1).name,
        }
        sheet = data['sheets'][0]
        sheet['name'] = 'IROKOO formulas examples check'
        # The expected values get the same integer format as the results
        sheet['formats'].update({'C4': 1, 'C6': 1})
        for cell, value in expected.items():
            sheet['cells'][cell] = {'content': value}
        return data

    def test_formulas_in_dashboard(self):
        """Open a dashboard using the formulas and check every result against the database."""
        self.start_tour('/odoo/dashboards', 'spreadsheet_extension_dashboard_tour', login=self.user.login)
