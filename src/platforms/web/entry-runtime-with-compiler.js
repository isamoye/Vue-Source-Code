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

//就做了一件事情，得到组件的渲染函数，将其设置到 this.$options 上

// 将之前的 Vue.prototype.$mount 暂存，在新的 Vue.prototype.$mount 中会调用之前的
const mount = Vue.prototype.$mount
// 从主干代码我们可以看出做了以下几件事：
//    1、由于el参数有两种类型，可能是string 或者 element，调用query方法，统一转化为Element类型
//    2、如果没有手写 render 函数， 那么先获取 template 内容。再将 template 做为参数，调用 compileToFunctions 方法，返回render函数。
//    3、最后调用mount.call，这个方法实际上会调用 runtime/index.js 里的 mount 方法
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {

  // 挂载点
  el = el && query(el)

  /* istanbul ignore if */
  // 挂载点不能是 body 或者 html
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  // 配置项
  const options = this.$options
  // resolve template/el and convert to render function
  /*
   * 如果用户提供了 render 配置项，则直接跳过编译阶段，否则进入编译阶段
   *   解析 template 和 el，并转换为 render 函数
   *   优先级：render > template > el
   */
  if (!options.render) {
    let template = options.template
    // 如果存在template配置项：
    // 1. template 可能是"#xx"，那么根据id获取 element 内容
    // 2. 如果 template 存在 nodeType，那么获取 template.innerHTML 内容
    if (template) {
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          // { template: '#app' }，template 是一个 id 选择器，则获取该元素的 innerHtml 作为模版
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
        // template 是一个正常的元素，获取其 innerHtml 作为模版
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
      // 那么获取 el 选择器的 outerHtml 作为模版
      template = getOuterHTML(el)
    }

    // 模版就绪，进入编译阶段
    if (template) {
      //这里是一个JS程序的代码覆盖率工具,此处可以不用管
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      // ⭐️这个是将我们写的模板编译成render函数的真实入口：
      // 编译模版，得到 动态渲染函数和静态渲染函数
      // 返回的参数有两个render：
      //                      render函数；
      //                      staticRenderFns：静态render（比如v-once、静态文字等编译出来的）
      const { render, staticRenderFns } = compileToFunctions(template, {
        // 在非生产环境下，编译时记录标签属性在模版字符串中开始和结束的位置索引
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        // 界定符，默认 {{}}
        delimiters: options.delimiters,
        // 是否保留注释
        comments: options.comments
      }, this)

      // 将两个渲染函数挂载到 $options 上
      options.render = render
      options.staticRenderFns = staticRenderFns

      //这里是一个JS程序的代码覆盖率工具,此处可以不用管
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }

  // ⭐ 执行挂载，将虚拟dom渲染成真实dom节点
  // 同时也是遍历子组件的入口
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
