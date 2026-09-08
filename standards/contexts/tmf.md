# Context: TM Forum

This repository implements TM Forum interfaces. The published Open API and ODA
specifications are part of the contract, and a consumer integrating against them
is entitled to what those documents describe.

When reviewing:

- Resource and field names follow the published TMF API for the domain. A field
  renamed for local convenience breaks every consumer generated from the spec.
- Polymorphism carries `@type`, and `@baseType` / `@schemaLocation` where the
  API defines them. Dropping them because "nothing reads it here" removes the
  discriminator a consumer needs.
- Collections page with `offset` and `limit`, filter through query parameters,
  and honour `fields` for attribute selection. A hand-rolled paging scheme on a
  TMF resource is a contract break.
- Errors use the TMF error body — `code`, `reason`, and `message` where present
  — rather than a local error shape.
- Notifications follow the hub/listener pattern the API defines rather than a
  bespoke webhook.
- A breaking change to a published interface needs a version, not an edit. Say
  so explicitly when you see one.

State the specific TMF API and version when a finding depends on it, so the
author can check the same document you did.
