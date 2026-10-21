import numpy as np, wave, os
SR=44100; DUR=62.0
n=int(SR*DUR)
sfx=np.zeros(n, dtype=np.float64)
def add(sig, at, gain=1.0):
    i0=int(at*SR); i1=min(n, i0+len(sig))
    if i1<=i0: return
    sfx[i0:i1] += gain*sig[:i1-i0]

def whoosh(dur=0.75, f0=120, f1=1800, rev=False):
    k=int(dur*SR); tt=np.arange(k)/SR
    if rev: fr=np.linspace(f1,f0,k)
    else:   fr=np.linspace(f0,f1,k)
    ph=np.cumsum(2*np.pi*fr/SR)
    noise=np.random.default_rng(7).normal(0,1,k)
    # 噪声经过扫频带通近似：用噪声乘扫频正弦 + 一阶低通
    sig=(0.55*np.sin(ph)+0.45*noise)*np.exp(-tt*3.2)
    return sig/np.max(np.abs(sig))

def thud(f=58, dur=0.55):
    k=int(dur*SR); tt=np.arange(k)/SR
    return np.sin(2*np.pi*f*tt)*np.exp(-tt*9.0)

def stamp(dur=0.42):
    k=int(dur*SR); tt=np.arange(k)/SR
    body=np.sin(2*np.pi*180*tt)*np.exp(-tt*22)
    click=np.random.default_rng(11).normal(0,1,k)*np.exp(-tt*90)*0.6
    return body+click

def bubble_pop(f=1500, dur=0.14):
    k=int(dur*SR); tt=np.arange(k)/SR
    return np.sin(2*np.pi*f*(1+tt*3)*tt)*np.exp(-tt*30)

# ── 镜转场 whoosh（6 个镜头切点）──
for at in [6.0,16.0,26.0,38.0,48.0,56.0]:
    add(whoosh(0.8, 100, 1600), at-0.32, 0.55)

# ── 入水/下沉 thud（镜1 开场 + 镜4 后台）──
add(thud(52,0.7), 0.15, 0.75)
add(thud(46,0.8), 26.1, 0.6)

# ── 气泡（镜1 上浮段、镜2 化形段）──
for at,g in [(0.9,0.5),(1.8,0.4),(3.0,0.45),(4.2,0.35),(6.6,0.4),(8.0,0.35),(12.0,0.3)]:
    add(bubble_pop(1200+int(at*40),0.15), at, g*0.55)

# ── 炸毛：连续抖动 tick（38.2-40.0）──
for i,at in enumerate(np.arange(38.3,40.1,0.09)):
    add(stamp(0.11), float(at), 0.3 if i%2==0 else 0.22)

# ── 镜3 “是鲸不是鱼” 强调 hit（17.9、18.3 两个 tick 出现）──
add(stamp(0.3), 17.95, 0.55)
add(stamp(0.3), 18.28, 0.5)

# ── 投票卡逐张出现：三声咔哒 ──
for at in [56.9,57.15,57.4]:
    add(stamp(0.18), at, 0.42)

# ── 结尾 sting（58.1 hint 出现）──
k=int(1.10*SR); tt=np.arange(k)/SR
sting=(np.sin(2*np.pi*880*tt)*0.5+np.sin(2*np.pi*1320*tt)*0.3+np.sin(2*np.pi*1760*tt)*0.2)*np.exp(-tt*4.2)
add(sting, 58.1, 0.5)

peak=np.max(np.abs(sfx)); 
if peak>0: sfx=sfx/peak*0.72
with wave.open('audio/sfx.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((sfx*32767).astype('<i2').tobytes())
print(f'sfx.wav  {DUR}s  peak={np.max(np.abs(sfx)):.3f}')
