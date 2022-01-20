/* @flow */

import config from '../config'
import {initProxy} from './proxy'
import {initState} from './state'
import {initRender} from './render'
import {initEvents} from './events'
import {mark, measure} from '../util/perf'
import {initLifecycle, callHook} from './lifecycle'
import {initProvide, initInjections} from './inject'
import {extend, mergeOptions, formatComponentName} from '../util/index'

let uid = 0

export function initMixin(Vue: Class<Component>) {
  Vue.prototype._init = function (options ?: Object
) {
    const vm: Component = this
    console.log('最初vm', vm)

    //这里是为vue实例颁发身份证，每个vue实例都会有一个uid
    vm._uid = uid++

    //这里是一个JS程序的代码覆盖率工具,此处可以不用管
    let startTag, endTag
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    //监听对象变化时用于过滤vm
    // a flag to avoid this being observed
    vm._isVue = true

    // 处理我们的options
    // merge options
    if (options && options._isComponent) {
      // 如果是子组件的话会走到这里
      // 将组件配置对象上的一些深层次属性放到 vm.$options 选项中，以提高代码的执行效率
      initInternalComponent(vm, options)
    } else {
      // 如果是根节点的话会走到这里；在这里干了一件大事————将我们传入的options参数和vue原型上构造器的options进行合并。
      // 如果你将merge后的vm.$options进行打印并与最初的比较你会发现多了一些参数。
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
      console.log('mergeOptions后vm', vm)
    }

    if (process.env.NODE_ENV !== 'production') {
      //将上面merge后的vm实例直接挂载到vm._renderProxy
      //如果你在这里将vm再打印一下就能看到
      initProxy(vm)
      console.log('initProxy后vm', vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    vm._self = vm
    // 初始化实例的关系属性，比如：$parent、$root、$children、$refs
    // 以及一些新增的配置项参数，比如：_watcher、_inactive、_isMounted、_isDestroyed等
    initLifecycle(vm)

    //
    initEvents(vm)
    // 解析、初始化$slot，为实例挂载处理渲染函数，得到 vm.$createElement 方法，即 h 函数
    initRender(vm)
    // 调用beforeCreate钩子函数
    callHook(vm, 'beforeCreate')
    // 初始化组件的 inject 的配置项，得到 result[key] = val 形式的配置对象，并对结果数据进行响应式处理
    initInjections(vm)
    // 数据响应式处理，处理 props、methods、data、computed、watch
    initState(vm)
    // 解析实例上的 provide 对象，将其挂载到 vm._provide 上
    initProvide(vm)
    // 调用 created 钩子函数
    callHook(vm, 'created')

    //这里是一个JS程序的代码覆盖率工具,此处可以不用管
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)// 不过这里有一个组件名格式化
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    if (vm.$options.el) {
      // 渲染dom节点，方法在：【src/platform/web/entry-runtime-with-compiler.js】
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent(vm: Component, options: InternalComponentOptions) {
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

export function resolveConstructorOptions(Ctor: Class<Component>) {
  let options = Ctor.options
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
