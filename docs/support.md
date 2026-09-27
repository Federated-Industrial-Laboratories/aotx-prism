# Support and limits

PRISM 0.1.0 is an unreleased desktop application. Local source builds and Linux
packages are available. Its client support and the connected backend's model
qualification are separate contracts.

[Documentation](README.md) | [Architecture](architecture.md) | [Testing](testing.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Platform and backend

| Surface | Current boundary |
| --- | --- |
| Desktop package | Linux x86-64 with a graphical session and working Chromium sandbox. |
| Other desktop platforms | No qualified package or installation procedure. |
| Browser-only client | No standalone browser deployment. |
| Backend | AOTX 0.3.5 interfaces, with capability discovery for optional features. |
| Remote runtime | Existing HTTPS gateway, or loopback HTTP through a separate SSH tunnel. |
| Local runtime | Installed AOTX tools, gateway environment and model assets. |

PRISM does not install CUDA, drivers, backend programs or model files.
A remote gateway performs inference on its own machine; the desktop need not
host that model. Local runtime admission depends on the selected GPU and build.

AOTX 0.3.5 source builds can advertise different extensions. The version string
alone does not establish conversation-prompt or runtime-affect support.
Update both the core and gateway when an interface is absent.

## Model and feature discovery

Only advertised models and compatible media paths are selectable.
Automatic memory requires an exact qualified model and processor pair.
Qualified controls also bind exact model, asset and qualification identities.
Unsupported controls remain unavailable while ordinary model use can continue.

Runtime affect settings do not create missing probes or steering assets.
Background policy controls require a compatible existing policy and permission.
A grant permits an action; it does not enable or qualify background work.
PRISM's complete-file creation does not add a policy asset.

## Capacity

The backend build owns its context, agent slots and physical cache capacities.
PRISM reads advertised limits and refuses oversized requests. It does not combine
GPU memory or increase those capacities through a saved profile.

The **Models** output-token setting reserves reply capacity. It does not set the
model's total context. Prompt field byte limits are another separate boundary.
See [context troubleshooting](troubleshooting.md#context-and-output-limits).

## Outside this version

- Model-driven project edits and arbitrary command execution.
- Automatic model or backend downloads.
- Native policy trust configuration in the local launcher.
- Arbitrary memory deletion, editing or task-binding authoring through HTTP.
- Historical source payload retrieval when the gateway exposes only the current version.
- Animated activity visualization.

These exclusions do not reduce backend functions available through other clients.
PRISM uses the connected API and does not replace its authority.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
