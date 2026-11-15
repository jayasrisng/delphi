// Never fall back to remote speech recognition. Typed cues always remain available.
export function connectVoiceCue(button, feedback, onCue) {
  const Speech = window.SpeechRecognition ?? window.webkitSpeechRecognition
  if (!Speech || !('processLocally' in Speech.prototype) || !Speech.available || !Speech.install) return () => {}

  const options = { langs:['en-US'], processLocally:true }
  let current
  let generation = 0
  button.hidden = false
  button.onclick = async () => {
    const run = ++generation
    button.disabled = true
    try {
      const status = await Speech.available(options)
      if (run !== generation) return
      if (status !== 'available') {
        if (!['downloadable','downloading'].includes(status)) throw new Error('Language unavailable')
        feedback.textContent = 'Preparing English voice cues on this device…'
        if (!await Speech.install(options)) throw new Error('Language installation failed')
        if (run !== generation) return
        feedback.textContent = 'Voice cues are ready. Choose Speak a cue again to use the microphone.'
        button.disabled = false
        return
      }
      const recognition = new Speech()
      recognition.lang = 'en-US'
      recognition.processLocally = true
      current = recognition
      recognition.onstart = () => {
        if (run === generation) feedback.textContent = 'Listening for a cue…'
      }
      recognition.onresult = event => {
        if (run === generation) onCue(event.results[0][0].transcript)
      }
      recognition.onerror = () => {
        if (run === generation) feedback.textContent = 'Voice cue unavailable. You can type your cue or choose Play drums.'
      }
      recognition.onend = () => {
        if (run !== generation) return
        if (feedback.textContent === 'Listening for a cue…') feedback.textContent = 'No cue heard. Try again or type your cue.'
        current = undefined
        button.disabled = false
      }
      recognition.start()
    } catch {
      if (run !== generation) return
      current = undefined
      feedback.textContent = 'Voice cue unavailable. You can type your cue or choose Play drums.'
      button.disabled = false
    }
  }

  return () => {
    generation++
    current?.abort()
    current = undefined
    button.disabled = false
  }
}
