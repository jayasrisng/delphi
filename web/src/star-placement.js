const clamp = (n,min,max) => Math.max(min,Math.min(max,n))

export function placeStar(star,x,y,stars,width,height,gap) {
  const bounds = (x,y) => [clamp(x,.06,.94),clamp(y,.14,.85)]
  const aim = bounds(x,y)
  const obstacles = stars.filter(other => other !== star)
  const clear = ([x,y]) => obstacles.every(other =>
    Math.hypot((x-other.x)*width,(y-other.y)*height) >= gap-.01
  )
  if (clear(aim)) return aim
  let best = [star.x,star.y]
  let nearest = Infinity
  for (const other of obstacles) {
    const angle = Math.atan2((aim[1]-other.y)*height,(aim[0]-other.x)*width)
    for (let i=0;i<24;i++) {
      const bearing = angle+i*Math.PI/12
      const point = bounds(other.x+Math.cos(bearing)*gap/width,other.y+Math.sin(bearing)*gap/height)
      const cost = Math.hypot((point[0]-aim[0])*width,(point[1]-aim[1])*height)
      if (cost >= nearest || !clear(point)) continue
      nearest = cost
      best = point
    }
  }
  return best
}
