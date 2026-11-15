// Bellaton is the Studio name for the pack's Glass Bells recording.
export const voices = [
  { name:'Moon Harp', file:'moon-harp', root:109.91 },
  { name:'Soft Gong', file:'soft-gong', root:294.88 },
  { name:'Bellaton', file:'glass-bells', root:220.96 },
  { name:'Water Glass', file:'water-glass', root:564 }
]

export function voiceIndex(star) {
  return voices[star.zone] ? star.zone : 0
}

export function zoneAt(x, previous) {
  const position = Math.max(0,Math.min(.9999,x))
  const count = voices.length
  if (previous != null && position >= previous/count-.012 && position <= (previous+1)/count+.012) return previous
  return Math.floor(position*count)
}

export function instrumentCue(text) {
  let name = text.toLowerCase().replace(/[^a-z ]/g,' ').trim().replace(/ +/g,' ')
  name = name.replace(/^(?:hey(?: (?:delphi|delfi|delphy|delphie))?|delphi|delfi|delphy|delphie) /,'')
    .replace(/^(?:(?:can|could|would) you (?:please )?|i (?:want to|wanna|would like to) |let s |please )/,'')
    .replace(/^(?:play|try|give me) /,'')
    .replace(/^(?:(?:with|the|some) )+/,'')
    .replace(/(?: with me| please)+$/,'')
  const aliases = { harp:0,'moon heart':0,gong:1,'soft gone':1,'glass bells':2,bells:2,
    'bella ton':2,bellatone:2,'bell tone':2,'water class':3,'water glasses':3 }
  const index = voices.findIndex(item => item.name.toLowerCase() === name)
  return index >= 0 ? index : Object.hasOwn(aliases,name) ? aliases[name] : null
}

export function alternatingCue(text) {
  const normalized = text.toLowerCase().trim()
    .replace(/[.!?]+$/,'')
    .replace(/^(?:hey(?:\s+(?:delphi|delfi|delphy|delphie))?|delphi|delfi|delphy|delphie)[,\s]+/,'')
    .replace(/^(?:keep\s+)?alternat(?:e|ing)\s+(?:between\s+)?/,'')
    .replace(/\s+(?:on repeat|back and forth)$/,'')
  const parts = normalized.split(/\s*,\s*(?:(?:and )?then\s+)?|\s+(?:and then|then|and)\s+/)
  if (parts.length < 2) return null
  const first = parts[0].match(/^(.*?)\s+for\s+(one|two|three|four|five|six|seven|eight|\d+(?:\.\d+)?)\s+seconds?$/)
  if (first) parts[0] = first[1]
  const zones = parts.map(part => {
    const name = part.trim().replace(/^(?:(?:go\s+)?back\s+to\s+|go\s+to\s+|return\s+to\s+)/,'')
    return instrumentCue(/^(?:play|try)\b/.test(name) ? name : 'play '+name)
  })
  if (zones.some(zone => zone == null)) return null
  const distinct = [...new Set(zones)]
  if (distinct.length !== 2) return null
  const words = ['one','two','three','four','five','six','seven','eight']
  const duration = first ? (Number(first[2]) || words.indexOf(first[2])+1) : 1
  return { zones:distinct, duration:Math.max(.25,Math.min(8,duration)) }
}

export function repeatCue(text) {
  const normalized = text.toLowerCase().trim()
    .replace(/[.!?]+$/,'')
    .replace(/^(?:hey(?:\s+(?:delphi|delfi|delphy|delphie))?|delphi)[,\s]+/,'')
  const match = normalized.match(/^(.*?)\s+(?:every\s+(one|two|three|four|five|six|seven|eight|\d+(?:\.\d+)?)\s+seconds?|at intervals)$/)
  if (!match) return null
  const zone = instrumentCue(match[1])
  if (zone == null && !/^play (?:something|a note)(?: with me)?$/.test(match[1])) return null
  const words = ['one','two','three','four','five','six','seven','eight']
  const seconds = match[2] ? Number(match[2]) || words.indexOf(match[2])+1 : 2
  const interval = Math.max(.35,Math.min(12,seconds))
  return { zones:[zone], interval, duration:Math.min(.85,interval*.67) }
}
