/* Original, optional four-bar production sketch. No samples, vocals or network requests. */
(() => {
  "use strict";
  const scene = document.getElementById("music-lead");
  const button = document.getElementById("ml-audition-button");
  const status = document.getElementById("ml-audio-state");
  const audition = scene?.querySelector(".ml-audition");
  const note = document.getElementById("ml-audition-note");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!scene || !button || !status || !audition || !note || !AudioContextClass) return;

  audition.hidden = false;
  note.hidden = false;
  let active = null;
  let pendingContext = null;
  let request = 0;
  const beat = 60 / 114;
  const bar = beat * 4;
  const duration = bar * 4;
  const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

  function stop(message = "4 bars · 8.4 seconds") {
    request += 1;
    if (pendingContext) {
      pendingContext.close().catch(() => {});
      pendingContext = null;
    }
    if (active) {
      const session = active;
      active = null;
      clearTimeout(session.timer);
      session.master.gain.cancelScheduledValues(session.context.currentTime);
      session.master.gain.setValueAtTime(0, session.context.currentTime);
      for (const source of session.sources) {
        try { source.stop(); } catch (_) { /* Sources that already ended need no cleanup. */ }
      }
      session.master.disconnect();
      session.context.close().catch(() => {});
    }
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = 'Play synthetic sketch <span aria-hidden="true">&#9654;</span>';
    status.textContent = message;
  }

  function envelope(context, master, start, length, peak, attack = .006) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + length);
    gain.connect(master);
    return gain;
  }

  function schedule(session, start) {
    const { context, master, sources } = session;
    const noise = context.createBuffer(1, Math.ceil(context.sampleRate * .18), context.sampleRate);
    const noiseData = noise.getChannelData(0);
    /* Fixed pseudo-random noise keeps the sketch identical on each audition. */
    let seed = 73;
    for (let i = 0; i < noiseData.length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      noiseData[i] = (seed / 2147483648) * .72;
    }

    function tone(at, pitch, length, peak, type = "sine", attack = .006) {
      const source = context.createOscillator();
      source.type = type;
      source.frequency.setValueAtTime(frequency(pitch), at);
      source.connect(envelope(context, master, at, length, peak, attack));
      sources.push(source);
      source.start(at);
      source.stop(at + length + .012);
    }

    function kick(at) {
      const source = context.createOscillator();
      source.type = "sine";
      source.frequency.setValueAtTime(125, at);
      source.frequency.exponentialRampToValueAtTime(52, at + .08);
      source.connect(envelope(context, master, at, .18, .75, .002));
      sources.push(source);
      source.start(at);
      source.stop(at + .20);
    }

    function noiseHit(at, hat, peak) {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      source.buffer = noise;
      filter.type = hat ? "highpass" : "bandpass";
      filter.frequency.value = hat ? 7200 : 1850;
      filter.Q.value = hat ? .6 : .75;
      source.connect(filter);
      filter.connect(envelope(context, master, at, hat ? .045 : .13, peak, .002));
      sources.push(source);
      source.start(at);
      source.stop(at + (hat ? .065 : .16));
      if (!hat) tone(at, 49, .075, .10, "triangle", .002);
    }

    const chords = [
      { bass: 30, notes: [54, 57, 61, 64, 68] }, // F#m9
      { bass: 38, notes: [50, 54, 57, 61] },     // Dmaj7
      { bass: 33, notes: [45, 52, 59, 61] },     // Aadd9
      { bass: 40, notes: [52, 56, 59, 61] }      // E6
    ];
    for (let b = 0; b < 4; b += 1) {
      const at = start + b * bar;
      const chord = chords[b];
      [0, 6, 10].forEach(step => kick(at + step * beat / 4));
      [4, 12].forEach(step => noiseHit(at + step * beat / 4, false, .34));
      for (let step = 0; step < 16; step += 2) {
        const offbeat = step % 4 === 2;
        noiseHit(at + step * beat / 4 + (offbeat ? .018 : 0), true, offbeat ? .18 : .115);
      }
      // Bass answers the pickup; rests keep the kick transient readable.
      [0, 7, 11].forEach(step => tone(at + step * beat / 4 + .055, chord.bass, .20, .34));
      chord.notes.forEach(pitch => tone(at + .02, pitch, bar - .10, .034, "triangle", .07));
    }
  }

  async function start() {
    const token = ++request;
    let context;
    try {
      context = new AudioContextClass();
      pendingContext = context;
      button.setAttribute("aria-pressed", "true");
      button.innerHTML = 'Stop sketch <span aria-hidden="true">&#9632;</span>';
      status.textContent = "Starting sketch…";
      await context.resume();
      if (token !== request || document.hidden) {
        if (pendingContext === context) pendingContext = null;
        if (context.state !== "closed") await context.close();
        return;
      }
      pendingContext = null;
      const master = context.createGain();
      master.gain.value = .23;
      master.connect(context.destination);
      const session = { context, master, sources: [], timer: null };
      active = session;
      const startTime = context.currentTime + .05;
      schedule(session, startTime);
      button.setAttribute("aria-pressed", "true");
      button.innerHTML = 'Stop sketch <span aria-hidden="true">&#9632;</span>';
      status.textContent = "Playing · 114 BPM";
      session.timer = setTimeout(() => {
        if (active === session) stop("Sketch finished · 4 bars");
      }, (duration + .08) * 1000);
    } catch (_) {
      if (pendingContext === context) pendingContext = null;
      if (context && context !== active?.context) context.close().catch(() => {});
      if (token === request) stop("Audio unavailable in this browser");
    }
  }

  button.addEventListener("click", () => {
    if (active || pendingContext) stop();
    else start();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  window.addEventListener("pagehide", () => stop());
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) stop();
    }, { threshold: 0 }).observe(scene);
  }
})();
