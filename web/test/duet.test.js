import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chooseCue, parseCue, replyNotes } from '../src/duet.js'

const stars = [
  { id:0, zone:0, step:5 },
  { id:1, zone:1, step:6 },
  { id:2, zone:2, step:7 }
]
const phrase = [{ ...stars[0], ms:0, gain:.5 }, { ...stars[0], step:8, ms:250, gain:.6 }]

test('recognizes short commands and rejects unrelated or negated requests', () => {
  assert.equal(parseCue('Delphi, play the drum!'), 'beat')
  assert.equal(parseCue('Play that back.'), 'echo')
  assert.equal(parseCue('Harmonize with me'), 'harmonize')
  assert.equal(parseCue("Don't play the drum"), null)
})

test('puts drum accents on a free star without changing its instrument zone', () => {
  assert.deepEqual(chooseCue('beat',phrase,stars,[0]),{ action:'beat', star:1 })
  const reply = chooseCue('beat',phrase,stars,[0,1])
  assert.deepEqual(reply,{ action:'beat', star:2 })
  const notes = replyNotes(reply,phrase,stars,470)
  assert.deepEqual(notes.map(({zone,beat}) => [zone,beat]),[[1,0],[1,1.5]])
  assert.equal(stars[2].zone,2)
})

test('waits for player music or a free star, and echoes the phrase on another star', () => {
  assert.equal(chooseCue('echo',[],stars,[]),null)
  assert.equal(chooseCue('echo',phrase,stars,[0,1,2]),null)
  const choice = chooseCue('echo',phrase,stars,[1])
  assert.deepEqual(choice,{ action:'echo', star:2 })
  assert.deepEqual(replyNotes(choice,phrase,stars,470).map(({step}) => step),[5,8])
})
