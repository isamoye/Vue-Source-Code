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
  newDeps: Array<Dep>;  //是一个用于存储依赖Dep的数组，默认为[]，与上面的区别在于此次更新后收集下一轮更新所相关的依赖；
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

    //获取value并将其挂载到当前watcher实例的value上，如果是懒处理则暂时为undefined，否则调用get方法
    this.value = this.lazy ? undefined : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  //执行 this.getter，并重新收集依赖，最终返回value
  //这里的 this.getter 是在实例化 watcher 的构造函数执行时传入的第二个参数。
  //问：为什么要重新收集依赖？
  //答：因为当前被触发了就说明有响应式数据被更新了，虽然他的数据已经被observer观察了，但是并没有进行依赖收集，所以在此处需要重新执行一次render函数，render被执行就会触发读取操作就会收集依赖
  get () {
    // 打开 Dep.target，即Dep.target = this
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      //getter是在构造方法中设置的，执行该实例的getter
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      //判断是否是深度监听，如果是则调用traverse()进行深度操作
      // "touch" every property so they are all tracked as dependencies for deep watching.
      if (this.deep) {
        traverse(value)
      }

      // 关闭 Dep.target，把Dep.target返回到之前的状态，即Dep.target = null
      popTarget()

      //重新对当前实例的收集依赖的数组进行整合
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  //收集依赖的函数
  addDep (dep: Dep) {
    const id = dep.id

    //判断当期那实例的newDepIds(用于存储newDeps对应的id的Set)中是否有当前传入的依赖dep
    if (!this.newDepIds.has(id)) {
      //如果没有，就将传入的依赖dep收集到当前实例的newDeps中去，并保存其id到newDepIds中
      this.newDepIds.add(id)
      this.newDeps.push(dep)

      if (!this.depIds.has(id)) {
        // 如果当前depIds没有包含传入dep，(this指向该Watcher实例)，则将Watcher实例添加至Dep的subs中
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  //对收集的依赖进行处理
  cleanupDeps () {
    let i = this.deps.length
    //对deps进行遍历，如果更新后的依赖不存在当前的依赖中，那么就对当前的依赖调用removeSub方法将该依赖删除
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }

    //问：为什么不直接将newDepIds(deps)赋值给depIds(newDeps)而选择中间变量赋值
    //答：因为他们是数组和Set类型，都属于指针赋值，如果直接赋值的话会导致存在很多没有被释放的脏数据。(个人猜测)

    //对depIds进行处理，将depIds变更为newDepIds，然后将newDepIds清空
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()

    //对deps进行处理，将deps变更为newDeps，然后将newDeps清空
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  //根据当前实例 watcher 的配置项决定怎么通知依赖 watcher
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      //当时懒加载的时候会走这里，比如 computed

      //将 dirty 置置为 true 可以让 computedGetter 执行时重新计算 computed 回调函数的执行结果
      this.dirty = true
    } else if (this.sync) {
      //同步执行,在使用vm.$watch、watch选项时传入一个sync选项
      //当为 true 时数据更新时该 watcher 就不会走异步更新队列，而是直接执行 this.run
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  // 由刷新队列函数 flushSchedulerQueue 调用，完成如下几件事：
  //  1、执行实例化 watcher 传递的第二个参数，updateComponent 或者 获取 this.xx 的一个函数(parsePath 返回的函数)
  //  2、更新旧值为新值
  //  3、执行实例化 watcher 时传递的第三个参数，比如用户 watcher 的回调函数
  run () {
    //判断当前实例watcher是否是有效的
    if (this.active) {
      const value = this.get() //通过该watcher的getter获取value
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        //如果值有改变，将旧值换为新值
        const oldValue = this.value
        this.value = value
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          //用户watcher：则执行用户传递的三个参数---回调函数、新值、老值（这个跟下面的是类似的）
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          //渲染watcher：直接执行渲染函数的回调
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  // 懒执行的 watcher 会调用该方法
  //    比如：computed，在获取 vm.computedProperty 的值时会调用该方法
  // 然后执行 this.get，即 watcher 的回调函数，得到返回值
  //    this.dirty 被置为 false，作用是页面在本次渲染中只会一次 computed[key] 的回调函数，
  // 这也是大家常说的 computed 和 methods 区别之一是 computed 有缓存的原理所在
  // 而页面更新后会 this.dirty 会被重新置为 true 是在 this.update 方法中完成的
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
