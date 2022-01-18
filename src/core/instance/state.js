/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling
} from '../util/index'

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}

export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

export function initState (vm: Component) {
  //给vm实例添加一个_watchers属性，在Watcher构造函数中会使用到，用于存储所有的watcher实例
  vm._watchers = []
  const opts = vm.$options

  //对 props 进行处理
  if (opts.props) initProps(vm, opts.props)

  //对 methods 进行处理
  if (opts.methods) initMethods(vm, opts.methods)

  //对 data 进行处理
  if (opts.data) {
    //如果该实例的$options.data上有数据那么直接将该数据进行处理
    initData(vm)
  } else {
    //如果没有数据，也就是没有组件没有data属性，那么就直接给data置空，同样做一下observer处理
    observe(vm._data = {}, true /* asRootData */)
  }

  //对 computed 进行处理
  if (opts.computed) initComputed(vm, opts.computed)

  //对 watch 进行处理
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}

function initProps (vm: Component, propsOptions: Object) {
  //
  const propsData = vm.$options.propsData || {}

  //在vm实例上添加_props属性
  const props = vm._props = {}

  //在 vm.$options上添加_propKeys属性，用于缓存该组件中的prop，以便后面存在同样的prop则可直接放到同一数组下，而不需要另外创建一个对象
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []

  //判断当前是否是根组件，true：是根组件，false：不是根组件
  const isRoot = !vm.$parent

  //如果当前组价是根组件的话需要在observer处理特殊处理
  // root instance props should be converted
  if (!isRoot) {
    //问：这里为什么要将shouldObserve置为false？
    //答：因为这里是对组件的props做处理，也就是说这个props的数据是由父组件传递给子组件的，
    //   那么如果父组件传递给子组件的是一个对象，其实是这个对象的引用，也就是说父子组件使用的是用一个对象。
    //   所以在处理该组件的props的数据之前他的父组件（也就是给传值的那个组件）在initData中就已经将该数据做了observer处理。
    //   这样将shouldObserve置为false就是为了阻止重复响应式处理。
    toggleObserving(false)
  }

  //遍历props对象
  for (const key in propsOptions) {
    //缓存prop的key
    keys.push(key)

    //获取props[key]的默认值
    const value = validateProp(key, propsOptions, propsData, vm)

    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) || config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      //将props的每个key都进行响应式处理
      defineReactive(props, key, value)
    }

    //将props的所有key全部代理到vm._props上
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  //在处理完props后随手将shouldObserve恢复原来的样子（进来开门，出去关门）
  toggleObserving(true)
}

function initData (vm: Component) {
  //将当前的数据属性缓存
  let data = vm.$options.data

  //因为我们的数据对象是写成function的，如果是function类型则调用getData获取data数据
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )
  }

  //获取data属性中那些数据的key
  // proxy data on instance
  const keys = Object.keys(data)

  //获取vm.$options中的props和methods名，用于名称校验，防止重命名。
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 如果我们在data中属性的名是以 $ 或者 _ 开头的话，那么就不会将该属性代理到vm实例下，
      // 也就是说无法使用【this.xxx】来使用,只能使用【this._data.xxx】来取值(因为在上面已经将所有data参数挂载到vm._data下了)
      proxy(vm, `_data`, key)
    }
  }

  //将data属性进行响应式observer处理，注意这里的 asRootData 为true
  // observe data
  observe(data, true /* asRootData */)
}

//获取data属性(data类型为Function)中的参数
export function getData (data: Function, vm: Component): any {
  //我们在获取data内数据的时候，手动禁止收集dep依赖
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
    //数组的data属性是方法，直接执行该方法便可以得到内部数据
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }


/**
 * 三件事：
 *   1、为 computed[key] 创建 watcher 实例，默认是懒执行
 *   2、代理 computed[key] 到 vm 实例
 *   3、判重，computed 中的 key 不能和 data、props 中的属性重复
 * @param computed computed中的属性有两种类型如下
 *  computed = {
 *    key1: function() { return xx },//这个是下面说的执行对象的一种类型
 *    key2: {
 *     get: function() { return xx },
 *     set: function(val) {}
 *    }//这个是下面说的执行对象的另一种类型
 *  }
 */
function initComputed (vm: Component, computed: Object) {

  //在vm实例上添加_computedWatchers属性，并设置为空对象
  // $flow-disable-line
  const watchers = vm._computedWatchers = Object.create(null)

  //判断当前的运行环境是否是在服务器环境下
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  //遍历 computed 对象
  for (const key in computed) {
    //获取 key 对应的值，即【执行对象】（可能是Function或Object，对应上面说的两种情况）
    const userDef = computed[key]

    //判断获取的函数体是那种类型，如果是Function类型的话则该【执行对象】为getter，否则为该对象中的get属性（对应上面说的两种情况）
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    //如果不是在服务器环境下则为该计算属性创建内部watcher
    if (!isSSR) {
      // create internal watcher for the computed property.
      //注意在这里有将我们创建的watcher保存到了vm._computedWatchers下
      watchers[key] = new Watcher(
        vm,                       //当前实例
        getter || noop,  //表达式或者函数，用于获取value使用
        noop,                     //回调函数
        computedWatcherOptions    //⭐️配置信息，可以配置deep user lazy sync before等五个参数，此处请格外注意lazy=true
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    //判断在vm实例下是否存在这个computed-key属性
    if (!(key in vm)) {
      //如果vm实例下没有该属性则：
      //代理computed对象中的属性到vm实例下，这样我们就可以直接使用vm.[computed-key]访问属性了
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      //如果vm实例下有该属性则：
      //将其与data、props和methods进行判重处理
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(`The computed property "${key}" is already defined as a method.`, vm)
      }
    }
  }
}

//代理 computed 对象中的 key 到 target（vm）上
export function defineComputed (
  target: any,                //当前实例
  key: string,                //需要挂载的key
  userDef: Object | Function  //当前key对应的【执行对象】
) {
  //判断当前的运行环境是否是在服务器环境下，从而设置是否应该缓存
  const shouldCache = !isServerRendering()

  //此处根据shouldCache判断是否对computed进行缓存处理，从而设置其get的处理逻辑
  //如果需要进行缓存处理(shouldCache为true)：
  //   直接使用该可以对应的已经存在的watcher，
  //如果不需要进行缓存处理(shouldCache为false):
  //   直接重新执行该key对应的【执行对象】
  if (typeof userDef === 'function') {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' && sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }

  //将key属性直接挂载到vm实例上
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  return function computedGetter () {
    //获取该key在初始化时构建的watcher
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      //这里的watcher.dirty其实就是初始化的时候我们new Watcher传入的computedWatcherOptions.lazy
      if (watcher.dirty) {
        //当watcher.dirty为true，也就是在浏览器环境下computed模块下。调用watcher.evaluate()会
        watcher.evaluate()
      }
      if (Dep.target) {
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  //获取vm.$options中prop的值，用于重命名校验
  const props = vm.$options.props
  //遍历 methods 对象
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    //如果该key对应的变量是对象类型，则将该方法使用bind处理(将vm绑定为该方法的执行上下文)，最后将处理后的方法挂载到vm实例下
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    handler = vm[handler]
  }
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`
      pushTarget()
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info)
      popTarget()
    }
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
