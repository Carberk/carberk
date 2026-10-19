#!/usr/bin/env python3
"""Bounded PR-only real HTTP proof. Auth input/output stay outside Git.
Usage: python3 prove.py /tmp/owner-only-config.json /tmp/sanitized-evidence.json
Requires explicit coordinator ready/seed confirmation. Never reseeds an environment.
"""
import hashlib, json, os, pathlib, re, sys, threading, urllib.request, urllib.error, urllib.parse, uuid, time
from datetime import datetime, timezone

API = 'https://api-autotm-rewrite-pr-546.up.railway.app/api/v1'
MEDIA = 'https://minio-autotm-rewrite-pr-546.up.railway.app'
SHA = 'b7ce7568b9a447cb9b109e6bf5b0063dfbf303b2'
DIR = pathlib.Path(__file__).resolve().parent
ROWS = []
OUT = pathlib.Path(sys.argv[2])
CONF = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert CONF['readyConfirmed'] is True and CONF['seedConfirmed'] is True
assert CONF['commitSha'] == SHA
assert CONF['environmentId'] == '6f951120-4ee3-4b03-8520-b64e12e8b354'
assert pathlib.Path(sys.argv[1]).stat().st_mode & 0o077 == 0
assert CONF['ownerToken'] != CONF['foreignToken']
assert CONF['apiDeploymentId'] == '1f81f0df-8a3d-4307-90b6-ca2dea1129f3'
assert CONF['workerDeploymentId'] == '3d763955-afaa-4d4e-a5a6-f56019de3472'
IMAGE = (DIR / 'proof.jpg').read_bytes()
EVIDENCE = {'appCommit': SHA, 'api': API, 'media': MEDIA,
 'environmentId': CONF['environmentId'], 'apiDeploymentId': CONF['apiDeploymentId'],
 'workerDeploymentId': CONF.get('workerDeploymentId'),
 'startedAt': datetime.now(timezone.utc).isoformat(),
 'fixture': {'bytes': len(IMAGE), 'sha256': hashlib.sha256(IMAGE).hexdigest(), 'contentType': 'image/jpeg'},
 'states': ROWS, 'notExercised': [], 'result': 'running'}

PENDING_KEY=re.compile(r'^pending/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/original\.(jpg|webp|mp4)$')

def save():
    OUT.write_text(json.dumps(EVIDENCE, indent=2)+'\n')

def check(state, ok, **facts):
    ROWS.append({'state': state, 'result': 'pass' if ok else 'fail', **facts})
    save()
    if not ok: raise AssertionError(state)

def http(url, method='GET', body=None, token=None, content_type=None, pace=True):
    if pace: time.sleep(1.3)  # Below 50/min, leaving headroom in the shared 60/min gate.
    headers={'User-Agent': 'autotm-536-private-storage-proof'}
    if token: headers['Authorization']='Bearer '+token
    if body is not None:
        if not isinstance(body, bytes): body=json.dumps(body).encode(); content_type='application/json'
        headers['Content-Type']=content_type
        headers['Content-Length']=str(len(body))
    req=urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        response=urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as failure: response=failure
    with response:
        raw=response.read()
        try: data=json.loads(raw) if raw else None
        except ValueError: data=None
        return response.status, data, dict(response.headers.items())

def api(state, path, token=None, method='GET', body=None, expected=200, error=None):
    status, data, _ = http(API+path, method, body, token)
    code=data.get('code') if isinstance(data,dict) else None
    if not code and isinstance(data,dict) and isinstance(data.get('error'),dict): code=data['error'].get('code')
    check(state, status==expected and (error is None or error==code), status=status, expectedStatus=expected, code=code, expectedCode=error)
    return data

def head(state,key,expected=200,original=False):
    status,_,headers=http(MEDIA+'/listing-photos/'+key,'HEAD')
    lower={k.lower():v for k,v in headers.items()}
    content_type=lower.get('content-type'); length=int(lower.get('content-length','0'))
    check(state,(status in (403,404) if expected==404 else status==expected) and (expected!=200 or length>0) and (not original or content_type=='image/jpeg' and length==len(IMAGE)),
          key=key,status=status,contentType=content_type,contentLength=length,expectedStatus=expected,
          absenceStatusAllowed=[403,404] if expected==404 else None)

