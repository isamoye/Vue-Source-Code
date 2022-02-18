/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

//当前浏览器所支持的所有的数组的方法（其中vue改写的7个方法也包含在内）
const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

//切换是否进行watcher监听开关
export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;   //传入的需要响应式处理的参数
  dep: Dep;     //Dep的实例，
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {

    //初始化赋值
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0

    //为当前value定义__ob__属性，该属性指向Observer的当前实例的this
    def(value, '__ob__', this)

    //对Array和Object作区分处理
    if (Array.isArray(value)) {
      //如果value是数组时：
      //(hasProto)判断浏览器是否支持__proto__属性（原型链）
      if (hasProto) {
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      //不为数组时，执行walk方法
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  //获取当前对象的keys，对keys进行遍历，遍历调用defineReactive，将改属性设置为响应式
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  //循环调用observe方法，既可以初始化observer实例也可以是更新observer实例
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 * 翻译：通过使用__proto__截取原型链来增加目标对象或数组
 */
//直接把数组的__proto__直接指向src(改写后的数组方法)，这样使用array的时候调用的就是改写后的方法了，从而达到监听的效果
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
//因为浏览器不支持__proto__，那么需要在数组上覆盖原生的方法，从而达到使用array的方法时候调用的就是改写后的方法，从而达到监听的效果
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// ⭐️ Observe对外只暴露了一个函数observe，Observer类虽然给了export，但是外部并无调用。
export function observe (value: any, asRootData: ?boolean): Observer | void {
  //判断传入的value，如果不是对象或者是VNode对象，直接返回
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void

  //判断传入的value是否已经进行了observer处理
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    //如果已经进行了observer处理，就不用在对他做处理了，则直接把她赋值给ob
    ob = value.__ob__
  } else if (shouldObserve && !isServerRendering() && (Array.isArray(value) || isPlainObject(value)) && Object.isExtensible(value) && !value._isVue) {
    //是否需要进行监听 && 不是服务端渲染 && (是可监听对象) && 是可拓展对象 && 不是vue对象
    //对传入的value进行Observer初始化
    ob = new Observer(value)
  }

  //当asRootData为true且ob不为空的时候ob.vmCount++
  //ob.vmCount默认为0
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
//⭐️⭐️响应式原理的核心
// 【一】、调用defineReactive的地方：
//      1、initInjections，对依赖进行处理的时候，会对inject的key进行响应化调用；
//      2、initRender，对attrs和attrs和attrs和listeners对象进行浅式响应化调用；
//      3、initState里面的initProps，会对props进行响应化调用；
//      4、上面说到的walk里面会调用；
//      5、set函数里面会调用，包括Vue.set和原型对象上的$set里面；
// 【二】、每次调用defineReactive，都有一个唯一的Dep实例与当前value一一对应
export function defineReactive (
  obj: Object,              //要进行响应式处理的整个对象
  key: string,              //当前整个对象里需要处理成响应式的那个属性
  val: any,                 //默认值
  customSetter?: ?Function, //用户设置的set函数时的回调，该函数只有在非线上环境才会调用
  shallow?: boolean         //是否是浅式相应，如果是浅式相应则不会对子对象进行监听
) {
  //为该响应式处理的属性(对象)创建一个Dep实例
  const dep = new Dep()

  // 获取当前需要处理成响应式的那个属性的值
  // 例如：person:{
  //        age:24
  //      }
  //      obj为person对象，key为age。那么property就这个属性对应的属性描述符。
  //      类似于：property = {
  //              enumerable: true,
  //              configurable: true,
  //              value: 24,
  //              writable: true
  //             }
  const property = Object.getOwnPropertyDescriptor(obj, key)

  //判断该属性是否存在 && 是可以改变的。否则直接返回
  if (property && property.configurable === false) {
    return
  }

  //将该属性对应的属性描述符的get和set缓存
  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set

  //(没有getter || 有setter) && defineReactive入参只有两个的时候 ====>>>>把obj[key]赋值给默认值val，即该属性的值
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  //如果不是浅式相应，那么对其子属性递归进行observer处理，从而保证保证对象(数值)中的所有 key 都被观察
  let childOb = !shallow && observe(val)
    Object.defineProperty(obj, key, {
        enumerable: true,
        configurable: true,
        get: function reactiveGetter() {
            //首先调用原生的getter方法获取到value值
            const value = getter ? getter.call(obj) : val

            //判断是否有Dep.target(是一个Watcher对象)
            if (Dep.target) {
                //如果存在则调用收集依赖函数dep.depend()
                dep.depend()

                //判断childOb是否存在，若存在则直接对childOb进行依赖收集
                if (childOb) {
                    childOb.dep.depend()

                    //当我们获取到对象obj中key对应的value值是数组时，我们需要对数组中的每个元素进行依赖收集(因为数组跟对象不一样)
                    if (Array.isArray(value)) {
                        dependArray(value)
                    }
                }
            }
            return value
        },
        set: function reactiveSetter(newVal) {
            //首先调用原生的getter方法获取到value值
            const value = getter ? getter.call(obj) : val

            //将新值与老值比较，如果没有发生变化则直接返回
            if (newVal === value || (newVal !== newVal && value !== value)) {
                return
            }

            //如果用户设置的set函数时的回调，那么在生产环境下则执行该函数
            if (process.env.NODE_ENV !== 'production' && customSetter) {
                customSetter()
            }
            //如果这个属性是不可写的则直接返回
            // #7981: for accessor properties without setter
            if (getter && !setter) return

            //如果原生setter存在则用原生setter进行赋值。否则将新值赋值给默认值val
            if (setter) {
                setter.call(obj, newVal)
            } else {
                val = newVal
            }

            //如果不是浅式相应，那么对新的参数重新收集依赖
            childOb = !shallow && observe(newVal)

            //调用dep.notify进行通知更新，notify会调用dep对象下面所有的依赖watcher对象下面的update方法进行更新操作
            dep.notify()
        }
    })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (
    target: Array<any> | Object,
    key: any,
    val: any
): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  //如果传入的属性对象时数组时，
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 因为我们向响应式的原数组中添加了参数，但是数组不能自动识别，所以需要手动更改数组的length属性
    target.length = Math.max(target.length, key)
    // 将该属性对象插入到数组中
    target.splice(key, 1, val)
    return val
  }

  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }

  // 凡是对象上有 __ob__ 说明已经被observer处理过了
  const ob = (target: any).__ob__
  // 添加的对象不能是 Vue 实例，或者 Vue 实例的根数据对象
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 如果原对象不是响应式的那么直接将该属性对象添加进去就行了
  if (!ob) {
    target[key] = val
    return val
  }

  // 如果需要处理的属性对象皆符合要求，则对该属性对象进行响应式处理
  defineReactive(ob.value, key, val)

  // 通知依赖，触发视图更新
  ob.dep.notify()

  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (
    target: Array<any> | Object,
    key: any
) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }

  // 如果我们要删除的原对象是数组时
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 我们会调用vue处理过后的splice方法，以便我们能检测到对应的数据被删除，会触发视图更新
    target.splice(key, 1)
    return
  }

  // 凡是对象上有 __ob__ 说明已经被observer处理过了
  const ob = (target: any).__ob__
  // 被删除的对象不能是一个 Vue 实例或 Vue 实例的根数据对象
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }

  // 如果被删除对象本来就没有你要删除的那个东西的话，就当做什么也没发生过一样
  if (!hasOwn(target, key)) {
    return
  }

  // 以上要求都不满足的话，那么就说明被删除对象是一个Object，那么就直接使用Object.delete方法就好了
  delete target[key]

  if (!ob) {
    return
  }

  // 通知依赖，触发视图更新
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 * 翻译：在变动数组时收集对数组元素的依赖关系，因为我们不能像属性getter那样拦截数组元素访问。
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
