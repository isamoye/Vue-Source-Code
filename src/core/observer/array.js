/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

//获取Array的原型方法
const arrayProto = Array.prototype

//将重写的原型方法暴露出去
export const arrayMethods = Object.create(arrayProto)

const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
methodsToPatch.forEach(function (method) {
  // 缓存原始方法
  // cache original method
  const original = arrayProto[method]

  //为arrayMethods定义新的方法（这几个方法名字也就是methodsToPatch中的那7个）
  def(arrayMethods, method, function mutator (...args) {
    //使用原始方法处理传入的数据得到结果
    const result = original.apply(this, args)

    //将当前Observer实例的this缓存(定义是在/src/core/observer/index.js的构造函数中)
    const ob = this.__ob__
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }

    //更新observer
    if (inserted) ob.observeArray(inserted)

    //通知依赖该参数的watcher
    // notify change
    ob.dep.notify()

    //返回得到的结果
    return result
  })
})