def upload(state,token,put=True,put_type='image/jpeg'):
    data=api(state+' presign','/uploads/presign',token,'POST',
             {'kind':'image','contentType':'image/jpeg','sizeBytes':len(IMAGE)},201)
    key=data['key']; url=data['uploadUrl']
    # Signed URLs never appear in evidence, errors, console output or Git.
    check(state+' presign media host',urllib.parse.urlsplit(url).hostname==urllib.parse.urlsplit(MEDIA).hostname,key=key)
    if put:
        status,_,_=http(url,'PUT',IMAGE,content_type=put_type)
        check(state+' actual PUT',status==200,status=status,key=key)
        if put_type=='image/jpeg': head(state+' original HEAD',key,original=True)
    return key

def payload(key,label):
    return {**CATALOG,'year':2020,'condition':'used','mileageKm':10000,
      'priceAmount':125000,'priceCurrency':'TMT', 'description':'PR546 private storage proof '+label,
      'allowCalls':False,'allowChat':True, 'conditionDisclosure':{'damaged':False},
      'photos':[{'photoId':str(uuid.uuid4()),'key':key,'sortOrder':0}]}

def draft(label,token,key):
    data=api(label+' create draft','/listings/drafts',token,'POST',{'initialPayload':payload(key,label)},201)
    check(label+' draft ownership',data.get('userId')==user_id(token),draftId=data['id'],userId=data.get('userId'))
    return data['id']

def user_id(token):
    import base64
    segment=token.split('.')[1]
    return json.loads(base64.urlsafe_b64decode(segment+'='*(-len(segment)%4)))['sub']

def publish(label,token,key):
    draft_id=draft(label,token,key)
    data=api(label+' publish','/listings/drafts/'+draft_id+'/publish',token,'POST',{},201)
    listing=data['id']
    detail=api(label+' readback','/listings/'+listing,token)
    check(label+' published adoption',detail['status']=='active' and detail['sellerId']==user_id(token) and
          any(m['key']==key for m in detail['media']), listingId=listing,sellerId=detail['sellerId'],status=detail['status'],
          media=[{'id':m['id'],'key':m['key'],'sortOrder':m['sortOrder']} for m in detail['media']])
    for name in ('thumbnail','list','detail','fullscreen'):
        head(label+' generated '+name,key.rsplit('/',1)[0]+'/'+name+'.jpg')
    return listing

def attach(label,token,listing,key,expected=201,error=None):
    return api(label,'/listings/'+listing+'/media/attach',token,'POST',
               {'key':key,'kind':'image','sortOrder':1},expected,error)

