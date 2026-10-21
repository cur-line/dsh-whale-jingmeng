// B站 设备标识（buvid3 / buvid4 / b_nut）的获取与长期复用。
//
// 为什么需要它：
//   真浏览器发的每个请求都带着 buvid3。只带 SESSDATA 的请求在 B站 风控眼里
//   就是「没有设备的登录态」，是 -352 / -412 / 「账号异常」的常见诱因。
//   所以先向 B站 的指纹接口要一对 buvid，落盘后长期复用 ——
//   真人的浏览器也不会每天换设备，别每个请求都去重新要。
//
// 约定：
//   · device.json 存在就直接复用，不再请求 spi。
//   · device.json 缺失但 credentials.json 有 buvid3 时，先以它为底再补 spi
//     （它和 SESSDATA 是一起从真人浏览器里抓的，配套性最好，优先保留）。
//   · 出错只 console.warn 并返回空对象，绝不 throw 挡住主流程
//     （拿不到 buvid 就不带，和 yangyu 的 cookieHeader 一个思路）。
//   · b_nut 固定 100（照 yangyu 的做法；buvid3 才是风控看的关键项）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DATA_DIR = path.join(os.homedir(), '.bili-ai')
const DEVICE_FILE = path.join(DATA_DIR, 'device.json')
const CRED_FILE = path.join(DATA_DIR, 'credentials.json')
const SPI_URL = 'https://api.bilibili.com/x/frontend/finger/spi'
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const readJSON = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

// 向 B站 要一对新 buvid（无鉴权 GET），失败返回 null。
async function fetchSpi() {
  const res = await fetch(SPI_URL, {
    headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com' },
    signal: AbortSignal.timeout(10000),
  })
  const r = await res.json()
  return r?.code === 0 && r.data?.b_3 ? r.data : null
}

let cached = null

/** 获取设备标识：{ buvid3, buvid4, b_nut }；全部拿不到时返回 {}，绝不 throw。 */
export async function getDevice() {
  if (cached) return cached

  // 1) 有落盘就直接复用（真人不换设备）
  const saved = readJSON(DEVICE_FILE)
  if (saved?.buvid3) {
    cached = saved
    return cached
  }

  // 2) device.json 缺失：以 credentials 里的 buvid3 打底（与 SESSDATA 配套）
  const creds = readJSON(CRED_FILE)
  const base = { buvid3: creds?.buvid3 || '', buvid4: '', b_nut: '100' }

  // 3) 请求 spi 补 b_3/b_4；拿不到就退回底，再不行就空对象
  try {
    const data = await fetchSpi()
    if (data) {
      cached = {
        buvid3: base.buvid3 || data.b_3, // 底优先，spi 只在底缺失时补 b_3
        buvid4: data.b_4 || '',
        b_nut: '100',
        updatedAt: new Date().toISOString(),
      }
      mkdirSync(DATA_DIR, { recursive: true })
      writeFileSync(DEVICE_FILE, JSON.stringify(cached, null, 2), { mode: 0o600 })
    } else if (base.buvid3) {
      console.warn('[device] spi 没拿到新 buvid，退回 credentials 里的 buvid3')
      cached = base
    }
  } catch (err) {
    console.warn('[device] 获取 buvid 失败：', err?.message || err)
    if (base.buvid3) cached = base
  }

  if (!cached) {
    console.warn('[device] 没有可用 buvid，本次请求不带设备标识')
    return {}
  }
  const { buvid3 = '', buvid4 = '', b_nut = '100' } = cached
  return { buvid3, buvid4, b_nut }
}
