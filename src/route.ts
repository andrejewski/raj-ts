import { Change, Dispatch, Disposer, Effect, Program } from './runtime'
import { mapEffect, batchEffects } from './compose'
import { Subscription } from './subscription'

function absurd(_val: never): never {
  throw new Error('Unexpected value passed to `absurd`.')
}

function loadProgram<View>(
  programPromise: Promise<Program<unknown, unknown, View>>
) {
  return (dispatch: Dispatch<ProgramLoad<View>>) =>
    programPromise.then(
      (program) => dispatch({ type: 'program', program }),
      (error) => dispatch({ type: 'error', error })
    )
}

const privateMarker = {}
class Keyed<Route, View> {
  readonly key: string
  readonly makeProgram: (
    emitter: Router<Route>
  ) => Program<unknown, unknown, View>

  constructor(
    key: string,
    makeProgram: (emitter: Router<Route>) => Program<unknown, unknown, View>,
    marker: {}
  ) {
    if (marker !== privateMarker) {
      throw new Error(`This function can only be called by internals.`)
    }

    this.key = key
    this.makeProgram = makeProgram
  }
}

function keyed<Route, View>(
  key: string,
  makeProgram: Keyed<Route, View>['makeProgram']
): Keyed<Route, View> {
  return new Keyed(key, makeProgram, privateMarker)
}

type Listener<Val> = (value: Val) => void

function createRouter<Val>(initialValue: Val): ControlledRouter<Val> {
  let lastValue = initialValue
  let listeners: Listener<Val>[] = []
  return {
    emit(value) {
      return () => {
        lastValue = value
        listeners.forEach((l) => l(value))
      }
    },
    subscribe() {
      let listener: Listener<Val>
      return {
        effect(dispatch) {
          if (!listener) {
            listener = dispatch
            listeners.push(listener)
            listener(lastValue)
          }
        },
        cancel() {
          listeners = listeners.filter((l) => l !== listener)
        },
      }
    },
  }
}

type SpaModel<Route, View> = {
  routerCancel: Disposer
  routeEmitter?: ControlledRouter<Route>
  isTransitioning: boolean
  currentProgram: Program<unknown, unknown, View>
  programKey?: string
  programModel: unknown
}

type ProgramLoad<View> =
  | { type: 'program'; program: Program<unknown, unknown, View> }
  | { type: 'error'; error: unknown }

type SpaMsg<Route, View> =
  | { type: 'get_route'; route: Route }
  | {
      type: 'get_program'
      data: ProgramLoad<View>
    }
  | { type: 'program_msg'; msg: unknown }

export type Router<Val> = {
  subscribe(): Subscription<Val>
}

export type ControlledRouter<Val> = Router<Val> & {
  emit(value: Val): Effect<never>
}

type SpaOptions<Route, View> = {
  router: Router<Route>
  initialProgram: Program<unknown, unknown, View>

  getRouteProgram(
    route: Route,
    options: { keyed: typeof keyed }
  ):
    | Program<unknown, unknown, View>
    | Keyed<Route, View>
    | Promise<Program<unknown, unknown, View>>

  getErrorProgram?(error: unknown): Program<unknown, unknown, View>

  onProgramLoadError?(error: unknown): void

  containerView?: (
    viewModel: { isTransitioning: boolean },
    subView: View
  ) => View
}

export function makeRoutedProgram<Route, View>({
  router,
  initialProgram,
  getRouteProgram,
  getErrorProgram,
  onProgramLoadError,
  containerView,
}: SpaOptions<Route, View>): Program<
  SpaMsg<Route, View>,
  SpaModel<Route, View>,
  View
