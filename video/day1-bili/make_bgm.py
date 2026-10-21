import numpy as np, wave, os
SR=44100; DUR=62.0
n=int(SR*DUR); t=np.arange(n)/SR
out=np.zeros(n, dtype=np.float64)

# ── 深海底色：低频铺底 + 缓慢呼吸和弦 ──
def env(x, a, d, s, r, dur):
    e=np.ones_like(x)
    i_a=int(a*SR); i_d=int(d*SR); i_r=int(r*SR); i_s=max(0,len(x)-i_a-i_d-i_r)
    e[:i_a]=np.linspace(0,1,i_a)
    e[i_a:i_a+i_d]=np.linspace(1,s,i_d)
    e[i_a+i_d:i_a+i_d+i_s]=s
    e[i_a+i_d+i_s:]=np.linspace(s,0,i_r)
    return e

# 低频 drone（两个差频正弦，营造深海压迫感）
drone = 0.10*np.sin(2*np.pi*55*t) + 0.07*np.sin(2*np.pi*55.4*t) + 0.05*np.sin(2*np.pi*82.5*t)
drone *= (0.75 + 0.25*np.sin(2*np.pi*0.06*t))
out += drone

# ── 和弦垫：Am - F - C - G 循环，每 8 秒一个，柔化三角波 ──
chords=[[220.0,261.63,329.63],[174.61,220.0,261.63],[261.63,329.63,392.0],[196.0,246.94,293.66]]
seg=8.0
for k in range(int(DUR/seg)+1):
    st=k*seg; dur=min(seg*1.25, DUR-st)
    if dur<=0: break
    i0=int(st*SR); i1=min(n,int((st+dur)*SR))
    if i1<=i0: continue
    tt=t[i0:i1]-st
    ch=chords[k%len(chords)]
    layer=np.zeros(len(tt))
    for f in ch:
        # 三角波近似（奇数谐波叠加）
        w=np.zeros(len(tt))
        for h in range(1,6,2):
            w += ((-1)**((h-1)//2))*(1.0/(h*h))*np.sin(2*np.pi*f*h*tt)
        layer += w
    layer *= env(tt, 2.2, 1.4, 0.55, 2.4, dur)
    out[i0:i1] += 0.055*layer

# ── 水面气泡颗粒音（稀疏，用带包络的短正弦簇）──
rng=np.random.default_rng(20261021)
for _ in range(140):
    st=rng.uniform(0,DUR-0.3); f=rng.uniform(700,2400); dur=rng.uniform(0.05,0.16)
    i0=int(st*SR); i1=min(n,int((st+dur)*SR))
    if i1<=i0: continue
    tt=t[i0:i1]-st
    e=np.exp(-tt*38.0)
    out[i0:i1] += 0.014*np.sin(2*np.pi*f*tt)*e

# ── 低频脉动（每 4 秒一次“心跳”，深海呼吸）──
for k in range(int(DUR/4)+1):
    st=k*4.0
    i0=int(st*SR); i1=min(n,int((st+0.9)*SR))
    if i1<=i0: continue
    tt=t[i0:i1]-st
    e=np.exp(-tt*5.5)
    out[i0:i1] += 0.055*np.sin(2*np.pi*42*tt)*e

# ── 母带前的柔化 + 淡化头尾 ──
fade=int(0.8*SR)
out[:fade]*=np.linspace(0,1,fade)
out[-fade:]*=np.linspace(1,0,fade)

peak=np.max(np.abs(out))
out = out/peak*0.55

os.makedirs('audio',exist_ok=True)
with wave.open('audio/bgm.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out*32767).astype('<i2').tobytes())
print(f'bgm.wav  {DUR}s  peak={np.max(np.abs(out)):.3f}')
