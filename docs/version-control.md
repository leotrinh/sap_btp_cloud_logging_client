# Version Control

How this package numbers its releases, and why the numbering is a mechanical contract rather than a convention.

## The three numbers

A version is `MAJOR.MINOR.PATCH`. The numbers are not a counter — each one answers a different question for someone who already depends on this package.

| Position | Name | Increment when | The question it answers |
|---|---|---|---|
| `1.x.x` | **MAJOR** | something that works today stops working | "Do I have to change my code?" |
| `x.1.x` | **MINOR** | a capability is added, nothing existing changes | "Is there anything new I can use?" |
| `x.x.1` | **PATCH** | a defect is fixed, nothing is added or changed | "Is this safe to take immediately?" |

Increment exactly one position and reset everything to its right. After `1.0.8`:

- bug fixes only → `1.0.9`
- a new option or feature → `1.1.0`
- anything that breaks an existing consumer → `2.0.0`

The sequence does not need to be contiguous. This package went `1.0.2` → `1.0.4`, and never released a `1.0.9`. Numbers must increase and must mean the right thing; they do not need to be consecutive. The minor position has no ceiling either — `1.47.0` is perfectly ordinary, and `1.9.9` is not "nearly 2.0.0". A major release happens because something broke, never because the digits got large.

## Why MAJOR is the one that is enforced

The other two positions are a promise. MAJOR is a wall that npm builds for you.

When a consumer runs `npm install sap-btp-cloud-logging-client`, npm writes a **caret range** into their `package.json`:

```json
"sap-btp-cloud-logging-client": "^1.0.8"
```

That range means "any `1.x.x` at or above `1.0.8`". Concretely:

| Version published | Does `^1.0.8` accept it? |
|---|---|
| `1.0.9` | **yes** — picked up on their next install or CI build |
| `1.1.0` | **yes** |
| `1.2.0` | **yes** |
| `1.9.9` | **yes** |
| `2.0.0` | **no** — they must edit `package.json` by hand |

So a breaking change released as a minor or patch reaches every consumer **without anyone deciding to take it**. Their build is green on Friday and broken on Monday because a dependency moved underneath them. The major number is the only signal npm acts on, which is why a breaking change has to carry one. This matters more here than in a private package: this one is published publicly, its consumers are unknown and cannot be contacted, so the version number is the only channel available for warning them.

## What counts as breaking

Breaking is judged from the consumer's side, not from the size of the diff. A one-line change can be breaking and a thousand-line refactor can be invisible.

Breaking:

- removing or renaming anything public — a function, an option, a field in the shipped log payload
- changing the default value of an option
- changing the shape or type of something already emitted
- raising the minimum Node version, or moving a dependency to `peerDependencies`
- tightening validation so input that used to be accepted is now rejected

Not breaking:

- adding a new function, option, or payload field
- fixing something that was already failing for everyone
- changing internals, as long as the observable behaviour holds
- documentation, tests, build tooling

The awkward middle case is a **fix that changes output**. Redaction is the example: applying it to a path that previously shipped unredacted metadata is a repair, but a consumer whose dashboard reads one of those fields sees it change. The rule used here is to ship the fix with an opt-out and document it, rather than either suppressing the fix or forcing a major release for it.

## A precedent from this package's own history

`docs/Release.md` records version `1.0.7` under a heading of its own:

> **Breaking Changes** — Default: Original fields are now removed after BTP mapping

That shipped as a **patch** bump from `1.0.6`. Every consumer on `^1.0.6` received a changed log payload on their next build, with no action and no warning. The release notes were accurate about what changed; the version number was not, and the version number is the part tooling reads.

The lesson is not that the change was wrong — removing duplicated fields was an improvement. It is that labelling it `1.0.7` removed the consumer's ability to decide when to take it.

## Release history

| Version | Kind | Why that number |
|---|---|---|
| `1.0.0` – `1.0.8` | patch | fixes and additions, all released as patches |
| `1.0.7` | *should have been* `2.0.0` | changed a default affecting shipped output — see above |
| `1.1.0` | minor | safety fixes plus a new `sanitizeMetadata` option. The new option is what makes it minor rather than `1.0.9` |

## Applying this to planned work

The hardening plan (`docs/plan/package-hardening-and-cap-integration-2026-10-05.md`) splits its remaining work by this rule, not by convenience:

| Change | Release | Reason |
|---|---|---|
| Adding `correlation_id` to the payload | minor | purely additive. Nothing existing is removed, so no consumer breaks — and the platform derives `trace_id` from that field name, so the capability arrives as soon as the field does |
| Removing `correlationId` | major | a consumer with a dashboard or alert keyed on the old name loses it |
| `timestamp` → `written_at`, `stack` → `stacktrace` | major | renames of emitted fields |
| `preventUncaughtExceptions` default flipped to `false` | major | changes behaviour for applications that set nothing |
| `winston` to an optional peer dependency, `engines` ≥ 18 | major | changes what a consumer must have installed |

Adding and removing a field are **separable**, and separating them is what lets the useful half arrive early. The additive half can ship in a minor release that nobody has to think about; the removal waits behind the `2.0.0` wall with every other breaking item, so consumers read one migration note instead of several.

That batching is deliberate. Each major release costs every consumer a manual upgrade decision, so breaking changes are accumulated and released together rather than dribbled out.

## Practical notes

- **Never reuse or rewrite a published version.** npm permits unpublishing only within a narrow window, and a version that changed content after release breaks lockfiles and caches. Fix forward with a new number.
- **The version is minted at the release, not during development.** Keep unreleased work under an `[Unreleased]` heading in `ChangeLogs.md` and set the number when publishing, so the repository never claims a version that does not exist on npm.
- **A pre-release suffix takes a hyphen** — `2.0.0-beta.1`. Caret ranges ignore pre-releases, so they reach only consumers who ask for them explicitly.
- **Deprecate before removing.** Marking an option `@deprecated` in `types/index.d.ts` costs nothing, shows up in the consumer's editor, and gives the eventual major release a reader who was already expecting it.

## Reference

[Semantic Versioning 2.0.0](https://semver.org/) — the specification these rules come from.
