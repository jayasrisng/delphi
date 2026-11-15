export function connectStarPractice(target) {
  const coach = document.getElementById('star-practice')
  const message = document.getElementById('star-practice-step')
  const dismiss = document.getElementById('star-practice-skip')
  const type = document.getElementById('star-practice-type')
  let phase = 'off'
  const next = document.getElementById('star-practice-next')
  const steps = ['grab','pitch','zone','release','dolphin','recoil','cue','done']
  let mode
  let owner
  let startStep
  let startZone

  function render() {
    coach.hidden = phase === 'off'
    coach.classList.toggle('choosing',phase === 'grab' && mode == null)
    type.hidden = phase !== 'cue'
    next.hidden = phase === 'done' || phase === 'grab' && mode == null
    if (coach.hidden) return
    const grab = { hand:'Pinch the marked star.',
      headset:'Aim and hold the trigger.',
      mouse:'Hold the marked star.',
      fallback:'Camera off. Hold the marked star.' }
    const copy = {
      grab: mode === 'opening' ? 'Opening the camera…' : grab[mode] ?? 'Pick a play mode.',
      pitch:'Move it up or down.',
      zone:'Move sideways to switch sounds.',
      release:'Let go of the star.',
      dolphin: mode === 'hand' ? 'Try pinching Delphi.'
        : mode === 'headset' ? 'Point at Delphi and pull the trigger.'
        : 'Try clicking Delphi.',
      recoil:'Boo! No petting.',
      cue:'Say “Hey Delphi, play Moon Harp.”',
      done: mode === 'hand' ? 'Pinch Record or say “Hey Delphi, record.”'
        : 'Say “Hey Delphi, record.”'
    }
    const needsGrab = owner == null && ['pitch','zone','release'].includes(phase)
    message.textContent = needsGrab ? 'Grab the marked star again.' : copy[phase]
    dismiss.textContent = phase === 'done' ? 'Done' : 'Skip practice'
  }

  function stop() {
    phase = 'off'
    owner = undefined
    render()
  }

  dismiss.onclick = stop
  next.onclick = () => {
    if (phase === 'off' || phase === 'done') return
    phase = steps[steps.indexOf(phase)+1]
    render()
    if (phase === 'done') dismiss.focus()
  }
  return {
    start() { stop(); phase = 'grab'; render() },
    stop,
    input(next) { mode = next; if (phase === 'grab' || phase === 'dolphin') render() },
    highlights(star) { return star === target && ['grab','pitch','zone','release'].includes(phase) },
    wantsDolphin() { return phase === 'dolphin' },
    touchDolphin() {
      if (phase !== 'dolphin') return
      phase = 'recoil'
      render()
    },
    heardCue() {
      if (phase !== 'cue') return
      phase = 'done'
      render()
    },
    grab(key,star) {
      if (!['grab','pitch','zone','release'].includes(phase) || star !== target) return
      owner = key
      startStep = star.step
      startZone = star.zone
      if (phase === 'grab') phase = 'pitch'
      render()
    },
    move(key,star) {
      if (key !== owner || star !== target) return
      if (phase === 'pitch' && star.step !== startStep) {
        phase = 'zone'
        render()
      }
      if (phase === 'zone' && star.zone !== startZone) {
        phase = 'release'
        render()
      }
    },
    release(key,star,placed) {
      if (key !== owner || star !== target) return
      if (placed && phase === 'release') phase = 'dolphin'
      owner = undefined
      render()
    }
  }
}
