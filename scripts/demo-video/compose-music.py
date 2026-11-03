"""An original ~57 s upbeat, kid-friendly instrumental for the Oomba demo, synthesized from scratch (numpy only).
F major, 119.2 BPM (so bar 26 lands exactly on the end card at 52.35 s). Writes a 48 kHz stereo WAV (unmastered).
Sections (bars): intro 0-2, verse 2-11 (Oomba Live), lift 12-18 (Builder), bright 19-25 (play + montage),
resolve 26 (end card) with a held chord and a 1.5 s fade."""
import numpy as np, wave, sys

SR = 48000
END_CARD = 52.35
BAR = END_CARD / 26.0          # seconds per bar
BEAT = BAR / 4
E8 = BEAT / 2
TOTAL = 57.4
N = int(TOTAL * SR) + SR
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def env_adsr(n, a, d, s, r_, sus_len):
    a, d, r_ = int(a * SR), int(d * SR), int(r_ * SR)
    e = np.zeros(n)
    i = 0
    if a: e[:min(a, n)] = np.linspace(0, 1, a)[:n]; i = a
    if i < n and d: k = min(d, n - i); e[i:i + k] = np.linspace(1, s, d)[:k]; i += k
    hold = int(sus_len * SR)
    if i < n: k = min(hold, n - i); e[i:i + k] = s; i += k
    if i < n and r_: k = min(r_, n - i); e[i:i + k] = np.linspace(s, 0, r_)[:k]
    return e
def add(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR); j = min(N, i + len(sig)); sig = sig[:j - i] * gain
    L[i:j] += sig * np.sqrt(0.5 * (1 - pan)); R[i:j] += sig * np.sqrt(0.5 * (1 + pan))

def marimba(m, dur=0.6, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = mtof(m)
    mod = np.sin(2 * np.pi * f * 4.0 * t) * 1.6 * np.exp(-t * 28)       # bright mallet attack
    car = np.sin(2 * np.pi * f * t + mod)
    body = car * np.exp(-t * 5.5) + 0.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 9)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.05
    return (body + click) * vel * np.minimum(1, t / 0.002)
def pluck(m, dur=0.35, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = mtof(m)
    s = sum(np.sin(2 * np.pi * f * h * t) / h * np.exp(-t * (6 + 5 * h)) for h in range(1, 7))
    return s * vel * np.minimum(1, t / 0.003)
def pad(ms, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for m in ms:
        f = mtof(m)
        for det in (-0.12, 0.0, 0.11):
            ff = f * 2 ** (det / 12)
            s += sum(np.sin(2 * np.pi * ff * h * t + h) / (h ** 1.6) for h in range(1, 6))
    s /= max(1, len(ms) * 3)
    vib = 1 + 0.003 * np.sin(2 * np.pi * 5 * t)
    return s * vib * env_adsr(n, 0.35, 0.2, 0.8, 0.6, max(0, dur - 1.15)) * vel
def bass(m, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 6) + 0.12 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 10)
    return s * env_adsr(n, 0.004, 0.12, 0.6, 0.06, max(0, dur - 0.19)) * vel
def kick(vel=1.0):
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t * 30); ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * np.exp(-t * 9) + rng.standard_normal(n) * np.exp(-t * 300) * 0.08) * vel
def clap(vel=1.0):
    n = int(0.25 * SR); t = np.arange(n) / SR; nz = rng.standard_normal(n)
    nz = np.diff(np.concatenate([[0], nz]))  # brighter
    e = np.exp(-t * 22) * (1 + 0.6 * ((t > 0.012) & (t < 0.02)))
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    return (nz * 0.35 * e + tone) * vel
def hat(vel=1.0, open_=False):
    n = int((0.22 if open_ else 0.06) * SR); t = np.arange(n) / SR
    nz = np.diff(np.concatenate([[0], rng.standard_normal(n)])); nz = np.diff(np.concatenate([[0], nz]))
    return nz * 0.18 * np.exp(-t * (14 if open_ else 70)) * vel
