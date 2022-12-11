export type Dispatch<Msg> = {
  (value: Msg): void
}

export type Effect<Msg> = {
  (dispatch: Dispatch<Msg>): void
}

export type Change<Msg, Model> = [Model] | [Model, Effect<Msg> | undefined]

export type Program<Msg, Model, View> = {
  init: [Model] | [Model, Effect<Msg> | undefined]
  update(msg: Msg, model: Model): [Model] | [Model, Effect<Msg> | undefined]
  view(model: Model, dispatch: Dispatch<Msg>): View
  done?(model: Model): void
}

export type Disposer = {
  (): void
}

export function runtime<Msg, Model, View>(
  program: Program<Msg, Model, View>
): Disposer {
  const { init, update, view, done } = program
  let state: Model
  let isRunning = true

  function dispatch(message: Msg) {
    if (isRunning) {
      change(update(message, state))
    }
  }

  function change(change: Change<Msg, Model>) {
    state = change[0]
    const effect = change[1]
    if (effect) {
      effect(dispatch)
    }
    view(state, dispatch)
  }

  change(init)

  return function end() {
    if (isRunning) {
      isRunning = false
      if (done) {
        done(state)
      }
    }
  }
}
