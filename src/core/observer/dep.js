/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  static target: ?Watcher;  //当前所处理的watcher实例，此处会在
  id: number;               //每个dep都有唯一的id
  subs: Array<Watcher>;     //用于收集依赖Watcher

  //构造函数，初始化一个dep实例赋值
  constructor () {
    this.id = uid++
    this.subs = []
  }

  //依赖收集函数
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  //删除依赖函数
  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }

  //依赖收集函数，此处会调用 Watcher 的 addDep 方法
  depend () {
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  //通知函数，此处会循环调用所收集的所有 Watcher，调用执行他们的 update 方法
  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

export function pushTarget (target: ?Watcher) {
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
