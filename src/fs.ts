import * as _fs from 'fs'
import * as util from 'util'
import * as pathLib from 'path';
import { throttle } from './utils';

const ENOENT = 'ENOENT' // not found

async function copy(
  src: string,
  dist: string,
  opts?: {
    /** Copy files only filter return true */
    filter?: (file: string, stat: _fs.Stats) => boolean,
    override?: boolean,
  },
) {
  opts = {
    override: false,
    ...opts
  }
  const srcStat = await fs.stat(src)
  const isFiltered = opts.filter ? opts.filter(src, srcStat) : true
  if (!isFiltered) return
  if (srcStat.isDirectory()) {
    await fs.mkdirp(dist)
    let childs = await fs.readdir(src)
    await Promise.all(
      childs.map(
        child => copy(
          pathLib.join(src, child),
          pathLib.join(dist, child),
          opts
        )
      )
    )
  } else if (
    srcStat.isFile() || srcStat.isSymbolicLink()
  ) {
    if (await fs.lexists(dist)) {
      if (opts.override) {
        await fs.rmrf(dist)
      } else {
        return
      }
    } else {
      let lastChar = dist[dist.length - 1]
      if (lastChar === '/' || lastChar === '\\') {
        await fs.mkdirp(dist)
        dist = pathLib.join(dist, pathLib.basename(src))
      } else {
        let dir = pathLib.dirname(dist)
        await fs.mkdirp(dir)
      }
    }
    await fs.copyFile(src, dist)
  }
}

export type WatchDirHandler = (event: string, filename: string) => void
export type WatchDirOptions = {
  persistent?: boolean
  /** ms, default 300 */
  throttle?: number
}

