"""Freeze tracked runtime blobs from a commit; never overwrite a build.

Includes nested vendor decoders and all runtime asset extensions. Reports and
recordings belong outside Game. Assets are taken from Git, not a moving folder.
"""
import argparse, hashlib, json, pathlib, subprocess, zipfile

parser=argparse.ArgumentParser()
parser.add_argument('--repo',required=True)
parser.add_argument('--out',required=True)
parser.add_argument('--version',required=True)
parser.add_argument('--tag',required=True)
args=parser.parse_args()
repo=pathlib.Path(args.repo).resolve()
def git(*options):
    return subprocess.check_output(['git','-C',str(repo),*options])
commit=git('rev-parse','HEAD').decode().strip()
if git('status','--porcelain').strip():
    raise SystemExit('Commit source and docs before freezing')
if git('rev-parse',args.tag+'^{commit}').decode().strip()!=commit:
    raise SystemExit('Tag must point at the frozen source commit')
dest=pathlib.Path(args.out).resolve()/f'{args.version}-{commit[:7]}'
dest.mkdir(parents=True,exist_ok=False)
runtime=dest/'Game';runtime.mkdir()
names=git('ls-tree','-r','--name-only','-z',commit).decode().split('\0')
selected=[]
for name in names:
    if not name: continue
    p=pathlib.PurePosixPath(name)
    if p.parts[0] in ('assets','vendor','media') or (len(p.parts)==1 and p.suffix.lower() in ('.js','.css','.html')):
        selected.append(name)
files=[]
for name in sorted(selected):
    blob=git('show',f'{commit}:{name}')
    target=runtime/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(blob)
    files.append({'path':name,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()})
instructions='Star Breaker v35\n\nUse a local HTTP server, not file://, to load 3D models.\nIf Python is installed: python -m http.server 4173 --directory Game\nOpen http://127.0.0.1:4173/\nAdd ?qa=1 for diagnostics. Offline local assets are included.\nSaved browser progress is origin-specific; use the same host and port to retain it.\n'
(dest/'START.txt').write_text(instructions,encoding='utf-8')
archive=dest/f'Star-Breaker-{args.version}.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for item in files:z.write(runtime/item['path'],'Game/'+item['path'])
    z.write(dest/'START.txt','START.txt')
with zipfile.ZipFile(archive) as z:
    if z.testzip():raise RuntimeError('ZIP CRC failed')
    for item in files:
        if hashlib.sha256(z.read('Game/'+item['path'])).hexdigest()!=item['sha256']:raise RuntimeError(item['path'])
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
manifest={'schema':'star-breaker-frozen/2','version':args.version,'commit':commit,'tag':args.tag,'baseline':'a5374770007bf1d6d47f3496a31ccad21aae3948','zip':archive.name,'zipBytes':archive.stat().st_size,'zipSha256':digest,'runtimeBytes':sum(f['bytes'] for f in files),'fileCount':len(files),'files':files,'checks':{'crc':True,'everyArchiveFileSha256':True}}
(dest/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(dest/'SHA256.txt').write_text(f'{digest}  {archive.name}\n',encoding='ascii')
print(json.dumps({k:v for k,v in manifest.items() if k!='files'},ensure_ascii=False,indent=2))
print(dest)
