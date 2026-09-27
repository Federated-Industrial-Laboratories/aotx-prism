# Evidence and runtime activity

PRISM reads memory and policy state from the connected gateway. The runtime owns
these records. PRISM displays their bytes and does not create cognitive scores.

## Inspect memory

1. Open **CCIR workspace**.
2. Select a shared space.
3. Open **Windows > Memory evidence**.
4. Select **Refresh memory**.
5. Select a record.

Each page contains at most 64 records. The detail view reads at most 1 MiB and
marks a larger payload as a bounded preview. Unknown formats retain their exact
base64 bytes. Invalid known layouts do not produce a text or score view.

Supported views include source text, extracted statements, contextual text,
appraisals, relationship evidence, appraisal work, selections and task reviews.
Quotes keep their original text. Appraisal values use the recorded integer scale.
**Unknown** differs from zero. Confidence is not a calibrated probability.

Memory lists contain retained metadata. The detail endpoint returns the current
version. A recorded reference with an exact version must match that version.
The client refuses a replacement version, unavailable object or cold payload.
It clears the old detail when a new read fails.

Shared metadata supplies a source ID but omits its version. **Read current source**
therefore cannot verify a historical citation alone. Exact references inside a
selection retain their recorded versions. The gateway has no historical payload
endpoint. Recorded quote offsets are byte offsets into their source.

## Correct or publish evidence

Use shared conversation input for correction when the selected model advertises
automatic memory. Loading a model alone does not qualify that feature. The HTTP
interface has no arbitrary memory edit, delete or task-binding operation.

To publish, open **Publish this record** and select a destination space. Confirm
the exact version and select **Publish record**. The destination requires management
permission. The mutation is stored before transmission, like other shared writes.
Read its receipt in the shared workspace to inspect completion and saved state.

Task reviews expose a supported outcome and its recorded references. They do not
supply new generated advice. PRISM does not author new task bindings through HTTP.

## Select a qualified control

Open **Models** and use **Control and dose**. Only advertised, qualified pairs can
be selected. PRISM sends the exact qualification digest and discrete dose.
It does not interpolate doses or combine controls. Unsupported control formats
remain unavailable while ordinary model use remains possible.

Selection applies to new ordinary and shared inputs. Model changes and disconnects
clear it. Before sending, PRISM checks current capabilities again. Shared inputs
also check affect state. A changed qualification or active affect prevents submission.

After an operator disables affect, send one input without an explicit control.
This permits the runtime's required reset before a selected control. Runtime
admission remains authoritative. Saved ordinary turns retain their chosen identity;
shared journals retain the complete canonical request.

## Observe background work

Open **Windows > Activity** for policy state, completion counters, save generation
and selected conversation events. Events use a separate page of at most 64 records.
Use **First event page** or **Next event page** to browse it. Refresh keeps that page.
Policy work is distinct from foreground input.
A quiet or unavailable policy does not imply hidden model activity.

Observation refreshes while the panel and application are visible. Closing the
panel stops future reads. **Show visualization** opens the optional rain field.

Use the panel's **Maximize** and **Restore** controls to change its size. The field
uses reported counters and event identifiers. It generates no model requests.
Reduced motion disables animation. Read the tiles for exact values.

Affect is displayed as reported runtime state, including probe availability.
It does not describe a person's emotions. The gateway has no affect setter.

## Control policy work

**Policy controls and counters** exposes pause, resume, stop and task-review
selection. These actions require policy ABI 3 and management permission. Each
request carries the displayed epoch and control revision as exact integers.
A stale or uncertain action is not repeated. Refresh state before another action.
A permission refusal disables these controls until reconnect.

For an owned runtime, select **Allow background policy controls** in its profile
before starting. This creates the explicit gateway grant. It does not enable task
reviews automatically. An external gateway's operator controls its grants.

Policy actions do not expose native appraisal settings. Such settings require the
runtime's native operator interface. PRISM preserves the released API boundary.