try:
    status,ready,_=http(API.removesuffix('/api/v1')+'/readyz')
    EVIDENCE['readyzBefore']={'at':datetime.now(timezone.utc).isoformat(),'status':status,'body':ready}
    check('exact PR readyz',status==200 and ready.get('commitSha')==SHA and ready.get('environment')=='auto.tm-rewrite-pr-546' and ready.get('status')=='ready',status=status,readyz=ready)
    # Catalog reads select real seeded IDs without reading private database credentials.
    brands=api('catalog brands','/catalog/brands?limit=100')['items']
    brand=next((b for b in brands if b.get('slug')=='toyota'),brands[0])
    models=api('catalog models','/catalog/brands/'+brand['id']+'/models?limit=100')['items']
    regions=api('catalog regions','/catalog/regions')['items']
    region=regions[0]
    cities=api('catalog cities','/catalog/regions/'+region['id']+'/cities')['items']
    CATALOG={'brandId':brand['id'],'modelId':models[0]['id'],'regionId':region['id'],'cityId':cities[0]['id']}
    owner=CONF['ownerToken']; foreign=CONF['foreignToken']
    EVIDENCE['users']={'owner':user_id(owner),'foreign':user_id(foreign)}
    check('distinct fixture callers',user_id(owner)!=user_id(foreign),users=EVIDENCE['users'])
    bootstrap=upload('bootstrap',owner)
    first=publish('bootstrap',owner,bootstrap)
    key=upload('attach',owner)
    attached=attach('owner attach',owner,first,key)
    retry=attach('same Listing retry',owner,first,key)
    check('same Listing retry media ID',attached['id']==retry['id'],mediaId=attached['id'],retryMediaId=retry['id'],key=key,listingId=first)
    detail=api('attach readback','/listings/'+first,owner)
    check('attached row readback',sum(m['key']==key and m['id']==attached['id'] for m in detail['media'])==1,
          listingId=first,mediaId=attached['id'],key=key)
    for name in ('thumbnail','list','detail','fullscreen'): head('attach variant '+name,key.rsplit('/',1)[0]+'/'+name+'.jpg')
    missing=upload('missing object',owner,False)
    head('no PUT public HEAD',missing,404)
    attach('missing object rejected',owner,first,missing,400,'UPLOAD_OBJECT_INVALID')
    forged='pending/'+str(uuid.uuid4())+'/original.jpg'
    attach('forged key rejected',owner,first,forged,400,'UPLOAD_NOT_AVAILABLE')
    foreign_key=upload('foreign owned image',foreign)
    second=publish('foreign proof Listing',foreign,foreign_key)
    attach('cross User known key rejected',foreign,second,key,400,'UPLOAD_NOT_AVAILABLE')
    api('cross Listing foreign media removal rejected','/listings/'+second+'/media/'+attached['id'],foreign,'DELETE',expected=404)
    head('owner original survives attack',key,original=True)
    fresh=upload('fresh publication',owner)
    bad_draft=draft('foreign publication attempt',foreign,fresh)
    api('foreign publication rejected','/listings/drafts/'+bad_draft+'/publish',foreign,'POST',{},400,'UPLOAD_NOT_AVAILABLE')
    third=publish('fresh publication after attach',owner,fresh)
    attach('same User other Listing reuse rejected',owner,third,key,409,'UPLOAD_ALREADY_ATTACHED')
    api('owner safe remove','/listings/'+first+'/media/'+attached['id'],owner,'DELETE',expected=200)
    detail=api('remove readback','/listings/'+first,owner)
    check('media row removed',all(m['id']!=attached['id'] for m in detail['media']),listingId=first,mediaId=attached['id'])
    head('removed original HEAD',key,404)
    for name in ('thumbnail','list','detail','fullscreen'): head('removed variant '+name,key.rsplit('/',1)[0]+'/'+name+'.jpg',404)
    head('foreign original survives owner removal',foreign_key,original=True)
    head('fresh published original survives owner removal',fresh,original=True)
    # Cleanup authority (ADR-0079, second fix round): only exact pending/<UUIDv4>/original.(jpg|webp|mp4).
    check('proof keys have the exact cleanup shape',all(PENDING_KEY.match(k) for k in (key,bootstrap,fresh,foreign_key)),
          keys=[key,bootstrap,fresh,foreign_key])
    check('removed original and bootstrap original are in different directories',key.rsplit('/',1)[0]!=bootstrap.rsplit('/',1)[0],
          removedDirectory=key.rsplit('/',1)[0],bootstrapDirectory=bootstrap.rsplit('/',1)[0])
    head('same Listing sibling original survives owner removal',bootstrap,original=True)
    for name in ('thumbnail','list','detail','fullscreen'): head('sibling variant survives owner removal '+name,bootstrap.rsplit('/',1)[0]+'/'+name+'.jpg')
    api('cleanup own rejected draft','/listings/drafts/'+bad_draft,foreign,'DELETE',expected=200)
    # Concurrent publish versus attach of the same upload. The attach start is staggered
    # by a fixed delay per round so it can land inside publication's variant-generation window.
    race_cleanup=[]
    for round_no,delay in enumerate((0.0,0.25,0.6),1):
        label='race %d'%round_no
        rk=upload(label,owner)
        rd=draft(label,owner,rk)
        results={}
        barrier=threading.Barrier(2)
        def fire(name,path,body,wait):
            try:
                barrier.wait(timeout=30)
                if wait: time.sleep(wait)
                s,d,_=http(API+path,'POST',body,owner,pace=False)
                c=d.get('code') if isinstance(d,dict) else None
                results[name]={'status':s,'code':c,'id':d.get('id') if isinstance(d,dict) else None}
            except Exception as failure:
                results[name]={'status':None,'code':None,'error':type(failure).__name__}
        threads=[threading.Thread(target=fire,args=('publish','/listings/drafts/'+rd+'/publish',{},0.0)),
                 threading.Thread(target=fire,args=('attach','/listings/'+first+'/media/attach',{'key':rk,'kind':'image','sortOrder':2},delay))]
        for t in threads: t.start()
        for t in threads: t.join(timeout=120)
        pub=results.get('publish',{}); att=results.get('attach',{})
        statuses=[pub.get('status'),att.get('status')]
        winner=('publish' if pub.get('status')==201 else 'attach' if att.get('status')==201 else None)
        loser={'publish':att,'attach':pub}.get(winner)
        check(label+' exactly one adopts and the loser gets the mapped conflict, not a 5xx',
              sorted(statuses,key=lambda x:(x is None,x))==[201,409] and loser.get('code')=='UPLOAD_ALREADY_ATTACHED'
              and all(isinstance(x,int) and x<500 for x in statuses),
              key=rk,attachDelaySeconds=delay,publishStatus=pub.get('status'),publishCode=pub.get('code'),
              attachStatus=att.get('status'),attachCode=att.get('code'),winner=winner,loserCode=loser.get('code') if loser else None)
        if winner=='attach':
            race_cleanup.append((att['id'],rk))
            api(label+' loser draft cleanup','/listings/drafts/'+rd,owner,'DELETE',expected=200)
        else:
            pd=api(label+' publish winner readback','/listings/'+pub['id'],owner)
            check(label+' publish winner owns exactly one media row for the key',sum(m['key']==rk for m in pd['media'])==1,listingId=pub['id'],key=rk)
    for media_id,rk in race_cleanup:
        api('race attach winner removal','/listings/'+first+'/media/'+media_id,owner,'DELETE',expected=200)
        head('race attach winner original deleted',rk,404)
    head('bootstrap original survives race cleanup',bootstrap,original=True)
    EVIDENCE['notExercised']=[
      {'state':'legacy chat-namespace cleanup','reason':'Needs a legacy ListingMedia row whose key is chat-attachments/<conversation>/<upload>/original.mp4 with a backfilled upload. Attach now requires Listing presign provenance (forged keys return UPLOAD_NOT_AVAILABLE above), so plain HTTP cannot create it without a database fixture mutation. Covered by hosted pr run 37017439151 (MediaOwnership.e2e.spec.ts and mediaCleanupPrefix.spec.ts).'},
      {'state':'which branch the publish loser took','reason':'Publication pre-checks adoption and also maps a PrismaPg P2002 constraint at commit; both return 409 UPLOAD_ALREADY_ATTACHED, so HTTP cannot tell the branches apart. The deterministic real-Postgres race that reaches the P2002 branch is in hosted pr run 37017439151.'},
      {'state':'mp4 original cleanup','reason':'Video attach needs a real video fixture and poster; not uploaded to avoid fabricating video bytes. Exact-key mp4 matching is covered by mediaCleanupPrefix.spec.ts in the hosted run.'}]
    EVIDENCE['result']='pass'
