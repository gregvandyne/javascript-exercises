// Live speech to text (public/js/studio.js "speaking instead of typing"): runs on the audio thread. Turns the mic into
// 16-bit mono PCM at the rate the speech service takes (processorOptions.targetRate: 24000 or 16000) and posts it to
// the page about every 100 ms; the page sends it to our server and keeps nothing.
// The audio context runs at the device's own rate (iPhones and many Androids: 44100 or 48000, whatever is asked; Firefox
// refuses a mic at another rate), so the resampling is done here: each output sample is the average of the input
// samples in its time step (a box filter, enough for speech), or the last value held when the device rate is lower.
// port messages in: 'flush' (send what is buffered now, then 'flushed').
class OombaPcm extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const target = (options && options.processorOptions && options.processorOptions.targetRate) || 16000;
    this.ratio = sampleRate / target;   // sampleRate: the context's rate (an AudioWorkletGlobalScope global)
    this.size = Math.max(160, Math.round(target / 10));
    this.out = new Int16Array(this.size); this.n = 0;
    this.acc = 0; this.sum = 0; this.cnt = 0; this.last = 0;
    this.port.onmessage = e => { if (e.data === 'flush') { this.send(); this.port.postMessage('flushed'); } };
  }
  send() {
    if (!this.n) return;
    const buf = this.out.slice(0, this.n).buffer;
    this.port.postMessage(buf, [buf]);
    this.n = 0;
  }
  push(v) {
    const x = v > 1 ? 1 : v < -1 ? -1 : v;
    this.out[this.n++] = x < 0 ? x * 0x8000 : x * 0x7fff;
    if (this.n === this.size) this.send();
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !input[0]) return true;
    const chans = input.length, len = input[0].length;
    for (let i = 0; i < len; i++) {
      let v = 0; for (let c = 0; c < chans; c++) v += input[c][i];
      v /= chans;
      this.sum += v; this.cnt++; this.acc += 1;
      while (this.acc >= this.ratio) {
        const s = this.cnt ? this.sum / this.cnt : this.last;
        this.last = s; this.push(s);
        this.acc -= this.ratio; this.sum = 0; this.cnt = 0;
      }
    }
    return true;
  }
}
registerProcessor('oomba-pcm', OombaPcm);
