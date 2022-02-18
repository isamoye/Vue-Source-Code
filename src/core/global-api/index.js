/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }

  //1、set
  // Vue.set()是将set函数绑定在Vue构造函数上，
  Vue.set = set
  //2、del
  Vue.delete = del
  //3、nextTick
  Vue.nextTick = nextTick

  //4、observable
  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }

  //options---这个里面有不少东西
  Vue.options = Object.create(null)
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue

  // 将Keep_alive的配置参数全部注入到 Vue.options.components 属性中去，
  // 我们仔细阅读keep_alive的话会发现这是一个组件，这就是为什么我们能直接使用<keep-alive></keep-alive>
  extend(Vue.options.components, builtInComponents)

  //5、use
  initUse(Vue)
  //6、mixin
  initMixin(Vue)
  //7、extend
  initExtend(Vue)
  //8、component
  //9、directive
  //10、filter
  initAssetRegisters(Vue)
}