function watchDir(
  dir: string,
  cb: WatchDirHandler,
): void
function watchDir(
  dir: string,
  options: WatchDirOptions,
  cb: WatchDirHandler,
): void
function watchDir(
  dir: string,
  options?: WatchDirOptions | WatchDirHandler,
  cb?: WatchDirHandler,
): void {
  if (typeof options === 'function') {
    cb = options as any
    options = void 0
  }
  options = {
    persistent: true,
    throttle: 300,
    ...options,
  } as WatchDirOptions
  if (options.throttle) {
    cb = throttle(cb, options.throttle)
  }
  if (process.platform === 'linux') {
    fs.iter(dir, (path) => {
      fs.watch(path, {
        recursive: false,
        persistent: (options as WatchDirOptions).persistent,
      }, cb)
    })
  } else {
    fs.watch(dir, { recursive: true, persistent: options.persistent }, cb)
  }
}
export const fs = {
  ..._fs,
  access: util.promisify(_fs.access),
  open: util.promisify(_fs.open),
  rename: util.promisify(_fs.rename),
  truncate: util.promisify(_fs.truncate),
  rmdir: util.promisify(_fs.rmdir),
  mkdir: util.promisify(_fs.mkdir),
  readdir: util.promisify(_fs.readdir),
  readlink: util.promisify(_fs.readlink),
  symlink: util.promisify(_fs.symlink),
  lstat: util.promisify(_fs.lstat),
  stat: util.promisify(_fs.stat),
  link: util.promisify(_fs.link),
  unlink: util.promisify(_fs.unlink),
  chmod: util.promisify(_fs.chmod),
  chown: util.promisify(_fs.chown),
  utimes: util.promisify(_fs.utimes),
  realpath: util.promisify(_fs.realpath),
  mkdtemp: util.promisify(_fs.mkdtemp),
  writeFile: util.promisify(_fs.writeFile),
  appendFile: util.promisify(_fs.appendFile),
  readFile: util.promisify(_fs.readFile),
  existsSync: _fs.existsSync,
  createReadString: _fs.createReadStream,
  createWriteStream: _fs.createWriteStream,
  constants: _fs.constants,
  watchDir,
  copy,
  async exists(path: _fs.PathLike) {
    try {
      await fs.stat(path)
    } catch (error) {
      if (error.code === ENOENT) {
        return false
      } else {
        throw error
      }
    }
    return true
  },
  /** exists via lstat, if a symbolic link's target file doesn't exists, `fs.exists` will return false, but `fs.lexists` will return true. */
  async lexists(path: _fs.PathLike) {
    try {
      await fs.lstat(path)
    } catch (error) {
      if (error.code === ENOENT) {
        return false
      } else {
        throw error
      }
    }
    return true
  },
  async isFile(path: _fs.PathLike) {
    try {
      return (await fs.lstat(path)).isFile()
    } catch (error) {
      if (error.code === ENOENT) {
        return false
      } else {
        throw error
      }
    }
  },
  async isDirectory(path: _fs.PathLike) {
    try {
      return (await fs.lstat(path)).isDirectory()
    } catch (error) {
      if (error.code === ENOENT) {
        return false
      } else {
        throw error
      }
    }
  },
  async isSymbolicLink(path: _fs.PathLike) {
    try {
      return (await fs.lstat(path)).isSymbolicLink()
    } catch (error) {
      if (error.code === ENOENT) {
        return false
      } else {
        throw error
      }
    }
  },
  copyFile: _fs.copyFile ? util.promisify(_fs.copyFile) : async (src: _fs.PathLike, dist: _fs.PathLike) => {
    await fs.stat(src)
    return new Promise(
      (res, rej) => {
        fs
          .createReadStream(src, { highWaterMark: 2 * 1024 * 1024 })
          .pipe(fs.createWriteStream(dist))
          .on('error', rej)
          .on('close', res)
      }
    )
  },
  /**
   * Make directory with parents, like `mkdir -p`
   * @param dir
   */
  async mkdirp(dir: string) {
    if (dir === '/') return
    let parent = pathLib.dirname(dir)
    if (!await fs.exists(parent)) {
      await fs.mkdirp(parent)
    }
    if (!await fs.exists(dir)) {
      return fs.mkdir(dir)
    }
  },
  /**
   * Make directory with parents, like `mkdir -p`
   * @param dir
   */
  mkdirpSync(dir: string) {
    if (dir === '/') return
    let parent = pathLib.dirname(dir)
    if (!fs.existsSync(parent)) {
      fs.mkdirpSync(parent)
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
  },
  /**
   * Remove file or directory recursively, like `rm -rf`
   * @param path The path to remove
   * @param opts Options
   */
  async rmrf(
    path: string,
  ) {
    let stat: _fs.Stats
    try {
      stat = await fs.lstat(path)
    } catch (error) {
      if (error.code === ENOENT) {
        return
      }
      throw error
    }
    if (stat.isDirectory()) {
      const children = await fs.readdir(path)
      await Promise.all(
        children
        .map(child => pathLib.join(path, child))
        .map(fs.rmrf)
      )
    } else {
      await fs.unlink(path)
    }
  },
  async outputFile(path: string, data: any, options?: { encoding?: string | null, mode?: string | number, flag?: string } | string | null) {
    let dir = pathLib.dirname(path)
    await fs.mkdirp(dir)
    return fs.writeFile(path, data, options)
  },
  outputFileSync(path: string, data: any, options?: { encoding?: string | null, mode?: string | number, flag?: string } | string | null) {
    let dir = pathLib.dirname(path)
    fs.mkdirpSync(dir)
    return fs.writeFileSync(path, data, options)
  },
  async outputJson(path: string, data: object, options?: { encoding?: string | null, mode?: string | number, flag?: string } | string | null) {
    return fs.outputFile(path, JSON.stringify(data), options)
  },
  outputJsonSync(path: string, data: any, options?: { encoding?: string | null, mode?: string | number, flag?: string } | string | null) {
    return fs.outputFileSync(path, JSON.stringify(data), options)
  },
  async readJson<T = any>(path: string, options?: { encoding?: null, flag?: string } | null) {
    let data: Buffer | string = await fs.readFile(path, options)
    if (typeof data !== 'string') {
      data = data.toString('utf8')
    }
    return JSON.parse(data) as T
  },
  readJsonSync<T = any>(path: string, options?: { encoding?: null, flag?: string } | null) {
    let data: Buffer | string = fs.readFileSync(path, options)
    if (typeof data !== 'string') {
      data = data.toString('utf8')
    }
    return JSON.parse(data) as T
  },
  async iter(
    dir: string,
    filter: (path: string, stat: _fs.Stats) => Promise<boolean | void> | boolean | void,
  ) {
    let children = await fs.readdir(dir)
    await Promise.all(
      children.map(
        async child => {
          let path = pathLib.join(dir, child)
          let stat = await fs.stat(path)
          let skip = await filter(path, stat)
          if (skip) return
          if (stat.isDirectory()) {
            await fs.iter(path, filter)
          }
        }
      )
    )
  },
}
