import json
from unittest import TestCase
from unittest.mock import patch

import recipe_import


URL = 'https://recipes.example.org/soup'
RECIPE = {'@context':'https://schema.org','@type':'Recipe','name':'Leek & Potato Soup',
          'recipeIngredient':['Potatoes', 'Leeks'],
          'recipeInstructions':[{'@type':'HowToStep','text':'Simmer the vegetables.'}],
          'totalTime':'PT30M','recipeYield':'4 servings'}


class ParserTests(TestCase):
    def test_json_ld_recipe(self):
        html = f'<script type="application/ld+json">{json.dumps(RECIPE)}</script>'
        result = recipe_import.extract(html, URL)
        self.assertEqual(result['title'], 'Leek & Potato Soup')
        self.assertEqual(result['ingredients'], 'Potatoes\nLeeks')
        self.assertEqual(result['instructions'], 'Simmer the vegetables.')
        self.assertEqual(result['totalTime'], '30 min')
        self.assertEqual(result['link'], URL)

    def test_microdata_on_an_unregistered_publisher(self):
        html = '''<article itemscope itemtype="https://schema.org/Recipe">
            <h1 itemprop="name">Lentil soup</h1>
            <ul><li itemprop="recipeIngredient">1 cup lentils</li></ul>
            <p itemprop="recipeInstructions">Simmer the lentils.</p></article>'''
        result = recipe_import.extract(html, URL)
        self.assertEqual((result['title'], result['ingredients'], result['instructions']),
                         ('Lentil soup', '1 cup lentils', 'Simmer the lentils.'))

    def test_non_recipe_page_and_partial_metadata_fail(self):
        for page in ['<h1>Not a recipe</h1>',
                     f'<script type="application/ld+json">{json.dumps(dict(RECIPE, recipeIngredient=[]))}</script>']:
            with self.assertRaises(recipe_import.RecipeImportError):
                recipe_import.extract(page, URL)

    def test_ignores_a_cross_domain_canonical(self):
        self.assertEqual(recipe_import.source_url('https://not-the-publisher.org/', URL), URL)
        self.assertEqual(recipe_import.source_url('/soup#ingredients', URL), URL)


class NetworkTests(TestCase):
    def test_rejects_disallowed_url_forms(self):
        for bad in ('file:///etc/hosts', 'https://recipe.example:8123', 'https://user:secret@recipe.example',
                    'https://recipe.example/line\nfeed', 'https://intranet'):
            with self.subTest(url=bad), self.assertRaises(recipe_import.RecipeImportError):
                recipe_import.recipe_url(bad)

    def test_rejects_private_or_mixed_dns_responses(self):
        for private_ip in ('127.0.0.1', '169.254.169.254', '10.0.0.1', '::ffff:127.0.0.1', 'fe80::1'):
            with patch('recipe_import.socket.getaddrinfo', return_value=[
                (None,None,None,None,('93.184.215.14',443)), (None,None,None,None,(private_ip,443))
            ]), self.assertRaises(recipe_import.RecipeImportError):
                recipe_import.public_addresses('recipe.example',443)

    def test_checks_redirect_before_opening_a_new_connection(self):
        class Redirect:
            status = 302
            def getheader(self, name): return 'https://127.0.0.1/'
            def __enter__(self): return self
            def __exit__(self, *_): pass

        def resolve(host, _, **kwargs):
            ip = '127.0.0.1' if host == '127.0.0.1' else '93.184.215.14'
            return [(None,None,None,None,(ip,443))]

        with patch('recipe_import.socket.getaddrinfo', side_effect=resolve), \
             patch('recipe_import.http.client.HTTPSConnection') as connect, \
             self.assertRaises(recipe_import.RecipeImportError):
            connect.return_value.getresponse.return_value = Redirect()
            recipe_import.download(URL)
        connect.assert_called_once_with('recipes.example.org', 443, timeout=4)
