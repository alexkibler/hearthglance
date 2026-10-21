"""Build an allowlisted, reproducible source + install archive; never copy HA data."""
from pathlib import Path
import hashlib
import json
import zipfile
root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
files = ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'hacs.json',
         'package.json', 'package-lock.json', '.gitignore']
for directory in ['src', 'dist', 'examples', 'blueprints', 'scripts', 'tests', 'docs', '.github', 'custom_components']:
    files.extend(str(p.relative_to(root)) for p in (root / directory).rglob('*') if p.is_file() and p.name != '.DS_Store' and '__pycache__' not in p.parts and p.suffix != '.pyc')
output = root / 'releases'
output.mkdir(exist_ok=True)
archive = output / f'hearthglance-card-v{version}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        bundle.writestr(info, (root / name).read_bytes())
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
integration = output / f'hearthglance-recipes-v{version}.zip'
with zipfile.ZipFile(integration, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for name in sorted(f for f in files if f.startswith('custom_components/') or f in ['LICENSE', 'docs/recipes.md']):
        info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        bundle.writestr(info, (root / name).read_bytes())
integration_checksum = hashlib.sha256(integration.read_bytes()).hexdigest()
(output / 'SHA256SUMS').write_text(f'{checksum}  {archive.name}\n{integration_checksum}  {integration.name}\n')
print(f'{archive.name} ({archive.stat().st_size:,} bytes)\nSHA256 {checksum}')
