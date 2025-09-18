# MHAST Demo

This repository is based on the Adobe AEM boilerplate and contains a schema‑driven Form UI editor and supporting libraries under `tools/forms`. It includes:

- A JSON Schema → Form UI renderer with navigation, validation, arrays‑of‑objects, and breadcrumb.
- A read‑only FormModel service that derives a groups tree from `(schema, data)` for rendering and navigation.
- A Forms Editor app (`tools/forms/editor.html`) that mounts the Form UI for local testing of schemas and data.

## Environments
- Preview: https://main--{repo}--{owner}.aem.page/
- Live: https://main--{repo}--{owner}.aem.live/

## Documentation

If you are new to AEM Edge Delivery Services, review the docs at https://www.aem.live/docs/ and in particular:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

The Form UI library is documented in:
- `tools/forms/libs/form-ui/README.md` (architecture and APIs)
- `tools/forms/libs/form-ui/README-FLOW.md` (runtime flows and state)
- `tools/forms/libs/form-ui/features/README-NAVIGATION.md` (sidebar generation)
- `tools/forms/libs/form-ui/readme-form-model.md` (FormModel spec)
- `tools/forms/libs/form-ui/readme-form-model-implementation.md` (implementation notes)

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Local development

There are two common workflows:

### 1) Site development (AEM proxy)
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
2. Start the proxy: `aem up` (opens `http://localhost:3000`)
3. Edit content/blocks as usual; the proxy serves your changes locally.

### 2) Forms Editor and Form UI library
The Forms Editor mounts the Form UI with local schemas for rapid iteration.

- Open `tools/forms/editor.html` directly in a browser, or serve the `tools/forms/` folder with any static server, e.g.:

```sh
# From the repo root
python3 -m http.server 8080
# Then open http://localhost:8080/tools/forms/editor.html
```

- Place example schemas in `tools/forms/local-schema/` (some examples are included).
- The editor loads UI components from `tools/forms/libs/form-ui/*` and uses services in `tools/forms/libs/services/*`.

See `tools/forms/libs/form-ui/README.md` for the full library overview and extension points.
