# Affect and model controls

The **Affect** window contains two separate interfaces: qualified controls for
new inputs, and permitted runtime settings. It also reads the selected CCIR
conversation's reported state. PRISM does not generate cognitive scores.

[Documentation](README.md) | [Runtime setup](setup.md) | [Evidence and activity](evidence.md)

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

## Choose the correct control

| Interface | Scope | Requirement |
| --- | --- | --- |
| Qualified control and dose | New ordinary or shared input using the selected model. | Exact advertised model/control qualification. |
| Runtime affect settings | Native and CCIR sequences across this runtime. | Affect support and separate management permission. |
| Selected CCIR state | The chosen conversation's reported values. | Current shared read access. |

Ordinary HTTP conversations bypass persistent affect. They use the qualified
controls in the first section. A runtime setting does not add persistent affect
to those ordinary execution slots.

## Select a qualified control

Open **Affect** and use **Control and dose**. Only advertised, qualified pairs are
selectable. PRISM sends the exact qualification digest and discrete dose.
It does not interpolate doses or combine controls. Other model use can remain
available when a control is unqualified.

Selection applies to new inputs and clears on model changes or disconnect.
PRISM checks current capabilities again before sending. A changed qualification
prevents submission. Runtime admission remains authoritative.

Shared inputs also check reported affect. Explicit controls require affect to be
disabled. After disabling it, send one input without a control to permit the
runtime's required reset. Then select the qualified control for the next input.

Saved ordinary turns retain the selected identity. Shared request journals retain
the complete canonical request, including its control selection.

## Change runtime settings

1. Open **Affect** and select **Refresh affect settings**.
2. Check the connection's reported read or operator permission.
3. Select a setting.
4. Enter a value within the displayed range.
5. Select **Apply setting**.
6. Check the returned value and revision.

Reads require telemetry or affect management permission. Changes require the
separate `affect_manage` grant. For an owned runtime, select **Allow runtime affect
controls** before starting. An external gateway's operator supplies its grants.
Older backends can report this interface as unavailable.

| Setting group | Purpose |
| --- | --- |
| Affect and quality enabled | Enable the corresponding runtime settings. |
| Probe contribution | Set the contribution from available probes. |
| Fast and slow retention and gain | Configure the two affect state rates. |
| Valence and arousal limits | Bound state magnitude. |
| Temperature, voice and steering coupling | Configure supported response adjustments. |
| Divergence budget | Set the configured bound for the applicable control path. |

The displayed ranges and readback values are authoritative for this interface.
Settings do not qualify missing probes, model pairs or steering assets.
They describe runtime control state, not a person's emotions.

## Revisions and durability

Each change carries the current epoch and exact settings revision.
A stale, refused or uncertain write is not repeated. Refresh before another change.
A permission refusal disables writes until reconnect. Pending local settings also
prevent remote changes until they have been applied.

Changes take effect at the next sequence. A reply already in progress retains
its captured settings. The scope is the runtime, not only the selected conversation.

An accepted change is separate from durable storage. Select **Save CCIR state**,
then inspect the saved receipt in the shared workspace before relying on recovery.

## Read selected state

Select a CCIR conversation, then select **Refresh scoped affect**.
The view reports last-turn enablement, fast and slow state, probes, revision and
model identity. A last-turn report is distinct from current runtime configuration.
Unavailable data remains unavailable; it is not displayed as a measured zero.

<p align="center"><img src="assets/divider.svg" width="720" alt=""></p>

[Documentation index](README.md) | [Project README](../README.md)
