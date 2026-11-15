const slides = [
  { motion:'pitch', gesture:'🫰', title:'Pinch a star. Move it to change the sound.' },
  { motion:'duet', gesture:'♪', title:'Say “Hey Delphi, play Moon Harp.” No petting.' },
  { motion:'take', gesture:'●', title:'Record 30 seconds. Stars and music only.' },
  { motion:'share', gesture:'↗', title:'Keep your duet or share it to the Gallery.' }
]

export function connectOnboarding(startPractice) {
  const get = id => document.getElementById(id)
  const dialog = get('studio-onboarding')
  const title = get('onboarding-title')
  const motion = get('onboarding-motion')
  const gesture = get('onboarding-gesture')
  const progress = get('onboarding-progress')
  const answers = get('onboarding-answer')
  const controls = get('onboarding-controls')
  const next = get('onboarding-next')
  const practice = get('onboarding-practice')
  const gallery = get('onboarding-gallery')
  const seenKey = 'delphy-studio-intro-v1'
  let branch = false
  let step = -2

  function remember() {
    try { localStorage.setItem(seenKey,'seen') } catch { /* Onboarding still works without storage. */ }
  }

  function render() {
    const question = step === -2
    const coldOpen = step === -1
    const slide = question ? { motion:'question', gesture:'?', title:'Can you play an instrument?' }
      : coldOpen ? { motion:'launch', gesture:'♪', title:branch ? 'Ever played an instrument in midair?' : 'Your first instrument is space.' }
      : slides[step]
    title.textContent = slide.title
    gesture.textContent = slide.gesture
    motion.dataset.motion = slide.motion
    progress.textContent = question ? '' : `${step+2} / ${slides.length+1}`
    answers.hidden = !question
    controls.hidden = question
    gallery.hidden = step !== slides.length-1
    next.textContent = coldOpen ? 'Watch quick guide' : 'Next'
    next.hidden = !gallery.hidden
    practice.textContent = gallery.hidden ? 'Try it live' : 'Let’s play'
  }

  function finish() {
    remember()
    dialog.close()
  }

  function advance() {
    if (step === slides.length-1) finish()
    else {
      step++
      render()
    }
  }

  function open() {
    if (dialog.open) return
    step = -2
    render()
    dialog.showModal()
    answers.querySelector('button').focus()
  }

  for (const [index,button] of [...answers.querySelectorAll('button')].entries()) {
    button.onclick = () => {
      branch = index === 0
      advance()
      practice.focus()
    }
  }
  practice.onclick = () => {
    finish()
    startPractice()
  }
  next.onclick = advance
  gallery.onclick = remember
  get('onboarding-skip').onclick = finish
  dialog.oncancel = remember
  get('show-onboarding').onclick = open
  get('replay-onboarding').onclick = open
  let seen
  try { seen = localStorage.getItem(seenKey) } catch { /* Show the first visit when storage is unavailable. */ }
  if (!seen) open()
}
