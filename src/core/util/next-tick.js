/* @flow */
/* globals MutationObserver */

import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks = []  //用于存储传入的cb函数
let pending = false   //标志位，保证在同一时刻，浏览器的任务队列中只有一个 flushCallbacks 函数

/**
 * 做了三件事：
 *   1、将 pending 置为 false
 *   2、清空 callbacks 数组
 *   3、执行 callbacks 数组中的每一个函数（比如 flushSchedulerQueue、用户调用 nextTick 传递的回调函数）
 */
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

/* Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).*/

// 这里是选取任务队列，微任务队列(promise) -> MutationObserver -> setImmediate -> setTimeout
let timerFunc
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  // 如果浏览器支持Promise
  // 首选 Promise.resolve().then()
  const p = Promise.resolve()
  timerFunc = () => {
    // 在微任务队列(Promise) 中放入 flushCallbacks 函数
    p.then(flushCallbacks)
    /* In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.*/
    /**
     * 对ios的进行特殊处理：
     * 在有问题的UIWebViews中，Promise.then不会完全中断，但是它可能会陷入怪异的状态，
     * 在这种状态下，回调被推入微任务队列，但队列没有被刷新，直到浏览器需要执行其他工作，例如处理一个计时器。
     * 因此，我们可以通过添加空计时器来“强制”刷新微任务队列。
     */
    if (isIOS) setTimeout(noop)
  }
  isUsingMicroTask = true
} else
  if (!isIE && typeof MutationObserver !== 'undefined' && (isNative(MutationObserver) ||MutationObserver.toString() === '[object MutationObserverConstructor]')) {
  // MutationObserver 次之

  /* Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)*/
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  const textNode = document.createTextNode(String(counter))
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
} else
  if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // 再就是 setImmediate，它其实已经是一个宏任务了，但仍然比 setTimeout 要好

  /* Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.*/
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
}
  else {
  // 最后没办法，则使用 setTimeout

  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

export function nextTick (
    cb?: Function, //接受一个回调函数=>flushSchedulerQueue
    ctx?: Object   //上下文
) {
  let _resolve

  // 用 callbacks 数组存储经过包装的 cb 函数
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      _resolve(ctx)
    }
  })

  if (!pending) {
    // 如果任务队列中没有 flushCallbacks，那么便执行timerFunc，在浏览器的任务队列中方法放入 flushCallbacks
    pending = true
    timerFunc()
  }

  // $flow-disable-line----不懂
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      _resolve = resolve
    })
  }
}
