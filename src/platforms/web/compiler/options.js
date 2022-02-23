/* @flow */

import {
  isPreTag,
  mustUseProp,
  isReservedTag,
  getTagNamespace
} from '../util/index'

import modules from './modules/index'
import directives from './directives/index'
import { genStaticKeys } from 'shared/util'
import { isUnaryTag, canBeLeftOpenTag } from './util'

export const baseOptions: CompilerOptions = {
  expectHTML: true,
  modules,          // 处理 class、style、v-model
  directives,
  isPreTag,         // 处理指令，是否是 pre 标签
  isUnaryTag,       // 是否是自闭合标签
  mustUseProp,      // 规定了一些应该使用 props 进行绑定的属性
  canBeLeftOpenTag, // 可以只写开始标签的标签，结束标签浏览器会自动补全
  isReservedTag,    // 是否是保留标签（html + svg）
  getTagNamespace,  // 获取标签的命名空间
  staticKeys: genStaticKeys(modules)
}