> {
  const init: Change<SpaMsg<Route, View>, SpaModel<Route, View>> = (() => {
    const [initialProgramModel, initialProgramEffect] = initialProgram.init
    const { effect: routerEffect, cancel: routerCancel } = router.subscribe()
    const model: SpaModel<Route, View> = {
      routerCancel,
      isTransitioning: false,
      currentProgram: initialProgram,
      programModel: initialProgramModel,
    }

    const getRouteEffect: Effect<SpaMsg<Route, View>> = mapEffect(
      routerEffect,
      (route) => ({
        type: 'get_route',
        route,
      })
    )
    const effect: Effect<SpaMsg<Route, View>> = initialProgramEffect
      ? batchEffects([
          getRouteEffect,
          mapEffect(initialProgramEffect, (msg) => ({
            type: 'program_msg',
            msg,
          })),
        ])
      : getRouteEffect

    return [model, effect] as Change<SpaMsg<Route, View>, SpaModel<Route, View>>
  })()

  function transitionToProgram(
    model: SpaModel<Route, View>,
    program: Program<unknown, unknown, View>
  ): Change<SpaMsg<Route, View>, SpaModel<Route, View>> {
    const [newProgramModel, newProgramEffect] = program.init
    const newModel = {
      ...model,
      currentProgram: program,
      programModel: newProgramModel,
    }

    const effects: Effect<SpaMsg<Route, View>>[] = []
    if (newProgramEffect) {
      effects.push(
        mapEffect(newProgramEffect, (msg) => ({ type: 'program_msg', msg }))
      )
    }

    const subDone = model.currentProgram.done
    const doneEffect = subDone ? () => subDone(model.programModel) : undefined
    if (doneEffect) {
      effects.push(doneEffect)
    }

    const newEffect = batchEffects(effects)
    return [newModel, newEffect]
  }

  function update(
    msg: SpaMsg<Route, View>,
    model: SpaModel<Route, View>
  ): Change<SpaMsg<Route, View>, SpaModel<Route, View>> {
    switch (msg.type) {
      case 'get_program': {
        const newModel: SpaModel<Route, View> = {
          ...model,
          isTransitioning: false,
        }
        switch (msg.data.type) {
          case 'program':
            return transitionToProgram(newModel, msg.data.program)
          case 'error': {
            const { error } = msg.data
            if (onProgramLoadError){
              onProgramLoadError(error)
            }

            if (getErrorProgram) {
              const program = getErrorProgram(error)
              return transitionToProgram(newModel, program)
            }
            
            return [newModel]
          }
          default:
            return absurd(msg.data)
        }
      }
      case 'get_route': {
        const routeProgram = getRouteProgram(msg.route, { keyed })
        if (routeProgram instanceof Keyed) {
          const { key, makeProgram } = routeProgram
          const { programKey, routeEmitter } = model
          const isContinuation =
            routeEmitter && programKey && programKey === key
          if (isContinuation) {
            return [model, () => routeEmitter.emit(msg.route)]
          }

          const internalRouter = createRouter<Route>(msg.route)
          const emitter: Router<Route> = {
            subscribe: internalRouter.subscribe,
          }

          const newProgram = makeProgram(emitter)
          return transitionToProgram(
            { ...model, programKey: key, routeEmitter: internalRouter },
            newProgram
          )
        }

        if (!(routeProgram instanceof Promise)) {
          return transitionToProgram(
            { ...model, programKey: undefined, routeEmitter: undefined },
            routeProgram
          )
        }

        return [
          {
            ...model,
            programKey: undefined,
            isTransitioning: true,
          },
          mapEffect(loadProgram(routeProgram), (data) => ({
            type: 'get_program',
            data,
          })),
        ]
      }
      case 'program_msg': {
        const [newProgramModel, newProgramEffect] = model.currentProgram.update(
          msg.msg,
          model.programModel
        )
        const newModel = { ...model, programModel: newProgramModel }
        const newEffect = newProgramEffect
          ? mapEffect(
              newProgramEffect,
              (msg) => ({ type: 'program_msg', msg } as const)
            )
          : undefined
        return [newModel, newEffect]
      }
    }
  }

  function view(
    model: SpaModel<Route, View>,
    dispatch: Dispatch<SpaMsg<Route, View>>
  ) {
    const subView = model.currentProgram.view(model.programModel, (msg) =>
      dispatch({ type: 'program_msg', msg })
    )

    if (containerView) {
      const viewFrameModel = { isTransitioning: model.isTransitioning }
      return containerView(viewFrameModel, subView)
    }

    return subView
  }

  function done(model: SpaModel<Route, View>) {
    let subDone = model.currentProgram.done
    if (subDone) {
      subDone(model.programModel)
    }

    if (model.routerCancel) {
      model.routerCancel()
    }
  }

  return { init, update, view, done }
}
