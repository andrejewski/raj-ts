import { Dispatch, Disposer, Effect, Program } from './runtime'
import { batchEffects, mapEffect } from './compose'

export type Subscription<Msg> = {
  effect: Effect<Msg>
  cancel: Disposer
}

type SubMap<Msg> = Record<string, undefined | (() => Subscription<Msg>)>

export type ProgramWithSubscriptions<Msg, Model, View> = Program<
  Msg,
  Model,
  View
> & {
  subscriptions: (model: Model) => SubMap<Msg>
}

const hasOwnProperty = Object.prototype.hasOwnProperty

function transition(
  cancelMap: Record<string, Disposer>,
  subscriptionMap: SubMap<unknown>
) {
  const keys = [...Object.keys(cancelMap), ...Object.keys(subscriptionMap)]
  const visitedKeyMap: Record<string, boolean> = {}
  const effects = []
  const newCancelMap: Record<string, Disposer> = {}
  for (const key of keys) {
    if (visitedKeyMap[key]) {
      continue
    }
    visitedKeyMap[key] = true

    const cancel = cancelMap[key]
    const hasCancel = hasOwnProperty.call(cancelMap, key)
    const subscription = subscriptionMap[key]
    if (hasCancel && !subscription) {
      effects.push(cancel)
    } else if (!hasCancel && subscription) {
      const { effect, cancel } = subscription()
      effects.push(effect)
      newCancelMap[key] = cancel
    } else if (hasCancel) {
      if (cancel) {
        newCancelMap[key] = cancel
      }
    }
  }
  return { effect: batchEffects(effects), cancelMap: newCancelMap }
}

type SubModel<Model> = {
  cancelMap: Record<string, Disposer>
  programModel: Model
}

export function mapSubscription<Msg, Msg2>(
  subscription: Subscription<Msg>,
  callback: (msg: Msg) => Msg2
): Subscription<Msg2> {
  return {
    effect: mapEffect(subscription.effect, callback),
    cancel: subscription.cancel,
  }
}

export function batchSubscriptions<Msg>(
  subscriptions: Subscription<Msg>[]
): Subscription<Msg> {
  const effects: Effect<Msg>[] = []
  const cancels: Disposer[] = []
  subscriptions.forEach((subscription) => {
    effects.push(subscription.effect)
    cancels.push(subscription.cancel)
  })

  return {
    effect: batchEffects(effects),
    cancel() {
      cancels.forEach((disposer) => disposer())
    },
  }
}

export function withSubscriptions<Msg, Model, View>(
  program: ProgramWithSubscriptions<Msg, Model, View>
): Program<Msg, SubModel<Model>, View> {
  const [programModel, programEffect] = program.init
  const { effect, cancelMap } = transition(
    {},
    program.subscriptions(programModel)
  )
  const init = [
    { cancelMap, programModel },
    batchEffects([programEffect, effect]),
  ] as [SubModel<Model>, Effect<Msg>]

  function update(msg: Msg, model: SubModel<Model>) {
    const [programModel, programEffect] = program.update(
      msg,
      model.programModel
    )
    const { effect, cancelMap } = transition(
      model.cancelMap,
      program.subscriptions(programModel)
    )
    return [
      { cancelMap, programModel },
      batchEffects([programEffect, effect]),
    ] as [SubModel<Model>, Effect<Msg>]
  }

  function done(model: SubModel<Model>) {
    transition(model.cancelMap, {}).effect(() => {})
    if (program.done) {
      program.done(model.programModel)
    }
  }

  function view(model: SubModel<Model>, dispatch: Dispatch<Msg>) {
    return program.view(model.programModel, dispatch)
  }

  return { init, update, done, view }
}
