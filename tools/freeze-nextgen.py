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
instructions=f'''星际突围 / Star Breaker {args.version}

先完整解压 ZIP，再在 START.txt 所在文件夹打开终端。
已安装 Python 时运行：
python -m http.server 4173 --bind 127.0.0.1 --directory Game
然后在 Chrome 或 Edge 打开 http://127.0.0.1:4173/
关闭终端会停止服务。若端口已占用，可改为 4175 并使用对应网址。

建议通过 HTTP 启动，以加载实时 3D 模型；直接双击 HTML 使用兼容画面。
所有运行资源都在 Game 内。存档属于当前浏览器、主机和端口；请保持同一网址。
首次打开有玩法说明；从机库的「飞行手册」可重看。?qa=1 开启测试诊断。
WASD / 方向键移动，空格大招，V 护盾，F 进化技能，Shift 射击姿态，Esc 暂停。

Extract the full ZIP, open a terminal beside START.txt, then run the Python
command above. Open the localhost URL in Chrome or Edge. Use HTTP to enable
3D models. Keep the same browser, host and port to retain local progress.
Select English in the hangar settings. All runtime assets are included.
'''
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
