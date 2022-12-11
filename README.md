# Raj.ts

> The web framework [Raj](https://github.com/andrejewski/raj) written in Typescript.

```sh
npm install raj-ts
```

Raj was written in 2018 when Typescript and Flow were in competition.
It wasn't the right time to hitch to any type system on top of JavaScript.
The author of Raj wasn't writing any Typescript at the time.

Now in 2022, TypeScript has come to dominate the typed JavaScript space.
The author of Raj is now writing Typescript over JavaScript well enough to feel comfortable putting out Typescript definitions of the framework for others.
This should make Raj and its design more approachable to newcomers accustom to type definitions.

## Why not a Raj 2.0?

The existing Raj repository has remained unchanged since the 1.0 release in 2018.
There's nothing wrong with that version so it won't be repurposed.

Adding types to any project is a breaking change, even for something as compact as Raj.
Additionally Typescript itself has breaking changes regularly.
Hitching to a type system that itself has breaking changes ought to invite only packages willing to be broken along the way.

Typescript is an incredible way to document and enforce code be used in the way the author intended.
Raj.ts is the proper package to make the most out of it.

## Why one package instead of a few packages?

Raj.ts re-packages the standard library of Raj packages in a single package:

- `raj` => `raj-ts/runtime`
- `raj-compose` => `raj-ts/runtime`
- `raj-subscription` => `raj-ts/subscription`
- `raj-spa` => `raj-ts/route`

The original decision to divide these small modules as full packages was influenced by:

- Wanting to move at different paces with regard to versioning
- Transpilation and tree-shaking not being widely adopted
- Generally not knowing what a "standard library" would evolve to be

Since `raj-ts` is a more modern take on Raj, we can be more lax and lean on tooling assumptions Raj could not.
For example, the very fact this is a Typescript version means the projects using it have access to transpilation.
After years of using Raj in production, the standard library has become clear enough to curate.

## What are the major behavioral differences between Raj and Raj.ts?

Nothing is fundamentally different between the versions.
Type annotations provide constraints and a common vocabulary for talking about things like `Program` and `Effect` which previously had to be grokked from documentation and variable names.

Besides a few minor renames, the documentation for Raj is applicable to Raj.ts.
