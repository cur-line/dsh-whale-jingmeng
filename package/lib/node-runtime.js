import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Electron 的 execPath 是桌面应用；优先使用同一安装包内的真正 Node。
export function resolveNodeExecutable() {
  const env = process.env
  const dshHome = env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const executable = process.platform === 'win32' ? 'node.exe' : 'node'
  const resources = process.resourcesPath || path.resolve(path.dirname(process.execPath), '..', 'Resources')
  const candidates = [
    env.DSH_NODE,
    path.join(resources, 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', executable),
    path.join(dshHome, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', executable),
    path.join(os.homedir(), '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'bin', executable),
    ...String(env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, executable)),
    ...(!process.versions.electron && !/deepseek harness/i.test(process.execPath) ? [process.execPath] : []),
  ]
  for (const candidate of candidates) {
    try {
      if (candidate && fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK)
        return candidate
      }
    } catch {}
  }
  throw new Error('找不到 Node 运行时，请设置 DSH_NODE 为 node 可执行文件的绝对路径')
}
