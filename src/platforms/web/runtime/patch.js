/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
const modules = platformModules.concat(baseModules)

// 将VNode转换成真实dom的真正入口
// 方法指向：【src/core/vdom/patch.js |createPatchFunction方法返回的patch函数】
export const patch: Function = createPatchFunction({ nodeOps, modules })
