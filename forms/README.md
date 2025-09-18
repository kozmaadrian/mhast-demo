## Forms Schemas

This folder contains example JSON Schemas and configuration used by the Forms Editor and the Form UI library.

Contents:
- `manifest.json`: optional registry of form schemas or editor presets.
- `*.schema.json`: schema fragments for inputs, layout, products, campaigns, etc.

How it fits together:
- The Form UI library renders forms directly from JSON Schema. Arrays of objects become repeatable groups; objects become sections or groups depending on whether they contain primitives at that level.
- The Forms Editor (`tools/forms/editor.html`) can be used to mount a form for any of these schemas and interactively edit data.

Conventions:
- Prefer Draft‑07/2019‑09 JSON Schema features used elsewhere in the repo.
- Use `$defs` and `$ref` for reuse; the Form UI resolves local refs on‑demand.
- Arrays of primitives are supported; arrays of objects are first‑class and render as nested groups.

Related docs:
- See `tools/forms/libs/form-ui/README.md` for the UI architecture and APIs.
- See `tools/forms/libs/form-ui/readme-form-model.md` for the FormModel spec.
