# Evidence and runtime activity

PRISM reads memory and policy state from the gateway. The runtime owns these
records; the desktop presents their contents and exact references.

[Documentation](README.md) | [Shared CCIR](shared.md) | [Affect and controls](controls.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Inspect memory

1. Open **CCIR workspace** and select a shared space.
2. Open **Windows > Memory evidence**.
3. Select **Refresh memory**.
4. Select a record to read its detail.

Each page contains at most 64 records. Detail reads are bounded to 1 MiB and mark
larger payloads as previews. Unknown formats retain their exact base64 bytes.
Invalid known layouts do not produce a text or score view.

| Record | Display |
| --- | --- |
| Source and contextual text | Recorded text and available source identity. |
| Extracted statements | Supported statement payloads and evidence fields. |
| Appraisals and relationship evidence | Recorded values, scope and references. |
| Appraisal work and selections | Recorded work state and selected evidence. |
| Task reviews | Supported outcomes and their exact references. |

Quotes retain original text. Appraisal values use the recorded integer scale.
**Unknown** differs from zero. Confidence is not a calibrated probability.
Task reviews do not supply new generated advice.

## Check a source reference

A memory list contains retained metadata. Its detail endpoint returns the current
version. A recorded exact reference must match that version. PRISM refuses a
replacement version, unavailable object or cold payload, and clears failed old detail.

Shared metadata supplies a source ID without its version. **Read current source**
therefore cannot verify a historical citation alone. Exact references inside a
selection retain their recorded versions. Quote offsets address source bytes.
The gateway has no historical payload endpoint.

## Correct or publish evidence

Use shared conversation input for correction when the selected model advertises
automatic memory. Model loading alone does not qualify interpretation.
The HTTP interface has no arbitrary memory edit, deletion or task-binding operation.

To publish a record, open **Publish this record** and select a destination space.
Confirm the exact version and select **Publish record**. The destination requires
management permission. PRISM stores the mutation before transmission.
Read its shared receipt for completion and saved state.

## Select a qualified control

Open **Affect** for qualified doses, runtime settings and selected-conversation
state. [Affect and model controls](controls.md) describes their separate scopes,
permission requirements and save behavior.

## Observe background work

Open **Windows > Activity** for reported policy state, completion counters, save
generation and selected-conversation events. It contains readable tables and
counters, with no animated visualization.

Events have a separate page of at most 64 records. Use **First event page** or
**Next event page** to browse them. Refresh retains the current page.
Observation refreshes while the panel and application are visible. Closing the
panel stops future reads. **Maximize** and **Restore** change its size.

Policy work is distinct from foreground input. A quiet or unavailable policy does
not imply hidden model activity. Opening Activity does not create background work.
A runtime needs its own compatible policy assets and configuration.

## Change runtime affect settings

These settings are in the dedicated **Affect** window.
See [runtime settings](controls.md#change-runtime-settings) for revision checks,
operator grants and durable saves. Ordinary HTTP chats use qualified controls.

## Control policy work

**Policy controls and counters** provides pause, resume, stop and task-review
selection. Actions require policy ABI 3 and management permission.
Each request carries the displayed epoch and control revision as exact integers.

A stale or uncertain action is not repeated. Refresh state before another action.
A permission refusal disables controls until reconnect.

For an owned runtime, select **Allow background policy controls** before startup.
That grants access; it does not create policy assets or enable task reviews.
An external runtime's operator supplies its configuration and grants.

Policy actions do not expose native appraisal settings. Those settings remain
available through the runtime's native operator interface.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
