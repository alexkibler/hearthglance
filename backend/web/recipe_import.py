"""Read structured recipes from public web pages."""
import http.client
import ipaddress
import re
import socket
import time
from urllib.parse import quote, urljoin, urlsplit

from recipe_scrapers import scrape_html
from recipe_scrapers._exceptions import RecipeScrapersExceptions


MAX_URL = 4096
MAX_PAGE = 4 * 1024 * 1024
REDIRECTS = {301, 302, 303, 307, 308}
NUTRITION_FIELDS = {
    'calories': 'Calories', 'proteinContent': 'Protein', 'carbohydrateContent': 'Carbohydrates',
    'fatContent': 'Fat', 'saturatedFatContent': 'Saturated fat', 'unsaturatedFatContent': 'Unsaturated fat',
    'transFatContent': 'Trans fat', 'fiberContent': 'Fiber', 'sugarContent': 'Sugar',
    'cholesterolContent': 'Cholesterol', 'sodiumContent': 'Sodium', 'servingSize': 'Serving size',
}


class RecipeImportError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


def recipe_url(value):
    if not isinstance(value, str) or len(value) > MAX_URL:
        raise RecipeImportError('Enter a valid public recipe URL.', 400)
    value = value.strip()
    try:
        if re.search(r'[\x00-\x20\x7f\\]', value):
            raise ValueError()
        parts = urlsplit(value)
        scheme = parts.scheme
        if scheme not in ('http', 'https') or not parts.hostname or parts.username is not None:
            raise ValueError()
        if parts.port not in (None, 443 if scheme == 'https' else 80):
            raise ValueError()
        host = parts.hostname.rstrip('.').encode('idna').decode('ascii')
        if ':' in host:
            if '%' in host:
                raise ValueError()
            host = '[' + str(ipaddress.IPv6Address(host)) + ']'
        elif not re.fullmatch(r'[a-zA-Z0-9.-]+', host) or '.' not in host:
            raise ValueError()
        path = quote(parts.path or '/', safe="/!$&'()*+,;=:@%")
        query = quote(parts.query, safe="/?!$&'()*+,;=:@%")
        return parts._replace(netloc=host.lower(), path=path, query=query, fragment='').geturl()
    except (ValueError, UnicodeError):
        raise RecipeImportError('Enter a valid public recipe URL.', 400) from None


def public_addresses(host, port):
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses:
        raise OSError('No website addresses')
    for _, _, _, _, address in addresses:
        ip = ipaddress.ip_address(address[0])
        if isinstance(ip, ipaddress.IPv6Address):
            ip = ip.ipv4_mapped or ip
        if (not ip.is_global or ip.is_multicast or ip.is_reserved
                or isinstance(ip, ipaddress.IPv6Address) and ip.sixtofour is not None):
            raise RecipeImportError('Recipe links must point to a public website.', 400)
    return list(dict.fromkeys(address[0] for _, _, _, _, address in addresses))


def download(url):
    """Validate every redirect and connect to the vetted IP while retaining HTTPS hostname checks."""
    deadline = time.monotonic() + 15
    try:
        for _ in range(5):
            parts = urlsplit(url)
            https = parts.scheme == 'https'
            port = 443 if https else 80
            addresses = public_addresses(parts.hostname, port)
            connection_type = http.client.HTTPSConnection if https else http.client.HTTPConnection
            target = parts.path + ('?' + parts.query if parts.query else '')
            for index, address in enumerate(addresses):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError()
                connection = connection_type(parts.hostname, port, timeout=min(remaining, 4))
                connection._create_connection = lambda _, timeout, source: socket.create_connection(
                    (address, port), timeout, source)
                try:
                    connection.connect()
                    break
                except OSError:
                    connection.close()
                    if index == len(addresses) - 1:
                        raise
            try:
                connection.request('GET', target, headers={
                    'User-Agent': 'Hearthglance Recipe Import/1.0',
                    'Accept': 'text/html, application/xhtml+xml',
                    'Accept-Encoding': 'identity',
                })
                with connection.getresponse() as response:
                    if response.status in REDIRECTS and response.getheader('Location'):
                        url = recipe_url(urljoin(url, response.getheader('Location')))
                        continue
                    if response.status != 200:
                        raise RecipeImportError(f'The recipe website returned HTTP {response.status}.', 502)
                    if (response.headers.get_content_type() not in ('text/html', 'application/xhtml+xml')
                            or response.getheader('Content-Encoding', 'identity').lower() != 'identity'):
                        raise RecipeImportError('This link did not return a readable web page.')
                    body = bytearray()
                    while True:
                        if time.monotonic() >= deadline:
                            raise TimeoutError()
                        chunk = response.read1(64 * 1024)
                        if not chunk:
                            break
                        body.extend(chunk)
                        if len(body) > MAX_PAGE:
                            raise RecipeImportError('The recipe page is too large.')
                    try:
                        return url, body.decode(response.headers.get_content_charset() or 'utf-8', errors='replace')
                    except LookupError:
                        return url, body.decode('utf-8', errors='replace')
            finally:
                connection.close()
    except (OSError, http.client.HTTPException):
        raise RecipeImportError('Could not reach the recipe website.', 502) from None
    raise RecipeImportError('The recipe website redirected too many times.', 502)


def clean(value):
    return ' '.join(value.split()) if isinstance(value, str) else ''


def result_lines(values):
    return '\n'.join(text for value in values if (text := clean(value)))[:100000]


def minutes(value):
    return f'{value} min' if isinstance(value, int) and value > 0 else ''


def source_url(candidate, final_url):
    if isinstance(candidate, str) and len(candidate) <= MAX_URL:
        try:
            candidate = recipe_url(urljoin(final_url, candidate))
            if urlsplit(candidate).hostname == urlsplit(final_url).hostname:
                return candidate
        except ValueError:
            pass
    return final_url


def extract(page, final_url):
    try:
        scraper = scrape_html(page, org_url=final_url, supported_only=False)
    except (RecipeScrapersExceptions, ValueError, RecursionError):
        raise RecipeImportError('This page does not publish a recognizable recipe.') from None

    def field(method, default=None):
        try:
            return getattr(scraper, method)()
        except (RecipeScrapersExceptions, ValueError, AttributeError, IndexError, KeyError, TypeError):
            return default

    title = clean(field('title'))
    ingredients = result_lines(field('ingredients') or [])
    steps = result_lines(field('instructions_list') or [])
    if not (title and ingredients and steps):
        raise RecipeImportError('This page does not publish a recipe with ingredients and directions.')
    categories = clean(field('category')).split(',')
    nutrition = field('nutrients') or {}
    return {
        'title': title[:500], 'text': clean(field('description'))[:100000],
        'ingredients': ingredients, 'instructions': steps,
        'yield': clean(field('yields'))[:100000],
        'prepTime': minutes(field('prep_time')), 'cookTime': minutes(field('cook_time')),
        'totalTime': minutes(field('total_time')),
        'categories': list(dict.fromkeys(category.strip()[:200] for category in categories if category.strip()))[:100],
        'nutrition': result_lines(f'{label}: {text}' for key, label in NUTRITION_FIELDS.items()
                                  if (text := clean(nutrition.get(key)))),
        'link': source_url(field('canonical_url'), final_url),
    }


def import_from_url(value):
    final_url, page = download(recipe_url(value))
    return extract(page, final_url)
