//  @flow */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

export function initEvents (vm: Component) {
  vm._events = Object.create(null)
  vm._hasHookEvent = false
  // init parent attached events
  // 其实根组件初始化的时候是没有的，这是初始化子组件需要执行的
  // 这里的 _parentListeners 其实就是子组件在父组件中的 $on 事件
  const listeners = vm.$options._parentListeners
  if (listeners) {
    // 如果存在这样的事件，那么就会把这个事件进行事件监听
    updateComponentListeners(vm, listeners)
  }
}

let target: any

function add (event, fn) {
  target.$on(event, fn)
}

function remove (event, fn) {
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

export function eventsMixin (Vue: Class<Component>) {
  const hookRE = /^hook:/
  /*
   * $on方法用来在vm实例上监听一个自定义事件，该事件可用$emit触发。
   * 监听实例上的自定义事件，vm._event = { eventName: [fn1, ...], ... }
   * @param {*} event 单个的事件名称或者有多个事件名组成的数组
   * @param {*} fn 当 event 被触发时执行的回调函数
   * @returns
   */
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    if (Array.isArray(event)) {
      //如果我们传入的事件是个数组那么会循环遍历这个事件数组，然后依次对这些事件进行递归监听
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 将传入的需要注册的事件和回调以键值对的形式存储到 vm._event 对象中， vm._event = { eventName: [fn1, ...] }
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup

      // hookEvent，提供从外部为组件实例注入声明周期方法的机会
      // 比如从组件外部为组件的 mounted 方法注入额外的逻辑
      // 该能力是结合 callhook 方法实现的
      // 判断传入的事件是不是自定义的钩子函数（注：这个钩子不是vue自行触发的生命周期钩子函数）
      //具体的可以看 lifecycle.js 的 370 行左右
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  /*
   * $once监听一个只能触发一次的事件，在触发以后会自动移除该事件。
   * 监听一个自定义事件，但是只触发一次。一旦触发之后，监听器就会被移除
   * vm.$on + vm.$off
   * @param {*} event
   * @param {*} fn
   * @returns
   */
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      // 在第一次执行的时候将该事件销毁
      vm.$off(event, on)
      // 执行注册的方法
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  /*
   * $off用来移除自定义事件
   * 移除自定义事件监听器，即从 vm._event 对象中找到对应的事件，移除所有事件 或 移除指定事件的回调函数
   * @param {*} event
   * @param {*} fn
   * @returns
   */
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    // 如果不传参数则注销该实例上的所有事件
    // vm.$off() 移除实例上的所有监听器 => vm._events = {}
    if (!arguments.length) {
      vm._events = Object.create(null)//直接赋对象进行覆盖
      return vm
    }

    // array of events
    // 如果传入了事件名时一个数组，则遍历vm._events，找到对应的事件然后调用vm.$off销毁事件
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }

    // specific event
    // 如果只传了event参数(不为数组)，则注销该event方法下的所有方法
    const cbs = vm._events[event]
    if (!cbs) {
      return vm
    }
    if (!fn) {
      vm._events[event] = null
      return vm
    }

    // specific handler
    // 传了事件名，名传入该事件名下的回调函数，则移除指定事件的指定回调函数，就是从事件的回调数组中找到该回调函数，然后删除
    let cb
    let i = cbs.length
    while (i--) {
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  /*
   * $emit用来触发指定的自定义事件
   * 触发实例上的指定事件，vm._event[event] => cbs => loop cbs => cb(args)
   * @param {*} event 事件名
   * @returns
   */
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      // 将事件名转换为小写
      const lowerCaseEvent = event.toLowerCase()
      // 意思是说，HTML 属性不区分大小写，所以你不能使用 v-on 监听小驼峰形式的事件名（eventName），而应该使用连字符形式的事件名（event-name)
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }

    // 从 vm._event 对象上拿到当前事件的回调函数数组，并一次调用数组中的回调函数，并且传递提供的参数
    let cbs = vm._events[event]
    if (cbs) {
      // 将类数组的对象转换成数组
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      // 遍历执行
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
