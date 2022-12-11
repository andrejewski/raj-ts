import { Dispatch, Effect, Program } from './runtime'

export function mapEffect<A, B>(
  effect: Effect<A>,
  callback: (value: A) => B
): Effect<B> {
  return function _mapEffect(dispatch) {
    return effect((message) => {
      dispatch(callback(message))
    })
  }
}

export function batchEffects<Msg>(
  effects: (Effect<Msg> | undefined)[]
): Effect<Msg> {
  return function _batchEffects(dispatch) {
    return effects.map((effect) => {
      return effect ? effect(dispatch) : undefined
    })
  }
}

type BatchMsg = {
  index: number
  data: unknown
}

export function batchPrograms<View>(
  programs: readonly Program<unknown, unknown, View>[],
  containerView: (programViews: (() => View)[]) => View
): Program<BatchMsg, unknown[], View> {
  const states: unknown[] = []
  const effects: (Effect<unknown> | undefined)[] = []
  for (const program of programs) {
    states.push(program.init[0])
    effects.push(program.init[1])
  }

  const init: [unknown[], Effect<BatchMsg>] = [
    states,
    batchEffects(
      effects.flatMap((e, index) =>
        e ? [mapEffect(e, (data) => ({ index, data }))] : []
      )
    ),
  ]

  function update(
    msg: BatchMsg,
    state: unknown[]
  ): [unknown[], Effect<BatchMsg> | undefined] {
    const { index } = msg
    const change = programs[index]!.update(msg.data, state[index])
    const [newModel, programEffect] = change
    const newState = state.slice(0)
    newState[index] = newModel
    return [
      newState,
      programEffect
        ? mapEffect(programEffect, (data) => ({ index, data }))
        : undefined,
    ]
  }

  function view(state: unknown[], dispatch: Dispatch<BatchMsg>) {
    const programViews = programs.map(
      (program, index) => () =>
        program.view(state[index], (data) => dispatch({ index, data }))
    )

    return containerView(programViews as any)
  }

  function done(state: unknown[]) {
    for (let i = 0; i < programs.length; i++) {
      const done = programs[i]!.done
      if (done) {
        done(state[i])
      }
    }
  }

  return { init, update, view, done }
}
