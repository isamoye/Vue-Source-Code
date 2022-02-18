/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

// 将之前的 Vue.prototype.$mount 暂存，在新的 Vue.prototype.$mount 中会调用之前的
const mount = Vue.prototype.$mount

// 从主干代码我们可以看出做了以下几件事：
//    1、由于el参数有两种类型，可能是string 或者 element，调用query方法，统一转化为Element类型
//    2、如果没有手写render函数， 那么先获取template内容。再将template做为参数，调用compileToFunctions方法，返回render函数。
//    3、最后调用mount.call，这个方法实际上会调用runtime/index.js的mount方法
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  el = el && query(el)

  /* istanbul ignore if */
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
  if (!options.render) {
    let template = options.template

    // 如果存在template配置项：
    // 1. template 可能是"#xx"，那么根据id获取 element 内容
    // 2. 如果 template 存在 nodeType，那么获取 template.innerHTML 内容
    if (template) {
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 如果 template 不存在，el存在：
      // 例如： new Vue({
      //         el: "#app",
      //         ...
      //       })
      // 那么根据el获取对应的element内容
      template = getOuterHTML(el)
    }
    if (template) {
      //这里是一个JS程序的代码覆盖率工具,此处可以不用管
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // ⭐️这个是将我们写的模板编译成render函数的真实入口
      // 返回的参数有两个render：render函数；staticRenderFns：静态render（比如v-once、静态文字等编译出来的）
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      // 将编译出的render挂载到 $options 上
      options.render = render
      options.staticRenderFns = staticRenderFns

      //这里是一个JS程序的代码覆盖率工具,此处可以不用管
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // ⭐️将虚拟dom渲染成真实dom节点，同时也是遍历子组件的入口
  // 真实的方法在：【vue/src/platforms/web/runtime/index.js  |  Vue.prototype.$mount方法】
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

//12、compile
Vue.compile = compileToFunctions

export default Vue
