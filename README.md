# Pi Plugin for Dr.DOC

An integration plugin Package for the **Pi Agent** (`pi.dev`) ecosystem to interact seamlessly with the [**Dr.DOC Document Management System** \(DMS/ECM\)](https://drdoc.com/node/de/products/web). 

This plugin allows the Pi Agent to query Dr.DOC archives, fetch document blobs, store files locally, generate direct web links, and display inline document previews.

---

## System Architecture & Integration Directions

The integration between Pi Agent and Dr.DOC is split into two primary operational directions:

### 1. Pi → Dr.DOC (This Plugin)
This plugin enables the **Pi Agent** to make outgoing API calls to **Dr.DOC**. The agent uses these tool functions to search archives, retrieve documents, save them locally, and process binary/image data.

### 2. Dr.DOC → Pi (OpenAI API Wrapper)
To allow **Dr.DOC** (or external tools) to send requests to Pi using the standard OpenAI API format, the `@drdoc-com/pi-openai-api-wrapper` package can be used.

* **GitHub Repository:** [github.com/drdoc-com/pi-openai-api-wrapper](https://github.com/drdoc-com/pi-openai-api-wrapper)
* **Pi Package Registry:** [pi.dev/packages/@drdoc-com/pi-openai-api-wrapper](https://pi.dev/packages/@drdoc-com/pi-openai-api-wrapper)
* **npm Package:** [npmjs.com/package/@drdoc-com/pi-openai-api-wrapper](https://www.npmjs.com/package/@drdoc-com/pi-openai-api-wrapper)

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

## Configuration

The plugin utilizes configuration options supplied by the Dr.DOC client or environment variables.

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DRDOC_BASE_URL` | Base URL of the Dr.DOC instance | `https://drdoc.com` |
| `DRDOC_CONFIG_DIR` (alt. `PI_CONFIG_DIR`) | Custom directory for config files | `~/.pi/agent` |
| `DRDOC_DOWNLOAD_DIR` | Custom directory for downloaded files | `~/.drdoc/downloads` |
| `DRDOC_IGNORE_SSL` | Ignore TLS/SSL Errors (Set `NODE_TLS_REJECT_UNAUTHORIZED=0`) | `` |
| `DRDOC_DEBUG` | Enable Debugging | `` |

---

## License

This project is licensed under the Apache License 2.0.
Dr.DOC DMS is licensed is under proprietary License.

---

## Documentation

See Dr.DOC Web REST API Documentation:
[https://drdoc.com/node/de/products/web/doku/rest-api](https://drdoc.com/node/de/products/web/doku/rest-api)


