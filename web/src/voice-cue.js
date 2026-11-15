import { instrumentCue, voices } from './satie.js'

export function connectVoiceCue(button, setStatus, onCue, fallback, accepts) {
  const Speech = window.SpeechRecognition ?? window.webkitSpeechRecognition
  const hasLocal = Speech && typeof Speech.available === 'function' && 'processLocally' in Speech.prototype
  const options = { langs:['en-US'], processLocally:true }
  let current, retry, generation = 0, enabled = false, wanted = false, local = false, failures = 0

  function mark(on) {
    enabled = on
    button.setAttribute('aria-pressed',String(on))
    button.textContent = on ? 'Opening mic…' : 'Cue Delphi'
  }

  function stop() {
    wanted = false
    suspend()
  }

  function suspend() {
    generation++
    clearTimeout(retry)
    const recognition = current
    current = undefined
    mark(false)
    recognition?.abort()
  }

  function fail(run,message) {
    if (run !== generation) return
    stop()
    fallback(message)
  }

  function listen(run) {
    if (run !== generation || !enabled) return
    try {
      const recognition = new Speech()
      recognition.lang = 'en-US'
      if (hasLocal) recognition.processLocally = local
      recognition.continuous = true
      recognition.maxAlternatives = 5
      if (local && 'phrases' in recognition && typeof window.SpeechRecognitionPhrase === 'function') {
        recognition.phrases = ['Moon Harp','Soft Gong','Bellaton','Water Glass','Hey Delphi','start recording','every two seconds']
          .map(phrase => new window.SpeechRecognitionPhrase(phrase,3))
      }
      current = recognition
      recognition.onstart = () => {
        if (run === generation && current === recognition) {
          button.textContent = 'Voice on'
          setStatus('Delphi is listening…','listening',1900)
        }
      }
      recognition.onresult = event => {
        if (run !== generation || current !== recognition) return
        failures = 0
        for (let i=event.resultIndex ?? 0;i<event.results.length;i++) {
          if (event.results[i].isFinal === false) continue
          const alternatives = Array.from(event.results[i],result => result.transcript)
          const best = alternatives[0] ?? ''
          const choices = alternatives.filter(accepts)
          const zones = [...new Set(choices.map(instrumentCue).filter(zone => zone != null))]
          if (/\bwater gong\b/i.test(best) && /\b(?:hey|play|try)\b/i.test(best)) {
            setStatus('Soft Gong or Water Glass?','clarify',2500)
          } else if (accepts(best)) onCue(best)
          else if (zones.length > 1) {
            setStatus(zones.slice(0,2).map(zone => voices[zone].name).join(' or ')+'?','clarify',2500)
          } else if (choices.length) onCue(choices[0])
          else if (/^(?:(?:hey\s+)?(?:delphi|delfi|delphy|delphie)|play|try)\b/i.test(best)) {
            setStatus('Try “play Moon Harp every two seconds.”','clarify',2500)
          }
        }
      }
      recognition.onerror = event => {
        if (run !== generation || current !== recognition || event.error === 'no-speech') return
        if (local && ['language-not-supported','phrases-not-supported','network'].includes(event.error)) {
          local = false
          current = undefined
          listen(run)
          return
        }
        if (['network','aborted','audio-capture'].includes(event.error) && failures < 3) {
          current = undefined
          button.textContent = 'Reconnecting mic…'
          setStatus('Reconnecting microphone…','opening')
          retry = setTimeout(() => listen(run),600*++failures)
          return
        }
        fail(run,event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone blocked. You can type instead.'
          : 'Voice unavailable. Type a cue.')
      }
      recognition.onend = () => {
        if (run !== generation || !enabled || current !== recognition) return
        current = undefined
        button.textContent = 'Reconnecting mic…'
        retry = setTimeout(() => listen(run),350)
      }
      recognition.start()
    } catch {
      fail(run,'Couldn’t start on-device voice. Type a cue.')
    }
  }

  function start() {
    if (enabled || document.hidden) return
    if (!Speech) { fallback('Voice isn’t available in this browser. Type a cue.'); return }
    wanted = true
    failures = 0
    const run = ++generation
    mark(true)
    setStatus('Opening microphone…','opening')
    // Start the broadly supported recognizer within the entry click. Use local
    // recognition on compatible browsers when their English pack is installed.
    local = false
    if (!hasLocal) { listen(run); return }
    let deadline
    Promise.race([
      Promise.resolve().then(() => Speech.available(options)).catch(() => 'unavailable'),
      new Promise(resolve => { deadline = setTimeout(() => resolve('unavailable'),600) })
    ]).then(status => {
      clearTimeout(deadline)
      if (run !== generation) return
      local = status === 'available'
      listen(run)
    })
  }

  button.onclick = () => {
    if (wanted) {
      stop()
      setStatus('Voice off.','')
    } else start()
  }

  document.addEventListener('visibilitychange',() => {
    if (document.hidden) {
      suspend()
    } else if (wanted) start()
  })
  return { start, stop }
}
