/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;        //实例；
  expression: string;   //表达式，要监听的value的值的key(字符串表达式)；
  cb: Function;         //回调函数；
  id: number;           //当前watcher实例的一个计数，从1开始；
  deep: boolean;        //是否深度监听。取值为option.deep，默认为【false】；
  user: boolean;        //是否是用户触发的watcher。取值为option.user，只有$watcher调用生成的watcher实例才是true，其他为【false】；
  lazy: boolean;        //是否懒处理。取值为option.lazy，只有computed的属性创建的实例才会是true，默认为【false】；
  sync: boolean;        //是否是同步执行。取值为option.lazy，只有watcher调用生成的watcher的时候才可能是true(之所以可能是true是因为此值是由用户调用watch的时候传进来的，只有传为true的时候才会为true)，默认为【false】
  dirty: boolean;       //是否对该执行进行重新获取。只有computed属性创建的实例才会是true，默认为【false】；
  active: boolean;      //当前watcher是否还有效，默认为【true】；
  deps: Array<Dep>;     //是一个用于存储依赖Dep的数组，默认为[]；
  newDeps: Array<Dep>;  //是一个用于存储依赖Dep的数组，默认为[].与上面的区别在于此次更新后收集下一轮更新所相关的依赖；
  depIds: SimpleSet;    //存储deps对应的id所组成的Set(es6的一种新的数据格式)，默认为空Set；
  newDepIds: SimpleSet; //存储newDeps对应的id所组成的Set(es6的一种新的数据格式)，默认为空Set；
  before: ?Function;    //函数，存储更新之前所需要调用的函数，取值为option.before，可以为空
  getter: Function;     //获取监听的value的函数
  value: any;           //值，监听对象的值

  constructor (
    vm: Component,              //实例
    expOrFn: string | Function, //表达式或者函数，用于获取value使用
    cb: Function,               //回调函数
    options?: ?Object,          //可选参数，对象类型，配置信息，可以配置deep user lazy sync before等五个参数
    isRenderWatcher?: boolean   //是否是渲染函数，只用mount函数传过来的才是true
  ) {
    this.vm = vm

    //判断是否是渲染watcher，如果是：把当前watcher赋值给vm._watcher（vm._watcher在初始化的initLifecycle方法中生成的）
    if (isRenderWatcher) {
      vm._watcher = this
    }

    //把当前watcher储存到vm._watchers（vm._watchers在初始化initState方法中生成的）
    vm._watchers.push(this)

    //将传入的option进行处理，将其赋值给watcher实例
    // options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy
      this.sync = !!options.sync
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }

    //默认值设定
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production' ? expOrFn.toString() : ''

    //根据expOrFn处理getter，函数的话直接赋值，否则调用parsePath，获取调用的函数
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }

    //获取value，如果是懒处理则暂时为undefined，否则调用get方法
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
