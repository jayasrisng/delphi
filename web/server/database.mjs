import { DatabaseSync } from 'node:sqlite'

export function localDatabase(path) {
  const db = new DatabaseSync(path)
  db.exec(`
    create table if not exists performances (slug text primary key, title text, creator text, source text, created_at text default current_timestamp);
    create table if not exists likes (slug text, browser text, primary key(slug,browser));
    create table if not exists performance_views (slug text, browser text, primary key(slug,browser));
    create table if not exists comments (id text primary key, slug text, browser text, author text, body text, created_at text default current_timestamp);
  `)
  return {
    list: (limit = 100, offset = 0) => db.prepare('select * from performances order by created_at desc, slug desc limit ? offset ?').all(limit,offset),
    get: slug => db.prepare('select * from performances where slug=?').get(slug),
    publish: row => db.prepare('insert into performances (slug,title,creator,source) values (?,?,?,?)').run(row.slug,row.title,row.creator,row.source),
    likes: (slug,browser) => ({
      liked:!!db.prepare('select 1 from likes where slug=? and browser=?').get(slug,browser),
      likes:db.prepare('select count(*) as total from likes where slug=?').get(slug).total
    }),
    setLike: (slug,browser,liked) => liked
      ? db.prepare('insert or ignore into likes values (?,?)').run(slug,browser)
      : db.prepare('delete from likes where slug=? and browser=?').run(slug,browser),
    views: slug => db.prepare('select count(*) as total from performance_views where slug=?').get(slug).total,
    addView: (slug,browser) => db.prepare('insert or ignore into performance_views values (?,?)').run(slug,browser),
    commentCount: slug => db.prepare('select count(*) as total from comments where slug=?').get(slug).total,
    comments: slug => db.prepare('select * from (select * from comments where slug=? order by created_at desc limit 100) order by created_at').all(slug),
    comment: item => db.prepare('insert into comments (id,slug,browser,author,body) values (?,?,?,?,?)').run(item.id,item.slug,item.browser,item.author,item.body),
    remove: (slug,id,browser) => browser ? db.prepare('delete from comments where slug=? and id=? and browser=?').run(slug,id,browser)
      : db.prepare('delete from comments where slug=? and id=?').run(slug,id)
  }
}

export function cloudDatabase(request) {
  const rest = (path, options) => request('/rest/v1/'+path, options)
  const query = (table, params) => table+'?'+new URLSearchParams(params)
  const bySlug = (table,slug,params={}) => query(table,{slug:'eq.'+slug,...params})
  const write = (method, body, headers) => ({ method, body:body ? JSON.stringify(body) : undefined, headers })
  return {
    list: (limit = 100, offset = 0) => rest(query('performances',{ published:'eq.true',select:'slug,title,creator,source,created_at',order:'created_at.desc,slug.desc',limit,offset })),
    get: async slug => (await rest(bySlug('performances',slug,{published:'eq.true',select:'slug,title,creator,source,created_at'})))[0],
    publish: row => rest('performances',write('POST',row)),
    likes: async (slug,browser) => {
      const path = bySlug('likes',slug,{select:'slug'})
      const [count, own] = await Promise.all([
        rest(path,{ method:'HEAD',headers:{ Prefer:'count=exact' } }),
        browser ? rest(bySlug('likes',slug,{browser:'eq.'+browser,select:'slug'})) : []
      ])
      return { likes:Number(count.headers.get('content-range')?.split('/').at(-1) || 0),liked:!!own.length }
    },
    setLike: (slug,browser,liked) => liked
      ? rest('likes',write('POST',{slug,browser},{Prefer:'resolution=ignore-duplicates'}))
      : rest(bySlug('likes',slug,{browser:'eq.'+browser}),write('DELETE')),
    views: async slug => {
      const response = await rest(bySlug('performance_views',slug,{select:'slug'}),{method:'HEAD',headers:{Prefer:'count=exact'}})
      return Number(response.headers.get('content-range')?.split('/').at(-1) || 0)
    },
    addView: (slug,browser) => rest('performance_views',write('POST',{slug,browser},{Prefer:'resolution=ignore-duplicates'})),
    commentCount: async slug => {
      const response = await rest(bySlug('comments',slug,{select:'id',limit:1}),{raw:true,headers:{Prefer:'count=exact'}})
      return Number(response.headers.get('content-range')?.split('/').at(-1) || 0)
    },
    comments: async slug => (await rest(bySlug('comments',slug,{order:'created_at.desc',limit:'100'}))).reverse(),
    comment: item => rest('comments',write('POST',item)),
    remove: (slug,id,browser) => rest(bySlug('comments',slug,{id:'eq.'+id,...(browser ? {browser:'eq.'+browser} : {})}),write('DELETE'))
  }
}
