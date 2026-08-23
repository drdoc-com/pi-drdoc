# Pi Package for Dr.DOC DMS

An integration package/plugin/extension for the **Pi Agent** (`pi.dev`) ecosystem to interact seamlessly with the [**Dr.DOC® Document Management System** \(ECM/DMS\)](https://drdoc.com/node/de/products/web). 

This extension package allows the Pi Agent to query Dr.DOC archives, fetch document blobs, store files locally, generate direct web links, and display inline document previews.

---

## System Architecture & Integration Directions

The integration between Pi Agent and Dr.DOC is split into two primary operational directions:

### 1. Pi → Dr.DOC (This Plugin)
*This* plugin enables the **Pi Agent** to make outgoing API calls to **Dr.DOC**. The agent uses these tool functions to search archives, retrieve documents, save them locally, and process binary/image data.

* **GitHub Repository:** [github.com/drdoc-com/pi-drdoc](https://github.com/drdoc-com/pi-drdoc)
* **npm Package:** [npmjs.com/package/@drdoc-com/pi-drdoc](https://www.npmjs.com/package/@drdoc-com/pi-drdoc)
* **Pi Package Registry:** [pi.dev/packages/@drdoc-com/pi-drdoc](https://pi.dev/packages/@drdoc-com/pi-drdoc)

### 2. Dr.DOC → Pi (OpenAI API Wrapper)
To allow **Dr.DOC** (or external tools) to send requests to Pi using the standard OpenAI API format, the `@drdoc-com/pi-openai-api-wrapper` package can be used.

* **GitHub Repository:** [github.com/drdoc-com/pi-openai-api-wrapper](https://github.com/drdoc-com/pi-openai-api-wrapper)
* **npm Package:** [npmjs.com/package/@drdoc-com/pi-openai-api-wrapper](https://www.npmjs.com/package/@drdoc-com/pi-openai-api-wrapper)
* **Pi Package Registry:** [pi.dev/packages/@drdoc-com/pi-openai-api-wrapper](https://pi.dev/packages/@drdoc-com/pi-openai-api-wrapper)

---

## Features

* **Document Retrieval:** Fetches document blobs and metadata from Dr.DOC using archive names and record IDs.
* **Safe Local Storage:** Automatically saves retrieved files to a reliable user directory (`~/.drdoc/downloads/`), avoiding conflicts with host extension directories.
* **Inline Image Previews:** Generates Base64 data URLs for image files (`image/*`), enabling direct rendering in the Pi Agent interface.
* **Direct Web URL Generation:** Creates browser-accessible URLs for fetched documents (`https://drdoc.com/model/document?action=get&...`).
* **Robust Error Handling:** Checks HTTP status codes (`response.ok`) and handles binary buffers cleanly.

---

## Installation

Install the package via npm or directly into your Pi extension environment:
```bash
pi install npm:@drdoc-com/pi-drdoc
```

Or via GitHub:
```bash
pi install git:https://github.com/drdoc-com/pi-drdoc
```

---

## Usage

### Pi Slash Commands (within Pi Agent)

Use Pi Slash Command (within Pi Agent) to signin/login.
Format:
```bash
/drdoc_login <baseUrl> <username> <password> <totp> <ignoreSSL:1,0>
```
Example:
```bash
/drdoc_login https://drdoc.com demo password "" 1
```

And signout/logout:
```bash
/drdoc_logout
```

### Pi Agent Tool Calling

Example:
```
Suche im Dr.DOC Archiv "rec" alle Rechnungen von Firma Amazon aus diesem Jahr.
```

## Configuration

The extension package utilizes configuration options supplied by the Dr.DOC client or environment variables.

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DRDOC_BASE_URL` | Base URL of the Dr.DOC instance | `https://drdoc.com` |
| `DRDOC_CONFIG_DIR` (alt. `PI_CONFIG_DIR`) | Custom directory for config files | `~/.pi/agent` |
| `DRDOC_DOWNLOAD_DIR` | Custom directory for downloaded files | `~/.drdoc/downloads` |
| `DRDOC_IGNORE_SSL` | Ignore TLS/SSL Errors (Set `NODE_TLS_REJECT_UNAUTHORIZED=0`) | `` |
| `DRDOC_AI_FS` | Dr.DOC IMPORT_ASCII FieldSelection Name for Field Descriptions. | `STD_AI_INVOICE_IN`, `DD_FIELD_DESC`, `STD_FIELD_DESC` |
| `DRDOC_DEBUG` | Enable Debugging | `` |

---

### Security Notes
* Pi Agent is designed as a **personal** AI agent. Users must operate their own private Pi Agent instance rather than using an instance hosted on the Dr.DOC Web Server.
* Credential Persistence (/drdoc_login): When using the Dr.DOC AI Chat with Pi configured as the AI endpoint (via `@drdoc-com/pi-openai-api-wrapper`), the `/drdoc_login` command *MUST NOT* be executed. Authentication credentials within the Pi Agent instance are persistent and could potentially be exposed to other users sharing the same instance.
* Dedicated Service Account: Use a dedicated Dr.DOC user account with limited permissions (e.g. *Datensatzspezifische Berechtigungen*) based on the principle of least privilege (*"need-to-know"*) specifically for AI tasks and the `/drdoc_login` command.
* Containerized Deployment: Whenever possible, run Pi Agent inside an isolated container environment (e.g., Docker, Podman) to ensure process isolation and security boundaries.

---

## License

This project is licensed under the Apache License 2.0.

Dr.DOC® ECM/DMS is licensed is under proprietary License.

---

## Documentation

See Dr.DOC Web REST API Documentation:
[https://drdoc.com/node/de/products/web/doku/rest-api](https://drdoc.com/node/de/products/web/doku/rest-api)


