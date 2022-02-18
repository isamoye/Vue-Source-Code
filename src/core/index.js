import Vue from './instance/index'
import { initGlobalAPI } from './global-api/index'
import { isServerRendering } from 'core/util/env'
import { FunctionalRenderContext } from 'core/vdom/create-functional-component'

//将全部API初始化，挂载到vue原型上(这里面有10个，还有一个在下面，一个在/web/entry-runtime-with-compiler.js里)
initGlobalAPI(Vue)

//这里将$isServer挂载到Vue原型上
Object.defineProperty(Vue.prototype, '$isServer', {
  get: isServerRendering
})

//这里将$ssrContext挂载到Vue原型上
Object.defineProperty(Vue.prototype, '$ssrContext', {
  get () {
    /* istanbul ignore next */
    return this.$vnode && this.$vnode.ssrContext
  }
})

//这里将FunctionalRenderContext挂载到Vue原型上
// expose FunctionalRenderContext for ssr runtime helper installation
Object.defineProperty(Vue, 'FunctionalRenderContext', {
  value: FunctionalRenderContext
})

//11、version
Vue.version = '__VERSION__'

export default Vue