except Exception as failure:
    # Avoid exception text, which can include signed URLs or auth-containing network data.
    EVIDENCE['result']='fail'; EVIDENCE['failureType']=type(failure).__name__
finally:
    try:
        status,ready,_=http(API.removesuffix('/api/v1')+'/readyz')
        EVIDENCE['readyzAfter']={'at':datetime.now(timezone.utc).isoformat(),'status':status,'body':ready}
        same=(status==200 and ready.get('commitSha')==SHA and ready.get('environment')=='auto.tm-rewrite-pr-546' and ready.get('status')=='ready')
        ROWS.append({'state':'exact PR readyz after run','result':'pass' if same else 'fail','status':status,'readyz':ready})
        if not same: EVIDENCE['result']='fail'
    except Exception as failure:
        ROWS.append({'state':'exact PR readyz after run','result':'fail','failureType':type(failure).__name__})
        EVIDENCE['result']='fail'
    EVIDENCE['finishedAt']=datetime.now(timezone.utc).isoformat()
    EVIDENCE['counts']={'passed':sum(r['result']=='pass' for r in ROWS),'failed':sum(r['result']=='fail' for r in ROWS),
                        'notExercised':len(EVIDENCE['notExercised'])}
    save()
print(json.dumps({'result':EVIDENCE['result'],'states':len(ROWS),'evidence':str(OUT)}))
sys.exit(0 if EVIDENCE['result']=='pass' else 1)
