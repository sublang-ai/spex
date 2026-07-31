<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

# DIG: Daily Digest

## Intent

This composition gives the product its morning digest: the list
and the reminders each publish their state, and this file binds
them into one message delivered at the configured digest hour.
Neither package knows the digest exists; the binding lives here,
and nowhere else.

## Binding

### DIG-1

Where the digest needs content, the deployment shall bind the
digest body to the visible task list in its presented order
([LIST-4](../packages/todo-list.md#list-4)) plus every reminder
fired since the previous digest
([REM-2](../packages/reminders.md#rem-2)).

## Scenario

### DIG-2

When the configured digest hour arrives, the deployment shall
deliver one digest message containing the bound body
([DIG-1](#dig-1)); a day with no open tasks and no fired
reminders shall produce no message.

## Tests

### DIG-3

Where a seeded deployment holds two open tasks and one reminder
fired overnight, the acceptance suite shall assert the digest
hour yields exactly one message listing both tasks in visible
order ([DIG-1](#dig-1), [DIG-2](#dig-2),
[LIST-4](../packages/todo-list.md#list-4)) and naming the fired
reminder ([REM-2](../packages/reminders.md#rem-2)), and that an
empty seeded deployment yields none ([DIG-2](#dig-2)).
