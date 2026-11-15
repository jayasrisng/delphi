// Pure musical rules shared with the Lens. Steps index the common pentatonic scale.
export const ACTIONS = ['echo', 'beat', 'harmonize', 'rest']
export const LAST_STEP = 14

export function availableStars(stars, occupied, phrase) {
  const last = phrase.at(-1)
  const open = stars.filter(star => !occupied.includes(star.id))
  const others = open.filter(star => star.id !== last?.id)
  return others.length ? others : open
}

export function validChoice(choice, stars) {
  return Boolean(choice && ACTIONS.includes(choice.action) &&
    (choice.action === 'rest' || stars.some(star => star.id === choice.star)))
}

export function chooseReply(phrase, stars, beatMs, previous) {
  if (!stars.length || !phrase.length) return { action: 'rest' }
  const last = phrase.at(-1)
  const gaps = phrase.slice(1).map(note => note.ms)
  const busy = gaps.filter(gap => gap < beatMs * .75).length > gaps.length / 2
  const drum = stars.find(star => star.zone === 1)
  const clear = stars.filter(star => star.zone !== last.zone && star.zone !== 1)
  const distinct = clear.filter(star => star.id !== previous?.star)
  const partner = distinct[0] ?? clear[0] ?? stars[0]
  if (busy && previous?.action !== 'rest') return { action: 'rest' }
  if (drum && phrase.length >= 4 && previous?.action === 'echo') return { action: 'beat', star: drum.id }
  return { action: previous?.action === 'echo' ? 'harmonize' : 'echo', star: partner.id }
}

export function parseCue(text) {
  const command = text.toLowerCase().replace(/[^a-z ]/g,' ').trim().replace(/ +/g,' ')
  if (/^(?:(?:hey )?delphi )?(?:please )?(?:(?:play|add|give me) )?(?:(?:a|the|some) )?(?:drums?|beat|percussion)(?: with me)?(?: please)?$/.test(command)) return 'beat'
  if (/^(?:(?:hey )?delphi )?(?:please )?(?:echo(?: me)?|copy me|play that(?: back)?)(?: please)?$/.test(command)) return 'echo'
  if (/^(?:(?:hey )?delphi )?(?:please )?(?:harmonize(?: with me)?|play harmony)(?: please)?$/.test(command)) return 'harmonize'
  return null
}

export function chooseCue(action, phrase, stars, occupied) {
  if (!phrase.length || !['beat','echo','harmonize'].includes(action)) return null
  const open = stars.filter(star => !occupied.includes(star.id))
  const drum = action === 'beat' && open.find(star => star.zone === 1)
  const target = drum || availableStars(stars, occupied, phrase)[0]
  return target ? { action, star:target.id } : null
}

export function replyNotes(choice, phrase, stars, beatMs) {
  if (!validChoice(choice, stars) || choice.action === 'rest' || !phrase.length) return []
  const target = stars.find(star => star.id === choice.star)
  if (choice.action === 'beat') return [0, 1.5].map(beat => ({ ...target, zone:1, beat, gain: .32 }))
  const motif = choice.action === 'echo' ? phrase.slice(-3) : phrase.slice(-2)
  let beat = 0
  return motif.map((event, index) => {
    if (index) beat += event.ms < beatMs * .75 ? .5 : 1
    const shift = choice.action === 'harmonize' ? (event.step <= LAST_STEP-2 ? 2 : -3) : 0
    return { ...target, beat, step: event.step + shift, gain: .26 + .18 * (event.gain ?? .5) }
  })
}
