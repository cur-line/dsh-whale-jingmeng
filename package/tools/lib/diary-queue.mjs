// Shared on-disk contract for the CLI and approval API. All writers use one lock.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function readEntries(file, array = false) {
  let value
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return []; throw new Error(`队列无法读取，已保留原文件：${path.basename(file)}（${error.message}）`) }
  const entries = array ? value : value?.entries
  if (!Array.isArray(entries)) throw new Error(`队列格式错误，已保留原文件：${path.basename(file)}`)
  return entries
}

export function writeEntries(file, entries, array = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  let value = entries
  if (!array) {
    let previous = {}
    try { previous = JSON.parse(fs.readFileSync(file, 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    value = { ...previous, entries }
  }
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    fs.renameSync(temp, file)
  } finally { try { fs.rmSync(temp, { force: true }) } catch {} }
}

export const queueIsLocked = file => fs.existsSync(`${file}.lock`)
export function lockQueue(file) {
  const lock = `${file}.lock`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let fd
  try { fd = fs.openSync(lock, 'wx', 0o600) }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    const busy = new Error('队列正在处理或上一轮异常中断；请先确认发布结果，不要重复发布。')
    busy.status = 409
    throw busy
  }
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
  fs.closeSync(fd)
  let released = false
  return () => { if (!released) { released = true; fs.rmSync(lock, { force: true }) } }
}

// Stable local-only revision entrypoint shared by both platform CLIs.
export function createRevision(file, { array = false, id, text, payload }) {
  const release = lockQueue(file)
  try {
    const entries = readEntries(file, array)
    const original = entries.find(entry => String(entry.id) === String(id))
    if (!original || original.status !== 'rejected') throw new Error('仅被驳回的原稿可以生成修订版')
    if (entries.some(entry => String(entry.revisionOf || '') === String(id))) throw new Error('此稿已有修订版，请审核或修改最新版本，不能重复生成')
    const content = String(array ? payload?.content ?? '' : text ?? '').trim()
    const limit = array ? 1000 : 500
    if (!content || content.length > limit) throw new Error(`修订正文需1–${limit}字`)
    const now = new Date()
    const next = {
      id: `${array ? 'xhs-diary' : 'diary'}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      date: now.toLocaleDateString('sv-SE'), createdAt: now.toISOString(),
      status: 'pending', chars: content.length,
      revisionOf: String(original.id), revisionReason: String(original.reason || ''),
    }
    if (array) {
      const title = String(payload?.title ?? original.title ?? '').trim()
      const images = payload?.images ?? original.images ?? []
      if (!title || title.length > 20) throw new Error('修订标题需1–20字')
      if (!Array.isArray(images) || images.length < 1 || images.length > 18) throw new Error('修订稿需1–18张配图')
      for (const image of images) if (typeof image !== 'string' || !/\.(jpe?g|png|webp)$/i.test(image) || !fs.existsSync(image)) throw new Error('修订配图不存在或格式不支持')
      Object.assign(next, { title, content, images: [...images] })
    } else next.text = content
    entries.push(next)
    writeEntries(file, entries, array)
    return next
  } finally { release() }
}
