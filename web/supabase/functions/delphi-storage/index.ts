const base = Deno.env.get('SUPABASE_URL')!;
const current = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default;
const serviceKey = current || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = new Headers({apikey:serviceKey,'Content-Type':'application/json'});
if (!current) admin.set('Authorization','Bearer '+serviceKey);

const methods: Record<string, string[]> = {
  performances: ['GET','POST'],
  likes: ['GET','HEAD','POST','DELETE'],
  performance_views: ['HEAD','POST'],
  comments: ['GET','POST','DELETE']
};
const storageSign = /^\/storage\/v1\/object\/(?:upload\/)?sign\/(?:performance-staging\/[a-f0-9]{24}\/(?:audio|video)\.raw|performance-media\/[a-f0-9]{24}\/(?:audio\.m4a|video\.mp4|thumb\.jpg))$/;
const stagingDelete = /^([a-f0-9]{24})\/(audio|video)\.raw$/;

Deno.serve(async request => {
  const token = request.headers.get('X-Delphi-Worker') ?? '';
  if (!/^[a-f0-9]{96}$/.test(token)) return new Response(null,{status:401});
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))]
    .map(byte => byte.toString(16).padStart(2,'0')).join('');
  const check = await fetch(base+'/rest/v1/delphi_worker_credentials?select=digest&limit=1&digest=eq.'+digest,{headers:admin});
  if (!check.ok) return new Response(null,{status:503});
  if (!(await check.json()).length) return new Response(null,{status:401});

  const target = new URL(request.url).searchParams.get('resource') ?? '';
  const [path, query, ...tail] = target.split('?');
  const table = path.match(/^\/rest\/v1\/(performances|likes|performance_views|comments)$/)?.[1];
  const method = request.method;
  const sign = method === 'POST' && storageSign.test(path) && query === undefined;
  const remove = method === 'DELETE' && path === '/storage/v1/object/performance-staging' && query === undefined;
  const database = table && methods[table].includes(method) && !tail.length;
  if (!sign && !remove && !database) return new Response(null,{status:404});

  let body;
  if (method === 'POST' || remove) {
    const input = await request.text();
    if (input.length > 2048) return new Response(null,{status:413});
    if (remove) {
      const {prefixes} = JSON.parse(input);
      if (!Array.isArray(prefixes) || prefixes.length > 2 || !prefixes.every(prefix => typeof prefix === 'string' && stagingDelete.test(prefix))) {
        return new Response(null,{status:400});
      }
    }
    body = input;
  }

  const headers = new Headers(admin);
  for (const name of ['Prefer','x-upsert']) {
    const value = request.headers.get(name);
    if (value) headers.set(name,value);
  }
  const response = await fetch(base+target,{method,headers,body});
  const outgoing = new Headers();
  for (const name of ['Content-Type','Content-Range']) {
    const value = response.headers.get(name);
    if (value) outgoing.set(name,value);
  }
  return new Response(response.body,{status:response.status,headers:outgoing});
});
