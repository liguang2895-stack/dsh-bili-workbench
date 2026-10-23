// 补抓缺失的封面：只补文件，不动视频记录（幂等，可重复跑）
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fetchCover } from '../engine/bili.mjs'
import { storeCover, STORE } from '../engine/store.mjs'

const covers = join(STORE, 'covers')
const videos = join(STORE, 'videos')

const bvs = readdirSync(videos).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
const missing = bvs.filter((bv) => !existsSync(join(covers, bv + '.jpg')))

console.log(`库里 ${bvs.length} 条，缺封面 ${missing.length} 条`)
if (!missing.length) process.exit(0)

let ok = 0
let fail = 0
for (const bv of missing) {
  try {
    const buf = await fetchCover(bv)
    if (buf && buf.length > 1000) {
      storeCover(bv, buf)
      ok++
      console.log(`  ✓ ${bv}  ${(buf.length / 1024).toFixed(0)} KB`)
    } else {
      fail++
      console.log(`  ✗ ${bv}  没拿到（可能是稿件已删除或仅限登录）`)
    }
  } catch (e) {
    fail++
    console.log(`  ✗ ${bv}  ${e.message}`)
  }
  // 别把 B站 接口打急了
  await new Promise((r) => setTimeout(r, 400))
}
console.log(`\n补齐 ${ok} 条，失败 ${fail} 条`)