def shaker(vel=1.0):
    n = int(0.09 * SR); t = np.arange(n) / SR
    nz = np.diff(np.concatenate([[0], rng.standard_normal(n)]))
    return nz * 0.1 * np.sin(np.pi * np.minimum(1, t / 0.09)) * vel
def crash(vel=1.0):
    n = int(2.2 * SR); t = np.arange(n) / SR
    nz = np.diff(np.concatenate([[0], rng.standard_normal(n)]))
    return nz * 0.22 * np.exp(-t * 2.2) * vel
def riser(dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    nz = rng.standard_normal(n); k = (t / dur) ** 2
    return nz * k * 0.08 * vel

# Harmony: F  C  Dm  Bb  (I V vi IV), with a lift to Gm C in the Builder section
F, C, Dm, Bb, Gm, Am = 53, 48, 50, 46, 55, 57
CH = {F: [65, 69, 72], C: [64, 67, 72], Dm: [62, 65, 69], Bb: [62, 65, 70], Gm: [62, 67, 70], Am: [64, 67, 69]}
def prog(bar):
    if 12 <= bar < 19: return [Dm, Bb, F, C, Dm, Bb, Gm, C][(bar - 12) % 8]
    return [F, C, Dm, Bb][bar % 4]

# Melodies (MIDI per eighth note, None = rest), original motifs
VERSE = [
    [72, None, 74, 72, 69, None, 65, None],
    [76, None, 74, 72, 67, None, None, 72],
    [74, None, 77, 74, 69, None, 72, 74],
    [74, None, 72, 70, 69, None, 72, None],
]
BRIGHT = [
    [77, None, 76, 77, 81, None, 77, 72],
    [79, None, 76, 72, 74, 76, 79, None],
    [81, None, 79, 77, 74, None, 77, 79],
    [82, None, 81, 79, 77, None, 74, 76],
]

for bar in range(26):
    t0 = bar * BAR; root = prog(bar); chord = CH[root]
    section = 'intro' if bar < 2 else 'verse' if bar < 12 else 'lift' if bar < 19 else 'bright'
    # pad
    pv = {'intro': 0.5, 'verse': 0.45, 'lift': 0.55, 'bright': 0.5}[section]
    add(pad([m - 12 for m in chord] + [chord[0]], BAR + 0.5, pv), t0, pan=-0.15)
    add(pad([m - 12 + 7 for m in chord[:1]], BAR + 0.5, pv * 0.4), t0, pan=0.25)
    # bass
    if section != 'intro':
        pat = [0, 2, 3, 4, 6] if section == 'verse' else [0, 1, 2, 3, 4, 5, 6, 7]
        for k in pat:
            m = root - 12 + (12 if (section != 'verse' and k in (3, 7)) else 0)
            add(bass(m, E8 * 0.9, 0.55 if section == 'verse' else 0.6), t0 + k * E8)
    # drums
    if section == 'intro':
        for k in range(8): add(shaker(0.5 + 0.3 * (k % 2)), t0 + k * E8, pan=0.3)
    else:
        for b in (0, 2): add(kick(0.9), t0 + b * BEAT)
        if section != 'verse' or bar >= 6:
            for b in (1, 3): add(clap(0.7 if section == 'verse' else 0.8), t0 + b * BEAT, pan=0.05)
        if section == 'bright': add(kick(0.6), t0 + 2.5 * BEAT)
        step = 4 if section in ('lift', 'bright') else 2
        for k in range(4 * step):
            v = (0.55 if k % 2 == 0 else 0.35) if step == 4 else (0.5 if k % 2 else 0.3)
            add(hat(v), t0 + k * BEAT / step, pan=0.35)
        if section == 'bright' and bar % 2 == 1: add(hat(0.4, True), t0 + 3.5 * BEAT, pan=0.35)
    # melody
    if section == 'intro':
        for k, m in enumerate([chord[0], chord[1], chord[2], chord[1]] * 2):
            add(marimba(m + 12, 0.5, 0.35), t0 + k * E8, pan=0.2)
    elif section == 'verse':
        mel = VERSE[bar % 4]
        for k, m in enumerate(mel):
            if m: add(marimba(m, 0.7, 0.55), t0 + k * E8, pan=0.15)
    elif section == 'lift':
        # sixteenth-note arpeggio, rising each bar, plus a soft counter line
        arp = chord + [chord[1] + 12] if bar % 2 else chord + [chord[0] + 12]
        for k in range(16):
            add(pluck(arp[k % 4] + (12 if bar >= 16 else 0), 0.25, 0.32 + 0.1 * (k % 4 == 0)), t0 + k * BEAT / 4, pan=-0.3 + 0.6 * ((k % 4) / 3))
        if bar % 2 == 0:
            for k, m in enumerate([chord[2] + 12, None, None, chord[1] + 12, None, None, chord[0] + 12, None]):
                if m: add(marimba(m, 0.8, 0.4), t0 + k * E8, pan=0.2)
    else:
        mel = BRIGHT[bar % 4]
        for k, m in enumerate(mel):
            if m:
                add(marimba(m, 0.7, 0.6), t0 + k * E8, pan=0.1)
                add(pluck(m - 12, 0.3, 0.18), t0 + k * E8, pan=-0.25)
    # transitions
    if bar == 1: add(riser(BAR, 0.8), t0)
    if bar == 18:
        add(riser(BAR, 1.0), t0)
        for k in range(4): add(clap(0.5 + 0.12 * k), t0 + 3 * BEAT + k * BEAT / 4)
    if bar in (2, 12, 19): add(crash(0.6 if bar != 19 else 0.9), t0, pan=-0.2)
    if bar == 25:
        for k in range(8): add(clap(0.25 + 0.06 * k), t0 + 2 * BEAT + k * BEAT / 4)

# Resolve on the end card: a big F chord on the downbeat, held, plus a little marimba sparkle
t0 = 26 * BAR
add(kick(1.0), t0); add(crash(1.0), t0, pan=-0.2)
add(bass(F - 12, 3.5, 0.7), t0)
add(pad([53, 57, 60, 65, 69, 72], 5.0, 0.7), t0)
for k, m in enumerate([72, 77, 81, 84]): add(marimba(m, 1.6, 0.5 - 0.06 * k), t0 + k * E8, pan=-0.3 + 0.2 * k)

# Reverb: convolution with a synthetic room (1.6 s), mixed in gently
ir_n = int(1.6 * SR); ti = np.arange(ir_n) / SR
irL = rng.standard_normal(ir_n) * np.exp(-ti * 4.2); irR = rng.standard_normal(ir_n) * np.exp(-ti * 4.2)
irL[:int(0.012 * SR)] = 0; irR[:int(0.017 * SR)] = 0
def conv(x, h):
    n = 1 << int(np.ceil(np.log2(len(x) + len(h))))
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(h, n), n)[:len(x)]
wetL, wetR = conv(L, irL), conv(R, irR)
wetL /= np.max(np.abs(wetL)) + 1e-9; wetR /= np.max(np.abs(wetR)) + 1e-9
dry = max(np.max(np.abs(L)), np.max(np.abs(R)))
outL = L / dry + 0.16 * wetL; outR = R / dry + 0.16 * wetR
# gentle low cut (one-pole high-pass at ~35 Hz)
def hp(x, fc=35):
    w = int(SR / fc); c = np.cumsum(np.concatenate([np.zeros(w), x, np.zeros(w)]))
    ma = (c[w:] - c[:-w]) / w
    return x - ma[w // 2: w // 2 + len(x)]
outL, outR = hp(outL), hp(outR)
# fade: the final 1.5 s
n_tot = int(TOTAL * SR); fade = int(1.5 * SR)
outL, outR = outL[:n_tot], outR[:n_tot]
outL[-fade:] *= np.linspace(1, 0, fade) ** 1.5; outR[-fade:] *= np.linspace(1, 0, fade) ** 1.5
outL[:int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR)); outR[:int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
peak = max(np.max(np.abs(outL)), np.max(np.abs(outR))); outL /= peak / 0.8; outR /= peak / 0.8
data = (np.stack([outL, outR], 1) * 32767).astype('<i2')
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'music-raw.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
print('bar', round(BAR, 4), 'bpm', round(240 / BAR, 2), 'len', TOTAL)
